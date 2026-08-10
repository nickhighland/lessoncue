# LessonCue AI-executable real-use and product-quality stress test

Version: 2026-08-10

Audience: an AI test operator with browser automation, shell/SSH access, API access, and Android Debug Bridge (ADB)

Scope: the current LessonCue server, administration UI, controllers, browser displays, Android TV app, audience pages, media pipeline, and signage preview feature

## 1. Mission

This is not a click-through checklist. The executing AI must use LessonCue the way a Service Admin, App Admin, Editor, Viewer, volunteer controller, audience member, and television would use it during real events. It must prove that the product works, notice where it is hard to understand or inefficient, and recommend improvements grounded in evidence.

The run has four equal goals:

1. **Functional correctness:** actions save, processing completes, displays show the right content, permissions hold, and recovery works.
2. **Real-use resilience:** LessonCue survives concurrent uploads, many respondents, multiple controllers and screens, network interruptions, restarts, long playback, and storage pressure.
3. **Experience quality:** pages look intentional at relevant sizes; focus, labels, feedback, empty states, error recovery, terminology, and workflows make sense to a first-time operator.
4. **Product discovery:** the AI identifies defects, unnecessary steps, unclear concepts, missing safeguards, and features that would materially improve preparation or live operation.

An automated assertion is evidence, not the whole result. A green API response does not prove that the screen looks good. A good screenshot does not prove that the saved state survives a restart. Verify important outcomes through at least two of UI state, display output, API state, persisted state, logs, or media inspection.

For a focused interface audit, use the companion [AI user-centered UI evaluation brief](ai-ui-evaluation-brief.md). It carries the same evidence-first rules while giving the evaluator a persona-based workflow, visual/usability observation rubric, known Settings requirements, and a concise handoff prompt.

## 2. Non-negotiable operator rules

### 2.1 Authorization and isolation

- Use only a disposable test installation or an explicitly designated QA server. Never run destructive, disk-pressure, update, restore, or fault-injection procedures on production.
- Prefix every account, class, lesson, media item, screen, poll, layout, playlist, schedule, and code created by this run with `QA-<RUN_ID>-`.
- Delete or change only records created by this run. If ownership cannot be proved, leave the record and report it.
- Before destructive tests, create an encrypted backup, copy it off-server, record its SHA-256, and prove that it restores on a second disposable instance.
- Use synthetic media and synthetic audience text. Never put real people, copyrighted event media, production email recipients, or confidential calendar data in the run.
- Store credentials in environment variables or a secret store. Never write passwords, session cookies, bearer tokens, API keys, pairing PINs, backup passwords, or complete configuration files to evidence.
- Test outbound email only with a designated sink such as Mailpit or a controlled test inbox. Test external feeds only with controlled fixtures where possible.

### 2.2 Stop conditions

Stop mutation immediately, preserve the first failure state, and notify the human owner if any of these occurs:

- possible loss or corruption of data not created by this run;
- one classroom or controller affects the wrong screen;
- an unauthorized role reaches a protected page or API;
- a secret appears in a browser response, display manifest, log, backup, screenshot, or Git artifact;
- restore or rollback cannot return the server to readiness;
- repeated HTTP 500 responses exceed 1% of requests for two consecutive minutes;
- the database reports corruption, the server enters a restart loop, or disk/inode availability falls below the safety floor in section 20;
- the AI cannot identify whether an action is production-impacting.

Do not “fix forward” before capturing the failed UI, browser console, relevant network request, sanitized logs, affected IDs, and time range. Retrying successfully does not convert the original failure into a pass.

### 2.3 Result vocabulary

Every test ID receives exactly one state:

| State | Meaning |
| --- | --- |
| `PASS` | Every stated observation was directly verified and evidence was saved. |
| `FAIL` | At least one expected result was violated, including intermittent or recovered violations. |
| `BLOCKED` | A named prerequisite outside the AI's control was unavailable. |
| `INCONCLUSIVE` | The AI ran the procedure but evidence cannot distinguish pass from fail. |
| `NOT RUN` | The procedure was intentionally omitted; record the approving human and reason. |

Never infer `PASS` from a prior run, source inspection, or a different client family.

## 3. The AI product-critic contract

After every journey, the AI must ask more than “did it work?” Record observations under these lenses:

1. **Discoverability:** Could a new operator find the next action without prior knowledge?
2. **Comprehension:** Are terms, grouping, field hints, statuses, and consequences clear? Record the exact confusing words.
3. **Efficiency:** Count clicks/taps, page changes, repeated data entry, waiting, and backtracking. Flag avoidable work.
4. **Feedback:** Does the product acknowledge input, show progress, explain delays, and give a safe recovery path?
5. **Error prevention:** Does it prevent invalid, destructive, cross-room, or irreversible choices before they happen?
6. **Consistency:** Do equivalent actions look, read, and behave alike across pages and clients?
7. **Live-use confidence:** Can a rushed volunteer tell what is playing, what happens next, which room is controlled, and whether the command arrived?
8. **Accessibility:** Is the same task possible by keyboard, screen reader, touch, and TV remote, with visible focus and sufficient contrast?
9. **Visual quality:** Is hierarchy clear? Are spacing, alignment, typography, density, empty states, and responsive behavior intentional?
10. **Capability gaps:** What reasonable user goal is unavailable, excessively manual, or only possible by leaving LessonCue?

For each observation, classify it as:

- `DEFECT`: promised or reasonable behavior is broken;
- `USABILITY`: behavior works but is confusing, slow, risky, or visually weak;
- `ACCESSIBILITY`: a person using assistive input or output is disadvantaged;
- `RELIABILITY`: behavior is intermittent, slow, resource-sensitive, or hard to recover;
- `FEATURE`: a new capability would materially improve a validated journey;
- `DELIGHT`: a small refinement would make the experience feel more polished.

Do not turn personal taste into a recommendation. A recommendation needs a screenshot, recording, timing, user-journey observation, repeated pattern, or comparison with an existing LessonCue convention. The AI may propose a better flow or wireframe in the finding, but must not implement product changes during this test unless separately authorized.

### 3.1 Recommendation score

Score each recommendation from 1–5:

| Dimension | 1 | 3 | 5 |
| --- | --- | --- | --- |
| User impact | cosmetic edge | recurring friction | blocks or risks a core/live task |
| Reach | rare specialist | one common persona | most users or every event |
| Confidence | hypothesis | repeated observation | reproduced with direct evidence/user rule |
| Effort | architectural | moderate feature | small isolated change |
| Risk reduction | none | prevents confusion | prevents data loss, security, or wrong-room action |

Use `priority = (impact × reach × confidence) + risk reduction + effort`. The effort value intentionally rewards feasible improvements. Also state dependencies and the smallest useful version of the change.

## 4. Required tools and inputs

The AI may substitute equivalent tools but must record the substitution.

- Browser automation with screenshots, accessibility tree access, console and network capture, multiple isolated browser contexts, viewport/emulation controls, and QR decoding.
- Shell access to the test workstation and SSH access to the test server.
- `curl`, `git`, Docker/Compose where the install uses containers, SQLite read-only inspection where authorized, `jq`, `ffmpeg`/`ffprobe`, ImageMagick or equivalent, LibreOffice, Poppler, and SHA-256 tools.
- Node.js/npm and .NET SDK versions required by the repository.
- Android SDK, emulator, ADB, Gradle/JDK, and both sideload and store build variants for Android TV coverage.
- A disposable mail sink, deterministic local HTTP fixture server, local RSS/ICS/JSON endpoints, and a controllable HLS stream.
- Optional network shaping (`tc netem` on a disposable Linux path or a proxy such as Toxiproxy). Never shape the user's general network interface.
- At least one browser display and one Android TV emulator. Physical Google TV/Fire TV coverage is a separate release gate when those devices will ship.

Record these run variables in `environment.md`:

```text
RUN_ID=LC-YYYYMMDD-HHMM-<candidate>
BASE_URL=http(s)://<test-host>
SERVER_HOST=<ssh alias, never a password>
SOURCE_COMMIT=<40-character SHA>
SERVER_VERSION=<reported version>
ANDROID_VERSION=<version name/code>
TIME_ZONE=<IANA zone>
SERVICE_ADMIN=<test username>
APP_ADMIN=<test username>
EDITOR=<test username>
VIEWER=<test username>
MAIL_SINK=<controlled recipient/domain>
FIXTURE_ORIGIN=<controlled HTTP origin>
TEST_CLASS=QA-<RUN_ID>-Room-A
TEST_CLASS_B=QA-<RUN_ID>-Room-B
```

## 5. Evidence package

Create this directory before testing:

```text
test-runs/<RUN_ID>/
  run-summary.md
  environment.md
  timeline.md
  results.csv
  release-recommendation.md
  coverage.md
  fixtures/manifest.csv
  evidence/screenshots/
  evidence/video/
  evidence/network/
  evidence/logs/
  evidence/media/
  findings/DEFECT-NNN.md
  findings/OBS-NNN.md
  findings/IDEA-NNN.md
```

`results.csv` columns:

```csv
test_id,journey,persona,client,start_time,end_time,result,observed,expected,evidence,issue_id,notes
```

Each finding must contain:

```markdown
# <ID> — <short outcome-focused title>

- Classification:
- Severity: stop-ship / high / medium / low
- Recommendation priority:
- Personas affected:
- Build and environment:
- Confidence:

## User goal
## Exact reproduction
## Observed result
## Expected or better result
## Evidence
## Why it matters in real use
## Root-cause evidence or hypothesis (label hypotheses)
## Recommended change
## Smallest useful version
## Alternatives and tradeoffs
## Acceptance criteria
```

Sanitize all evidence. Preserve original timestamps. Use filenames beginning with the test ID, for example `SIGN-104-android-tv-1080p-after-publish.png`.

## 6. Fixture catalog

Create deterministic, unmistakable fixtures. Record filename, SHA-256, byte length, dimensions, duration, container, video/audio codecs, page/slide count, and expected processing path in `fixtures/manifest.csv`.

### 6.1 Sentinel visual and sound design

Every playable fixture must visibly and audibly identify itself so stale-cache and wrong-item errors are obvious:

- `RED-A-v1.mp4`: solid red, large “RED A — VERSION 1,” running timecode, spoken name, 20 seconds.
- `BLUE-A-v2.mp4`: blue replacement for the same media identity, large “BLUE A — VERSION 2,” timecode, spoken name, 20 seconds.
- `GREEN-B-90s.mp4`: green, second counter, spoken marker every five seconds.
- `PORTRAIT-C.mp4`: 1080×1920 with corner labels to reveal crop/fit/rotation errors.
- `STEREO-D.wav`: alternating spoken “left” and “right.”
- `IMAGE-C.png`: 1920×1080 checkerboard, labeled corners, center crosshair, fine and large text.
- `PORTRAIT-D.jpg`: 1080×1920 labeled top/bottom.
- `TRANSPARENCY-E.webp`: alpha/background diagnostic.
- `THREE-SLIDE.pdf`, `.pptx`, and `.odp`: numbered red/green/blue slides with edge rulers.
- `FORMATTED-DOC.docx`: headings, table, colored shapes, page break, and footer.
- `CALENDAR.ics`, `NEWS.rss`, `WEATHER.json`: fixed timestamps and distinctive labels served by the controlled origin.
- HLS test stream: moving timecode, audio marker, and a switchable online/offline state.

### 6.2 Accepted media-extension matrix

Generate a small valid representative for every currently accepted extension. A family may share encoded content only when the container/signature remains genuinely valid.

| Family | Extensions to exercise |
| --- | --- |
| Video | `.mp4`, `.m4v`, `.mov`, `.mkv`, `.webm`, `.avi`, `.wmv`, `.asf`, `.mpeg`, `.mpg`, `.mpe`, `.m1v`, `.m2v`, `.ts`, `.mts`, `.m2ts`, `.mxf`, `.flv`, `.f4v`, `.ogv`, `.ogm`, `.3gp`, `.3gpp`, `.3g2`, `.3gpp2`, `.vob`, `.rm`, `.rmvb`, `.nut`, `.ivf`, `.y4m`, `.h264`, `.264`, `.h265`, `.hevc`, `.265`, `.mjpeg`, `.mjpg` |
| Audio | `.mp3`, `.mp2`, `.mpa`, `.m4a`, `.aac`, `.wav`, `.flac`, `.ogg`, `.oga`, `.opus`, `.wma`, `.aiff`, `.aif`, `.aifc`, `.amr`, `.ac3`, `.eac3`, `.au`, `.snd`, `.caf`, `.mka`, `.ape`, `.wv`, `.tta`, `.voc`, `.spx` |
| Image | `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`, `.tif`, `.tiff`, `.avif`, `.heic`, `.heif`, `.jxl`, `.ico`, `.jp2`, `.j2k`, `.jpf`, `.jpm`, `.mj2` |
| Presentation/document | `.pdf`, `.ppt`, `.pptx`, `.pps`, `.ppsx`, `.pot`, `.potx`, `.pptm`, `.ppsm`, `.potm`, `.odp`, `.otp`, `.odt`, `.ott`, `.ods`, `.ots`, `.fodp`, `.fodt`, `.fods`, `.key`, `.pages`, `.numbers`, `.doc`, `.docx`, `.docm`, `.dot`, `.dotx`, `.dotm`, `.xls`, `.xlt`, `.xla`, `.xlsx`, `.xlsm`, `.xltx`, `.xltm`, `.xlam`, `.rtf`, `.txt`, `.md`, `.csv`, `.tsv` |

For every extension record one of:

- `ready-direct`: playable without conversion;
- `ready-converted`: processing produced a screen-safe asset;
- `ready-slides`: document converted to the expected numbered PNG pages;
- `failed-actionably`: accepted for inspection but a missing converter or unsupported content produces a clear, correct failure;
- `blocked-fixture`: no valid fixture could be produced; never substitute a renamed file.

Also generate:

- zero-byte, truncated, and random-byte files for one extension in each family;
- a valid PNG renamed `.mp4` and a valid MP4 renamed `.jpg`;
- a ZIP renamed `.pptx` without `ppt/presentation.xml`;
- a path-like filename, Unicode filename, emoji filename, 200-character basename, duplicate filename, uppercase extension, and extensionless file;
- an MP4 with a TV-incompatible codec that should become H.264/AAC 720p and 480p copies;
- a large file greater than 24 MiB so it spans multiple 8 MiB chunks;
- files just below, exactly at, and just above configured size/quota boundaries.

Do not treat all conversion failures as product defects. Determine whether LessonCue promised the path, whether prerequisites are installed, and whether the error tells an administrator exactly how to recover.

## 7. Execution model and checkpoints

Run phases in order. The AI may resume at a checkpoint only after proving the server version, fixture hashes, database identity, and created-object inventory still match.

1. Preflight and clean baseline.
2. Identity, roles, registration, and settings.
3. Class, lesson, template, and calendar preparation.
4. Media ingestion and processing.
5. Screens, controller, remote, and playback.
6. Audience interactions.
7. Signage creation, publishing, and visual review.
8. Accessibility and responsive review.
9. Concurrency, soak, and reversible faults.
10. Backup/restore, cleanup, analysis, and recommendation report.

Checkpoint after each phase: export created IDs, capture health/resource state, capture recent errors, and update `coverage.md`. Never continue a stress ladder after a stop condition.

## 8. Preflight and baseline procedures

### INST-001 — Clean supported-OS installation

On fresh, snapshotted x86_64 and arm64 Debian/Ubuntu VMs for every operating-system version claimed by the installer:

1. Start with no `curl`, `git`, Docker Engine, Compose plugin, FFmpeg, LibreOffice, Poppler, or application files unless the base OS includes them.
2. Run the documented install script exactly as a new administrator would. Capture commands, package sources/versions, prompts, elapsed time, reboots, services/containers, firewall changes, created users/groups/paths, and final URL.
3. Verify the script installs or clearly validates every prerequisite it owns: CA certificates, `curl`, `git`, Docker Engine and Compose when the deployment uses them, media/document converters, and any service/discovery dependency.
4. Confirm rerunning the script is idempotent and preserves data/configuration; interrupt it once at a reversible package/download boundary and verify a rerun recovers.
5. Complete first-run account setup, sign in, upload each sentinel family, convert a presentation and incompatible video, pair browser/Android TV displays, and run one lesson.

Pass: a clean supported VM reaches ready without undocumented manual repair; required processing paths work, not merely the home page.

### INST-002 — Hostname, port, firewall, and coexistence

Install with the designated non-production `.local` name, then test numeric IP, hostname, mDNS from Linux/macOS/Android where applicable, configured port, reboot persistence, and a second unrelated local service. Verify LessonCue neither overwrites another installation nor binds an unexpected public interface/port. Test name collision and occupied port on a disposable snapshot; the installer must stop or explain a safe alternative.

### INST-003 — Kernel, container, and prerequisite compatibility

Across the oldest and newest supported kernels, record kernel, libc, systemd, cgroup mode, Docker/Compose versions, storage driver, filesystem, CPU features, architecture, `/dev/dri` availability, and security confinement. Repeat upload completion, thumbnail/waveform generation, document conversion, adaptive transcode, backup, restart, and health checks.

