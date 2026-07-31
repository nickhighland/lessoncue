# Troubleshooting

## Browser troubleshooting log

A **Service Admin** can open **Settings → Data & recovery → Troubleshooting log** to load a searchable view of recent runtime events and the server's durable activity audit. Use **Download JSON** when sharing diagnostics with support. Credential-like values are redacted before runtime entries are saved or displayed. App Admins and other roles cannot open this log.

The browser log supplements—rather than replaces—the operating-system journal. For startup failures or problems before sign-in, use `sudo journalctl -u lessoncue -n 200 --no-pager` over SSH.

## An update or rollback did not complete

Open **Settings → Software updates** as a Service Admin. LessonCue records the last protected operation's completion time, target version, success or failure, and whether a last-known-good snapshot remains available. The rollback control is intentionally unavailable to App Admins because it replaces the application database and protected server configuration.

Native Linux updates write a root-only transaction marker before changing protected files. If power is lost, `lessoncue-update-recovery.service` runs before LessonCue at the next boot and restores the verified snapshot. Inspect both protected services over SSH:

```bash
sudo systemctl status lessoncue-update.service lessoncue-update-recovery.service --no-pager
sudo journalctl -u lessoncue-update.service -u lessoncue-update-recovery.service -n 200 --no-pager
sudo test -e /var/lib/lessoncue/update-transaction && echo "Recovery is still pending"
curl -fsS http://127.0.0.1/health/ready && echo
```

Do not manually delete `/opt/lessoncue.previous`, `/var/lib/lessoncue/update-rollback`, or an active transaction marker while recovery is pending. If the current server works but an operator-requested rollback was rejected, LessonCue restores the pre-rollback safety snapshot automatically and records that outcome in Settings.

## LessonCue started in recovery mode

If the browser says **LessonCue is protecting your data**, the process is alive but the database could not be opened, created, or upgraded safely. Normal API, background processing, pairing, and media routes are disabled. `/health/live` returns 200 with `safeMode: true`; `/health/ready`, `/health`, and `/recovery/status` return 503 so a load balancer or protected updater never mistakes recovery mode for a successful start.

Do not delete `/var/lib/lessoncue` or repeatedly reinstall. Capture the evidence first:

```bash
sudo systemctl status lessoncue --no-pager
sudo journalctl -u lessoncue -n 200 --no-pager
df -h /var/lib/lessoncue
sudo ls -lah /var/lib/lessoncue/database /var/lib/lessoncue/backups
curl -sS http://127.0.0.1/health/ready | python3 -m json.tool
```

If the failure followed a power loss during an update, run the root-owned recovery unit and recheck readiness:

```bash
sudo systemctl start lessoncue-update-recovery.service
sudo journalctl -u lessoncue-update-recovery.service -n 100 --no-pager
sudo systemctl restart lessoncue
curl -fsS http://127.0.0.1/health/ready && echo
```

Otherwise preserve a copy of the entire data directory before changing it. Install the same or a newer LessonCue release on a spare server and use a separately stored password to run a restore drill on the newest `.lcbak` file shown by the recovery page. Current manifests record their source version; LessonCue refuses a backup created by a newer release and tells you to update the receiving server first. If no verified backup exists, keep the original database and logs intact for manual SQLite recovery rather than creating a new database over it.

## TV cannot find the server

Open `http://SERVER-IP/.well-known/lessoncue` from a phone on the same Wi-Fi. If it fails, check the server service, firewall, VLAN, and client isolation. Android TV version 0.30.1 and newer automatically browses `_lessoncue._tcp` and saves the resolved numeric address when ordinary `lessoncue.local` lookup fails. If both automatic discovery and `.local` fail while the numeric address works, enter the numeric address and reserve it in DHCP; multicast DNS is blocked between the TV and server. If an administrator selected a non-default port, add `:PORT` after the hostname or IP address.

Native Linux servers advertise `lessoncue.local` by default. The administrator can change this under **Settings → Connection & pairing**. After changing it, allow several seconds for Avahi and client DNS caches to refresh. If the page reports that the address is still being applied, inspect `sudo journalctl -u lessoncue-update.service -n 50 --no-pager` and `sudo systemctl status avahi-daemon --no-pager`.

If a selected browser port is unavailable, LessonCue returns to the previous working port. Open the previous address and read the message under **Settings → Connection & pairing**, or inspect `sudo journalctl -u lessoncue-update.service -n 50 --no-pager`.

## Pairing PIN fails

Pairing requests expire after ten minutes and lock after repeated failures. Begin pairing again, verify the current server log/admin PIN, and confirm the TV is talking to the expected server.

## Administrator password was forgotten

Use the SSH commands in [Reset a forgotten administrator password](installation.md#reset-a-forgotten-administrator-password). The reset is intentionally not exposed as an unauthenticated browser endpoint and does not require email or a hosted service.

## Media says internet required

Webpages, embedded players, Vimeo, and external destinations require internet. On Android TV, Google TV, and Fire TV, YouTube links use an embedded web player. For offline playback, open **Add media**, choose **Download YouTube locally**, and wait for the Media Library status to change from Downloading/Processing to Offline ready. Only import media you are authorized to copy.

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
