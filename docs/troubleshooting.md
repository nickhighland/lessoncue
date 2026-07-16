# Troubleshooting

## TV cannot find the server

Open `http://SERVER-IP:8080/.well-known/lessoncue` from a phone on the same Wi-Fi. If it fails, check the server service, firewall, VLAN, and client isolation. If the numeric address works but `lessoncue.local` does not, mDNS is blocked or unavailable; use the numeric address and reserve it in DHCP.

Native Linux servers advertise `lessoncue.local` by default. The administrator can change this under **Settings → Connection & pairing**. After changing it, allow several seconds for Avahi and client DNS caches to refresh. If the page reports that the address is still being applied, inspect `sudo journalctl -u lessoncue-update.service -n 50 --no-pager` and `sudo systemctl status avahi-daemon --no-pager`.

## Pairing PIN fails

Pairing requests expire after ten minutes and lock after repeated failures. Begin pairing again, verify the current server log/admin PIN, and confirm the TV is talking to the expected server.

## Media says internet required

Only uploaded or approved direct files are offline eligible. YouTube, Vimeo, subscription services, embedded players, and external app launches remain online-only unless the provider offers an authorized download mechanism.

## Countdown starts at the wrong time

Check the server time zone, server clock, and television clock. Confirm the manifest's `designatedStartAt`, `durationMs`, and `startAt`. A trimmed countdown uses `endMs - startMs`, not the original file duration.

## Docker health check fails

Inspect `docker compose logs lessoncue` and ensure the data directory is writable. The container image must include `curl` for the compose health check; if using a customized minimal image, call `/health` from the host instead.
