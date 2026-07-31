# Legacy Signage Studio capabilities — archived

This document describes the superseded schedule-centric signage prototype. It is retained only as historical design context and does not describe the current supported interface. The current workflow is **Layouts → Playlists → Signs & screens**, documented in [signage.md](signage.md); it intentionally excludes Calendar scheduling, draft/publish, operations, and emergency workflows.

The former LessonCue Signage Studio was an independently designed, fully self-hosted prototype for designing, scheduling, publishing, and monitoring digital signage.

The historical prototype targeted browser, Android TV, and Apple TV. Apple TV/tvOS is now explicitly unsupported and deferred, and the current preview feature does not promise parity with this legacy design.

## Parity map

| Area | Implemented LessonCue workflow |
| --- | --- |
| Canvas | Opaque high-contrast editing, undo/redo, zoom, hand-tool panning, configurable grid snapping, live edge/center guides, drag/resize/rotate, a large lower-right resize grip, exact coordinates, multi-select, persistent groups, alignment/distribution, layer reordering, opacity, fit, flip, duplicate, hide, and granular position/content/full locks. |
| Layout formats | Separate reusable layouts with folders, search, duplicate, starter templates, saved templates, thumbnails, safe replacement, Full HD/4K/portrait/ultrawide/square/custom sizes, safe areas, and per-screen format mapping. |
| Content | Media and logos, rich and mixed-run text, strokes, corners, bounded QR/Wi-Fi sharing with optional labels on every side, tickers, counters, clocks, configurable weather, calendars, RSS, webpages, approved custom HTML, presentation playlists with live-stream override, and background audio. |
| Live video | Server-relayed HLS, HTTP, RTMP, RTMPS, and RTSP zones with source-address isolation, process cleanup, health, HLS readiness, segment latency, errors, restart count, and operator restart controls. |
| Playlists | Independent signage playlists with layout/media/app/web/nested/tag/CSV/cloud entries, hidden and transparent intervals, transitions, ordered/random/tag/interactive modes, region/global sync, duration totals, and timed visual preview. |
| Scheduling | Month calendar, one-time/daily/weekday recurrence, exceptions, priorities, idle filler, emergency mode, layout/playlist/media/app content, screen power/volume events, and edit scopes for one event, this-and-future, or an entire series. |
| Screen delivery | Independent drafts and published snapshots, resource/schedule versions, push timestamps, bulk assignment, exact manifest preview, per-screen manifest/cache progress, offline assets, and emergency interruption/resume. |
| Operations | Screen and content state, heartbeats, cache inventory, privacy-gated screenshots, proof-of-play JSON/CSV, signage playback errors, stream health/latency/restart, and derived operator alerts. |
| Interactivity | Optional browser touch/kiosk mode with idle content, approved interaction content, inactivity timeout, close control, touch indicator, virtual-keyboard guidance, and emergency override. |
| Governance | Local permissions, folders, templates, screen tags/groups, source allowlists, and optional source credentials encrypted with the server’s local data-protection keys and omitted from manifests, browser storage, backups, logs, and GitHub. |

## Operator workflow

Use the six Signage tabs in the local administrator interface:

1. **Layouts** creates reusable designs. Save a draft without changing screens, then publish when it is ready. Built-in starter templates remain generic for schools, churches, training rooms, libraries, and other educational settings.
2. **Playlists** creates independent rotations. Entries may be layouts, media, apps, approved webpages, nested playlists, tag rules, or CSV/cloud-fed sources. The preview can step manually or follow each entry’s configured duration.
3. **Calendar** assigns content, display power, and volume. Recurring edits explicitly ask whether to update one occurrence, split this-and-future occurrences, or change the entire series.
4. **Publishing** shows draft/live versions, performs bulk screen assignment, pushes manifests, previews exactly what one screen receives, and reports each screen’s applied manifest and cached-item progress.
5. **Operations** shows playback/cache state, proof counts, errors, alerts, privacy-gated screenshot status, stream readiness and latency, and manual relay restart.
6. **Emergency** stores reviewed alert types and lets an operator confirm duration plus exact-screen/tag audiences before immediate broadcast. Cancel returns displays to the interrupted lesson or normal signage.

Layout and playlist drafts do not leak into display manifests. A display continues using the last published snapshot until an editor explicitly publishes the replacement.

## Information frames

The layout editor’s **Information frame** action generates a Full HD 16:9 layout with a presentation area that remains exactly 16:9, a right sidebar, and a bottom information strip. Choose one to five equal bottom boxes, one to three equal sidebar boxes, the frame width, and two alternating frame colors. Every adjustment updates the canvas immediately. The lowest sidebar box always uses the shade opposite the far-right bottom box. The generated sections remain ordinary editable elements, so each can be changed to a photo, logo, message, QR code, guest Wi-Fi QR, weather, configurable clock/date, calendar, RSS/news, weekly countdown, stream, webpage, or other supported content.

Applying a frame replaces the current draft elements only after confirmation and can be undone. It does not change the live published layout until **Publish & push** is selected.

## Weather

Weather elements include ready-to-use provider presets:

- **Open-Meteo** provides global forecasts without an API key.
- **National Weather Service** provides U.S. forecasts without an API key.
- **Custom approved weather API** accepts an administrator-approved HTTPS origin and an optional encrypted server credential.

Enter a location label with either a postal code or latitude and longitude, then choose Fahrenheit or Celsius and any combination of condition icon, conditions, current temperature, feels-like temperature, daily high, daily low, precipitation chance, humidity, and wind. The server resolves postal codes, fetches and normalizes the forecast, maps conditions to display-safe weather icons, and persists the last successful result in the signage cache. Displays keep showing that cached result if the internet or provider is temporarily unavailable.

Open-Meteo and National Weather Service requests are made only by the local LessonCue server. Their official endpoints are trusted built-in presets; custom providers still require the normal exact-origin approval.

## Local credential storage

Optional Basic, Bearer, or custom-header credentials for approved data sources are encrypted in `config/signage-credentials.json` under LessonCue’s data directory using the server’s local ASP.NET Data Protection keys. API responses return only key metadata. The secret is applied to server-side source refreshes and is never placed in a display manifest or browser request.

This file stays out of exported backups by default because it may contain third-party secrets. For a controlled migration, a Service Admin may deliberately include the credential file and LessonCue data-protection key directory together, but only inside a password-encrypted `.lcbak` export. Keep that export password separately.

## Live-stream behavior

Stream zones accept `http://`, `https://`, `rtmp://`, `rtmps://`, and `rtsp://` addresses. The source address stays on the LessonCue server and is not placed in a display manifest. On first playback, the server starts an FFmpeg relay and publishes a short local HLS window to the display. Browser players use native HLS where available and load the local HLS player only when needed; Android TV uses Media3 HLS and Apple TV uses AVFoundation.

The source should provide H.264 video. Audio is normalized to AAC while video is remuxed without re-encoding to reduce delay and server load. Inactive relays stop automatically after five minutes. A stream that cannot connect returns a temporary unavailable response and display clients retry.

Stream URLs can contain sensitive path tokens. LessonCue removes the source URL from FFmpeg errors before logging it. Do not place usernames or passwords in the URL authority; embedded credentials are rejected.
