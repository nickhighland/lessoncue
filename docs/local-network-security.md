# Local network security and HTTPS

LessonCue is local-first. Plain HTTP is supported only on a trusted private
LAN because many TVs must connect to a local IP address or `.local` name.
HTTP is not encrypted: another device able to observe that network can see
browser traffic and media URLs.

Use these boundaries:

- Use local HTTP only on a private, trusted LAN or isolated presentation VLAN.
- Use HTTPS for every public hostname, remote connection, shared Wi-Fi, or
  untrusted network.
- Never forward LessonCue's origin port directly from an internet router.
- Protect remote access with Cloudflare Access, a VPN, or an equivalent
  authenticated HTTPS gateway.
- Treat pairing PINs, controller links, cookies, device tokens, and media URLs
  as credentials.

## Optional local HTTPS with Caddy

This workflow keeps LessonCue self-hosted. Caddy terminates HTTPS on the same
server and forwards requests to a loopback origin.

First, in **Settings → Connections & pairing**, change LessonCue's browser port
from 80 to 8080. Let the server restart, reconnect at
`http://lessoncue.local:8080`, and then run:

```bash
sudo apt-get update
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
  sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' |
  sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update
sudo apt-get install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'CADDY'
lessoncue.local {
  tls internal
  reverse_proxy 127.0.0.1:8080
}
CADDY
sudo systemctl reload caddy
sudo systemctl --no-pager --full status caddy
```

Open `https://lessoncue.local`. Caddy uses a private local certificate
authority, so each browser or TV must trust its root certificate. Copy it from:

```text
/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt
```

Install that certificate as a trusted local CA only on devices you control.
LessonCue's Android client accepts user-installed CAs. Some managed TV devices
may prohibit user CAs; use a publicly trusted internal hostname, an
authenticated VPN, or trusted local HTTP on an isolated VLAN for those devices.

Keep TCP port 8080 inaccessible from other networks. If the server firewall
allows traffic by default, allow SSH and HTTPS first, then restrict the origin:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
sudo ufw deny 8080/tcp
sudo ufw enable
```

The Caddy process connects through `127.0.0.1`, so this firewall rule does not
block the reverse proxy.

## Android connection policy

The Android client accepts:

- HTTPS origins on any valid hostname;
- HTTP only for loopback, RFC 1918 private IPv4, IPv4 link-local, IPv6
  loopback/private/link-local, and `.local` hostnames.

An ordinary public hostname entered with `http://` is rejected before a
connection is attempted.

## Media and display privacy

Paired displays receive authenticated manifests, but local media file,
thumbnail, waveform, filmstrip, and adaptive-playback URLs are deliberately
readable without a browser login. This allows native and browser displays to
stream files reliably, but an opaque media UUID is not an authorization
boundary.

Place display devices and the LessonCue server on a trusted LAN/VLAN or behind
an authenticated VPN. Do not publish the origin port, and do not assume that a
media URL is private after it has been shared.

## Service Admin MFA and recovery

Service Admins can enable authenticator MFA in **Settings → Organization &
accounts**. LessonCue supports standard six-digit TOTP authenticator apps and
rejects reuse of an accepted time window.

If an authenticator is lost, use the documented SSH administrator password
reset. Recovery changes the password, disables MFA for that account, and signs
out existing browser sessions.

Database restore also disables MFA for restored accounts. LessonCue deliberately
keeps the receiving server's encryption keys rather than replacing them with
the source server's keys, so restored Service Admins must enroll again.
