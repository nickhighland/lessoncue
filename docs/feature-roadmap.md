# LessonCue feature roadmap

This is a comprehensive candidate list, not a promise that every item will be built. LessonCue should remain local-first, dependable during live playback, understandable to occasional operators, usable by schools and churches alike, and installable without a cloud account. Features that weaken those principles should be optional.

## Implemented roadmap milestones

- [x] **Resilient, pre-staged Cloudflare Tunnel connector (v0.24.1)** — the native installer pre-downloads and checksum-verifies the approved connector before remote access is enabled; daily protected checks keep the pinned connector ready and application updates can advance it safely; atomic replacement, active-tunnel restart, and rollback protect working installations; the updater repairs connectors disabled by the earlier short startup window; QUIC/HTTP2 negotiation keeps retrying; server metrics detect recovery; and Settings reports the installed version, last verification, update errors, and a clear retry action.
- [x] **Administrator-managed media taxonomy (v0.24.0)** — administrators define up to 100 approved hierarchical folder paths and 100 approved tags; existing organization values migrate safely; uploaders choose from touch-friendly selectors on lesson and Media Library uploads, online media, and single or bulk organization; the server canonicalizes approved names and rejects unapproved values; in-use definitions cannot be removed until media is reassigned; and backup/restore preserves the taxonomy with browser and migration coverage.
- [x] **Organized server settings (v0.23.1)** — software-update status and controls now lead the Settings page; organization defaults and all four appearance colors share one form and save action; storage and adaptive playback remain adjacent; and local connection settings now precede controller and remote-access controls.
- [x] **Adaptive server-side transcoding (v0.23.0)** — reusable local 720p and 480p H.264/AAC derivatives; per-screen selection from decoder capability, measured network quality, and free device storage; configurable one-to-thirty-day pre-generation for assigned lessons; universal 1080p fallback while a selected profile is queued; version-aware invalidation; checksummed range delivery; storage enforcement, retention, backup, and deletion integration; administrator queue, retry, progress, size, and error controls; manifest protocol fields; and fresh-server browser coverage using real FFmpeg outputs.
- [x] **Audiovisual fades (v0.22.1)** — fade timers now apply one synchronized envelope to audio and picture in timeline previews, regular browser previews, Android TV/Fire TV, and Apple TV; visual media fades over a true black stage while operator controls and notes remain available.
- [x] **Editable classrooms and 30-day recycling bin (v0.22.0)** — classroom editing and removal; recoverable soft deletion for classrooms, their lessons, individual/bulk lessons, manually removed media, and automatically expired media; administrator-only restore and purge-all controls; storage-aware preservation of recycled files and references; hourly permanent cleanup after 30 days; and server-enforced hiding of recycled records from planning, schedules, playback manifests, and ordinary APIs.
- [x] **Dedicated classroom controllers (v0.21.0)** — administrator-assigned room paths and optional public hostnames; per-class colors; locally generated classroom and lesson QR codes; installable phone landing pages; server-enforced class and lesson scope; an independently PIN-protected universal remote; and expiring, restart-cleared temporary controller links for substitute and event access.
- [x] **Optional secure remote access (v0.20.0)** — administrator-controlled remotely managed Cloudflare Tunnel setup; public-hostname and loopback-origin guidance; required exposure acknowledgement and Cloudflare Access recommendation; write-only token or service-command input; root-only credential handoff; a checksum-verified pinned `cloudflared` binary; a dedicated unprivileged, systemd-hardened connector; outbound-only operation; active edge-connection and connector-version reporting; safe token rotation and disable-time credential removal; trusted loopback forwarded-header handling; audit events without secrets; and local access that remains available and enabled by default.
- [x] **Bulk planning and media operations (v0.19.0)** — multi-file uploads from both lessons and the Media Library; lesson selection with archive, restore, class move, date/time shift, title-prefix rename, and delete actions; playlist selection with role, volume, ending, skip, title-prefix, and remove actions; and media selection with bulk rename, folder/tag organization, retention, and deletion. Every action is permission-protected, capped at 500 records, audited, manifest-aware, and covered by the fresh-server browser workflow.
- [x] **Actionable screen diagnostics (v0.18.0)** — per-file cache inventory and byte counts; queued, active, and failed downloads; persistent client download errors; runtime decoder capability reporting; measured local-network latency and quality; clock-drift warnings; diagnostic freshness; and explicit per-screen screenshot consent with a visible TV capture notice, one-time 60-second requests, image validation, screen-administrator-only access, immediate deletion, and automatic 24-hour expiry. Older TV clients remain compatible and continue reporting the v0.10 heartbeat.
- [x] **Granular local permissions (v0.17.0)** — independent lesson-planning, media-upload, live-playback, screen-administration, user-administration, server-settings, backup/restore, and software-update capabilities; backward-compatible role presets; exact per-user overrides including intentional read-only access; server-enforced endpoint policies; permission-aware navigation and controls; pairing-PIN protection; owner escalation/final-owner safeguards; session invalidation; appliance migration; and real playback-only browser authorization coverage.
- [x] **Reliable TV video playback and remote cue browser (v0.16.0)** — automatic codec/container/pixel-format inspection; local TV-safe H.264/AAC MP4 remuxing or transcoding with originals retained; compatibility progress and errors; derivative storage, checksums, retention, backup, range delivery, and manifest metadata; existing-library background auditing; format-aware Android and Apple TV caches; remote-scrollable pre-roll, countdown, and lesson cue selection on both native TV clients; and a directly visible visual timeline/fade action on every lesson cue.
- [x] **Reusable templates and recurring schedules (v0.16.0)** — complete lesson-structure snapshots; permanent retention for referenced reusable media; safe structure refresh; one-time instantiation; DST-aware weekly, biweekly, monthly, term, and custom-date generation; configurable title patterns and look-ahead; automatic daily and manual idempotent generation; pause/delete preservation; reversible holiday exceptions; audit, backup/restore, manifest live sync, responsive administration, and browser workflow coverage.
- [x] **Fully local presentation conversion (v0.15.0)** — asynchronous PDF, PowerPoint, OpenDocument Presentation, and Word conversion through headless LibreOffice and Poppler; screen-sized PNG media assets; storage and retention enforcement; conversion status/errors; generated folders/tags; configurable per-slide timing; ordered lesson insertion; audit and manifest invalidation; and a real PDF-to-lesson browser test.
- [x] **Media organization and safe versioning (v0.14.0)** — searchable hierarchical folders and tags, upload-time organization, filtered bulk organization, stable media IDs, lesson/signage impact previews, replacement with automatic original archival, downloadable and restorable version history, manual metadata reprocessing, manifest invalidation, and retention cleanup of every archived file.
- [x] **Validated browser backup restore (v0.13.0)** — staged ZIP and SQLite validation, record and media preview, explicit confirmation, disk-space protection, serialized restore mode, automatic full safety backup, database rollback on failure, optional media replacement, and preservation of server-local identity and connection settings.
- [x] **Visual timeline editor (v0.12.0)** — local filmstrip and waveform generation, visual in/out and fade controls, 0.04-second keyboard nudging, selection preview, validated named cue markers, TV manifest delivery, and jump-to-cue controls on the cellphone controller.
- [x] **Playback acknowledgement and live state (v0.10.0)** — Android TV and Apple TV report the command version actually received, current lesson and cue, state, elapsed time, duration, volume, cache readiness, device details, and playback errors. The phone controller receives local SignalR updates with polling fallback, and the Screens page exposes the same self-hosted diagnostics.

