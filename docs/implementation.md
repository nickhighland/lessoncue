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
- `LESSONCUE_HTTP_PORT` — deployment-time HTTP listener fallback; default 80. A saved administrator choice takes precedence.
- `LESSONCUE_SERVER_NAME` — discovery display name.
- `ASPNETCORE_URLS` — optional standard ASP.NET listener override.

SQLite is created with `EnsureCreated`; an idempotent appliance upgrader brings v0.1/v0.2 databases forward without requiring an SDK or migration CLI on the server. Every schema change must remain safe against a copied production database.

### Implemented API path

The server includes local setup and role-based cookie login, same-origin mutation protection, CSP/security headers, classes and lessons, playlist editing/reordering/duplication/archiving, resumable and duplicate-aware uploads, FFprobe/FFmpeg background inspection, online media classification, queued YouTube imports, browser media/effect previews, screen tags/assignment/revocation, a phone-first playback controller, scheduled and emergency signage, configuration/full backup archives, range-enabled media delivery, rotating rate-limited PIN pairing, hashed device credentials, authenticated screen manifests, status telemetry, audit events, and SignalR invalidation.

Arbitrary webpage links are never fetched by the server. Direct files, YouTube embeds, and webpage destinations are classified from their URL. An explicit administrator-selected YouTube import is the sole server-side online fetch: it accepts exact YouTube domains, invokes the bundled `yt-dlp` executable without a shell or user-controlled arguments, disables playlists and configuration files, limits output to the remaining storage allocation, and requests a single MP4. Successful imports pass through the normal FFprobe/FFmpeg pipeline and retention system. Webpages and embedded players remain online-only.

### Storage enforcement

`StorageService` measures the complete persistent data tree rather than trusting database media sizes, so originals, derivatives, thumbnails, databases, backups, and temporary upload chunks all count toward the allocation. A zero organization limit means automatic allocation: current usage plus disk space safely available after a 512 MB operating-system reserve. Every multipart upload, resumable-upload session, and chunk write performs a server-side capacity check and returns HTTP 507 when the request would exceed the remaining allocation.

### Protected native updates

`UpdateService` checks the public GitHub latest-release endpoint after startup and once per day. It only discovers versions as the unprivileged, sandboxed `lessoncue` service account. Installation is deliberately separated: the web server writes a typed request into its own config directory, and a root-owned systemd path unit turns that narrow signal into the update job. The web process receives no sudo access or new privileges. The root-owned oneshot updater downloads the fixed LessonCue repository and architecture-specific archive, verifies it against the release `SHA256SUMS`, stages a clean application directory, restarts LessonCue, and restores `/opt/lessoncue.previous` if the health endpoint does not recover. Persistent data under `/var/lib/lessoncue` is never replaced by the updater.

The same protected request channel accepts a strictly validated single-label local hostname or HTTP port. `LocalAddressService` defaults to `lessoncue`; `HttpPortService` defaults new installations to port 80. Both persist the requested value under the LessonCue data directory and ask the root-owned helper to update Avahi, the firewall, and the listener before restarting the affected service. The systemd unit grants only `CAP_NET_BIND_SERVICE`, which lets the restricted LessonCue account bind port 80 without granting root access. A failed port health check restores the previous port automatically.

### Local pairing PIN

`PairingCodeService` always maintains a random local secret for automatic ten-minute PIN windows. Owners and administrators can replace the rotating value with an exact six-digit fixed PIN through the authenticated local API. The mode preference is written atomically to the protected LessonCue config directory and overrides deployment-time configuration across restarts. Selecting automatic mode writes an explicit override, so an older `appsettings.json` fixed PIN cannot unexpectedly return after reboot.

### Local administrator recovery

`AdminRecoveryCommand` runs before the web host is constructed when the server binary receives `--list-admins` or `--reset-password USERNAME`. It opens only the installed SQLite database, applies the idempotent schema upgrade, and uses the same `PasswordHasher<AdminAccount>` and password policy as browser account management. A successful reset increments the account's session version, invalidating its existing cookies, and records an audit event. Native Linux instructions run the command as the restricted `lessoncue` service account; there is no anonymous password-reset HTTP endpoint.

