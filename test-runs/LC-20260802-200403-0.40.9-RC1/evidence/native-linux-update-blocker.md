# Native Linux update matrix blocker

- Run: `LC-20260802-200403-0.40.9-RC1`
- Captured: 2026-08-02 20:44 -04:00
- Host: macOS 26.5.2 arm64
- Required target: native Debian/Ubuntu installation with `/opt/lessoncue`, `lessoncue.service`, updater path/service, recovery service, and a real data/config/media set.

The shared host does not contain `/opt/lessoncue/LessonCue.Server`; the local readiness endpoint is not listening; native Linux `systemctl`, `journalctl`, and lock inspection are unavailable; and non-interactive sudo requires a password. Historical packages and the affected installation were not provided. Therefore UPD-001 through UPD-015 are recorded BLOCKED rather than substituted with a Docker/source run.

The disposable `AUTO-006` harness separately exercised invalid-signature rejection, update, operator rollback, readiness rollback, and interrupted recovery under explicit `linux/amd64` emulation. Those results remain linked where relevant, but they do not satisfy the native-service matrix or the supplied contention incident.

No update retry, service restart, reinstall, lock removal, marker removal, result deletion, or production-state change was performed.
