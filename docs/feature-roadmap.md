# LessonCue feature roadmap

This roadmap is the authoritative order of work for LessonCue. Reliability, recoverability, security, and an honest supported-platform contract now take precedence over adding more product surface. Completed release history is retained below for context, but historical claims do not override the current priorities and platform decision.

## Master TODO — outstanding and newly identified user experience work

This is the top-level queue for the next UI/product-quality pass. Items below are intentionally limited to work that is new, still unaccomplished, or needs direct user-evidence validation. The previously requested Settings layout changes are listed separately so they remain visible without being mistaken for new recommendations. Move completed items to the implemented history only after the stated acceptance evidence exists.

### Evaluation and evidence gate

- [x] **Run the advanced AI user-centered UI evaluation** using [the evaluation brief](ai-ui-evaluation-brief.md) and the full real-use playbook. The dated [evaluation report](ui-evaluation-report-2026-08-10.md) contains journey timings, step counts, screenshots, accessibility observations, responsive/browser-display evidence, Android TV coverage, and explicit limitations.
- [x] **Create a dynamic UI coverage inventory** across navigation, settings cards, dialogs, empty/error states, media types, signage elements, controller actions, browser playback, and Android TV input paths. Surfaces not exercised are listed as `NOT RUN` or `BLOCKED` in the report.
- [x] **Turn evidence into a ranked implementation queue** with separate defect, workflow, comprehension, accessibility, visual, reliability, feature, and delight findings, acceptance criteria, scoring, and a “do not build yet” list.

### UI evaluation release gate — remediated 2026-08-10

- [x] **P0: Repair the public Audience experience:** added the responsive/touch/focus presentation and hardened moderation input, approve/hide, invalid-input, and live refresh behavior.
- [x] **P0: Make batch upload and conversion recovery attributable:** named every selected file, retained per-file outcomes, added failed-only retry, persisted converter failure, validated every generated slide, and blocked false-ready output.
- [x] **P1: Keep display pairing truthful:** automatic PINs refresh on expiry/focus/visibility, count down in Screens, and the browser player uses separate cleared/focused inputs for name and PIN.
- [x] **P1: Make controller state safe under live pressure:** offline commands are disabled and never queued implicitly; online commands show sending/waiting-for-receipt, received, failure, or receipt-timeout states without stale time estimates.
- [x] **P1: Rebuild phone-width app navigation:** the authenticated shell uses a focus-contained, Escape-closeable drawer with inert background and focus return at phone widths.
- [x] **P1: Restore foundational keyboard access:** native screen switches remain in the accessibility tree, the skip link focuses main content, and a newly added lesson cue is revealed, highlighted, focused, and announced.
- [x] **P1: Complete successful authentication navigation:** successful authentication replaces the auth route with the dashboard route before refreshing application state.
- [x] **P1: Close stale editors after deletion:** class deletion closes and clears class/controller dialogs before selecting refreshed data.
- [x] **P2: Clarify document readiness:** document rows name conversion readiness and expose convert/retry; failed conversions clear derivative state and cannot open a false-ready preview.
- [x] **P2: Add safe immediacy to Signage:** save bars name affected screens, successful saves expose one-step undo, and editors reserve sticky-action space.
- [x] **P2: Remove competing Signage navigation:** Signage runs as the one visible full-screen navigation surface instead of leaving an obscured application sidebar interactive.
- [x] **P2: Preserve media identity and assignment context:** grid titles use two lines plus full-name tooltips, view choice persists, and lesson/Sign surfaces include `Plays where` context and direct screen navigation.
- [ ] **P3: Close evidence gaps:** run a truly clean first-install onboarding session, physical Google TV and Fire TV remote/HDMI/audio/network checks, QR-distance scans, physical Signage viewport comparisons, real touch, screen readers, 200% zoom, and reduced motion.

### Existing requested Settings work verified in the 2026-08-10 UI audit

- [x] Every inspected Settings panel is collapsible/expandable from a clear top-right control; state remains understandable while navigating between Settings sections.
- [x] Registration, Email Settings, and Registration Codes are distinct sections with independent headings and task grouping.
- [x] Authenticator MFA is beside Preview Features at desktop width.
- [x] Adaptive TV Playback is beside Storage Allocation, beneath Upload Limits, at desktop width.

### New or unaccomplished product/UI work

- [ ] **Make first-run readiness actionable:** add a guided checklist for storage, converter availability, hostname, pairing, display readiness, and updates; each failed check must link directly to the fix and show when the system becomes ready.
- [x] **Improve Audience empty and live states:** guide the operator through “Create poll → Open session → Share QR code,” then show QR copy/download, participant/session status, response counts, moderation state, and close-session recovery in one coherent workspace. The remaining evidence gap is a fresh-install, QR-distance scan.
- [x] **Add upload preflight and queue clarity:** show per-file type/codec/size/converter readiness before upload, then expose progress, queue position, pause/resume, retry, cancellation, conversion stages, expected output, and actionable remediation without requiring logs. The catalog and optional WebP/Theora/legacy Office converter states are surfaced before upload.
- [ ] **Clarify Signage draft-to-live workflow:** distinguish Draft, Preview, Publish, Schedule, and Replace; provide a publish diff and safe rollback path; warn about overflow, contrast, safe areas, missing media, stale data, unsupported fonts, and QR scanability.
- [ ] **Add display-target preview validation:** compare browser preview and Android/browser-player output at 480p, 720p, 1080p, portrait, ultrawide, and phone widths, with visible viewport/safe-area overlays and screenshot evidence.
- [x] **Improve TV/controller confidence:** add a display focus mode with large targets, visible focus rings, arrow/Enter/Back mapping, shortcut hints, current/next item, selected room, connection state, command acknowledgement, and a pairing/disconnect recovery path. The existing Screens pairing/revoke flow is linked by the controller's truthful offline and re-pair messaging.
- [x] **Reduce lesson-planning ambiguity:** make Present now, Schedule, Save draft, Duplicate, Archive, and Delete visibly distinct; add autosave state, undo/recovery, and a compact lesson timeline where evidence shows repeated backtracking or uncertainty.
- [x] **Add system diagnostics and support export:** provide a Service Admin surface for storage projection, converter readiness, queue health, screen errors, backup age, update state, and a redacted downloadable support bundle. The new endpoints are included in the OpenAPI contract.
- [ ] **Improve responsive and accessible interaction:** verify 44px touch targets, keyboard traversal, screen-reader names/live announcements, zoom/reflow, reduced motion, contrast, and D-pad navigation for every primary journey; fix any observed gap before adding cosmetic polish.
- [x] **Reduce perceived load time:** lazy-load signage, settings, media editing, reports, and playback-heavy modules; establish bundle budgets and measure first meaningful interaction on the supported desktop and VM paths. Bundle checks and the browser-ready performance mark run in the release test suite.
- [ ] **Standardize information architecture and language:** test terms for classes/rooms, screens/displays, signs/layouts/playlists, save/publish/push, and cached/ready/offline; change terminology only when repeated user evidence supports it and document migration/copy impact.
- [ ] **Add a repeatable before/after UX benchmark:** retain representative screenshots, journey timings, step counts, accessibility results, and error-recovery results so each UI batch demonstrates improvement rather than subjective change.

### Newly identified follow-up work from this tranche

