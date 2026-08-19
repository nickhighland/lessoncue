# LessonCue change log

This is the release history for LessonCue. Each release publishes both user and
developer notes on GitHub; the app shows only the user changes before an
administrator installs an update.

## v0.40.51 — Classroom remote preset reliability

### User changes

- Fixed Activity preset templates so the selected template is always the one
  applied, even when it is chosen and applied immediately.

### Developer changes

- Made the shared preset picker read the live select value when applying a
  template, removing a render-timing race exposed by the release browser suite.

## v0.40.50 — Classroom remote navigation

### User changes

- Reworked classroom and universal remotes around three clear tabs: Lesson,
  Playlist, and Activity.
- Made Lesson the weekly lesson picker and Playlist the place for individual
  cue selection, setup, notes, and timing details.
- Reduced the transport controls to compact icon buttons, moved locking to a
  small inline lock icon, and removed the remote header and save-as-app panel.

### Developer changes

- Removed the unused Quick tools launcher and kept screen selection in the
  Lesson surface so universal remote control remains available without a top
  bar.
- Added regression coverage for both remote tab semantics, compact controls,
  header removal, and activity-console continuity.

## v0.40.49 — Jackbox-style Activity rooms and host control polish

### User changes

- Added a full-screen classroom lobby with a persistent room code, scannable QR, absolute phone join address, and one-by-one player arrivals.
- Let players choose a fixed emoji and colour identity, switch players on shared phones, and see their own outcome, points, rank, and total after each reveal.
- Added TV response clocks, between-round standings races, first-in and streak callouts, optional automatic response-window advance, and a live host roster with answer counts.
- Made the host remote retain run timing, estimated finish, overrun guidance, playback errors, and save-as-app instructions alongside the compact controls.

### Developer changes

- Added server-resolved join addresses with reachable-mode fallback, per-participant projections, atomic auto-advance locking, server-derived callouts, and shared presentation components.
- Added lobby, join, identity, participant-result, host-console, standings, stage-clock, palette, sound fallback, reduced-motion, and full catalog smoke coverage.
- Added a manifest-driven optional sound-pack lookup with synthesized fallback cues and restored compact-remote diagnostics and run-of-show information.

## v0.40.48 — Activity game audio and visual polish

### User changes

- Gave Activity stages and participant phones distinct, coordinated colour
  identities for each game family and named preset.
- Added tactile phone feedback, gently animated waiting states, stronger
  countdown urgency, and large touch targets while preserving reduced-motion
  accessibility behavior.
- Added shared Activity sound effects with synthesized fallbacks, optional
  licensed sound-pack support, and display-only lobby/round/start/end themes.
  Phones never create a room-wide music chorus.
- Preserved teacher-customized themes instead of replacing them with generated
  game palettes.

### Developer changes

- Added shared palette resolution, contrast-aware accent text, Activity juice,
  audio preloading, preset-to-engine-to-shared sound lookup, and TV-only theme
  playback without changing server authority or participant projections.
- Added browser regression coverage for palettes, touch feedback, timer panic
  state, audio fallback/cascade, display ownership, theme transitions, and
  reduced motion.
- Added the documented optional sound-pack asset tree without bundling
  third-party audio.

## v0.40.47 — Google TV Activity display polish and reliability

### User changes

- Fixed the Google TV Activity display so every game in a lesson continues
  rendering when moving from one cue to the next.
- Made the wheel, scoreboards, countdowns, survey boards, ordering games, and
  other content-heavy Activities fit short TV WebView screens without
  clipping.
- Replaced the oversized native playback controls with a thin, translucent
  fading transport and clear web-controller guidance for Activities.
- Added visible loading, reconnect, and recovery states when a TV display
  cannot reach the Activity server.

### Developer changes

- Added a dedicated `/activity-display` projection route for native TV clients
  and keyed native WebViews to cue identity so destroyed views are never
  reused for later Activities.
- Added constrained-viewport browser coverage and a live 27-cue Google TV
  walk covering every seeded Activity type.

## v0.40.46 — Google TV Activity playback fix

### User changes

- Fixed Activity lesson cues on Google TV so they open the shared LessonCue
  web player instead of incorrectly showing “Media unavailable” or its pairing
  screen.
- Fixed Activity cues to open the requested round immediately, pass the paired
  TV identity securely to the shared player, and avoid the unnecessary first-
  play media prompt over the game.

### Developer changes

