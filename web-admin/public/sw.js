// Shared with WebPlayer.tsx, which fills it.
const MEDIA_CACHE = "lessoncue-media-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil((async () => {
  // The cache used to hold signage alone and was named for it. Lessons live
  // here too now, so the old name is dropped rather than left occupying space
  // on a device that may not have much.
  await Promise.all((await caches.keys())
    .filter(name => name.startsWith("lessoncue-") && name !== MEDIA_CACHE)
    .map(name => caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const media = url.origin === self.location.origin && url.pathname.startsWith("/api/v1/media/") &&
    ["audio", "image", "video"].includes(event.request.destination);
  if (!media) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(caches.open(MEDIA_CACHE).then(async cache =>
    await cache.match(event.request, { ignoreVary: true }) || fetch(event.request)));
});
