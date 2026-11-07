import assert from "node:assert/strict";
import { createECDH, createPublicKey, verify } from "node:crypto";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve, sep } from "node:path";
import { pushPlan } from "../lib/notifications.ts";
import { defaultPreferences } from "../lib/schedule.ts";

const require = createRequire(import.meta.url);
const ece = createRequire(require.resolve("web-push"))("http_ece");
const working = resolve(".work");
await mkdir(working, { recursive: true });
const temporary = await mkdtemp(join(working, "wrangler-test-"));
const configPath = join(temporary, "wrangler.json");
const statePath = join(temporary, "state");
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" };
for (const name of Object.keys(env)) {
  if (/^(CLOUDFLARE|CF)_(API|ACCOUNT|ACCESS)|^VAPID_|^APP_ORIGIN$/.test(name)) delete env[name];
}
const port = Number(process.env.ROTINA_TEST_PORT ?? 8793);
const origin = "http://127.0.0.1:" + port;
const config = JSON.parse(await readFile("wrangler.example.jsonc", "utf8"));
config.name = "jour-local-test";
config.main = resolve("tests/fixtures/cloudflare-worker.ts");
config.assets.directory = resolve("out");
config.d1_databases[0].migrations_dir = resolve("worker/migrations");
config.d1_databases[0].remote = false;
await writeFile(configPath, JSON.stringify(config));