### Granular authorization

`LessonCuePermissions` defines eight stable capability identifiers: `planning.manage`, `uploads.manage`, `playback.control`, `screens.manage`, `users.manage`, `settings.manage`, `backups.manage`, and `updates.manage`. A null `AdminAccount.PermissionsCsv` selects the built-in role preset; a non-null empty string is an intentional custom selection with no management capabilities. Owner evaluation always returns all permissions. Existing pre-v0.17 cookies without the permission-version marker temporarily receive their role preset, avoiding an upgrade lockout, while every new login carries explicit permission claims.

Minimal API route groups apply authorization policies to every corresponding read or mutation. User, backup, update, settings, and audit reads are protected as well as writes; ordinary lesson/media/screen-status reads remain available to authenticated read-only users. The React shell uses the same identifiers to avoid fetching restricted collections and to remove unavailable navigation or controls, but that UI behavior is not a security boundary. Identity, role, permission, status, and password edits increment the session version. Non-owners with user-administration permission cannot grant, modify, or delete owners, cannot grant a capability they do not possess, and must ask another user administrator to change their own role or permission set.

### Local controller command channel

The `/controller` route is part of the same React build and cookie-authenticated local administration surface. It posts commands to `/api/v1/screens/{screenId}/control`. The server validates lesson/item relationships, increments a per-screen command version, persists the latest command in SQLite, and signals connected listeners. Android TV and tvOS establish a baseline cursor when they start and poll the device-authenticated GET form with their last seen version. This prevents an old play command from replaying after an app restart while preserving strict ordering for commands sent during the current session. The channel supports play, pause, resume, stop, previous, next, and absolute seek.

The web manifest starts at `/controller` in standalone mode. Apple mobile-web-app metadata supports iOS home-screen web clips; Android browsers can add or install the same local page when platform secure-context rules allow it. No phone-specific binary or hosted relay is involved.

### Browser preview semantics

The Media Library exposes every ready asset through the server's normal range-enabled URL. Lesson previews layer playlist behavior on top of the raw source: the browser seeks to `startMs`, pauses or loops at `endMs`, updates volume through the fade-in/fade-out windows, applies the stored volume ceiling, and overlays operator notes. Online YouTube URLs are converted only to standard embed URLs in the browser; arbitrary webpage previews remain client-side iframe navigation and are never fetched by the LessonCue server.

Every playlist cue exposes the visual editor directly from its lesson row. Filmstrip and waveform derivatives share the selected trim window with the browser preview, while the timeline overlays fade-in and fade-out regions and keeps numeric fields available for exact entry. Saving writes the same trim, fade, marker, volume, and loop fields consumed by both native manifests.

### TV playback compatibility

`MediaProcessingService` probes every local video, including existing ready media first encountered after an upgrade. A file is considered universally native only when it is an MP4 containing 8-bit 4:2:0 H.264 at level 4.2 or lower, no more than 1920 by 1080, and AAC or no audio. Compatible H.264/AAC content in another container is remuxed when possible; all other video is transcoded locally to H.264 High 4.1, `yuv420p`, AAC stereo at 48 kHz, and a maximum 1920-by-1080 frame with MP4 fast-start metadata.

Conversion is written to operating-system temporary storage first, then checked against LessonCue's allocation before installation under `media/compatibility`. The original remains authoritative and is never overwritten. The derivative has an independent SHA-256 checksum and size, is served through the range-enabled `/api/v1/media/{id}/playback` route, and is removed with the asset by retention cleanup. Manifests publish the chosen playback URL, MIME type, extension, checksum, size, and compatibility state. Native caches preserve that extension and provide the MIME type explicitly to ExoPlayer or AVPlayer, avoiding content-sniffing failures from legacy extensionless cache files.

### Media organization and versioning

`MediaAsset` keeps a stable identifier while its current original advances through numbered versions. Folder and normalized tag metadata are searchable in the browser and can be assigned during upload or replaced in bulk. Before replacement, the impact endpoint groups every referencing playlist cue by lesson and template and lists referencing signage. The new original is written to a distinct path, the current original is copied under `media/versions`, and the database change is committed before the now-unreferenced current path is removed. If file preparation or database persistence fails, new and archived candidates are removed while the current database and original remain untouched.

