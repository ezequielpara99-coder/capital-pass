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
