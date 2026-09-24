// Capital Pass service worker.
//
// Sigue siendo deliberadamente minimo para casi toda la app: es 100% datos
// en vivo/de sesion (ventas, stock, entradas), asi que nunca se cachean
// paginas ni respuestas de API -- mostrar stock o entradas viejas seria
// activamente peligroso.
//
// Excepcion puntual: /admin/presupuestos/nuevo y /admin/presupuestos/[id]
// (modo offline de presupuestos). Esas dos paginas dejaron de resolver sus
// datos en el servidor -- ahora son un shell que carga todo del lado del
// cliente (fetch con fallback a IndexedDB, ver lib/offline/quote-cache.ts),
// asi que cachear su HTML no arrastra datos viejos: en el peor caso se
// abre el shell sin conexion y el JS ya sabe resolver el resto contra el
// cache local. Para que ese JS pueda arrancar sin red tambien hace falta
// cachear los assets estaticos de Next (con hash en el nombre -- inmutables,
// seguro cachearlos para siempre).
const CACHE_VERSION = "v2";
const OFFLINE_CACHE = `capital-pass-offline-${CACHE_VERSION}`;
const STATIC_CACHE = `capital-pass-static-${CACHE_VERSION}`;
const PAGES_CACHE = `capital-pass-pages-${CACHE_VERSION}`;
const CURRENT_CACHES = [OFFLINE_CACHE, STATIC_CACHE, PAGES_CACHE];
const OFFLINE_URL = "/offline.html";

const OFFLINE_PAGE_PATTERN =
  /^\/admin\/presupuestos\/(nuevo|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !CURRENT_CACHES.includes(name))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Cache-first para los assets estaticos de Next -- el nombre de archivo
  // ya trae un hash de contenido, asi que una vez cacheados nunca quedan
  // desactualizados (una build nueva usa nombres nuevos).
  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  if (request.mode !== "navigate") return;

  // Network-first con fallback a cache, solo para las 2 rutas de
  // presupuestos que ahora son un shell sin datos pegados al HTML. Se
  // indexa por pathname (sin query) porque el shell es el mismo HTML sin
  // importar el query string (?tipo=/?consulta= se leen del lado del
  // cliente despues de montar).
  if (sameOrigin && OFFLINE_PAGE_PATTERN.test(url.pathname)) {
    const cacheKey = url.pathname;
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES_CACHE);
        try {
          const response = await fetch(request);
          // Sin sesión, proxy.ts (el middleware) redirige a /login -- el
          // request de navegación llega acá con redirect "manual", asi
          // que eso se ve como una respuesta opaca (status 0, sin body).
          // Cachear esa respuesta rota dejaría el offline después
          // sirviendo un redirect vacío en vez del shell real -- solo se
          // cachea un 200 genuino, mismo origen, sin redirect de por medio.
          if (response.ok && response.type === "basic") {
            cache.put(cacheKey, response.clone());
          }
          return response;
        } catch {
          const cached = await cache.match(cacheKey);
          return cached || caches.match(OFFLINE_URL);
        }
      })()
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(OFFLINE_URL))
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
