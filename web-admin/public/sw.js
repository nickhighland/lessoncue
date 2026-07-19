self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const media = url.origin === self.location.origin && url.pathname.startsWith("/api/v1/media/") &&
    ["audio", "image", "video"].includes(event.request.destination);
  if (!media) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(caches.open("lessoncue-signage-v1").then(async cache =>
    await cache.match(event.request, { ignoreVary: true }) || fetch(event.request)));
});
