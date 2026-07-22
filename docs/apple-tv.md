# Apple TV delivery

## Screen diagnostics

Version 0.18 and newer reports a bounded inventory of assigned offline media, queued downloads and failures, AVFoundation decoder capabilities, recent playback errors, measured server latency, and the Apple TV clock. View it under **Screens → View diagnostics** in the local browser.

Diagnostic screenshots are disabled by default for every paired Apple TV. When an administrator explicitly enables them and sends a one-time request, the Apple TV displays a red notice for 2.5 seconds before capturing the current LessonCue window. The request expires after 60 seconds, the server accepts only a valid JPEG/PNG up to 8 MB, and the latest image is removed after 24 hours or immediately when the administrator disables or deletes it.

Generate the Xcode project from `tvos/project.yml` so build settings remain reviewable. Set the organization bundle identifier and Apple Developer team in a local or CI configuration, add the required App Store icons and top-shelf assets, and archive with a current Xcode release.

The app declares `_lessoncue._tcp` Bonjour discovery and local-network usage. Users must grant local-network access. Device credentials are kept in Keychain; downloaded files are stored in the application cache and may be reclaimed by tvOS, so the client must continuously re-evaluate readiness.

Version 0.32.0 and newer applies the lesson editor's fit/fill/letterbox, rotation, asymmetric crop, background color, whole-lesson and cue volume/mute, playback speed, finite repeat count, still duration, synchronized audiovisual fades, fade-through-black transition, and end behavior through AVFoundation and SwiftUI. Older cached manifests remain decodable because the added protocol fields have optional client defaults.

Version 0.34.0 adds optional flexible-time cue metadata while preserving responsive multi-zone signage with locally rendered clocks, cached information widgets, and independently cached image or muted looping-video zones. New protocol fields remain optional so an older offline manifest still decodes.

tvOS may suspend the app and does not guarantee exact unattended wake. Validate scheduled countdown startup on each Apple TV model and tvOS version before advertising unattended operation.
