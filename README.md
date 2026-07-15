# LessonCue

LessonCue is a self-hosted lesson scheduling and television playback system for churches and schools. Administrators build dated media playlists in a browser; paired Android TV, Fire TV, and Apple TV clients cache their assignments and keep playing when the network is unavailable.

[Live product tour](https://lessoncue-media.nick247475.chatgpt.site/) · [Installation guide](docs/installation.md) · [Implementation guide](docs/implementation.md) · [Protocol](protocol/openapi.yaml)

## What is included

- A working React/TypeScript administration experience in the repository root.
- An ASP.NET Core 10 API with SQLite, pairing, manifests, health reporting, SignalR invalidation, and range-enabled media hosting.
- A native Android TV/Fire TV application using Kotlin, Compose for TV, Media3, DataStore, and WorkManager.
- A native tvOS application using SwiftUI, AVKit, Bonjour discovery declarations, and persistent offline manifests.
- A versioned OpenAPI contract and JSON Schema shared by every client.
- Docker, Windows, and Linux installation assets.
- GitHub Actions that build the web app, server, Android APK, tvOS app, release packages, and GitHub Pages documentation.

## Quick start

For a headless Ubuntu or Debian server accessed over SSH, use the complete copy-and-paste block in the [installation guide](docs/installation.md#recommended-headless-ubuntu-or-debian-server-over-ssh).

For a quick Docker evaluation:

```bash
cp .env.example .env
docker compose up -d --build
```

Then open `http://localhost:8080`. On a local network, the preferred address is `http://lessoncue.local:8080` when mDNS is available.

For browser-interface development:

```bash
npm ci
npm run dev
```

For native development and production installation, see [docs/installation.md](docs/installation.md). The server API is independently runnable with `dotnet run --project server/LessonCue.Server`.

## Scheduled playback modes

LessonCue publishes two coordinated pre-class modes in every screen manifest:

1. **Pre-roll** — a sequence of videos or images loops until the countdown window begins.
2. **Duration-aware countdown** — the chosen countdown video starts exactly one video-duration before the lesson's designated start time, so its final frame lands on the start time.

If the countdown duration is five minutes and class begins at 09:00, the TV transitions from pre-roll to countdown at 08:55. Clients calculate this locally from the manifest, so an already-synchronized screen can make the transition while offline.

## Repository map

```text
app/                 React administration prototype
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

The repository is a complete, buildable foundation across all specified phases. The end-to-end administrator workflow is implemented in the hosted product tour, while the server and TV clients establish the production architecture and core local-network workflow. Hardware-specific signing, store submission, FFmpeg/LibreOffice provisioning, and unattended auto-start validation must be completed against the target deployment devices before a production release.

## License

LessonCue is provided under the [MIT License](LICENSE).
