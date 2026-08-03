# LessonCue comprehensive regression smoke test and troubleshooting plan

Version of this plan: 2026-08-02  
Repository baseline inspected: LessonCue 0.40.9, Android `versionCode` 68  
Primary targets: native Linux server, browser administration/controller, browser display, Android TV, Google TV, and Fire TV

## 1. Instructions to the executing AI

You are the test operator. Follow this document literally, in order. Do not silently skip a row, reinterpret a failure as acceptable, change production data, or claim a release is healthy merely because automated tests pass.

For every test:

1. Record the test ID, start/end time with time zone, server version, client version, device model, OS/API version, distribution (`sideload`, `Google Play`, `Amazon`, or `browser`), network path, result, and evidence filenames.
2. Use only a dedicated test server and test screens for destructive or fault-injection tests.
3. Write **PASS** only when every stated pass condition is directly observed.
4. Write **FAIL** when observed behavior violates a pass condition, even if retrying makes it work.
5. Write **BLOCKED** only when a named prerequisite is unavailable. State exactly what is missing.
6. Write **NOT RUN** for an intentionally deferred row and obtain a human waiver before release.
7. Preserve the first failure state before restarting, reinstalling, clearing storage, deleting a cache, or retrying.
8. Never expose passwords, bearer tokens, pairing PINs, update signing material, tunnel tokens, backup passwords, or complete configuration files in evidence.
9. Never manually delete `/opt/lessoncue.previous`, `/var/lib/lessoncue/update-rollback`, `/var/lib/lessoncue/manual-rollback-safety`, `/var/lib/lessoncue/update-transaction`, or `/run/lessoncue-update.lock`.
10. Do not run power-loss, disk-full, database-corruption, package-tampering, app-data-clear, downgrade, or uninstall tests on production.
11. Stop immediately for possible data loss, incorrect cross-room control, credential exposure, signing failure, rollback failure, or a server that cannot return to readiness.

If a step says “capture,” save the output in the run evidence directory. If a command fails, capture the failure and continue only when this plan has an explicit branch for it.

### Required execution order

1. Read sections 1–4 and provision the complete matrix.
2. On the currently affected server, run only the read-only incident procedure in section 9 first.
3. Build the isolated lab, recovery copy, evidence directory, and baselines in section 5.
4. Run all automated gates in section 6.
5. Run the 30-minute smoke in section 7 on every candidate client family.
6. Run the Linux updater matrix in section 8, beginning with the supplied contention regression.
7. Run communication and cache sections 10–12 before clearing any client state.
8. Run the separate APK update and playback sections 13–14.
9. Run soak tests in section 15.
10. Triage every failure through section 16, apply sections 17–18, and deliver section 20.

## 2. Scope and system model

Keep these components distinct. A result from one does not prove the others work.

| Component | Role | Update mechanism | Fresh-data mechanism | Durable/offline state |
| --- | --- | --- | --- | --- |
| Native Linux server | API, database, manifests, media, controller queue | Protected root-owned systemd updater | Database/API | Database, config, media, rollback snapshot |
| Browser admin/phone controller | Plans lessons and sends commands | Served by server update | SignalR plus screen polling | Login/session and controller grants |
| Browser display | Computer/projector playback | Served by server update | Manifest retry; control poll | Cache Storage for scheduled signage media |
| Android TV/Google TV/Fire TV | Native playback | GitHub APK updater for sideload; store-owned for store builds | Manifest poll about every 10 s; controls poll about every 750 ms | DataStore identity, `files/manifest.json`, `files/media/*`, WorkManager |

Important boundaries:

- The phone controller does not talk directly to a TV. It writes a versioned command to the server; the TV polls the server; the TV reports the acknowledged version and actual playback state; the controller reads that state.
- The native Android app in this repository is the TV app. Phone control is a browser/PWA workflow.
- Apple TV/tvOS is archived and unsupported. Do not include it in current release coverage.
- One-click server updates are supported only by native Linux. Docker and Windows must not be judged against that capability.
- Sideload and store Android packages share playback code but intentionally have different update behavior. Test both.

### Code-grounded high-risk watchlist

These observations explain why specific tests below are mandatory. Treat them as hypotheses to prove on packaged builds, not permission to skip reproduction:

- In 0.40.9, expected protected-operation contention has a dedicated HTTP 409 response. The supplied generic title/detail/failure-reference presentation follows the older HTTP 500 path, so the installed version and trace correlation are decisive.
- The server sets an in-memory `Installing` flag after writing the protected request and clears it when it can read an update result. A request that is never consumed or an old updater that exits without a result can therefore look stuck; distinguish memory state from the root-owned updater lock/transaction.
- Android currently refreshes manifests by polling rather than joining the server's SignalR invalidation hub. Use the 15 s manifest ceiling and test app lifecycle/network suspension.
- The Android manifest response is written to `files/manifest.json` before parsing finishes. A malformed response could replace a previously usable cached manifest; COM-007 must prove last-known-good behavior.
- Android cache filenames use stable cue/item ID plus extension, while unique WorkManager job names include a SHA fragment. A media replacement may target an existing destination name; CACHE-A06/A07 must prove new verified bytes win.
- The reviewed native client exposes no obvious obsolete-media/free-space pruning path even though product documentation calls for free-space cleanup. CACHE-A09/A10 are release gates, not optional capacity tests.
- The Android summary `cachedItems` is derived from directory entry count, while detailed inventory distinguishes complete, partial, error, and queued states. CACHE-A11 must catch misleading readiness.
- The browser service worker is cache-first only for same-origin media; explicit durable population and deletion are driven by scheduled signage and versioned media URLs. Do not infer offline lesson caching from browser signage caching.