`MediaAssetVersion` stores the archived original's filename, type, checksum, size, source details, actor, and version number. Restoring history copies the selected original into a new current version and archives the displaced current original, so restoration never rewrites history. Replacement and restoration increment affected lesson manifest versions and trigger SignalR invalidation. Reprocessing clears derived metadata and queues the existing original through the normal FFprobe/FFmpeg worker. Storage accounting includes version files, and retention deletion removes the current original, derivatives, and all archived originals together.

### Fully local document conversion

`PresentationConversionService` resumes both pending and interrupted conversion jobs. PDF sources go directly to Poppler; PPTX, ODP, and DOCX sources first pass through a per-job isolated headless LibreOffice profile. Poppler preflights a maximum of 500 pages and rasterizes each page into a PNG whose longest dimension is at most 1920 pixels in an operating-system temporary directory. Each converter process has a ten-minute safety limit. LessonCue checks the complete output size against its configured allocation before moving any slide into persistent media storage. All child assets are SHA-256 identified, tagged as `presentation-slide`, organized beneath the source folder, and inherit the source retention policy.

The source stores only the ordered identifiers for its latest conversion. Older generated slides remain ordinary media when a source is converted again, which prevents an existing lesson from breaking. Adding a conversion to a lesson resolves every child ID first, appends all pages in order with a configurable 1–3600 second duration, extends lesson-scoped retention, increments the manifest version, audits the operation, and invalidates screen manifests. A conversion failure removes partially installed files, detaches uncommitted rows, records a concise local error, and leaves the source document intact.

### Reusable templates and recurring lessons

`LessonTemplate` and `LessonTemplateItem` are independent snapshots rather than pointers to a source lesson. They preserve ordered cue roles, media identity, trims, fades, volume, looping, notes, cue markers, image duration, designated local start time, pre-roll lead, availability/expiration offsets, download policy, and offline behavior. Creating or refreshing a template promotes referenced lesson-scoped media to permanent retention; this prevents a reusable structure from silently losing content after the original lesson's four-week window. Refreshing replaces the structure transactionally while retaining the template ID, name, description, and linked schedules. Existing generated lessons remain immutable copies.

`RecurringLessonSchedule` supports weekly recurrence with a 1–52 week interval, monthly recurrence with invalid calendar days skipped, bounded terms through start/end dates, and explicit custom dates. Title patterns accept `{template}`, `{class}`, and `{date}`. Local start times are resolved through the organization's IANA time zone on each occurrence, so the correct UTC offset is selected across daylight-saving boundaries. A unique `(GeneratedByScheduleId, Date)` database index and a process-wide generation lock make manual, startup, and daily runs idempotent. The hosted generator materializes the administrator-selected look-ahead window once per day and broadcasts manifest invalidation when it creates lessons.

Exception dates are stored explicitly on the schedule. Adding an exception removes only the matching generated occurrence and leaves hand-built lessons untouched; removing an exception regenerates the missing occurrence when the schedule is enabled. Pausing or deleting a schedule never removes already-generated lessons. Template instantiation and schedule generation extend retention where needed, write audit events, and clone countdown identity to the new playlist item ID.

## Android TV

```bash
gradle -p android-tv :app:testDebugUnitTest :app:assembleDebug
```

The app uses a LEANBACK launcher, Compose focusable surfaces, Media3/ExoPlayer, DataStore credentials, and WorkManager caching. The API client implements discovery, pairing, manifest parsing, and authenticated downloads. Its lesson-detail route combines pre-roll, countdown, and normal cues in one D-pad focus list; focus changes explicitly bring rows into view so a remote can scroll beyond the visible screen before starting any cue.

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

The tvOS client uses Bonjour, Keychain device credentials, AVPlayer, an actor-isolated offline cache, checksum verification, and the shared schedule semantics. Its lesson-detail route combines pre-roll, countdown, and normal cues in a focus-tracked `ScrollViewReader`, allowing the Siri Remote to scroll and select every item. Background URLSession identifiers and App Store signing must be supplied by the deployment team.

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
