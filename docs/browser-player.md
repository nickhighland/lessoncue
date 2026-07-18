# Browser playback client

LessonCue includes a full-screen playback client for Windows, macOS, Linux, ChromeOS, presentation computers, and projectors with a built-in browser. It is served by the same self-hosted LessonCue server as the administration interface. No hosted site, cloud account, browser extension, or dedicated desktop application is required.

## Open and pair a display

1. Connect the presentation computer to the trusted network that can reach the LessonCue server.
2. Open **Screens** in the LessonCue administration interface.
3. Select **Open browser player**, or enter one of these local addresses directly:

   ```text
   http://lessoncue.local/player
   http://SERVER-IP/player
   ```

4. Give the display a recognizable name and select **Start pairing**.
5. Enter the six-digit PIN shown on the administrator's **Screens** page.
6. Assign the newly paired browser display to a class on **Screens**, if needed.
7. Select **Enter full screen**. The phone controller can now select and control this display like an Android TV or Apple TV.

Pairing credentials are stored only in that browser's local storage. Clearing site data or choosing **Unpair this browser** requires the display to be paired again. Revoking the screen from the administrator interface invalidates its token immediately.

## Kiosk-friendly startup

Use the kiosk query parameter to hide nonessential local actions:

```text
http://lessoncue.local/player?kiosk=1
```

Browsers do not permit a webpage to enter full screen or play audible media without a user gesture. After opening the player, select **Enter full screen**. When the first audible or online item starts, select **Start browser playback** or press Enter. LessonCue keeps this instruction visibly on screen until the browser is unlocked; it never silently treats an autoplay refusal as successful playback.

For an unattended presentation computer, configure the operating system to sign in and launch a supported browser to the kiosk URL. Browser command-line kiosk options are browser and operating-system specific and should be managed on that computer. LessonCue does not modify system startup settings.

## Controls

The browser player accepts the same versioned commands as the native TV clients:

- Play a lesson or individual cue
- Pause and resume
- Previous and next
- Stop
- Seek to an absolute position or named cue from the phone controller

It also supports common keyboards and presentation remotes:

| Key | Action |
| --- | --- |
| Space or media play/pause | Pause or resume |
| Right arrow, Page Down, or media next | Next cue |
| Left arrow, Page Up, or media previous | Previous cue |
| Home | Restart the current cue |
| Escape | Stop and return to the lesson list |
| F | Enter full screen |
| Enter | Approve browser playback when prompted |

The ready screen can also be navigated with Tab/Shift+Tab and activated with Enter or Space.

## Playback behavior

The browser consumes the same paired-screen manifest as Android TV and Apple TV. It therefore receives the assigned lessons, online media, trim points, volume, image duration, end behavior, notes, cue markers, pre-roll loop, duration-aware countdown, and signage.

- Pre-roll begins at the configured time and loops until the countdown window.
- Countdown playback seeks to the correct position if the browser starts late.
- At the designated lesson time, the player transitions to the main lesson.
- Audio and picture share one fade envelope over a true black stage.
- The next local media item is prefetched where the browser permits it.
- Local videos use range-enabled server playback, including the automatically generated H.264/AAC compatibility copy when required.
- Webpages and YouTube embeds require internet access. Browser security may prevent LessonCue from controlling or inspecting arbitrary third-party webpages.

The player refreshes its manifest, polls the ordered control channel, acknowledges the exact command version it applied, and sends playback heartbeat data to **Screens**. The screen record reports the browser name, codec support, network latency, playback state, position, error, and command acknowledgement.

## Connection and recovery

The lower-right indicator shows **Connected**, **Connecting**, **Reconnecting**, or **Offline**. The player retries automatically with a bounded delay and keeps its current browser-loaded media running when a temporary server connection is lost. Browser cache behavior is controlled by the browser and is not equivalent to the persistent offline cache in the native TV applications.

If the player reports that it was unpaired:

1. Confirm the screen was not revoked in **Screens**.
2. Pair the browser again using the current PIN.

If media does not play:

1. Select **Start browser playback** if it is visible.
2. Confirm the media is ready in the Media Library.
3. Test the media's **Preview** action in the same browser.
4. Prefer current Chrome, Edge, Firefox, or Safari versions.
5. Check the screen's playback error and codec report under **Screens → View diagnostics**.

## Privacy and security

The display token can read only its own manifest and controller stream and can submit only its own heartbeat. It cannot open the administration API. Media file routes are read-only and range-enabled for local playback. Keep LessonCue on a trusted local network, or protect administrator-managed remote access with Cloudflare Access or a VPN.
