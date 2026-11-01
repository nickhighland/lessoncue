# Amazon Appstore testing instructions

The Fire TV review build includes an offline review demo. It does not require a
live server, account, pairing request, or network access.

## Copy-ready instructions

```text
LessonCue Player for Fire TV includes a self-contained review demo with the same
library, lesson-detail, cue-timeline, focus navigation, and player experience
used in regular mode. Its sample video is bundled in the APK, so the review
path does not depend on a live server.

1. Install and launch LessonCue Player.
2. On “Connect this TV”, enter this exact value as the server address:
   http://lsnq.demo
3. Select “Find server”. This is a demo marker; the app does not try to resolve
   it, contact a server, or connect to a device.
4. Enter the demo password: 123456
5. Select “Open demo”. The normal LessonCue lesson library opens with one
   sample lesson.
6. Use Up/Down to highlight “Sample lesson”, then press Select. The normal
   lesson-detail screen and cue timeline open.
7. Use Up/Down in the cue timeline to confirm that “Sample pre-roll”, “Sample
   countdown”, “Sample lesson video”, and “Sample post-roll” are all reachable.
8. Highlight “Sample lesson video” and press Select, then choose “Play from
   here”. The normal LessonCue player starts the bundled video locally on Fire
   TV. Use “Start from beginning” to exercise the full pre-roll → countdown →
   lesson → post-roll sequence; the final sample post-roll loops until stopped.
9. Use the normal Fire TV playback controls. Press Back to return to the
   lesson-detail screen, then Back again to return to the lesson library.

No account username, external server, pairing PIN, or additional setup is
required for this review path.
```

The `http://lsnq.demo` value is intentionally not a real hostname. It is
recognized only by the Fire TV application and is never sent over the network.
