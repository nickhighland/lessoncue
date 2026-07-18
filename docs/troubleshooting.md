# Troubleshooting

## TV cannot find the server

Open `http://SERVER-IP/.well-known/lessoncue` from a phone on the same Wi-Fi. If it fails, check the server service, firewall, VLAN, and client isolation. Android TV version 0.30.1 and newer automatically browses `_lessoncue._tcp` and saves the resolved numeric address when ordinary `lessoncue.local` lookup fails. If both automatic discovery and `.local` fail while the numeric address works, enter the numeric address and reserve it in DHCP; multicast DNS is blocked between the TV and server. If an administrator selected a non-default port, add `:PORT` after the hostname or IP address.

Native Linux servers advertise `lessoncue.local` by default. The administrator can change this under **Settings → Connection & pairing**. After changing it, allow several seconds for Avahi and client DNS caches to refresh. If the page reports that the address is still being applied, inspect `sudo journalctl -u lessoncue-update.service -n 50 --no-pager` and `sudo systemctl status avahi-daemon --no-pager`.

If a selected browser port is unavailable, LessonCue returns to the previous working port. Open the previous address and read the message under **Settings → Connection & pairing**, or inspect `sudo journalctl -u lessoncue-update.service -n 50 --no-pager`.

## Pairing PIN fails

Pairing requests expire after ten minutes and lock after repeated failures. Begin pairing again, verify the current server log/admin PIN, and confirm the TV is talking to the expected server.

## Administrator password was forgotten

Use the SSH commands in [Reset a forgotten administrator password](installation.md#reset-a-forgotten-administrator-password). The reset is intentionally not exposed as an unauthenticated browser endpoint and does not require email or a hosted service.

## Media says internet required

Webpages, embedded players, Vimeo, and external destinations require internet. On Android TV and Fire TV, YouTube links use an embedded web player. For offline playback—or any YouTube item assigned to Apple TV—open **Add media**, choose **Download YouTube locally**, and wait for the Media Library status to change from Downloading/Processing to Offline ready. Only import media you are authorized to copy.

If a local YouTube import fails, read its processing error in the Media Library, confirm the server can reach YouTube, check available LessonCue storage, and inspect `sudo journalctl -u lessoncue -n 100 --no-pager`. Re-run the latest installer or install the latest release if the error says `yt-dlp` was not found.

## Intel Quick Sync device creation fails

Upgrade to LessonCue 0.30.2 or newer. Earlier Linux builds allowed FFmpeg to choose a default adapter, which can fail with `Device creation failed` even when an Intel render node is available. Current builds test every `/dev/dri/renderD*` device through direct QSV and VAAPI-derived initialization and reuse the successful device for conversions.

If the check still fails, run:

```bash
ls -l /dev/dri
id lessoncue
sudo -u lessoncue test -r /dev/dri/renderD128 && echo readable
sudo -u lessoncue test -w /dev/dri/renderD128 && echo writable
dpkg -l | grep -E 'intel-media-va-driver|ffmpeg'
```

Replace `renderD128` with the device shown by `ls` when necessary. The `lessoncue` account must belong to the device's `render` or `video` group, and an Intel media VA driver must be installed. Re-running the latest native installer repairs the normal group membership and driver package without removing LessonCue data. A machine without a supported Intel GPU will remain on the safe software encoder.

## Countdown starts at the wrong time

Check the server time zone, server clock, and television clock. Confirm the manifest's `designatedStartAt`, `durationMs`, and `startAt`. A trimmed countdown uses `endMs - startMs`, not the original file duration.

## Docker health check fails

Inspect `docker compose logs lessoncue` and ensure the data directory is writable. The container image must include `curl` for the compose health check; if using a customized minimal image, call `/health` from the host instead.
