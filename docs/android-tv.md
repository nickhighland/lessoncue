# Android TV and Fire TV delivery

Use JDK 17, Android SDK 36, and the Gradle version pinned in CI. `debug` builds are suitable only for device testing. Create an organization-owned upload keystore and configure signing through protected secrets for Play Store or Amazon Appstore releases; never commit the keystore or passwords.

Validate directional navigation, Back, Play/Pause, rewind, fast-forward, Next, Previous, HDMI wake behavior, background download continuation, free-space cleanup, and scheduled transitions on every supported model. Fire OS is Android-derived but must be treated as its own hardware test matrix.

Before live use, pair a device, download a representative lesson, disable Wi-Fi, relaunch the app, play every item, and verify that countdown and pre-roll transition correctly using the TV's actual clock.
