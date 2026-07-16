# LessonCue feature roadmap

This is a comprehensive candidate list, not a promise that every item will be built. LessonCue should remain local-first, dependable during live playback, understandable to occasional operators, usable by schools and churches alike, and installable without a cloud account. Features that weaken those principles should be optional.

## Recommended next priorities

1. **Playback acknowledgement and live state** — show which cue is actually playing, progress, volume, cache readiness, and whether each controller command reached the screen.
2. **Automated browser and hardware playback tests** — exercise uploads, lesson editing, pre-roll, countdown transitions, controller commands, offline recovery, and upgrades on real TV devices.
3. **Restore workflow in Settings** — upload and validate a backup, preview its contents, restore it safely, and automatically preserve the pre-restore state.
4. **Media organization and versioning** — build on the existing bulk deletion and retention controls with tags, folders, replacement versions, reprocessing, and impact previews.
5. **Visual timeline editor** — waveform and filmstrip-based trim, fade, chapter, and cue editing with frame-accurate preview.
6. **Presentation conversion** — convert PowerPoint, Keynote-exported PDF, and common document formats into screen-ready slide sequences.
7. **Reusable templates and recurring schedules** — create a standard lesson structure, generate dated instances, and handle holiday exceptions.
8. **Granular permissions** — separately control planning, uploads, playback, screen administration, user administration, settings, backups, and updates.
9. **Screen diagnostics** — expose cache inventory, download queue, codec capabilities, recent errors, clock drift, network quality, and a privacy-conscious screenshot request.
10. **Guided update and rollback history** — update rings, release notes, compatibility checks, visible progress, and one-click rollback to the last healthy version.

## Administration and user experience

- Self-service profile editing for a signed-in user's own name, email, username, and password.
- Invitations with expiring setup links or administrator-generated one-time passwords.
- Forced password change at first sign-in and administrator-controlled password expiration policies.
- Granular custom roles and permissions instead of only the four built-in roles.
- Per-class, campus, folder, or screen-group access restrictions.
- Temporary, substitute, volunteer, and event-only accounts with automatic expiration.
- Passkeys, TOTP authenticator codes, recovery codes, and optional two-person approval for high-impact actions.
- Active-session list with device, approximate network address, last activity, and remote sign-out.
- User CSV import/export and directory synchronization through LDAP or optional OIDC/SAML providers.
- Avatar or initials customization, preferred language, time format, date format, and notification preferences.
- In-app change history with undo for common lesson, media, signage, screen, and settings operations.
- Global command palette, keyboard shortcuts, recently visited items, favorites, and saved filters.
- Contextual onboarding, sample tours, role-specific dashboards, and a dismissible operator checklist.
- Configurable home dashboard cards and organization-wide announcement banners.
- Mobile administration for urgent schedule and account changes, not only playback control.

## Lessons, planning, and scheduling

- Lesson templates with placeholder slots, default trims, standard pre-roll, countdown, and outro content.
- Recurring lesson generation with weekly, monthly, term-based, and custom recurrence rules.
- Holiday, closure, special-event, and daylight-saving exceptions.
- Copy or move a complete lesson between classes, dates, campuses, or servers.
- Multi-select lesson operations, bulk archive, and batch date shifting.
- Draft, review, approved, published, completed, and archived workflow states.
- Approval comments, assignments, due dates, mentions, and a visible readiness checklist.
- Conflict warnings for overlapping schedules, shared screens, missing files, or insufficient download time.
- Calendar day, week, month, agenda, and room views.
- iCalendar import/export and optional two-way synchronization with common calendar services.
- Substitute-operator notes, printable run sheets, and QR codes that open the correct controller view.
- Lesson version history, named snapshots, compare, restore, and audit attribution.
- Conditional cues and simple branching for different audience choices or time remaining.
- Cue groups that can advance together, remain manual, or repeat until explicitly released.
- Estimated total duration, overrun warnings, flexible-time markers, and automatic compression suggestions.
- Rehearsal mode that never changes the production schedule or screen assignment.
- An always-visible “safe to start” report covering media, screens, schedules, and storage.

## Media library and content lifecycle

