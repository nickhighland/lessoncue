# Presentation animation preservation

LessonCue's default presentation import remains static slide conversion. It is local, deterministic, cacheable, and works on a headless self-hosted server without Microsoft PowerPoint, Apple Keynote, or a Google account.

## Feasibility investigation

| Approach | Result |
| --- | --- |
| LibreOffice PDF or image export | Reliable and fully local, but intentionally flattens transitions, builds, embedded media, and presenter timing. This remains the supported default. |
| LibreOffice HTML export | Does not reproduce PowerPoint or Keynote animation behavior consistently and varies by LibreOffice release. |
| Headless capture using LibreOffice Impress, Xvfb, and FFmpeg | Can capture some decks, but cannot reliably infer manual advances, build timing, presenter timing, linked media, dialogs, or when a slideshow has finished. It introduces fragile desktop automation into a server appliance. |
| Microsoft PowerPoint automation or export | Highest fidelity, but requires proprietary desktop software and an interactive Windows installation. |
| Keynote automation or export | Requires macOS and Keynote and cannot run on the supported headless Linux server. |
| Google Slides presentation/embed mode | Preserves more behavior but requires an online Google-hosted deck and is not a local conversion path. |
| Direct OOXML animation rendering | Recreating PowerPoint's timing, layout, fonts, media, and transition semantics would be a separate presentation engine rather than a safe importer. |

## Product decision

LessonCue will not claim animation preservation through an unreliable headless capture. Static conversion remains the default and continues to warn that animations and transitions are flattened.

For a deck that must retain its exact motion:

1. Export it to an H.264/AAC MP4 on a computer with its native presentation application.
2. Upload that video to LessonCue.
3. Use LessonCue's trim, fade, volume, compatibility, transcoding, scheduling, and playback controls normally.

This creates one deterministic offline artifact and preserves the originating application's rendering. A future experimental capture tool should run outside the core server service, never replace the original, produce a reviewable video, and fall back to static conversion on any error.

