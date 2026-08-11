# Environment

Run ID: LC-20260802-200403-0.40.9-RC1

Environment discovery is complete for the available host. No credentials, tokens, PINs, or complete configuration files were recorded.

## Repository

- Initial baseline commit: fd46c3ea0ffd3746f20ab48e792670f9f7e8a473
- Final observed HEAD: 041e5499d9967c6003be404798b123a25d22fb5f
- HEAD boundary: external commit at 2026-08-02 20:27:35 -04:00; evidence: `evidence/external-commit-boundary.txt`
- Branch: ui-overhaul
- Target release: 0.40.9
- Remote branch observed: `origin/ui-overhaul` pointed to 041e549 at final checkpoint
- Initial worktree state: dirty application files plus untracked plan; final application source files were clean after the external commit. QA did not commit, reset, checkout, push, or release.

## Host and toolchain

- Host: macOS 26.5.2, Darwin 25.5.0, arm64 (`Nicks-MBP`)
- Storage baseline: approximately 52 GiB available on the workspace/data volume; data volume reported 89% used, 0% inode pressure.
- Node 26.5.0; npm/npx 11.17.0; Chromium Playwright 1228
- .NET SDK 10.0.301; server target framework `net10.0`; source/package version 0.40.9
- Gradle 9.6.1; Java CLI 25.0.2; Gradle daemon observed JDK 26.0.1. JDK 17 was not installed.
- Android SDK: `/Users/nickhighland/Library/Android/sdk`; platform-tools adb available by absolute path.
- Docker 29.2.1 / Docker Desktop `desktop-linux`; Podman unavailable.
- ffmpeg/ffprobe 8.1.2
- Evidence: `evidence/pre-002-versions-and-toolchain.txt`, `evidence/pre-003-host-baseline.txt`

## Server matrix

- Native Linux server: unavailable. `/opt/lessoncue/LessonCue.Server` absent; readiness on local port 80 not listening; systemd/journal/lock inspection unavailable; sudo requires an interactive password.
- An existing `/var/lib/lessoncue` path was observed as `root:wheel` on macOS and was not inspected or changed.
- No historical packages, affected incident host, native service, production database, backup, or production update result was available.
- Disposable localhost .NET server was used for browser tests only; disposable Debian Docker updater harness was mounted read-only.

## Client matrix

- Physical/current Google TV, Shield/Android 9–12, Fire TV, phone controllers, projector, and multi-room displays: unavailable.
- AVDs discovered: `Pixel_10_Pro_XL` (Android 37.1), `Television_1080p` (Android 36), `Television_1080p_2` (Android 36). Only API 36 `Television_1080p` was booted.
- Final disposable emulator: `emulator-5554`, Google TV API 36, model `sdk_google_atv64_amati_arm64`, Android versionCode 68 debug sideload/store test packages.
- Installed system images did not include required API 26/27/28/30/31/32/33/34 or API 37 device coverage.
- Android source package: `org.lessoncue.tv`, versionName 0.40.9, versionCode 68, minSdk 26, target/compile SDK 36.
- Production-signed APK/update metadata/store/Amazon artifacts were unavailable; only debug APKs were built.

## Network and storage

- Runnable browser profile: disposable localhost `127.0.0.1:5117`/`:5118`, fresh data under `/tmp`.
- Updater profile: Docker Desktop local bridge; exact arm64 host and explicit linux/amd64 emulation were both recorded.
- No controlled LAN multicast/NSD, DHCP, VLAN/client isolation, packet loss, Wi-Fi outage, server restart, or phone-to-TV network profile was available.
- Sentinel assets and SHA/size/codec metadata: `evidence/sentinel-media.tsv` and `evidence/sentinels/`.
