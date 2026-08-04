# DEFECT-005 — Linux updater harness is not portable to arm64 Docker hosts

- Severity: S2 (arm64 updater gate cannot execute on a supported architecture without changing the container platform)
- First failing test ID: AUTO-006
- Run ID: LC-20260802-200403-0.40.9-RC1
- Frequency: 1 arm64-host failure / 1 explicit linux/amd64 retry passed
- First bad version: 0.40.9 checkout under test
- Last known good: Not established
- Server version/architecture/OS: Updater fixture; arm64 Docker Desktop host, Debian trixie container
- Client model/OS/API/distribution/version: Not applicable
- Network profile: Docker Desktop local bridge
- Exact UTC/local time: 2026-08-03T00:31:27Z / 2026-08-02T20:31:27-0400
- Role: Updater harness operator

## Expected

AUTO-006 requires the disposable transactional updater harness to pass invalid-signature rejection, update, operator rollback, readiness rollback, and interrupted recovery.

## Observed

On the arm64 Docker engine, the fixture created only `LessonCue-Server-linux-x64.tar.gz`, while the updater correctly selected `linux-arm64` from `uname -m`; it failed before the updater assertions because the arm64 asset was missing. Running the same read-only-mounted harness with `--platform linux/amd64` selected x64 and passed all assertions, including signature rejection, update, operator rollback, readiness rollback, and interrupted recovery.

## Minimal reproduction

1. Run the plan’s exact Docker command on this arm64 host.
2. Observe `Downloading LessonCue v2.0.0 for linux-arm64...` followed by missing `/tmp/lessoncue-releases/.../LessonCue-Server-linux-arm64.tar.gz`.
3. Run with `docker run --platform linux/amd64 ...`.
4. Observe the full harness pass.

## Timeline

- 2026-08-02T20:31:27-0400 — Exact arm64-host harness failed before assertions.
- 2026-08-02T20:32:47-0400 — Explicit linux/amd64 harness passed with exit 0.

## Evidence

- Exact arm64-host command: `logs/auto-006-updater-harness-retry.txt`
- Passing CI-architecture variant: `logs/auto-006-updater-harness-amd64.txt`
- Fixture line creating only x64 asset: `tests/linux-updater-transaction.sh:96`
- Updater runtime selection: `installers/linux/lessoncue-update:703-705`

## Classification

Harness portability defect. The passing x64 run provides evidence for updater transaction behavior, but it does not prove the arm64 fixture path.

## Workaround and safety

Run the harness under `linux/amd64` emulation or provide an architecture-matched arm64 fixture. No production installation, marker, lock, or data was touched; the container was `--rm` and the repository mount was read-only.

## Suspected component

`tests/linux-updater-transaction.sh` hardcodes the x64 archive name instead of deriving it from the container architecture. This is directly supported by the script and updater source inspection.

