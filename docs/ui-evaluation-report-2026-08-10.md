# LessonCue user-centered UI evaluation

- Date: 2026-08-10
- Branch: `refactor`
- Environment: disposable Debian VM at `192.168.4.37:8080`, desktop browser, 390×844 browser viewport, browser display client, and Android TV emulator
- Evaluation source: [AI user-centered UI evaluation brief](ai-ui-evaluation-brief.md)

## Executive summary

**Post-remediation decision for software-testable journeys: GO, with the physical-device and clean-first-run evidence gates below still open.**

The initial audit decision was **NO-GO**. The P0–P2 findings were subsequently implemented and rerun on the same branch. Public Audience participation is responsive, moderation is validated, batch uploads retain attributable per-file outcomes with failed-only retry, document conversion failures remain visible and cannot become false-ready, pairing and controller state are truthful, mobile navigation and foundational keyboard paths are operable, and lesson/Signage/media assignment context is materially clearer.

F-20 remains blocked on physical Google TV/Fire TV hardware, and F-24 remains intentionally deferred until a truly clean first-run observation justifies the exact readiness assistant. Neither limitation was disguised as a software pass.

The main desktop administration experience is visually coherent and substantially easier to understand than the previous Settings layout. Lesson creation, media selection, screen inventory, calendar, templates, user management, signage composition, browser-display pairing, and live controller-to-display playback all have credible happy paths. The tested browser display received a lesson command and rendered the selected video successfully.

Two audience defects and two media-recovery defects currently prevent release confidence:

1. the public audience-response page has no matching component stylesheet and is practically unusable at phone width;
2. approving a moderated response sends no moderation status and returns HTTP 500;
3. a mixed upload can partially succeed and then report one unnamed failure, leaving the operator unable to tell what to retry without risking duplicates;
4. document conversion can fail in the server while the UI presents no failed-conversion state and later exposes an unusable preview.

The initial cross-product usability concern was state honesty: a stale pairing PIN looked current, an offline controller said a command was sent, and `Ready` could appear beside `Offline`. Remediation now refreshes/counts down PINs, disables offline commands without silently queueing them, labels stale playback as last reported, waits for a real receipt, and expires an unanswered send visibly.

The requested Settings layout work was verified and is not counted as a new recommendation. The historical findings below describe the initial evidence; the following remediation record is authoritative for current branch status.

## Post-audit remediation and verification

| Finding | Status | Implemented result |
| --- | --- | --- |
| F-01–F-04 | Fixed | Responsive public poll; validated moderation; named per-file upload results and failed-only retry; durable, validated conversion failure/readiness. |
| F-05–F-10 | Fixed | Live pairing expiry; safe controller receipts/offline behavior; cue reveal/focus; Signage affected-screen undo; fresh PIN input; direct document action. |
| F-11–F-19 | Fixed | Mobile drawer/reflow; sticky-space fixes; durable media view/full names; one Signage navigation; native switch semantics; working skip link; deterministic cue focus. |
| F-20 | Hardware evidence open | Emulator coverage passed; physical Google TV/Fire TV, HDMI/CEC, overscan, vendor-decoder, venue-audio, and real-Wi-Fi checks still require hardware. |
| F-21–F-23 | Fixed | Auth route replacement; contextual reveal/retry at the observed off-screen results; lesson and Sign `Plays where` summaries. |
| F-24 | Deliberately deferred | The report still requires a clean-install observation before building a readiness assistant. |
| F-25 | Fixed | Successful class recycling clears and closes stale editors before refreshed selection. |

Automated evidence after remediation:

- `npm test`: TypeScript and production web build passed.
- `npm run test:e2e`: 9/9 browser tests passed, including the complete local workflow, protocol fallbacks, Signage relative sizing, and accessibility journeys.
- public Audience reflow is asserted at 320, 390, 480, 720, and 1080 CSS pixels; the 390-pixel journey also runs an automated WCAG 2.2 AA scan and keyboard selection.
- `dotnet test`: 279/279 server tests passed.
- protocol validation and AI real-use-runner unit tests passed.
- Android TV connected instrumentation was rerun with the installed local Android SDK; exact flavor results are recorded in the Android section below.
- ESLint reported zero errors; remaining hook-dependency warnings predate this remediation and are tracked as maintenance work.

## Method and evidence

The evaluation used visible UI controls first. Source and server logs were inspected only after visible failures needed corroboration. Synthetic data was prefixed `QA-UIAUDIT-` where the UI allowed naming. Evidence is stored under `test-runs/LC-20260810-ui-audit/evidence/screenshots/`.

The evidence set contains 47 screenshots covering authentication, dashboard, Settings, lessons, upload/conversion, audience participation/moderation, signage, screens, browser playback, controller, templates, calendar, and users. Full-page stitched screenshots can repeat sticky elements; viewport screenshots are authoritative for layout findings.

Representative direct evidence:

- [public Audience page at 390×844](../test-runs/LC-20260810-ui-audit/evidence/screenshots/AUD-005-participant-mobile-viewport.png)
- [failed Audience moderation state](../test-runs/LC-20260810-ui-audit/evidence/screenshots/AUD-008-approve-500.png)
- [mixed upload result](../test-runs/LC-20260810-ui-audit/evidence/screenshots/MEDIA-004-upload-result.png)
- [document conversion detail](../test-runs/LC-20260810-ui-audit/evidence/screenshots/MEDIA-006-pdf-detail.png)
- [phone-sized controller shell](../test-runs/LC-20260810-ui-audit/evidence/screenshots/CTL-006-universal-remote-mobile.png)
- [unresolved offline command](../test-runs/LC-20260810-ui-audit/evidence/screenshots/CTL-005-offline-playback-stuck.png)
- [paired browser-display playback](../test-runs/LC-20260810-ui-audit/evidence/screenshots/SCR-005-browser-playback-unlocked.png)
- [desktop Signage layout editor](../test-runs/LC-20260810-ui-audit/evidence/screenshots/SIGN-002-studio-desktop-1280.png)
- [Settings layout](../test-runs/LC-20260810-ui-audit/evidence/screenshots/SET-002-organization-settings-desktop.png)
- [stale class editor after recycling](../test-runs/LC-20260810-ui-audit/evidence/screenshots/LES-004-deleted-class-dialog-stale.png)

Times below are rounded operator-session timings. “Steps” count meaningful clicks, taps, entries, or key actions; passive waits are called out separately.

## Journey results

