# Android TV and Fire TV delivery

## Screen diagnostics

Version 0.18 and newer reports a bounded inventory of assigned offline media, download progress and failures, available decoders, recent playback errors, measured server latency, and the player clock. View it under **Screens → View diagnostics** in the local browser.

Diagnostic screenshots are disabled by default for every paired TV. When an administrator explicitly enables them and sends a one-time request, the TV displays a red notice for 2.5 seconds before capturing the current LessonCue window. The request expires after 60 seconds, the server accepts only a valid JPEG/PNG up to 8 MB, and the latest image is removed after 24 hours or immediately when the administrator disables or deletes it.

Use JDK 17, Android SDK 36, and the Gradle version pinned in CI. `debug` builds are suitable only for device testing and intentionally disable production self-updates. Production sideload builds use the permanent organization-owned keystore configured through protected release secrets; never commit the keystore or passwords. See [Android TV self-update system](android-tv-updater.md) for release configuration, verification rules, safe rollout, and the hardware acceptance matrix.

Validate directional navigation, Back, Play/Pause, rewind, fast-forward, Next, Previous, HDMI wake behavior, background download continuation, free-space cleanup, and scheduled transitions on every supported model. Fire OS is Android-derived but must be treated as its own hardware test matrix.

Before live use, pair a device, download a representative lesson, disable Wi-Fi, relaunch the app, play every item, and verify that countdown and pre-roll transition correctly using the TV's actual clock.