### Expected timing from the current implementation

Use these as ceilings, not averages:

| Event | Normal interval | Release pass ceiling |
| --- | --- | --- |
| Android receives an online controller command | 750 ms poll plus request | Visible TV action within 5 s |
| Controller sees acknowledgement while already playing | 2 s TV status plus 2.5 s admin refresh | 8 s |
| Controller sees acknowledgement when starting from idle | Existing idle heartbeat may sleep 30 s | 38 s; flag over 10 s as a usability concern |
| Android receives changed manifest | 10 s poll plus request | 15 s |
| Android idle screen becomes online in admin | 30 s heartbeat plus 2.5 s refresh | 38 s |
| Android active telemetry updates | 2 s heartbeat plus 2.5 s refresh | 8 s |
| Browser display receives changed manifest | 30 s refresh plus request | 35 s |
| Browser display control | 750 ms poll | 5 s |
| Browser display idle heartbeat | 10 s | 15 s |

Never excuse a missed, duplicated, reordered, cross-screen, or cross-room command because it later self-corrects.

## 3. Required deliverables

Produce:

- `run-summary.md`: identifiers, environment, totals, stop-ship defects, recommendation.
- `results.csv`: one row per test ID with `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`.
- `environment.md`: hardware, OS, Android API/Fire OS, distribution, versions, network, storage, architecture.
- `timeline.md`: timestamped updates, restarts, faults, cache changes, recovery.
- `defects/DEFECT-NNN.md`: one report per unique failure using section 19.
- `evidence/`: screenshots, recordings, sanitized HTTP, journals, diagnostics, hashes, metadata.
- `release-recommendation.md`: `GO`, `NO-GO`, or `GO WITH EXPLICIT WAIVERS`, with evidence links.

## 4. Required test matrix

### 4.1 Servers

Run the full update suite on:

- x86_64 native Debian or Ubuntu.
- arm64 native Debian or Ubuntu if arm64 will ship.
- Clean current install.
- In-place upgrade from the oldest version actually deployed.
- In-place upgrades from 0.40.5, 0.40.6, 0.40.7, and 0.40.8 to the target.
- A realistic server with lessons, media, screens, users, settings, signage, and verified backup.

If a historical package is unavailable, mark the cell **BLOCKED** and name it. Do not silently substitute a source build.

### 4.2 Physical displays

Minimum:

- Current Google TV hardware.
- NVIDIA Shield or another Android 9–12 device.
- Fire TV/Fire OS hardware.
- Low-storage/low-memory consumer TV or stick.
- Chromium browser display on a computer/projector.

Preferred:

- Android API 26/27 emulator.
- APIs 28, 30, 31/32, 33/34, and 36 emulators.
- Two TVs in different rooms and two in the same room.
- Android phone Chrome and iPhone Safari controllers.

### 4.3 Android distributions

| Distribution | Required assertion |
| --- | --- |
| Production-signed sideload APK | Update UI exists; verified GitHub update; Android owns final confirmation |
| Google Play/store APK | No external updater UI or install permission; store owns update |
| Amazon store APK | Same policy; validate actual Amazon delivery |
| Debug APK | Playback test only; updater-disabled debug is not a production update test |

### 4.4 Network profiles

1. Same subnet with multicast allowed.
2. `.local` unavailable but Android NSD allowed.
3. DNS-SD blocked; numeric IP works.
4. TV 2.4 GHz, wired server, phone 5 GHz on same trusted LAN.
5. Temporary TV Wi-Fi loss while process stays alive.
6. TV process killed/relaunched offline.
7. Server restart while TV and phone stay online.
8. DHCP address change with NSD recovery.
9. Lab latency/loss/interruption.
10. Client isolation/VLAN block as negative case.

### 4.5 Sentinel media

Create unmistakable assets:

- `RED-A-v1.mp4`: red frame and spoken “RED A VERSION ONE,” 20 s.
- `BLUE-A-v2.mp4`: blue frame and spoken “BLUE A VERSION TWO,” 20 s. Replace the first behind the same identity.
- `GREEN-B.mp4`: 90 s with visible seconds.
- `IMAGE-C.png`: large unique text/checkerboard.
- `AUDIO-D.m4a`: spoken item name every 5 s.
- Incompatible video requiring TV-safe conversion.
- Large file for partial-download tests.
- Clearly labeled online-only webpage/YouTube item.
- Three-slide numbered presentation.

Record SHA-256, size, duration, codecs, and dimensions.

## 5. Evidence setup and baselines

### PRE-001 — Create run

Create a unique ID such as `LC-20260802-1400-RC1`, required directories/files, operator identity, human owner, commit, and dirty state.

Pass: evidence cannot overwrite an earlier run.

### PRE-002 — Capture versions

Repository:

```bash
git rev-parse HEAD
git status --short
sed -n '1,40p' server/LessonCue.Server/LessonCue.Server.csproj
sed -n '1,100p' android-tv/app/build.gradle.kts
rg 'APP_VERSION' web-admin/src/WebPlayer.tsx
```

