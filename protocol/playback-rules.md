# Playback rules

Clients prefer a checksum-verified local file, then the local server URL, then an explicitly internet-dependent URL. Loss of connectivity never interrupts verified local playback.

## Pre-roll and countdown

For a playlist with designated start `T`, countdown duration `D`, and pre-roll items:

- Pre-roll begins whenever the screen is idle inside the playlist availability window and repeats its ordered items.
- At `T - D`, the current pre-roll item is stopped and the countdown starts from zero.
- At `T`, the countdown ends and the first main lesson item starts.
- If the app wakes between `T - D` and `T`, seek the countdown to `now - (T - D)` so it still ends at `T`.
- If the app wakes after `T`, apply the lesson's missed-start setting; the default is to show a Start prompt.
- Clock calculations use absolute instants. The server supplies ISO 8601 timestamps with offsets and the client stores UTC internally.

The screen persists this schedule with the downloaded manifest, allowing the transition without a server connection. Operating systems may suspend applications, so exact unattended wake behavior remains device-dependent.

## Item completion

- `advance`: start the next item.
- `pause`: hold the last frame and wait for Select or Next.
- `loop`: repeat the item.
- `menu`: return to the playlist view.
- `stop`: stop the active playlist and enter signage mode.