| Persona and goal | Viewport/input | Time | Steps | Result | Evidence |
| --- | --- | ---: | ---: | --- | --- |
| Service Admin: authenticate and find the next useful action | 1280×720, pointer | ~1m 20s | 5 | PARTIAL — valid sign-in authenticated, but the registration/sign-in surface did not navigate until `/` was reloaded | `AUTH-001`, `DASH-001` |
| App Admin: inspect system, account, media/storage, network, pairing, and display readiness | 1280×720, pointer | ~4m 10s | 18 | PASS with findings — requested Settings layout is present; collapse state survives section navigation but not a full reload | `SET-001`–`SET-003`, `SCR-001` |
| Teacher: create a classroom and lesson, then add existing media | 1280×720, pointer | ~2m 45s | 11 | PASS with workflow friction — creation was fast; the newly added cue appeared below the fold with only a toast as confirmation | `LES-001`–`LES-003` |
| Media operator: upload video, image, PDF, audio, convertible video, and invalid MP4 | 1280×720, pointer/file chooser | ~5m 20s plus processing | 12 | FAIL — five files succeeded, one failed without its name; PDF conversion failed invisibly | `MEDIA-001`–`MEDIA-009` |
| Volunteer: unlock controller, select a screen, play a lesson, recover from offline target | 1280×720 and 390×844, pointer/touch proxy | ~3m 40s | 10 | PARTIAL — online display command worked; offline command feedback was contradictory and never resolved | `CTL-001`–`CTL-006` |
| Viewer: pair a browser display and render commanded media | 1280×720, keyboard/pointer | ~2m 20s | 6 plus one recovery | PASS after recovery — stale PIN failed; refreshed PIN paired; playback rendered after the browser gesture prompt | `SCR-002`–`SCR-005` |
| Audience participant/facilitator: create, open, join, answer, moderate | 1280×720 admin and 390×844 participant | ~4m 05s | 14 | FAIL — submission worked, public page was unstyled, moderation returned HTTP 500 | `AUD-001`–`AUD-009` |
| Signage editor: create/edit/save a layout and inspect playlists/sign assignment | 1280×720 and 390×844, pointer | ~5m 30s | 16 | PARTIAL — editing works, but validation is obscured and live-change safety/navigation are weak | `SIGN-001`–`SIGN-006` |
| Android TV viewer: focus, D-pad selection, Back, emergency override, update surfaces | 1920×1080 emulator, instrumentation/D-pad | 5m 13s sideload; 8m 09s store | 11 tests per flavor | PASS — 11/11 sideload and 11/11 store, zero skipped/failed | Android reports under `android-tv/app/build/reports/androidTests/` |

## Android TV and hardware result

The installed Android SDK and the running `Television_Api34` emulator were used directly. The first combined run stalled in the emulator package installer; this failure was preserved, the emulator was rebooted, and each flavor was rerun separately. After recovery:

- `connectedSideloadDebugAndroidTest`: **11/11 passed**, 0 skipped, 0 failed, 5m 13s;
- `connectedStoreDebugAndroidTest`: **11/11 passed**, 0 skipped, 0 failed, 8m 09s;
- covered focus requests, D-pad center activation, Back-to-library behavior, emergency-signage suppression, update screens, and the remaining connected Android UI test paths;
- Gradle emitted only the existing Gradle-10 deprecation warning.

This is meaningful regression evidence, but it does not prove physical-remote feel, overscan, HDMI/CEC, venue audio, Wi-Fi recovery, vendor decoders, or Fire TV behavior. Those remain explicitly blocked on hardware.

The post-remediation rerun also passed both flavors: sideload **11/11** in 7m 49s and store **11/11** in 26s, again with zero skipped/failed. Two warm-restart store attempts were preserved as infrastructure failures because Gradle's device library could not read the emulator API level and therefore ran zero app tests. A true cold restart of only `Television_Api34` restored device metadata; the subsequent store suite executed and passed. No application failure occurred in those skipped attempts.

## Release-blocking findings

### F-01 — `ACCESSIBILITY`: public audience page has no usable responsive presentation

- **User goal/persona:** an audience participant joins from a phone and answers without assistance.
- **Reproduction:** create a poll, open it, visit `/respond/{code}`, set the viewport to 390×844, and inspect/submit the form.
- **Observed:** the brand icon renders at roughly 683×683, the page horizontally overflows, controls use browser-default presentation, and question/result hierarchy is compressed. The loaded CSS contains no definitions for the component’s `audience-public*` and `audience-response-form` classes.
- **Expected:** a single-column, touch-ready response card that fits 320–480 px without horizontal scrolling, with readable question grouping and clear submitted state.
- **Evidence/friction:** `AUD-005-participant-mobile-viewport.png`, `AUD-006-submitted-mobile.png`; reproduced at 390×844 on the first attempt.
- **Smallest useful change:** add scoped public-audience styles, size the logo, set responsive max widths/padding, style form controls and result states, and enforce 44 px touch targets.
- **Alternative/trade-off:** sharing the admin design tokens is faster, but the public page should keep a smaller payload and must not inherit admin navigation.
- **Acceptance:** no horizontal overflow at 320, 390, 480, 720, or 1080 px; all controls have visible focus and at least 44×44 px touch area; 200% zoom remains usable; submitted and validation states are announced.
- **Keep unchanged:** anonymous/local participation, short code, QR route, and moderation privacy model.
- **Score:** Impact 5 × Reach 5 × Confidence 5 + Effort 4 + Risk reduction 5 = **134**.

### F-02 — `DEFECT`: audience moderation request omits the requested status

- **User goal/persona:** a facilitator approves a pending written response.
- **Reproduction:** open a moderated poll, submit a written response, return to the facilitator, and click **Approve**.
- **Observed:** the UI reports `Request failed (500)` and the response remains pending. The server logs a `NullReferenceException` in `ModerateResponse`; corroborating source inspection shows the client posts `{}` while the endpoint expects `status`.
- **Expected:** the response transitions to approved once, the public/live view updates, and an idempotent retry is safe.
- **Evidence/friction:** `AUD-008-approve-500.png`, `AUD-009-approve-500-full.png`; one click fails every time.
- **Smallest useful change:** send `{ status }`, reject a missing/invalid status with HTTP 400 instead of throwing, and add endpoint/integration coverage for approve and hide.
- **Alternative/trade-off:** separate approve/hide endpoints would be explicit but are a larger protocol change.
- **Acceptance:** approve and hide each return success, update both facilitator and participant/result views, survive duplicate clicks, and never return 500 for invalid input.
- **Keep unchanged:** written-response moderation remains opt-in and unapproved responses stay private.
- **Score:** 5 × 4 × 5 + 4 + 5 = **109**.