- Added TV playback-routing regression coverage for Activity cues that use a
  web-player URL without a downloadable media asset, including paired identity
  and web-player cache-busting coverage.

## v0.40.45 — Animal activity test pack and game-show polish

### User changes

- Added a ready-to-play animal-themed test catalog covering every current
  teacher-facing Activity Studio type, all collected in one lesson.
- Added a player-focused fun plan and richer game-show presentation guidance,
  including join prompts, reveal moments, scoring feedback, and celebration.
- Improved the phone-controller path so lesson activities expose their live
  definition, join code, QR link, and participant state to the host.

### Developer changes

- Added an idempotent `--seed-animal-activity-pack` command and regression
  coverage for the 27 current Studio activity types.
- Added live TV trivia join/reveal verification coverage and documented the
  player-facing engagement plan.

## v0.40.44 — Activities and game-show platform

### User changes

- Added Activities Studio with reusable teacher-created games, direct launch,
  lesson integration, grid/list library views, filtering, manual arranging,
  favorites, archiving, and bulk management.
- Added game-show experiences including Trivia, Read the Room, Punchline,
  Fake Out, Survey Board, Order Up, Match Minds, Doodle & Guess, Beat the
  Clock, Bracket Battle, Four Corners, and shared game-show utilities.
- Added phone participation with QR join codes, moderated responses, teams,
  scoring, host controls, reconnect-safe sessions, and flexible content counts.
- Signage is now always live; the obsolete organization feature checkbox was
  removed.

### Developer changes

- Added shared Activity definitions, live sessions, engine registry, role-safe
  projections, server-authoritative actions, scoring, timers, SignalR updates,
  and migration-safe persistence.
- Added Activity lesson-cue protocol, OpenAPI coverage, server validation,
  browser display/participant/host surfaces, and end-to-end coverage.

## v0.40.43 — installation and network guidance

### User changes

- Improved installation and LAN recovery guidance for administrators.

### Developer changes

- Updated the Docker/Avahi installation example to use the permanent
  `lessoncue.local` hostname.

## v0.40.42 — independent off-site backup destinations

### User changes

- Scheduled backups can now upload independently to Nextcloud, ownCloud, and
  another HTTPS WebDAV folder.
- Each destination has its own app-password/token setting, remote copy count,
  maximum age, upload status, retained-copy count, and actionable failure.
- Remote cleanup touches only LessonCue's encrypted `.lcbak` files; unrelated
  files in a shared WebDAV folder are preserved.
- Documentation now explains the separate Cloudflare Access for Infrastructure
  SSH plan and the credentials still required before it can be provisioned.

### Developer changes

- WebDAV listing is depth-limited, redirect-disabled, HTTPS-only, credential-free
  in URLs, and parsed with DTD/external-resolution protections.
- Legacy single-WebDAV policies migrate to the generic destination without
  losing their protected credential or retention settings.
- Added OpenAPI schemas and server tests for dual-provider upload, pruning,
  migration compatibility, retention, and validation failures.

## v0.40.41 — accurate local installer address

### User changes

- Linux installer completion messages now use the saved `.local` hostname, so
  isolated installations point operators to the address they will actually use.

### Developer changes

- Both the packaged installer and the prerequisite/download wrapper validate
  and reuse the persisted local hostname instead of printing a hard-coded name.

## v0.40.40 — reliable root-shell installer invocation

### User changes

- Linux installs now work from `sudo`, a root shell, or `su -c` even when the
  caller's `PATH` omits administrative `sbin` directories.

### Developer changes

- The packaged installer establishes a standard root execution path before
  checking and invoking `runuser`, `setpriv`, and service tooling.

## v0.40.39 — reliable Debian installer prerequisites

### User changes

- Linux installs now include the Debian package that provides `runuser` when
  the distribution splits it from `util-linux`, preventing a false prerequisite
  failure during media-sandbox validation.

### Developer changes

- The installer reports the exact missing capability and keeps the prior
  service recoverable when a host package layout differs.

## v0.40.38 — clearer live workflows and service diagnostics

### User changes

- Audience sessions now guide operators from poll creation to opening and QR sharing, with copy/download actions, live participant and moderation counts, and closed-session recovery.
- Media uploads run a server preflight that names the detected format, converter readiness, expected output, storage limits, and queue position before any bytes are sent.
- Controller focus mode provides large targets, visible current/next context, keyboard/remote shortcuts, selected-room and connection state, and command receipt feedback.
- Lesson editing separates Present now, Schedule, Save draft, Duplicate, Archive, and Delete, with local autosave recovery and a compact timeline.
- Service Admins can inspect storage, converters, queues, displays, backups, and updates and download a redacted support bundle.
- Large administration workspaces load on demand, with a first-interaction performance mark and a checked JavaScript bundle budget.

