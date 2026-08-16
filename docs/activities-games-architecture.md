# LessonCue Activities and Games

This document describes the Activities/Games architecture in the current LessonCue build. It is intentionally an extension of the existing Activities feature, not a second game system.

The implementation backlog is maintained in [Activities & Games TODO](activities-games-todo.md). Keep that list ordered by dependency and product value; update this architecture document when shared contracts or engine boundaries change.

## Product boundary

Activities remain reusable teacher-authored definitions. A definition can be selected in the Activities library, inserted into a lesson as an `activity` playlist item, or launched directly. A live play session is represented by the existing `ActivityRun`; the run is the runtime/session boundary and is never the same thing as the reusable definition.

The existing Activity selector, `/api/v1/activities` routes, `/api/v1/activity-runs` routes, `ActivityDisplay`, `ActivityController`, lesson `PlaylistItem.ActivityDefinitionId`, and web-player activity cue are the authoritative entry points. New game capabilities extend those pieces.

## Teacher workflow

The teacher-facing path stays deliberately short:

1. Open **Activities Studio** and choose a preset such as Trivia, Read the Room, Buzzer Battle, Punchline, Fake Out, Survey Showdown, Doodle & Guess, Order Up, Word Storm, Match Minds, Mystery Image, or Beat the Clock.
2. Enter the questions, prompts, clues, or survey answers. The editor provides sensible defaults and keeps advanced rules optional.
3. Save the reusable activity. It can be duplicated, edited, archived, previewed, inserted into a lesson, or launched directly.
4. When the activity is live, the host panel shows a QR code and short join code. Participants open `/play/{code}` in a phone browser; no LessonCue account is required.
5. Start the round from the host controls. Phones change input automatically as the server moves through answer, voting, judging, reveal, and leaderboard phases.

The host can pause, reopen or lock a response window, reveal or hide results, moderate anonymous responses, create or assign teams, adjust or undo score events, remove a participant, skip a round, and end the session. The display remains a spectator surface; all authoritative controls stay in the host view.

Content counts are part of the definition, not a hidden runtime assumption. Editors expose add/remove controls for their questions, rounds, choices, answers, prompts, entries, teams, boxes, challenges, and ordering items. Safe minimums are shown in the editor and validated again on the server, while practical maximums prevent an accidentally unmanageable activity. Multiple-choice content is intentionally variable (2–8 choices); four is only a default example.

For anonymous creative games, responses are held for host approval by default. The reusable definition persists, while participant names, responses, votes, and score events belong to the live run and are intended for short-lived session retention.

## Current inventory

| Area | Current implementation | Decision |
| --- | --- | --- |
| Activity library | `web-admin/src/activities/ActivityLibrary.tsx` and `activityRegistry.ts` | Keep as the single selector. It now provides persistent grid/list views, search and capability filters, favorites, thumbnails, multi-select/bulk actions, archived recovery, and manual ordering backed by `LibraryPosition`; registry metadata will continue to grow for categories, modes, requirements, and presets. |
| Definitions | `ActivityDefinition` with `Type`, `ConfigJson`, `ThemeJson`, assets, version, archive state | Keep for backward compatibility. New definitions add engine/preset metadata without requiring old definitions to be rewritten. |
| Live state | `ActivityRun.StateJson`, revision, status, lesson/lesson-item scope | Keep as the live session store. Add session snapshot and participant/team lifecycle around it. |
| Activity runtime | `ActivityService` reducer dispatch and per-run lock | Keep existing reducers working. New engines use an explicit shared engine contract and the same run command/broadcast path. |
| Host | `ActivityController` and registry controller components | Keep the existing host surface. Add contextual lobby, participant, team, phase, moderation, and scoring controls. |
| Display | `ActivityDisplay`, `WebPlayer`, and the activity SignalR hub | Keep one public display protocol. Browser/projector and TV web playback consume the same role-safe display state. |
| Participants | Audience Interaction has anonymous QR joining, tokenized responses, moderation, and retention | Reuse its privacy and validation patterns. Game sessions use their own activity participant records because games need identity, reconnect, teams, buzzers, and per-round input. |
| Real time | `ActivityHub` broadcasts `ReceiveState` to `run:{id}` | Keep SignalR. State changes, joins, buzzes, votes, scoreboard updates, and reconnect snapshots use this channel. |
| Lesson integration | `PlaylistItem.ActivityDefinitionId` and the web player activity cue | Preserve semantics. Inserting a definition does not duplicate it; the live run gets a snapshot when created. |
| Persistence | SQLite/EF models plus idempotent `DatabaseUpgrade` SQL | Add normalized lifecycle records for participants, teams, score events, submissions, and votes. Engine-specific content/state remains versioned JSON. |
| Scoring | Existing activity-specific score fields/reducers | Add shared event-based score records, retaining old reducer behavior where needed. |
| Media | Existing `MediaAsset` and activity assets/playback URLs | Reuse media storage and playback. Reveal transformations are presentation state, not new derivative files. |
| Tests | Activity reducer/service tests, Audience tests, protocol tests, browser workflow/accessibility tests | Extend these suites with engine, projection, reconnect, concurrency, and end-to-end activity coverage. |
| Rich interaction slices | `RichInteractionGames.tsx`, `ActivityParticipant.tsx`, and the shared session reducers | Drawing uses bounded normalized vector strokes; Ordering uses an accessible move-list and partial position scoring; Word Storm uses moderated normalized words and a reusable cloud projection. |

