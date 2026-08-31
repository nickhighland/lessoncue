# LessonCue for Amazon Vega

Vega OS is not Android. There is no APK, no Kotlin and no ExoPlayer here: a Vega
app is React Native, packaged as a `.vpkg`, and none of `android-tv/` transfers.

## What this app is

A native shell around the player LessonCue's server already serves.

That player does the real work — pairing, the manifest, playback, the control
channel, telemetry, activities and signage — and it is the same client the
browser suite already tests. It also fetches relative to wherever it was loaded
from, so the address this shell points at is the whole of its configuration.

The shell owns only what a web page cannot: remembering which server this
television belongs to, and giving somebody a way to change it when that server
moves.

Writing a second client in React Native was the alternative. It would have been
several thousand lines to maintain in step with the first, for a surface that
already works.

## Building

The Vega Developer Tools are required, and are not on npm:

```
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash
~/vega/bin/vega sdk install
```

The installer offers to put `vega` on your `PATH`, but only if you let it
finish its questions. Run non-interactively and it installs the CLI and stops
at the prompt, leaving no `~/vega/env` and nothing added to your shell — the
full path above works regardless:

```
echo 'export PATH="$HOME/vega/bin:$PATH"' >> ~/.zshrc
```

macOS 10.15+ or Ubuntu 20.04+ only, and about 20 GB. Then:

```
npm install
npm run build:vega
```

That produces a `.vpkg` for each architecture under `build/`:

```
build/aarch64-release/lessoncuetv_aarch64.vpkg
build/armv7-release/lessoncuetv_armv7.vpkg
build/x86_64-release/lessoncuetv_x86_64.vpkg
```

## Checks that do not need the SDK

```
npm run typecheck
npm run test:units
```

The address policy is the part worth testing here. It decides when a plain
`http://` address is acceptable, and it is what keeps a device token off the
open internet. It is ported from the Android client's `ServerUrlPolicy.kt` and
parses addresses itself rather than using `URL`, because React Native ships a
cut-down polyfill without `protocol`, `username` or `search` — leaning on it
would have quietly stopped enforcing the rule rather than failing loudly.

## What is not here yet

- Seeing it render. The package installs on a Vega Virtual Device and the app
  launches — `Installing/Updating ... success`, then the launch accepted as
  `Sending: pkg://com.lessoncue.tv.main`. What has not been seen is the screen
  it draws, because the virtual device does not stay up long enough here to
  photograph: it boots, answers for under a minute, and goes. A Fire TV Stick
  in developer mode takes the same commands and would settle this.

  The virtual device needs a shell that stays open — it exits with whatever
  launched it — so start it in a terminal window and leave it there:

  ```
  ~/vega/bin/vega virtual-device start
  ```

  Close Android Studio and any Android emulator first. The Vega device adapter
  is adb under another name, down to the server version and port 5037, and if
  Android's adb owns that port the Vega device never appears in
  `vega device list` even while the VM is plainly running.
- Appstore submission. Vega apps do not self-update; they update through the
  Appstore, so no updater is needed, but nothing publishes the `.vpkg` yet.
