# Browser cache execution limits

- Captured: 2026-08-02 20:48 -04:00

`CACHE-B01` was run against a disposable localhost server with Chromium. The service worker registered at `/sw.js`; the probe confirmed the same-origin `/api/v1/media/` path guard, audio/image/video destination guard, network fallback for non-media requests, and `lessoncue-signage-v1` cache name. No paired identity was present, so the cache remained empty as expected.

`CACHE-B02` through `CACHE-B06` need a browser display paired to a real server with published signage/media, then controlled replacement, assignment cleanup, HTTP failure/quota injection, and server update/restart. Those operations were not substituted with unauthenticated localhost requests.
