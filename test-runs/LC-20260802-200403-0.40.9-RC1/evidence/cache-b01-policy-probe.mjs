import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5118/", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const result = await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.ready;
  const script = await fetch("/sw.js").then((response) => response.text());
  return {
    scope: registration.scope,
    activeScript: registration.active?.scriptURL ?? null,
    cacheNames: await caches.keys(),
    mediaPathGuard: script.includes('url.pathname.startsWith("/api/v1/media/")'),
    mediaDestinationGuard: script.includes('["audio", "image", "video"].includes(event.request.destination)'),
    networkFallback: script.includes("event.respondWith(fetch(event.request))"),
    signageCacheName: script.includes('caches.open("lessoncue-signage-v1")'),
  };
});
console.log(JSON.stringify(result));
await browser.close();