Installed server:

```bash
/opt/lessoncue/LessonCue.Server --version
sudo cat /var/lib/lessoncue/config/installed-version
curl -fsS http://127.0.0.1/health/ready
```

Android:

```bash
adb shell getprop ro.product.manufacturer
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell dumpsys package org.lessoncue.tv | sed -n '/versionCode=/p;/versionName=/p;/installerPackageName=/p'
```

Pass: source, package, server, and devices are recorded separately; mismatches remain visible.

### PRE-003 — Server health

```bash
date --iso-8601=seconds
uname -a
df -h / /var/lib/lessoncue /opt/lessoncue
df -i / /var/lib/lessoncue /opt/lessoncue
sudo systemctl status lessoncue.service lessoncue-update.path lessoncue-update.service lessoncue-update-recovery.service --no-pager
sudo systemctl is-enabled lessoncue.service lessoncue-update.path lessoncue-update-recovery.service
curl -fsS http://127.0.0.1/health/live
curl -fsS http://127.0.0.1/health/ready
curl -fsS http://127.0.0.1/.well-known/lessoncue
```

Pass: server ready, expected services installed, adequate space/inodes, intended identity/port.

### PRE-004 — Recovery material

1. Create an encrypted `.lcbak`.
2. Download to another machine.
3. Record size/SHA.
4. Restore on a spare server.
5. Verify organization, users, classes, lessons, settings, screens, media references.
6. Block destructive testing until the restore drill passes.

### PRE-005 — Pre-update invariants

Record counts and samples for organization/time zone, users/roles, classes, lessons, cue order, media/SHA, screens/assignments, signage versions, pairing/controller modes without PINs, local address, and port.

Pass: post-update loss, duplication, reset, or misassignment can be detected.

## 6. Automated release gates

Save complete output and exit code.

### AUTO-001 — Web/protocol/lint/build

```bash
npm ci
npm run test:protocol
npm run lint
npm test
```

Pass: all exit 0; never regenerate fixtures to hide drift.

### AUTO-002 — Server tests

```bash
dotnet restore server/LessonCue.Server.Tests/LessonCue.Server.Tests.csproj
dotnet test server/LessonCue.Server.Tests/LessonCue.Server.Tests.csproj -c Release --no-restore
```

### AUTO-003 — Browser E2E/accessibility

Provision `.github/workflows/ci.yml` dependencies, then:

```bash
npm run build:admin
npx playwright install chromium
LESSONCUE_MEDIA_WORKER_SKIP_SANDBOX=1 npm run test:e2e
```

Pass: workflow, display conformance, screenshot, WCAG checks pass; preserve traces.

### AUTO-004 — Android JVM/lint/builds

Use JDK 17 and CI-pinned Gradle:

```bash
gradle -p android-tv \
  :app:testSideloadDebugUnitTest :app:testStoreDebugUnitTest \
  :app:lintSideloadDebug :app:lintStoreDebug \
  :app:assembleSideloadDebug :app:assembleStoreDebug \
  :app:assembleSideloadDebugAndroidTest :app:assembleStoreDebugAndroidTest
```

### AUTO-005 — Android instrumentation

On every required emulator/API:

```bash
gradle -p android-tv :app:connectedSideloadDebugAndroidTest
gradle -p android-tv :app:connectedStoreDebugAndroidTest
```

Unavailable SDK/device configuration is **BLOCKED**, not pass.

### AUTO-006 — Transactional updater harness

Disposable container only:

```bash
docker run --rm \
  -v \"${PWD}:/workspace:ro\" \
  debian:trixie-slim \
  bash /workspace/tests/linux-updater-transaction.sh /workspace
```

Pass: invalid signature rejection, update, operator rollback, readiness rollback, and interrupted recovery pass.

### AUTO-007 — Protocol skew

```bash
dotnet test server/LessonCue.Server.Tests/LessonCue.Server.Tests.csproj \
  --filter FullyQualifiedName~ProtocolContractTests
npx playwright test tests/browser/display-conformance.spec.ts
gradle -p android-tv :app:testSideloadDebugUnitTest :app:testStoreDebugUnitTest
```

Pass: minimum/current/future-additive manifests work and fallbacks remain explicit.

## 7. Thirty-minute critical smoke

Run on every candidate.

### SMK-001 — Admin and persistence

Sign in, open all primary views, create temporary class/lesson, upload red/image, add/reorder/edit/reload cues, archive/restore lesson.

Pass: no blank/error view; every mutation persists once; existing data unchanged.

### SMK-002 — Pair Android TV

Check clocks, start fresh pairing, verify name/platform, enter one wrong then correct PIN, assign class.

Pass: wrong rejected without destroying attempt; correct pairs once; screen ID/version/model/IP/assignment appear.

### SMK-003 — Manifest propagation

Rename lesson/cue while TV stays in library; time without reloading.

Pass: update within 15 s, no duplicate, new manifest version reported.

### SMK-004 — Phone-to-TV loop

From Android phone room controller send Play, Pause, Resume, Seek, Next, Previous, Stop one at a time. Capture acceptance, TV action, command version, acknowledgement, actual state.

Pass: only selected screen acts; versions increase; visible action and acknowledgement meet section 2.

### SMK-005 — Cache/offline

