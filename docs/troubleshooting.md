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

## Android TV reports that a lesson date could not be parsed

Upgrade the server and Android TV client to LessonCue 0.30.3 or newer. Earlier Android TV clients could reject the complete screen manifest when one optional lesson timestamp contained a damaged numeric offset, showing an error such as `Text '2026-07-25T09:00:00+)):))' could not be parsed at index 19` after connecting by IP address or `.local` name.

Current servers publish screen-manifest schedule timestamps in UTC `Z` form. Current Android TV clients also repair the known corrupted zero-offset form and safely omit an unrecoverable optional schedule time rather than blocking the connection. After updating, open the affected lesson's **Timing** section, confirm its pre-roll and designated-start values, and save it again.

## Android TV says the update certificate is incompatible

LessonCue 0.30.4 can report a false incompatible-certificate error on Android 9–12, including NVIDIA Shield TV, because those Android versions require the newer signing-certificate flag through an older `PackageManager` method. The published production APK remains correctly signed.

Download `lessoncue-tv.apk` from the stable latest-release link and sideload version 0.30.5 once over the existing installation. Do not uninstall LessonCue: an in-place installation with the same production certificate preserves pairing, assignments, settings, and cached media. Starting with 0.30.5, LessonCue reads the installed and downloaded certificates correctly on these Android versions, so future in-app updates work normally.

## Intel hardware encoding device creation fails

Upgrade to LessonCue 0.30.5 or newer. Current Linux builds identify Intel render nodes and test direct QSV, VAAPI-derived QSV, direct VAAPI, and direct VAAPI with the legacy `i965` driver. This last path is required on working Haswell hardware that exposes H.264 `VAEntrypointEncSlice` but cannot initialize through modern oneVPL/QSV. The successful pipeline and its driver environment are reused for conversions.

If the check still fails, run:

```bash
ls -l /dev/dri
id lessoncue
sudo -u lessoncue test -r /dev/dri/renderD128 && echo readable
sudo -u lessoncue test -w /dev/dri/renderD128 && echo writable
dpkg -l | grep -E 'intel-media-va-driver|i965-va-driver|ffmpeg'
```

Replace `renderD128` with the Intel device shown by `ls` when necessary. The `lessoncue` account must belong to the device's `render` or `video` group, and a matching Intel VA driver must be installed. Haswell and older supported generations normally use `i965-va-driver`; newer generations normally use `intel-media-va-driver`. Re-running the latest native installer repairs the normal group membership, cache directory, and available driver packages without removing LessonCue data. A machine without a supported Intel GPU remains on the safe software encoder.

## Countdown starts at the wrong time

Check the server time zone, server clock, and television clock. Confirm the manifest's `designatedStartAt`, `durationMs`, and `startAt`. A trimmed countdown uses `endMs - startMs`, not the original file duration.

## Docker health check fails

Inspect `docker compose logs lessoncue` and ensure the data directory is writable. The container image must include `curl` for the compose health check; if using a customized minimal image, call `/health` from the host instead.
