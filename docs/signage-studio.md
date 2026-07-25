# Signage Studio capability audit

LessonCue’s Signage Studio roadmap uses Yodeck’s public documentation as a functional benchmark while remaining an independently designed, fully self-hosted LessonCue experience. It does not copy Yodeck branding, templates, artwork, screenshots, or tutorial text.

The audit was refreshed on July 22, 2026 from the official documentation:

- [Layout Editor introduction](https://www.yodeck.com/docs/user-manual/yodeck-layout-editor-introduction/)
- [Editing and customizing layout content](https://www.yodeck.com/docs/user-manual/editing-customizing-content-layout-editor/)
- [Screen sizes and aspect ratios](https://www.yodeck.com/docs/user-manual/screen-sizes-aspect-ratios-layout-editor/)
- [Templates](https://www.yodeck.com/docs/user-manual/layout-editor-templates/)
- [Element locking](https://www.yodeck.com/docs/user-manual/locking-elements-controlling-access-layout-editor/)
- [Playlists](https://www.yodeck.com/docs/user-manual/playlists-introduction/)
- [Playlist types](https://www.yodeck.com/docs/user-manual/playlist-types-best-practices/)
- [Schedules](https://www.yodeck.com/docs/user-manual/schedules-introduction/)
- [Live streams](https://www.yodeck.com/docs/user-manual/live-video-streaming-support/)
- [Apps](https://www.yodeck.com/docs/user-manual/apps-introduction/)
- [Screen management](https://www.yodeck.com/docs/user-manual/screens-overview-introduction/)
- [Content assignment](https://www.yodeck.com/docs/user-manual/assign-content-to-your-players/)
- [Emergency alerts](https://www.yodeck.com/docs/user-manual/emergency-alerts-introduction/)
- [Interactive kiosks](https://www.yodeck.com/docs/user-manual/interactive-kiosk-introduction/)
- [Playback reports](https://www.yodeck.com/docs/user-manual/playback-reports/)

## Parity map

| Area | LessonCue now | Remaining parity work |
| --- | --- | --- |
| Canvas | Direct drag, resize, rotate, keyboard nudge, exact coordinates, snapping, layers, opacity, fit, flip, duplicate, lock and hide | Undo/redo, zoom/pan, guides, multi-select, grouping, alignment/distribution and a full layers panel |
| Layout formats | Responsive 16:9 zone canvas and five presets | Separate reusable layouts, portrait/ultrawide/custom resolutions, safe areas and reusable ratios |
| Content | Text, images, videos, clocks, weather, calendar, menu, RSS and generic JSON | Rich text, shapes, clipart/icons, QR, ticker, webpages, dashboard apps, social sources and background audio |
| Live video | Server-relayed HLS, HTTP, RTMP, RTMPS and RTSP zones | Health dashboard, manual restart, latency/quality selection, backup source and stream preview before publish |
| Playlists | Lesson playlists and pre-roll sequences | Independent signage playlists, layout/app entries, nested/tag/cloud/CSV/interactive types, random and region-synchronized playback |
| Scheduling | One-time, daily and weekday recurrence, exclusions, priorities, idle filler, emergency mode and screen/tag targeting | Calendar schedule editor, series exceptions, content-type events, screen power/volume events and draft/publish workflow |
| Screen delivery | Automatic manifests, offline media caching, readiness and emergency interruption | Explicit versioned push state, bulk assignment, preview-as-screen and richer signage health |
| Operations | Heartbeats, cache inventory, diagnostics and privacy-gated screenshots | Proof-of-play reports, signage-specific errors, alerting and operator stream controls |
| Interactivity | Browser displays and web-based controllers | Touch/kiosk mode, interaction content, timeout, close/indicator controls and optional virtual keyboard |
| Governance | Local roles, permissions, screen tags and approved widget origins | Reusable content folders, template governance, granular layout locks and larger multi-site workspace model if demand warrants it |

## Live-stream behavior

Stream zones accept `http://`, `https://`, `rtmp://`, `rtmps://`, and `rtsp://` addresses. The source address stays on the LessonCue server and is not placed in a display manifest. On first playback, the server starts an FFmpeg relay and publishes a short local HLS window to the display. Browser players use native HLS where available and load the local HLS player only when needed; Android TV uses Media3 HLS and Apple TV uses AVFoundation.

The source should provide H.264 video. Audio is normalized to AAC while video is remuxed without re-encoding to reduce delay and server load. Inactive relays stop automatically after five minutes. A stream that cannot connect returns a temporary unavailable response and display clients retry.

Stream URLs can contain sensitive path tokens. LessonCue removes the source URL from FFmpeg errors before logging it. Do not place usernames or passwords in the URL authority; embedded credentials are rejected.