Wait for all eligible sentinel items cached with byte counts/no failures. Force-stop app, disable TV Wi-Fi, relaunch, play/seek all local cues.

Pass: cached manifest opens; correct local media plays; online-only content is clearly unavailable.

### SMK-006 — Reconnect

Re-enable Wi-Fi with app open; edit cue and send Play.

Pass: same identity reconnects; new manifest/control work; no duplicate screen/re-pair.

### SMK-007 — Server restart

Play cached 90 s item, restart `lessoncue.service`, observe playback/status/controller.

Pass: local playback continues; server returns ready; communication recovers without re-pair.

### SMK-008 — Update page

Record versions/result; Check now twice sequentially. If no update, Install absent. If available, use section 8.

Pass: coherent state and no false permanent Installing.

## 8. Native Linux server update regression

### UPD-001 — Historical upgrades

For every source version: restore baseline, capture invariants, verify ready, install target via browser, record availability/systemd, wait ready, compare invariants, test upload/manifest/control/conversion/backup.

Pass: exact target, ready, no data/settings/assignment loss, protected snapshot exists, all workflows pass.

### UPD-002 — Exact reported contention

Reported symptom:

> LessonCue update could not be started. Another protected LessonCue operation is already in progress. Failure reference: `0HNNFS12D541V:0000000D`.

On the target:

1. Open update page in two independent sessions.
2. Confirm Install within 100 ms in both.
3. If safe, repeat at API level using two authenticated sessions.
4. Capture both HTTP statuses/JSON.
5. Count actual updater executions.
6. Let accepted operation finish.
7. Refresh both; run Check now.

Pass:

- Exactly one HTTP 202.
- Loser gets HTTP 409 with `failureCode: operation-in-progress`, not 500.
- No duplicated `Failure reference`/`Reference` for expected contention.
- Exactly one protected operation.
- Accepted operation completes or records one durable actionable failure.
- Neither browser stays stuck Installing.

### UPD-003 — Repeated click

Attempt rapid mouse/Enter/touch resubmission; record requests.

Pass: client and server permit one operation; UI recovers.

### UPD-004 — Path consumption

Immediately after 202:

```bash
date --iso-8601=ns
sudo systemctl status lessoncue-update.path lessoncue-update.service --no-pager
sudo stat /var/lib/lessoncue/config/update-request 2>&1 || true
sudo journalctl -u lessoncue-update.path -u lessoncue-update.service --since '-2 minutes' --no-pager
```

Pass: path activates service, request consumed, result eventually written.

### UPD-005 — Disabled path

On clone, disable `lessoncue-update.path`, request update, preserve evidence, then restore it.

Pass: actionable durable failure or detected unavailability; retry succeeds; no permanent Installing.

### UPD-006 — Permission regression

On historical clone reproduce root-owned request/result paths, run current repair installer, update.

Pass: updater paths become `lessoncue:lessoncue` 0600; no broader ownership; update succeeds.

### UPD-007 — Network unavailable before transaction

Block GitHub after availability but before protected download.

Pass: old app/data untouched and ready; durable download failure; retry works; no marker.

### UPD-008 — Bad signature/checksum

Private fixture/harness only; never alter public release.

Pass: rejected before execution/swap; old server ready; durable failure; no marker.

### UPD-009 — Low space

Use bounded disposable filesystem before download and during staging.

Pass: old server/data available; recorded failure; no host exhaustion; retry after freeing space.

### UPD-010 — Snapshot failure

Induce inability to create/verify pre-update snapshot on clone.

Pass: old install unchanged/restarted; clear error; no false rollback snapshot.

### UPD-011 — Readiness rollback

Use harness and full lab.

Pass: app, database, config, updater, worker, render rule, units all restored; ready; result recorded; marker cleared.

### UPD-012 — Power loss phases

VM snapshots only; cut during download, snapshot, post-marker/pre-swap, post-swap/pre-ready, post-ready/pre-observation. Boot once and capture recovery before intervention.

Pass: idempotent coherent recovery, never an empty DB, marker clears only after recovery, result recorded.

### UPD-013 — Operator rollback

After successful update create labeled post-update record; rollback as Service Admin; verify target/pre-update data, post record absent, media unchanged.

Pass: coherent rollback; App Admin forbidden; safety snapshot protects rejected rollback.

### UPD-014 — Rejected rollback

VM only; make rollback candidate fail readiness.

Pass: pre-rollback current install is restored and rejection reported; no mixed state.

### UPD-015 — Post-update communications

After every successful update verify Android and browser displays remain paired, phone control acknowledges, assignments/address/port remain, cache plays offline.

Pass: all hold.

## 9. First response for supplied update failure

Do this before retry/restart/reinstall/deletion.

### INC-UPD-001 — Visible evidence

Capture full screen and versions, exact local/UTC time, role, browser/host, other users/clicks, concurrent Settings operations, and reference `0HNNFS12D541V:0000000D`.

### INC-UPD-002 — Actual installed code

```bash
date --iso-8601=seconds
/opt/lessoncue/LessonCue.Server --version
sudo cat /var/lib/lessoncue/config/installed-version
curl -fsS http://127.0.0.1/health/ready
```

Interpretation:

- Earlier than 0.40.9: generic 500/reference presentation matches old path. Recover safely, then prove UPD-002 on 0.40.9.
- 0.40.9 or newer: log regression because expected contention is 409 without generic wrapper.
- Binary and installed-version disagreement: high-severity incomplete-update signal.

