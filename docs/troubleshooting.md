# Troubleshooting

## TV cannot find the server

Open `http://SERVER-IP:8080/.well-known/lessoncue` from a phone on the same Wi-Fi. If it fails, check the server service, firewall, VLAN, and client isolation. If the numeric address works but `lessoncue.local` does not, mDNS is blocked or unavailable; use the numeric address and reserve it in DHCP.

Native Linux servers advertise `lessoncue.local` by default. The administrator can change this under **Settings → Connection & pairing**. After changing it, allow several seconds for Avahi and client DNS caches to refresh. If the page reports that the address is still being applied, inspect `sudo journalctl -u lessoncue-update.service -n 50 --no-pager` and `sudo systemctl status avahi-daemon --no-pager`.

## Pairing PIN fails

Pairing requests expire after ten minutes and lock after repeated failures. Begin pairing again, verify the current server log/admin PIN, and confirm the TV is talking to the expected server.

## Administrator password was forgotten

Use the SSH commands in [Reset a forgotten administrator password](installation.md#reset-a-forgotten-administrator-password). The reset is intentionally not exposed as an unauthenticated browser endpoint and does not require email or a hosted service.

## Media says internet required

Webpages, embedded players, Vimeo, and external destinations require internet. On Android TV and Fire TV, YouTube links use an embedded web player. For offline playback—or any YouTube item assigned to Apple TV—open **Add media**, choose **Download YouTube locally**, and wait for the Media Library status to change from Downloading/Processing to Offline ready. Only import media you are authorized to copy.

If a local YouTube import fails, read its processing error in the Media Library, confirm the server can reach YouTube, check available LessonCue storage, and inspect `sudo journalctl -u lessoncue -n 100 --no-pager`. Re-run the latest installer or install the latest release if the error says `yt-dlp` was not found.

## Countdown starts at the wrong time

Check the server time zone, server clock, and television clock. Confirm the manifest's `designatedStartAt`, `durationMs`, and `startAt`. A trimmed countdown uses `endMs - startMs`, not the original file duration.

## Docker health check fails

Inspect `docker compose logs lessoncue` and ensure the data directory is writable. The container image must include `curl` for the compose health check; if using a customized minimal image, call `/health` from the host instead.