- [ ] **Provision Cloudflare Access for Infrastructure SSH:** add a separate, operator-scoped SSH hostname and `ssh://127.0.0.1:22` route, short-lived Access identities, an explicit on/off control, and a recovery path that does not depend on the tunnel being currently connected. This remains pending a scoped Cloudflare API token, account/domain, hostname, and identity policy.
- [ ] **Release and verify independent off-site backups:** deploy the Nextcloud/ownCloud/WebDAV destination settings, exercise encrypted upload and per-destination count/age pruning on the isolated VM, and attach a downloaded-copy restore drill to the release evidence.
- [ ] **Close physical-device evidence gaps:** run fresh-install and upgrade acceptance on the temporary VM, verify QR scanning at room distance, and repeat Android TV/Fire TV remote checks with real hardware where available.
- [ ] **Exercise every optional converter row in a release environment:** install WebP/libtheora, Poppler, and LibreOffice on a clean Linux host and attach representative fixture results to the real-use report.
- [ ] **Finish the UI benchmark loop:** capture before/after screenshots and first-meaningful-interaction timings for Audience, Media, Controller, Lessons, and Service Admin on the released build.

The advanced evaluator must use [the AI user-centered UI evaluation brief](ai-ui-evaluation-brief.md) and must not count the Settings items above as new recommendations. This master list does not replace the deeper production-hardening checklist below; it surfaces the next user-facing queue first.

## Current platform decision

- [x] **Explicitly defer and abandon tvOS for the current product cycle.** Apple TV is not a supported, tested, documented, or release-blocking LessonCue target. The existing `tvos/` source is retained only as an archived starting point for a possible future project. Current development, compatibility promises, CI, release validation, installation instructions, and roadmap work target the self-hosted browser player plus Android TV, Google TV, and Fire TV. Reintroducing Apple TV will require a new roadmap item, current-device research, an active test target, feature-parity acceptance criteria, and dedicated signing/release ownership.

## Most urgent production-hardening work

Work through this section in order. Do not declare an item complete merely because the happy path works.

1. [ ] **Restore core lesson, TV, and signage workflows:**
   - [x] Lessons must be selectable before and after their scheduled times.
   - [ ] Files must be reliably converted so that standard Google TV and Fire TV devices can play every supported media type reliably.
   - [x] Replace the current "Add Media" flow with a simpler chooser: "Upload new media", "Add an audience poll", "Add online media or slides", and "Choose existing media". Each choice should open its own section and use a friendlier layout.
   - [x] When adding online media, include a "Do not download to local server" checkbox as a secondary option, leaving "download media locally" as the default option.
   - [x] Lessons must appear correctly in the TV app when they are properly assigned.
   - [x] Media selected from a remote must reach the target screens. It is not currently doing that reliably.
   - [x] TV Screens are not reliably showing lesson options.
   - [x] When a class is created or edited, allow a color to be selected so the remote can consistently reflect that class.
   - [x] Hide app information when the TV app is being used for signage.  Show the signage only.
   - [x] Match browser signage and on-screen signage rendering, including font sizing and playable elements. On-screen signage should appear the exact same regardless of screen, resolution, device, etc.  Browser should be identical to TV.
   - [x] Cache signage media locally on each device so repeated playback does not re-fetch the same images and videos from the server.

2. [ ] **Baseline WCAG 2.2 AA accessibility**
   - [ ] Add automated accessibility checks and manual keyboard, screen-reader, zoom, contrast, reduced-motion, touch-target, and remote-control acceptance tests.
   - [ ] Replace browser-native prompts and confirmations with accessible dialogs, focus management, inline validation, live status announcements, and reliable error recovery.
   - [ ] Give every pointer-driven editor action a keyboard equivalent, including selection, movement, resizing, ordering, and saving.

3.  [ ] **Scalable queries, startup, and retention**
    - [ ] Paginate and filter media, audit, users, lessons, classes, screens, and signage on the server; load each browser workspace incrementally.
    - [ ] Build manifests from only the applicable lessons, layouts, playlists, and referenced media instead of loading broad tables into memory.
    - [ ] Add and measure appropriate indexes, SQLite WAL/busy-timeout behavior, write contention, and database maintenance.
    - [ ] Bound or archive audit events, account tokens, pairing attempts, proof-of-play records, and other operational history.

4.  [ ] **Bounded, recoverable background processing**
    - [ ] Add duration-aware watchdogs and process-tree termination for FFmpeg, FFprobe, presentation conversion, downloads, and stream relays.
    - [ ] Add durable queue leases, bounded retries, cancellation, dead-letter state, administrator retry/cancel controls, and restart recovery.
    - [ ] Report queue depth, oldest job, processing resources, converter versions, and recent failures.

5.  [ ] **Referential integrity and lifecycle safety**
    - [ ] Prevent deleted or expired audience sessions from leaving permanent display media or broken lesson/signage references.
    - [ ] Add dependency impact previews, safe cascading cleanup or archival, broken-reference detection, and manifest invalidation.
    - [ ] Apply the same reference-safety contract to media, layouts, playlists, templates, classes, and users.

6.  [ ] **Release-grade automated and physical testing**
    - [ ] Split the oversized browser workflow into independent domain suites and add component, accessibility, contract, migration, update, rollback, backup, restore, and failure-injection tests.
    - [ ] Execute Android instrumentation tests on an emulator and maintain a real Google TV, Shield TV, and Fire TV acceptance matrix.
    - [ ] Require a clean install, upgrade from supported prior releases, interrupted upgrade, restored backup, and constrained-storage test before publishing.

7.  [ ] **Operational readiness and support diagnostics**
    - [ ] Add a Service Admin dashboard for database integrity, storage reserve and projected exhaustion, queue health, converter readiness, update state, backup age, and screen errors.
    - [ ] Create a downloadable redacted support bundle with bounded logs, configuration shape, versions, health results, and recent failures but no secrets, tokens, PINs, or private media.
    - [ ] Add administrator alerts for failing backups, stuck work, low storage, incompatible displays, and repeated playback errors.

8.  [ ] **Remove obsolete surfaces and correct product claims**
    - [ ] Remove or archive the superseded signage editor, APIs, state, and documentation that still compile or imply discarded scheduling/publishing/emergency behavior.
    - [ ] Publish one current browser/Android feature matrix and mark experimental or browser-only behavior accurately.
    - [ ] Reconcile README, installation, implementation, security, troubleshooting, API, and roadmap claims with verified behavior.

## Least urgent improvements

Begin these only when the production-hardening dependencies above are stable.

1. [ ] **Modular frontend architecture**: Split the oversized application and signage files into domain modules, reusable accessible components, typed API clients, isolated state, and focused tests.
2. [ ] **Frontend performance and code splitting**: Lazy-load signage, settings, media editing, reports, and heavy playback libraries; set and enforce bundle budgets.
3. [ ] **Reliable PWA/offline behavior**: Add versioned cache population, safe eviction, quota reporting, offline status, background synchronization, and explicit recovery from incompatible cached releases.
4. [ ] **Advanced editing and playback**: Add editable fade curves, crossfades, loudness normalization, audio ducking, background audio, pan/zoom, chapters, and gapless playback behind an Advanced mode.
5. [ ] **Precisely synchronized multi-screen playback**: Add measured clock offset, latency compensation, drift correction, readiness barriers, and synchronization diagnostics.
6. [ ] **Essential screen fleet tools**: Add groups, tags, saved filters, remote cache purge, re-download, restart, kiosk/startup validation, screen-saver checks, and diagnostics export without becoming a general device-management platform.
7. [ ] **Local captions, transcripts, chapters, and search**: Support optional local models under explicit administrator control with no required cloud processing.
8. [ ] **Role-specific onboarding and mobile workflows**: Add focused teacher, volunteer, media-operator, and administrator dashboards, favorites, recent lessons, temporary accounts, and urgent mobile changes.
9. [ ] **Media-library organization**: Add near-duplicate detection, safe consolidation, collections, favorites, folder drag-and-drop, improved search, and more granular optional quotas.
10. [ ] **Templates and branding**: Add reusable typography/color systems, organization presets, importable layout packages, and constrained high-quality starting templates.
11. [ ] **Internationalization and localization**: Add translated UI resources, RTL layouts, locale-aware units and formats, and daylight-saving/time-zone regression fixtures.
12. [ ] **Permissioned integrations**: Add calendar, LMS, Canva, and storage integrations only through stable authorized APIs with explicit refresh, failure, revocation, and fallback behavior.
13. [ ] **Licensing, privacy, and compliance packaging**: Add third-party notices, data-retention/export templates, privacy documentation, commercial-license administration, and deployment checklists.
14. [ ] **Local-only product insight**: Report storage trends, common failures, frequently reused media, screen reliability, and processing performance without requiring cloud telemetry.
15. [ ] **Optional accessibility modes beyond the baseline**: Add per-user high contrast, reduced motion, larger controls, low-vision, limited-motor-control, and cognitive-simplicity modes after universal baseline access is verified.