### INC-UPD-003 — Correlate trace

```bash
sudo journalctl -u lessoncue.service --since '-30 minutes' --no-pager | grep -E '0HNNFS12D541V:0000000D|protected|update|rollback'
sudo journalctl -u lessoncue-update.service -u lessoncue-update-recovery.service --since '-30 minutes' --no-pager
```

Export troubleshooting JSON and search same reference. Share only sanitized relevant records.

### INC-UPD-004 — Classify state

Read-only:

```bash
sudo systemctl show lessoncue-update.path lessoncue-update.service lessoncue-update-recovery.service \
  -p Id -p ActiveState -p SubState -p Result -p ExecMainStatus -p ActiveEnterTimestamp
sudo systemctl is-enabled lessoncue-update.path lessoncue-update-recovery.service
sudo stat /var/lib/lessoncue/config/update-request 2>&1 || true
sudo stat /var/lib/lessoncue/config/update-result.json 2>&1 || true
sudo stat /var/lib/lessoncue/update-transaction 2>&1 || true
sudo lslocks | grep -E 'lessoncue-update|/run/lessoncue-update.lock' || true
sudo journalctl -u lessoncue-update.path -u lessoncue-update.service -u lessoncue-update-recovery.service -n 250 --no-pager
curl -fsS http://127.0.0.1/health/ready
```

| Classification | Evidence | Next |
| --- | --- | --- |
| Genuine running | Service active/lock/recent progress | Wait/monitor; do not retry |
| Queued not consumed | Request exists; service inactive; path failed/disabled | Preserve; approved repair/enable |
| Interrupted awaiting recovery | Transaction marker | Never delete; approved recovery unit |
| Completed, stale browser | Result; inactive; no marker; ready | Capture/query; refresh after evidence |
| Failed early old updater | Exited; no marker/result | Capture journal; pre-0.40.9 regression; approved installer repair |
| Web `Installing=true` wedge | No service/request/result/marker; API still installing | Defect; controlled app restart is mitigation only |
| Real concurrent operation | Journal names hostname/port/connector/rollback | Let it finish; retry once |
| Unknown/mixed | No exact fit | Stop/escalate; do not force by deletion |

### INC-UPD-005 — Recovery order

1. If updater runs, wait; never launch another manually.
2. If marker exists, use recovery service with approval; never delete marker.
3. If server ready/no transaction, preserve result/journal before repair.
4. Re-run the current official native installer only as approved repair after capture.
5. Verify ready, versions, update status, invariants, TV, controller.
6. Reproduce UPD-002 on nonproduction clone.
7. Do not close as “retry worked”; identify cause and recurrence status.
## 10. Android TV/server communication suite

### COM-001 — Discovery order

Test separately:

1. Saved working address.
2. Default `lessoncue.local`.
3. Android NSD `_lessoncue._tcp` while ordinary `.local` lookup fails.
4. Manual numeric IP.
5. Non-default server port.

Pass: intended server/name, working normalized address saved, and discovery never treated as authentication.

### COM-002 — Two servers on LAN

Advertise two lab servers with distinguishable names.

Pass: saved/manual target wins when reachable; discovery choice is visible before pairing; device credential is not accepted by the wrong server.

### COM-003 — DHCP address change

Pair by numeric address, change server IP while preserving server/database identity, keep DNS-SD, relaunch TV.

Pass: new address discovered/saved, existing credential works, no duplicate screen.

### COM-004 — Pairing negative matrix

Test wrong PIN, five failures/lock, 10-minute expiry, reused completed request, revoked screen, malformed PIN.

Pass: clear rejection/rate limits; new legitimate pairing works; token never appears in later logs/UI.

### COM-005 — Revocation

Revoke paired screen and observe TV through manifest/control cycles.

Pass: unauthorized/not-found stops commands; TV clearly loses authorization and re-pairs rather than pretending stale state is online.

### COM-006 — Manifest edit burst

Make 20 saves in 60 s: rename, reorder, trim, replace media, assignment, signage.

Pass: final TV equals final server within 15 s; no crash, partial manifest, duplicate, or permanent stale state.

### COM-007 — Malformed/future manifest

Fixture/proxy sequence: valid current, additive future fields, malformed optional time, known damaged zero-offset, malformed required JSON after valid cache.

Pass: additive ignored; known offset repaired; bad optional omitted; malformed required response does not destroy last usable cache. If it does, file cache-corruption defect.

### COM-008 — Telemetry truth

Compare actual TV with Screens for idle, loading, buffering, playing, paused, seek, complete, error, background, Wi-Fi off.

Pass: state, lesson/item, position, duration, volume, version, drift, latency, free bytes, inventory, errors are accurate within ceilings.

### COM-009 — Short outage command ordering

Keep process alive, block TV/server 20 s, send Play/Pause/Seek/Resume/Next in order, restore.

Pass: commands consumed once in increasing version order; final state is expected next cue. Record intermediate visibility.

### COM-010 — Offline process death

Block traffic, send commands, force-stop/relaunch TV offline, restore.

Observe whether startup initializes to server's latest version and skips queued commands. Do not apply COM-009 expectations silently. If requirements demand process-death survival, failure is stop-ship.

### COM-011 — Burst/idempotency

