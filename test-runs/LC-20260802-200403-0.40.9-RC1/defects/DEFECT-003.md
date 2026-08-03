# DEFECT-003 — Android clean build required after duplicate generated Kotlin classes

- Severity: S2 (Android release gate failed on the first build state; a safe generated-artifact clean allowed one successful rebuild)
- First failing test ID: AUTO-004
- Run ID: LC-20260802-200403-0.40.9-RC1
- Frequency: 1 failed build / 1 first SDK-path attempt; 1 clean rebuild passed
- First bad version: 0.40.9 checkout under test
- Last known good: Not established
- Server version/architecture/OS: Not applicable
- Client model/OS/API/distribution/version: Android source build; sideload/store debug variants
- Network profile: Local workspace with installed Android SDK
- Exact UTC/local time: 2026-08-03T00:19:07Z / 2026-08-02T20:19:07-0400
- Role: Build/test operator

## Expected

AUTO-004 requires the sideload/store unit tests, lint tasks, debug APKs, and debug instrumentation APKs to build successfully in one command.

## Observed

After the SDK path was supplied, the first build reached unit-test, lint, APK, and instrumentation packaging tasks but failed in `:app:dexBuilderStoreDebug`. D8 reported duplicate generated Kotlin classes, including `MainActivityKt$OnlineMediaScreen$2$1` and `MainActivityKt$SignageVideo$1$1$listener$1`, where the second file had a ` 2.class` suffix. A clean of generated Android build outputs followed by one rebuild passed all requested tasks.

## Minimal reproduction

1. Use the checkout with the generated Android build outputs present.
2. Run the AUTO-004 command with `ANDROID_HOME=/Users/nickhighland/Library/Android/sdk`.
3. Observe Store debug dexing fail on duplicate classes with ` 2.class` output names.
4. Run `gradle -p android-tv clean` and rerun the same command; it completes successfully.

## Timeline

- 2026-08-02T20:17:23-0400 — Initial command blocked before compile because SDK path was not visible.
- 2026-08-02T20:19:07-0400 — SDK-path build failed at Store debug dexing with duplicate generated class files.
- 2026-08-02T20:19:50-0400 — Generated-artifact clean completed successfully.
- 2026-08-02T20:20:55-0400 — Clean rebuild passed; success is not treated as proof the first failure is resolved in all incremental environments.

## Evidence

- First SDK-path build: `logs/auto-004-android-builds-retry-sdkpath.txt`
- Clean command: `logs/auto-004-clean.txt`
- Clean rebuild: `logs/auto-004-android-builds-clean-retry.txt`
- Unit-test XML and APK hashes: generated `android-tv/app/build/test-results/` and `android-tv/app/build/outputs/apk/`

## Classification

Incremental/generated-output build-state failure or toolchain interaction; not yet proven to be a source compile defect. The same requested build passed from a clean generated-output state.

## Workaround and safety

Run the documented build from a clean Android generated-output directory. This is safe for build artifacts; no application source or user changes were edited.

## Suspected component

Kotlin/Android Gradle incremental output handling under the available Gradle 9.6.1/JDK 26 daemon. JDK 17 was not installed, so CI-pinned toolchain reproduction remains outstanding.