- Folders, tags, collections, ratings, favorites, custom metadata, and saved searches.
- Full-text search across filenames, titles, notes, captions, transcripts, and lesson usage.
- Bulk upload, drag-and-drop folders, background transfers, pause/resume, retry, and resumable browser sessions.
- Watch folders and optional imports from local NAS, SMB, NFS, SFTP, or removable storage.
- Duplicate and near-duplicate detection with safe consolidation of lesson references.
- File versioning that preserves an asset's identity while allowing replacement and rollback.
- Media usage graph showing every lesson, template, signage item, and screen cache that depends on a file.
- Retention preview, expiration alerts, legal hold, archive tiers, recycle bin, and configurable recovery window.
- Storage forecast, growth trends, largest-file report, stale cache report, and cleanup recommendations.
- Administrator-defined upload limits by role, user, class, file size, codec, and daily quota.
- Antivirus or content-scanning hooks and isolated processing with strict CPU, memory, time, and disk limits.
- Rights-holder, source, license, release, allowed dates, attribution, and usage-restriction metadata.
- Automatic thumbnails, contact sheets, waveform previews, scene detection, and poster-frame selection.
- Automatic proxy generation for browser preview while retaining a higher-quality playback master.
- Configurable transcoding profiles by screen capability and network bandwidth.
- Background reprocessing when codec policy or target hardware changes.
- Optional object-storage backends such as S3-compatible local appliances, with local playback cache retained.
- Import/export packages containing media, metadata, lessons, and checksums for offline server-to-server transfer.

## Editing and playback

- Filmstrip and waveform timeline with frame-accurate in/out points and keyboard nudging.
- Editable fade curves, crossfades, audio-only fades, normalization, ducking, and loudness targets.
- Crop, rotate, aspect-ratio fit/fill, safe-area guides, image pan/zoom, and background color or blur.
- Caption upload, editing, styling, translation tracks, forced captions, and per-room defaults.
- Chapter markers, operator cue points, playback regions, and named seek targets.
- Per-item and per-lesson volume, mute, playback speed, repeat count, and end behavior.
- Gapless playback and prebuffering for seamless transitions.
- Layered playback for a background loop, foreground content, lower thirds, clock, logo, or emergency crawl.
- Configurable transitions between every supported media type.
- Still-image and slide duration defaults with per-item overrides.
- Background audio that continues across images or slides.
- Multi-angle or alternate-language asset variants selected by room profile.
- Live-stream support with reconnection policy, latency display, fallback media, and health monitoring.
- Synchronized playback across multiple screens with clock-drift correction.
- Blackout, freeze, logo, clear, stop-all, and emergency-override controls.
- Playback recording or operator event log for post-event review where local policy permits it.
- Offline webpage packaging for explicitly supported HTML content, with sandboxing and asset validation.
- PDF and presentation conversion into high-resolution, remote-navigable slide sequences.
- Integration outputs for NDI, OBS, ProPresenter, Bitfocus Companion, Stream Deck, MIDI, OSC, or GPIO where useful.

## Cellphone controller

- Live “now playing” title, artwork, elapsed time, remaining time, state, volume, and screen acknowledgement.
- Low-latency push updates through SignalR with polling fallback.
- Volume, mute, blackout, freeze, logo, restart item, jump-to-cue, and emergency-stop controls.
- Configurable confirmation for disruptive commands and an undo window when technically safe.
- Lock mode that prevents accidental taps while preserving the transport display.
- Haptic, audio, or visual acknowledgement of accepted and completed commands.
- Favorites and a simplified volunteer layout limited to approved actions.
- QR-code launch into a particular room, lesson, or restricted temporary controller session.
- Control of screen groups with clear partial-success reporting.
- Handoff between operators and visible control ownership to prevent competing commands.
- Optional PIN-only short session for an already authenticated room device.
- Wake Lock support, landscape layout, large-touch accessibility mode, and installable PWA updates.
- Network-loss indicator, queued-command warning, reconnect status, and stale-state protection.
- Optional hardware media-key and Bluetooth presenter support in compatible browsers.

## Screens and device fleet

- Screen groups, room profiles, site hierarchy, tags, saved filters, and bulk assignments.
- Detailed heartbeat with app version, OS version, device model, display mode, uptime, free space, and temperature where available.
- Download queue, item-level cache verification, retry controls, bandwidth, and estimated readiness time.
- Remote cache purge, re-download, app restart, device reboot, and diagnostics bundle where platform APIs permit.
- Privacy-controlled current-frame screenshot with an on-screen indicator and audit event.
- Codec, resolution, HDR, audio-output, and web-content capability reporting.
- Clock synchronization and drift alerts for duration-aware countdowns and multi-screen playback.
- Scheduled bandwidth windows and rate limits to protect shared networks.
- Kiosk setup, start-on-boot validation, screen-saver suppression, and HDMI-CEC power scheduling.
- Device configuration profiles with staged rollout and drift detection.
- App update rings, minimum supported version, maintenance windows, rollback, and incompatible-version alerts.
- Spare-device workflow that clones a room assignment without copying a device credential.
- Screen replacement wizard that transfers assignment and revokes the previous credential.
- Multi-display players and video-wall layout profiles where target hardware supports them.