Send 100 mixed commands at 100–250 ms spacing.

Pass: no version decrease/repeat, cross-screen action, crash, or readiness loss. Separate logically inapplicable commands from transport loss.

### COM-012 — Room/link isolation

With two rooms/TVs, verify room controller scope, lesson restriction, expired/revoked link, universal PIN/grant, signage-only rejection.

Any cross-room control is stop-ship.

## 11. Native Android cache suite

### CACHE-A01 — Initial population

Clear app data only on designated lab device; pair/assign sentinels; watch diagnostics. Debug builds may inspect:

```bash
adb shell run-as org.lessoncue.tv ls -lah files
adb shell run-as org.lessoncue.tv ls -lah files/media
adb shell dumpsys jobscheduler | rg -i 'lessoncue|workmanager'
```

Pass: usable manifest, each eligible item cached with correct bytes, no `.part`/`.error` after success.

### CACHE-A02 — Partial resume

Interrupt large file after 10%, verify nonzero partial, restore.

Pass: Range resume when supported; final size/SHA; atomic finalize; playback.

### CACHE-A03 — Server ignores Range

Lab endpoint returns 200 to Range.

Pass: worker restarts/replaces rather than appending a full response; checksum passes.

### CACHE-A04 — Wrong checksum

Serve bytes inconsistent with manifest SHA.

Pass: partial deleted, destination not accepted, checksum error reported, retry possible, corrupt content never played.

### CACHE-A05 — Process/reboot mid-download

Test force-stop, process kill, full reboot.

Pass: partial never treated complete; WorkManager resumes/retries; final checksum/playback pass.

### CACHE-A06 — Stable identity, new bytes

Critical stale-cache test:

1. Cache/play `RED-A-v1`.
2. Record cue/media IDs, filename, manifest version, SHA, visible content.
3. Replace through LessonCue so stable reference points to `BLUE-A-v2`.
4. Do not clear cache/data.
5. Record new manifest SHA/URL.
6. Wait ready; play online then offline.

Pass: blue/version two plays, never red/version one after reported ready; expected new bytes/job; existing destination does not block replacement.

### CACHE-A07 — Replace while playing

Replace during playback; stop and play again.

Pass: current playback does not catastrophically fail/change mid-stream; next uses verified new file.

### CACHE-A08 — Extension/profile change

Change selected derivative/profile or replacement extension while cue stays stable.

Pass: new extension/content used; obsolete file not selected by legacy `.bin` fallback.

### CACHE-A09 — Unassignment/cleanup

Cache several large lessons/signs; remove assignments; wait two manifest/status cycles; add new content under constrained space.

Pass: storage remains bounded; obsolete items reclaimed by documented policy; current assignment preserved. If nothing cleans up, file against stated free-space cleanup and record growth.

### CACHE-A10 — Low storage

Reduce usable space below next asset size.

Pass: no corrupt destination; actionable queue error; app usable; freeing space retries; existing cache intact.

### CACHE-A11 — Diagnostics count accuracy

Compare media files, complete files, `.part`, `.error`, obsolete files, `cachedItems`, `totalItems`, inventory, queue.

Pass: readiness is based on complete verified assigned items, not raw directory entry count. Report mismatch even if playback works.

### CACHE-A12 — Offline schedule

Cache pre-roll and trimmed countdown; disconnect before pre-roll; leave app active.

Pass: pre-roll, countdown at designated minus effective trim, mid-countdown seek, and lesson start all work offline by TV clock.

### CACHE-A13 — Clock drift

Test correct, +2 min, -2 min, restore auto time.

Pass: diagnostics exposes drift; schedule matches device clock; correction restores behavior without pairing.

## 12. Browser display/service-worker cache

### CACHE-B01 — Policy

In dev tools inspect service worker and Cache Storage. Verify non-media shell/API uses network; only same-origin `/api/v1/media/*` audio/image/video is cache candidate.

Pass: no stale admin/API/app shell after update.

### CACHE-B02 — Population/offline

Assign future/active signage; wait `lessoncue-signage-v1`/ready; disconnect. Reload only if offline reload is a requirement; otherwise keep active.

Pass: documented cached signage continues; expectation for reload recorded; embedded last-known widget data/fallback rather than blank.

### CACHE-B03 — Versioned replacement

Replace red with blue behind same signage identity.

Pass: URL query/version changes, old request removed, new cached, offline shows blue.

### CACHE-B04 — Assignment cleanup

Cache disjoint Sign A then B.

Pass: A removed when no longer scheduled; B remains. Verify one browser profile paired to different screens does not unexpectedly delete another screen's required cache.

### CACHE-B05 — Cache fetch failures

Interrupt and separately return 401, 404, 500, truncated body, quota exceeded.

Pass: not marked ready; diagnostics error; retry. Record that browser cache uses HTTP integrity and does not independently verify manifest SHA; raise requirement if end-to-end verification is expected.

### CACHE-B06 — Server update while open

Play cached media while server updates/restarts.

Pass: playback continues where browser permits; reconnection gets new manifest/app; no stale shell; pairing persists.

## 13. Android APK updater

Do not confuse with server updater.

### APK-001 — Artifact identity

Verify `lessoncue-tv.apk`, `update.json`, store APK/AAB: package `org.lessoncue.tv`, versions, permanent certificate, metadata size/SHA, HTTPS allowlisted URL, increasing code.

