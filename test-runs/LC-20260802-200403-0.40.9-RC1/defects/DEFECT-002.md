# DEFECT-002 — Sidebar section labels fail WCAG AA color contrast

- Severity: S2 (serious WCAG contrast failure on primary administration navigation)
- First failing test ID: AUTO-003 / `zz-accessibility.spec.ts:54` and `:75`
- Run ID: LC-20260802-200403-0.40.9-RC1
- Frequency: 2 affected accessibility tests / 2 attempts; 3 labels per page
- First bad version: 0.40.9 checkout under test
- Last known good: Not established
- Server version/architecture/OS: 0.40.9 source, disposable .NET server on macOS arm64 host
- Client model/OS/API/distribution/version: Chromium 1228, browser distribution
- Network profile: Localhost 127.0.0.1:5117
- Exact UTC/local time: 2026-08-03T00:14:43Z / 2026-08-02T20:14:43-0400
- Role: Service Admin browser test

## Expected

AUTO-003 requires browser E2E/accessibility checks to pass, including the WCAG 2.2 AA baseline and confirmation-dialog accessibility scan.

## Observed

Both accessibility specs failed the axe `color-contrast` rule for `.nav-section-label` elements `Teaching`, `Media & Devices`, and `Administration`. The computed foreground `#5e7870` on sidebar background `#25302d` has contrast ratio 2.85:1; axe requires 4.5:1 for the 9px bold text. The source declaration is `web-admin/src/styles.css:146`.

## Minimal reproduction

1. Run `LESSONCUE_MEDIA_WORKER_SKIP_SANDBOX=1 npm run test:e2e`.
2. Complete the fresh-server setup.
3. Run the dashboard accessibility scan or open a confirmation dialog and scan.
4. Observe the three sidebar section-label contrast violations.

## Timeline

- 2026-08-02T20:14:43-0400 — Full AUTO-003 completed with 4 passed and 3 failed.
- 2026-08-02T20:14:43-0400 — Same contrast violation observed in dashboard and confirmation-dialog accessibility tests.

## Evidence

- Dashboard error/DOM: `evidence/auto-003-accessibility-dashboard-error.md`
- Confirmation-dialog error/DOM: `evidence/auto-003-accessibility-dialog-error.md`
- Dashboard trace: `evidence/auto-003-accessibility-dashboard-trace.zip` (raw trace; do not publish)
- Confirmation-dialog trace: `evidence/auto-003-accessibility-dialog-trace.zip` (raw trace; do not publish)
- Full gate log: `logs/auto-003-e2e.txt`

## Classification

Product CSS accessibility defect: the same low-contrast token is rendered in primary navigation and causes the WCAG gate to fail. It is not a browser or server availability issue.

## Workaround and safety

Navigation remains visible and usable for this test, but users with low vision may not reliably distinguish section labels. No state-changing workaround was applied and no production data was touched.

## Suspected component

`web-admin/src/styles.css` `.nav-section-label` color choice. This is directly supported by axe’s computed colors and the source declaration; no application source was edited during QA.

