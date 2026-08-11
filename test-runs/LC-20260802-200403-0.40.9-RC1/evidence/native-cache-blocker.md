# Native Android cache matrix blocker

- Captured: 2026-08-02 20:47 -04:00
- Available: source-level cache implementation, Android JVM tests, one API 36 Google TV AVD, generated sentinel metadata.
- Unavailable: paired server/client session, production-like Android 9-12/current hardware, controlled HTTP proxy, network interruption controls, low-storage fixture, and a way to observe real WorkManager/download/playback transitions.

CACHE-A01 through CACHE-A13 are BLOCKED. The API 36 instrumentation run covered update-manager tests only; it did not exercise `MediaCacheWorker` against a live manifest/media server. The source watchlist remains unproven and is preserved for follow-up:

- `LessonCueApi.manifest()` writes the raw response before parsing, so malformed-response last-known-good behavior needs a real client test.
- `cachedItems` is supplied from the media directory entry count in `MainActivity`, while detailed inventory distinguishes states.
- No explicit obsolete-media/free-space cleanup path was found in the reviewed client code.
- `MediaCacheWorker` uses stable item filenames and SHA-fragmented unique WorkManager names; replacement/rename behavior needs packaged-device evidence.

These are hypotheses from the authoritative plan/code review, not promoted defects without runtime reproduction.