### F-03 — `RELIABILITY`: mixed upload failure is not attributable to a file

- **User goal/persona:** a media operator uploads a heterogeneous batch and safely repairs only the bad item.
- **Reproduction:** select ready MP4, PNG, PDF, WAV, convertible MP4, and a signature-mismatched `.mp4`; start upload.
- **Observed:** the chooser shows only “6 files.” Five assets are created, then one singular error says “The upload could not be completed” without a filename or per-file outcome. Retrying all six risks duplicates.
- **Expected:** preflight and final results identify every file, with succeeded/processing/failed counts and a retry action scoped to failed files.
- **Evidence/friction:** `MEDIA-003-selected-files.png`, `MEDIA-004-upload-result.png`, `MEDIA-005-list-processing.png`; media count increased from 10 to 15 despite the failure dialog.
- **Smallest useful change:** show filenames immediately after selection and retain a per-file result list with reason, next action, and **Retry failed files**.
- **Alternative/trade-off:** making the batch atomic avoids partial state but wastes successful uploads and large transfer time.
- **Acceptance:** a six-file batch reports 5 succeeded/1 failed, names the failed file, does not duplicate successful items on retry, and preserves resumable chunks only for the failed item.
- **Keep unchanged:** signature validation and 24-hour resumable-upload retention.
- **Score:** 5 × 5 × 5 + 3 + 4 = **132**.

### F-04 — `RELIABILITY`: document conversion failure is hidden from the operator

- **User goal/persona:** a media operator converts a slide/PDF and confirms display readiness.
- **Reproduction:** upload `THREE-SLIDE.pdf`, open **Manage versions & impact**, request **Convert to slides**, wait, and reopen preview.
- **Observed:** the list initially says “Internet required,” conversion can only be discovered in a detail modal, no progress/failure appears in the row, and server logs report Poppler/PNG conversion failure. The later preview is black/unusable in the test browser.
- **Expected:** conversion stage, progress, failure, converter detail, and remediation are visible on the asset row; a failed output is never presented as ready.
- **Evidence/friction:** `MEDIA-006-pdf-detail.png`–`MEDIA-009-pdf-preview-after-wait.png`; server log contains invalid page-object/DPI conversion errors.
- **Smallest useful change:** add an explicit `Conversion failed` media state, persist a redacted converter error code/message, expose retry, and prevent failed derivatives from becoming preview-ready.
- **Alternative/trade-off:** automatic conversion is smoother but still needs a visible failure/retry path and may consume resources unexpectedly.
- **Acceptance:** deliberately failed conversion becomes visibly failed within one refresh cycle, includes the asset name and corrective action, produces no ready badge, and successful retry replaces the failure state.
- **Keep unchanged:** local conversion, sandboxing, original-file retention, and converter diagnostics.
- **Score:** 5 × 5 × 5 + 3 + 5 = **133**.

## High-priority workflow and comprehension findings

### F-05 — `RELIABILITY`: displayed automatic pairing PIN becomes stale

- **User goal/persona:** an App Admin pairs a display using the PIN currently visible on Screens.
- **Reproduction:** leave an authenticated admin tab open across a ten-minute PIN rotation, start a browser-player pairing request, and enter the displayed PIN.
- **Observed:** `297302` remained displayed but failed as incorrect; a fresh tab showed `997148`, which paired immediately.
- **Expected:** the PIN updates before expiry or visibly counts down and refreshes; a failed stale PIN explains that it rotated.
- **Evidence/friction:** `SCR-002-pairing-retains-name.png` plus before/after accessibility snapshots; one failed pairing and a reload were required.
- **Smallest useful change:** refresh pairing state on a timer and on page visibility/focus; show “changes in mm:ss.”
- **Alternative/trade-off:** a manual refresh button is simpler but still permits silent expiry.
- **Acceptance:** an open Screens page never displays an expired automatic PIN for more than one second; rotation updates without full reload; fixed PIN mode is unaffected.
- **Keep unchanged:** ten-minute automatic rotation and rate limiting.
- **Score:** 5 × 4 × 5 + 4 + 5 = **109**.

### F-06 — `COMPREHENSION`: offline controller state looks actionable and successful

- **User goal/persona:** a rushed volunteer chooses the correct room and knows whether a play command arrived.
- **Reproduction:** select an offline display, click **Play lesson from the beginning**, and wait more than four seconds.
- **Observed:** the page simultaneously shows `Offline`, `Ready`, stale remaining/finish values, a success toast (“Play sent”), and a status that remains `Sending play…` indefinitely. Playback controls stay enabled.
- **Expected:** offline state dominates, stale playback metrics are labeled, and the operator chooses explicitly whether to queue for reconnect or cancel.
- **Evidence/friction:** `CTL-003-universal-remote-desktop.png`, `CTL-004-offline-playback-feedback.png`, `CTL-005-offline-playback-stuck.png`.
- **Smallest useful change:** disable immediate-play controls while offline, replace success copy with `Queued for reconnect` only when intentional, and expire/cancel pending commands visibly.
- **Alternative/trade-off:** always queuing is useful for unattended displays, but it must be explicit and distinguish queued from received.
- **Acceptance:** no success acknowledgement appears until the target receives the command; offline targets show no fresh `Ready`/remaining state; a queued command has age, expiry, and cancel action.
- **Keep unchanged:** controller PIN, selected-screen selector, actual receipt acknowledgement, and local operation.
- **Score:** 5 × 3 × 5 + 4 + 5 = **84**.

### F-07 — `WORKFLOW`: successful media addition is not brought into context

- **User goal/persona:** a teacher adds a cue and immediately configures or reorders it.
- **Reproduction:** create/open a lesson, choose **Add media → Choose existing media**, and add one item at 1280×720.
- **Observed:** a toast confirms addition, but the view remains at the top and the new cue is below the fold.
- **Expected:** the new cue is visible, focused/highlighted, or reachable from the confirmation.
- **Evidence/friction:** `LES-002-add-media-chooser.png`, `LES-003-lesson-with-media.png`; one additional scroll/search is required after every add.
- **Smallest useful change:** scroll the new cue into view and briefly highlight it, respecting reduced motion; include `View cue` in the toast as a fallback.
- **Alternative/trade-off:** leaving scroll position unchanged protects context for bulk entry, so offer the link when multiple items are added.
- **Acceptance:** single-item add makes the cue visible and announces its section; keyboard focus lands on the new cue or an explicit `View cue` control.
- **Keep unchanged:** the four-choice media chooser and role-based lesson sections.
- **Score:** 3 × 4 × 5 + 5 + 2 = **67**.

