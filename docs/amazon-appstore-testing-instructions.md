# Amazon Appstore testing instructions

The Fire TV review build includes an offline review demo. It does not require a
live server, account, pairing request, or network access.

## Copy-ready instructions

```text
LessonCue Player for Fire TV includes a self-contained review demo.

1. Install and launch LessonCue Player.
2. On “Connect this TV”, enter this exact value as the server address:
   http://lsnq.demo
3. Select “Find server”. This is a demo marker; the app does not try to resolve
   it or connect to a device. The device name can be left at its default.
4. Enter the demo password: 123456
5. Select “Play demo”. The bundled sample video starts locally on the Fire TV.
6. Use Select/Play and the normal Fire TV playback controls as needed. Press
   Back to return to the demo password screen.

No account username, external server, pairing PIN, or additional setup is
required for this review path.
```

The `http://lsnq.demo` value is intentionally not a real hostname. It is
recognized only by the Fire TV application and is never sent over the network.
