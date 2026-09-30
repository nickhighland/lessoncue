# Amazon Appstore testing instructions

The Amazon Appstore reviewer must receive a live, reachable LessonCue server
and a current pairing credential. The Android TV application does **not** use a
LessonCue username/password login. Its first-run credential is the combination
of the server origin and the six-digit screen-pairing PIN.

Replace every bracketed value below before pasting the text into **Developer
Console → Binary File(s) → Testing Instructions**. Do not submit this template
with placeholders.

## Copy-ready instructions

```text
LessonCue TV is a paired display client, not a standalone account-login app.
Account login: not applicable — no username or password is required in the TV
application.

Test server: [PUBLIC_HTTPS_LESSONCUE_SERVER_ORIGIN]
Pairing PIN: [SIX_DIGIT_PAIRING_PIN]

The server value must be the origin only (scheme, host, and optional port), with
no username, password, path, query, or fragment.

The test server must remain online and reachable from the Fire TV throughout
review. It must be a public HTTPS origin; do not use lessoncue.local, a private
IP address, or a network protected by an interactive VPN/Cloudflare Access login.

1. Install and launch LessonCue.
2. On “Connect this TV”, replace the default address with:
   [PUBLIC_HTTPS_LESSONCUE_SERVER_ORIGIN]
   Leave the device name as the default or use “Amazon Review TV”. Select “Find
   server”.
3. On “Pair this TV”, enter [SIX_DIGIT_PAIRING_PIN] and select “Pair TV”.
4. The LessonCue library appears. Open “Sample Lesson” (or the lesson named
   [REVIEW_LESSON_NAME]) and select a playable item. Use the Fire TV remote’s
   Left/Right buttons to move between cues and Back to return to the library.

The PIN is a TV-pairing credential and is separate from any administrator
account password. If the app was previously installed, clear its app data or
uninstall/reinstall it before repeating the steps above. If the PIN expires,
start a new pairing request and use the current six-digit PIN shown by the test
server administrator.
```

## Server checklist before submission

- Use a dedicated review server or disposable review organization.
- Configure a fixed six-digit pairing PIN for the review window; an automatic
  ten-minute PIN is not suitable unless someone will be available to refresh it.
- Put a lesson with at least one playable image or video on the server. A newly
  paired screen receives lessons according to its screen/class assignment, so
  verify the review screen will receive the named lesson.
- Verify from outside the hosting network that the origin, pairing request,
  pairing confirmation, manifest, and media URLs work over HTTPS.
- Keep the server and PIN valid for the entire review. Revoke the review screen
  and rotate the PIN after Amazon finishes.

Do not commit the real server URL, PIN, account password, or other review
credentials to Git. Store them in the Amazon Developer Console and the server's
secret/configuration management instead.
