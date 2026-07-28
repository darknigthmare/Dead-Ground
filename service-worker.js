const CACHE_NAME = "dead-ground-v2.0.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.local.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./src/main.js",
  "./src/constants.js",
  "./src/geo.js",
  "./src/rng.js",
  "./src/world.js",
  "./src/real-places.js",
  "./src/engine.js",
  "./src/storage.js",
  "./src/migrations.js",
  "./src/audio.js",
  "./src/renderer.js",
  "./src/ui.js",
  "./src/maps/google-map.js",
  "./src/maps/fallback-map.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
