const CACHE_NAME = "taro-focus-rpg-20260615-2";
const APP_FILES = [
  "./",
  "./index.html",
  "./log.html",
  "./rpg.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./assets/rpg/boss-it.webp",
  "./assets/rpg/boss-toeic.webp",
  "./assets/rpg/boss-hsk.webp",
  "./assets/rpg/hero-school.webp",
  "./assets/rpg/hero-cozy.webp",
  "./assets/rpg/hero-chibi.webp",
  "./assets/rpg/hero-cyber.webp",
  "./assets/rpg/hero-dark.webp",
  "./assets/rpg/hero-royal.webp",
  "./assets/rpg/hero-jrpg-sprites.webp"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isPage = event.request.mode === "navigate" || url.pathname.endsWith(".html");
  if (isPage) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(response => response || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      });
    })
  );
});

self.addEventListener("message", event => {
  if (!event.data) return;
  if (event.data.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
    );
  }
});