## Scope boundary

LessonCue remains centered on preparing media, organizing lessons, confirming readiness, playing reliably across common display hardware, and making live control simple for volunteers. SaaS onboarding, budget-hardware optimization, and signage remain intentional product capabilities within that boundary.

## Implemented roadmap milestones

[x] **Transactional server updates and truthful health checks**
   - [x] Add separate liveness and readiness endpoints. Readiness returns HTTP 503 when the database or required persistent storage cannot be used; `/health` remains a backward-compatible alias for readiness.
   - [x] Make the Linux installer, port changer, updater, and Windows installer require the readiness endpoint rather than accepting any running HTTP process.
   - [x] Stop writers, snapshot the live SQLite database and protected configuration immediately before an update, verify file fidelity and SQLite integrity with the staged server binary, and preserve the protected last-known-good snapshot after readiness succeeds.
   - [x] Roll back the application, database, updater executable, systemd units, and relevant configuration as one operation when startup, migration, or readiness fails.
   - [x] Persist the result, version, completion time, failure reason, and rollback-snapshot availability of the most recent update and show that state to a Service Admin.
   - [x] Add a Service Admin-only rollback action with a separately verified pre-rollback safety snapshot, a persistent transaction marker with boot-time recovery, and disposable release-to-release tests covering success, rejected readiness, operator rollback, and interrupted-update recovery.

  [x] **Encrypted, scheduled, and verified recovery**
   - [x] Retain on-demand archive verification, safe ZIP-path validation, SQLite integrity checking, required-table checks, media-record comparison, administrator feedback, and restore safety backups.
   - [x] Encrypt every Service Admin-exported backup with a user-supplied password in a chunked AES-256-GCM `.lcbak` envelope. Bind the complete ZIP length and SHA-256 digest into the authenticated header, include a per-file SHA-256 manifest, and reject a wrong password, changed chunk, changed manifest entry, unexpected trailing data, unsafe key-derivation parameters, or unsupported format before database inspection.
   - [x] Exclude email/signage provider credentials, pairing secrets, and local data-protection keys by default. Let a Service Admin deliberately include them only inside a password-encrypted export, never store the export password, and identify the selected secret-handling mode during verification and restore preview.
   - [x] Add daily or weekly scheduled policies in the organization time zone, count-and-age local retention, optional HTTPS WebDAV delivery, protected stored scheduler credentials excluded from every export, backup-age/failure alerts, automatic envelope/manifest/database verification, guided non-destructive restore drills, and documented recovery objectives.
   - [x] Record the source server version in current manifests, reject a backup created by a newer LessonCue release before restoration, and start a minimal read-only recovery web app with 503 readiness, local-backup discovery, and SSH guidance when database creation or upgrade fails.
   - [x] Add a Service Admin migration workflow: generate a 30-minute one-use authorization token for an encrypted backup, pull it directly from a destination server over private-LAN HTTP or HTTPS without sending the password to the source, reject redirects and unsafe public HTTP origins, validate it through the normal restore staging pipeline, and require the ordinary reviewed restore confirmation.

  [x] **Signed and reproducible installer/release supply chain**
   - [x] Sign the complete release manifest with an offline Ed25519 key independent of GitHub-hosted checksums, authenticate every artifact through that manifest, pin the public trust anchor in the installer/updater, and verify the signature before reading checksums or executing downloaded code as root. Adversarial updater tests prove a changed signature is rejected without touching the live installation.
   - [x] Pin every bundled `yt-dlp` binary to reviewed release `2026.07.04`, verify architecture-specific SHA-256 values and the reported version in Linux, Windows, and container builds, and remove mutable `latest` downloads.
   - [x] Upgrade the JavaScript lint toolchain to patched versions and verify that `npm audit` reports no known vulnerabilities.
   - [x] Add weekly Dependabot coverage for npm, NuGet, Gradle, Docker, and GitHub Actions plus scheduled/push/PR CodeQL analysis for C#, JavaScript/TypeScript, and Kotlin.
   - [x] Produce an exact SPDX release SBOM, generated third-party notices, GitHub/Sigstore provenance and SBOM attestations, plus checksum-pinned Trivy source, dependency, configuration, secret, and exact-container scanning.
   - [x] Require web lint/type/build, server tests, installer syntax, browser end-to-end tests, Android tests/lint/build, and a container build for the exact tagged commit before packaging jobs can run.
   - [x] Restrict the GitHub `production-release` environment to `v*` tags with required maintainer approval, store the private signing key only as an encrypted environment secret plus ignored/offline local copies, and document fingerprint verification, key rotation, and compromise recovery.

  [x] **Least-privilege processing of untrusted uploads**
   - [x] Run Windows as the built-in restricted LocalService identity, apply explicit read/execute application ACLs and modify-only data ACLs, limit the firewall rule to Domain/Private networks, and validate installer syntax in CI instead of processing uploads as LocalSystem.
   - [x] Run the container as UID/GID 10001 on internal unprivileged port 8080 with all capabilities dropped, `no-new-privileges`, a read-only root filesystem, and only `/data` plus a bounded temporary filesystem writable.
   - [x] Run FFmpeg, FFprobe, LibreOffice, Poppler, and downloaded-media processing through bounded worker execution. Native Linux uses a root-installed Bubblewrap namespace with no network by default, read-only data and explicit output roots, private process/device/temp state, CPU/address-space/file/process/descriptor/wall-time limits, bounded output, and disposable isolation tests; only the YouTube download worker receives network. Windows combines LocalService/ACL confinement, CPU-time/memory/process/wall-time Job Object limits, and outbound-denied private FFmpeg/FFprobe plus document-converter binaries. Container deployments add read-only root, dropped capabilities, no-new-privileges, bounded memory/CPU/PIDs/tmpfs, and the same worker.
   - [x] Validate image, audio, video, PDF, OLE, OpenXML, OpenDocument, and Keynote signatures/package structure independently of file names and browser-supplied MIME types before processing; reject truncated content, type mismatches, unsafe archive paths, and incorrect Office package kinds.

  [x] **Explicit browser and Android display capability contract**
   - [x] Publish declared capabilities for browser and Android displays and warn before assigning unsupported lesson or signage content.
   - [x] Define safe fallbacks instead of blank, generic-text, or partially rendered output.
   - [x] Complete native Android renderers for every feature advertised as cross-platform, including structured weather/calendar data, mixed rich text, current signage controls, and audience results in lessons; explicitly label live audience-result signage browser-only and use an element-level fallback on Android.
   - [x] Add rendering-conformance fixtures, a committed browser fallback golden screenshot, remote/D-pad acceptance checks, and a client/server compatibility matrix.

  [x] **Durable, bounded resumable uploads and storage accounting**
   - [x] Persist each upload session with its owner, expected length, chunk count, content hash, chunk bitmap, creation time, and expiration.
   - [x] Clean up abandoned sessions and partial files automatically, and expose pause, retry, cancellation, and actionable failure state.
   - [x] Replace recursive per-chunk disk scans and check-then-write quota decisions with atomic storage reservations and incrementally maintained accounting.
   - [x] Add streaming hashes, magic/MIME validation, upload concurrency and rate limits, and optional quotas by user, role, class, file size, codec, or day.

  [x] **One generated, tested protocol contract**
   - [x] Reconcile the JSON manifest schema with current presentation, audience, signage, media, and capability fields; remove obsolete element types.
   - [x] Reconcile OpenAPI roles, permissions, registration, and redesigned signage endpoints with the actual server.
   - [x] Validate real server-produced fixtures against both contracts in CI and test backward/forward compatibility with every supported browser and Android client.

  [x] **Protected local-network operation**
   - [x] Add guided local HTTPS or a supported local reverse-proxy/certificate workflow for shared networks.
   - [x] Remove sensitive pairing values from logs, narrow Android cleartext allowances where practical, and clearly distinguish trusted local HTTP from remote HTTPS.
   - [x] Add optional per-user authenticator MFA, an administrator-controlled all-user requirement, and rate limits for authentication, pairing, expensive media, conversion, and public interaction endpoints.
   - [x] Review intentionally unauthenticated media delivery, mark it private/non-indexable at shared caches, and document network segmentation and privacy expectations.
