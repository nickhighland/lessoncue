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
LessonCue Player for Fire TV is a paired display client. It does not use an
account username or password. Review access is provided through the public
HTTPS LessonCue server and the screen-pairing PIN below.

Review server: [PUBLIC_HTTPS_LESSONCUE_SERVER_ORIGIN]
Pairing PIN: [SIX_DIGIT_PAIRING_PIN]
Use the Fire TV remote for navigation.

The server value must be the origin only (scheme, host, and optional port), with
no username, password, path, query, or fragment.

The test server must remain online and reachable from the Fire TV throughout
review. It must be a public HTTPS origin; do not use lessoncue.local, a private
IP address, or a network protected by an interactive VPN/Cloudflare Access login.

1. Install and launch LessonCue Player.
2. On “Connect this TV”, enter [PUBLIC_HTTPS_LESSONCUE_SERVER_ORIGIN] in the
   server address field. Leave the device name as the default or use “Amazon
   Review TV”. Select “Find server”.
3. On “Pair this TV”, enter [SIX_DIGIT_PAIRING_PIN] in the six-digit PIN field
   and select “Pair TV”. This PIN is the screen-pairing credential, not an
   account password.
4. After pairing, the LessonCue library opens. Open “Sample Lesson” (or the
   lesson named [REVIEW_LESSON_NAME]) and select the sample video to play it.
   Use Select/Play to start playback; Left/Right moves between cues; Back
   returns to the lesson library.
5. If a prior installation has a saved server, clear app data or
   uninstall/reinstall, then repeat using the server and PIN above.

The review server must be publicly reachable over HTTPS and must not require an
administrator login or interactive VPN. If the server address field is not
visible immediately, choose “Enter the server address” on the initial loading
screen. If the PIN expires, start a new pairing request and use the current
six-digit PIN shown by the test server administrator.
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