let child;
let logs = "";
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
async function stop() {
  if (child?.exitCode === null && child?.signalCode === null) {
    const closed = once(child, "close");
    child.kill();
    await closed;
  }
}
async function start() {
  child = spawn(process.execPath, [wrangler, "dev", "--local", "--test-scheduled", "--config", configPath,
    "--port", String(port), "--persist-to", statePath], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { logs = (logs + chunk).slice(-6500); });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(origin + "/api/push/config", { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((done) => setTimeout(done, 160));
  }
  throw new Error("O Wrangler local não iniciou.");
}

const at = (date, time) => Date.parse(`${date}T${time}:00Z`);
const secret = (number) => number.toString(16).padStart(64, "0");
const plan = () => structuredClone(pushPlan(defaultPreferences));
const receiver = createECDH("prime256v1");
const scalar = Buffer.alloc(32);
scalar[31] = 2;
receiver.setPrivateKey(scalar);
const keys = { p256dh: receiver.getPublicKey().toString("base64url"), auth: Buffer.alloc(16).toString("base64url") };

const request = (path, init) => fetch(origin + path, init);
const state = async () => {
  const response = await request("/api/push/fixture/state");
  assert.equal(response.status, 200);
  return response.json();
};
const api = (method, device, time, data, site = origin, path = "device") => request("/api/push/" + path, {
  method,
  headers: {
    Origin: site, Authorization: "Bearer " + secret(device), "X-Fixture-Time": String(time),
    "Content-Type": "application/json",
  },
  body: data === undefined ? undefined : JSON.stringify(data),
});
const profile = (endpoint, preferences = plan(), revision = 1) => ({
  subscription: { endpoint: "https://web.push.apple.com/" + endpoint, keys }, plan: preferences, revision,
});
const status = async (pending, expected) => {
  const response = await pending;
  if (response.status !== expected) assert.equal(response.status, expected, await response.text());
  return response;
};
const tick = async (time) => {
  const response = await request("/cdn-cgi/local/scheduled?format=json&time=" + time);
  const outcome = await response.json();
  assert.equal(outcome.outcome, "ok", JSON.stringify(outcome));
};
const delivered = async (suffix) => (await state()).attempts.filter(({ endpoint }) => endpoint.endsWith("/" + suffix));

function verifyEnvelope(attempt, expectedMessage) {
  assert.equal(attempt.encoding, "aes128gcm");
  assert.match(attempt.topic, /^[a-f0-9]{32}$/);
  const [, jwt, encodedKey] = attempt.authorization.match(/t=([^, ]+),\s*k=(\S+)/);
  const [header, claims, signature] = jwt.split(".");
  const point = Buffer.from(encodedKey, "base64url");
  const key = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256",
    x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33).toString("base64url") } });
  assert.ok(verify("sha256", Buffer.from(header + "." + claims), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")));
  const { aud, sub, iat, exp } = JSON.parse(Buffer.from(claims, "base64url"));
  assert.equal(aud, "https://web.push.apple.com");
  assert.equal(sub, "mailto:fixture@example.com");
  assert.ok(exp > iat && exp - iat <= 24 * 60 * 60);
  const decoded = ece.decrypt(Buffer.from(attempt.ciphertext, "base64"),
    { version: "aes128gcm", privateKey: receiver, authSecret: Buffer.alloc(16) });
  const message = JSON.parse(decoded.toString());
  assert.equal(message.id, expectedMessage);
  return message;
}

try {
  await readFile("out/sw.js");
  const migration = spawnSync(process.execPath, [wrangler, "d1", "migrations", "apply", "DB",
    "--local", "--config", configPath, "--persist-to", statePath], { env, encoding: "utf8" });
  assert.equal(migration.status, 0, migration.stderr + migration.stdout);
  await start();
  await status(request("/api/push/fixture/init", { method: "POST" }), 204);
  assert.match(await (await status(request("/"), 200)).text(), /<title>Jour<\/title>/);
  assert.equal((await status(request("/sw.js"), 200)).headers.get("Cache-Control"), "no-cache");
  await status(request("/api/push/missing"), 404);
  await status(request("/.dev.vars"), 404);
  const initial = at("2026-11-05", "11:00");
  await status(request("/api/push/device", { method: "DELETE", headers: { Origin: origin } }), 401);
  await status(api("PUT", 1, initial, profile("main"), "https://forged.example"), 403);
  await status(api("PUT", 1, initial, { ...profile("main"), revision: -1 }), 400);
  await status(api("PUT", 1, initial, { ...profile("main"), subscription: { endpoint: "https://127.0.0.1/internal", keys } }), 400);
  await status(api("PUT", 1, initial, profile("main")), 204);
  await status(api("PUT", 2, initial, profile("main")), 409);
  await status(api("POST", 1, initial, undefined, origin, "test"), 204);
  await status(api("POST", 1, initial, undefined, origin, "test"), 429);
  verifyEnvelope((await delivered("main"))[0], "test:" + initial);
  await status(api("PUT", 2, initial, profile("redirect")), 204);
  await status(api("POST", 2, initial, undefined, origin, "test"), 502);
  assert.deepEqual((await delivered("redirect")).map(({ status }) => status), [307]);
  await status(api("DELETE", 2, initial), 204);

  const moved = plan();
  moved.settings.today.time = "09:05";
  await status(api("PUT", 1, at("2026-11-05", "11:30"), profile("main", moved, 2)), 204);
  await status(api("PUT", 1, at("2026-11-05", "11:31"), profile("main")), 409);
  await tick(at("2026-11-05", "12:00"));
  assert.equal((await delivered("main")).length, 1);
  await tick(at("2026-11-05", "12:05"));
  verifyEnvelope((await delivered("main"))[1], "today:2026-11-05");
  await stop();
  await start();
  await tick(at("2026-11-05", "12:05"));
  assert.equal((await delivered("main")).length, 2);
  await status(api("DELETE", 1, at("2026-11-05", "12:06")), 204);
  await status(api("PUT", 1, at("2026-11-05", "12:07"), profile("main", moved, 2)), 410);
  assert.equal((await state()).devices.length, 0);
  assert.equal((await state()).jobs.length, 0);

  const morning = plan();
  morning.settings.tomorrow.enabled = false;
  const friday = at("2026-11-06", "11:00");
  for (const [id, endpoint] of [[3, "retry"], [4, "ambiguous"], [5, "gone"]]) {
    await status(api("PUT", id, friday, profile(endpoint, morning)), 204);
  }
  await Promise.all([tick(at("2026-11-06", "12:00")), tick(at("2026-11-06", "12:00"))]);
  await tick(at("2026-11-06", "12:01"));
  assert.deepEqual((await delivered("retry")).map(({ status }) => status), [429]);
  await tick(at("2026-11-06", "12:02"));
  assert.deepEqual((await delivered("retry")).map(({ status }) => status), [429, 503]);
  await tick(at("2026-11-06", "12:04"));
  await tick(at("2026-11-06", "12:05"));
  const retry = await delivered("retry");
  assert.deepEqual(retry.map(({ status }) => status), [429, 503, 201]);
  assert.equal(new Set(retry.map(({ topic }) => topic)).size, 1);
  assert.ok(Number(retry[0].ttl) > Number(retry[2].ttl));
  assert.equal((await delivered("ambiguous")).length, 1);
  assert.equal((await delivered("gone")).length, 1);
  await status(api("PUT", 5, at("2026-11-06", "12:05"), profile("gone", morning)), 410);
  for (const id of [3, 4]) await status(api("DELETE", id, at("2026-11-06", "12:05")), 204);

  for (let id = 10; id < 16; id++) await status(api("PUT", id, at("2026-11-09", "11:00"), profile("batch-" + id, morning)), 204);
  const batch = async () => (await state()).attempts.filter(({ endpoint }) => endpoint.includes("/batch-"));
  await tick(at("2026-11-09", "12:00"));
  assert.equal((await batch()).length, 4);
  await tick(at("2026-11-09", "12:01"));
  assert.equal((await batch()).length, 6);
  for (let id = 11; id < 16; id++) await status(api("DELETE", id, at("2026-11-09", "12:02")), 204);
  const before = await state();
  await tick(before.devices[0].refill_at);
  const after = await state();
  assert.ok(after.devices[0].refill_at > before.devices[0].refill_at);
  assert.ok(Math.max(...after.jobs.map(({ ready_at }) => ready_at)) > Math.max(...before.jobs.map(({ ready_at }) => ready_at)));

  await status(request("/api/push/fixture/obsolete", { method: "POST" }), 204);
  await tick(at("2026-11-16", "11:00"));
  const updated = await state();
  assert.notEqual(updated.devices[0].calendar_version, "old");
  assert.ok(updated.jobs.filter(({ pending }) => pending).every(({ calendar_version }) => calendar_version !== "old"));
  await status(api("DELETE", 10, at("2026-11-16", "11:01")), 204);

  const departure = plan();
  departure.settings.departure = { enabled: true, hospital: "08:30", senac: "09:00" };
  await status(api("PUT", 20, initial, profile("departure", departure)), 204);
  departure.settings.departure.hospital = "08:45";
  await status(api("PUT", 20, at("2026-11-05", "11:20"), profile("departure", departure, 2)), 204);
  await tick(at("2026-11-05", "11:30"));
  assert.equal((await delivered("departure")).length, 0);
  await Promise.all([tick(at("2026-11-05", "11:45")), tick(at("2026-11-05", "11:45"))]);
  const sent = await delivered("departure");
  assert.equal(sent.length, 1);
  assert.equal(verifyEnvelope(sent[0], "departure:2026-11-05").title, "Hora de sair — Hospital");
  departure.settings.departure.hospital = "10:15";
  await status(api("PUT", 20, at("2026-11-05", "11:47"), profile("departure", departure, 3)), 204);
  await tick(at("2026-11-05", "12:00"));
  await tick(at("2026-11-05", "13:15"));
  const afterChange = await delivered("departure");
  assert.equal(afterChange.length, 2);
  verifyEnvelope(afterChange[1], "today:2026-11-05");
  await tick(at("2026-11-06", "12:00"));
  const afterCollision = await delivered("departure");
  assert.equal(afterCollision.length, 3);
  verifyEnvelope(afterCollision[2], "today:2026-11-06");
  departure.settings.departure.senac = "10:30";
  await status(api("PUT", 20, at("2026-11-06", "12:01"), profile("departure", departure, 4)), 204);
  const invalidDeparture = structuredClone(departure);
  invalidDeparture.settings.departure.senac = "25:00";
  await status(api("PUT", 20, at("2026-11-06", "12:02"), profile("departure", invalidDeparture, 5)), 400);
  assert((await state()).jobs.some(job => job.pending && job.occurrence === "departure:2026-11-06"));
  departure.settings.departure.enabled = false;
  await status(api("PUT", 20, at("2026-11-06", "12:03"), profile("departure", departure, 5)), 204);
  await tick(at("2026-11-06", "13:30"));
  assert.equal((await delivered("departure")).length, 3);
  assert(!(await state()).jobs.some(job => job.pending && job.occurrence.startsWith("departure:")));
  const senac = plan();
  senac.settings.today.enabled = false;
  senac.settings.departure = { enabled: true, senac: "10:30" };
  await status(api("PUT", 21, at("2026-11-06", "13:25"), profile("departure-senac", senac)), 204);
  await tick(at("2026-11-06", "13:30"));
  await tick(at("2026-11-07", "13:30"));
  const sentToSenac = await delivered("departure-senac");
  assert.equal(sentToSenac.length, 1);
  assert.equal(verifyEnvelope(sentToSenac[0], "departure:2026-11-06").title, "Hora de sair — Senac");
  console.log("Wrangler local: assets, API, D1, VAPID/aes128gcm, cron, retries, deduplicação, revogação, atualização da agenda e Hora de sair OK.");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await stop();
  if (temporary.startsWith(working + sep)) await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
}
