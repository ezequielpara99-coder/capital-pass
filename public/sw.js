// Capital Pass service worker.
//
// Deliberately minimal: this app is 100% live/session data (ventas, stock,
// entradas), so we never cache pages or API responses -- showing stale
// stock or ticket data would be actively dangerous. The only job of this
// worker is (a) make the site installable as a PWA and (b) show a decent
// offline screen instead of the browser's default error when there's no
// connection at all.
const OFFLINE_CACHE = "capital-pass-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});

// Notificaciones push (ventas de barra/mesa, stock bajo, resumen periodico).
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Capital Pass", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Capital Pass", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/panel" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/panel";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
