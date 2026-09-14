# Bounded classroom reliability pass

This replaces the open-ended repository audit as the active task. Existing audit documents remain evidence/backlog, not a requirement to inspect every file. No release or live-server changes are included.

## Budget and stopping rule

- One combined stabilization run for the 25 local fixes: server suite, web units/typecheck/lint/build, protocol/network/shortener checks, and focused classroom browser tests. Reuse the latest passing Android 81-test-per-variant/lint and emulator evidence unless Android code changes.
- Six workflow checks below. Allow one focused investigation/fix cycle per failing workflow, at most 45 minutes per workflow. Do not start unrelated investigations. Record unresolved risks at the cap rather than silently extending the scope.
- Stop when the selected checks pass and known critical classroom failures are either resolved or explicitly blocked with a practical verification step. A blocked physical-device check is not a pass.
- Report workflow results and remaining gates, not repository file percentage. Passing tests do not establish that all bugs are absent.

## Acceptance matrix

| Workflow | Acceptance evidence | Status |
| --- | --- | --- |
| TV connection and recovery | Address/discovery/cache/cancellation unit coverage; on-site reconnect on formerly failing TV | Automated evidence exists; physical site verification outstanding |
| Phone joining | Join and identity browser tests; server expiry/reset/lock/rejoin coverage | Passed selected automated checks |
| Game progression and drawing | Reliability/autoplay/drawing browser tests; server progression/scoring tests | Passed selected automated checks |
| Remote control | Host-console and web-player heartbeat browser tests; Android command/wake/diagnostic unit coverage | Passed selected automated checks |
| Updates | Server update tests; existing seven passing Android updater emulator tests | Passed automated checks; not a live rollout |
| Backups | Existing server backup/restore tests and inspect scope of their assertions | Passed isolated restore/encryption checks; not a live restore |

## Explicitly deferred

Whole-repository inspection; cosmetic/novelty paths; new features; speculative refactors; broad performance tuning without measurements. First-reachable NSD fallback and JPEG callback-thread performance remain backlog leads, not automatic work expansion. Historical host-console CI flake remains open unless reproduced and explained. The four on-site TV failures are not established to be IPv6 failures.

## Completion report

Record exact commands/results, any fix required during stabilization, and a short on-site checklist. Preserve all existing local changes. Ask separately before release/deployment.

## Stabilization evidence (2026-09-14)

- `dotnet test server/LessonCue.Server.Tests/LessonCue.Server.Tests.csproj --configuration Release`: 554 passed, zero failed/skipped, `/tmp/lessoncue-classroom-server.log`.
- Chained `npm run typecheck:admin`, `test:units`, `lint`, `test:protocol`, `test:network-config`, `test:shortener`, `build:admin`: all exited successfully. 23 web unit tests passed; lint zero errors/15 existing warnings. Tool session 33483 records output.
- Selected browser run: all 39 passed in 3.7 minutes across `web-player-heartbeat`, `zz-activity-join`, `zz-activity-identity`, `zz-activity-reliability`, `zz-activity-autoplay`, `zz-activity-drawing`, `zz-activity-host-console`; port 5131 with dedicated disposable data `/tmp/lessoncue-e2e-classroom-pass`. Log `/tmp/lessoncue-classroom-browser.log`. First combined run passed; no retries or new product edits required.
- Retained Android evidence: 81 unit tests per variant and both lint variants passed `/tmp/lessoncue-audit-capture-task.log`. Seven updater emulator tests and three bitmap-cleanup emulator tests passed earlier; see audit checkpoint for limits and logs.
- Inspected backup assertions: full restore checks original database organization and actual media bytes plus safety backup/audit record; configuration-only restore preserves current media; encryption test rejects wrong password and byte-tampered archive. These are isolated service tests, not a restore of the live classroom server.
- Inspected lobby assertions: old code invalidated after two hours of inactivity; replacement code differs; locked player cannot answer; unlock preserves identity; reset rotates code and replaces old identity. Important: expiry is inactivity-based, not a hard two-hour maximum while actively used. Record this behavior; do not change policy during stabilization.

## Small on-site verification checklist

1. On one formerly failing TV, record model, app version, error, and address. Try the numeric IPv4 address and `lessoncue.local`; test restart/reconnect and offline cached playback. Do not disable IPv6 merely on suspicion.
2. With two phones, scan/join, briefly disconnect one, rejoin, and complete a timed round plus a drawing/voting round.
3. During playback, use pause/resume/next/stop and request a diagnostic screenshot; confirm controls stay responsive.
4. Before any live update, retain an encrypted backup and its password separately. Test restore on a disposable installation, not over classroom data.

No live deployment, factory reset, network change, or production restore is authorized by this pass.

## Disposition

Local stabilization pass complete. Five workflow rows pass their selected automated checks; the TV connection/recovery row has automated coverage but remains blocked on on-site verification of the previously failing TVs. This is not a claim of exhaustive coverage or that the site failure is fixed. No additional code changes made during this pass. The 25 prior fixes remain local/unreleased. Do not reopen the comprehensive sweep on a generic resume: the next useful step is preparing an authorized release or collecting the small physical-device checklist above. Historical CI flakiness remains a documented risk despite this successful local run.