Pass: exact match.

### APK-002 — Sideload happy path

Install previous production-signed sideload, pair/cache/change settings, update in app.

Pass: system confirmation, in-place install, data/pairing/settings/assignment/cache retained, version increases.

### APK-003 — Unknown-source permission

Test deny, return unchanged, grant, unavailable activity if possible, later revoke.

Pass: no loop; clear manual path; app usable; retry resumes verified install.

### APK-004 — Confirmation cancel

Cancel Android system screen then retry.

Pass: retryable cancellation, no false success, later success.

### APK-005 — Network/process interruption

Interrupt metadata, APK download, redirect; kill app mid-download.

Pass: partial never accepted; retry; playback/pairing usable.

### APK-006 — Rejection matrix

Private fixtures: wrong schema/channel/host/protocol/hash/size/package ID/version code/signing key and oversized metadata/APK.

Pass: each rejected before install with specific message.

### APK-007 — Android 9–12 certificate

Production-signed in-place update on Shield/API 28–32.

Pass: correct accepted; wrong rejected; no false incompatible certificate.

### APK-008 — Low storage

Constrain before download and PackageInstaller commit.

Pass: clear error, no app-data loss, cleanup/retry works.

### APK-009 — Store policy

Install actual store flavor.

Pass: no update control/GitHub traffic/unknown-source request/installer permission/receiver; playback/cache parity.

### APK-010 — Mandatory update

Private metadata with controlled mandatory/minimum values.

Pass: only below-minimum blocked; D-pad can reach download/permission/error/retry; at/above minimum not blocked.

### APK-011 — Roll-forward recovery

Lab build only: recover flawed version with higher code/same key.

Pass: in-place correction preserves data. Never use production keys outside release system.

## 14. Playback, schedule, remote, signage

### PLAY-001 — Media types

Local video/audio/image, converted video, slides, webpage, YouTube/embed, fallback.

Pass: supported renders; online types clearly fail offline; unsupported shows explanatory navigable card.

### PLAY-002 — Cue properties

Test trim, fades, fit/fill/letterbox, rotations, crops, background, volume/mute, speed, repeat, still duration, transition, notes, all end behaviors.

Pass: TV matches manifest/browser preview within media timing tolerance.

### PLAY-003 — Physical remote

Tap/hold Left/Right, Play, Pause, Play/Pause, Select, media Previous/Next, Rewind/Fast-forward, Back.

Pass: tap cue, hold 5 s seek, transports, Back to plan, no double action.

### PLAY-004 — Schedule boundaries

Before/during pre-roll, exact countdown start, midway, exact designated start, missed start.

Pass: playback rules use absolute instants/effective trim.

### PLAY-005 — Emergency interruption

Start lesson, activate emergency sign, remove it.

Pass: appears within 15 s; state/position retained; resumes; Stop clears intended resume; controller truth coherent.

### PLAY-006 — Signage matrix

Always/scheduled/future cache/priority/targets/multi-zone/content lists/audio/clocks/QR/Wi-Fi/cached widgets/streams/browser-only audience fallback.

Pass: targeting/capabilities correct; no blank unsupported Android element.

### PLAY-007 — Display lifecycle

Off/on, HDMI switch, screensaver, background/foreground, sleep/wake, reboot.

Pass: document model behavior; no duplicate playback/lost pairing; make unattended claims only for passing models.

## 15. Soak and intermittent hunt

### SOAK-001 — 24 hours

Three screens; six transitions; command each 5–15 min; edit each 30–60 min; replace asset twice; one normal server restart; flap one TV every two hours.

Every five minutes collect readiness, CPU/RAM, disk/inodes, last-seen age, manifest version, control/ack delta, failures, free bytes, playback, error count.

Pass: no unexplained disconnect >60 s, stale online manifest >15 s, applicable unacknowledged command >38 s, resource runaway, cache poisoning, crash, duplicate, loss.

### SOAK-002 — Update repetition

From identical disposable snapshots, repeat previous-to-current 20 times including five races.

Pass: 20/20 coherent; one updater/race; no missing result/stuck Installing.

### SOAK-003 — Replacement repetition

Alternate red/blue behind same stable identity 20 times, verify ready/offline each.

Pass: 20/20 latest content; bounded storage; no reversion.

### SOAK-004 — Command stress

1,000 commands with expected state and periodic 20 s faults.

Pass: monotonic versions, no cross-screen action/server error, final state correct after recovery.

## 16. Troubleshooting decision trees

### 16.1 Cannot find server

1. Phone on TV LAN opens `http://SERVER-IP/.well-known/lessoncue`.
2. If fail: readiness, port, firewall, VLAN, client isolation.
3. If IP works/`.local` fails: NSD/Avahi; reserved IP is temporary mitigation.
4. Wrong server: capture advertisements/server IDs.
5. Include non-default port.
6. After address change inspect update service and Avahi journals.

Never clear app data before preserving address/identity/network evidence.

### 16.2 Online TV misses edits

1. Record server manifest JSON/version for screen.
2. Record Android reported version.
3. Wait 15 s.
4. Confirm authenticated GET 200 through app evidence.
5. Check parse/time/cache errors.
6. Compare assignment/platform.
7. Stale server JSON: DB version/invalidation.
8. Fresh JSON/stale TV: poll/parser/lifecycle/cache.
9. Updates only after data clear: cache invalidation defect; clear is not fix.