- [x] **Signage architecture and visual overhaul (next release)** — replace the previous schedule-centric studio with a streamlined, responsive workspace that closely follows the approved visual mockups.
   - [x] Organize the workflow into three clear steps: persistent **Layouts**, continuously looping **Playlists**, and **Signs & screens**.
   - [x] Define a Sign as one reusable Layout plus its playlist assignments and assigned screens; let one Sign drive many screens while enforcing exactly one active Sign per screen.
   - [x] Rebuild the information-frame layout so its 16:9 presentation area stays fixed while users choose one-to-five evenly distributed bottom boxes and one-to-three sidebar boxes with live alternate-color preview.
   - [x] Add focused element editing for playlist areas, messages, images and logos, QR/Wi-Fi codes, weather, time/date, calendar feeds, and webpages.
   - [x] Rebuild signage playlists as an easy visual timeline with duration, order, transition, fade-in, fade-out, volume, mute, and picture-fit controls; the last item always returns to the first.
   - [x] Make layout, playlist, and Sign saves immediately update assigned displays without exposing draft/publish terminology or a separate publishing workflow.
   - [x] Remove Calendar scheduling, Operations, and Emergency from the signage experience; Signs are persistent and play continuously.
   - [x] Replace legacy signage configuration during the one-time database upgrade, as explicitly approved, and seed clean generic starter layouts for schools, churches, and other educational environments.
   - [x] Update browser playback manifests to resolve each Sign's per-element playlist assignment and honor playlist volume, mute, fade, and fit settings.
   - [x] Preserve the existing Signage enable/disable setting so unfinished signage can remain completely hidden from users.
   - [x] Keep every element inside its assigned frame with adjustable padding, content scale, vertical position, typography, line spacing, media fit, corner rounding, and independent clock sizing.
   - [x] Add scheduled RTMP playlist override controls with a stream address and optional start/end window; the normal playlist returns when the stream is unavailable or its window ends.

- [x] **Immediate signage reliability and screen-purpose controls** — add QR placement, broad typography controls, approved `.ics` feeds, signage-only and permanent browser screens, direct browser-display links, and Service Admin-only troubleshooting logs with credential redaction.

- [x] **Service Admin and App Admin separation (next release)** — rename the legacy Owner tier to Service Admin and Administrator tier to App Admin; give Service Admins unrestricted access; limit App Admin settings to updates, registration mode and codes, approved media folders and tags, screen pairing PIN/mode, universal-controller PIN, recycling, and activity; and enforce email, storage allocation, adaptive playback, network/remote access, privacy/backups, and server-operation boundaries on authenticated server routes as well as in the browser.

- [x] **Signage Studio (next release)** — complete the independently designed, self-hosted signage design, playlist, scheduling, publishing, monitoring, emergency, and kiosk workflow described in [signage-studio.md](signage-studio.md).
   - [x] Make the layout editor fully opaque and high contrast, replace the competing blue selection outline with one color-changing element border, and add a large, visible lower-right drag handle for resizing.
   - [x] Add a one-step information-frame builder that preserves a 16:9 presentation area and creates a configurable right sidebar plus one-to-five evenly distributed bottom boxes and one-to-three sidebar boxes.
   - [x] Add keyless Open-Meteo and U.S. National Weather Service presets, selectable weather fields, condition icons, unit selection, location labels and coordinates, persistent server caching, and a credential-backed custom-provider option.
   - [x] Add friendly content choices for photos, videos, logos, messages, QR and guest Wi-Fi codes, time/date, calendars, news/RSS, countdowns, live streams, webpages, and data widgets in information-frame slots.
   - [x] Keep QR and Wi-Fi graphics inside their assigned frame; support simultaneous labels above, below, left, and right; and expose a background color for every element.
   - [x] Add two live-preview information-frame shades with alternating edge placement, real-time frame width/slot/color updates, and reliable color swatches.
   - [x] Add time/date visibility, ordering, format, and independent font-size controls; weekly repeating countdowns with `[countdown]` message templates; and postal-code weather lookup.
   - [x] Turn the presentation region into a signage-playlist player with an optional live-stream-when-available override that automatically returns to scheduled content.
   - [x] Render webpages and sandboxed custom HTML, provide draft browser preview and permanent paired browser display actions, and remove the redundant shape, icon, menu/data, slides, dashboard, social-feed, and traffic element choices.
   - [x] Allow any unused reusable layout, including an unwanted built-in starter, to be deleted while blocking deletion when a schedule or either the draft or published version of a playlist still references it.

   - [x] Replace form-only positioning with direct pointer drag, resize handles, a rotation handle, arbitrary numeric rotation, keyboard nudging, optional grid snapping, exact geometry controls, layering, opacity, fit/fill/stretch, horizontal and vertical flip, duplicate, lock, hide, and a larger live design canvas.
   - [x] Persist advanced object transforms in zone JSON and render them consistently in browser, Android TV, and Apple TV clients.
   - [x] Add live-stream zones accepting HLS, HTTP, RTMP, RTMPS, and RTSP; relay supported H.264 streams through local FFmpeg-generated HLS; keep source addresses off display manifests; and clean up inactive relay processes.
   - [x] Separate reusable **Layouts** from schedules with blank layouts, saved layouts, folders, search, duplicate, save-as-template, reusable branded templates, generic starter templates, thumbnails, and safe draft replacement.
   - [x] Add canvas undo/redo, zoom, drag-to-pan hand tool, live edge/center alignment guides, configurable grid size, multi-selection, persistent groups and group movement, bulk alignment/distribution, layer reordering, and full/content/position locking.
   - [x] Add standard and custom resolutions/aspect ratios, portrait and ultrawide canvases, reusable custom-size layouts, safe-area overlays, and per-screen orientation and resolution mapping.
   - [x] Add rich text with font, size, weight, emphasis, line spacing, alignment, and safe mixed-run formatting; strokes, corners, scannable QR codes, Wi-Fi QR sharing, animated tickers, live counters, and background audio, with matching browser, Android TV, and Apple TV manifest support.
   - [x] Add reusable signage apps/widgets for clocks, weather, RSS, calendars, webpages, Wi-Fi sharing, and approved custom web apps, with optional credentials encrypted and retained only on the local server.
   - [x] Add independent signage playlists containing media, layouts, apps, web content, hidden and transparent intervals, nested playlists, transitions, deterministic random playback, tag rules, CSV/cloud sources, region/global synchronization, duration totals, and timed visual preview.
   - [x] Add calendar scheduling for layouts, playlists, media/apps, screen on/off, volume, idle filler, overlap priority, recurrence exceptions, and scoped recurring edits for one event, this and future events, or the entire series.
   - [x] Add explicit draft/save/publish and push-to-screen states, content versioning, exact screen-manifest preview, bulk screen assignment, idle/default versus scheduled content, and visible per-screen download/publish progress.
   - [x] Add privacy-gated screen screenshots, proof-of-play API and CSV exports, signage playback errors, live-stream health, stream restart controls, source latency, screen/content status, and operator alerts.
   - [x] Expand emergency signage into reusable alert types, reviewed immediate broadcast/cancel, configurable duration, prepared offline alert media, exact-screen and tag broadcast groups, and an explicit pre-broadcast confirmation.
   - [x] Add optional browser touch/kiosk experiences with idle content, approved interaction content, inactivity timeout, close control, interaction indicator, virtual-keyboard guidance, and automatic emergency override.