## Recommended next priorities

1. [x] **Visual timeline editor (v0.12.0)** — waveform and filmstrip-based trim, fade, chapter, and cue editing with frame-accurate preview.
2. [x] **Playback acknowledgement and live state (v0.10.0)** — show which cue is actually playing, progress, volume, cache readiness, and whether each controller command reached the screen.
3. [ ] **Automated browser and hardware playback tests** — exercise uploads, lesson editing, pre-roll, countdown transitions, controller commands, offline recovery, and upgrades on real TV devices. _The headless browser suite now configures a fresh local server, uploads an intentionally mislabeled AVI/MPEG-4/MP3 video through a lesson, waits for its H.264/AAC TV derivative, validates MP4 range delivery, edits and saves visual fades, exercises templates/schedules, verifies backup restore, and proves a custom playback-only account receives HTTP 403 for planning and user administration while retaining controller authority. Native state-machine and compile tests cover countdown scheduling and remote media navigation; physical Android TV and Apple TV, offline recovery, controller, and upgrade matrices remain._
4. [x] **Restore workflow in Settings (v0.13.0)** — upload and validate a backup, preview its contents, restore it safely, and automatically preserve the pre-restore state.
5. [x] **Media organization and versioning (v0.14.0)** — build on the existing bulk deletion and retention controls with tags, folders, replacement versions, reprocessing, and impact previews.
6. [x] **Presentation conversion (v0.15.0)** — convert PowerPoint, Keynote-exported PDF, and common document formats into screen-ready slide sequences.
7. [x] **Reusable templates and recurring schedules (v0.16.0)** — create a standard lesson structure, generate dated instances, and handle holiday exceptions.
8. [x] **Granular permissions (v0.17.0)** — separately control planning, uploads, playback, screen administration, user administration, settings, backups, and updates.
9. [x] **Screen diagnostics (v0.18.0)** — cache inventory, download queue, decoder capabilities, recent errors, clock drift, network quality, and privacy-gated one-time screenshots with visible TV notice and automatic expiry.
10. [x] **Bulk editing (v0.19.0)** — multi-file uploads from lessons and the library; multi-select lesson archive, restore, move, date/time shift, rename, and delete; playlist role, volume, ending, skip, rename, and removal; and media rename, folder/tag, retention, and deletion actions.
11. [x] **Cloudflare integration (v0.20.0)** — optional administrator-controlled Cloudflare Tunnel installation, credential rotation/removal, dedicated public hostname guidance, edge-connection status, and Cloudflare Access warning while local-only operation remains the default.
12. [x] **Dedicated classroom playback landing pages (v0.21.0)** — administrator-assigned `/room/...` paths and optional Cloudflare hostnames, per-class themes, classroom- or lesson-targeted local QR generation, phone Home Screen support, server-enforced room scope, a Settings-managed PIN for `/universalremote`, and expiring class/lesson-restricted temporary controller sessions.
13. [x] **Editable classrooms and administrator recycling bin (v0.22.0)** — classrooms can be edited, themed, addressed, and removed; lessons and media retain their existing create/edit/rename/remove workflows; deletions move classes, lessons, and media into an administrator-only 30-day recycling bin with restore and purge-all controls; scheduled cleanup permanently removes expired records and files.
14. [x] **Adaptive server-side transcoding (v0.23.0)** — generate reusable 720p and 480p H.264/AAC copies locally, choose a profile per screen from its decoder/network/storage report, prepare assigned lesson media ahead of time, expose queue and failure state, and keep the universal 1080p copy as a safe fallback.
15. [x] **Administrator-managed media folders and tags (v0.24.0)** — uploaders choose from administrator-approved hierarchical folders and tags in both lesson and library workflows; existing values migrate automatically and the server rejects unapproved organization values.
16. [ ] **Editing and playback expansion** — focus on the unchecked items in the Editing and playback section, beginning with a simple/advanced editing mode and core crop, fit/fill, volume, playback-speed, repeat, and transition controls.
17. [ ] **Web version of Android TV app** so it can be accessed by PC and shown on the full screen and controlled by keyboard or presentation remote.  This will allow for better preview and for projectors and screens attached to compete to be used as presentation devices.
18. [ ] **quickfixes** Make the little pop up confirmation boxes that appear in the top right corner disappear after three seconds. also, the room themes on the remote should change the background color, not button color.
19. [ ] **Optimize server transcoding of Intel quicksync is available.**
20. [ ] **Self-service registration** with admin approval or with a registration code to skip admin approval, and profile editing for a signed-in user's own name, email, username, and password with email integration through Resend and Brevo. also password reset through those services. 

