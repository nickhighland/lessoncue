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

### Optional Cloudflare Tunnel

`CloudflareTunnelService` stores only the enabled flag and administrator-entered public hostname in LessonCue's normal config tree. A token is accepted as a write-only field and may also be extracted from Cloudflare's complete service-install command. Enabling requires an explicit remote-exposure acknowledgement. The token is atomically written to a mode-0600 pending file and the existing protected root request channel receives only `tunnel:enable`; neither the public API nor audit summary ever returns the credential.

The native installer pre-downloads the pinned official `cloudflared` amd64 or arm64 binary before remote access is enabled. The root helper validates its GitHub-published SHA-256 digest and execution, keeps the verified artifact under `/var/cache/lessoncue`, and atomically installs it under `/usr/local/bin`. `CloudflareTunnelService` requests a protected connector check at startup and every 23 hours; a future LessonCue release can advance the pinned version and digest without trusting `cloudflared`'s self-update path. An active service restarts only after verification, and a failed restart restores the previous executable. Version, check time, and preparation errors are written to a non-secret root result file for Settings.

When enabled, the helper verifies the token shape, creates a non-login `lessoncue-tunnel` account, and moves the credential to `/etc/lessoncue/cloudflare-token` as root with group-read access only for that account. `lessoncue-cloudflared.service` uses `--token-file`, binds its Prometheus endpoint only to `127.0.0.1:60123`, disables connector self-updates, has no capabilities, and enables systemd filesystem, device, kernel, address-family, and executable-memory restrictions. Slow initial edge negotiation no longer disables the unit; systemd and `cloudflared` keep retrying while LessonCue polls connection metrics. Disable stops the unit and removes both the installed and pending credentials while retaining the verified connector cache.

The application polls the loopback metrics endpoint to report active HA connections and prefers the live connector version when available, falling back to the last verified pre-downloaded version while the tunnel is off. Kestrel trusts `X-Forwarded-For` and `X-Forwarded-Proto` only from IPv4 or IPv6 loopback, which lets the local connector produce secure cookies and useful rate-limit addresses without allowing LAN clients to spoof proxy headers. The tunnel's published application route remains remotely managed in the administrator's Cloudflare account and must target the origin URL displayed in Settings. Local addresses and direct LAN playback do not depend on the tunnel.

### Local pairing PIN

`PairingCodeService` always maintains a random local secret for automatic ten-minute PIN windows. Owners and administrators can replace the rotating value with an exact six-digit fixed PIN through the authenticated local API. The mode preference is written atomically to the protected LessonCue config directory and overrides deployment-time configuration across restarts. Selecting automatic mode writes an explicit override, so an older `appsettings.json` fixed PIN cannot unexpectedly return after reboot.

### Local administrator recovery

`AdminRecoveryCommand` runs before the web host is constructed when the server binary receives `--list-admins` or `--reset-password USERNAME`. It opens only the installed SQLite database, applies the idempotent schema upgrade, and uses the same `PasswordHasher<AdminAccount>` and password policy as browser account management. A successful reset increments the account's session version, invalidating its existing cookies, and records an audit event. Native Linux instructions run the command as the restricted `lessoncue` service account; there is no anonymous password-reset HTTP endpoint.

### Account registration and self-service

`AdminAccount` retains the local role and granular-permission model while adding verified-email state. Self-registration is disabled by default and creates only Viewer accounts. The organization selects `closed`, `code`, or `open`; closed mode rejects supplied codes as well as uncoded attempts. Administrator-created accounts remain a fully local path and are marked verified without requiring an email provider.

`AccountToken` stores only a SHA-256 hash of a 256-bit random token, a strict purpose, expiry, use timestamp, and optional pending email. Verification, recovery, and email-change lookups require an exact unused, unexpired purpose match. Their 24-hour, one-hour, and two-hour lifetimes are enforced server-side. Registration codes use 128 random bits and retain only a hash and four-character hint, with optional expiry and use limits plus explicit rotation and revocation.

