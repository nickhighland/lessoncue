# LessonCue

LessonCue is a self-hosted lesson scheduling and television playback system for schools, churches, training programs, and other learning organizations. Administrators build dated media playlists in a browser; paired Android TV, Fire TV, and Apple TV clients cache their assignments and keep playing when the network is unavailable.

[Installation guide](docs/installation.md) · [Implementation guide](docs/implementation.md) · [Feature roadmap](docs/feature-roadmap.md) · [Protocol](protocol/openapi.yaml)

## What is included

- A complete, responsive React/TypeScript administration interface served directly by the local server, visually matched to the LessonCue prototype.
- An ASP.NET Core 10 API with SQLite, pairing, manifests, health reporting, SignalR invalidation, and range-enabled media hosting.
- A native Android TV/Fire TV application using Kotlin, Compose for TV, Media3, DataStore, and WorkManager.
- A native tvOS application using SwiftUI, AVKit, Bonjour discovery declarations, and persistent offline manifests.
- A versioned OpenAPI contract and JSON Schema shared by every client.
- Docker, Windows, and Linux installation assets.
- Calendar, local role-based users, scheduled/emergency signage, rotating pairing codes, screen tags, audit history, and downloadable full/configuration backups.
- Direct lesson uploads, online webpages, embedded YouTube playback, queued local YouTube imports, reusable or four-week lesson retention, automatic cleanup, resumable large uploads, SHA-256 deduplication, FFprobe metadata, FFmpeg thumbnails, codec readiness, and range-enabled delivery.
- Media Library selection and bulk actions for safe deletion, an explicit selectable expiration date, or permanent retention; every retention date can also be edited directly from its table row.
- Daily release checks, administrator alerts, protected one-click Linux updates with health-check rollback, and administrator-controlled storage allocation with uploader-visible capacity.
- A locally configurable six-digit pairing PIN, with a choice between a persistent administrator-set PIN and automatic ten-minute rotation.
- Automatic `lessoncue.local` setup on native Linux, with an administrator-configurable `.local` browser name and numeric-IP fallback.
- Local administrator password recovery over SSH, including username listing, audited resets, and existing-session invalidation.
- Administrator user management with editable names, usernames, email addresses, roles, and passwords, plus pause/reactivate and protected account deletion.
- Local interface branding with independent navigation background, navigation text, selected-tab, and accent colors.
- Browser previews for every ready media item, including playlist trim points, fades, volume, looping, and operator notes.
- A phone-first local controller for selecting screens, lessons, and individual media, with play, pause, resume, previous, next, stop, and seek controls; it can be saved to an iPhone, iPad, or Android home screen.
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

## Media retention

Every file upload asks how it should be stored. **For a lesson** is the default and automatically deletes the file four weeks after the latest lesson that uses it. **Keep permanently** places reusable material in the media library until an administrator removes it. Playlist history remains intact when an expired file is cleaned up.

Lesson pages and the Media Library also accept webpages and YouTube URLs. Android TV and Fire TV render webpages and the embedded YouTube player while online. A YouTube URL can instead be queued as a local MP4 import and then uses the same four-week or permanent retention policy as an upload; only import video you are authorized to copy. Apple TV plays the downloaded local copy because tvOS does not provide the web-view surface used by the Android client.

## Updates and storage

Native Linux installations check for a new LessonCue release once per day. Owners and administrators can check immediately and install an available update from **Settings → Software updates**. The protected updater verifies the published checksum, restarts the server, performs a health check, and restores the previous application version if the new one cannot start. Existing servers must run the current SSH installer once to add this updater; later releases can be installed from the browser.

Native Linux also advertises `http://lessoncue.local` automatically. Owners and administrators can choose a different single-label `.local` name or HTTP port under **Settings → Connection & pairing** without changing the computer's Linux or SSH hostname. Port 80 is the default, so it does not need to appear in the address.

Owners and administrators can choose an explicit LessonCue storage allocation or let it follow safely available disk space. LessonCue preserves a 512 MB operating-system reserve, rejects uploads that exceed the allocation, and shows remaining upload capacity to every user who has upload access.

## Preview and cellphone control

Select **Preview** on any ready item in the Media Library, or use the preview row on a lesson playlist. Video and audio previews reproduce the saved start/end trims, fade-in and fade-out, volume, loop behavior, and notes. Images, PDFs, online webpages, and YouTube embeds preview in the same local interface; presentation files provide a local open action when the browser cannot render the format directly.

On a phone connected to the same trusted network, open `http://lessoncue.local/controller` (or replace the hostname with the server's numeric local IP) and sign in with a LessonCue account. Select a paired screen and lesson, then start the complete sequence or a particular media item. Commands are versioned and stored on the local server, so a short Wi-Fi interruption does not reorder them; TV clients ignore commands issued before their current app session.

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

The complete self-hosted workflow runs on the local server: setup, accounts and roles, classes, calendar, lesson playlists, resumable media ingestion, signage, pre-roll, duration-aware countdown, rotating PIN pairing, screen assignment/health, branding, audit history, and backups. Android/Fire TV and tvOS clients build from this repository and retain offline manifests and media. Hardware signing, managed-store submission, and final device certification require the deploying organization's accounts and target devices.

## License

LessonCue is provided under the [MIT License](LICENSE).