### F-08 — `WORKFLOW`: signage save immediately changes screens without a review/undo boundary

- **User goal/persona:** a signage editor corrects a layout without accidentally changing live displays.
- **Reproduction:** open an existing sign/layout, edit content, and inspect the save bar and assignment view.
- **Observed:** copy states that layout changes apply to every Sign and that saving immediately updates assigned screens. There is no review diff, staged preview, timed undo, or rollback in this streamlined workflow.
- **Expected:** the operator sees affected screens and can review/undo the exact change before or immediately after it reaches live displays.
- **Evidence/friction:** `SIGN-002-studio-desktop-1280.png`, `SIGN-004-saved-layout.png`, `SIGN-006-signs-and-screens.png`.
- **Smallest useful change:** add an affected-screen summary and a short undo/version restore after `Save & update screens`; do not require a full publishing subsystem.
- **Alternative/trade-off:** a draft/publish model offers stronger governance but conflicts with the intentionally immediate Simple Signage workflow and adds steps.
- **Acceptance:** before save, the operator can see the number/names of affected screens; after save, the prior version can be restored in one action; no assignment changes silently.
- **Keep unchanged:** three-step Layouts → Playlists → Signs & screens model and immediate-update default.
- **Score:** 5 × 2 × 5 + 3 + 5 = **58**.

### F-09 — `COMPREHENSION`: pairing form reuses the display-name value as the PIN

- **User goal/persona:** a viewer pairs a browser display without reinterpreting the form.
- **Reproduction:** enter `QA-UIAUDIT-Projector`, click **Start pairing**, and inspect the PIN field.
- **Observed:** the field relabels to **Six-digit pairing PIN** but retains `QA-UIAUDIT-Projector` until replaced.
- **Expected:** a fresh, empty numeric PIN input with focus and six-digit guidance.
- **Evidence/friction:** `SCR-002-pairing-retains-name.png`; caused one moment of hesitation and makes the form appear broken.
- **Smallest useful change:** give the two forms keyed input nodes or explicitly reset the PIN input on step transition.
- **Alternative/trade-off:** a two-page route is clearer but unnecessary.
- **Acceptance:** the PIN field is empty, numeric, focused, and contains no prior display-name value after every pairing request.
- **Keep unchanged:** two-step pairing and displayed-name confirmation.
- **Score:** 3 × 3 × 5 + 5 + 3 = **53**.

### F-10 — `COMPREHENSION`: PDF readiness language conflicts with local conversion capability

- **User goal/persona:** a media operator decides whether an uploaded document is TV-ready.
- **Reproduction:** upload a PDF and inspect its row before opening details.
- **Observed:** the row says `Internet required` while a hidden detail action offers local slide conversion.
- **Expected:** `Needs slide conversion` with a direct Convert action, or automatic conversion with visible progress.
- **Evidence/friction:** `MEDIA-005-list-processing.png`, `MEDIA-006-pdf-detail.png`; one detail expansion and terminology translation are required.
- **Smallest useful change:** align the status vocabulary with the next available action and put that action on the row.
- **Alternative/trade-off:** automatic conversion is lower-friction but uses storage/CPU and should respect policy.
- **Acceptance:** every document row answers “can this play on TV now?” and provides the next local action without opening a modal.
- **Keep unchanged:** original document availability and local-first processing.
- **Score:** 4 × 4 × 5 + 4 + 4 = **92**.

## Visual and responsive findings

### F-11 — `VISUAL`: phone admin shell does not reflow into mobile navigation

- **User goal/persona:** a volunteer uses the controller or admin area from a phone.
- **Reproduction:** open the authenticated app at 390×844 and navigate to Controller/Audience.
- **Observed:** the complete desktop sidebar remains as a large block above content, its labels clip, and a horizontal scrollbar appears. The controller card itself fits once reached.
- **Expected:** a compact header/drawer or bottom navigation with no page-level horizontal scrolling.
- **Evidence/friction:** `CTL-002-controller-mobile.png`, `CTL-006-universal-remote-mobile.png`, `AUD-007-facilitator-live-result.png`.
- **Smallest useful change:** collapse the sidebar behind the existing menu affordance below a breakpoint and keep the controller header/status pinned.
- **Alternative/trade-off:** a controller-only standalone PWA avoids the admin shell but fragments navigation and role behavior.
- **Acceptance:** 320–480 px widths have no horizontal overflow; primary controller content is visible above the fold; opening/closing navigation preserves focus and selection.
- **Keep unchanged:** desktop sidebar grouping and controller card layout.
- **Score:** 4 × 5 × 5 + 3 + 3 = **106**.

### F-12 — `VISUAL`: sticky signage save bar obscures validation and nearby controls

- **User goal/persona:** a signage editor sees invalid content before saving live changes.
- **Reproduction:** edit a 1280×720 layout containing a weather element with no source and inspect the bottom of the preview.
- **Observed:** the sticky save bar covers/crops the validation area; at 720p the audience-dialog footer also slightly overlaps **Add question**.
- **Expected:** sticky actions reserve layout space and never cover validation or form actions.
- **Evidence/friction:** `SIGN-002-studio-desktop-1280.png`, `SIGN-003-new-layout.png`, `AUD-002-new-interaction.png`.
- **Smallest useful change:** add bottom padding equal to the sticky bar plus safe area and test all modal/editor heights at 720p.
- **Alternative/trade-off:** non-sticky actions remove overlap but make long editors slower.
- **Acceptance:** all validation text and final content controls remain fully visible and scrollable at 480p/720p with 200% zoom.
- **Keep unchanged:** persistent save access.
- **Score:** 3 × 2 × 5 + 5 + 3 = **38**.

### F-13 — `VISUAL`: dense media names lose identity in grid view

- **User goal/persona:** a media operator distinguishes similarly named files.
- **Reproduction:** open a populated media library in grid view with long filenames.
- **Observed:** names such as `Term A — bulk…` truncate early; list view is much clearer.
- **Expected:** enough visible title context to distinguish assets without opening each card.
- **Evidence/friction:** `MEDIA-001-library-desktop.png`, `MEDIA-005-list-processing.png`.
- **Smallest useful change:** allow two title lines plus a full-name tooltip/focus text; remember the operator’s list/grid choice.
- **Alternative/trade-off:** defaulting to list view increases density but reduces thumbnail emphasis.
- **Acceptance:** keyboard, hover, and touch users can reveal the complete filename; similarly prefixed items are distinguishable.
- **Keep unchanged:** grid/list choice and thumbnails.
- **Score:** 2 × 5 × 4 + 5 + 1 = **46**.

