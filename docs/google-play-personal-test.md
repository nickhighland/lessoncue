# Google Play personal-account closed-test build

This branch contains a deliberately limited, transparent closed-test application for Google Play's personal developer-account testing period. It is not the production LessonCue client and does not pretend to contact a server.

## What testers can evaluate

- Launching on an Android tablet, Google TV, Android TV, or Fire TV device.
- Choosing the bundled **Sample Lesson** in the **Schools Project**.
- Moving forward and backward through three slides by touchscreen swipe, on-screen buttons, or remote Left/Right keys.
- Returning to the lesson chooser with Back.

The app requests no network permissions, collects no information, creates no account, displays no advertising, and makes no external requests. The offline-demo disclosure belongs in the Play Console product and closed-test descriptions rather than the in-app interface.

## Play Console identity

- Application ID: `org.lessoncue.tv`
- Version code: `46`
- Version name: `0.35.0-test.1`
- Module: `android-tv/personal-test`

The next production upload must use a version code greater than `46`.

## Build

Debug validation:

```bash
gradle -p android-tv :personal-test:testDebugUnitTest :personal-test:lintDebug :personal-test:assembleDebug
```

Signed Google Play bundle:

```bash
export LESSONCUE_ANDROID_KEYSTORE_PATH='/absolute/path/to/lessoncue-release.jks'
export LESSONCUE_ANDROID_KEYSTORE_PASSWORD='your-keystore-password'
export LESSONCUE_ANDROID_KEY_ALIAS='your-key-alias'
export LESSONCUE_ANDROID_KEY_PASSWORD='your-key-password'
gradle -p android-tv :personal-test:bundleRelease
```

Upload `android-tv/personal-test/build/outputs/bundle/release/personal-test-release.aab` to the closed-testing track. The bundle must use the same upload identity configured for the LessonCue Play Console application.

Pushing this branch also runs **Build Google Play personal test** in GitHub Actions. Its `LessonCue-Google-Play-Closed-Test` artifact contains the signed AAB for Play Console upload and a matching signed APK for direct device installation. The artifact remains available for 30 days.

## Tester disclosure

Use this description in the closed-testing invitation:

> LessonCue Test Demo is a limited offline demonstration of LessonCue's lesson-selection and slide-navigation experience. It contains one bundled sample lesson and does not connect to a LessonCue server. Please try it on a touchscreen or Android TV remote and report navigation, readability, or stability problems.