## Signage and communications

- Visual signage editor with templates, preview sizes, safe areas, brand kits, and reusable blocks.
- Multi-zone layouts containing media, text, clocks, weather from an administrator-approved source, and calendars.
- Recurring signage schedules, priority rules, exclusions, and campus-specific targeting.
- Emergency presets with explicit authorization, confirmation, expiration, and all-clear workflow.
- CAP or other standards-based emergency feed integration when locally required.
- RSS, calendar, menu, or data-driven widgets using allowlisted sources and cached fallback content.
- Signage proof-of-play history and screen acknowledgement reports.
- Automatic return to lesson mode with transition and conflict rules.
- Audience-language and accessibility variants by screen profile.

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

- Documented service-account API tokens with scopes, expiration, revocation, and audit attribution.
- Webhooks for lesson publication, screen readiness, playback events, failures, low storage, and updates.
- LMS connectors for systems such as Canvas or Moodle using optional, separately configured modules.
- Calendar connectors and standards-based iCalendar feeds.
- Optional imports from approved cloud file providers without making a cloud account mandatory.
- OBS, ProPresenter, Bitfocus Companion, Stream Deck, NDI, MIDI, OSC, and GPIO integrations.
- MQTT integration for local automation and room-status systems.
- Webhook signing, retry policy, dead-letter visibility, and test-delivery tools.
- Plugin SDK with versioned capability boundaries and an administrator allowlist.
- Command-line administration and import/export tools for automated local deployments.
- Read-only status endpoints suitable for monitoring systems such as Prometheus or Uptime Kuma.

## Reporting and analytics

- Privacy-preserving local dashboard for lesson readiness, screen uptime, download failures, and storage growth.
- Playback event history showing what was requested, acknowledged, started, completed, skipped, or failed.
- Media usage and retention reports with exportable CSV.
- Screen reliability, app-version, and cache-readiness reports by site and room.
- Pre-class readiness alerts at configurable intervals.
- Capacity forecasts for storage, bandwidth, device fleet, and upcoming scheduled content.
- Operator activity and audit summaries with permission-aware detail.
- No external telemetry by default; any diagnostics sharing should be explicit, reviewable, and revocable.

## Installation, updates, and distribution

- Signed native packages for Debian/Ubuntu, RPM-based Linux, Windows, macOS development, and common ARM systems.
- Fully offline installer bundle containing server, TV packages, checksums, and documentation.
- Docker and Podman images with pinned versions, health checks, backup examples, and upgrade guidance.
- Guided first-run checks for port conflicts, mDNS, time synchronization, FFmpeg, storage permissions, and firewall rules.
- Update channels for stable, preview, and development releases, with per-server maintenance windows.
- Compatibility matrix covering server, Android/Fire TV, tvOS, database, and protocol versions.
- Visible update progress, automatic rollback detail, release history, and manual rollback from Settings.
- Configuration-management examples for Ansible and other fleet tools.
- Optional appliance image for supported mini PCs or single-board computers.
- In-product diagnostics that produce a copyable support summary without exposing passwords or tokens.
- Automated migration tests from every supported release and a published support lifecycle.

## Advanced and future ideas

- Precisely synchronized multi-room or multi-screen playback using measured clock offset and network latency.
- Audience interaction through local polls, response devices, or QR codes with strict privacy controls.
- Automatic transcript, chapter, caption, and searchable-content generation through optional local models.
- Content recommendations based only on an organization's local library and explicit opt-in rules.
- Rule-based automation such as “when every screen is ready, notify the coordinator.”
- Multi-server campus federation with selective replication and independent operation during WAN outages.
- Read-only public schedule or lobby page hosted by the local server.
- White-label packages and managed configuration profiles for distributors while retaining source transparency.

## Suggested delivery sequence

**Now:** live playback acknowledgement, automated end-to-end tests, restore UI, expanded media organization tools, screen diagnostics, user self-service, and granular permissions.

**Next:** visual timeline, presentation conversion, templates and recurrence, captions, screen groups, update rings, scheduled encrypted backups, and API/webhooks.

**Later:** advanced integrations, synchronized multi-screen playback, high availability, federation, local AI-assisted metadata, and audience interaction.
