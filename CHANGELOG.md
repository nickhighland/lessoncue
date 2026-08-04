# LessonCue change log

This is the release history for LessonCue. Each release publishes both user and
developer notes on GitHub; the app shows only the user changes before an
administrator installs an update.

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
