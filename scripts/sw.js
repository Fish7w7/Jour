/* VERSION and FILES are injected from the static export. */
const prefix = "rotina-aprendiz-";
const cacheName = prefix + VERSION;
const assets = new Set(FILES);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(
    FILES.map((path) => new Request(path, { cache: "reload" })),
  )));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(prefix) && name !== cacheName)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  const path = url.pathname === "/index.html" ? "/" : url.pathname;
  if (!assets.has(path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(path)) ?? fetch(event.request);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "apply-update") event.waitUntil(self.skipWaiting());
});

self.addEventListener("push", (event) => {
  let message;
  try { message = event.data?.json(); } catch {}
  const title = typeof message?.title === "string" ? message.title.slice(0, 120) : "Jour";
  const body = typeof message?.body === "string" ? message.body.slice(0, 600) : "Abra a agenda para ver seu lembrete.";
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: "/icon-192.png", tag: typeof message?.id === "string" ? message.id.slice(0, 180) : "rotina-aprendiz",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = windows.find((client) => ["/", "/index.html"].includes(new URL(client.url).pathname));
    if (app) return app.focus();
    return self.clients.openWindow("/");
  })());
});