If a sandbox, container runtime, codec, hardware-acceleration, `io_uring`, namespace, seccomp, AppArmor/SELinux, or filesystem capability is unavailable, verify LessonCue uses a documented software/fallback path or reports the exact prerequisite. Classify a failure as platform-specific only after reproducing it on at least two kernels/configurations or identifying direct kernel/runtime evidence. Never generalize one VM result to “all setups.”

### INST-004 — Upgrade, uninstall, and reinstall safety

On snapshots, test upgrade from the oldest supported deployed version and the immediately previous release, an already-current rerun, and reinstall after package/container loss with the data volume preserved. Exercise documented uninstall with keep-data and remove-test-data choices where offered. Resolve exact paths before deletion, confirm the choice and backup, and prove unrelated Docker resources/files remain untouched.

### PRE-001 — Identify the exact candidate

1. Record commit, branch, dirty state, server version, web asset version, Android version name/code, install method, OS/kernel/architecture, browser versions, emulator API/device profile, screen resolution, and network path.
2. Confirm the installed server corresponds to the candidate commit. If not, stop with `BLOCKED`.
3. Capture `/health/live`, `/health/ready`, the discovery document, service/container status, and recent sanitized logs.

Pass: every tested artifact has an unambiguous version and the server is ready.

### PRE-002 — Resource and clock baseline

Capture disk bytes/inodes for the application data path, RAM/swap, CPU/load, process/container limits, GPU/render-device availability, time synchronization, configured IANA time zone, DNS and `.local` resolution. Record baseline request latency with 30 readiness requests.

Pass: time is correct; median and p95 latency are recorded; free disk remains above the safety floor.

### PRE-003 — Restore gate

1. Create a realistic seed set or use a disposable seeded copy.
2. Export an encrypted `.lcbak`; copy it off-server; record size and SHA-256.
3. Restore to a second disposable instance.
4. Compare counts and sampled identities for organization, roles, classes, lessons, cue order/options, media metadata and hashes, screens, signage, audience data allowed by backup policy, and settings.
5. Record exclusions such as secrets or pairing credentials and confirm they match documentation.

Pass: the restored instance is ready and documented included/excluded data matches exactly. Destructive later phases are blocked otherwise.

### PRE-004 — Existing automated gates

Run repository formatting/lint, TypeScript typecheck and build, .NET tests, browser E2E, accessibility automation, Android unit tests, lint, builds, and TV instrumentation appropriate to the candidate. Record commands and unabridged outputs. Do not let these results replace the real-use procedures.

## 9. Identity, registration, roles, and account security

### AUTH-001 — First-time and ordinary sign-in

Test first-run setup on a clean disposable instance, ordinary sign-in, incorrect password, blank fields, very long input, Unicode username where permitted, session persistence, explicit sign-out, back-button behavior after sign-out, and direct navigation to an authenticated URL.

Observe copy, focus placement, password-manager compatibility, error association, lockout/rate-limit behavior, and whether recovery is discoverable without revealing account existence.

### AUTH-002 — Default and custom permission matrix

Create test accounts for Service Admin, App Admin, Editor, Viewer, and one custom-permission account for each permission:

`planning.manage`, `uploads.manage`, `playback.control`, `screens.manage`, `users.manage`, `app-settings.manage`, `settings.manage`, `backups.manage`, and `updates.manage`.

For each account:

1. Sign in with a fresh isolated browser context.
2. Record visible navigation and enabled actions.
3. Attempt the matching page via direct URL.
4. Attempt at least one read and one mutation API for every granted and ungranted capability.
5. Confirm denial is 401/403 as appropriate, contains no protected data, and leaves state unchanged.
6. Change or remove permissions while the session is open and verify old privileges do not linger.

Pass: UI and server authorization agree; Service-only settings/backups cannot be delegated to a non-Service-Admin role; Viewer is read-only.

### AUTH-003 — User lifecycle and safeguards

Exercise create-with-temporary-password, forced password replacement, setup link, resend, expired/used link, edit name/username/email/role/permissions, duplicate username, password reset, pause, reactivation, and permanent deletion. Verify old sessions terminate after sensitive changes.

Attempt self-pause, self-delete, deleting/pausing the last active Service Admin, and a lower-authority administrator modifying a Service Admin. All must fail safely with understandable explanations.

### AUTH-004 — Registration modes and codes

Test Closed, approval-required, open verified-email, and code-required modes. For codes test label, no expiration, expiration boundary, unlimited use, exact maximum uses, concurrent final-use submissions, replacement, revocation, and one-way display behavior. Verify registration codes remain part of Registration, not Email settings, in both expanded and collapsed layouts.

### AUTH-005 — Email settings and delivery

Against the mail sink, test provider none, valid provider configuration, invalid key, invalid sender, valid sender, public account-link address, save-before-test behavior, test delivery, setup/approval/reset messages, single-use links, expiration, HTML/text safety, and links behind the configured public origin. Verify provider secrets are never returned to the browser.

### AUTH-006 — Authenticator MFA

Enroll TOTP, reject an incorrect code, accept a current code, reject replay of an accepted code, verify time-window behavior, sign out/in, disable with current credentials, and exercise documented SSH recovery on a disposable server. Confirm MFA and Preview features render side-by-side at desktop width and stack meaningfully on narrow screens.

### AUTH-007 — Security and audit visibility

Confirm sensitive actions appear in Recent activity/Troubleshooting log with useful actor, action, object, timestamp, and failure reference, but no secrets. Search and retention controls must work. Test same-origin/CSRF protection, unsafe method without authentication, hostile HTML in names/titles, and rate limits without attempting denial of service.

Product-critic prompts: Is it clear why a role cannot receive a permission? Are Registration, Email settings, MFA, and troubleshooting grouped as users expect? Can an administrator understand what will invalidate a user's session? Are dangerous actions visually distinct and reversible where possible?

## 10. Dashboard and navigation

### DASH-001 — Empty, populated, degraded, and live states

Capture Dashboard with no classes/media/screens/activity, with a realistic populated setup, with one offline screen, with an active lesson, and during a processing failure. Validate counts, upcoming ordering, time zone, screen health, pairing information authorization, links, and refresh behavior.

### DASH-002 — Global navigation and state

Navigate every available top-level destination by mouse, keyboard, browser history, deep link, refresh, and narrow/mobile navigation. Verify current-page indication, title, skip link, focus destination, unsaved-form warning where applicable, and preserved/non-preserved filters intentionally.

Product-critic prompts: Does the dashboard answer “what needs attention now?” Can a first-time user infer the preparation sequence? Are empty states attractive, balanced, and useful rather than cramped or visually accidental? Identify duplicated concepts and missing cross-links.

## 11. Classes/classrooms, lessons, templates, and calendar

LessonCue currently models classrooms as **Classes**. The AI must use both a one-room and multi-room scenario and record if the terminology causes confusion.

### CLASS-001 — Class lifecycle

Create Room A and Room B with distinct descriptions and theme colors. Edit name/description/color; verify controller branding. Test duplicate/blank/long/Unicode names, QR/controller path generation, temporary-link duration, optional public hostname, and local controller access configuration. Attempt delete/archive behavior with and without lessons according to the UI.

### LES-001 — Real Sunday/event preparation journey

As an Editor, create a dated lesson in Room A with:

- a looping pre-roll video;
- a private pre-roll monitor URL;
- a countdown video;
- three main cues: slide/image, video, and audio;
- an audience poll cue;
- a post-lesson loop;
- designated start, pre-roll lead, whole-lesson volume, substitute instructions, cue notes, and flexible timing.

Arrange by pointer drag and by keyboard controls. Refresh and sign out/in. Confirm order, roles, timing estimate, notes privacy, and media remain intact.

### LES-002 — Every cue option

Across representative image, video, audio, presentation slide, online media, and audience cues, exercise all applicable options: display title, role, end behavior (pause/advance/loop/stop), skip permission, cue and whole-lesson volume, mute, still/slide duration, anticipated duration, playback speed, repeat count, rotation, background/picture fit, transition and duration, crop edges, start/end trim, fade in/out, notes, flexible marker, and results timing.

Verify invalid combinations are prevented; estimates recalculate; display output matches the editor; bulk role/end/skip/title changes affect only selected cues.

### LES-003 — Add-media paths

Add content by computer upload, existing Media Library asset, direct PDF/presentation upload, Google Slides link, online media download, and Audience poll. Verify progress, cancel/recovery, retention destination, slide timing, title, role, and failure messages. Unsupported embeds must offer a clear alternative.

### LES-004 — Copy, move, bulk, print, and retention