`AccountEmailService` supports the documented Resend and Brevo HTTP APIs through a bounded named client. Its write-only provider key is protected by the server's persisted ASP.NET Data Protection key ring and stored in the local config tree with user-only Unix permissions; the provider name is bound to the credential so a key cannot silently carry across providers. Local development data is Git-ignored, and production data remains under `/var/lib/lessoncue`.

Cookie sessions use HttpOnly, strict same-site behavior, secure cookies on HTTPS requests, a twelve-hour sliding lifetime, and database-backed session-version validation. Login and account workflows have separate per-address fixed-window limits. Recovery and resend responses are deliberately generic. Username, password, email, role, permission, disabled-state, and recovery changes increment session versions where applicable.

### Granular authorization

`LessonCuePermissions` defines eight stable capability identifiers: `planning.manage`, `uploads.manage`, `playback.control`, `screens.manage`, `users.manage`, `settings.manage`, `backups.manage`, and `updates.manage`. A null `AdminAccount.PermissionsCsv` selects the built-in role preset; a non-null empty string is an intentional custom selection with no management capabilities. Owner evaluation always returns all permissions. Existing pre-v0.17 cookies without the permission-version marker temporarily receive their role preset, avoiding an upgrade lockout, while every new login carries explicit permission claims.

Minimal API route groups apply authorization policies to every corresponding read or mutation. User, backup, update, settings, and audit reads are protected as well as writes; ordinary lesson/media/screen-status reads remain available to authenticated read-only users. The React shell uses the same identifiers to avoid fetching restricted collections and to remove unavailable navigation or controls, but that UI behavior is not a security boundary. Identity, role, permission, status, and password edits increment the session version. Non-owners with user-administration permission cannot grant, modify, or delete owners, cannot grant a capability they do not possess, and must ask another user administrator to change their own role or permission set.

### Local controller command channel

The `/room/{slug}`, `/session/{token}`, and `/universalremote` routes are part of the same React build and cookie-authenticated local administration surface. They post commands to `/api/v1/screens/{screenId}/control`. The server validates lesson/item relationships and the controller scope: room requests must match the screen and lesson class, temporary links must be unexpired and match their class and optional lesson, and universal commands must carry an opaque grant issued after rate-limited PIN validation. Temporary session tokens exist only in memory, expire after at most seven days, and are cleared on restart. The PIN is hashed with ASP.NET Identity's password hasher and is never returned to or retained by the browser; universal grants expire after 12 hours and are revoked whenever the PIN changes or the server restarts.

Accepted commands increment a per-screen command version, persist the latest command in SQLite, and signal connected listeners. Android TV and tvOS establish a baseline cursor when they start and poll the device-authenticated GET form with their last seen version. This prevents an old play command from replaying after an app restart while preserving strict ordering for commands sent during the current session. The channel supports play, pause, resume, stop, previous, next, and absolute seek.

The web manifest starts at `/universalremote` in standalone mode. Class settings generate QR images entirely within the local browser for a room, a particular lesson, or an expiring restricted session. Apple mobile-web-app metadata supports iOS home-screen web clips; Android browsers can add or install the same local page when platform secure-context rules allow it. No phone-specific binary, external QR service, or hosted relay is involved.

### Paired browser playback client

`/player` and `/display` bypass the administrator session shell and load a dedicated React playback client from the same server bundle. Pairing uses the ordinary unauthenticated request/confirm exchange; the resulting screen ID and random device token remain in that browser's local storage. Every manifest, command poll, and heartbeat thereafter uses the same bearer-token checks as the native clients. A baseline control read records the current version without replaying a stale command, after which ordered commands are applied and acknowledged through `TvStatusInput`.

