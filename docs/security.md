# Security baseline

LessonCue is local-network software, not trusted-network software. Treat every request as untrusted.

- Keep the server off the public internet. Use a supported VPN for remote planning.
- Leave the rotating pairing secret enabled unless an operator explicitly needs a fixed installation PIN, and protect service logs.
- Use HTTPS with a trusted local certificate where device management permits it.
- Give each TV an independent revocable credential.
- Store PINs, passwords, and device tokens only as adaptive or cryptographic hashes on the server.
- Validate file signatures as well as extensions before media processing.
- Run FFmpeg and document converters with resource limits and no network access.
- Do not fetch arbitrary external URLs. The optional YouTube importer is a narrow exception: accept exact YouTube hostnames only, pass fixed arguments directly to the bundled downloader without a shell, disable downloader configuration and playlists, and enforce the local storage allocation. Resolve and block loopback, private, link-local, and metadata addresses for any future fetch feature unless an administrator explicitly allowlists a local stream.
- LessonCue uses role-based browser sessions, same-origin mutation checks, CSP, rate-limited pairing/login, revocable hashed device credentials, and durable local data-protection keys. Uploaded media URLs remain reachable on the trusted television network so native players can stream them; do not expose the service directly to the internet.
- Retain audit logs and test backups and restoration.
- Keep SSH or equivalent physical administrator access available for account recovery. The recovery command runs as the restricted `lessoncue` account, stores only a new adaptive password hash, audits the reset, and invalidates existing sessions for that account.
- Owners and administrators can edit local names, usernames, emails, roles, and passwords from **Users**. They can also pause, reactivate, and permanently delete other accounts. Pausing or changing an account invalidates its previous browser sessions immediately.
- Native Linux port and `.local` name changes use typed files watched by a root-owned helper; the web process receives no sudo access. The service has only the bind capability needed for port 80, and an unhealthy port change rolls back to the last working listener.
- LessonCue prevents an administrator from pausing or deleting the account they are currently using, rejects duplicate usernames, and always preserves at least one active owner. Use the SSH recovery procedure if every known owner password is lost.

Report security issues privately to the repository owner rather than opening an issue containing exploit details.