Copy within Room A, copy to Room B, move across dates/classes, bulk-copy/move/shift lessons, and verify date-dependent availability/pre-roll/expiry shifts. Confirm an edited generated lesson detaches from its recurring schedule. Print/save the run sheet and visually inspect that navigation is absent and lesson, classroom, times, cues, notes, flexibility, and finish are legible without clipping.

### LES-005 — Scheduling conflicts and boundaries

Create overlapping estimated windows in the same room, simultaneous lessons in different rooms, midnight and DST-transition lessons, an untimed cue, and a lesson whose live estimate exceeds planned finish. Verify warnings appear only where appropriate and explain the affected times.

### TEMP-001 — Templates and recurring schedules

Create a template from the full lesson; edit defaults; replace source; create one lesson; create daily, weekly, and monthly schedules; test interval, weekday/day-of-month, term/custom range, title pattern, generate-ahead, skipped dates, restore date, edit occurrence/series behavior, pause/resume, and deletion. Verify no duplicate lesson is generated after restart or repeated scheduler runs.

### CAL-001 — Calendar views

Exercise Agenda, Day, Week, Month, and Room views; previous/next, Today, date picker, deep link, empty date, crowded date, conflicts, long titles, multiple rooms, week-start setting, time zone, DST, and links to lessons. Capture desktop and phone layouts.

Product-critic prompts: Count the steps from “I need a lesson next Sunday” to a playable room. Is **Classes** the right word when users think in classrooms? Are roles such as pre-roll/countdown/post understandable before adding media? Are basic versus advanced cue settings well separated? Could templates, calendars, or drag/drop better prevent repetitive work? Recommend automation only when it reduces an observed repeated step.

## 12. Media Library, processing, and storage

### MEDIA-001 — Upload every supported family

Upload every fixture from section 6 through the Media Library. For each:

1. Observe client-side acceptance and progress.
2. Confirm server session state and exact bytes/chunks.
3. Wait for terminal processing without arbitrary sleeps; poll documented status with a bounded timeout.
4. Verify signature-derived content type, dimensions/duration/codecs, thumbnail/waveform, and preview.
5. Play or render the complete output, not just the first frame.
6. Compare visual/audio sentinel markers and `ffprobe`/page count against the manifest.
7. Add the result to a lesson and verify it on browser display and Android TV where applicable.

Pass is per extension, not per family. A `.key` result does not prove `.pptx`.

### MEDIA-002 — Presentation conversion fidelity

Convert each valid presentation/document fixture. Compare every output slide/page at 100% and fit-to-screen. Verify order, aspect ratio, fonts, colors, images, tables, page boundaries, max resolution, and numbered sentinel text. Record converter substitutions or fidelity loss. Add all slides to a lesson with timed and untimed modes and verify sequence/order.

### MEDIA-003 — Resumable upload lifecycle

With the multi-chunk fixture exercise pause, resume, browser refresh, tab close/reopen, network drop/reconnect, client process restart, retry, cancel, same-file resume, 24-hour expiry using a controllable clock only in an isolated instance, and cleanup. Verify missing-chunk maps, ownership, reservations, released storage, and that completion happens once.

### MEDIA-004 — Integrity and hostile inputs

Upload every invalid/mislabeled fixture. Send wrong declared length, missing chunk, duplicate chunk, out-of-range chunk, changed content on resume, incorrect expected SHA, unsupported extension, archive path traversal, too many archive entries if safely generated, and unsafe filename. Verify rejection occurs before processing, the error is actionable, no partial becomes Media Library content, and reservations are released or remain retryable as designed.

### MEDIA-005 — Quotas and simultaneous reservations

Configure maximum file size, default daily allowance, active uploads/account, and user/role/class overrides. Test below/exact/above boundaries, UTC reset, two users sharing a class cap, parallel requests for the final available bytes, paused/failed reservations, and stricter-policy precedence. Verify UI and API report the same remaining/reserved capacity.

### MEDIA-006 — Codec policy and adaptive TV copies

Exercise allowed video/audio codec lists with permitted and forbidden fixtures. Queue incompatible video for H.264/AAC 720p and 480p outputs. Verify processing reaches `ready`, range requests return 206 with valid MP4 bytes, profile dimensions/codecs are correct, hardware-acceleration failure falls back to software, and the manifest chooses the correct native or adaptive asset for each display capability.

### MEDIA-007 — Organization and retrieval

Test folder/tag approval, upload destination, rename/display name, Unicode and duplicates, search, type/folder/status filters, clear search, sort if offered, grid/list views, preview, download, select visible, bulk move/tag/delete/retention, and empty/no-match states. Verify restricted uploaders cannot escape approved folders/tags by UI or API.

### MEDIA-008 — Versions and impact

Replace `RED-A-v1` with `BLUE-A-v2` under the same media identity. Before confirming, inspect current-impact references. Verify previous versions, version metadata, active lessons/signage, browser caches, and Android caches all move to blue without stale red playback. Restore a previous version if supported and repeat. Concurrent playback during replacement must either finish safely or transition according to documented behavior.

### MEDIA-009 — Delete, recycle, restore, and purge

Delete referenced and unreferenced items; validate warnings and impact. Restore from Recycling bin; verify references and bytes. Exercise retention/purge on run-owned content in a time-controlled disposable instance. Confirm purged media cannot be fetched by an old URL and storage totals reconcile.

Product-critic prompts: Can a teacher understand the difference between uploaded, processing, compatible, adaptive, and ready? Are failed uploads easy to retry without starting over? Are versions and “current impact” reassuring? Does the library help users find content at event speed? Identify where technical codec/storage language needs translation or drill-down.

## 13. Screens, pairing, and display lifecycle

### SCREEN-001 — Browser display pairing

Pair a temporary browser display with the rotating PIN, reject wrong/expired/rate-limited PINs, rename it, assign class/site/tags, open display, verify heartbeat/online state, and allow it to expire. Repeat as Permanent pairing and Signage only; confirm persistence and expected navigation/playback behavior. Revoke and prove old credentials no longer fetch protected state.

### SCREEN-002 — Android TV discovery and pairing

On a clean emulator, test discovery on the local network, manual hostname, and numeric IP fallback. Pair with correct/wrong/expired PIN, restart, force-stop, reboot, update server address, revoke, and re-pair. Confirm device name/version/capabilities, last seen, cache inventory, queue, diagnostics, and errors appear accurately in Screens.

### SCREEN-003 — Assignment isolation

Create two rooms and at least three screens: two in Room A and one in Room B. Assign/change/unassign classes and signs. Send distinct content simultaneously. Verify every manifest, cache, controller, heartbeat, and visible display remains scoped to the intended screen/class. Wrong-room output is a stop condition.

### SCREEN-004 — Diagnostics and privacy

Toggle diagnostic screenshots, request one only when allowed, verify status/recency, and confirm protected content/secrets are not exposed. Validate cache inventory, download queue, manifest version, playback state/error, network quality/latency, app version, proof-of-play if present, and stale/offline labels. UI counts must agree with device facts.

### SCREEN-005 — Lifecycle and offline cache

Prepare a lesson/sign while online; wait for complete cache; disconnect the display; restart the app/browser; play cached content; attempt online-only content; reconnect; publish replacement content; verify recovery and stale-item pruning. Fill the client cache near its quota on a disposable emulator and confirm the product communicates what is and is not ready offline.

Product-critic prompts: Can an administrator distinguish a paired, assigned, online, cached, and actually playing screen? Is troubleshooting jargon translated into next actions? Is pairing quick enough at a TV without exposing security details? Would readiness percentages, last-good-content, or a guided diagnostics action reduce observed ambiguity?

## 14. Controllers and remotes

### CTRL-001 — Authenticated room controller

Open Controller as an authorized user. Select screen and lesson, then exercise previous, play, pause, next, restart/current-item behavior, stop/clear if offered, cue jump, lesson change, volume/mute/fullscreen where applicable, notes, substitute instructions, flexible markers, timing/finish warnings, and pre-roll monitor. For every command record send time, server version, device acknowledgement, actual display action, and controller state.

### CTRL-002 — Universal and temporary controller

Open the universal controller locally, test protected/unprotected mode, correct/wrong/expired PIN, QR/link, temporary duration, explicit lock/revoke, reload, phone sleep/wake, browser history, and session expiry. Verify the controller prominently names the room/screen and cannot silently switch targets.

### CTRL-003 — Controller conflict and ordering

Use two authorized controllers on one screen and controllers in two rooms. Send simultaneous and rapidly alternating commands. Verify version ordering, no duplicate/skipped action, last accepted command behavior, acknowledgements, and isolation. Test stale controller state after another operator changes lesson or target.