The browser player refreshes manifests independently, retries manifest and control traffic after network loss, estimates browser storage, measures manifest latency, reports runtime codec support, and publishes current item telemetry. The media engine uses range-enabled local URLs, native HTML media timing, a shared audio/visual fade envelope, image timers, and online iframes. A scheduler transitions pre-roll to a duration-aware countdown and then the main lesson using manifest timestamps. The next local item is requested with a browser prefetch hint; unlike the native applications, the browser cannot guarantee or inventory persistent offline storage.

Browser autoplay and fullscreen policies require a real keyboard or pointer gesture. Audible and online cues therefore display a blocking **Start browser playback** action until approved, while HTML media `NotAllowedError` also returns to the same state. Kiosk mode hides setup actions but does not attempt to bypass browser security. Keyboard and common presentation-remote keys map locally to pause/resume, previous, next, restart, stop, and fullscreen without creating administrator control commands.

### Browser preview semantics

The Media Library exposes every ready asset through the server's normal range-enabled URL. Lesson previews layer playlist behavior on top of the raw source: the browser seeks to `startMs`, pauses or loops at `endMs`, updates volume through the fade-in/fade-out windows, and applies the same envelope to a black overlay so video fades visually from and to black. Android TV fades the PlayerView/image layer over a black Compose stage; tvOS applies the same opacity to VideoPlayer/AsyncImage over a black SwiftUI stage. Operator controls and notes remain visible. Online YouTube URLs are converted only to standard embed URLs in the browser; arbitrary webpage previews remain client-side iframe navigation and are never fetched by the LessonCue server.

### Recycling and permanent purge

`LessonClass`, `Lesson`, and `MediaAsset` use global active-record filters over `DeletedAt`. Normal planning, schedule, playback-manifest, media, and controller queries therefore cannot return recycled records. Deleting a class applies one timestamp to the class and its active lessons so a class restore can recover exactly those children without reviving a lesson deleted earlier. Recycled media keeps its database references, original, compatibility derivative, thumbnails, and archived versions, so restore is lossless and its disk use remains visible in storage allocation.

The server-settings policy protects recycle listing, restore, and purge-all endpoints. `MediaRetentionService` also sends automatically expired media to the same bin and runs permanent cleanup hourly for records older than 30 days. Permanent media purge first clears every active or recycled playlist/signage reference and then deletes all stored derivatives and versions.

Every playlist cue exposes the visual editor directly from its lesson row. Filmstrip and waveform derivatives share the selected trim window with the browser preview, while the timeline overlays fade-in and fade-out regions and keeps numeric fields available for exact entry. Saving writes the same trim, fade, marker, volume, and loop fields consumed by both native manifests.

### TV playback compatibility

`MediaProcessingService` probes every local video, including existing ready media first encountered after an upgrade. A file is considered universally native only when it is an MP4 containing 8-bit 4:2:0 H.264 at level 4.2 or lower, no more than 1920 by 1080, and AAC or no audio. Compatible H.264/AAC content in another container is remuxed when possible; all other video is transcoded locally to H.264 High 4.1, `yuv420p`, AAC stereo at 48 kHz, and a maximum 1920-by-1080 frame with MP4 fast-start metadata.

Conversion is written to operating-system temporary storage first, then checked against LessonCue's allocation before installation under `media/compatibility`. The original remains authoritative and is never overwritten. The derivative has an independent SHA-256 checksum and size, is served through the range-enabled `/api/v1/media/{id}/playback` route, and is removed with the asset by retention cleanup. Manifests publish the chosen playback URL, MIME type, extension, checksum, size, and compatibility state. Native caches preserve that extension and provide the MIME type explicitly to ExoPlayer or AVPlayer, avoiding content-sniffing failures from legacy extensionless cache files.

`HardwareAccelerationService` runs a real 64-pixel H.264 Quick Sync probe at startup and every 24 hours on Linux and Windows. It requires FFmpeg's `h264_qsv` encoder plus a working Intel media driver, and exposes its readiness, last use, and last fallback through the administrator bootstrap. The organization setting is enabled by default but only takes effect when the probe passes. Both compatibility and adaptive workers submit an Intel Quick Sync attempt first, validate the resulting H.264 MP4 with FFprobe, remove an invalid or failed temporary result, and retry the complete conversion through `libx264`. The selected engine is stored on each derivative for operator inspection. Remux-only jobs remain codec-copy operations and are validated through the same output policy.

