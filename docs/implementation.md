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

The administration experience is the React/TypeScript application in `web-admin`. Vite writes its production bundle into the ASP.NET server's `wwwroot`, so the browser and API always share the same local origin.

```bash
npm ci
npm run dev:admin
npm run lint
npm test
```

For production, run `npm run build:admin` before `dotnet publish`. The Dockerfile and release workflows do this automatically. The Vite development server proxies API and SignalR requests to `http://127.0.0.1:8080`.

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

SQLite is created with `EnsureCreated`; an idempotent appliance upgrader brings v0.1/v0.2 databases forward without requiring an SDK or migration CLI on the server. Every schema change must remain safe against a copied production database.

### Implemented API path

The server includes local setup and role-based cookie login, same-origin mutation protection, CSP/security headers, classes and lessons, playlist editing/reordering/duplication/archiving, resumable and duplicate-aware uploads, FFprobe/FFmpeg background inspection, safe URL classification, screen tags/assignment/revocation, scheduled and emergency signage, configuration/full backup archives, range-enabled media delivery, rotating rate-limited PIN pairing, hashed device credentials, authenticated screen manifests, status telemetry, audit events, and SignalR invalidation.

Media links are never fetched by the server. Direct file, supported embed, and external destinations are classified from their URL. Uploaded media and clearly identified direct media files can be cached by TVs; embedded and external-service pages remain online-only.

### Storage enforcement

`StorageService` measures the complete persistent data tree rather than trusting database media sizes, so originals, derivatives, thumbnails, databases, backups, and temporary upload chunks all count toward the allocation. A zero organization limit means automatic allocation: current usage plus disk space safely available after a 512 MB operating-system reserve. Every multipart upload, resumable-upload session, and chunk write performs a server-side capacity check and returns HTTP 507 when the request would exceed the remaining allocation.

### Protected native updates

`UpdateService` checks the public GitHub latest-release endpoint after startup and once per day. It only discovers versions as the unprivileged, sandboxed `lessoncue` service account. Installation is deliberately separated: the web server writes a typed request into its own config directory, and a root-owned systemd path unit turns that narrow signal into the update job. The web process receives no sudo access or new privileges. The root-owned oneshot updater downloads the fixed LessonCue repository and architecture-specific archive, verifies it against the release `SHA256SUMS`, stages a clean application directory, restarts LessonCue, and restores `/opt/lessoncue.previous` if the health endpoint does not recover. Persistent data under `/var/lib/lessoncue` is never replaced by the updater.

The same protected request channel accepts only a strictly validated single-label local hostname. `LocalAddressService` defaults to `lessoncue`, persists the requested value under the LessonCue data directory, and asks the root-owned helper to update Avahi's `host-name` setting and restart Avahi. This changes the mDNS identity used for `.local` resolution without changing the operating-system hostname or granting the web process general configuration access.

### Local pairing PIN

`PairingCodeService` always maintains a random local secret for automatic ten-minute PIN windows. Owners and administrators can replace the rotating value with an exact six-digit fixed PIN through the authenticated local API. The mode preference is written atomically to the protected LessonCue config directory and overrides deployment-time configuration across restarts. Selecting automatic mode writes an explicit override, so an older `appsettings.json` fixed PIN cannot unexpectedly return after reboot.

## Android TV

```bash
gradle -p android-tv :app:testDebugUnitTest :app:assembleDebug
```

The app uses a LEANBACK launcher, Compose focusable surfaces, Media3/ExoPlayer, DataStore credentials, and WorkManager caching. The API client implements discovery, pairing, manifest parsing, and authenticated downloads.

Before managed-store distribution, provision an organization-owned signing key, exercise Fire OS background behavior on each supported model, and complete accessibility/device certification. The included worker persists manifests and media, validates hashes, and reports download health; Media3 `DownloadService` remains an optional scale upgrade for very large fleets.

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
idle/signage → repeating pre-roll at its scheduled time → countdown at start minus duration → lesson at start
```

If a client resumes during the countdown window, it seeks by elapsed countdown time. The final frame therefore remains aligned to the designated start. The synchronized manifest is stored locally so calculation and playback can continue without the server.
When an older lesson has no explicit pre-roll start, clients use 30 minutes before the designated class start.

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

Every pull request runs web, server, Android, and tvOS builds. Tags matching `v*` create self-contained x64/ARM64 Linux packages, a Windows package, an Android APK, and a release-wide SHA-256 checksum file used by the protected updater. Store-signed Android and Apple releases intentionally require organization-owned signing credentials and should use protected GitHub environments.