## Administration and user experience

- Invitations with expiring setup links or administrator-generated one-time passwords.
- Forced password change at first sign-in and administrator-controlled password expiration policies.
- Granular custom roles and permissions instead of only the four built-in roles.
- Temporary, substitute, volunteer, and event-only accounts with automatic expiration.
- Active-session list with device, approximate network address, last activity, and remote sign-out.
- In-app change history with undo for common lesson, media, signage, screen, and settings operations.
- Global command palette, keyboard shortcuts, recently visited items, favorites, and saved filters.
- Contextual onboarding, sample tours, role-specific dashboards, and a dismissible operator checklist.
- Configurable home dashboard cards and organization-wide announcement banners.
- Mobile administration for urgent schedule and account changes, not only playback control.
- Per user and Per Server storage limits.  Administrators can assign storage limits to teachers to prevent one or two individuals from using excessive storage.


## Lessons, planning, and scheduling

- Lesson templates with placeholder slots, default trims, standard pre-roll, countdown, and outro content.
- Recurring lesson generation with weekly, monthly, term-based, and custom recurrence rules.
- Copy or move a complete lesson between classes, dates, campuses.
- Multi-select lesson operations, bulk archive, and batch date shifting.
- Conflict warnings for overlapping schedules, shared screens, missing files, or insufficient download time.
- Calendar day, week, month, agenda, and room views.
- Teacher notes on the mobile interface for each media item.
- Substitute-operator notes, printable run sheets, and QR codes that open the correct controller view.
- Estimated total duration, remaining duration, overrun warnings, flexible-time markers, and automatic compression suggestions.
- Pre-roll can play a livestream (locally streamed rtmp or youtube). In churches, this would allow users to monitor the service for children's dismissals.

