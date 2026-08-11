# DEFECT-006 — Browser workflow does not activate redesigned lesson settings tab

- Severity: S2 (current-HEAD browser release evidence stops before lesson settings/backup assertions; safe UI workaround exists)
- First failing test ID: current-HEAD browser gate / `CUR-003`
- Run ID: LC-20260802-200403-0.40.9-RC1
- Frequency: 1 current-HEAD attempt / 1 failure
- First bad version: 0.40.9 commit `041e5499d9967c6003be404798b123a25d22fb5f`
- Last known good: Not established
- Server version/architecture/OS: 0.40.9 source, disposable .NET server on macOS arm64
- Client model/OS/API/distribution/version: Chromium 1228, browser distribution
- Network profile: Localhost 127.0.0.1:5117
- Exact UTC/local time: 2026-08-03T00:54:14Z / 2026-08-02T20:54:14-0400
- Role: Service Admin browser test

## Expected

The browser workflow should continue through lesson settings, backup/restore, media, and administration checks after editing the lesson playlist.

## Observed

`tests/browser/local-workflow.spec.ts:219` timed out looking for the accessible field `Substitute or teacher instructions`. In the current redesigned editor, the page renders two tabs and defaults `activeEditorTab` to `"playlist"`; the requested field is mounted only when the `"settings"` tab is active. The test did not select `Lesson settings`, so the field was not in the DOM. This is a test/UI navigation contract failure, not evidence that the settings data is lost.

## Minimal reproduction

1. Run `LESSONCUE_MEDIA_WORKER_SKIP_SANDBOX=1 npm run test:e2e` at commit `041e5499d9967c6003be404798b123a25d22fb5f`.
2. Let the local workflow reach the lesson editor after cue edits.
3. Observe the editor defaults to `Playback sequence`.
4. The next test action requests `getByLabel("Substitute or teacher instructions")` without selecting `Lesson settings`; the locator times out.

## Timeline

- 2026-08-02T20:27:35-0400 — External commit `041e5499` changed the lesson editor to tabbed settings/playlist workflow.
- 2026-08-02T20:54:14-0400 — Current-HEAD E2E failed at the settings field locator; no retry was performed.

## Evidence

- Error context: `evidence/current-003-local-workflow-error-context.md`
- Raw trace: `evidence/current-003-local-workflow-trace.zip` (contains disposable test-session data; do not publish)
- Gate log: `logs/current-003-e2e.txt`
- Source context at current HEAD: `web-admin/src/main.tsx:3711`, `web-admin/src/main.tsx:4490-4510`, `web-admin/src/main.tsx:4562`

## Classification

Browser E2E navigation/selector drift after the workflow redesign. The source explicitly mounts the field only under the settings tab; no restore-data loss or settings persistence failure was reached.

## Workaround and safety

Select `Lesson settings` before asserting or filling settings fields, or update the test to navigate by the tab’s accessible name. No application source or production data was changed during QA.

## Suspected component

`tests/browser/local-workflow.spec.ts` is missing the new tab activation step. This is an inference supported by the current source and Playwright DOM snapshot; normal development review is required before changing tests.
