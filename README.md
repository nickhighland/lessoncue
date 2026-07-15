# LessonCue

LessonCue is a self-hosted lesson scheduling and television playback system for churches and schools. Administrators build dated media playlists in a browser; paired Android TV, Fire TV, and Apple TV clients cache their assignments and keep playing when the network is unavailable.

[Installation guide](docs/installation.md) · [Implementation guide](docs/implementation.md) · [Protocol](protocol/openapi.yaml)

## What is included

- A complete React/TypeScript administration interface served directly by the local server.
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
npm run build:admin
dotnet run --project server/LessonCue.Server
```

Open `http://localhost:8080`. For live front-end development, run `npm run dev:admin` in a second terminal and open `http://localhost:5173`.

For native development and production installation, see [docs/installation.md](docs/installation.md). The server API is independently runnable with `dotnet run --project server/LessonCue.Server`.

## Scheduled playback modes

LessonCue publishes two coordinated pre-class modes in every screen manifest:

1. **Pre-roll** — a sequence of videos or images loops until the countdown window begins.
2. **Duration-aware countdown** — the chosen countdown video starts exactly one video-duration before the lesson's designated start time, so its final frame lands on the start time.

If the countdown duration is five minutes and class begins at 09:00, the TV transitions from pre-roll to countdown at 08:55. Clients calculate this locally from the manifest, so an already-synchronized screen can make the transition while offline.

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

The end-to-end administrator workflow runs on the self-hosted server: first-run setup, login, classes, lessons, local uploads, pre-roll, duration-aware countdown, pairing, screen assignment, and server status. Hardware-specific signing and store submission still require the target deployment accounts and devices.

## License

LessonCue is provided under the [MIT License](LICENSE).
