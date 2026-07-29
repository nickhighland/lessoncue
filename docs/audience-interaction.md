# Audience interaction

LessonCue can collect local audience polls and written responses without a cloud account or third-party response service. An Editor, App Admin, or Service Admin opens **Audience**, creates a session, and shares its six-character code or QR link. Participants open the link in any browser connected to the LessonCue server.

## Run a poll

1. Open **Audience** and select **New interaction**.
2. Name the session and choose a response-retention period from 1 to 30 days.
3. Add up to 20 single-choice, multiple-choice, or written-response questions.
4. Decide whether participants may revise their answers and whether approved live results should appear on their devices.
5. Save the session, select **Open responses**, and display or copy its QR link.
6. Watch aggregate totals update. Approve or hide written responses before they appear in audience results.
7. Select **Close responses** when finished. You can reset the answers for another group or permanently delete the session immediately.

The join page is `/respond/CODE`. The page does not require a LessonCue account. Draft and closed sessions do not accept submissions.

## Privacy and moderation

- LessonCue does not store a participant name, email address, IP address, browser name, or device details with a response.
- A browser creates a random local token. The server combines it with the session ID and stores only its SHA-256 hash, preventing correlation between separate sessions.
- The token enforces one response per device and question. If changes are allowed, later submissions update that anonymous response.
- Written responses default to **pending** and remain absent from public results until an administrator approves them. Rejected responses remain hidden.
- Choice results are aggregates; the administration interface never exposes the anonymous token.
- Public join and submission routes are rate-limited. Limits allow a classroom behind one shared network address to answer together while bounding automated abuse.
- Every session has a deletion date. The local server deletes its questions and responses automatically after 1–30 days. An administrator can reset or delete them sooner.
- Create, update, open, close, moderate, reset, delete, and automatic-purge actions are recorded in LessonCue’s local audit history.

Audience interaction is intentionally separate from lesson playback. Opening a poll does not select a lesson, send a TV command, interrupt signage, or change any paired screen.

