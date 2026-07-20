# Accounts, registration, and email

LessonCue remains self-hosted. Accounts, password hashes, verification records, registration-code hashes, email settings, and audit history live on the LessonCue server. Resend or Brevo is used only to deliver verification and recovery messages when an administrator enables it.

## Local-only accounts

No email provider is required for the initial owner or for accounts created under **Users → Create with password**. Administrator-created email addresses are trusted as verified. The password entered by the administrator is temporary: it signs out older sessions and the user must replace it immediately after the next sign-in. Until that replacement is complete, the account cannot use any other authenticated LessonCue API.

Owners and user administrators can create, edit, pause, reactivate, approve, reset, and delete accounts from **Users**. **Reset password** sets a temporary password without revealing or recovering the old one. Final-owner and privilege-escalation safeguards still apply.

When account email is configured, **Users → Send setup link** is the preferred onboarding path. The administrator enters the email address and selects the role and exact permissions. LessonCue reserves the account and emails a three-day, single-use link. The recipient chooses their own display name, username, and password. If delivery fails or the link expires, use **Resend setup**; changing the pending email address invalidates the earlier link.

Every signed-in person can select their name at the bottom of the navigation bar to edit their own name, username, email, or password. Changing a username, email, or password requires the current password. Changing an email requires configured email delivery and keeps the current address active until the new address is confirmed.

If browser recovery is unavailable, use the [SSH administrator password-reset procedure](installation.md#reset-a-forgotten-administrator-password).

## Configure account email

Sign in with **Server settings** permission and open **Settings → Organization & accounts → Registration & email**.

1. Choose **Resend** or **Brevo**.
2. Enter a sender name and a sender address that the provider permits.
3. Paste the provider API key. LessonCue accepts it as a write-only value.
4. Enter the public HTTPS address that recipients can reach, such as `https://lesson.example.org`. This should be the protected Cloudflare or reverse-proxy address for this LessonCue server.
5. Save the settings.
6. Enter a real recipient under **Test email delivery** and select **Send test email**. LessonCue sends through the saved provider and sender, reports provider rejection without exposing the key, and records the outcome in the audit log.
7. Open registration only after the test message arrives.

LessonCue encrypts the API key with ASP.NET Data Protection and stores it at:

```text
/var/lib/lessoncue/config/email-provider.json
```

The encryption keys remain under:

```text
/var/lib/lessoncue/config/keys/
```

Both locations are local runtime data, excluded from Git, and readable only through the restricted LessonCue installation. Back up the complete `/var/lib/lessoncue` directory so the encrypted credential and its encryption keys are not separated. The API and Settings page never return the key. Replacing it requires entering a new key; choosing **None** deliberately removes the stored email credential.

## Choose a registration mode

- **Closed** is the default. LessonCue rejects every self-registration attempt, including attempts that provide a code. Local administrator-created accounts continue to work.
- **Request access** permits anyone who can reach the page to register and verify an email address, but the account remains blocked until a user administrator selects **Approve**. This combines public signup with closed, administrator-controlled access.
- **Require an active registration code** requires both a valid code and email verification.
- **Open** permits anyone who can reach the registration page to create a Viewer account and verify its email.

Approval-required, open, and code registration cannot be enabled until Resend or Brevo is configured. New self-registered accounts always start as Viewers. An administrator can later change their role or exact permissions. Approving an account attempts to send a notification through the configured provider; approval remains effective if that notification cannot be delivered.

## Manage registration codes

Under **Settings → Registration & email → Registration codes**:

- **Create code** generates a random code and shows it once.
- **Edit** changes its label, expiration time, or maximum number of uses.
- **Replace** revokes the current value immediately and generates a new value with the same limits.
- **Revoke** stops the code immediately.

Only a short ending hint is retained for identification. The full value is stored only as a SHA-256 hash, so it cannot be recovered later. If a code is lost, replace it.

## Verification and recovery behavior

Verification links expire after 24 hours. Password-reset links expire after one hour. New-email confirmation links expire after two hours. Administrator invitation links expire after three days. All links are random, stored only as hashes, single-use, purpose-bound, and invalid after expiration.

The root page is the sign-in page. It shows **Create an account** in open mode, **Request access** in approval-required mode, **Register with a code** in code mode, and no registration link in closed mode. Registration, recovery, verification-resend, and SSH-recovery actions are separate keyboard-accessible controls. Recovery endpoints return the same response whether an account exists or not, limiting account discovery. Registration, verification, resend, recovery, reset, setup, and profile mutations are rate-limited per source address. Password and identity changes increment the account session version, invalidating older browser sessions.

For remote access, put authentication behind HTTPS and strongly consider Cloudflare Access or an equivalent outer access policy. Do not publish the local HTTP origin directly to the internet.

## Troubleshooting

Check the LessonCue service log without exposing API keys:

```bash
sudo journalctl -u lessoncue -n 100 --no-pager
```

If delivery fails:

1. Confirm the sender address is authorized in Resend or Brevo.
2. Replace the API key in Settings.
3. Confirm the public account-link address is HTTPS and reachable by recipients.
4. Keep registration closed until the provider status shows configured.

LessonCue logs the provider HTTP status and a bounded response detail, but never logs the decrypted API key.
