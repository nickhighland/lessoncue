# Android TV emulator environment

- Host: macOS workstation
- Java: Temurin OpenJDK 25.0.2
- Gradle: 9.6.1
- Android SDK root: `~/Library/Android/sdk`
- Emulator: 36.6.11
- Platform tools / adb: 37.0.0
- Command-line tools: Homebrew cask `android-commandlinetools` 15859902
- TV image: `system-images;android-36;google-tv;arm64-v8a`
- AVD RAM: 2048 MB
- AVD display: 1920×1080 at 320 dpi
- AVD GPU: SwiftShader/Vulkan in headless mode
- AVD acceleration: Hypervisor.Framework

The test VM remained separate from the Android emulator. No credentials, API keys, or private configuration were recorded.
