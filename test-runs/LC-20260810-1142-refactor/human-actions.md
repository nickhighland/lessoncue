# Human follow-up actions

1. Open `http://refactor.local/` and verify the browser-created audience session/QR is visible, then delete that temporary session if it is no longer needed.
2. On a test Android TV or emulator, run the sideload and store instrumentation tasks and record device/API level.
3. Upload one representative video and one image on the target Linux host; confirm each reaches ready/preview state and that adaptive copies are generated when enabled.
4. For a production candidate, run the installer prerequisite path on a disposable Debian/Ubuntu host and verify Docker, Compose, FFmpeg, Bubblewrap, LibreOffice, Poppler, Avahi, and utility packages are present.
