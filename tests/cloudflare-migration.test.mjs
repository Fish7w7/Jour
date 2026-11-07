import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { defaultPreferences } from "../lib/schedule.ts";
import { pushPlan } from "../lib/notifications.ts";
import { exportNodePush } from "../scripts/cf-export-node-push.mjs";
import { hash, openPushStore } from "../server/push-store.mjs";

test("exportação Node → D1 preserva inscrições, revisões, revogações e tentativas anteriores", () => {
  const temporaryRoot = resolve(tmpdir());
  const folder = mkdtempSync(join(temporaryRoot, "rotina-d1-export-"));
  const source = join(folder, "source.sqlite");
  const destination = join(folder, "migration.sql");
  const old = openPushStore(source);
  const migrated = new DatabaseSync(":memory:");
  const now = Date.parse("2026-11-05T12:05:00Z");
  const issued = now - 60 * 60_000;
  const id = hash("local test token");
  const revoked = hash("local revoked token");
  const receiver = createECDH("prime256v1");
  const scalar = Buffer.alloc(32);
  scalar[31] = 2;
  receiver.setPrivateKey(scalar);
  const subscription = { endpoint: "https://web.push.apple.com/fixture", keys: {
    p256dh: receiver.getPublicKey().toString("base64url"), auth: Buffer.alloc(16).toString("base64url"),
  } };
  const profile = structuredClone(pushPlan(defaultPreferences));
  // Exercise plan export across several bounded SQL statements.
  for (let day = 1; day <= 28; day++) {
    for (let month = 1; month <= 12; month++) {
      profile.overrides[`2028-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`] =
        { kind: "senac", startTime: "14:00", endTime: "17:00" };
    }
  }
  try {
    assert.equal(old.save(id, subscription, profile, 4, issued), 204);
    assert.equal(old.claim(id, "today:2026-11-05", now - 5 * 60_000), true);
    old.revoke(revoked, issued);
    assert.equal(exportNodePush(source, destination, now), 1);
    assert.throws(() => exportNodePush(source, destination, now), /EEXIST/);
    assert.throws(() => exportNodePush(source, "out/unsafe-export.sql", now), /fora de public/);
    migrated.exec("PRAGMA foreign_keys = ON;");
    migrated.exec(readFileSync(new URL("../worker/migrations/0001_push.sql", import.meta.url), "utf8"));
    migrated.exec(readFileSync(destination, "utf8"));
    const row = migrated.prepare("SELECT * FROM devices WHERE id = ?").get(id);
    assert.deepEqual(JSON.parse(row.subscription), subscription);
    assert.deepEqual(JSON.parse(row.plan), profile);
    assert.equal(row.revision, 4);
    assert.equal(migrated.prepare("SELECT id FROM revoked WHERE id = ?").get(revoked).id, revoked);
    const prior = migrated.prepare("SELECT pending, attempts FROM jobs WHERE occurrence = 'today:2026-11-05'").get();
    assert.equal(prior.pending, 0);
    assert.equal(prior.attempts, 1);
    assert.equal(migrated.prepare("SELECT pending FROM jobs WHERE occurrence = 'tomorrow:2026-11-06'").get().pending, 1);
  } finally {
    old.close();
    migrated.close();
    if (folder.startsWith(temporaryRoot + sep)) rmSync(folder, { recursive: true, force: true });
  }
});
