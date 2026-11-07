import { buildPushPayload, type VapidKeys } from "@block65/webcrypto-web-push";
import type { D1Database, RateLimit, ScheduledController } from "@cloudflare/workers-types";
import { object, type PushMessage, type PushPlan } from "../lib/notifications.ts";
import { parsePlan, subscriptionShape, type BrowserSubscription } from "../lib/push-input.ts";
import { d1Store, type ClaimedJob } from "./d1-store.ts";
import { buildHorizon, calendarVersion, day, minute, retryAt } from "./planning.ts";

export type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  API_LIMIT?: RateLimit;
  APP_ORIGIN?: string;
  VAPID_SUBJECT?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};

const batchSize = 4;
const bodyLimit = 128 * 1024;
const encoder = new TextEncoder();

async function hash(value: string) {
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function config(env: Env) {
  const { APP_ORIGIN, VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = env;
  const url = URL.parse(APP_ORIGIN ?? "");
  if (!url || url.origin !== APP_ORIGIN || (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) return;
  if (!VAPID_SUBJECT || !/^(mailto:.+|https:\/\/.+)$/.test(VAPID_SUBJECT) ||
      !VAPID_PUBLIC_KEY || !/^[\w-]{87}$/.test(VAPID_PUBLIC_KEY) ||
      !VAPID_PRIVATE_KEY || !/^[\w-]{43}$/.test(VAPID_PRIVATE_KEY)) return;
  return { origin: APP_ORIGIN, vapid: { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY } };
}

function reply(status: number, body?: object) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  return body === undefined ? new Response(null, { status, headers }) : Response.json(body, { status, headers });
}

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader || Number(request.headers.get("content-length")) > bodyLimit) throw new Error("body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      size += value.byteLength;
      if (size > bodyLimit) throw new Error("body");
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function validPoint(subscription: BrowserSubscription) {
  try {
    const raw = Uint8Array.from(atob(subscription.keys.p256dh.replaceAll("-", "+").replaceAll("_", "/")),
      (letter) => letter.charCodeAt(0));
    if (raw.byteLength !== 65 || raw[0] !== 4) return false;
    await crypto.subtle.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, false, []);
    return true;
  } catch { return false; }
}

export function createWorker({ provider = fetch, clock = Date.now } = {}) {
  async function deliver(subscription: BrowserSubscription, message: PushMessage, ttl: number, vapid: VapidKeys) {
    try {
      const topic = (await hash(message.id)).slice(0, 32);
      const payload = await buildPushPayload(
        { data: JSON.stringify(message), options: { ttl, topic } },
        { ...subscription, expirationTime: null }, vapid,
      );
      // Workers supports manual redirects. A 3xx stays a failed delivery without forwarding VAPID.
      const response = await provider(subscription.endpoint, { ...payload, redirect: "manual", signal: AbortSignal.timeout(8000) });
      const retryAfter = response.headers.get("Retry-After");
      await response.body?.cancel().catch(() => {});
      return { status: response.status, retryAfter };
    } catch {
      // There is no reliable way to know whether a timed-out fetch reached the recipient.
      return { status: 0, retryAfter: null };
    }
  }

  async function handle(request: Request, env: Env, path: string) {
    const setup = config(env);
    if (path === "/api/push/config" && request.method === "GET") {
      return setup ? reply(200, { available: true, publicKey: setup.vapid.publicKey }) : reply(503, { available: false });
    }
    if (!setup) return reply(503, { available: false });
    const isTest = path === "/api/push/test" && request.method === "POST";
    const isDevice = path === "/api/push/device" && (request.method === "PUT" || request.method === "DELETE");
    if (!isTest && !isDevice) return reply(404);
    if (request.headers.get("Origin") !== setup.origin) return reply(403);
    const token = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) return reply(401);
    const limit = await env.API_LIMIT?.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" });
    if (limit && !limit.success) return reply(429);

    const id = await hash(token);
    const store = d1Store(env.DB);
    const now = clock();
    if (isTest) {
      const device = await store.reserveTest(id, now);
      if (!device) {
        const current = await store.get(id);
        return reply(current && current.last_seen >= now - 365 * day ? 429 : 410);
      }
      const { status } = await deliver(JSON.parse(device.subscription),
        { id: "test:" + now, title: "Notificação de teste", body: "O Jour está conectado neste dispositivo." },
        60, setup.vapid);
      if (status === 404 || status === 410) await store.revoke(id, now, device.endpoint);
      return reply(status >= 200 && status < 300 ? 204 : status === 404 || status === 410 ? 410 : 502);
    }
    if (request.method === "DELETE") {
      await store.revoke(id, now);
      return reply(204);
    }
    if (!request.headers.get("Content-Type")?.startsWith("application/json")) return reply(415);
    let body: unknown;
    try { body = await readBody(request); } catch { return reply(400); }
    if (!object(body) || typeof body.revision !== "number" || !Number.isSafeInteger(body.revision) || body.revision < 0) return reply(400);
    const subscription = subscriptionShape(body.subscription);
    const plan = parsePlan(body.plan);
    if (!subscription || !plan) return reply(400);
    const encodedSubscription = JSON.stringify(subscription);
    const encodedPlan = JSON.stringify(plan);
    const fingerprint = await hash(encodedSubscription + "\n" + encodedPlan);
    const current = await store.get(id);
    if (current && (current.revision > body.revision ||
        (current.revision === body.revision && current.fingerprint !== fingerprint))) return reply(409);
    if (current?.fingerprint === fingerprint && current.calendar_version === calendarVersion) {
      if (current.revision === body.revision && now - current.last_seen < day) return reply(204);
      if (await store.syncUnchanged(id, fingerprint, body.revision, now)) return reply(204);
    }
    if (!await validPoint(subscription)) return reply(400);
    const activeSince = current?.fingerprint === fingerprint ? current.active_since : now;
    const horizon = buildHorizon(plan, id, now, activeSince);
    return reply(await store.save(id, subscription.endpoint, encodedSubscription, encodedPlan, fingerprint, body.revision, now, horizon));
  }

  return {
    async fetch(request: Request, env: Env) {
      const path = new URL(request.url).pathname;
      if (!path.startsWith("/api/push/")) return env.ASSETS.fetch(request);
      try { return await handle(request, env, path); }
      catch { console.error("Falha na API de notificações."); return reply(500); }
    },
    async scheduled(controller: ScheduledController, env: Env) {
      controller.noRetry();
      const setup = config(env);
      if (!setup) return;
      const { vapid } = setup;
      const now = Math.max(clock(), controller.scheduledTime);
      const store = d1Store(env.DB);
      const jobs = await store.claim(now, batchSize);

      async function send(job: ClaimedJob) {
        const device = await store.activeTarget(job);
        const remaining = job.expires_at - Math.max(now, clock());
        if (!device || remaining < 1000) return;
        const message = { id: job.occurrence, title: job.title, body: job.body };
        const result = await deliver(JSON.parse(device.subscription), message, Math.floor(remaining / 1000), vapid);
        if (result.status === 404 || result.status === 410) {
          await store.revoke(job.device, Math.max(now, clock()), device.endpoint);
        } else {
          const next = retryAt(result.status, result.retryAfter, job.attempts, Math.max(now, clock()), job.expires_at);
          if (next !== undefined) await store.retry(job, next);
          else if (result.status < 200 || result.status >= 300) console.warn("Aviso recusado ou entrega incerta.", result.status);
        }
      }

      await Promise.all(jobs.map(send));
      if (jobs.length < batchSize) {
        const device = await store.nextRefill(now);
        if (device) {
          const horizon = buildHorizon(JSON.parse(device.plan) as PushPlan, device.id, now, device.active_since);
          await store.refill(device, horizon);
        }
        if (Math.floor(controller.scheduledTime / minute) % 60 === 37) await store.cleanup(now);
      }
    },
  };
}

export default createWorker();
