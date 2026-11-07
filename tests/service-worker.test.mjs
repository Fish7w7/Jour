import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

test("Service Worker exibe avisos visíveis, aceita atualização e abre apenas a agenda", async () => {
  const handlers = {};
  const notifications = [];
  const navigation = [];
  let client;
  const self = {
    addEventListener: (type, handler) => { handlers[type] = handler; },
    skipWaiting: async () => { navigation.push("update"); },
    registration: { showNotification: async (title, options) => { notifications.push({ title, ...options }); } },
    clients: {
      matchAll: async () => client ? [client] : [],
      openWindow: async (url) => { navigation.push(url); },
    },
  };
  runInNewContext(readFileSync(new URL("../scripts/sw.js", import.meta.url), "utf8"), { self, VERSION: "test", FILES: ["/"], URL });
  const dispatch = async (type, event) => {
    const pending = [];
    handlers[type]({ ...event, waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
  };
  await dispatch("push", { data: { json: () => ({ title: "Aviso", body: "Senac", id: "today:2026-11-05", url: "https://example.com" }) } });
  assert.equal(notifications[0].tag, "today:2026-11-05");
  assert.equal(notifications[0].body, "Senac");
  await dispatch("push", { data: { json: () => { throw new Error("invalid"); } } });
  assert.equal(notifications[1].title, "Jour");
  await dispatch("notificationclick", { notification: { close: () => navigation.push("close") } });
  client = { url: "https://rotina.example/", focus: async () => { navigation.push("focus"); } };
  await dispatch("notificationclick", { notification: { close: () => navigation.push("close") } });
  await dispatch("message", { data: "apply-update" });
  assert.deepEqual(navigation, ["close", "/", "close", "focus", "update"]);
});
