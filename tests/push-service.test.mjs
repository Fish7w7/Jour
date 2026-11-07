import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { defaultPreferences } from "../lib/schedule.ts";
import { pushPlan } from "../lib/notifications.ts";
import { createPushService } from "../server/push-service.mjs";
import { hash, openPushStore } from "../server/push-store.mjs";
import { parseSubscription } from "../server/push-validation.mjs";
import { startPushService } from "../server/start-push.mjs";

const origin = "https://rotina.example";
const token = "a".repeat(64);
const other = "b".repeat(64);
// Public generator point of P-256, used only as a syntactically valid fixture.
const publicPoint = "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5";
const keys = { auth: "A".repeat(22), p256dh: Buffer.from(publicPoint, "hex").toString("base64url") };
const subscription = { endpoint: "https://web.push.apple.com/test-fixture", keys };
const profile = () => ({ subscription, plan: pushPlan(defaultPreferences), revision: 1 });

async function request(service, { method = "PUT", path = "/api/push/device", body, secret = token, site = origin } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.headers = { origin: site, authorization: "Bearer " + secret, "content-type": "application/json" };
  const reply = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
    writeHead(status) { this.status = status; return this; }, end(body) { this.body = body; } };
  await service.handle(req, reply, path);
  assert.equal(reply.headers["Cache-Control"], "no-store");
  return reply.status;
}

test("endpoint só aceita serviços de push permitidos em HTTPS com chaves válidas", () => {
  assert.ok(parseSubscription(subscription));
  for (const endpoint of [
    "http://web.push.apple.com/abc", "https://web.push.apple.com.example/abc", "https://web.push.apple.com:8443/abc",
    "https://user@web.push.apple.com/abc", "https://127.0.0.1/abc", "https://fcm.googleapis.com/anything",
  ]) assert.equal(parseSubscription({ endpoint, keys }), undefined, endpoint);
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/token", "https://updates.push.services.mozilla.com/wpush/v2/token",
    "https://wns2.notify.windows.com/w/?token=fixture",
  ]) assert.ok(parseSubscription({ endpoint, keys }), endpoint);
  assert.equal(parseSubscription({ ...subscription, keys: { ...keys, p256dh: "A".repeat(87) } }), undefined);
});

test("servidor inicia sem Web Push e recusa configuração parcial ou SQLite público", () => {
  assert.equal(startPushService({}), undefined);
  assert.throws(() => startPushService({ APP_ORIGIN: origin }), /todas as variáveis/);
  assert.throws(() => startPushService({
    APP_ORIGIN: origin, VAPID_SUBJECT: "mailto:fixture@example.com",
    VAPID_PUBLIC_KEY: "fixture", VAPID_PRIVATE_KEY: "fixture", PUSH_DB_PATH: "out/private.sqlite",
  }), /fora do diretório público/);
});

test("API protege a inscrição, substitui revisões, deduplica entre reinícios e revoga", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rotina-push-"));
  const path = join(dir, "test.sqlite");
  let store = openPushStore(path);
  const sent = [];
  let time = Date.parse("2026-11-03T11:00:00Z");
  let expired = false;
  const makeService = () => createPushService({
    store, origin, publicKey: keys.p256dh, now: () => time,
    send: async (_subscription, message, ttl, topic) => {
      if (expired) throw { statusCode: 410 };
      assert.ok(ttl > 0);
      assert.match(topic, /^[a-f0-9]{32}$/);
      sent.push(message);
    },
  });
  let service = makeService();
  try {
    assert.equal(await request(service, { body: profile(), site: "https://forged.example" }), 403);
    assert.equal(await request(service, { body: profile(), secret: "bad" }), 401);
    assert.equal(await request(service, { body: { ...profile(), revision: -1 } }), 400);
    assert.equal(await request(service, { body: profile() }), 204);
    assert.equal(await request(service, { body: profile(), secret: other }), 409);
    assert.equal(await request(service, { method: "POST", path: "/api/push/test", secret: other }), 410);
    assert.equal(await request(service, { method: "POST", path: "/api/push/test" }), 204);
    assert.equal(await request(service, { method: "POST", path: "/api/push/test" }), 429);

    const changed = profile();
    changed.revision = 2;
    changed.plan.settings = structuredClone(changed.plan.settings);
    changed.plan.settings.today.time = "09:05";
    assert.equal(await request(service, { body: changed }), 204);
    assert.equal(await request(service, { body: profile() }), 409);
    time = Date.parse("2026-11-03T12:00:00Z");
    await service.tick();
    assert.equal(sent.length, 1);
    time += 5 * 60_000;
    await Promise.all([service.tick(), service.tick()]);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].id, "today:2026-11-03");

    store.close();
    store = openPushStore(path);
    service = makeService();
    await service.tick();
    assert.equal(sent.length, 2);
    changed.revision = 3;
    changed.plan.settings.today.time = "09:07";
    assert.equal(await request(service, { body: changed }), 204);
    time += 2 * 60_000;
    await service.tick();
    assert.equal(sent.length, 2);

    assert.equal(await request(service, { method: "DELETE" }), 204);
    assert.equal(store.get(hash(token)), undefined);
    assert.equal(await request(service, { method: "DELETE" }), 204);
    assert.equal(await request(service, { body: changed }), 410);
    assert.equal(await request(service, { body: profile(), secret: other }), 204);
    expired = true;
    assert.equal(await request(service, { method: "POST", path: "/api/push/test", secret: other }), 410);
    assert.equal(store.get(hash(other)), undefined);
    assert.equal(await request(service, { body: profile(), secret: other }), 410);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a revisão mais recente remove lembretes pendentes sem revogar o dispositivo", async () => {
  const store = openPushStore(":memory:");
  const sent = [];
  let time = Date.parse("2026-11-05T11:00:00Z");
  const service = createPushService({
    store, origin, publicKey: keys.p256dh, now: () => time, send: async (_device, message) => { sent.push(message); },
  });
  try {
    const initial = profile();
    initial.plan.birthdays.push({ id: "fixture", month: 11, day: 5, time: "09:00" });
    assert.equal(await request(service, { body: initial }), 204);
    const replacement = profile();
    replacement.revision = 2;
    replacement.plan.overrides["2026-11-05"] = { kind: "free" };
    assert.equal(await request(service, { body: replacement }), 204);
    time = Date.parse("2026-11-05T12:00:00Z");
    await service.tick();
    assert.deepEqual(sent, []);
    assert.equal(store.get(hash(token)).revision, 2);
  } finally {
    store.close();
  }
});
