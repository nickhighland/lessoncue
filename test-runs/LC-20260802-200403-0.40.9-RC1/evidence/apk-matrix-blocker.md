# Android APK updater matrix blocker

- Captured: 2026-08-02 20:49 -04:00
- Locally verified: debug sideload/store APKs, package `org.lessoncue.tv`, versionName `0.40.9`, versionCode `68`, minSdk 26, target/compile SDK 36, debug certificate fingerprint `f2dd8723c0016f20cbed260c88547c68dff314d4a09906f1eac0533721989d4f`.
- Missing: `lessoncue-tv.apk`, `update.json`, production signing keystore/output, actual Play/Amazon delivery, prior production-signed sideload, Android 9-12/Fire TV hardware.

The debug packages are not production update evidence. The sideload/store instrumentation tests passed their fake-source/update-screen assertions, and the store flavor is configured with `UPDATE_ENABLED=false`, but no PackageInstaller in-place production update, certificate continuity, unknown-source flow, low-storage commit, mandatory-update navigation, Play policy, or roll-forward recovery was performed.