### F-14 — `VISUAL`: signage exposes two competing navigation systems

- **User goal/persona:** a signage editor leaves the studio for Screens or Dashboard.
- **Reproduction:** enter Signage at desktop width and click the visible app sidebar; then open the Signage **Menu** and choose the same destination.
- **Observed:** visible sidebar buttons did not navigate in repeated attempts, while the internal Signage menu worked. Both systems remain visible, creating a trap and duplicate navigation.
- **Expected:** one clear, operable navigation model at each viewport.
- **Evidence/friction:** `SIGN-002-studio-desktop-1280.png`; two failed sidebar clicks before discovering the secondary menu.
- **Smallest useful change:** either keep the app sidebar interactive and remove the duplicate menu at desktop, or make Signage truly full-screen and hide the underlying sidebar.
- **Alternative/trade-off:** retaining both can help small screens only if one is hidden by breakpoint and neither overlays the other.
- **Acceptance:** every visible navigation item is operable; desktop shows one primary nav; keyboard focus does not enter obscured controls.
- **Keep unchanged:** direct access to all main areas from Signage.
- **Score:** 4 × 2 × 5 + 4 + 3 = **47**.

### F-15 — `VISUAL`: new Audience modal is slightly clipped at 720p

- **User goal/persona:** a facilitator adds more questions in a short laptop viewport.
- **Reproduction:** open **New interaction** at 1280×720 and inspect the final question/add controls above the sticky footer.
- **Observed:** the footer visually crowds and partly clips the **Add question** area.
- **Expected:** final controls remain fully visible with a clear scroll boundary.
- **Evidence/friction:** `AUD-002-new-interaction.png`.
- **Smallest useful change:** reserve footer height in the modal body and add a subtle top shadow only when content scrolls beneath it.
- **Alternative/trade-off:** place actions inline after fields, which removes persistence on long forms.
- **Acceptance:** no overlap at 480p/720p or 200% zoom; keyboard users can tab to every question action while it is visible.
- **Keep unchanged:** persistent Save/Cancel actions.
- **Score:** 2 × 2 × 5 + 5 + 1 = **26**.

## Accessibility findings

### F-16 — `ACCESSIBILITY`: screen-purpose switches are removed from the accessibility tree

- **User goal/persona:** a keyboard or screen-reader App Admin changes **Signage only** or **Permanent pairing**.
- **Reproduction:** open Screens and inspect/traverse the screen cards without a pointer.
- **Observed:** the native checkbox inputs are styled with `display: none`, so the accessibility snapshot contains their text but no operable checkbox roles or states. The visible switch is 38×22 px.
- **Expected:** named checkbox/switch roles with checked state, focus ring, Space activation, and 44 px target.
- **Evidence/friction:** `SCR-001-screens-desktop.png` plus accessibility snapshot; controls are pointer-only.
- **Smallest useful change:** visually hide inputs with a screen-reader-safe technique instead of `display:none`, style `:focus-visible`, and enlarge the label hit area.
- **Alternative/trade-off:** ARIA `role=switch` on a button is valid but duplicates native behavior that already exists.
- **Acceptance:** both controls appear in the accessibility tree with names/states, work by Tab+Space, and meet 44×44 touch target guidance.
- **Keep unchanged:** compact switch visual and explanatory copy.
- **Score:** 4 × 3 × 5 + 5 + 4 = **69**.

### F-17 — `ACCESSIBILITY`: skip link does not transfer focus to main content

- **User goal/persona:** a keyboard user skips repeated navigation.
- **Reproduction:** load the dashboard, activate **Skip to main content** with Enter, and inspect active focus.
- **Observed:** the anchor remains active; `main#main-content` is not focused.
- **Expected:** focus moves to main and the next Tab continues within page content.
- **Evidence/friction:** accessibility snapshot and DOM-backed active-element check (`activeTag: A`, main not active).
- **Smallest useful change:** handle activation or hash change by focusing `main#main-content`, retaining `tabIndex=-1` and visible focus handling.
- **Alternative/trade-off:** place main first in DOM and use CSS layout, which is a larger shell refactor.
- **Acceptance:** Enter on the skip link focuses main in Chromium/Firefox/WebKit; the next Tab reaches the first page control; screen readers announce the main landmark.
- **Keep unchanged:** the visible-on-focus skip link.
- **Score:** 3 × 5 × 5 + 5 + 3 = **83**.

### F-18 — `ACCESSIBILITY`: post-add cue confirmation does not manage focus

- **User goal/persona:** a keyboard-only teacher adds and edits a cue.
- **Reproduction:** complete the existing-media chooser with keyboard interaction.
- **Observed:** the dialog closes and a live toast appears, but focus/context is not transferred to the new below-fold cue.
- **Expected:** focus lands on a safe cue heading/action or an announced **View cue** link.
- **Evidence/friction:** same journey as F-07, `LES-002`–`LES-003`.
- **Smallest useful change:** pair the F-07 scroll/highlight with deterministic focus and an `aria-live` addition summary.
- **Alternative/trade-off:** return focus to **Add media** for rapid repeated entry when batch mode is explicit.
- **Acceptance:** no keyboard trap; screen-reader announcement contains title and section; reduced-motion users receive no forced animation.
- **Keep unchanged:** modal focus containment and Escape behavior.
- **Score:** 3 × 3 × 4 + 5 + 2 = **43**.

### F-19 — `ACCESSIBILITY`: phone-width admin navigation lacks reflow/focus containment

- **User goal/persona:** a touch, zoom, or assistive-technology user reaches Controller quickly on a phone.
- **Reproduction:** open authenticated admin at 390×844; traverse the sidebar and main.
- **Observed:** the full sidebar precedes the controller, creates horizontal scrolling, and makes primary content require a long traversal. Labels clip visually.
- **Expected:** one menu button, a focus-contained drawer when open, and direct access to the main controller.
- **Evidence/friction:** `CTL-002`, `CTL-006`, `AUD-007`.
- **Smallest useful change:** same responsive shell fix as F-11, including focus return, Escape close, inert background, and landmark naming.
- **Alternative/trade-off:** hiding lower-priority links reduces clutter but must not remove authorized destinations.
- **Acceptance:** no two-dimensional scrolling at 200% zoom; menu opens/closes by keyboard and touch; focus cannot escape an open drawer.
- **Keep unchanged:** role-filtered navigation contents.
- **Score:** 4 × 5 × 5 + 3 + 3 = **106**.

