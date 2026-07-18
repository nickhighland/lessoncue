# LessonCue

LessonCue is a self-hosted lesson scheduling and television playback system for schools, churches, training programs, and other learning organizations. Administrators build dated media playlists in a browser; paired Android TV, Fire TV, and Apple TV clients cache their assignments and keep playing when the network is unavailable.

[Installation guide](docs/installation.md) · [Accounts and registration](docs/account-self-service.md) · [Browser player](docs/browser-player.md) · [Implementation guide](docs/implementation.md) · [Feature roadmap](docs/feature-roadmap.md) · [Protocol](protocol/openapi.yaml)

## What is included

- A complete, responsive React/TypeScript administration interface served directly by the local server, visually matched to the LessonCue prototype.
- An ASP.NET Core 10 API with SQLite, pairing, manifests, health reporting, SignalR invalidation, and range-enabled media hosting.
- A native Android TV/Fire TV application using Kotlin, Compose for TV, Media3, DataStore, and WorkManager.
- A native tvOS application using SwiftUI, AVKit, Bonjour discovery declarations, and persistent offline manifests.
- A paired full-screen browser client for Windows, macOS, Linux, ChromeOS, computers, and projectors, using the same local manifests, controller commands, acknowledgements, heartbeats, scheduling, and diagnostics as the native TV clients.
- A versioned OpenAPI contract and JSON Schema shared by every client.
- Docker, Windows, and Linux installation assets.
- Calendar, local role-based users, scheduled/emergency signage, rotating pairing codes, screen tags, audit history, and downloadable full/configuration backups with validated browser restore and an automatic pre-restore safety backup.
- Direct lesson uploads, online webpages, embedded YouTube playback, queued local YouTube imports, reusable or four-week lesson retention, automatic cleanup, resumable large uploads, SHA-256 deduplication, FFprobe metadata, FFmpeg thumbnails, and range-enabled delivery. Uploaded video is audited automatically and, when necessary, converted locally to a TV-safe H.264/AAC MP4 while preserving the original.
- Multi-file uploads from lessons and the Media Library; bulk lesson archive, restore, class move, date/time shift, rename, and deletion; bulk playlist role, volume, ending, skip, rename, and removal; and Media Library bulk rename, folder/tag organization, retention, and safe deletion. Every retention date can also be edited directly from its table row.
- Searchable media folders and tags, upload-time and bulk organization, lesson/signage impact previews, local reprocessing, and safe file replacement behind a stable media ID with downloadable and restorable original-version history.
- Fully local PDF, PowerPoint, OpenDocument Presentation, and Word conversion into ordered, screen-ready PNG slide sequences, with configurable timing and one-step lesson insertion; Keynote is supported through its PDF export.
- Reusable lesson templates that preserve complete playlist and timing structure, one-click dated instantiation, and automatic weekly, biweekly, monthly, term, or custom-date schedules with idempotent generation and reversible holiday exceptions.
- Daily release checks, administrator alerts, protected one-click Linux updates with health-check rollback, and administrator-controlled storage allocation with uploader-visible capacity.
- A locally configurable six-digit pairing PIN, with a choice between a persistent administrator-set PIN and automatic ten-minute rotation.
- Automatic `lessoncue.local` setup on native Linux, with an administrator-configurable `.local` browser name and numeric-IP fallback.
- Optional Cloudflare Tunnel remote access through an administrator-owned hostname, with a write-only token, checksum-verified connector installation, a restricted local service account, active edge-connection status, safe disable/credential removal, and strong Cloudflare Access guidance. Local-only operation remains the default.
- Local administrator password recovery over SSH, including username listing, audited resets, and existing-session invalidation.
- Administrator user management with editable names, usernames, email addresses, roles, and passwords, plus pause/reactivate and protected account deletion.
- Granular per-user permissions for lesson planning, media uploads, live playback, screen administration, user administration, server settings, backups, and software updates. Built-in roles supply safe defaults, while owners can grant an exact custom combination.
- Local interface branding with independent navigation background, navigation text, selected-tab, and accent colors.
- Browser previews for every ready media item, including playlist trim points, synchronized audio-and-picture fades to/from black, volume, looping, and operator notes.
- A prominent **Edit visual timeline, trims & fades** action on every lesson cue, with locally generated video filmstrips and audio waveforms, visible fade regions, 0.04-second trim nudging, selection preview, and numeric controls as a fallback.
- A remote-friendly media browser in both native TV apps: choose a lesson, scroll through pre-roll, countdown, and lesson cues with the directional pad, and start any item without returning to the local browser.
- A full-screen local browser/projector player at `/player`, with secure TV-style pairing, phone control, scheduled pre-roll and countdown transitions, autoplay guidance, reconnection, next-item prefetching, keyboard and presentation-remote controls, and a kiosk-friendly startup URL.
- Actionable screen diagnostics with per-file cache and queue detail, decoder capabilities, download and playback errors, local-network latency, clock drift, and freshness. Optional screenshots are disabled per screen by default, visibly announced on the TV, valid for one request and 60 seconds, restricted to screen administrators, and deleted automatically after 24 hours.
- A phone-first local controller for selecting screens, lessons, and individual media, with play, pause, resume, previous, next, stop, and seek controls; actual playback state, progress, errors, and command acknowledgement arrive live from the TV and the controller can be saved to an iPhone, iPad, or Android home screen.
- Dedicated classroom controller paths with unique colors and optional public hostnames; locally generated room or lesson QR codes; expiring restricted substitute/event links; and a separately PIN-protected universal remote.
- Editable and removable classrooms plus an administrator-only recycling bin: deleted classes, lessons, and media remain restorable for 30 days, keep their relationships and files intact, and can be purged immediately when recovery is not needed.
- GitHub Actions that build the web app, server, Android APK, tvOS app, release packages, and GitHub Pages documentation.

