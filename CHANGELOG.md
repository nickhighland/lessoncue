# LessonCue change log

This is the release history for LessonCue. Each release publishes both user and
developer notes on GitHub; the app shows only the user changes before an
administrator installs an update.

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