### Developer changes

- Added `/api/v1/media/preflight` and `/api/v1/support/bundle` to the OpenAPI contract.
- Expanded media preflight diagnostics across the broad catalog, including optional WebP/Theora and LibreOffice/Poppler readiness.
- Added browser accessibility, end-to-end, protocol, server, real-use, and bundle-budget verification to the release checklist.

## v0.40.37 — streamline signage playlist editing

### User changes

- Playlist cards now keep the timeline compact with a single duration indicator; production notes and item settings stay in the left inspector.
- The Playlist inspector now combines playlist and selected-item editing without a duplicate Selected item tab.
- Video items offer a Full video duration timing option, while custom timing remains available.
- Calendar elements keep one larger editable Title textbox so users can control title line breaks.

### Developer changes

- Removed the card-level notes/settings popovers and their duplicate controls while preserving inspector editing and playlist persistence.
- Full video timing derives from the selected media asset duration and updates the playlist item duration used for signage playback.
- Added browser coverage for full-video timing, consolidated inspector editing, and the compact card controls.
- Release metadata advances to 0.40.37 and Android version code 96.

## v0.40.36 — polished compact weather card

### User changes

- Weather elements now match the reference design with a bold location heading, illustrated condition icon, prominent temperature, and a clean precipitation, high/low, and wind row.
- Compact weather panels keep every text and icon region separate, so the temperature, conditions, and detail values no longer overlap or become partially obscured.
- Weather styling now adds a subtle dimensional background, purpose-built sun, droplet, and wind artwork, and consistent typography in both the editor and the live display.

### Developer changes

- Rebuilt the weather card around bounded responsive title, reading, and metrics rows shared by editor previews and live signage.
- Added browser geometry regression checks for clipping and overlap at narrow signage-panel dimensions.
- Release metadata advances to 0.40.36 and Android version code 95.

## v0.40.35 — assign signage to screens

### User changes

- The Signage editor's Screens tab now works and lets you select the paired screens that should display a Sign.
- The Screens page now switches from Assigned class to Assigned Screen for signage-only displays.
- Signs can be assigned or cleared directly from the Screens page, and the assignment updates the display immediately.

### Developer changes

- Added screen-level Sign assignment support to the admin PATCH API with validation for published Sign records.
- End-to-end coverage now exercises both Signage editor assignment and Screens-page assignment.

## v0.40.34 — rich signage typography and reference weather card

### User changes

- Every signage element now exposes a font choice, with rich formatting for editable titles and messages.
- Calendar event names wrap inside their panel instead of being clipped to one line.
- Weather elements now use the requested title, icon, temperature, conditions, precipitation, `H##/L##`, and wind layout; forecast, humidity, sunrise, and sunset controls are removed.

### Developer changes

- Unified responsive weather markup and styling between the layout editor and live display, including scalable SVG detail icons and wind direction handling.
- Weather field normalization now strips unsupported legacy fields from saved layouts and cache generation.
- Release metadata advances to 0.40.34 and Android version code 93.

## v0.40.33 — organized signage widget layouts and responsive text spacing

### User changes

- Weather elements now keep their title, reading, conditions, and detail values organized in a compact information card.
- Calendar elements keep the upcoming-events heading, event title, date, time, and optional description readable inside narrow panels.
- QR and Wi-Fi labels resize with their panels, and line-spacing settings now apply to widget text as well as ordinary signage text.

### Developer changes

- Added panel-relative sizing and line-height coverage for live weather, calendar, QR, and Wi-Fi rendering.
- Matched the signage editor previews to the live display structure, including separate calendar date/time rows and grouped weather details.
- Release metadata advances to 0.40.33 and Android version code 92.

## v0.40.32 — responsive signage elements and calendar descriptions

### User changes

- Signage elements now scale typography and widget content from the panel dimensions, so resizing a panel preserves its proportions.
- Weather elements use a responsive information-card layout with icon placement, icon color, and detail controls.
- Calendar elements use a compact upcoming-events layout with optional date, time, location, and description fields. Descriptions are hidden by default and can be enabled in element settings.

### Developer changes

- Added panel-relative container sizing to both signage editors and the live display renderer.
- Preserved calendar descriptions from iCalendar feeds and added browser coverage for responsive rendering and opt-in descriptions.
- Release metadata advances to 0.40.32 and Android version code 91.