## Quick start

For a headless Ubuntu or Debian server accessed over SSH, use the complete copy-and-paste block in the [installation guide](docs/installation.md#recommended-headless-ubuntu-or-debian-server-over-ssh).

For a quick Docker evaluation:

```bash
cp .env.example .env
docker compose up -d --build
```

Then open `http://localhost`. Native Linux installations automatically configure the preferred local-network address `http://lessoncue.local`; administrators can change both the name and HTTP port in Settings.

For browser-interface development:

```bash
npm ci
npm run build:admin
LESSONCUE_HTTP_PORT=8080 dotnet run --project server/LessonCue.Server
```

Open `http://localhost:8080`. For live front-end development, run `npm run dev:admin` in a second terminal and open `http://localhost:5173`.

For native development and production installation, see [docs/installation.md](docs/installation.md). The server API is independently runnable with `dotnet run --project server/LessonCue.Server`.

## Scheduled playback modes

LessonCue publishes two coordinated pre-class modes in every screen manifest:

1. **Pre-roll** — a sequence of videos or images loops until the countdown window begins.
2. **Duration-aware countdown** — the chosen countdown video starts exactly one video-duration before the lesson's designated start time, so its final frame lands on the start time.

If the countdown duration is five minutes and class begins at 09:00, the TV transitions from pre-roll to countdown at 08:55. Clients calculate this locally from the manifest, so an already-synchronized screen can make the transition while offline.

## Templates and recurring schedules

Open **Templates** to capture any existing lesson as a reusable structure. LessonCue copies playlist order, media links, roles, trims, fades, cue markers, notes, pre-roll and countdown settings, start-time offsets, availability, and offline defaults. Media referenced by a template is changed to permanent retention so a future generated lesson cannot lose its source. A template can create one dated lesson immediately, and its structure can later be refreshed from a newer lesson without changing its schedules or previously generated lessons.

Recurring schedules support weekly or multi-week intervals, monthly dates, bounded terms, and explicit custom dates. Each schedule generates ahead by an administrator-selected window and the local server checks enabled schedules once per day. Generation is idempotent: a schedule/date pair is created at most once even after restarts or manual reruns. Adding a holiday or skipped date removes only that schedule's generated lesson; restoring the date safely regenerates it. Pausing or deleting a schedule preserves lessons already created.

## Media retention

Every file upload asks how it should be stored. **For a lesson** is the default and automatically deletes the file four weeks after the latest lesson that uses it. **Keep permanently** places reusable material in the media library until an administrator removes it. Playlist history remains intact when an expired file is cleaned up.

Lesson pages and the Media Library also accept webpages and YouTube URLs. Android TV and Fire TV render webpages and the embedded YouTube player while online. A YouTube URL can instead be queued as a local MP4 import and then uses the same four-week or permanent retention policy as an upload; only import video you are authorized to copy. Apple TV plays the downloaded local copy because tvOS does not provide the web-view surface used by the Android client.

LessonCue inspects every uploaded video in the background. MP4/H.264/AAC files that meet the common TV profile are used directly. Other containers, codecs, pixel formats, oversized frames, or unsupported H.264 levels receive a local H.264 High 4.1, 8-bit 4:2:0, AAC, 1080p-or-smaller playback copy. The original remains available for future reprocessing, and the Media Library shows whether the item is already TV-ready, is making its TV copy, or needs attention. Existing videos are audited automatically after upgrading.

Adaptive playback can additionally cache reusable 720p and 480p H.264/AAC copies. Each paired screen receives the best ready profile for its reported decoder support, measured network quality, and free device storage; the universal 1080p copy remains the fallback until the smaller copy is ready. **Settings → Adaptive TV playback** controls automatic pre-generation one to thirty days before assigned lessons, while **Media Library → Manage versions & impact** shows size, progress, failures, retry controls, and manual generation for both profiles. All conversion stays on the self-hosted server and counts toward its configured storage allocation.

On Intel Linux and Windows servers, LessonCue checks FFmpeg and the installed Intel GPU driver with a real local Quick Sync encode at startup and once per day. When available, Intel Quick Sync accelerates both the universal TV-safe copy and adaptive 720p/480p queues. Administrators can disable it or recheck the hardware under **Settings → Adaptive TV playback**. Every generated file is probed as H.264 MP4 before it is installed; a hardware error automatically retries the same job with software and is reported in Settings.

## Updates and storage

Native Linux installations check for a new LessonCue release once per day. Owners and administrators can check immediately and install an available update from **Settings → Software updates**. The protected updater verifies the published checksum, restarts the server, performs a health check, and restores the previous application version if the new one cannot start. Existing servers must run the current SSH installer once to add this updater; later releases can be installed from the browser.

Native Linux also advertises `http://lessoncue.local` automatically. Owners and administrators can choose a different single-label `.local` name or HTTP port under **Settings → Connection & pairing** without changing the computer's Linux or SSH hostname. Port 80 is the default, so it does not need to appear in the address.

Owners and administrators can choose an explicit LessonCue storage allocation or let it follow safely available disk space. LessonCue preserves a 512 MB operating-system reserve, rejects uploads that exceed the allocation, and shows remaining upload capacity to every user who has upload access.

## Roles and granular permissions

Open **Users**, create or edit an account, and enable **Customize this role** to choose its exact capabilities. Owners and Administrators default to all eight capabilities; Editors default to lesson planning, uploads, and live playback; Viewers default to read-only access. A custom empty selection intentionally grants no management actions. Owners always retain every capability, and only an owner can create, edit, or delete another owner.

Permission checks run on the local server, not only in the browser. Restricted navigation and controls are hidden, direct API attempts return HTTP 403, pairing PINs are withheld from accounts without screen or settings authority, and changing identity, role, permissions, status, or password invalidates older sessions.

## Preview and cellphone control

Select **Preview** on any ready item in the Media Library, or use the preview row on a lesson playlist. Video previews reproduce the saved start/end trims and fade both picture and audio from/to black; audio previews apply the same volume envelope. Loop behavior and notes are also preserved. Images, PDFs, online webpages, and YouTube embeds preview in the same local interface; presentation files provide a local open action when the browser cannot render the format directly.

On a lesson page, choose **Edit visual timeline, trims & fades** beneath a cue. The visual editor is part of the cue row rather than a separate application or settings page. It displays the filmstrip or waveform, current selection, and fade-in/fade-out regions and saves those values into the TV manifest.

On a phone connected to the same trusted network, open a class's **Controller link** from the Classes page, scan its locally generated QR code, and sign in with a LessonCue account that has live-playback permission. The address uses `/room/class-name`; administrators can set its path, color, and optional Cloudflare hostname, point its QR code at a particular lesson, or create a class/lesson-restricted link that expires in 15 minutes to seven days. Temporary links are deliberately cleared by a server restart. Room scope is validated again by the server for every playback command.

The controller for all classrooms is `http://lessoncue.local/universalremote` (or the server's numeric IP). An administrator must set its separate six-digit PIN in **Settings → Universal controller**. Select a paired screen and lesson, then start the complete sequence or a particular media item. Commands are versioned and stored on the local server, so a short Wi-Fi interruption does not reorder them; the controller distinguishes a command that was sent from one the TV has acknowledged. Actual title, player state, elapsed time, duration, and playback errors update through the local SignalR connection with automatic polling fallback.

The **Screens** page provides the same live operational evidence for administrators: device and operating-system version, last network address, free space, manifest version, command acknowledgement, cached/total item count, and recent download or playback errors. No screen diagnostics are sent outside the self-hosted server.

To save it like an app, use **Share → Add to Home Screen** in Safari on iPhone/iPad, or **Add to Home screen** / **Install app** from the Android browser menu. The controller remains a local web interface—there is no separate phone app or hosted dependency.

## Repository map

```text
web-admin/           Local React administration interface
server/              ASP.NET Core API and tests
android-tv/          Android TV and Fire TV client
tvos/                Apple TV client and shared Swift protocol package
protocol/            OpenAPI, manifest schema, and behavioral rules
installers/          Linux and Windows service installers
docker/              Container support files
docs/                Operator and developer documentation
github-pages/        Public project documentation site
```

## Project status

The complete self-hosted workflow runs on the local server: setup, local or verified self-service accounts, roles and permissions, registration codes, password recovery, classes, calendar, lesson playlists, resumable media ingestion, signage, pre-roll, duration-aware countdown, rotating PIN pairing, screen assignment/health, branding, audit history, and backups. Android/Fire TV and tvOS clients build from this repository and retain offline manifests and media. Hardware signing, managed-store submission, and final device certification require the deploying organization's accounts and target devices.

## License

LessonCue is provided under the [MIT License](LICENSE).