### Media organization and versioning

`MediaAsset` keeps a stable identifier while its current original advances through numbered versions. Folder and normalized tag metadata are searchable in the browser and can be assigned during upload or replaced in bulk. Before replacement, the impact endpoint groups every referencing playlist cue by lesson and template and lists referencing signage. The new original is written to a distinct path, the current original is copied under `media/versions`, and the database change is committed before the now-unreferenced current path is removed. If file preparation or database persistence fails, new and archived candidates are removed while the current database and original remain untouched.

`MediaAssetVersion` stores the archived original's filename, type, checksum, size, source details, actor, and version number. Restoring history copies the selected original into a new current version and archives the displaced current original, so restoration never rewrites history. Replacement and restoration increment affected lesson manifest versions and trigger SignalR invalidation. Reprocessing clears derived metadata and queues the existing original through the normal FFprobe/FFmpeg worker. Storage accounting includes version files, and retention deletion removes the current original, derivatives, and all archived originals together.

### Bulk planning and media operations

The browser keeps selections explicit within the current class, playlist, or filtered media view. Lesson actions archive, restore, move to another class, shift every date and scheduled timestamp by a bounded day count, add a title prefix, or delete the selected records. Moving or manually shifting a generated occurrence detaches it from its recurring schedule so a later generator pass cannot overwrite the administrator's decision. A shift also extends lesson-scoped media retention when the new date is later.

Playlist actions set role, volume, end behavior, skip permission, or a title prefix, or remove selected cues while leaving their library assets intact. Countdown assignment remains singular and role changes normalize the lesson's pre-roll and countdown state. Media actions add a filename prefix while preserving file extensions, replace folder and tags, change retention, or delete the complete asset graph. The three bulk endpoints reject missing records instead of partially applying a stale selection, cap a request at 500 records, save as one transaction, audit the operation, and invalidate every affected screen manifest.

### Fully local document conversion

`PresentationConversionService` resumes both pending and interrupted conversion jobs. PDF sources go directly to Poppler; PPTX, ODP, and DOCX sources first pass through a per-job isolated headless LibreOffice profile. Poppler preflights a maximum of 500 pages and rasterizes each page into a PNG whose longest dimension is at most 1920 pixels in an operating-system temporary directory. Each converter process has a ten-minute safety limit. LessonCue checks the complete output size against its configured allocation before moving any slide into persistent media storage. All child assets are SHA-256 identified, tagged as `presentation-slide`, organized beneath the source folder, and inherit the source retention policy.

The source stores only the ordered identifiers for its latest conversion. Older generated slides remain ordinary media when a source is converted again, which prevents an existing lesson from breaking. Adding a conversion to a lesson resolves every child ID first, appends all pages in order with a configurable 1–3600 second duration, extends lesson-scoped retention, increments the manifest version, audits the operation, and invalidates screen manifests. A conversion failure removes partially installed files, detaches uncommitted rows, records a concise local error, and leaves the source document intact.

### Reusable templates and recurring lessons

`LessonTemplate` and `LessonTemplateItem` are independent snapshots rather than pointers to a source lesson. They preserve ordered cue roles, media identity, trims, fades, volume, looping, notes, cue markers, image duration, designated local start time, pre-roll lead, availability/expiration offsets, download policy, and offline behavior. Creating or refreshing a template promotes referenced lesson-scoped media to permanent retention; this prevents a reusable structure from silently losing content after the original lesson's four-week window. Refreshing replaces the structure transactionally while retaining the template ID, name, description, and linked schedules. Existing generated lessons remain immutable copies.