- [x] **Signage Studio foundation, live-stream zones, and Android store distribution (v0.35.0)** — add direct zone dragging, resizing, arbitrary rotation, snapping, keyboard nudging, layers, opacity, fit, flip, duplicate, lock, and hide controls; relay HLS, HTTP, RTMP, RTMPS, and RTSP sources locally for browser, Android TV, and Apple TV displays; adopt PolyForm Noncommercial licensing and a commercial contributor grant; and split Android delivery into a clearly labeled GitHub-updated sideload build plus Google Play/Amazon store packages with external updating removed.

- [x] **Lesson planning and run-of-show improvements (v0.34.0)** — add always-visible teacher/volunteer notes per cue, whole-lesson substitute instructions, printable run sheets, trim/speed/repeat-aware estimates, live remaining duration and estimated finish, overrun guidance, flexible-time markers, same-room overlap warnings, agenda/day/week/month/room calendar views, complete copy or move across classes and dates, and an optional private pre-roll livestream monitor on the cellphone controller.

   - [x] Notes and the monitor are operator-only; the private monitor URL is never sent to an audience display manifest.
   - [x] Run sheets include every pre-roll, countdown, and main cue, scheduled times, duration, notes, flexible markers, and estimated finish in a print-specific layout.
   - [x] Copy/move preserves the complete cue structure and shifts scheduling timestamps safely while extending temporary media retention.
   - [x] Existing databases gain substitute-note, private-monitor, and flexible-time columns through the idempotent upgrader; templates and generated lessons preserve notes and flexible markers.
   - [x] Protocol parsing, server manifest/schedule/migration tests, web type/build/lint checks, browser workflow, Android builds/lint/tests, and Swift protocol compilation are part of the release validation.

- [x] **Multi-zone signage and approved information widgets (v0.33.0)** — build signage from approachable single, sidebar, split, header-grid, and dashboard presets containing up to eight independently styled media, text, clock, calendar, weather, menu, RSS, or generic data zones.

   - [x] Administrators approve trusted HTTP/HTTPS source origins centrally; signage validation rejects online sources that are not on that exact origin allowlist.
   - [x] The server refreshes approved information sources on each zone's configured interval, normalizes RSS, ICS calendar, weather JSON, menu text, and generic JSON into display-safe content, and preserves the last successful persistent cache when a refresh fails.
   - [x] The zone editor includes a live 16:9 preview, preset geometry, per-zone type/content/media/source/refresh/color controls, optional fine positioning, fallback text, and an explicit refresh action without requiring CSS or template code.
   - [x] Browser, Android TV, and Apple TV manifests and clients render the same responsive zone geometry, local clocks, cached information, images, and muted looping videos.
   - [x] Every zone media item participates in native and browser offline caching, readiness telemetry, safe media-impact reporting, and reference cleanup; existing single-message signage remains backward compatible.
   - [x] Existing databases gain idempotent layout, source-allowlist, and widget-cache columns; server tests cover allowlist enforcement, canvas validation, RSS/weather normalization, manifest zones, cached content, and multiple zone-media payloads.

- [x] **Simple and Advanced editing modes with visual trim/fade editing and core playback controls (v0.32.0)** — keep frequent cue settings in a compact Simple editor while an opt-in, locally remembered Advanced mode exposes fit, fill, letterbox, rotation, asymmetric crop, per-cue and per-lesson volume/mute, playback speed, repeat count, end behavior, still/slide duration, background color, and fade-through-black transitions.

   - [x] The filmstrip/waveform timeline has direct draggable IN and OUT handles plus independently colored fade regions and fade-boundary handles; the preview follows the exact trim edge or fade midpoint being adjusted and every handle remains keyboard-nudgeable.
   - [x] Numeric sliders and the visual timeline remain synchronized, and previews apply trim, audio-and-picture fades, transition fades, crop, rotation, fit, background, speed, and mute settings before saving.
   - [x] Browser, Android TV, and Apple TV playback manifests and clients honor the new visual and playback controls, including finite repeat counts and distinct advance, loop, pause-on-final-frame, and stop behavior.
   - [x] Lesson templates and duplicated or generated lessons preserve whole-lesson settings and every cue-level playback setting; existing appliance databases gain backward-compatible defaults through the idempotent upgrader.
   - [x] Server manifest tests cover effective lesson/cue volume and the new playback fields; server, web, Android, and Apple protocol builds pass. The full Apple TV target is compiled by release CI because this development host has Command Line Tools rather than the full Xcode toolchain; physical-device acceptance remains an operator release check.

- [x] **Account lifecycle administration and temporary browser displays (v0.31.1)** — keep every landing-page account action independently selectable; add approval-required self-registration; let administrators invite an email address with preselected permissions while the recipient chooses their own name, username, and password; provide explicit account creation, approval, setup-link resend, edit, pause/reactivate, temporary-password reset, and deletion controls; force administrator-issued temporary passwords to be replaced before any other authenticated API can be used; and automatically remove paired browser displays after two hours without a heartbeat while retaining native television pairings.

   - [x] Closed, approval-required, code-required, and open registration modes are enforced by the server and represented accurately on the sign-in page.
   - [x] Invitation setup links are random, hashed, single-use, purpose-bound, expire after three days, and preserve the administrator-selected role and granular permissions.
   - [x] Approval requests remain unable to sign in after email verification until an authorized administrator approves them; approval notification is attempted through the configured provider.
   - [x] Temporary passwords invalidate older sessions, require a first-login replacement, and cannot be used to call unrelated authenticated APIs before replacement.
   - [x] Browser-player credentials and screen records expire after two hours without a heartbeat; Android TV and Apple TV records are not subject to that automatic deletion.
   - [x] Existing databases gain explicit pending-approval, pending-setup, and required-password-change columns through the idempotent appliance upgrader.
   - [x] Server tests cover browser-pair expiration, native-screen preservation, lifecycle schema upgrades, and SSH recovery clearing a temporary-password requirement; the fresh-server browser workflow covers first-login replacement.

- [x] **Self-service entry, presentation ingestion, organized settings, and completed signage playback (v0.31.0)** — make sign-in the public landing page with registration-aware account links; add real Resend/Brevo delivery tests; split crowded settings into focused subpages; accept current and legacy PowerPoint, OpenDocument, Keynote, Word, PDF, and shared Google Slides sources from the Media Library or lesson page; convert them to timed PNG cues and insert them automatically; persist browser signage media with reported cache inventory; and complete emergency interruption/resume plus lesson-to-signage handoff across browser, Android TV, and Apple TV displays.

   - [x] Daily, selected-weekday, one-time, and always-available recurrence supports date ranges, local and overnight windows, exclusions, priority conflict rules, pause/resume, and screen or tag targeting.
   - [x] Manifests publish active and future signs; Android TV, Apple TV, and browser displays pre-stage targeted media and report cache readiness, pending work, and failures.
   - [x] Browser displays use durable Cache Storage for signage assets and serve cached audio, images, and video through the local service worker when offline.
   - [x] Emergency signs interrupt and later resume lesson playback; completed lessons return to current signage on all three display clients.
   - [x] Automated server, browser, web, Android, and Apple client validation covers the software behavior.
   - [ ] Manual acceptance on representative Android TV and Apple TV hardware remains an operator release check for D-pad, Siri Remote, sleep/wake, and real-network cache behavior.

