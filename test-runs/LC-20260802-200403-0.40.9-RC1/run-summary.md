# LessonCue QA run summary

- Run ID: LC-20260802-200403-0.40.9-RC1
- Target release: 0.40.9
- Repository initial commit: fd46c3ea0ffd3746f20ab48e792670f9f7e8a473
- Final observed HEAD: 041e5499d9967c6003be404798b123a25d22fb5f
- Branch: ui-overhaul
- Status: Complete with environment blockers and open defects
- Recommendation: NO-GO

## Final totals

`results.csv` contains 100 rows, including the numbered authoritative matrix plus 2 supplemental checks and 5 current-HEAD revalidation rows:

- PASS: 11
- FAIL: 7
- BLOCKED: 82
- NOT RUN: 0

The FAIL rows are PRE-004, AUTO-003, AUTO-004, AUTO-005, AUTO-006, SMK-001, and CUR-003. The current-HEAD revalidation rows are explicitly separated from the original baseline because an external commit advanced `HEAD` during the run.

## Initial repository state

The worktree was dirty before this run. The following paths were recorded as pre-existing user changes; QA did not edit them. An external commit later advanced these paths, as documented below:

- Modified: android-tv/app/src/main/kotlin/org/lessoncue/tv/LessonCueApi.kt
- Modified: android-tv/app/src/main/kotlin/org/lessoncue/tv/MainActivity.kt
- Modified: android-tv/app/src/main/kotlin/org/lessoncue/tv/Models.kt
- Modified: android-tv/app/src/main/kotlin/org/lessoncue/tv/UpdateScreen.kt
- Modified: web-admin/src/WebPlayer.tsx
- Untracked: docs/qa-regression-smoke-and-troubleshooting-plan.md

## Commit boundary and scope

The run began at commit `fd46c3ea0ffd3746f20ab48e792670f9f7e8a473`. At 20:27:35 -04:00, an external commit advanced the branch to `041e5499d9967c6003be404798b123a25d22fb5f` (`Workflow redesign: tabbed lesson editor, collapsible sidebar sections, dashboard quick actions, grid/list media toggle`). The reflog shows the transition; QA did not create, amend, reset, checkout, push, or release that commit. AUTO-005’s retry and later gates crossed the boundary, so current-HEAD gates CUR-001 through CUR-005 were run and kept separate.

No LessonCue application source was edited by this QA run. The worktree state and external boundary are preserved in `evidence/final-worktree-status.txt` and `evidence/external-commit-boundary.txt`.

## Environment result

- Host: macOS 26.5.2 arm64; Node 26.5.0; .NET 10.0.301; Gradle 9.6.1/JDK 26 daemon; Docker Desktop 29.2.1; Chromium 1228.
- Native Linux server, affected incident host, historical packages, production update artifacts, physical displays, Android phone, Fire TV/Shield, multi-room LAN, and controlled fault/storage labs were unavailable.
- Only API 36 Google TV AVD instrumentation was available; required older APIs were not installed.
- Full matrix: `environment.md`.

## Strong results

- AUTO-001: protocol/lint/typecheck/admin build passed; AUTO-002: 255/255 Release server tests passed; AUTO-007: protocol filter 1/1, browser display conformance 4/4, Android flavor unit tests passed.
- CUR-001/CUR-002/CUR-004/CUR-005: current-HEAD web/server/build/instrumentation revalidation passed; current API 36 AVD sideload/store instrumentation passed 8/8 each after the disposable emulator was brought online.
- CACHE-B01: service-worker policy probe passed; SUP-002: rendered-HTML checks 4/4 passed.
- AUTO-006’s explicit linux/amd64 disposable updater variant passed invalid-signature rejection, update, operator rollback, readiness rollback, and interrupted recovery. It does not replace the native Linux matrix.

## Defects and stop-ship impact

- S2 DEFECT-001: original browser workflow used a list-only media selector while the UI was in grid view; restored media was visibly present, but PRE-004/AUTO-003/SMK-001 did not complete.
- S2 DEFECT-002: sidebar section labels fail axe WCAG contrast at 2.85:1 versus 4.5:1; reproduced on both original and current HEAD.
- S2 DEFECT-003: first Android build from an incremental state failed D8 duplicate generated classes; a generated-artifact clean rebuild passed. JDK 17/CI toolchain reproduction remains outstanding.
- S3 DEFECT-004: disposable API 36 AVD sideload install initially hit stale signature state; reboot plus retry passed. Not a production signing result.
- S2 DEFECT-005: exact arm64 Docker updater harness failed before assertions because the fixture only creates x64 assets; explicit amd64 emulation passed.
- S2 DEFECT-006: current workflow redesign defaults to Playback sequence, while the E2E test immediately requests a Lesson settings field without activating that tab.
- No S0/S1 behavior was observed, but all required release-gate evidence is not present and multiple S2 defects remain open.

## Supplied incident

Exact reference: `0HNNFS12D541V:0000000D`. INC-UPD-001 through INC-UPD-005 are BLOCKED, not classified: the affected server/browser evidence, installed native binary, request/result/marker/lock state, and service journals were unavailable. No retry, restart, reinstall, lock/marker/result deletion, or state clear was performed. Therefore the incident is not safely classifiable as contention, queued-not-consumed, interrupted, stale browser, missing result, web wedge, or other operation from this run.

## Coverage blockers

Native Linux update contention/history/permissions/low-space/power-loss/rollback, Android communication, native cache replacement/cleanup/low-storage/clock, browser cache population/replacement/faults, production-signed APK update, physical playback/remote/lifecycle, two-room isolation, and 24-hour/repetition/stress soak rows are explicitly BLOCKED with evidence links in `results.csv`.

## Decision

NO-GO for release or publication. Section 17 requires all critical smoke, server source/version, update recovery/fault, isolation, stale replacement, offline, production APK, and soak gates, plus no open S0/S1 and explicit waivers for S2. This run has 82 blocked rows and open S2 defects. No explicit human waiver was provided.

## Primary artifacts

- `results.csv` — full row-level matrix and statuses
- `environment.md` — environment/version matrix
- `release-recommendation.md` — formal NO-GO and required actions
- `timeline.md` — chronological run and external commit boundary
- `defects/` — DEFECT-001 through DEFECT-006
- `evidence/` and `logs/` — raw/sanitized diagnostics, traces, hashes, and command output
