# Android TV/server communication matrix blocker

- Captured: 2026-08-02 20:46 -04:00
- Available: source tests, one disposable API 36 Google TV AVD, Chromium localhost tests.
- Unavailable: physical/current Google TV, Android phone controller, second TV/room, Fire TV, native Linux server, controlled LAN/DHCP/VLAN/network-fault lab.

The Android JVM and instrumentation suites exercise protocol/parser/update UI behavior, but they do not establish discovery, pairing, manifest polling, command acknowledgement, telemetry truth, reconnect, room isolation, or physical playback timing. COM-001 through COM-012 are therefore BLOCKED; no API 36 emulator result is promoted to a physical or multi-device pass.
