# Remote SSH access plan

LessonCue's existing Cloudflare integration is an outbound HTTPS web tunnel. It deliberately does not expose SSH. A separate route and access policy is required for remote maintenance.

## Recommended design: Cloudflare Access for Infrastructure

Use a dedicated Cloudflare Tunnel hostname such as `ssh.example.org` and route it to `ssh://127.0.0.1:22` on the LessonCue host. Protect that hostname with Cloudflare Access for Infrastructure rather than publishing an ordinary public TCP endpoint. Access policies should allow only named administrators or an approved identity-provider group. Prefer short-lived SSH certificates and command logging where the account and plan support them. Keep the web hostname and SSH hostname separate so either path can be disabled without changing the other.

The local SSH daemon should still require normal key-based authentication, disable password login where practical, limit the allowed users, and retain a local console or LAN recovery path. The tunnel connector must run as an unprivileged service account and must not receive a shell or application data permissions.

## Provisioning checklist

1. Create or select a Cloudflare account and domain. Create a dedicated remotely managed tunnel or a dedicated connector for SSH; do not reuse the LessonCue web hostname.
2. Create the SSH public hostname and service route `ssh://127.0.0.1:22`.
3. Create an Access for Infrastructure application for that hostname. Choose the identity provider, allowed users/groups, session duration, and device posture requirements. Add an explicit deny-all fallback policy.
4. On the VM, install the connector through the LessonCue root-owned helper or the signed native installer. Keep the token out of shell history and ordinary application logs.
5. Configure each operator's client with the Cloudflare SSH proxy command (for example, `cloudflared access ssh --hostname ssh.example.org`) and a key or short-lived certificate. Test from an off-site network and confirm that LAN SSH remains a recovery path.
6. Test the kill switch: disable the tunnel or Access application, confirm that new sessions fail, then re-enable it and confirm that the connector reconnects without exposing port 22 directly.

## Information required before automatic setup

No Cloudflare API credential is present in the current session, so no account changes have been made. Automatic provisioning needs a narrowly scoped API token supplied through a secure local environment variable or connector, plus:

- Cloudflare account ID and domain/zone;
- desired SSH hostname (different from the LessonCue web hostname);
- identity provider and exact users/groups allowed to connect;
- SSH Linux username(s), key/certificate policy, and whether password login will be disabled;
- whether the existing web tunnel should be reused as a separate route or a dedicated tunnel/connector should be created.

Do not paste a long-lived API token or private SSH key into a chat message. After setup, rotate the provisioning token and verify the Access audit log and the VM's SSH journal.

## Alternatives

- **Tailscale or WireGuard VPN:** simpler user experience for a small trusted group and no public SSH hostname, but requires installing and maintaining a VPN control plane and device enrollment.
- **Temporary provider-managed SSH session:** use a short-lived console or cloud serial session for break-glass recovery only; it is not a daily administration path.

Cloudflare's current guidance covers [Tunnel's outbound-only model](https://developers.cloudflare.com/tunnel/), [client-side SSH authentication](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/use-cases/ssh/ssh-cloudflared-authentication/), and [Access for Infrastructure](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/use-cases/ssh/ssh-infrastructure-access/).
