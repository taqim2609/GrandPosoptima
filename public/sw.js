/* Grand Aceh Kuliner POS — Service Worker v4 (Fast First Paint & Image Caching)
   Strategy:
   1. Static JS/CSS/Fonts/Icons/Images: Cache-First with Stale-While-Revalidate
   2. App Shell (HTML): Network-first with immediate offline cache fallback
   3. API & OTA (/api/*, /ota/*): ALWAYS network-only (never cached)
*/
const CACHE_SHELL = "gak-pos-shell-v4";
const CACHE_IMAGES = "gak-pos-images-v2";

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/polyfills.js",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_SHELL).then((c) => c.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_SHELL && k !== CACHE_IMAGES)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Cross-origin font assets (Google Fonts) caching
  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_SHELL).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // ignore other 3rd party APIs
  if (url.pathname.startsWith("/api/")) return;     // API is always network-only (no SW caching)
  if (url.pathname.startsWith("/ota/")) return;     // OTA update files: always network-only

  // 1. Navigation (HTML App Shell)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_SHELL).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // 2. Images (Product images, icons, logos) -> Cache-First with background revalidation
  const isImage = /\.(png|jpe?g|webp|svg|gif|ico)(\?.*)?$/i.test(url.pathname);
  if (isImage) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_IMAGES).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3. Static JS & CSS Bundle Assets -> Cache-First with SWR
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          // Stale-while-revalidate in background
          fetch(req)
            .then((res) => {
              if (res && res.status === 200) {
                caches.open(CACHE_SHELL).then((c) => c.put(req, res)).catch(() => {});
              }
            })
            .catch(() => {});
          return cached;
        }
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_SHELL).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // 4. Default Static Handler
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_SHELL).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