### F-20 — `ACCESSIBILITY`: Android TV hardware coverage remains emulator-only

- **User goal/persona:** a viewer uses a physical Google TV/Fire TV remote in a venue.
- **Reproduction:** run current connected instrumentation and D-pad key paths on the configured Android TV emulator.
- **Observed:** emulator focus/navigation coverage exists; physical overscan, vendor key mapping, HDMI/audio behavior, thermal/network conditions, and remote feel cannot be established here.
- **Expected:** emulator pass plus a small physical-device matrix before release.
- **Evidence/friction:** Android connected-test report; limitation rather than a reproduced app defect.
- **Smallest useful change:** make physical smoke results a release checklist artifact, not an application feature.
- **Alternative/trade-off:** cloud device labs improve breadth but do not represent HDMI/remote/venue networking.
- **Acceptance:** at least one Google TV and one Fire TV complete pair, browse, play/pause/seek/next/back, offline-cache, reconnect, and signage smoke checks.
- **Keep unchanged:** emulator instrumentation as fast regression coverage.
- **Score:** 4 × 3 × 4 + 3 + 4 = **55**.

## Additional observed findings

### F-21 — `WORKFLOW`: successful authentication does not reliably leave the form

- **User goal/persona:** a Service Admin signs in and reaches the dashboard.
- **Reproduction:** start on the registration surface, choose **Back to sign in**, enter valid credentials, and submit.
- **Observed:** authentication succeeded, but the login form remained visible until `/` was loaded/reloaded; the refreshed dashboard proved the session existed.
- **Expected:** immediate navigation to the first authorized page plus an announced signed-in state.
- **Evidence/friction:** `AUTH-001-login-desktop.png`, `DASH-001-dashboard-desktop.png`; one manual reload and uncertainty about whether the submit succeeded.
- **Smallest useful change:** handle successful auth by replacing the auth route/history entry with the dashboard and focusing its heading.
- **Alternative/trade-off:** a short success interstitial can reassure users but adds delay and is unnecessary if navigation is reliable.
- **Acceptance:** one valid submit reaches the dashboard without reload; Back does not reveal a usable authenticated login form; errors retain the entered username and focus the message.
- **Keep unchanged:** current error copy, local account model, and role-based landing content.
- **Score:** 4 × 5 × 4 + 4 + 3 = **87**.

### F-22 — `DELIGHT`: successful toasts do not help the operator find off-screen results

- **User goal/persona:** a teacher/operator continues immediately after a successful action.
- **Reproduction:** add media to a lesson or send an action whose result is outside the current viewport.
- **Observed:** concise live toasts confirm success, but the operator must search/scroll for the affected object.
- **Expected:** success remains brief while offering one contextual next action when location is ambiguous.
- **Evidence/friction:** `LES-003-lesson-with-media.png`, `CTL-004-offline-playback-feedback.png`; at least one avoidable scroll/search.
- **Smallest useful change:** allow toasts to include one optional action such as **View cue**, **Retry failed**, or **Open screen**.
- **Alternative/trade-off:** automatic navigation is stronger but can destroy the user’s context during bulk work.
- **Acceptance:** actionable toasts remain keyboard reachable, do not steal focus, expire accessibly, and the action reveals the exact affected object.
- **Keep unchanged:** short plain-language confirmation and dismiss control.
- **Score:** 2 × 5 × 4 + 5 + 1 = **46**.

### F-23 — `COMPREHENSION`: assignment relationships are split across product areas

- **User goal/persona:** a teacher or signage editor confirms where content will play.
- **Reproduction:** create/open a lesson, inspect Screens, then inspect Signage Signs & screens.
- **Observed:** each page explains its local object, but the full class/lesson/screen and layout/playlist/Sign/screen chain requires backtracking across pages.
- **Expected:** a compact summary answers “what content, where, and when?” without replacing the dedicated editors.
- **Evidence/friction:** `LES-001`–`LES-003`, `SCR-001`, `SIGN-006`; three product areas were needed to reconstruct assignment.
- **Smallest useful change:** add a shared read-only **Plays where** summary with direct links on lesson and Sign detail views.
- **Alternative/trade-off:** a global topology screen is powerful but adds a new information architecture surface without evidence it is needed.
- **Acceptance:** a lesson shows its class and assigned screens; a Sign shows layout, playlists, and assigned screens; stale/missing links are explicit.
- **Keep unchanged:** current object names and dedicated assignment controls until user terminology research supports change.
- **Score:** 4 × 4 × 4 + 3 + 4 = **71**.

### F-24 — `FEATURE`: first-run readiness is not consolidated

- **User goal/persona:** a Service Admin knows what is safe to use before setup is complete.
- **Reproduction:** inspect Dashboard, Settings, Media & storage, Connections & pairing, and Screens for storage/converter/hostname/update/display readiness.
- **Observed:** the information exists, but it is distributed; the current seeded VM could not reproduce the truly unconfigured state.
- **Expected:** only if clean-install testing confirms the need, one checklist links directly to failed prerequisites and disappears or collapses once ready.
- **Evidence/friction:** `DASH-001`, `SET-001`–`SET-003`, `SCR-001`; several page changes were required. Confidence is intentionally reduced because clean first-run was not available.
- **Smallest useful change:** first run a zero-state study; then add a dismissible readiness card using existing health data, not a new setup wizard.
- **Alternative/trade-off:** a forced wizard prevents missed steps but can block safe local tasks and is not yet justified.
- **Acceptance:** each failed check names consequence and links to the exact fix; completion updates without reload; experienced users can dismiss/reopen it.
- **Keep unchanged:** dashboard quick actions and local-first operation before optional integrations are configured.
- **Score:** 4 × 2 × 3 + 2 + 5 = **31**.

### F-25 — `DEFECT`: recycled class leaves its edit dialog over another class