## v0.40.31 — reliable signage drag-and-drop and release packaging

### User changes

- Make mouse dragging of ready media use the same reliable pointer path as touch dragging, avoiding Chromium native-drag inconsistencies while retaining native drag support.
- Preserve duplicate protection, click-to-add, timeline insertion, duration controls, notes, and item settings.

### Developer changes

- Make user-facing release-note extraction tolerate release entries that use top-level bullets instead of a dedicated `User changes` subsection.
- Release metadata advances to 0.40.31 and Android version code 90.

## v0.40.30 — pointer-based signage drag-and-drop fallback

- Make mouse dragging of ready media use the same reliable pointer path as touch dragging, avoiding Chromium native-drag inconsistencies while retaining native drag support.
- Preserve duplicate protection, click-to-add, timeline insertion, duration controls, notes, and item settings.

## v0.40.29 — native signage drag-and-drop bridge

- Handle ready-media drops through the browser's native capture-phase drag events so the first item can be dropped into an empty signage playlist reliably across Chromium/Linux environments.
- Prevent duplicate inserts while preserving click-to-add, touch dragging, timeline insertion, duration controls, notes, and item settings.

## v0.40.28 — hardened signage drag-and-drop

- Make ready-media drag-and-drop reliable in hosted Chromium/Linux browsers, including the first item dropped into an empty signage playlist.
- Keep click-to-add, touch dragging, timeline insertion, duration controls, notes, and item settings unchanged.

## v0.40.27 — signage drag-and-drop release fix

- Preserve the active media identifier across the browser drag lifecycle so dragging ready media into an empty signage playlist reliably creates the first timeline card.
- Commit the drop from the drag-end event as a browser compatibility fallback when a hosted browser omits the expected drop callback.
- Keep the existing signage horizontal timeline, duration controls, notes, and item settings behavior unchanged.

## v0.40.26 — signage drag-and-drop release fix

- Preserve the active media identifier across the browser drag lifecycle so dragging ready media into an empty signage playlist reliably creates the first timeline card.
- Keep the existing signage horizontal timeline, duration controls, notes, and item settings behavior unchanged.

## v0.40.25 — Android TV redesign and media workflow reliability

### User changes

- Android TV now has a calm, remote-friendly LessonCue interface with branded connection, pairing, lesson library, cue timeline, and playback screens.
- Lesson detail shows the next lesson clearly, preserves cue order, supports starting from any cue, and keeps playback controls available through a temporary overlay.
- Signage playback preserves emergency, offline, and display-power behavior while sharing the improved playback presentation.
- Linux media uploads avoid the capability configuration that caused Bubblewrap and `setpriv` processing failures on restricted installations.
- Signage playlist items now retain operator notes.

### Developer changes

- Added centralized Android TV colors, spacing, focus treatment, cue models, playback overlay behavior, and screen-level tests.
- Added 720p and 1080p visual verification for the primary Android TV screens.
- Hardened media-worker capability isolation by clearing ambient and inheritable capabilities without attempting an unprivileged bounding-set mutation.
- Release metadata advances to 0.40.25 and Android version code 84.

## v0.40.24 — grouped playback sections

### User changes

- Total playback now always presents Pre-Roll, Countdown, Main Lesson, and Post Lesson in playback order.
- Each playback section has a distinct shaded background, including visible empty drop zones for new lessons.
- Ready media can be dragged directly into an empty section or inserted within an existing section.

### Developer changes

- Total-view rendering groups cues by role instead of relying on interleaved global positions.
- Drag-and-drop insertion preserves the selected section role and calculates positions within that section.
- Release metadata advances to 0.40.24 and Android version code 83.

## v0.40.23 — clearer lesson playback builder

### User changes

- Removed the redundant “Preview with Trims & Fades” strip from the lesson playback builder.
- Playback sections now use high-contrast blue Pre-Roll, purple Countdown, red Main Lesson, and teal Post Lesson colors.
- Each cue’s left category rail matches its playback section, including in the Total view.
- Lesson cards stay compact with consistent previews, dedicated Notes/duration/Advanced Options footer controls, and clearer still-slide duration behavior.

### Developer changes

- Shared section color tokens now drive both section tabs and per-role cue rails, preventing Total view from flattening all cue colors.
- Still-image cues omit video-only trim/fade controls while videos retain the visual editor.
- Release metadata advances to 0.40.23 and Android version code 82.

