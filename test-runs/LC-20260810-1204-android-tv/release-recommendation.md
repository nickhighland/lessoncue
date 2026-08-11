# Android TV recommendation

The Android TV code is **GO for emulator-backed CI/regression coverage**: both flavors passed all 11 instrumentation tests and the store APK launched on an Android 16 TV profile.

Before a production TV release, perform one physical-device pass covering:

1. D-pad/remote navigation on the target TV model.
2. HDMI output and display sleep/wake behavior.
3. Hardware H.264/H.265 decode and long-play thermal behavior.
4. Pairing and manifest retrieval against the deployed server using the TV's actual network and DNS/mDNS behavior.