### CTRL-004 — Latency and loss

At baseline and under the network profiles in section 21, record command-to-visible-action and action-to-acknowledgement latency for 30 commands. Ordinary online target: visible action within 5 seconds and acknowledgement within 8 seconds. Record p50/p95/p99 and any command over the ceiling; never average away a missed or wrong command.

### REMOTE-001 — Android TV D-pad navigation

Use ADB key events on the emulator, then repeat on a physical remote when release hardware is available:

1. Cold-launch and capture initial focus.
2. Navigate every focusable setup, lesson-choice, overlay, and transport control with Up/Down/Left/Right.
3. Activate with D-pad Center/Enter.
4. Use Back to close overlays and return without exiting unexpectedly.
5. Verify focus remains visible after content refresh, error, reconnect, and activity recreation.
6. Confirm no action requires touch, mouse, hover, or an invisible focus target.

### REMOTE-002 — Playback keys and long press

Verify short Left/Right select previous/next; held Left/Right seek without also changing cue on release; Play, Pause, Play/Pause, Fast-forward, Rewind, Stop, and Center map correctly where supported. Test key repeat, release, first/last cue boundaries, untimed image/slide, looping content, and focus inside/outside an overlay. Record both device logs and visible result.

### REMOTE-003 — Controller versus TV remote arbitration

While content plays, alternate phone-controller and TV-remote actions. Verify state converges, the UI never claims an unobserved action, and a stale acknowledgement does not overwrite a newer local action. Test remote Back during an incoming controller command.

Product-critic prompts: In a dark room under time pressure, are the current item, next item, room, play state, command delivery, and dangerous actions unmistakable? Count target changes and confirmation steps. Recommend guardrails, presets, or feedback only when supported by observed risk or delay.

## 15. Audience interaction

### AUD-001 — Session authoring

Create a session with retention values 1 and 30 days and the practical midrange. Add single-choice, multiple-choice, and written questions; reach the 20-question limit; test blank/long/Unicode/HTML-like text, option counts, required behavior if offered, ordering/editing, answer changes on/off, and live result policy. Refresh and verify draft persistence.

### AUD-002 — Join, QR, and lifecycle

Decode and open the QR/link on desktop and phone. Test invalid code, lowercase code, draft, open, closed, reset, deleted, and expired sessions. Opening/closing must not start playback or interrupt a display. QR must scan from a 1080p display at representative physical size and contrast.

### AUD-003 — Choice responses

Use isolated browser contexts as anonymous participants. Submit every option distribution, multiple choices, duplicate submit, change allowed/forbidden, refresh, local-token loss, two tabs sharing storage, and one browser in two sessions. Verify aggregates, one-response semantics, updates, privacy, and no participant token in administration UI.

### AUD-004 — Written moderation

Submit benign, empty, maximum-length, Unicode, right-to-left, emoji, multiline, URL, and HTML/script-like text. Verify pending-by-default, approve, reject/hide, re-moderate if allowed, public result filtering, safe escaping, responsive layout, and moderation at volume. No unapproved text may reach any audience or signage display.

### AUD-005 — Embedded audience display

Place the same session as a lesson cue, signage element, and signage playlist item. Exercise hide results, immediate permitted results, delayed results, open/close changes, reset, and deletion. Confirm all placements reflect current state and use the correct response QR without leaking administrative controls.

### AUD-006 — Participant stress ladder

Drive synthetic anonymous participants in stages of 1, 10, 50, 100, and 250, with realistic think time and at most one stage above the product's intended classroom size. Mix questions and written moderation. At each stage record submit success/error/429, p50/p95/p99 latency, update latency, CPU/RAM/database size, UI responsiveness, aggregate correctness, duplicate prevention, and recovery. Hold the highest passing stage for 15 minutes.

Product-critic prompts: Does “create, open, share, moderate, close” feel like one coherent flow? Is the empty state visually balanced? Can the facilitator tell exactly what participants see? Are response rules clear before opening? Suggest templates, presenter modes, moderation aids, or analytics only when they solve measured repetition or uncertainty. Preserve the product's anonymous/local privacy model in recommendations.

## 16. Signage Studio and visual conformance

Signage is a preview feature. Enable it as Service Admin, verify the navigation appears without reload surprises, and verify disabling it hides entry points while preserving saved data and ordinary lesson playback.

Test both the supported simple signage workflow and any visible Studio sections in the candidate. If a visible feature is described as historical or unsupported in current documentation, report the product/documentation conflict; do not silently skip it.

### SIGN-001 — Layout lifecycle and canvas basics

Create from each starter and from blank. Exercise name, folder, description, template/starter behavior, background, canvas dimensions, landscape/portrait, safe area, frame/full-screen layout, bottom slots (1–5), sidebar slots (1–3), preview, save/draft, publish, versioning, duplicate, rename, search/folder, and delete with references.

### SIGN-002 — Canvas editing input matrix

For representative zones exercise select, multi-select/group if offered, drag, resize every edge/corner, rotate, z-order, opacity, fit, lock/lock mode, hide/show, flip, copy/paste/duplicate, snap/grid, undo/redo if offered, and exact inspector values. Repeat essential operations by keyboard: Enter/Space select, Arrow move, Shift+Arrow large move, Alt+Arrow resize, `[`/`]` rotate, Control/Command+Arrow reorder.

Pass: preview and saved/published output agree within one CSS pixel or a documented renderer tolerance; locked/hidden items behave consistently; no operation requires only pointer input.

### SIGN-003 — Every zone type

Create a diagnostic layout containing one instance of each currently exposed zone type. Then create focused layouts so no element is judged only at thumbnail size.

| Zone | Required variants and visual confirmation |
| --- | --- |
| Text/message | short/long/multiline/Unicode/RTL; font family/size/scale/weight, italic, underline, line height, alignment, colors, rich-text runs; verify wrap, clipping, hierarchy, and safe escaping. |
| Photo/video/logo (`media`) | landscape/portrait/transparent image and short video; contain/cover/other fit, crop, opacity, mute/audio, rotation; verify corners, aspect, sharpness, frame timing, and no stale asset. |
| Live stream (`stream`) | healthy HLS, startup delay, audio, temporary drop, malformed URL, recovery, and permanent failure; verify status is understandable and fallback does not flash unrelated content. |
| Presentation area | published playlist selected, no playlist, draft playlist, stream override within/outside local boundary, and stream failure; verify loop, transitions, fallback, and item timing. |
| QR code | short/long URL, labels on all sides, left/center/right placement, sizes and color combinations; decode the screenshot and a camera view at representative distance. |
| Wi-Fi QR | WPA/WPA2, open network, escaped punctuation in SSID/password, hidden if offered; scan and inspect decoded payload without preserving the password in evidence. |
| Scrolling ticker | short/long/Unicode text, speeds, direction if offered, seamless repeat, reduced motion, and 30-minute run; check gaps, tearing, clipping, and readability. |
| Countdown | future/past target, seconds/minutes/days, weekly repeat, DST and time-zone boundary, restart; verify zero transition and no negative or frozen display. |
| Time and date | time/date/both, 12h/12h-seconds/24h/24h-seconds, long/medium/short/numeric date, time-date/date-time/inline order, separate font sizes, DST/time-zone; compare against trusted clock. |
| Weather | Open-Meteo, NWS where applicable, and controlled custom JSON; location/lat-long/postal, F/C, every field (icon, temperature, conditions, precipitation, high, low, wind), icon styles and layouts; verify freshness, units, attribution if required, cached fallback, and clear failure. |
| Calendar/events | controlled ICS, empty/busy/multiday/all-day/overlap/Unicode events, max items, each field (title/date/time/description/location), refresh, time zone, malformed feed, cached fallback; verify ordering and truncation. |
| RSS/news | valid/empty/malformed/slow feed, long title, HTML entities, Unicode, refresh/cached fallback; verify sanitized readable output and source freshness. |
| Webpage | allowed/disallowed origins, HTTP/HTTPS, slow/error/redirect, responsive/non-responsive, iframe-blocked site; verify a clear fallback and no escape from the zone. |
| Custom HTML | benign styled fixture, script/event handler, external request, overflow, animation, focusable controls; verify documented sandbox/security behavior, containment, reduced motion, and no access to LessonCue credentials. |

### SIGN-004 — Element appearance controls

For applicable zones test title/content/source, background/text/accent/stroke colors, border width, corner radius, shape/icon, padding, scale, alignment, refresh interval, rotation, z-index, opacity, fit, flip, font properties, ticker speed, QR labels/placement, and credentials by reference. Test min/max, blank, decimal, and pasted invalid values. Verify defaults are attractive and safe.