## v0.40.22 — media-processing validation repair

### User changes

- Corrective release for the compact lesson builder and media workflow update.

### Developer changes

- The explicit `LESSONCUE_MEDIA_WORKER_SKIP_SANDBOX=1` validation override now
  bypasses the outer Linux `setpriv` wrapper as well as the media-worker
  Bubblewrap wrapper. Production remains sandboxed by default.
- Release metadata and Android version code advance to 0.40.22 and 81.

## v0.40.21 — compact lesson builder and reliable media workflows

### User changes

- Lessons now use compact horizontal timeline cards with visual previews, notes, durations, and Advanced Options menus.
- Playback is organized into Pre-Roll, Countdown, Main Lesson, Post Lesson, and Total sections, with looping pre-roll/post-lesson media and drag-and-drop Ready media.
- Still images and slides can remain untimed while carrying an optional expected lesson-duration estimate; new cues pause at the last frame by default.
- Media Library renaming preserves file extensions, and media-type filtering makes large libraries easier to browse.
- Linux media uploads now process correctly on installations affected by Bubblewrap capability restrictions.

### Developer changes

- Added section-aware manifest playback for post-lesson loops across the web player and Android TV client.
- Repaired visual trim/fade pointer interaction and added a pointer fallback for reliable timeline drag insertion.
- Added extension-preserving rename validation, untimed presentation conversion, and protected media-worker capability isolation.
- Release metadata and Android version code advance to 0.40.21 and 80.

## v0.40.20 — compact lesson timeline controls

### User changes

- Lesson timeline cards now stay compact with dedicated Notes and Advanced Options buttons for each cue.
- Ready media can be dragged to any position in the lesson timeline, with click-to-add still available.

### Developer changes

- Added accessible cue popovers for notes, playback settings, precision timing, and visual trim/fade controls.
- Added browser coverage for drag insertion, cue popovers, notes persistence, and existing advanced playback workflows.
- Release metadata and Android version code advance to 0.40.20 and 79.

## v0.40.19 — reliable SQLite snapshot verification

### User changes

- Linux updates no longer reject a valid protected snapshot when SQLite creates temporary WAL bookkeeping files during its integrity check.

### Developer changes

- Database integrity checks run against a disposable verification copy, preserving the byte-for-byte rollback snapshot for comparison and restoration.
- Linux transaction coverage reproduces SQLite read-only WAL/SHM side effects and confirms they never enter protected snapshots.
- Release metadata and Android version code advance to 0.40.19 and 78.

## v0.40.18 — self-repairing protected updates

### User changes

- Native Linux updates now run the updater shipped in the verified release before creating the protected snapshot, so updater fixes can repair older installations instead of failing behind the old updater.
- Update requests pin the release version selected by LessonCue, preventing a later release from being installed accidentally while an operation is queued.
- The Linux installer can repair only the signed updater and systemd units without replacing the application or user data.

### Developer changes

- The updater securely hands off to a checksum- and signature-verified release candidate while the original process retains the operation lock.
- Linux transaction tests cover release-updater handoff, pinned request versions, updater replacement, rollback, and snapshot failure diagnostics.
- Release metadata and Android version code advance to 0.40.18 and 77.

## v0.40.16 — reliable protected update diagnostics

### User changes

- Failed native updates now report the exact protected snapshot phase that needs attention while leaving the existing installation unchanged.

### Developer changes

- Linux snapshot creation now validates and reports every copy, comparison, rename, and metadata-write step.
- Release metadata and Android version code advance to 0.40.16 and 75.

## v0.40.15 — horizontal lesson and signage builders

### User changes

- Lesson editing now uses one clean surface with lesson details above the playback sequence.
- Transition Options and Playback Options stay collapsed until they are needed.
- Lesson and signage playlists now use horizontal cards with a media library shelf.

### Developer changes

- Browser coverage follows the consolidated lesson editor and horizontal signage playlist.
- Release metadata and Android version code advance to 0.40.15 and 74.

## v0.40.14 — reliable uploads on port 80 servers

### User changes

- PNG and other media uploads now process correctly when the Linux server listens on port 80.

### Developer changes

- Media workers clear inherited service capabilities before starting Bubblewrap.
- The Linux installer verifies that the required `setpriv` capability-isolation utility is installed.
- Release metadata and Android version code advance to 0.40.14 and 73.

## v0.40.13 — reliable Linux installer validation

### User changes