`RecurringLessonSchedule` supports weekly recurrence with a 1–52 week interval, monthly recurrence with invalid calendar days skipped, bounded terms through start/end dates, and explicit custom dates. Title patterns accept `{template}`, `{class}`, and `{date}`. Local start times are resolved through the organization's IANA time zone on each occurrence, so the correct UTC offset is selected across daylight-saving boundaries. A unique `(GeneratedByScheduleId, Date)` database index and a process-wide generation lock make manual, startup, and daily runs idempotent. The hosted generator materializes the administrator-selected look-ahead window once per day and broadcasts manifest invalidation when it creates lessons.

Exception dates are stored explicitly on the schedule. Adding an exception removes only the matching generated occurrence and leaves hand-built lessons untouched; removing an exception regenerates the missing occurrence when the schedule is enabled. Pausing or deleting a schedule never removes already-generated lessons. Template instantiation and schedule generation extend retention where needed, write audit events, and clone countdown identity to the new playlist item ID.

## Android TV

TV players post backward-compatible structured diagnostics with the existing `/api/v1/tv/status` heartbeat: cache inventory, pending/failed downloads, decoder capabilities, recent errors, client wall-clock time, and measured request latency. The server bounds every collection and string before storing it. Screen administrators can opt an individual player into screenshot diagnostics; a one-time request is delivered through the device command poll and expires after 60 seconds. Native clients visibly announce the capture, upload a validated image over their paired-device bearer credential, and the server cleanup service removes it after 24 hours.

```bash
gradle -p android-tv \
  :app:testDebugUnitTest \
  :app:lintDebug \
  :app:assembleDebug \
  :app:assembleDebugAndroidTest
```

The app uses a LEANBACK launcher, Compose focusable surfaces, Media3/ExoPlayer, DataStore credentials, and WorkManager caching. The API client implements discovery, pairing, manifest parsing, and authenticated downloads. Its lesson-detail route combines pre-roll, countdown, and normal cues in one D-pad focus list; focus changes explicitly bring rows into view so a remote can scroll beyond the visible screen before starting any cue.

Tagged GitHub releases require an organization-owned Android signing key and deliberately fail instead of publishing an unsigned or unexpectedly signed production APK. Configure these GitHub Actions secrets:

- `ANDROID_SIGNING_KEY_BASE64`: the existing JKS or PKCS12 keystore, base64 encoded as one line.
- `ANDROID_SIGNING_KEYSTORE_PASSWORD`
- `ANDROID_SIGNING_KEY_ALIAS`
- `ANDROID_SIGNING_KEY_PASSWORD`
- `ANDROID_SIGNING_CERT_SHA256`: the signing certificate SHA-256 fingerprint. Colons and letter case are ignored.

Keep an offline backup of the keystore and passwords. Losing or replacing the key prevents installed TVs from accepting future in-place updates. Never commit the keystore or passwords. The workflow publishes the signed `lessoncue-tv.apk` and `LessonCue-AndroidTV-debug.apk` together; both have stable URLs beneath `/releases/latest/download/`.

The production identity established for `org.lessoncue.tv` has signing-certificate SHA-256 fingerprint `E875F8F9F4E80494DF1658D5E59662BE1048D7CD5D53DB2131103051352F64AE`. Treat any production APK with a different fingerprint as invalid.

The sideload build checks the public release manifest after startup, exposes a manual remote-friendly check in the lesson library, downloads into app-private cache, independently validates the manifest hash, package ID, higher version code, and compatible signing history, and commits only a verified APK through Android's official `PackageInstaller`. See [android-tv-updater.md](android-tv-updater.md) for configuration, schema, release operations, permission handling, rollback, and the physical-device acceptance matrix.

Before managed-store distribution, exercise Fire OS background behavior on each supported model and complete accessibility/device certification. The included worker persists manifests and media, validates hashes, and reports download health; Media3 `DownloadService` remains an optional scale upgrade for very large fleets.

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