- **User goal/persona:** a teacher deletes a test/obsolete class and safely continues with a remaining class.
- **Reproduction:** open **Edit class** for `QA-UIAUDIT-Room-A`, move it and its lesson to the recycling bin, and inspect the resulting page.
- **Observed:** the class disappeared and `Bulk Destination` became selected, but the modal remained open with the deleted class’s name, description, and color.
- **Expected:** successful deletion closes and clears the editor before a valid remaining class is selected.
- **Evidence/friction:** `LES-004-deleted-class-dialog-stale.png`; stale deleted values remain editable over a different class context.
- **Smallest useful change:** clear the edit object and close the dialog in the successful delete path before refreshing/selecting a fallback class.
- **Alternative/trade-off:** navigate to a neutral no-selection page; safer but less convenient when another class exists.
- **Acceptance:** deletion closes the dialog, selects a valid remaining class, no removed values remain in the DOM, and reopening Edit shows only the selected class.
- **Keep unchanged:** 30-day recoverability and the confirmation describing lesson impact.
- **Score:** 4 × 3 × 5 + 5 + 3 = **68**.

## Ranked recommendation queue

The formula is `(Impact × Reach × Confidence) + Effort + Risk reduction`; a higher Effort value means the change is more feasible as a focused fix.

| Rank | ID | Category | Recommendation | I | R | C | E | RR | Score |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | F-01 | ACCESSIBILITY | Make the public audience page responsive and touch/keyboard ready | 5 | 5 | 5 | 4 | 5 | 134 |
| 2 | F-04 | RELIABILITY | Surface conversion failure and block false-ready derivatives | 5 | 5 | 5 | 3 | 5 | 133 |
| 3 | F-03 | RELIABILITY | Add per-file upload preflight/results and failed-only retry | 5 | 5 | 5 | 3 | 4 | 132 |
| 4 | F-02 | DEFECT | Repair and harden audience moderation | 5 | 4 | 5 | 4 | 5 | 109 |
| 5 | F-05 | RELIABILITY | Refresh/count down automatic pairing PINs | 5 | 4 | 5 | 4 | 5 | 109 |
| 6 | F-11 | VISUAL | Replace phone-width desktop sidebar with a compact navigation pattern | 4 | 5 | 5 | 3 | 3 | 106 |
| 7 | F-19 | ACCESSIBILITY | Add mobile reflow, drawer focus containment, and zoom-safe navigation | 4 | 5 | 5 | 3 | 3 | 106 |
| 8 | F-10 | COMPREHENSION | Make document status name the next local action | 4 | 4 | 5 | 4 | 4 | 92 |
| 9 | F-21 | WORKFLOW | Navigate immediately after successful authentication | 4 | 5 | 4 | 4 | 3 | 87 |
| 10 | F-06 | COMPREHENSION | Make offline/queued/received controller states honest | 5 | 3 | 5 | 4 | 5 | 84 |
| 11 | F-17 | ACCESSIBILITY | Move focus when skip link is activated | 3 | 5 | 5 | 5 | 3 | 83 |
| 12 | F-23 | COMPREHENSION | Add “Plays where” assignment summaries | 4 | 4 | 4 | 3 | 4 | 71 |
| 13 | F-16 | ACCESSIBILITY | Restore native switch semantics/focus/touch size | 4 | 3 | 5 | 5 | 4 | 69 |
| 14 | F-25 | DEFECT | Close and clear a class editor after recycling the class | 4 | 3 | 5 | 5 | 3 | 68 |
| 15 | F-07 | WORKFLOW | Reveal and focus a newly added lesson cue | 3 | 4 | 5 | 5 | 2 | 67 |
| 16 | F-08 | WORKFLOW | Add affected-screen review and undo to immediate signage save | 5 | 2 | 5 | 3 | 5 | 58 |
| 17 | F-20 | ACCESSIBILITY | Add physical Google TV/Fire TV release smoke evidence | 4 | 3 | 4 | 3 | 4 | 55 |
| 18 | F-09 | COMPREHENSION | Clear and refocus the pairing PIN field | 3 | 3 | 5 | 5 | 3 | 53 |
| 19 | F-14 | VISUAL | Remove competing/blocked Signage navigation | 4 | 2 | 5 | 4 | 3 | 47 |
| 20 | F-13 | VISUAL | Preserve full media identity in grid view | 2 | 5 | 4 | 5 | 1 | 46 |
| 21 | F-22 | DELIGHT | Add one contextual action to off-screen success toasts | 2 | 5 | 4 | 5 | 1 | 46 |
| 22 | F-18 | ACCESSIBILITY | Transfer/offer focus after adding a cue | 3 | 3 | 4 | 5 | 2 | 43 |
| 23 | F-12 | VISUAL | Reserve space for sticky actions and validation | 3 | 2 | 5 | 5 | 3 | 38 |
| 24 | F-24 | FEATURE | Validate and then add first-run readiness guidance | 4 | 2 | 3 | 2 | 5 | 31 |
| 25 | F-15 | VISUAL | Prevent Audience modal footer overlap | 2 | 2 | 5 | 5 | 1 | 26 |

## Top five sets

### Workflow

1. Per-file upload review, outcome, and failed-only retry (F-03).
2. Honest offline command queue/receipt behavior (F-06).
3. Bring a newly added cue into view and focus (F-07/F-18).
4. Show affected screens and provide undo for immediate signage updates (F-08).
5. Complete authentication navigation on success (F-21).

### Intuitiveness and comprehension

1. Keep the visible pairing PIN current and show its expiry (F-05).
2. Replace contradictory `Offline` + `Ready` + `sent` states with one command-state model (F-06).
3. Rename PDF state around the required local action (F-10).
4. Clear the relabeled pairing input between steps (F-09).
5. Add “Plays where” summaries across lesson, screen, and Signage assignment boundaries (F-23).

### Visual and polish

1. Finish the public audience page (F-01).
2. Reflow the phone admin shell (F-11).
3. Prevent sticky action bars from covering content (F-12/F-15).
4. Preserve full media names in grid view (F-13).
5. Present one operable Signage navigation system (F-14).

### Accessibility

1. Responsive/touch/focus treatment for the public audience page (F-01).
2. Accessible mobile navigation and zoom reflow (F-19).
3. Native switch semantics and keyboard operation on Screens (F-16).
4. Working skip-to-main focus transfer (F-17).
5. Deterministic focus after adding lesson media and physical remote validation (F-18/F-20).

## New feature proposals tied to observed demand

1. **Upload review center:** not a generic job dashboard; a batch-scoped page showing each selected file, validation, transfer, conversion, derivative readiness, and failed-only retry. Demand: F-03/F-04.
2. **Command receipt ledger:** last command, target, queued/sent/received/applied/expired state, and cancel where safe. Demand: F-06 and live-use confidence.
3. **Signage version restore:** a short version history with affected screens and one-click rollback, while retaining immediate updates. Demand: F-08.
4. **Assignment summary:** a reusable “Plays where” component linking classroom → lesson → screen and layout + playlist → Sign → screens. Demand: F-23.
5. **First-run readiness assistant:** build only after a clean-install observation confirms the exact missing states. Demand: partial Service Admin journey/F-24.