- Re-running the Linux installer now validates media conversion under the same service account used in production.
- Existing servers with private media temporary directories can complete the repair or upgrade without a false sandbox permission failure.

### Developer changes

- The installer Bubblewrap probe runs as `lessoncue`, matching the systemd service identity and user-namespace mapping.
- Linux media-worker regression coverage exercises a service-owned 0700 probe directory.
- Browser validation now targets the unique playback heading when the same title is also shown in media metadata.
- Release metadata and Android version code advance to 0.40.13 and 72.

## v0.40.11 — recoverable protected updates

### User changes

- Concurrent protected update requests now record a clear durable result instead of leaving the Software updates screen stuck in progress.
- A request that loses the updater lock is safely discarded while the active operation continues.

### Developer changes

- The Linux updater writes a failure result and consumes duplicate requests when another updater process owns the lock.
- The disposable transaction regression covers lock contention on both x64 and arm64 runners.
- Release metadata and Android version code advance to 0.40.11 and 70.

## v0.40.10 — a clearer lesson workflow

### User changes

- The administration sidebar is organized into clearer sections, with faster dashboard actions for common tasks.
- Lesson editing now separates lesson settings from the playback sequence, making run-of-show changes easier to review.
- The Media Library supports both grid and list views for visual browsing or detailed management.
- Administration dialogs and navigation labels have improved contrast and accessibility behavior.

### Developer changes

- Browser coverage follows the tabbed lesson editor and explicit Media Library view modes.
- The Linux updater transaction fixture selects the correct release asset on both x64 and arm64 runners.
- Release metadata and Android version code advance to 0.40.10 and 69.

## v0.40.9 — clearer update recovery

### User changes

- If a server update is already running, LessonCue now reports that clearly instead of showing a generic server error.
- Failed update attempts retain a useful explanation so administrators know what to fix before trying again.
- A failed update no longer leaves the update screen stuck in an endless installing state.

### Developer changes

- The Linux updater records failures that happen before transaction setup, including signature and package validation failures.
- Update and rollback requests are serialized in the web process, and expected operation contention returns HTTP 409 instead of HTTP 500.
- Regression coverage verifies that an invalid release signature produces a durable failure result for the server UI.

## v0.40.8 — more reliable server updates and media playback

### User changes

- Linux server updates now install and verify the components needed for media conversion before restarting the server.
- Older Intel processors can use supported H.264 hardware encoding, with automatic software conversion when hardware is unavailable.
- Media names can be replaced completely, with a clear warning when the new name is already in use.
- Account security settings now show the authenticator option in one place.
- Troubleshooting failures retain useful details for seven days.

### Developer changes

- The Linux package now installs the protected media worker and an Intel render-node udev rule, validates the sandbox before service restart, and removes both during uninstall.
- Bubblewrap preserves legacy VAAPI driver selection, exposes the required read-only DRM topology, and maps namespaced root to the invoking service account for device access.
- Transactional updates snapshot and restore the media worker and render-node rule alongside the application and service units.
- Haswell validation confirmed H.264 VAAPI through Debian's `i965` driver; QSV/oneVPL remains a newer-platform path.

## v0.40.7 — safer server upgrades

### User changes

- Re-running the Linux installer on an existing server now completes safely, so repairs and upgrades do not fail while the server is running.

### Developer changes

- The Linux installer stops the active LessonCue service before replacing its executable and restores service availability if installation exits early.

## v0.40.6 — more dependable updates and clearer diagnostics

### User changes

- Server updates now explain why an update could not start and provide a failure reference for support.
- Service administrators can filter troubleshooting logs to failures and expand their technical details.
- Failures remain available for seven days so intermittent update problems are easier to diagnose.

### Developer changes

- Update requests now record trace IDs, protected-operation decisions, HTTP failure statuses, and exception details.
- The Linux installer repairs updater-owned configuration paths left with older permissions.
- Failures use a separate seven-day JSONL store alongside the normal 2,000-entry runtime log.

## v0.40.5 — clearer updates and a more dependable release

### User changes

- The update screen now explains the purpose of an available update before you install it.
- Media uploads now follow the current two-step media workflow.
- Administration screens have clearer contrast and better labels for keyboard and assistive-technology users.

### Developer changes

- Browser validation now follows the current two-step media workflow and tolerates cross-platform font rasterization.
- Release validation no longer depends on the Bubblewrap gate that cannot run reliably on GitHub-hosted runners.
- GitHub releases publish both sections, while Android TV update metadata carries only the user changes.
