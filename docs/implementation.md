# Implementation guide

This repository keeps the native clients independent while sharing a published wire protocol. The server owns users, classes, lessons, media, screen assignments, schedules, and branding. Each TV persists only its identity, current manifest, verified media, future scheduled transitions, and status events.

## Prerequisites

| Area | Toolchain |
| --- | --- |
| Administration UI | Node.js 22.13+ and npm |
| Server | .NET SDK 10 and FFmpeg |
| Android/Fire TV | JDK 17, Android SDK 36, Gradle 9.4.1 |
| Apple TV | macOS, current Xcode, XcodeGen, Swift 6 |
| Containers | Docker Engine with Compose v2 |

## Administration UI

The product tour and administration experience is the React/TypeScript application at the repository root.

```bash
npm ci
npm run dev
npm run lint
npm test
```

The hosted deployment is configured by `.openai/hosting.json`. The browser app should consume `/api/v1` through a configurable server origin when it is moved from product-tour data to live server data.

## Server

```bash
dotnet restore server/LessonCue.Server/LessonCue.Server.csproj
dotnet run --project server/LessonCue.Server
dotnet test server/LessonCue.Server.Tests/LessonCue.Server.Tests.csproj
```

Configuration uses environment variables in production:

- `LESSONCUE_DATA_PATH` — root of the persistent data tree.
- `LESSONCUE_HTTP_PORT` — HTTP listener; default 8080.
- `LESSONCUE_SERVER_NAME` — discovery display name.
- `ASPNETCORE_URLS` — optional standard ASP.NET listener override.

SQLite is created with `EnsureCreated` for the foundation release. Before schema changes reach production data, add EF Core migrations and test forward and rollback paths against copied databases.

### Implemented API path

The server currently includes discovery, health, class and lesson creation, playlist item creation, duplicate-aware media upload, range-enabled media delivery, rate-limited PIN pairing, revocable hashed device credentials, authenticated screen manifests, status reporting, audit events, and SignalR manifest invalidation.

The next production-hardening work is browser authentication/authorization, CSRF protection around the administration API, resumable chunk uploads, FFmpeg workers, restore UI, and signed short-lived download URLs.

## Android TV

```bash
gradle -p android-tv :app:testDebugUnitTest :app:assembleDebug
```

The app uses a LEANBACK launcher, Compose focusable surfaces, Media3/ExoPlayer, DataStore credentials, and WorkManager caching. The API client implements discovery, pairing, manifest parsing, and authenticated downloads.

Production work should replace the simple cache worker with Media3 `DownloadService` and a durable download database, validate SHA-256 before finalizing every file, add Network Service Discovery browsing, encrypt the device token with Android Keystore, and expose download health to the UI.

## Apple TV

The protocol package builds independently on any Swift 6 toolchain:

```bash
swift build --package-path tvos
```

Generate the application project only on macOS:

```bash
cd tvos
xcodegen generate
xcodebuild -project LessonCueTV.xcodeproj -scheme LessonCueTV \
  -sdk appletvsimulator -destination 'generic/platform=tvOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

The tvOS client uses Bonjour, Keychain device credentials, AVPlayer, an actor-isolated offline cache, checksum verification, and the shared schedule semantics. Background URLSession identifiers and App Store signing must be supplied by the deployment team.

## Countdown and pre-roll semantics

The server publishes `designatedStartAt`, a complete countdown item with `durationMs`, computed `startAt`, and a pre-roll item list. Both clients use the same state transition:

```text
idle/signage → repeating pre-roll → countdown at start minus duration → lesson at start
```

If a client resumes during the countdown window, it seeks by elapsed countdown time. The final frame therefore remains aligned to the designated start. The synchronized manifest is stored locally so calculation and playback can continue without the server.

## Protocol evolution

Make compatible additions inside `/api/v1` and update both `protocol/openapi.yaml` and `protocol/manifest.schema.json` in the same pull request. Never repurpose an existing field. Breaking changes require `/api/v2` plus a negotiated migration window.

Test fixtures should cover:

- Time-zone and daylight-saving boundaries.
- Waking before, during, and after a countdown.
- One and many pre-roll items.
- Trimmed duration versus source duration.
- Corrupt, partial, expired, and missing local files.
- Server loss during active local playback.
- Manifest conflicts and token revocation.

## Release flow

Every pull request runs web, server, Android, and tvOS builds. Tags matching `v*` create native server packages and an Android APK. Store-signed Android and Apple releases intentionally require organization-owned signing credentials and should use protected GitHub environments.
