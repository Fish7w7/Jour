import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import webPush from "web-push";
import { createPushService } from "./push-service.mjs";
import { openPushStore } from "./push-store.mjs";

export function startPushService(env = process.env) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_DB_PATH, APP_ORIGIN } = env;
  if (![VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_DB_PATH, APP_ORIGIN].some(Boolean)) return;
  if (![VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_DB_PATH, APP_ORIGIN].every(Boolean)) {
    throw new Error("Configure todas as variáveis de Web Push ou deixe todas vazias.");
  }
  const origin = new URL(APP_ORIGIN);
  if (origin.origin !== APP_ORIGIN || (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) {
    throw new Error("APP_ORIGIN deve ser uma origem HTTPS, ou HTTP em loopback para testes.");
  }
  if (!VAPID_SUBJECT.startsWith("mailto:") && !VAPID_SUBJECT.startsWith("https://")) {
    throw new Error("VAPID_SUBJECT deve usar mailto: ou HTTPS.");
  }
  const path = resolve(PUSH_DB_PATH);
  const fromPublic = relative(resolve("out"), path);
  if (fromPublic !== ".." && !fromPublic.startsWith(".." + sep) && !isAbsolute(fromPublic)) {
    throw new Error("PUSH_DB_PATH deve ficar fora do diretório público out/.");
  }
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  closeSync(openSync(path, "a", 0o600));
  const store = openPushStore(path);
  const service = createPushService({
    store, origin: APP_ORIGIN, publicKey: VAPID_PUBLIC_KEY,
    send: (subscription, message, TTL, topic) => webPush.sendNotification(subscription, JSON.stringify(message), {
      TTL, topic, timeout: 10_000,
    }),
  });
  const run = () => void service.tick().catch(() => console.error("Falha no ciclo de notificações."));
  run();
  setInterval(run, 15_000).unref();
  return service;
}