### SIGN-005 — Playlists

Create ordered, random, tag-driven, and interactive playlists where exposed. Exercise every item kind: layout, media, app, web, nested playlist, tag, cloud, and CSV. Test duration, cut/fade/slide/zoom, hidden, transparent, notes, ordering, nesting cycle prevention, empty/missing reference, version/draft/publish, and looping last-to-first. Verify background audio, per-item mute/volume/fades/fit in the supported simple workflow.

### SIGN-006 — Signs, assignments, schedules, and publishing

Combine layouts and playlist assignments into signs; assign one sign to one/many screens; reassign a screen; assign by explicit screen and tags. If schedule/publishing UI is exposed, test one-time/weekly recurrence, date range, days, excluded dates, time boundary, overnight case, priority, volume, display power, occurrence versus series edit, draft/publish/push, clock skew, and conflict precedence.

### SIGN-007 — Emergency takeover

On disposable screens, prepare ordinary signage and a lesson, activate each severity/target combination, verify message/colors/media/expiry, target tags, immediate takeover, lesson-card/transport restrictions, audit, manual end, automatic expiry, and exact restoration of prior content/state. Test two competing emergencies and server/display restart while active. Wrong target or failure to restore is stop-ship.

### SIGN-008 — Operations and proof

Where exposed, verify screen online/last seen/version/manifest/playback/error/network/cache, schedule publish/push/widget-cache status, stream latency/restart/error, alert accuracy, proof-of-play, and screenshot consent. Compare every dashboard value with device/server facts. Flag stale, unexplained, or technically phrased status.

### SIGN-009 — Visual viewport matrix

Capture every focused diagnostic layout on:

- editor preview at 1920×1080 and 1366×768;
- browser display at 1920×1080, 1280×720, and 3840×2160 if available;
- portrait 1080×1920 if orientation is supported;
- Android TV emulator at 1080p and one low-resolution/overscan profile;
- 200% browser zoom and 400%/320-CSS-pixel administration view.

Use deterministic timestamps/data while comparing. For each screenshot the AI must inspect:

- no clipped, overlapping, off-canvas, unexpectedly scrollable, or microscopic content;
- intended safe area and overscan margins;
- crisp images/text at target distance; no stretching, letterboxing surprise, compression blocks, banding, or transparent-background halo;
- readable hierarchy, line lengths, spacing, alignment, color contrast, and focus indication;
- correct crop/fit/rotation/layers and no one-frame flash of old/default content;
- QR decoding from the captured pixels;
- current clock/weather/calendar/RSS data and obvious stale/failure state;
- animation/transition smoothness from a 30-second recording, not a still only;
- equivalence between editor preview, browser display, and Android TV, with quantified differences.

Mark `INCONCLUSIVE` when image evidence cannot establish audio, motion, distance legibility, color accuracy, or physical overscan. Do not claim that an emulator proves a consumer television panel.

### SIGN-010 — Long-run and failure behavior

Run a mixed sign for two hours and the release candidate's intended overnight duration when feasible. During it rotate media, refresh external sources, drop/recover the stream/feed, restart display, restart server, publish a new version, go offline/online, and replace an asset. Watch memory growth, timer drift, black frames, audio overlap, stale content, runaway requests, and recovery time.

### SIGN-011 — Intelligent signage design review

The AI must create a separate `signage-product-review.md` containing:

1. annotated contact sheets of layouts and displays;
2. the five strongest aspects worth preserving;
3. defects and inconsistencies;
4. the five most convoluted authoring operations, including step counts;
5. unclear words/statuses and suggested replacement copy;
6. high-value feature proposals with evidence and recommendation scores;
7. a proposed “first successful sign” flow for a new administrator;
8. accessibility and distance-legibility findings;
9. editor-versus-output conformance gaps;
10. recommendations deliberately rejected, with reasons.

Evaluate, but do not assume, these possible improvements: safe-area/overscan overlay, automated contrast warning, QR scanability score, responsive breakpoints, live data-freshness badge, “test source” button, undo/history, playback simulator, offline-cache readiness, playlist/schedule conflict checker, reusable style tokens, alignment/distribution tools, and content-expiry warnings. Recommend only those supported by observed need.

## 17. Settings and server operations

Every visible settings card must support collapse/expand from its top-right control, expose correct expanded state to assistive technology, retain unsaved input while merely collapsed, and produce a logical two-column desktop/one-column narrow layout. Specifically confirm MFA beside Preview features and Adaptive TV playback beside Storage allocation beneath Upload limits.

### SET-001 — System and updates

Test update check states (current, available, error), release notes, install authorization, concurrent request, progress, restart, success, failure, rollback, and recovery only on a disposable native Linux instance with a proven backup. Docker/Windows installations must explain unsupported one-click behavior rather than present a broken action.

### SET-002 — Organization and appearance

Test organization/site, time zone, week start, welcome message, default lesson minutes, archive retention, approved signage origins, room-controller access, navigation/accent/text/selected colors, invalid contrast combinations, reset/default behavior, persistence, and effect across admin/controller/audience pages.

### SET-003 — Approved folders/tags, storage, upload limits, adaptive playback

Exercise every field and boundary described in MEDIA-005/006; verify layout, help text, save feedback, capacity math, auto allocation, OS reserve, hardware probe, software fallback, automatic preparation, and guaranteed lead time.

### SET-004 — Connections and pairing

Test browser/preferred address, port validation/conflict/restart, `.local` name, optional local HTTPS/Caddy configuration, automatic/persistent six-digit pairing PIN, universal-controller address/protection, and optional remote-access connector states. Never expose the server directly to the public Internet as part of this run.

### SET-005 — Data and recovery

Test Recycling bin, privacy/backups, encrypted manual export/import, scheduled/off-server backup frequency/weekday/retention, controlled WebDAV with auth, transfer from another disposable server, one-time token, wrong password/token, interruption/resume/retry, included/excluded secrets, Recent activity, and safe Server commands. Validate descriptions before confirming any destructive action.

Product-critic prompts: Can a Service Admin predict operational consequences before Save? Are technical prerequisites translated into checks/actions? Are related settings adjacent, independent settings separated, and sections easy to scan/collapse? Does each failure say what happened, what is safe, and what to do next?

## 18. Accessibility, responsive behavior, and visual polish

### A11Y-001 — Keyboard-only administration

Without a pointer, run sign-in; global navigation; create class/lesson; upload; edit/reorder cue; pair screen; control playback; create/moderate poll; author/publish sign; expand/collapse settings; and confirm/cancel deletion. Verify Tab order, visible focus, skip link, modal focus entry/trap/return, Escape behavior, live announcements, and no drag-only action.

### A11Y-002 — Screen readers

Run the primary journeys with NVDA+Chrome/Edge and VoiceOver+Safari where available; Android controller/audience with TalkBack; TV with D-pad and available spoken feedback. Verify landmarks, headings, names, descriptions, validation errors, tables, dialogs, status/progress, selected/current state, and polite/assertive announcements.

### A11Y-003 — Zoom, reflow, touch, motion, contrast

At 200%, 400%, 320 CSS pixels, portrait/landscape phones, large text, forced colors/high contrast, dark/light browser preference, and reduced motion, verify content order, no two-dimensional trap, reachable actions, 44×44 touch targets or spacing, non-color status, contrast at all states, and stopped decorative motion.

### UX-001 — Visual consistency survey

Capture empty, normal, loading, disabled, success, validation, processing, warning, error, offline, and destructive-confirmation states for each top-level page. Compare card spacing, headings, labels/hints, buttons, badges, icons, dividers, empty states, skeleton/progress, and toast placement. Flag isolated components that look compressed, unfinished, or unrelated to the surrounding system.

### UX-002 — First-time-user journeys

Use a fresh AI browser context with no memory of selectors or page structure. Perform these goals from visible labels alone:

1. create a class and lesson and show its first cue on a TV;
2. upload a presentation and time its slides;
3. give a volunteer a safe controller link;
4. run a poll and show approved results;
5. create and assign a sign;
6. diagnose an offline TV;
7. back up the server.

Record hesitations, incorrect turns, unavailable prerequisites discovered late, terms that required source/docs lookup, step counts, and recovery. A selector known from source may be used only after the discoverability observation is recorded.

### UX-003 — Cross-feature consistency

Compare naming and workflow for Classes/classrooms/rooms, screens/displays/TVs, media/items/cues, signs/signage/layouts/playlists, save/publish/push, delete/archive/recycle, offline/cached/ready, and controller/remote. Recommend a terminology change only with a migration/copy impact note.

## 19. Comprehensive load and endurance plan

