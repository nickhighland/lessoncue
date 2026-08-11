# DEFECT-004 — Sideload instrumentation was blocked by stale lab package signature state

- Severity: S3 (test-environment contamination; one reboot cleared it and the sideload suite then passed)
- First failing test ID: AUTO-005
- Run ID: LC-20260802-200403-0.40.9-RC1
- Frequency: 1 first sideload install failure / 1 retry passed; store flavor passed first attempt
- First bad version: 0.40.9 checkout under test
- Last known good: Not established
- Server version/architecture/OS: Not applicable
- Client model/OS/API/distribution/version: Google TV API 36 AVD `Television_1080p`, Android versionCode 68 debug sideload/store test packages
- Network profile: Local emulator
- Exact UTC/local time: 2026-08-03T00:25:55Z / 2026-08-02T20:25:55-0400
- Role: Instrumentation test operator

## Expected

AUTO-005 requires the sideload and store connected Android instrumentation suites to execute on each available required emulator/API configuration.

## Observed

The first sideload attempt started zero tests because PackageInstaller returned `INSTALL_FAILED_UPDATE_INCOMPATIBLE` for `org.lessoncue.tv` and reported a signature mismatch. The subsequent store flavor ran 8/8 tests. Read-only package queries showed no visible package path/list entry, and lab-only `pm uninstall org.lessoncue.tv` returned `DELETE_FAILED_INTERNAL_ERROR`. After rebooting only the disposable AVD, the sideload suite installed and passed 8/8.

## Minimal reproduction

1. Start the `Television_1080p` API 36 AVD with stale package-manager state.
2. Run `gradle -p android-tv :app:connectedSideloadDebugAndroidTest`.
3. Observe zero tests and `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
4. Reboot the lab AVD and rerun; 8/8 tests pass.

## Timeline

- 2026-08-02T20:25:55-0400 — First sideload install failed; no test body ran.
- 2026-08-02T20:26:13-0400 — Store flavor passed 8/8.
- 2026-08-02T20:26:49-0400 — Package diagnostics and failed lab-only uninstall preserved.
- 2026-08-02T20:27:44-0400 — Lab AVD rebooted successfully.
- 2026-08-02T20:28:31-0400 — Sideload retry passed 8/8.

## Evidence

- First instrumentation: `logs/auto-005-sideload.txt`
- Store instrumentation: `logs/auto-005-store.txt`
- Package state: `evidence/auto-005-sideload-package-before.txt`
- Uninstall/diagnostics: `evidence/auto-005-sideload-package-uninstall.txt`, `evidence/auto-005-sideload-package-diagnostics.txt`
- Reboot: `logs/auto-005-lab-reboot.txt`
- Sideload retry: `logs/auto-005-sideload-retry.txt`
- XML results: generated `android-tv/app/build/outputs/androidTest-results/connected/debug/flavors/{sideload,store}/`

## Classification

Disposable emulator PackageInstaller state/signature contamination; not proven to be a product signing failure. Production-signed APK behavior remains untested because only debug APKs were available and production signing credentials were not present.

## Workaround and safety

Use a clean or rebooted lab AVD before connected tests. No production app was uninstalled or modified.

## Suspected component

Emulator PackageInstaller state or stale test package, not the LessonCue application. This is supported by the absence of a visible package entry and successful post-reboot retry.

