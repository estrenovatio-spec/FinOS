const SHELL_CACHE = "finos-shell-v1";
const LAST_PAGE_KEY = "/__finos_last_page__";
const PRECACHE = [
  "/offline.html",
  "/icons/icon-192.png?v=20260923",
  "/icons/icon-512.png?v=20260923",
  "/fonts/inter-400.woff",
  "/fonts/inter-600.woff",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("finos-shell-") && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(LAST_PAGE_KEY, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(LAST_PAGE_KEY)) ??
            (await cache.match("/offline.html")) ??
            Response.error()
          );
        }),
    );
    return;
  }

  const cacheableAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    /\.(?:png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname);

  if (!cacheableAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          void caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      });
    }),
  );
});
