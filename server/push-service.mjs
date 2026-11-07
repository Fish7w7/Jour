import { dispatchWindow, dueNotifications } from "../lib/notifications.ts";
import { parsePlan, parseSubscription } from "./push-validation.mjs";
import { hash } from "./push-store.mjs";

const invalidToken = /^(?:[a-f0-9]{64})$/;
const bodyLimit = 128 * 1024;

function reply(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (body !== undefined) response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.writeHead(status).end(body === undefined ? undefined : JSON.stringify(body));
}

async function readBody(request) {
  const buffers = [];
  let bytes = 0;
  if (Number(request.headers["content-length"]) > bodyLimit) throw new Error("body");
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > bodyLimit) throw new Error("body");
    buffers.push(chunk);
  }
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}

export function createPushService({ store, origin, publicKey, send, now = Date.now }) {
  let running = false;
  let lastCleanup = -Infinity;
  let requestWindow = -Infinity;
  let requests = 0;

  async function deliver(device, message, ttl) {
    try {
      await send(JSON.parse(device.subscription), message, ttl, hash(message.id).slice(0, 32));
      return 204;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        store.revoke(device.id, now(), device.endpoint);
        return 410;
      }
      return 502;
    }
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      const time = now();
      if (time - lastCleanup >= 3_600_000) {
        store.cleanup(time);
        lastCleanup = time;
      }
      const window = dispatchWindow(time);
      let failed = 0;
      async function dispatchDevice(id) {
        const device = store.get(id);
        if (!device) return;
        const messages = dueNotifications(JSON.parse(device.plan), window, device.active_since);
        for (const message of messages) {
          const current = store.get(id);
          if (!current || current.revision !== device.revision || current.subscription !== device.subscription) break;
          // Claim before delivery so a process restart cannot repeat an ambiguous send.
          if (store.claim(id, message.id, time) && await deliver(current, message, 600) === 502) failed++;
        }
      }
      const devices = store.ids();
      for (let index = 0; index < devices.length; index += 16) {
        await Promise.all(devices.slice(index, index + 16).map(dispatchDevice));
      }
      if (failed) console.error(`Falha no provedor Web Push para ${failed} aviso(s).`);
    } finally {
      running = false;
    }
  }

  async function handle(request, response, path) {
    if (path === "/api/push/config" && request.method === "GET") {
      return reply(response, 200, { available: true, publicKey });
    }
    const isTest = path === "/api/push/test" && request.method === "POST";
    const isDevice = path === "/api/push/device" && (request.method === "PUT" || request.method === "DELETE");
    if (!isTest && !isDevice) return reply(response, 404);
    if (request.headers.origin !== origin) return reply(response, 403);

    const token = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (!request.headers.authorization?.startsWith("Bearer ") || !invalidToken.test(token)) return reply(response, 401);
    const time = now();
    if (time - requestWindow >= 60_000) {
      requestWindow = time;
      requests = 0;
    }
    if (++requests > 500) return reply(response, 429);
    const id = hash(token);

    if (isTest) {
      const device = store.get(id);
      if (!device) return reply(response, 410);
      if (!store.reserveTest(id, time)) return reply(response, 429);
      const message = { id: "test:" + time, title: "Notificação de teste", body: "O Jour está conectado neste dispositivo." };
      return reply(response, await deliver(device, message, 60));
    }
    if (request.method === "DELETE") {
      store.revoke(id, time);
      return reply(response, 204);
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) return reply(response, 415);
    let body;
    try { body = await readBody(request); } catch { return reply(response, 400); }
    const subscription = parseSubscription(body?.subscription);
    const plan = parsePlan(body?.plan);
    if (!subscription || !plan || !Number.isSafeInteger(body.revision) || body.revision < 0) return reply(response, 400);
    return reply(response, store.save(id, subscription, plan, body.revision, now()));
  }

  return { handle, tick };
}
