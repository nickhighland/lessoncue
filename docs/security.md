# Security baseline

LessonCue is local-network software, not trusted-network software. Treat every request as untrusted.

- Keep the server off the public internet. Use a supported VPN for remote planning.
- Leave the rotating pairing secret enabled unless an operator explicitly needs a fixed installation PIN, and protect service logs.
- Use HTTPS with a trusted local certificate where device management permits it.
- Give each TV an independent revocable credential.
- Store PINs, passwords, and device tokens only as adaptive or cryptographic hashes on the server.
- Validate file signatures as well as extensions before media processing.
- Run FFmpeg and document converters with resource limits and no network access.
- Do not fetch arbitrary external URLs. Resolve and block loopback, private, link-local, and metadata addresses unless an administrator explicitly allowlists a local stream.
- LessonCue uses role-based browser sessions, same-origin mutation checks, CSP, rate-limited pairing/login, revocable hashed device credentials, and durable local data-protection keys. Uploaded media URLs remain reachable on the trusted television network so native players can stream them; do not expose the service directly to the internet.
- Retain audit logs and test backups and restoration.

Report security issues privately to the repository owner rather than opening an issue containing exploit details.
