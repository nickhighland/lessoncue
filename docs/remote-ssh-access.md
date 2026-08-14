# LessonCue on a new network: local IP and remote SSH

This guide is the operational runbook for moving the LessonCue server to another LAN and reaching it safely from outside that LAN. It is written for the current deployment, but the IP-change procedure is reusable.

## Current deployment

| Item | Current value |
| --- | --- |
| Local mDNS name | `lessoncue.local` |
| Current LAN address | `192.168.4.138` |
| Linux SSH user | `highland04` |
| Cloudflare Zero Trust organization | `nhighland` (`nhighland.cloudflareaccess.com`) |
| Cloudflare tunnel | `LessonCue SSH` |
| Infrastructure target | `lessoncue-vm` |
| Access application | `LessonCue SSH` |
| Allowed identity | the Cloudflare account administrator email |
| Allowed SSH username | `highland04` only |
| Route | `192.168.4.138/32` |

The Cloudflare design is Access for Infrastructure: the VM makes an outbound tunnel connection, Cloudflare routes one private IP, and the client uses the Cloudflare One Client/WARP. There is no public SSH hostname, port-forward, or inbound port 22 rule. Cloudflare target hostnames are policy labels, not DNS names; `lessoncue.local` is the LAN-only name. See the [Cloudflare SSH infrastructure guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/use-cases/ssh/ssh-infrastructure-access/).

## 1. Before moving the server

1. Keep a local console or hypervisor console available. It is the recovery path if the new network blocks SSH.
2. Preserve the Cloudflare configuration file on the administration Mac:

   ```text
   /Users/nickhighland/.config/lessoncue/cloudflare-s2.env
   ```

   Keep it mode `600`. It contains the account API token; never commit it or paste its contents into a ticket.

3. Keep an independent SSH key or console login. The current direct-LAN key is `~/.ssh/lessoncue-codex-test`; the VM has its public key in `/home/highland04/.ssh/authorized_keys`.
4. If possible, reserve a DHCP lease for the VM. A stable address avoids repeating the route update.

## 2. Find and verify the new LAN address

On the LessonCue VM, after attaching it to the new network:

```bash
hostname
hostname -I
ip -4 addr show
ip route
```

Choose the VM's reachable IPv4 address (for example, `192.168.50.27`). Do not use a Docker bridge address such as `172.17.0.1`.

From a computer on the same LAN, verify the application and SSH before touching Cloudflare:

```bash
curl -fsS http://NEW_IP/health
ssh highland04@NEW_IP
```

If Avahi/mDNS is installed and the hostname is configured as `lessoncue`, the local browser address is:

```text
http://lessoncue.local
```

Use the numeric address when mDNS is unavailable. The `.local` name is not expected to resolve from the public Internet.

## 3. One-time remote-client setup

Cloudflare Access for Infrastructure requires the Cloudflare One Client (WARP) in **Traffic and DNS** mode. Cloudflare's documented flow also requires the Gateway TCP proxy and a split-tunnel route for the server IP. Cloudflare's current instructions are in the [SSH infrastructure guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/use-cases/ssh/ssh-infrastructure-access/).

On the computer that will administer LessonCue:

1. Install the official Cloudflare One Client/WARP for the operating system.
2. Sign in to the Zero Trust organization `nhighland` when prompted. Use the same Cloudflare identity that is allowed by the `LessonCue SSH` application.
3. Set the client to **Traffic and DNS** mode and connect it.
4. In Cloudflare Zero Trust, enable the **Gateway proxy for TCP**.
5. Add the server route to the WARP split-tunnel configuration. The current organization excludes RFC-1918 space by default, so do not simply add an include entry while leaving an overlapping `192.168.0.0/16` exclude in effect. The safest arrangement for a single administrator is a device-settings profile that matches the administrator identity and includes only the LessonCue `/32` route. If the organization uses Exclude mode, remove the broad overlapping exclusion and replace it with narrower exclusions that do not contain the LessonCue address. Review the effective profile on the client before testing.

After WARP is connected and the route is effective, use any normal SSH client:

```bash
ssh highland04@192.168.4.138
```

Replace the address with the current server address. Cloudflare issues the short-lived SSH certificate; the VM trusts the Cloudflare CA at `/etc/ssh/ca.pub`. The server will not create users automatically, so the requested UNIX user must already exist.

The same path supports `scp`, `sftp`, and `rsync` where the Cloudflare Access for Infrastructure limitations permit them.

## 4. Change the route when the VM gets a new IP

Changing the LAN IP does not require a new tunnel, Access application, SSH CA, or connector token. Update the private route and the Infrastructure target, then update the WARP split-tunnel entry.

The account API token is read from the protected local file; these commands do not print it:

```bash
set -a
source /Users/nickhighland/.config/lessoncue/cloudflare-s2.env
set +a

NEW_IP='192.168.50.27'       # change this to the VM's new IPv4 address
ROUTE_ID='d59e6bc8-417e-45db-b987-da9015a72edc'
TARGET_ID='01a0029a-fffd-7e9f-aabc-7bcdff8bdcec'
VIRTUAL_NETWORK_ID='9168c1a9-ff64-47bf-b280-8df9922307f3'

python3 - "$NEW_IP" <<'PY'
import ipaddress, sys
ipaddress.IPv4Address(sys.argv[1])
PY

ROUTE_BODY=$(jq -n --arg ip "$NEW_IP" \
  '{network:($ip + "/32"), comment:"LessonCue SSH VM route"}')
TARGET_BODY=$(jq -n --arg ip "$NEW_IP" --arg vn "$VIRTUAL_NETWORK_ID" \
  '{hostname:"lessoncue-vm", ip:{ipv4:{ip_addr:$ip, virtual_network_id:$vn}}}')

curl --fail-with-body -sS \
  -X PATCH \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/teamnet/routes/${ROUTE_ID}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data "$ROUTE_BODY" | jq '{success,errors,result:{id,network,comment}}'

curl --fail-with-body -sS \
  -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/infrastructure/targets/${TARGET_ID}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data "$TARGET_BODY" | jq '{success,errors,result:{id,hostname,ip}}'
```

