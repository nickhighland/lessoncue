# DEFECT-001 — Browser workflow uses a list-only media locator while the UI opens in grid view

- Severity: S2 (automated release evidence is blocked; product data was visibly present and a documented UI workaround exists)
- First failing test ID: PRE-004 / local workflow; impacts AUTO-003 when the full browser suite reaches this test
- Run ID: LC-20260802-200403-0.40.9-RC1
- Frequency: 1 attempt / 1 failure
- First bad version: 0.40.9 checkout under test
- Last known good: Not established
- Server version/architecture/OS: 0.40.9 source, disposable .NET server on macOS arm64 host
- Client model/OS/API/distribution/version: Chromium 1228, browser distribution
- Network profile: Localhost 127.0.0.1:5117
- Exact UTC/local time: 2026-08-03T00:09:47Z / 2026-08-02T20:09:47-0400
- Role: Service Admin browser test

## Expected

PRE-004 requires the restore drill to verify organization, users, classes, lessons, settings, screens, and media references on the spare/disposable server. The browser workflow expects the restored media to be visible through its `.media-table` assertions.

## Observed

The workflow reached the Media Library after full-backup validation and restore. Playwright timed out at `tests/browser/local-workflow.spec.ts:268` while looking for `.media-table` containing `browser-test-audio.wav`. The preserved error context shows the item present in the rendered `Media previews` grid along with four other media items, but the list-only `.media-table` DOM was not mounted because the default view is `grid`.

## Minimal reproduction

1. Run `LESSONCUE_MEDIA_WORKER_SKIP_SANDBOX=1 npx playwright test tests/browser/local-workflow.spec.ts`.
2. Complete setup, upload media, create/download/validate a full `.lcbak`, and restore it in the disposable server.
3. Navigate to Media Library; the UI is in grid view by default.
4. Assert `.media-table` without first activating the `List view` button.

## Timeline

- 2026-08-02T20:09:47-0400 — Test reached post-restore Media Library.
- 2026-08-02T20:09:47-0400 — Assertion failed after 10 seconds; first failure state preserved and exact action not retried.

## Evidence

- Screenshot/DOM: `evidence/pre-004-error-context.md`
- Trace: `evidence/pre-004-local-workflow-trace.zip` (raw Playwright trace; contains disposable test-session data and must not be published)
- Test log: `logs/pre-004-local-workflow.txt`
- Recovery evidence: error context lists the restored `browser-test-audio.wav`, converted video, bulk cues, and online item in the grid.

## Classification

Browser test/selector drift, not a proven restore-data loss. The UI displayed the restored media in the grid; the test did not select the supported list view before using list-only selectors.

## Workaround and safety

Activate `List view` before `.media-table` assertions, or assert the grid’s `Media previews` buttons. No production data, app state, or cache was changed.

## Suspected component

The browser E2E test is stale relative to the Media Library’s default view. This is an inference from the captured DOM; update the test only through the normal development workflow and rerun the full suite.

