# Android TV emulator validation

- Run ID: `LC-20260810-1204-android-tv`
- Date: 2026-08-10
- Branch/application commit: `refactor` / `533dccf`
- Emulator image: Google TV ARM64, Android 16/API 36, image revision 4
- Device profile: Google TV 1080p, 1920×1080, `sdk_google_atv64_amati_arm64`
- Acceleration: macOS Hypervisor.Framework

## Outcome

Both Android distribution flavors passed the complete instrumentation suite on a booted Android TV emulator:

- Sideload debug: **11 passed, 0 failed, 0 skipped**
- Store debug: **11 passed, 0 failed, 0 skipped**

The store APK also installed and launched as the Leanback activity. The app rendered the expected “Connect this TV” screen at the TV resolution. The emulator reached the temporary LessonCue VM IP by ICMP.

The AVD was a clone in `/tmp`, wiped for the run, and removed afterward. No persistent AVD or application source was changed.

## Scope covered

- TV library focus and upcoming-lesson selection
- Lesson detail focus and back navigation
- Emergency signage disabling lesson cards
- Optional and mandatory update screen focus/actions
- Update manager retry, cancellation, permission return, and callback persistence
- Leanback launcher registration and app launch
- Android 16/API 36 TV display characteristics

## Not covered

An emulator cannot validate physical HDMI output, a manufacturer remote, hardware decoder behavior, render-device permissions, or thermal/performance behavior of a real TV. The manual direct-server button flow was not treated as a pass because headless emulator input did not reliably activate that Compose button; instrumentation and network-route checks remained green.