The current route API uses `PATCH .../teamnet/routes/{route_id}` for this update; see the [Cloudflare tunnel routes API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/networks/subresources/routes/).

Then replace the old `/32` with the new `/32` in the WARP split-tunnel profile. If the client uses a dedicated identity profile, only that profile needs the change. If several administrators use the route, update the shared profile once and have each client reconnect WARP.

Verify from the server and the Cloudflare API:

```bash
# On the VM
sudo systemctl is-active lessoncue-ssh-cloudflared.service
sudo journalctl -u lessoncue-ssh-cloudflared.service -n 50 --no-pager

# On the administration Mac
curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/98dc08d5-d0af-4ada-946e-1a03197de6cf" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" | jq '{success,result:{name,status,connections:(.result.connections|length)}}'
```

The tunnel should report `healthy` with active connections. Test both paths:

```bash
# Same LAN (does not depend on Cloudflare)
ssh highland04@NEW_IP

# Remote network, with WARP connected
ssh highland04@NEW_IP
```

If the first command works but the second does not, the problem is WARP split tunneling, Gateway TCP proxying, or the Access policy—not the VM's SSH daemon.

## 5. Moving to a different subnet

If the new network is not `192.168.0.0/16`, use the new address in the same `/32` route and target update. Confirm:

- the VM's default route returns traffic to the new LAN gateway;
- the VM firewall allows SSH from the local interface;
- the new address is included in the WARP profile;
- the new network permits outbound TCP/UDP `7844` so `cloudflared` can reconnect;
- no public router port-forward for TCP 22 was added.

The tunnel is outbound-only; the VM does not need an inbound Internet firewall exception for Cloudflare.

## 6. Start, stop, and emergency disable

The dedicated SSH connector is separate from LessonCue's web tunnel. On the VM:

```bash
sudo systemctl status lessoncue-ssh-cloudflared.service --no-pager
sudo systemctl stop lessoncue-ssh-cloudflared.service       # disable remote SSH now
sudo systemctl start lessoncue-ssh-cloudflared.service      # re-enable it
sudo systemctl enable lessoncue-ssh-cloudflared.service     # start at boot
```

For an additional Cloudflare-side kill switch, disable the `LessonCue SSH` Access application or remove its private route. Do not change the existing web tunnel named `LessonCue` unless web access is also meant to be disabled.

## 7. Rotate SSH credentials safely

The current direct-LAN connection uses the Ed25519 key `~/.ssh/lessoncue-codex-test`; its public counterpart is installed in `/home/highland04/.ssh/authorized_keys`. Password authentication is also enabled on the VM.

To rotate the key without losing access:

1. Generate a new key on the administration computer: `ssh-keygen -t ed25519 -f ~/.ssh/lessoncue-admin`.
2. Add the new `.pub` line to `/home/highland04/.ssh/authorized_keys` while the old key still works; keep mode `700` on `.ssh` and `600` on `authorized_keys`.
3. Test the new key from both the LAN and the remote WARP path.
4. Remove the old public-key line only after the new path works.

To change the Linux password, log in locally or with the current key and run `passwd`. Changing the Linux username requires both a new UNIX account and a Cloudflare Access application policy update: the current policy intentionally allows only `highland04`, not `root`.

## 8. Troubleshooting checklist

| Symptom | Check |
| --- | --- |
| `lessoncue.local` does not resolve | Use the numeric IP; verify Avahi and the VM hostname. |
| LAN SSH fails | `ss -lntp | grep ':22'`, `sudo systemctl status ssh`, VM firewall, and `authorized_keys`. |
| Tunnel is inactive | `sudo systemctl status lessoncue-ssh-cloudflared`, then `journalctl -u lessoncue-ssh-cloudflared`; check outbound `7844`. |
| Tunnel is healthy but remote SSH times out | WARP connected, Gateway TCP proxy enabled, and the new `/32` is in the effective split-tunnel profile. |
| Access denies the login | Sign in with the allowed Cloudflare identity and use exactly `highland04`; review the `LessonCue SSH` policy. |
| `Certificate invalid: name is not a listed principal` | Confirm the requested SSH username is allowed and present on the VM; inspect `sudo sshd -T -C user=highland04`. |
| Route points at an old address | Repeat the route and target update in section 4, then reconnect WARP. |

Do not put the tunnel token, API token, or private SSH key in screenshots, shell history, the repository, or support bundles. After provisioning is complete, rotate the Cloudflare API token used for setup and keep only a narrowly scoped replacement.

## References

- [Cloudflare SSH with Access for Infrastructure](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/use-cases/ssh/ssh-infrastructure-access/)
- [Cloudflare tunnel routes API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/networks/subresources/routes/)
- [Cloudflare Infrastructure targets API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/infrastructure/subresources/targets/)