- [x] **Legacy Intel encoding and reliable Android TV controls/updates (v0.30.5)** — identify Intel DRM nodes, retain modern QSV probes, add a true direct `h264_vaapi` pipeline with automatic legacy `i965` retry, and reuse the verified encoder for universal and adaptive copies. On Android TV, make short Left/Right presses select the previous/next lesson cue, long presses rewind/fast-forward, and media or center buttons control play/pause across local video, stills, and supported online players. Correct signing-certificate inspection on Android 9–12 and retain the production-certificate requirement so Shield TV and similar devices can install verified in-place updates.

- [x] **Immediate-capacity transcoding and launch update checks (v0.30.4)** — preserve the configurable lesson lead time as a priority guarantee while otherwise-idle capacity starts adaptive copies for the newest ready uploads immediately, and have the Android TV app contact the signed release manifest once on every cold launch without repeated checks during the same process.

- [x] **Resilient Android TV schedule timestamps (v0.30.3)** — normalize server manifest times to UTC, repair corrupted zero-offset characters seen on Android TV, treat unrecoverable optional schedule timestamps as unavailable instead of blocking IP, `.local`, discovery, or cached-manifest connections, and keep fresh-install sample lessons immediately visible across UTC day boundaries.

- [x] **Reliable Linux Quick Sync device selection (v0.30.2)** — enumerate every DRM render node, try FFmpeg's explicit QSV child-device and VAAPI-derived initialization paths, reuse the verified device for real conversions, show the selected device, and report actionable driver or service-permission failures.

- [x] **Android TV automatic local discovery (v0.30.1)** — use Android DNS-SD/NSD with a multicast lock to resolve the server-advertised `_lessoncue._tcp` service directly to its numeric address when `.local` hostname lookup fails, and persist the working address after pairing or reconnection.

- [x] **Android TV launcher artwork compatibility (v0.30.0)** — replace vector-only launcher artwork with density-specific raster icons and a branded 16:9 TV banner so Google TV, Android TV, and NVIDIA Shield launchers can consistently render LessonCue.

5. [x] **Intel Quick Sync transcoding acceleration (v0.29.0)**: Detect compatible Intel hardware and FFmpeg capabilities automatically; allow administrator enable or disable control; accelerate the existing TV-safe and adaptive transcoding queues; validate generated output; report active hardware acceleration and failures; and fall back safely to software transcoding. *(Implemented and validated.)*

   - [x] Linux and Windows servers run a real FFmpeg `h264_qsv` test encode at startup and every 24 hours instead of relying only on CPU names or encoder listings.
   - [x] Administrators can enable or disable acceleration and manually recheck hardware from Adaptive TV playback settings.
   - [x] Universal TV-safe 1080p and adaptive 720p/480p conversions use Intel Quick Sync when the verified capability is available.
   - [x] Every generated or remuxed output is validated as a nonempty H.264 MP4 with a usable video frame before it is installed.
   - [x] A Quick Sync failure removes the temporary result, records a concise operator-visible failure, and retries the complete job with `libx264`.
   - [x] Settings reports detection, active engine, last check, last hardware use, and recent fallback; each completed media derivative records its conversion engine.
   - [x] Native Linux installation adds the available Intel media driver and grants the restricted service render-device access; Docker documentation covers the explicit `/dev/dri` opt-in.
   - [x] Server tests cover accepted and rejected output-probe metadata; the full server, browser, web, installer, and packaging validation suite remains green.

4. [x] **SaaS registration and account self-service (v0.28.0)**: Add self-service registration with email verification, profile editing for name, email, username, and password, password recovery, administrator account controls, secure expiring tokens, rate limiting, and configurable Resend and Brevo delivery. Administrators can open registration publicly, close registration completely without requiring or accepting a code, or require a registration code. Administrators can create, replace, rotate, expire, and revoke registration codes to reduce spam or unauthorized signups. Preserve a local administrator-created-account path for installations that do not configure email. *(Implemented and validated.)*

   - [x] Closed-by-default, open, and code-required registration modes are enforced by the server; closed mode rejects supplied codes and self-registered users begin as Viewers.
   - [x] Verification, password-reset, and pending-email links are random, hashed, single-use, purpose-bound, and expire after 24 hours, one hour, and two hours respectively.
   - [x] Generic resend and recovery responses, password policy enforcement, per-address account rate limits, and session-version invalidation cover account discovery and stale-session risks.
   - [x] Every signed-in user can edit their own name, username, email, and password; sensitive changes require the current password and new email addresses remain pending until verified.
   - [x] Existing administrator controls create, edit, pause, reactivate, reset, permission, and delete accounts while preserving active-owner and privilege-escalation protections.
   - [x] Resend and Brevo delivery are configurable in Settings; the write-only key is provider-bound, Data Protection encrypted, stored locally with restrictive permissions, and excluded from Git.
   - [x] Administrators can create, edit expiry/use limits, replace, rotate, and revoke registration codes; full codes are displayed once and stored only as hashes with short hints.
   - [x] Local setup, administrator-created accounts, and documented SSH password reset continue to work without email configuration.
   - [x] Server unit tests cover token entropy/hash behavior, protected provider-key persistence, and both provider request formats; the fresh-server browser test covers closed registration, code administration, profile editing, local users, sign-out, and permission enforcement.
   - [x] Installation, implementation, operator, API-contract, and secret-backup documentation are complete.

3. [x] **Web playback client for computers and projectors (v0.27.0)**: Build a full-screen browser version of the TV client using the same manifest, acknowledgement, heartbeat, and controller protocols. Support keyboard and presentation-remote control, automatic reconnection, preloading where browser limits permit, kiosk-friendly startup, and clear handling of autoplay restrictions. *(Implemented and validated.)*

   - [x] Dedicated `/player` and `/display` routes run entirely from the self-hosted server without an administrator login or hosted interface.
   - [x] Secure TV-style pairing, device-token manifests, baseline command cursors, ordered command application, exact acknowledgement, and playback heartbeats reuse the native-client protocol.
   - [x] Local video, audio, image, webpage, and YouTube playback supports trims, volume, end behavior, synchronized audio-and-picture fades over black, browser diagnostics, and the automatically selected compatibility/transcode URL.
   - [x] Scheduled pre-roll loops, duration-aware countdown seeking and transition, designated-time lesson startup, signage, and next-item browser prefetching are included.
   - [x] Keyboard and presentation-remote controls cover play/pause, previous, next, restart, stop, and fullscreen with visible focus and an auto-hiding playback overlay.
   - [x] Automatic manifest/control reconnection, online/offline status, bounded retries, and clear invalid-pairing recovery are included.
   - [x] `/player?kiosk=1`, direct Screens-page launch actions, explicit autoplay/fullscreen guidance, and a blocking user-gesture recovery action make startup projector-friendly without bypassing browser security.
   - [x] TypeScript, production build, lint, fresh-server browser pairing/control/acknowledgement/heartbeat workflow, server tests, and documentation are complete.