## Terminology and information architecture

- Keep **Class** for the organizational teaching container only if a class can span rooms; otherwise user testing should compare **Room/Classroom**. Do not rename from one audit.
- Use **Screen** consistently for a paired endpoint and **display** as plain-language explanatory copy. The current pairing page says “display,” while admin uses “Screen”; a one-line relationship is enough.
- Preserve the clear Signage model: **Layout** is the persistent frame, **Playlist** is looping content, and **Sign** combines them and owns screen assignment.
- Reserve **Ready** for current playable/readiness state. Never show it as the dominant state on an offline endpoint without a qualifier such as `Last reported ready`.
- Reserve **Sent**, **Received**, and **Applied** as distinct command stages. Avoid a success toast for a merely queued command.
- Use **Save & update screens** consistently for immediate Signage behavior, supplemented by affected-screen count and undo; do not introduce **Publish** unless the product intentionally adopts a staged model.

## Known requested work verified, not counted as new

- Every inspected Settings panel has a clear top-right **Minimize/Maximize** control.
- Registration, Email settings, and Registration codes are separate sections.
- Authenticator MFA and Preview Features are side by side at desktop width.
- Storage Allocation and Adaptive TV Playback are side by side beneath Upload Limits.
- Collapse state remains understandable while navigating between Settings sections. It resets after a full browser reload; this was not treated as a release defect because the requirement did not explicitly demand durable persistence.

## NOT RUN, BLOCKED, and limitations

- **NOT RUN:** destructive first-run reset/onboarding on a truly unconfigured server. The disposable VM already contained organization, users, media, classes, screens, and settings.
- **NOT RUN:** oversize-file limit due the cost of generating/transferring a limit-sized fixture during a UI-only pass.
- **NOT RUN:** an actual network-disconnected resumable upload and cancellation from the dialog. Durable backend behavior was covered previously, but it is not claimed as visual evidence here.
- **INCONCLUSIVE:** PDF pixels in the in-app browser because Chromium’s embedded PDF handling and the deliberately tiny malformed fixture can affect the black preview. The server-side conversion failure and absent UI failure state are conclusive.
- **BLOCKED:** physical TV/remote, HDMI, overscan, CEC, venue audio, vendor codec, and real Wi-Fi recovery checks. Emulator evidence cannot replace these.
- **NOT RUN:** QR scanability using a physical phone camera at distance, portrait/ultrawide physical Signage output, screen screenshot/proof-of-play, backup restore, support export, high concurrency, or public-network/privacy testing.
- **LIMITATION:** touch was approximated with a phone viewport and pointer; no mobile screen reader was attached.
- **LIMITATION:** the test account was an existing disposable Service Admin rather than a newly created zero-knowledge account.
- **RECOVERED TEST-INFRASTRUCTURE FAILURE:** the Android emulator package installer stalled on the first combined connected-test run. The emulator was rebooted and the two flavors then passed independently. This was not classified as a LessonCue defect.

## Synthetic-state cleanup

- The run-owned browser display was unpaired and revoked.
- The run-owned Audience session and Signage layout were permanently deleted.
- The run-owned class and lesson, and the five successfully uploaded fixtures, were moved to the 30-day recycling bin so they remain recoverable without purging unrelated user state.
- The universal-controller PIN was deliberately rotated to a disposable audit value so the complete remote journey could be exercised; the value is not recorded in this report.

## Do not build yet

- Do not rename Classes/Rooms/Screens/Displays based on this single expert audit; run terminology tests with teachers and venue operators first.
- Do not replace immediate Signage saves with a full enterprise draft/publish workflow before testing the smaller affected-screen preview + undo solution.
- Do not add AI-generated layouts, content recommendations, analytics, cloud sync, or collaboration; no observed journey required them.
- Do not add a global job center until the upload/conversion batch view proves that cross-job navigation is necessary.
- Do not promise portrait/ultrawide parity until those outputs are exercised on real displays.

## Prioritized implementation TODO

### P0 — release blockers

- [x] Style and accessibility-test the public audience response/results page at 320/390/480/720/1080 px and phone reflow (F-01).
- [x] Send moderation status, harden server validation, and integration-test approval plus invalid input without a server error (F-02).
- [x] Add named per-file upload preflight/results and failed-only retry without duplicate successful items (F-03).
- [x] Persist and display conversion failure; validate generated slides and prevent failed derivatives from appearing ready (F-04).

### P1 — live-operation confidence

- [x] Refresh/count down the automatic pairing PIN and use a fresh input after the pairing step changes (F-05/F-09).
- [x] Disable offline commands, never silently queue them, and distinguish sending, received, failed, and expired-without-receipt states (F-06).
- [x] Replace phone-width sidebar overflow with an accessible drawer and preserve fast Controller access (F-11/F-19).
- [x] Fix post-authentication navigation (F-21).
- [x] Align PDF/document status and row action with local converter behavior (F-10).
- [x] Restore keyboard/screen-reader semantics for screen switches (F-16).
- [x] Make skip-to-main transfer focus (F-17).
- [x] Close and clear the class editor after recycling the edited class (F-25).

### P2 — workflow refinement

- [x] Reveal/focus newly added lesson cues and announce section/title (F-07/F-18/F-22).
- [x] Add affected-screen review and short undo/version restore to immediate Signage saves (F-08).
- [x] Clear the PIN input between browser-display pairing steps (F-09).
- [x] Remove duplicate/blocked desktop Signage navigation (F-14).
- [x] Reserve sticky-bar space in Signage and Audience forms (F-12/F-15).
- [x] Preserve complete media names in grid view and remember grid/list choice (F-13).
- [x] Add “Plays where” summaries at lesson and Sign assignment boundaries (F-23).

### P3 — evidence and product validation

- [ ] Run a clean-install first-use session before specifying the readiness assistant (F-24).
- [ ] Run physical Google TV and Fire TV remote/HDMI/audio/network smoke checks (F-20).
- [ ] Run physical QR-distance and Signage 480p/720p/1080p/portrait/ultrawide comparison captures.
- [ ] Repeat the primary journeys with keyboard-only, desktop screen reader, mobile screen reader, 200% zoom, reduced motion, and real touch.