## Media library and content lifecycle

- Folders, tags, collections, favorites.
- Full-text search across filenames, titles, notes, captions, transcripts, and lesson usage.
- Bulk upload, drag-and-drop folders, background transfers, pause/resume, retry, and resumable browser sessions.
- Duplicate and near-duplicate detection with safe consolidation of lesson references.
- Administrator-defined upload limits by role, user, class, file size, codec, and daily quota.
- Automatic thumbnails, contact sheets, waveform previews, scene detection, and poster-frame selection.
- Configurable transcoding profiles by screen capability and network bandwidth, determined by administrator on the backend in settings.
- Background reprocessing when codec policy or target hardware changes.
## Editing and playback

- Filmstrip and waveform timeline with frame-accurate in/out points and keyboard nudging.
- Editable fade curves, crossfades, audio-only fades, normalization, ducking, and loudness targets.
- Crop, rotate, aspect-ratio fit/fill, safe-area guides, image pan/zoom, and background color or blur.
- Per-item and per-lesson volume, mute, playback speed, repeat count, and end behavior.
- Gapless playback and prebuffering for seamless transitions.
- Configurable transitions between every supported media type.
- Still-image and slide duration defaults with per-item overrides.
- Background audio that continues across images or slides.
- Synchronized playback across multiple screens with clock-drift correction.
- Blackout, freeze, logo, clear, stop-all, and emergency-override controls.
- Offline webpage packaging for explicitly supported HTML content, with sandboxing and asset validation.
- PDF and presentation conversion into high-resolution, remote-navigable slide sequences.
- Priority on user-friendliness.  "Simple" and "Advanced" toggles to keep more complicated features (like crossfades, cropping, etc.) hidden from beginners.

## Cellphone controller
**all controls run in browser, not app. can be saved on apple and android devices as a web app. 
- Live “now playing” title, artwork, elapsed time, remaining time, state, volume, and screen acknowledgement.
- Low-latency push updates through SignalR with polling fallback.
- Volume, mute, blackout, freeze, logo, restart item, jump-to-cue, and emergency-stop controls.
- Lock mode that prevents accidental taps while preserving the transport display.
- Haptic, audio, or visual acknowledgement of accepted and completed commands.
- Favorites and a simplified volunteer layout limited to approved actions.
- QR-code launch into a particular room, lesson, or restricted temporary controller session.
- Control of screen groups with clear partial-success reporting.
- Handoff between operators and visible control ownership to prevent competing commands.

## Screens and device fleet

- Screen groups, room profiles, site hierarchy, tags, saved filters, and bulk assignments.
- Detailed heartbeat with app version, OS version, device model, display mode, uptime, free space, and temperature where available.
- Download queue, item-level cache verification, retry controls, bandwidth, and estimated readiness time.
- Remote cache purge, re-download, app restart, device reboot, and diagnostics bundle where platform APIs permit.
- Privacy-controlled current-frame screenshot with an on-screen indicator and audit event.
- Codec, resolution, audio-output, and web-content capability reporting.
- Clock synchronization and drift alerts for duration-aware countdowns and multi-screen playback.
- Scheduled bandwidth windows and rate limits to protect shared networks.
- Kiosk setup, start-on-boot validation, screen-saver suppression, and HDMI-CEC power scheduling.
- Device configuration profiles with staged rollout and drift detection.
- App update rings, minimum supported version, maintenance windows, rollback, and incompatible-version alerts.
- Screen replacement wizard that transfers assignment and revokes the previous credential.

## Signage and communications

- Multi-zone layouts containing media, text, clocks, weather from an administrator-approved source, and calendars.
- Recurring signage schedules, priority rules, exclusions, and campus-specific targeting.
- Emergency presets with explicit authorization, confirmation, expiration, and all-clear workflow.
- CAP or other standards-based emergency feed integration when locally required.
- RSS, calendar, menu, or data-driven widgets using allowlisted sources and cached fallback content.
- Signage proof-of-play history and screen acknowledgement reports.
- Automatic return to lesson mode with transition and conflict rules.

## Accessibility and localization