Use gradual ladders; reset to a known checkpoint between categories. A stage passes only when correctness and experience remain acceptable, not merely when the server stays alive.

| Load | Stages | Hold per stage | Correctness checks |
| --- | --- | --- | --- |
| Concurrent uploads | 1, 3, 5, 10 sessions across 1–5 accounts | through completion | bytes/SHA, reservations, processing once, UI progress, quotas |
| Audience participants | 1, 10, 50, 100, 250 | 5 min; 15 min at highest pass | accepted responses, exact aggregates, moderation/update latency, rate limits |
| Controllers | 1, 2, 5, 20 synthetic plus one UI | 100 commands/stage | ordered/versioned commands, acknowledgements, no cross-screen action |
| Screens | 1, 5, 20, 50 synthetic manifests/heartbeats plus real clients | 15 min | correct manifest, online state, invalidation, server latency |
| Media processing | 1, 2, 4 concurrent conversions or configured worker limit | completion | outputs, fair queue, useful estimates/status, resource containment |
| Signage sources | 1, 10, 30 zones sharing/distinct origins | 30 min | server-side coalescing/cache, freshness, provider protection, fallback |
| Soak | realistic lessons + polls + sign + controllers | 2 h minimum; 8 h preferred | no drift/leak/stale state/black output; automatic recovery |

At every stage record:

- request count/status histogram; p50/p95/p99 and maximum latency;
- CPU, RSS, managed heap if available, open files/sockets, thread count, database size/locks, disk bytes/inodes, queue depths, and client memory/cache;
- browser console errors/unhandled rejections, server errors/warnings, Android exceptions/ANRs;
- UI response time for an independent administrator;
- correctness invariants and exact missed/duplicated items;
- five-minute recovery measurements after load stops.

Recommended initial gates, adjustable before the run with written rationale:

- no data corruption, auth bypass, wrong-room action, lost accepted response, duplicate media completion, unhandled exception, app crash, or ANR;
- ordinary authenticated UI/API p95 below 1 second at intended load and no request above 5 seconds except documented long operations;
- controller visible action within 5 seconds and acknowledgement within 8 seconds online;
- changed Android manifest visible within 15 seconds and browser display within 35 seconds;
- no monotonic memory growth after two garbage-collection/recovery windows;
- resource use returns within 20% of pre-stage baseline after five minutes, unless a measured cache accounts for the difference;
- no unexplained 5xx; expected 4xx/429 responses have useful recovery text.

## 20. Storage and resource pressure

Establish safety floors before testing: at least 1 GiB and 10% free on system/data volumes, 5% free inodes, and enough space for the proven backup plus rollback. Use a dedicated loopback volume or disposable container volume to create pressure; never fill the host root disk.

### RES-001 — Server storage pressure

Test allocation limit, reserved bytes during concurrent uploads, external consumption after reservation, processing temporary-space exhaustion, backup space, recovery after freeing space, and accurate UI totals. The database and existing media must remain valid.

### RES-002 — Client cache pressure

On a disposable emulator/browser profile, approach and exceed cache budget with versioned media. Verify partial/failed/queued distinctions, priority for imminent lessons/signs, cleanup of obsolete files, offline readiness accuracy, and recovery after space returns.

### RES-003 — CPU/memory constrained mode

Limit the disposable server to representative low-end resources and repeat one upload conversion, 50-person poll, five-screen heartbeat, and controller playback. Record degradation and whether the UI explains slow work without duplicating it.

## 21. Reversible network and fault injection

For each scenario capture healthy-before, fault-onset, degraded behavior, fault removal, and recovered state. Use only test-process/container/network paths.

### NET-001 — Discovery and name resolution

Test normal `.local`, `.local` unavailable with Android discovery, multicast blocked with numeric IP fallback, DNS failure, DHCP address change, separate Wi-Fi bands on same LAN, and client-isolated/VLAN negative case. The UI must suggest a viable next step without implying public exposure.

### NET-002 — Latency, jitter, loss, and disconnect

Apply in stages: 100/300/800 ms latency, 1/5/10% loss, 2-second interruption, 30-second interruption, and offline. Exercise an upload, controller command, audience submission, signage feed/stream, manifest update, and heartbeat. Verify timeouts, retry/backoff, idempotency, status, and recovery.

### FAULT-001 — Browser interruption

Reload/close the tab mid-form, mid-upload, during poll moderation, while sending a command, and during signage editing. Verify safe persisted state, explicit loss warning, idempotent retry, and no phantom success.

### FAULT-002 — Server/process restart

Restart the LessonCue service/container during upload, conversion, active lesson, poll, sign, backup on a disposable copy, and scheduled generation. Verify readiness, durable work, retry behavior, device reconnection, and no duplicate side effects.

### FAULT-003 — Dependency and upstream failure

Independently disable FFmpeg, LibreOffice, Poppler, mail sink, weather/RSS/calendar fixture, HLS stream, WebDAV, and optional remote connector. Each dependent feature must fail locally and actionably while unrelated lessons/controller/display remain usable.

### FAULT-004 — Clock skew and time boundaries

On disposable clients/servers, test ±2 minutes and one severe skew, midnight UTC daily upload reset, local midnight, DST spring/fall, countdown, scheduled lesson/sign, retention, code/link expiry, and TOTP. Restore clocks before continuing.

Do not inject database corruption or hard power loss unless a separate, snapshotted recovery campaign is explicitly authorized.

## 22. Backup, restore, migration, and update campaign

### REC-001 — Backup content and secrecy

Create manual and scheduled encrypted backups with realistic content. Verify password required, wrong password rejected, archive integrity, documented inclusions/exclusions, no third-party source credentials or pairing secrets by default, sanitized names, retention, and off-server copy.

### REC-002 — Full restore and behavioral comparison

Restore on a fresh disposable server. Compare counts, relationships, file hashes, converted copies, lesson behavior, audience retention policy, signage assignments/versions, user authorization, and settings. Re-pair clients where credentials are intentionally excluded. Run the 30-minute smoke after restore.

### REC-003 — Server-to-server transfer

Use the UI with source address, one-time token, backup password, wrong/expired/reused token, interruption, source unavailable, and destination conflict. Confirm the source remains intact and destination provides a clear commit/rollback boundary.

### UPDATE-001 — Native Linux update and rollback

On a snapshotted native Linux instance, test current/available versions, concurrent request, download failure, signature/hash failure using the supported harness, insufficient space, service restart, health verification, successful migration, rollback, recovery-mode path, and preservation of pre-update invariants. Never test one-click update expectations on a platform documented not to support it.

### UPDATE-002 — Android distribution-specific behavior

For production-signed sideload: exercise optional/mandatory update, download, cancel/retry, wrong hash/size/package/version/signature, unknown-app permission denial/return, system confirmation, install success/failure, and persisted callback. For Google Play/Amazon/store builds: verify external updater and install permission are absent while playback/discovery/cache remain intact.

## 23. Observability and troubleshooting review

### OBS-001 — Correlation and actionability

For one failure in each major subsystem—auth, upload, conversion, controller, audience, signage source, pairing, backup, update—start from the user-facing error and locate the corresponding sanitized activity/log/device entry. Record whether an administrator can correlate it without SSH and whether logs name a safe next action.

### OBS-002 — No-secret survey

Search captured browser traffic, manifests, diagnostics, logs, backups, screenshots, local storage, and Git status for known synthetic secret canaries. Record only whether each canary was found and its location category; redact the value. A secret in an unauthorized surface is stop-ship.

### OBS-003 — Health truthfulness

Compare `/health/live`, `/health/ready`, dashboard “server online,” processing queue, screen online/cache, and upstream source statuses during controlled failures. Flag any green status that hides inability to perform its claimed function.

## 24. Dynamic coverage discovery

Because the product changes, the AI must not rely only on this static list. At run start:

1. Enumerate visible navigation for every role and preview-feature state.
2. Enumerate route definitions and browser-accessible API/OpenAPI endpoints from the candidate.
3. Enumerate settings cards, signage zone types, playlist item kinds, permissions, media extensions, controller commands, and Android remote actions from source or generated contracts.
4. Diff the inventory against `coverage.md` and this document.
5. Create a `DISC-NNN` row for every new, renamed, or removed capability. Add a safe happy path, boundary, permission, error, accessibility, visual, persistence, and cleanup test for every new mutable feature.

A run cannot be called comprehensive while unexplained discovered surfaces remain `NOT RUN`.

## 25. AI judgment loop after each journey

Immediately after a journey, before source inspection biases the result, write:

```text
USER GOAL:
FIRST VISIBLE NEXT STEP:
STEPS / PAGE CHANGES / WAITS:
HESITATIONS OR WRONG TURNS:
WHAT THE PRODUCT COMMUNICATED WELL:
WHAT WAS UNCLEAR OR CONVOLUTED:
ERROR PREVENTION AND RECOVERY:
VISUAL AND ACCESSIBILITY OBSERVATIONS:
MISSING CAPABILITY OR AUTOMATION:
EVIDENCE:
```

Then inspect implementation/docs/logs to separate defect from intentional behavior. For every proposed improvement, answer:

- What observed user problem does it solve?
- Which persona and how often?
- Can copy, grouping, a default, or a smaller interaction solve it before a new feature?
- Does it preserve local-first privacy and live reliability?
- Could it make the controller or TV less predictable?
- What is the smallest measurable acceptance criterion?
- What should explicitly remain unchanged?

The final recommendations must include:

- top five release-blocking fixes;
- top five high-value usability improvements;
- top five product features;
- top five visual/polish improvements;
- top five accessibility improvements;
- operational/documentation improvements;
- “do not build yet” ideas whose evidence or value is weak.

Avoid padding categories when fewer evidence-backed recommendations exist.

## 26. Cleanup and post-run integrity

### CLEAN-001 — Remove only run-owned state

1. Export the list of objects created under the exact `QA-<RUN_ID>-` prefix and compare it with the creation timeline.
2. Close/delete run audience sessions, revoke run screens/controllers, stop streams/fixture servers/network shaping, delete run lessons/templates/schedules/classes/signs/layouts/playlists/media/accounts/codes according to dependency order, and empty only run-owned recycled items.
3. Remove synthetic client profiles/emulators or reset them only if they are dedicated to the run.
4. Do not remove failure evidence, test reports, the pre-run backup, or unrelated data.

### CLEAN-002 — Verify recovery

Confirm server readiness, services/containers, storage/inodes, database integrity, ordinary UI latency, no active reservations/conversions/emergencies from the run, no run screens online, no persistent shaping/proxies, and no new repeating errors. Compare pre/post counts excluding intentional fixtures and record unexplained differences.

## 27. Release gates

Recommend `NO-GO` for any of these:

- data loss/corruption; authorization/privacy/secret failure;
- wrong-room, wrong-screen, missed/duplicated/reordered live command;
- primary upload, processing, lesson, controller, audience, or display path fails for a documented supported input/client;
- screen cannot recover from ordinary server/network restart;
- unapproved audience text appears publicly;
- backup cannot restore or update cannot recover on a supported platform;
- primary workflow inaccessible by its required input method;
- critical visual output is clipped, unreadable, wrong, stale, or materially different between preview and supported display;
- sustained resource leak, crash/ANR, or error rate above the agreed gates;
- any stop condition was triggered and not fully understood and retested from a clean checkpoint.

`GO WITH EXPLICIT WAIVERS` requires named `NOT RUN`/`BLOCKED` cells, a human owner, impact, mitigation, expiry, and linked follow-up. Preview features may be waived only when disabled by default and they cannot affect ordinary lesson playback or shared data.

## 28. Final report requirements

`run-summary.md` must lead with the outcome and contain:

1. candidate identity and test matrix actually completed;
2. `PASS`/`FAIL`/`BLOCKED`/`INCONCLUSIVE`/`NOT RUN` totals;
3. release recommendation and stop-ship defects;
4. demonstrated capacity and timing, not theoretical capacity;
5. media-extension results and conversion fidelity;
6. browser/Android TV/controller/remote coverage, explicitly separating emulator from physical hardware;
7. audience and signage visual results with contact-sheet links;
8. recovery/backup/update results;
9. residual risks and waivers;
10. prioritized product recommendations with scores and evidence;
11. cleanup/post-run health confirmation.

The AI must explicitly state what it did **not** prove. Examples: “Android TV emulator remote navigation passed; no physical consumer remote or panel was tested,” “audio was decoded but not judged through venue speakers,” or “250 synthetic respondents passed; a real shared school Wi-Fi environment was not exercised.”

## 29. Compact coverage index

Use this table to build `coverage.md`; expand each row by role/client/viewport as applicable.

| Area | Required IDs |
| --- | --- |
| Installation/prerequisites/platform | INST-001–004 |
| Candidate/health/baseline | PRE-001–004 |
| Authentication/accounts/roles/MFA/email/registration | AUTH-001–007 |
| Dashboard/navigation | DASH-001–002 |
| Classes/classrooms | CLASS-001 |
| Lessons/run-of-show | LES-001–005 |
| Templates/recurrence | TEMP-001 |
| Calendar | CAL-001 |
| Media/upload/types/conversion/versions/storage | MEDIA-001–009, RES-001–003 |
| Screens/pairing/cache/diagnostics | SCREEN-001–005 |
| Controllers/universal controller | CTRL-001–004 |
| TV remotes/D-pad/media keys | REMOTE-001–003 |
| Audience interaction/moderation/load | AUD-001–006 |
| Signage/every element/playlists/schedules/emergency/visual | SIGN-001–011 |
| Settings/system/connections/data | SET-001–005 |
| Accessibility/responsive/UX | A11Y-001–003, UX-001–003 |
| Load/soak/network/fault | sections 19–21 |
| Backup/migration/server and Android update | REC-001–003, UPDATE-001–002 |
| Observability/security evidence | OBS-001–003 |
| Cleanup | CLEAN-001–002 |

## 30. Invocation prompt for the executing AI

Give the following prompt with this file and environment-specific variables to an AI operator:

```text
Execute the LessonCue AI real-use and product-quality stress test against the
explicitly designated disposable QA environment. Read the entire playbook first.
Create the required evidence package and dynamic coverage inventory. Work in phase
order, checkpoint after each phase, and never claim PASS without direct evidence.

Use accessible user-visible controls for real journeys. Use APIs and read-only
system inspection to corroborate results, generate load, and diagnose failures.
Visually inspect editor and display screenshots and recordings at every required
viewport. Decode QR codes, inspect complete media, verify hashes/codecs/pages, and
exercise Android TV through ADB. Keep emulator and physical-device claims separate.

After every journey, run the product-critic loop before reading implementation
details. Capture confusing, convoluted, unsafe, inconsistent, unattractive, or
missing experiences. Recommend improvements only when linked to evidence; rank
them by impact, reach, confidence, effort, and risk reduction. Distinguish defects,
usability, accessibility, reliability, features, and delight. Do not implement
recommendations during the test.

Use only RUN_ID-prefixed synthetic state. Never reveal secrets. Stop at any listed
stop condition. Preserve first-failure evidence before retry or repair. Update the
human owner at least at every phase boundary and immediately for a stop condition.
Finish with cleanup, post-run health verification, a coverage gap list, and GO,
NO-GO, or GO WITH EXPLICIT WAIVERS.
```

This playbook is intentionally demanding. A smaller smoke run may select rows, but it must be labeled a smoke run and must not be described as comprehensive, production-ready, or a substitute for the complete release campaign.

## 31. Repository implementation

This repository includes a safe orchestration and fixture implementation:

```bash
# Non-mutating inventory; creates only a temporary evidence package.
npm run test:real-use -- --profile inventory --run-id LC-YYYYMMDD-HHMM-AI

# Deterministic media fixtures and manifest.csv/manifest.json.
npm run test:real-use:fixtures -- --run-id LC-YYYYMMDD-HHMM-AI \
  --output /tmp/lessoncue-fixtures-LC-YYYYMMDD-HHMM-AI --all-extensions

# Safe local smoke: protocol, type/build, display/signage conformance, and a11y.
npm run test:real-use -- --profile smoke --run-id LC-YYYYMMDD-HHMM-AI

# Browser real-use workflow on an isolated disposable local server.
npm run test:real-use -- --profile browser --run-id LC-YYYYMMDD-HHMM-AI

# Full repository browser campaign; explicit disposable confirmation is required.
npm run test:real-use -- --profile full --confirm DISPOSABLE \
  --run-id LC-YYYYMMDD-HHMM-AI --include-android
```

The runner writes `coverage.md`, `environment.md`, `results.csv`, `timeline.md`,
`run-summary.md`, `product-review.md`, fixture metadata, and sanitized command
logs under `test-runs/<RUN_ID>/`. `test-runs/` is ignored by Git. `inventory`
never starts the application; `smoke` and `browser` use the Playwright isolated
server/data path; `full`, `--base-url`, and any remote target require the exact
`DISPOSABLE` confirmation. The runner never accepts credentials on the command
line. Physical TV panels/remotes, venue audio, installation VMs, network shaping,
load ladders, backup/restore, and updater campaigns remain explicit procedures
from this playbook and must be added to the evidence package rather than inferred
from the automated profiles.