2. [x] **Production-ready self-update system for sideloaded Android TV and Google TV (v0.26.0)**: Implement the updater directly in the existing LessonCue Android TV repository using its current architecture and conventions. Preserve playback, discovery, pairing, caching, and D-pad navigation, and do not perform an unrelated architecture rewrite. The completed implementation must compile, pass applicable tests, and include the following requirements:

   - [x] **Repository discovery before implementation**: Determine whether the project uses Kotlin or Java; Compose for TV, Jetpack Compose, Leanback, or XML views; current minimum, target, and compile SDK levels; networking library; dependency injection; settings storage; application ID and build variants; GitHub Actions workflows; and release-signing configuration. Use complete, type-safe Kotlin unless the project is Java-only.
   - [x] **Update manifest**: Check a public HTTPS JSON endpoint using this schema:

     ```json
     {
       "schemaVersion": 1,
       "channel": "stable",
       "versionCode": 15,
       "versionName": "1.3.0",
       "apkUrl": "HTTPS_URL_TO_SIGNED_APK",
       "sha256": "LOWERCASE_SHA256_OF_APK",
       "fileSize": 28493752,
       "mandatory": false,
       "minimumSupportedVersionCode": 1,
       "releaseNotes": "Description of the changes in this release."
     }
     ```

     Reject unsupported schemas, malformed or incomplete manifests, non-HTTPS URLs, releases for another channel, and redirects outside an explicit trusted-host allowlist. Compare `versionCode`, not `versionName`. Add configurable build values for `UPDATE_MANIFEST_URL`, `UPDATE_CHANNEL`, and `UPDATE_ALLOWED_HOSTS`. Never place tokens, signing secrets, or private credentials in the APK.
   - [x] **Update-check behavior**: Perform one nonblocking check shortly after every normal app launch, guarded against duplicate checks during the same process. Add a manual **Check for updates** action that always contacts the server and visibly reports update available, app current, or unable to check. Use reasonable connection, read, and download timeouts with lifecycle-safe coroutines and cancellation. Background failures must not interrupt normal app use. Do not use the Google Play In-App Updates API.
   - [x] **Android TV interface**: Provide a large, remote-friendly update screen showing installed version, available version, release notes, approximate size, **Download and update**, **Later** for optional releases, **Cancel download**, progress, errors, and retry. All controls must have visible focus, intentional default focus, predictable D-pad order, and predictable Back behavior. Persist dismissal of an optional `versionCode`, while still showing that update during a manual check. Block normal use only when the update is mandatory and the installed version is below `minimumSupportedVersionCode`; mandatory screens must still provide usable error and retry paths.
   - [x] **APK download**: Download into an app-private directory such as `cacheDir/updates/`, stream to a temporary `.part` file, enforce a reasonable maximum size, compare byte count with `fileSize` when supplied, rename only after successful completion, delete partial or invalid files, remove obsolete update APKs, and prevent simultaneous downloads. Handle cancellation, process recreation, redirects, network loss, storage failures, and HTTP errors. Use the project’s existing HTTP client unless there is a documented technical reason not to.
   - [x] **Independent APK verification**: Before opening the installer, verify the manifest SHA-256; application ID; a greater APK `versionCode`; compatibility with the installed signing certificate, including certificate history where applicable; successful Android package parsing; agreement between actual APK version and manifest; and HTTPS plus trusted-host compliance for both original and final URLs. Use `PackageManager.getPackageArchiveInfo` with modern signing flags and compatibility handling for older supported Android versions. Compare installed and downloaded certificate SHA-256 fingerprints. Never disable these checks in release builds.
   - [x] **Unknown-app permission**: Include `android.permission.REQUEST_INSTALL_PACKAGES` only where appropriate. Check `packageManager.canRequestPackageInstalls()`, explain why permission is needed, open `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` with the app package URI when required, recheck on return, avoid settings loops, and provide device-appropriate manual instructions when the settings activity is unavailable.
   - [x] **Official system installation flow**: Use `PackageInstaller` full-install sessions as the primary mechanism. Set the package name and expected size, stream the verified APK into the session, call `fsync`, and commit through an explicit correctly scoped callback using the required mutable `PendingIntent`. Handle every relevant status, including `STATUS_PENDING_USER_ACTION`, and launch only the system-provided confirmation intent. Handle success, cancellation, blocked installation, invalid APK, storage failure, generic failure, and abandonment of incomplete sessions. Never bypass Android’s confirmation screen or attempt silent installation on ordinary consumer devices. Preserve app data and settings by updating the same application ID with the same signing identity.
   - [x] **Distribution variants**: When practical, preserve or create `sideload` and `play` variants. The sideload variant includes external update checks, `REQUEST_INSTALL_PACKAGES`, and APK installation. The Play variant excludes that permission, external APK installation behavior, and prompts directing Play users outside Google Play. Avoid introducing flavors if they would unnecessarily break the current build; otherwise isolate updater configuration so a Play-compatible variant can be added later.
   - [x] **GitHub Releases publishing**: Add or update a workflow triggered by `v*` tags that builds the signed sideload release APK using GitHub Actions secrets, verifies signing, calculates SHA-256, obtains the actual version code and name from the build, generates `update.json`, and publishes `lessoncue-tv.apk`, `lessoncue-tv.apk.sha256`, and `update.json` for that exact tag. The workflow must fail rather than publish an unsigned, incorrectly signed, or incomplete release. Use GitHub’s built-in token or the existing secure release mechanism. For private source repositories, use a safe public release-only repository, public HTTPS endpoint, LessonCue-server update proxy, or public static release directory without embedding repository credentials in the app.
   - [x] **Signing safeguards**: Preserve the production application ID and signing identity. Require higher `versionCode` values, reject debug-signed production updates, prevent workflows from silently generating a new key, document required secrets and signing-key backup, mask secrets in logs, and never create, overwrite, rotate, or commit a production signing key without explicit authorization.
   - [x] **Tests and build validation**: Add unit tests for manifest parsing, schema rejection, version comparison, channel filtering, HTTPS and allowlist enforcement, SHA-256 verification, file-size validation, optional dismissal, mandatory-update logic, and malformed responses. Add practical instrumentation or integration coverage for TV focus, manual checks, permission return, cancellation, and installation callbacks. Run the applicable equivalents of `./gradlew test`, `./gradlew lint`, and `./gradlew assembleDebug`, plus the sideload release build when signing is available. Do not claim completion unless the project compiles, and clearly identify anything untested because a device, signing secret, or published test release was unavailable.
   - [x] **Acceptance testing and documentation**: Document exact Google TV or Android TV tests for current version, optional postponement, manual checks after dismissal, permission denial and approval, canceled or interrupted downloads, incorrect SHA-256, wrong application ID, wrong signing key, lower or equal version code, successful update with settings retained, canceled system confirmation, restart after installation, and full D-pad-only use. Add updater documentation covering architecture, configuration, manifest schema, release creation, GitHub secrets, signing-key backup, safe testing, rollback, why silent installation is unavailable, and how to disable the updater for a future Play build.
   - [x] **Completion report**: Review every changed file, remove temporary debug code, confirm no credentials or signing materials were added, run available builds and tests, and report files changed, architecture used, remaining configuration, test results, exact first-release publishing steps, and remaining limitations. Apply changes directly to the repository. If direct editing is unavailable, provide the complete contents of every new or modified file rather than partial patches.

   Automated unit, lint, APK-build, and Android TV emulator tests are complete. The representative physical-device acceptance matrix remains intentionally unchecked in `docs/android-tv-updater.md` until those models are exercised.

1. [x] **Operator experience quick fixes and control safety (v0.25.0)**: Dismiss confirmation notifications after approximately three seconds; apply room theme colors to controller backgrounds rather than buttons; add controller lock mode; enlarge the primary transport controls; provide clear ready, downloading, offline, reconnecting, and error states; and ensure every command receives visible acknowledgement. Add an administrator option requiring non-administrator room remotes to be opened from the local `.local` server rather than a public domain, ensuring those users must be connected to the campus network to control presentations. *(Implemented and validated.)*
- [x] **Priority 1.5 — newest releases from stable GitHub `latest` URLs, with Android TV debug and production builds together (v0.25.0)**
  - [x] Stable `/releases/latest/download/` URLs are documented for the server installer, signed TV APK, and debug TV APK.
  - [x] The tagged-release workflow now requires production signing material, verifies the signing-certificate fingerprint, and packages the signed `lessoncue-tv.apk` beside `LessonCue-AndroidTV-debug.apk`.
  - [x] The organization-owned Android production key was explicitly authorized, backed up outside the repository, stored in the local system keychain, and configured in GitHub Actions. The first paired production/debug release was published and both stable URLs, checksums, and the production certificate were independently verified.

