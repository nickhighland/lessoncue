# Release recommendation

## NO-GO

Run: `LC-20260802-200403-0.40.9-RC1`
Target: LessonCue 0.40.9 / Android versionCode 68
Final observed HEAD: `041e5499d9967c6003be404798b123a25d22fb5f`

This is a release-blocking recommendation, not a publication or deployment action. QA did not push, release, reset, or edit LessonCue application source.

## Evidence basis

- 100 result rows: 11 PASS, 7 FAIL, 82 BLOCKED, 0 NOT RUN. See `results.csv`.
- Current-HEAD web/server/build/instrumentation revalidation: CUR-001 PASS, CUR-002 PASS, CUR-003 FAIL, CUR-004 PASS, CUR-005 PASS.
- Open S2 defects: DEFECT-001, DEFECT-002, DEFECT-003, DEFECT-005, DEFECT-006. S3 lab defect: DEFECT-004.
- Required native Linux server/incident host, historical packages, physical display/phone/Fire TV/Shield, production-signed artifacts, controlled LAN/fault/storage lab, and 24-hour soak environment were unavailable.
- Supplied reference `0HNNFS12D541V:0000000D` remains unclassified because the affected server and durable update state were inaccessible; no retry or destructive recovery action was taken.

## Required before reconsideration

1. Re-run current-HEAD browser E2E after activating the redesigned Lesson settings tab in the test workflow or otherwise resolving the contract, and fix the sidebar WCAG contrast failure.
2. Reproduce the exact update incident on the affected/native Linux server, prove HTTP 409/exactly one updater, durable result/Installing recovery, historical upgrade matrix, permission/low-space/snapshot/power-loss/rollback, and post-update communications.
3. Run Android discovery/pairing/manifest/control/ack/telemetry/reconnect and native cache partial/checksum/replacement/cleanup/low-storage/clock rows on the required client matrix, especially red-to-blue same-identity replacement.
4. Verify production-signed sideload in-place update on Android 9–12/current hardware, actual store/Amazon policy behavior, mandatory update, rejection matrix, and roll-forward recovery. Debug APKs are insufficient.
5. Complete physical playback/remote/lifecycle, two-room isolation, browser cache replacement/cleanup/faults, and SOAK-001 through SOAK-004, or obtain explicit human waivers documented against each blocked release gate.
6. Reproduce AUTO-004 with the CI-pinned JDK/Gradle toolchain and make the updater harness architecture-aware for arm64, then rerun the exact commands.

No GO or GO WITH EXPLICIT WAIVERS decision is justified by this run.
