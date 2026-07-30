const BUILD_VERSION = "__DEAD_GROUND_BUILD_VERSION__";
const CACHE_PREFIX = "dead-ground-";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./legal.css",
  "./privacy.html",
  "./styles.css",
  "./terms.html",
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
  "./src/visuals.js",
  "./src/assets/visuals/menu-sector-fall.webp",
  "./src/assets/visuals/missions-radio-desk.webp",
  "./src/assets/visuals/survivor-01.webp",
  "./src/assets/visuals/survivor-02.webp",
  "./src/assets/visuals/survivor-03.webp",
  "./src/assets/visuals/survivor-04.webp",
  "./src/assets/visuals/survivor-05.webp",
  "./src/assets/visuals/survivor-06.webp",
  "./src/assets/visuals/vehicle-expedition-top.webp",
  "./src/assets/visuals/ending-zone-fallen.webp",
  "./src/assets/visuals/ending-convoy-evacuation.webp",
  "./src/maps/google-map.js",
  "./src/maps/fallback-map.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  const runtimeConfig = requestUrl.pathname.endsWith("/config.local.js");
  if (event.request.mode === "navigate" || runtimeConfig) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event));
});

async function cacheSuccessfulResponse(request, response) {
  if (!response.ok) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    await cacheSuccessfulResponse(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
      const legalPage = pathname.endsWith("/privacy")
        ? "./privacy.html"
        : pathname.endsWith("/terms")
          ? "./terms.html"
          : null;
      const shell = (legalPage && await caches.match(legalPage)) ||
        await caches.match("./index.html") ||
        await caches.match("./");
      if (shell) return shell;
    }
    throw error;
  }
}

function staleWhileRevalidate(event) {
  const revalidation = fetch(event.request).then(async (response) => {
    await cacheSuccessfulResponse(event.request, response);
    return response;
  });
  event.waitUntil(revalidation.then(() => undefined).catch(() => undefined));

  return caches.match(event.request).then((cached) => cached || revalidation);
}