### 16.3 Controller sent, TV does nothing

1. Capture command version/action/screen.
2. Confirm selected room/screen and server control version.
3. Compare acknowledgement.
4. No increment: controller authorization/API.
5. Increment/no ack: TV poll/network/auth.
6. Ack/no visible apply: action applicability/player; acknowledging unapplied action is defect.
7. TV acted/controller stale: heartbeat/admin refresh.
8. Ensure no other screen acted.

### 16.4 Old media after replacement

1. Do not clear cache.
2. Record IDs/version/profile/URL/SHA/size.
3. Record TV manifest/expected data.
4. Check new unique WorkManager job.
5. Inspect destination/partial/error on lab debug.
6. Play online/offline; identify sentinel.
7. Classify stale manifest, unscheduled job, failure, finalize, or legacy selection.
8. File before workaround.

### 16.5 Download queued/failed

Check URL/auth host without token, network/status/Range/content length/SHA/free bytes/WorkManager, sidecar timestamps, server readiness/derivative. Restore prerequisite; observe automatic retry. Required manual restart is failure unless designed.

### 16.6 Cached but playback fails

Verify complete size/SHA, codec/container vs decoder, exact selected profile/extension, ExoPlayer error/logcat, differential known-good player. “Cached” corrupt/unplayable state is diagnostic defect too.

### 16.7 Browser display stale

Check no-store manifest, active worker/cache keys, media URL version. Identify manifest vs shell vs media vs widget. Preserve keys/headers before clearing/unregistering.

## 17. Release acceptance

**NO-GO** without explicit human waiver for:

- Unreliable update from any supported deployed source.
- Contention returns 500, duplicates references, runs multiple operations, or sticks Installing.
- Mixed/unreadable state after update/rollback.
- Failed boot recovery.
- Pairing/assignment/cache loss after update.
- Wrong-screen/room control or command corruption.
- Online Android final manifest stale >15 s.
- Stale old content after replacement reports ready.
- Partial/corrupt media reported cached or played.
- Required offline schedule/playback failure.
- Sideload in-place update failure on Android 9–12/current devices.
- Store external updater behavior.
- Blank unsupported content without fallback.
- Security, loss, credential, or signing defects.

Numerical gate:

- 100% critical smoke per client family.
- 100% server source-version matrix.
- 100% required update recovery/fault rows.
- 100% isolation rows.
- 100% stale replacement rows.
- All automated gates.
- No open S0/S1.
- S2 needs owner, workaround, risk, explicit waiver.

## 18. Severity

| Severity | Definition | Examples |
| --- | --- | --- |
| S0 | Security/data catastrophe | Wrong-room control, credential leak, unrecoverable rollback |
| S1 | Core workflow unavailable/unreliable, no safe workaround | Intermittent update wedge, offline playback failure, stale replacement |
| S2 | Major degradation with safe workaround | Numeric-IP requirement on a supported model, excess ack delay |
| S3 | Minor functional/usability | Confusing text, noncritical diagnostics mismatch |
| S4 | Suggestion | Better copy or telemetry |

Intermittence never reduces impact severity.

## 19. Defect template

```markdown
# DEFECT-NNN — Short observed failure

- Severity:
- First failing test ID:
- Run ID:
- Frequency: attempts / failures
- First bad version:
- Last known good:
- Server version/architecture/OS:
- Client model/OS/API/distribution/version:
- Network profile:
- Exact UTC/local time:
- Role:

## Expected

Copy the plan pass condition.

## Observed

Direct observation and exact status/code/reference only.

## Minimal reproduction

1. Step.
2. Step.

## Timeline

Request, action, heartbeat, restart, updater phase timestamps.

## Evidence

- Screenshot/video:
- Sanitized HTTP:
- Server journal:
- Updater/recovery journal:
- Android logcat/diagnostics:
- Manifest version and media SHA/size:

## Classification

Update: running, queued-not-consumed, interrupted, stale browser, missing result, web wedge, other operation, unknown.

Cache: stale manifest, unscheduled job, download, checksum, finalize, stale destination, cleanup, unknown.

## Workaround and safety

State data/pairing/cache impact. Clearing data is not a fix.

## Suspected component

Inference only; distinguish from proof.
```

## 20. Final checklist

- [ ] Environment/matrix complete.
- [ ] Reported contention reproduced on pre-fix code if available.
- [ ] Target proves HTTP 409 and exactly one updater.
- [ ] Every failed update has durable result and clears false Installing.
- [ ] Power-loss recovery and rollback pass.
- [ ] Android discovery/pairing/manifest/control/ack/telemetry/reconnect pass.
- [ ] Same-identity red-to-blue replacement passes online/offline 20/20.
- [ ] Partial, checksum, low storage, process death, unassignment, cleanup tested.
- [ ] Browser service-worker cache replacement/cleanup pass.
- [ ] Sideload update passes Android 9–12, current Google TV, Fire TV.
- [ ] Store has no external updater behavior.
- [ ] Physical remote and playback property matrix pass.
- [ ] Offline schedule passes with correct/drifted clocks.
- [ ] Two-room isolation passes.
- [ ] 24-hour soak passes or explicit waiver.
- [ ] Evidence sanitized/linked.
- [ ] Recommendation follows section 17.