- [x] **Resilient, pre-staged Cloudflare Tunnel connector (v0.24.1)** — the native installer pre-downloads and checksum-verifies the approved connector before remote access is enabled; daily protected checks keep the pinned connector ready and application updates can advance it safely; atomic replacement, active-tunnel restart, and rollback protect working installations; the updater repairs connectors disabled by the earlier short startup window; QUIC/HTTP2 negotiation keeps retrying; server metrics detect recovery; and Settings reports the installed version, last verification, update errors, and a clear retry action.
- [x] **Administrator-managed media taxonomy (v0.24.0)** — administrators define up to 100 approved hierarchical folder paths and 100 approved tags; existing organization values migrate safely; uploaders choose from touch-friendly selectors on lesson and Media Library uploads, online media, and single or bulk organization; the server canonicalizes approved names and rejects unapproved values; in-use definitions cannot be removed until media is reassigned; and backup/restore preserves the taxonomy with browser and migration coverage.
- [x] **Organized server settings (v0.23.1)** — software-update status and controls now lead the Settings page; organization defaults and all four appearance colors share one form and save action; storage and adaptive playback remain adjacent; and local connection settings now precede controller and remote-access controls.
- [x] **Adaptive server-side transcoding (v0.23.0, expanded in v0.30.4)** — reusable local 720p and 480p H.264/AAC derivatives; immediate preparation of new uploads whenever the priority worker is idle; per-screen selection from decoder capability, measured network quality, and free device storage; configurable one-to-thirty-day pre-generation as a latest-start guarantee for assigned lessons; universal 1080p fallback while a selected profile is queued; version-aware invalidation; checksummed range delivery; storage enforcement, retention, backup, and deletion integration; administrator queue, retry, progress, size, and error controls; manifest protocol fields; and fresh-server browser coverage using real FFmpeg outputs.
- [x] **Audiovisual fades (v0.22.1)** — fade timers now apply one synchronized envelope to audio and picture in timeline previews, regular browser previews, Android TV/Fire TV, and Apple TV; visual media fades over a true black stage while operator controls and notes remain available.
- [x] **Editable classrooms and 30-day recycling bin (v0.22.0)** — classroom editing and removal; recoverable soft deletion for classrooms, their lessons, individual/bulk lessons, manually removed media, and automatically expired media; administrator-only restore and purge-all controls; storage-aware preservation of recycled files and references; hourly permanent cleanup after 30 days; and server-enforced hiding of recycled records from planning, schedules, playback manifests, and ordinary APIs.
- [x] **Dedicated classroom controllers (v0.21.0)** — administrator-assigned room paths and optional public hostnames; per-class colors; locally generated classroom and lesson QR codes; installable phone landing pages; server-enforced class and lesson scope; an independently PIN-protected universal remote; and expiring, restart-cleared temporary controller links for substitute and event access.
- [x] **Optional secure remote access (v0.20.0)** — administrator-controlled remotely managed Cloudflare Tunnel setup; public-hostname and loopback-origin guidance; required exposure acknowledgement and Cloudflare Access recommendation; write-only token or service-command input; root-only credential handoff; a checksum-verified pinned `cloudflared` binary; a dedicated unprivileged, systemd-hardened connector; outbound-only operation; active edge-connection and connector-version reporting; safe token rotation and disable-time credential removal; trusted loopback forwarded-header handling; audit events without secrets; and local access that remains available and enabled by default.
- [x] **Bulk planning and media operations (v0.19.0)** — multi-file uploads from both lessons and the Media Library; lesson selection with archive, restore, class move, date/time shift, title-prefix rename, and delete actions; playlist selection with role, volume, ending, skip, title-prefix, and remove actions; and media selection with bulk rename, folder/tag organization, retention, and deletion. Every action is permission-protected, capped at 500 records, audited, manifest-aware, and covered by the fresh-server browser workflow.
- [x] **Actionable screen diagnostics (v0.18.0)** — per-file cache inventory and byte counts; queued, active, and failed downloads; persistent client download errors; runtime decoder capability reporting; measured local-network latency and quality; clock-drift warnings; diagnostic freshness; and explicit per-screen screenshot consent with a visible TV capture notice, one-time 60-second requests, image validation, screen-administrator-only access, immediate deletion, and automatic 24-hour expiry. Older TV clients remain compatible and continue reporting the v0.10 heartbeat.
- [x] **Granular local permissions (v0.17.0)** — independent lesson-planning, media-upload, live-playback, screen-administration, user-administration, server-settings, backup/restore, and software-update capabilities; backward-compatible role presets; exact per-user overrides including intentional read-only access; server-enforced endpoint policies; permission-aware navigation and controls; pairing-PIN protection; top-level administrator escalation/final-account safeguards; session invalidation; appliance migration; and real playback-only browser authorization coverage.
- [x] **Reliable TV video playback and remote cue browser (v0.16.0)** — automatic codec/container/pixel-format inspection; local TV-safe H.264/AAC MP4 remuxing or transcoding with originals retained; compatibility progress and errors; derivative storage, checksums, retention, backup, range delivery, and manifest metadata; existing-library background auditing; format-aware Android and Apple TV caches; remote-scrollable pre-roll, countdown, and lesson cue selection on both native TV clients; and a directly visible visual timeline/fade action on every lesson cue.
- [x] **Reusable templates and recurring schedules (v0.16.0)** — complete lesson-structure snapshots; permanent retention for referenced reusable media; safe structure refresh; one-time instantiation; DST-aware weekly, biweekly, monthly, term, and custom-date generation; configurable title patterns and look-ahead; automatic daily and manual idempotent generation; pause/delete preservation; reversible holiday exceptions; audit, backup/restore, manifest live sync, responsive administration, and browser workflow coverage.
- [x] **Fully local presentation conversion (v0.15.0)** — asynchronous PDF, PowerPoint, OpenDocument Presentation, and Word conversion through headless LibreOffice and Poppler; screen-sized PNG media assets; storage and retention enforcement; conversion status/errors; generated folders/tags; configurable per-slide timing; ordered lesson insertion; audit and manifest invalidation; and a real PDF-to-lesson browser test.
- [x] **Media organization and safe versioning (v0.14.0)** — searchable hierarchical folders and tags, upload-time organization, filtered bulk organization, stable media IDs, lesson/signage impact previews, replacement with automatic original archival, downloadable and restorable version history, manual metadata reprocessing, manifest invalidation, and retention cleanup of every archived file.
- [x] **Validated browser backup restore (v0.13.0)** — staged ZIP and SQLite validation, record and media preview, explicit confirmation, disk-space protection, serialized restore mode, automatic full safety backup, database rollback on failure, optional media replacement, and preservation of server-local identity and connection settings.
- [x] **Visual timeline editor (v0.12.0)** — local filmstrip and waveform generation, visual in/out and fade controls, 0.04-second keyboard nudging, selection preview, validated named cue markers, TV manifest delivery, and jump-to-cue controls on the cellphone controller.
- [x] **Playback acknowledgement and live state (v0.10.0)** — Android TV and Apple TV report the command version actually received, current lesson and cue, state, elapsed time, duration, volume, cache readiness, device details, and playback errors. The phone controller receives local SignalR updates with polling fallback, and the Screens page exposes the same self-hosted diagnostics.
