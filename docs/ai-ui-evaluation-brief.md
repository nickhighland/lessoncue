# AI user-centered UI evaluation brief

Use this brief when evaluating LessonCue as a real user. The goal is not merely to confirm that controls work. The goal is to discover where a new operator would hesitate, misunderstand the product, take an unnecessarily long route, make a risky mistake, or feel that the interface is visually unfinished.

This is an evaluation brief, not permission to invent a redesign from personal taste. Every recommendation must be grounded in an observed journey, screenshot, recording, timing, accessibility-tree observation, repeated pattern, or a clearly documented product requirement.

## 1. Scope and known requirements

Evaluate the browser administration app, browser player, signage editor/player, controller, audience flow, upload/conversion flow, lesson/classroom workflow, and Android TV display experience. Include desktop, phone-sized, 480p/720p/1080p display-sized, keyboard, touch, and Android TV D-pad/remote interaction where the environment supports them.

The following Settings changes are already requested requirements. Verify them, but do not present them as novel recommendations:

- every Settings panel can be collapsed or expanded from a clear top-right control, with state that remains understandable after navigation;
- Registration, Email Settings, and Registration Codes are separate sections;
- Authenticator MFA is beside Preview Features;
- Adaptive TV Playback is beside Storage Allocation, beneath Upload Limits.

Do not let those known requirements crowd out new findings about workflow, clarity, accessibility, or visual quality elsewhere in the product.

## 2. Operate as a user, not as a code reviewer

Begin with a clean, disposable account and no prior knowledge of the implementation. Read only the minimum help text a normal operator would see. Use visible controls and normal navigation first; do not call an API to skip a UI step unless the journey explicitly requires API corroboration.

Act through these personas and state the persona before each journey:

1. Service Admin installing and preparing a new site.
2. App Admin configuring accounts, settings, storage, converters, and displays.
3. Teacher planning a lesson for a specific classroom and date.
4. Media operator uploading mixed files and resolving a failed conversion.
5. Volunteer running a lesson under time pressure from a phone controller.
6. Viewer using a classroom TV and a D-pad or remote.
7. Audience participant joining a poll by QR code and submitting a response.
8. Signage editor creating, previewing, scheduling, and publishing a layout.

For each persona, complete at least one normal journey, one interrupted/error journey, and one recovery or repeat journey. Do not assume a route is intuitive because the source code or documentation makes it obvious.

## 3. Required real-use journeys

Run the smallest complete version of each journey below, then repeat the most important one with a different viewport or input method.

### First-run readiness

- Find the next useful action from the dashboard without coaching.
- Confirm storage, converter, hostname, pairing, update, and display readiness.
- Determine what is safe to do before setup is complete.
- Recover from a missing prerequisite and verify that the error explains how to fix it.

### Lesson and classroom workflow

- Create or choose a classroom, create a lesson, add media, arrange cues, and schedule it.
- Assign it to a screen, pair or select the target, and confirm what will play.
- Distinguish clearly between saving a draft, presenting now, scheduling, duplicating, archiving, and deleting.
- Return later and edit the lesson without losing context, timing, notes, or assignments.

### Media and uploads

- Upload a ready video, an image, a document/slide deck, an audio file, and a file requiring conversion.
- Observe preflight validation, progress, queue position, processing status, retry, cancellation, and final playback readiness.
- Intentionally use a bad extension, mismatched signature, unsupported codec, oversized file, and interrupted upload.
- Decide whether the error is actionable without reading logs or source code.

### Controller and TV

- Select the correct room and display from a phone-sized controller.
- Start, pause, resume, seek, skip, stop, and choose a specific cue.
- Repeat the task with keyboard arrows, Enter, Escape/Back, and Android TV D-pad input.
- Verify that the selected room, current item, next item, command acknowledgement, connection state, and dangerous actions are unmistakable.

### Audience interaction

- Start from the empty Audience page and create a poll without prior instructions.
- Open it, share/copy/download the QR code, join as a participant, submit a choice and written response, moderate it, and close the session.
- Verify that the facilitator always knows whether the poll is draft, open, receiving responses, moderated, or closed.
- Test the no-session, no-response, duplicate-response, invalid-response, and network-recovery states.

### Signage

- Create a layout using text, image, video, QR/Wi-Fi, data, and unsupported/invalid content where available.
- Preview it at 480p, 720p, 1080p, portrait, ultrawide, and phone-sized widths.
- Check for clipping, overflow, unreadable contrast, bad line breaks, poor safe-area margins, stale data, QR scanability, and mismatches between browser preview and TV output.
- Save a draft, preview it, publish it, schedule it, replace it, and recover from an invalid or unavailable media item.

### Settings, recovery, and support

- Find a setting without relying on exact page knowledge.
- Collapse and reopen sections, change a value, cancel, save, reload, and verify persistence.
- Trigger a safe validation error and determine whether the field, consequence, and recovery are clear.
- Find system health, backup, update, storage, converter, and screen diagnostics, then export a redacted support bundle if available.

## 4. Observe these things during every journey

Record exact evidence rather than general impressions:

- first visible next action and time to first meaningful action;
- total steps, clicks/taps/keypresses, page changes, waits, repeated entry, and backtracking;
- hesitation, wrong turns, abandoned actions, accidental activation, and requests for clarification;
- terms that do not match the user’s mental model, especially for rooms/classes, screens/displays, signs/layouts/playlists, save/publish/push, and cached/ready/offline;
- whether the interface explains what is happening, how long it may take, and what to do next;
- whether destructive, cross-room, irreversible, or public actions have a clear preview and safe confirmation;
- visual hierarchy, whitespace, alignment, density, typography, color meaning, contrast, empty states, disabled states, loading states, and error states;
- consistency of buttons, dialogs, tables, filters, breadcrumbs, status badges, keyboard behavior, and terminology across pages;
- whether the same task remains usable at 480p, 720p, desktop, phone width, zoomed text, keyboard-only input, screen reader semantics, touch, and D-pad/remote input;
- whether a rushed volunteer can tell what is playing, what comes next, which room is controlled, and whether the command arrived.

Use a stopwatch or browser timestamps for waits. Save screenshots before and after important actions. Capture the accessibility tree and console/network evidence when the visible result is ambiguous. Never use a passing HTTP response as proof that the screen looks correct.

## 5. Classify findings before proposing changes

Each finding must be exactly one of:

- `DEFECT` — promised or reasonable behavior is broken;
- `WORKFLOW` — the task works but is too long, repetitive, or difficult to recover;
- `COMPREHENSION` — labels, grouping, status, or consequences are unclear;
- `ACCESSIBILITY` — keyboard, screen reader, touch, zoom, contrast, motion, or remote use is disadvantaged;
- `VISUAL` — hierarchy, spacing, alignment, density, responsive layout, or polish is weak;
- `RELIABILITY` — behavior is intermittent, slow, stale, or resource-sensitive;
- `FEATURE` — a new capability would remove a validated user limitation;
- `DELIGHT` — a small refinement would make a successful workflow feel clearer or more reassuring.

Before proposing a feature, test whether clearer copy, grouping, defaults, progressive disclosure, inline help, a preview, or a better empty state solves the problem. Prefer the smallest useful change that preserves local-first privacy and live reliability.

## 6. Recommendation scoring and acceptance criteria

Score every recommendation from 1–5 for:

| Dimension | Question |
| --- | --- |
| Impact | Does it unblock or materially improve a real task? |
| Reach | How many personas and events encounter it? |
| Confidence | Was it directly observed and reproduced? |
| Effort | Can a focused change solve it without broad risk? |
| Risk reduction | Does it prevent wrong-room actions, data loss, privacy mistakes, or live failure? |

Rank recommendations with the score `(impact × reach × confidence) + effort + risk reduction`, and explain the score. Every recommendation must include:

1. user goal and affected persona;
2. exact reproduction steps;
3. observed versus expected experience;
4. evidence links and measured friction;
5. smallest useful change;
6. alternatives and trade-offs;
7. testable acceptance criteria;
8. what should remain unchanged.

## 7. Required final report

Produce a report with:

- an executive summary stating whether the UI is ready for the tested journeys;
- a journey table with persona, viewport/input, time, step count, result, and evidence;
- release-blocking defects and workflow risks first;
- the top five workflow improvements;
- the top five intuitiveness/comprehension improvements;
- the top five visual/polish improvements;
- the top five accessibility improvements;
- new feature proposals, each tied to observed demand;
- terminology and information-architecture recommendations;
- a “do not build yet” section for ideas without enough evidence;
- a list of known requested work verified but not counted as new recommendations;
- explicit `NOT RUN`, `BLOCKED`, and hardware limitations;
- a prioritized implementation TODO list suitable for copying into `docs/feature-roadmap.md`.

Do not hide a recovered failure. Report it as a failure or reliability finding, preserve the first-failure evidence, and only then retry. Do not implement code changes during the initial evaluation unless the owner explicitly asks for implementation. If implementation is authorized, make one coherent batch, rerun the affected journeys, and compare before/after screenshots and timings.

## 8. Suggested prompt to give the advanced Codex

```text
Evaluate LessonCue as a real user on the disposable QA installation. Read
docs/ai-ui-evaluation-brief.md, docs/ai-real-use-stress-test-playbook.md, and
the current feature roadmap before starting. Do not begin with source code or
personal design preferences. Use the visible UI first, as a first-time Service
Admin, teacher, media operator, volunteer controller, viewer, audience member,
and signage editor.

Complete the required journeys across desktop, phone-sized, 480p/720p/1080p,
keyboard, touch, and Android TV D-pad where available. Measure time, steps,
waits, backtracking, wrong turns, terminology confusion, error recovery,
visual hierarchy, responsive behavior, accessibility, and live-use confidence.
Capture screenshots and other direct evidence before inspecting source. Separate
defects from workflow friction, comprehension, accessibility, visual polish,
reliability, features, and delight. Verify the already-requested Settings layout
requirements, but do not count them as new ideas.

For every recommendation, include the affected persona, exact reproduction,
evidence, measured impact, priority score, smallest useful change, trade-offs,
and acceptance criteria. Prefer copy, grouping, defaults, progressive disclosure,
and previews before adding features. Preserve local-first privacy and predictable
TV/controller behavior. Include the top workflow, intuitiveness, visual,
accessibility, and feature recommendations, plus ideas that should not be built
yet. Do not modify code during the audit. Finish with a prioritized TODO list;
only implement after the owner approves the findings.
```