- WCAG 2.2 AA review of every browser workflow and automated accessibility checks in CI.
- Complete keyboard navigation, visible focus, skip links, logical headings, and screen-reader announcements.
- High-contrast themes, contrast validation for custom branding, color-blind-safe statuses, and reduced motion.
- Larger text and touch targets, compact and comfortable density settings, and dyslexia-friendly font option.
- Captions, transcripts, audio descriptions, sign-language video variants, and accessible media warnings.
- Interface translation framework with organization and per-user language selection.
- Locale-aware dates, times, time zones, week starts, number formats, and right-to-left layouts.
- Controller modes designed for low vision, motor accessibility, and cognitive simplicity.
- Automated detection of missing captions, insufficient contrast, flashing content, and unreadable slide text where feasible.

## Reliability, backup, and recovery

- Restore from the browser with validation, preview, automatic safety snapshot, progress, and health check.
- Scheduled encrypted backups with retention and destinations on local disk, NAS, SFTP, or administrator-chosen storage.
- Backup verification jobs and periodic guided restore drills.
- Point-in-time database recovery and media checksum reconciliation.
- Exportable disaster-recovery bundle containing configuration, credentials recovery guidance, package version, and checksums.
- Database integrity checks, repair guidance, and read-only safe mode after corruption is detected.
- Power-loss-safe media ingestion and transactional manifest publishing.
- Clear degraded-mode UI when thumbnailing, transcoding, updates, backups, or storage are unhealthy.
- End-to-end synthetic readiness check that follows the same manifest and file paths as a real TV.
- High-availability options for larger installations, while retaining a simple single-server default.
- Server migration wizard that preserves server identity intentionally or establishes a clean new identity.
- Configurable log retention, structured diagnostics export, and automatic redaction of secrets.
- UPS status integration and graceful shutdown hooks on supported local infrastructure.

## Security and governance

- Passkeys, TOTP, recovery codes, optional LDAP/OIDC/SAML, and organization-enforced authentication policy.
- Granular permissions, separation of duties, approval for destructive operations, and emergency-access accounts.
- HTTPS setup guidance and validation for reverse proxies, local certificate authorities, and managed devices.
- Signed release metadata, package signature verification, software bill of materials, and published provenance attestations.
- Configurable session lifetime, idle timeout, remembered-device policy, and global session revocation.
- IP or subnet allowlists, trusted-proxy configuration, login alerting, and local rate-limit controls.
- Audit search, filtering, retention, tamper-evident export, and forwarding to a local SIEM or syslog receiver.
- Encryption options for backups and selected sensitive configuration with documented key recovery.
- Secret rotation for device credentials, API tokens, signing keys, and update credentials.
- Privacy controls for screenshots, analytics, logs, media metadata, and user activity retention.
- Data export and deletion tools that support organizational governance requirements.
- Security headers and content sandbox profiles tailored separately for admin pages, previews, and allowed web media.
- Vulnerability scanning, dependency review, secret scanning, and routine threat-model updates in CI.

## Integrations and extensibility

- Calendar connectors and standards-based iCalendar feeds.
- OBS, ProPresenter, Bitfocus Companion, Stream Deck, NDI, MIDI, OSC, and GPIO integrations.

## Reporting and analytics

- Privacy-preserving local dashboard for lesson readiness, screen uptime, download failures, and storage growth.
- Playback event history showing what was requested, acknowledged, started, completed, skipped, or failed.
- Screen reliability, app-version, and cache-readiness reports by site and room.
- Pre-class readiness alerts at configurable intervals.
- Capacity forecasts for storage, bandwidth, device fleet, and upcoming scheduled content.
- Operator activity and audit summaries with permission-aware detail.
- No external telemetry by default; any diagnostics sharing should be explicit, reviewable, and revocable.
- Administrators can access detailed reports of user patterns.

## Installation, updates, and distribution

- Signed native packages for Debian/Ubuntu, RPM-based Linux, Windows, macOS development, and common ARM systems.
- Docker and Podman images with pinned versions, health checks, backup examples, and upgrade guidance.
- Unraid images and setup guide.
- Guided first-run checks for port conflicts, mDNS, time synchronization, FFmpeg, storage permissions, and firewall rules.
- Update channels for stable, preview, and development releases, with per-server maintenance windows.
- Compatibility matrix covering server, Android/Fire TV, tvOS, database, and protocol versions.
- Visible update progress, automatic rollback detail, release history, and manual rollback from Settings.

## Advanced and future ideas

- Precisely synchronized multi-room or multi-screen playback using measured clock offset and network latency.
- Audience interaction through local polls, response devices, or QR codes with strict privacy controls.
- Automatic transcript, chapter, caption, and searchable-content generation through optional local models.
- Rule-based automation such as “when every screen is ready, notify the coordinator.”
- Read-only public schedule or lobby page hosted by the local server.