## Definition versus session

`ActivityDefinition` is teacher-authored and reusable. Its existing `ConfigJson` remains the compatibility content field. The extension treats the following concepts as definition metadata:

- `engineType`: reusable runtime family, such as `quiz`, `poll`, `buzzer`, `creative`, `bluff`, or `survey`.
- `presetType`: teacher-facing named experience, such as `trivia`, `readTheRoom`, `buzzerBattle`, `punchline`, `fakeOut`, or `surveyShowdown`.
- `schemaVersion`: version of engine-specific content/settings.
- `SettingsJson`, `ModifiersJson`, and `PresentationJson`: ordinary rules, optional shared modifiers, and display/audio choices.

Existing definitions continue to use `Type` and `ConfigJson`; the registry maps those types to a compatible engine/preset. A migration must preserve the original type and configuration.

When a run is created, the server stores a definition snapshot. Later edits to the reusable definition affect future runs, not a live run. This is also the point where a short join code, random seed, and initial session state are created.

## Shared runtime contract

New engines follow this conceptual server contract:

```text
GameEngine
  EngineType
  ValidateDefinition(definition)
  CreateInitialState(definitionSnapshot, participants)
  GetAllowedActions(state, role)
  HandleHostAction(state, action)
  HandleParticipantAction(state, participant, action)
  CalculateScores(state, event)
  GetHostState(run)
  GetParticipantState(run, participant)
  GetDisplayState(run)
```

The server remains authoritative. Host and participant commands are typed operations validated against the current phase. Revision checks and the per-run lock prevent stale host controls and simultaneous buzzes from mutating state out of order.

The shared lifecycle uses these phases where an engine needs them:

`setup`, `lobby`, `intro`, `instructions`, `roundIntro`, `prompt`, `acceptingResponses`, `responsesLocked`, `reveal`, `voting`, `judging`, `scoring`, `leaderboard`, `roundComplete`, `finalResults`, `complete`.

An engine can omit phases. The existing `prepared/live/paused/ended` run status remains for compatibility and transport-level lifecycle; the engine phase lives in the state/session projection.

## Role-safe projections

There are three projections:

- Host state may include answers, moderation queues, hidden board values, score controls, and participant management.
- Participant state contains only that participant's permitted input and public phase information. It never receives a secret answer before reveal.
- Display state contains only public prompt/reveal/leaderboard data. It is safe for a projector, browser player, or TV client.

The old activity display continues to receive its compatible envelope. New interactive session endpoints and broadcasts use the role-safe projection. Secret fields are removed at projection time; CSS is never used as a security boundary.

## Shared participant, team, and scoring model

The session foundation uses normalized records:

- `ActivityParticipant`: anonymous session token hash, optional display name, connection/reconnect metadata, active/removed state, and optional team.
- `ActivityTeam`: session-scoped team name/icon, order, and score projection.
- `ActivityScoreEvent`: participant/team, amount, reason, round, timestamp, and reversible/undone status.
- `ActivitySubmission`: participant response, moderation status, round, and engine-specific payload JSON.
- `ActivityVote`: voter, target, round, and vote payload.

The server never stores IP addresses, browser fingerprints, or unnecessary device details in these records. Participant tokens are salted by run ID in the same spirit as Audience Interaction tokens. Session data is transient and can be purged independently of the reusable definition.

## Initial reusable engines

The first vertical slices share these engines rather than creating one runtime per named game:

1. Quiz & Answer: Trivia, Fact or Fiction, rapid review, numeric and host-judged variants.
2. Poll & Prediction: Read the Room, Majority Rules, Hot Take, predictions, and opinion scales.
3. Buzzer & Progressive Clue: Buzzer Battle, Clue Ladder, Mystery Person/Place/Object.
4. Creative Response & Voting: Punchline, Caption This, Bad Advice, and similar moderated response games.
5. Bluffing & Deception: Fake Out and related truth/false-answer voting.
6. Survey Board: ranked answers, strikes, buzzers, steals, and host matching.
7. Drawing: Doodle & Guess now has bounded mobile vector strokes, moderation, gallery voting, and a room-favorite reveal.
8. Ordering/Ranking: Order Up now has teacher-authored item lists, accessible phone controls, public answer projection, and partial position scoring.
9. Word/Category: Word Storm now has moderated multi-word submissions, exact normalized duplicate aggregation, and a scalable word-cloud reveal.
10. Match-the-Player: Match Minds uses a role-specific participant projection so the selected player answers privately while others predict.
11. Media Reveal: the existing Image Reveal/Mystery Image activity now uses the shared session snapshot and public projection, while reusing its existing media URL and reveal presentation.
12. Host-Judged Stage Challenge: Beat the Clock uses server timer metadata, a host success/fail ruling, and the shared scoring/leaderboard path. It can run without phones.
13. Bracket/Tournament: Bracket Battle uses teacher-entered or live participant/team entrants, server-authoritative pairings/byes/advancement, audience voting, host recovery controls, optional shared score events, and role-safe bracket projections. Generic entrants and composition with other engines are the next step.
14. Physical Room: Four Corners uses a no-phone host/display runtime with server timer metadata, pause/resume, randomization, reveal, round navigation, and optional quick team awards. Stand/Sit and the remaining physical presets remain configurations over this runtime.
15. Utility engine: one `utility` Activity type now supports Coin Flip, Dice, Random Number, Mystery Boxes, Challenge Picker, Random Person, Random Team, Countdown, and live-roster Team Generator presets. Team generation supports manual assignment, balanced random assignment, and fully random assignment over the shared team records. Outcomes use an injected server-side random source, countdowns expose server timer metadata, mystery-box values are removed from public config/display projections until reveal, and the editor/controller/display share one game-show surface. The existing Wheel, Random Picker, Prize Grid, Buzzer, Leaderboard, and Audience Meter remain compatible utility entries and future embedding targets.

Later presets should be expressed through configuration/modifiers over these proven engines and the remaining Stage Challenge, Physical Room, Adventure, and Utility capabilities. Do not add a new engine when an existing engine plus configuration and modifiers can express the game cleanly.

## Host and participant flow

1. The host creates or selects a definition in Activities.
2. A run is created from the existing direct-launch or lesson cue path.
3. The run opens a reusable lobby with a short code and QR URL.
4. A participant joins without a LessonCue account, receives a token, and can reconnect after refresh.
5. The host starts the game, and participant browsers switch input according to the authoritative phase.
6. Host, participant, and display clients receive SignalR state updates and can recover by fetching the current projection after reconnect.
7. The host can pause, advance, skip, moderate, adjust/undo scores, remove participants, reset a safe round, or end the run.

The existing Audience Interaction feature remains available for persistent standalone polls. It is a reusable primitive and privacy reference, not a competing activity selector or live game runtime.

## Backward compatibility and migration

- Existing `ActivityDefinition.Type` values and reducers remain valid.
- Existing lesson playlist items continue to point at the same reusable definition.
- Existing activity runs continue to render through the legacy envelope.
- New columns have compatibility defaults and are added idempotently by `DatabaseUpgrade`.
- Existing runs receive a safe compatibility snapshot when first loaded/updated; they are not silently recreated.
- Named game presets are registry metadata, not database tables.

## Delivery sequence

The implementation is staged so each step is usable:

1. Shared session foundation, role projections, lobby/reconnect, teams, score events, timers, and documentation.
2. Six high-value vertical slices listed above, with deterministic server tests and at least one complete browser path.
3. Rich interaction engines: drawing, ordering/ranking, word/category, match-the-player, media reveal, and the host-led Stage Challenge slice are now proven vertical slices. Bracket Battle and the initial Physical Room slice are also in place; next add generic tournament composition, richer matching variants, and media transformations on the same contract.
4. Complete tournament composition, then expand the Physical Room presets and utility composition. The initial Utility engine slice is in place; remaining work is richer team-management recovery, embedding hooks, and composition with other engines. Existing Wheel/Picker/Countdown entries remain backward-compatible while their future embedding path is consolidated.
5. Branching adventure, chained Telephone Draw, and richer power modifiers.

The detailed remaining work, including preset expansion and presentation/controller polish, is tracked in [Activities & Games TODO](activities-games-todo.md).

The user-facing experience remains `Activities → choose a game → add content → save → add to lesson or launch`; engine names are implementation detail.
