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
| Activity library | `web-admin/src/activities/ActivityLibrary.tsx`, `activityRegistry.ts`, and `activityPresetRegistry.ts` | Keep as the single selector. It now provides persistent grid/list views, search and capability filters, favorites, thumbnails, multi-select, bulk delete/archive/restore/duplicate actions, dependency-aware destructive messaging, archived recovery, manual ordering backed by `LibraryPosition`, and client-only draft previews. Named templates are registry configuration layered over an existing engine; applying one never creates a second runtime. |
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
| Rich interaction slices | `RichInteractionGames.tsx`, `ActivityParticipant.tsx`, and the shared session reducers | Drawing uses bounded normalized vector strokes; Ordering uses an accessible move-list and partial position scoring; Word Storm uses moderated normalized words and a reusable cloud projection; Last One Standing adds server-authoritative turn order, exact duplicate detection, and participant elimination over the same Word engine. |
| Shared presentation motion | `ActivityMotion.tsx`, `ActivityLeaderboard.tsx`, and `activity.css` | Engines reuse server-timestamp countdowns plus common reveal, score-burst, winner, rank-movement, podium, and reduced-motion treatments. Presentation remains a renderer concern; the server still owns timing and state transitions. |

## Named format catalog

`web-admin/src/activities/activityPresetRegistry.ts` is the single teacher-facing catalog for named formats. `ActivityLibrary` renders that catalog inside the existing **Choose an Activity Type** dialog, alongside the original blank activity building blocks. Search, filtering, and selection all stay in that one library; choosing a named format creates an ordinary `ActivityDefinition` with its existing engine `Type`, `PresetType`, and starter `ConfigJson`. There is no second game selector or alternate runtime.

The catalog now includes the planned Match-Up and Connections ordering variants, Telephone Draw, Memory Grid, audio rounds (Sound Check, Sound Bite, Backwards Audio, One Second Challenge), Adventure, and the additional physical-room formats. A starter configuration is deliberately editable teacher content; it is not a claim that every label requires a new engine. When a format needs a distinct rule, it is expressed through the shared engine state and projection contract.

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

## Shared Quiz modifiers

Trivia and Rapid Fire use one small modifier contract instead of separate Wager Trivia or Survivor Trivia runtimes. Definitions may place these rules under `config.modifiers`:

```json
{
  "wager": { "enabled": true, "maxPoints": 100, "defaultPoints": 25 },
  "speedBonus": { "enabled": true, "maxPoints": 50, "windowSeconds": 20 },
  "lives": { "enabled": true, "startingLives": 3, "eliminateAtZero": true },
  "doubleOrNothing": { "enabled": false }
}
```

The server validates wagers, calculates speed from the server-recorded response-window timestamp and submission timestamp, applies lives/elimination, and records each score adjustment as a normal reversible score event. Double or Nothing risks the base round value; a wrong wager still applies its wager penalty. Participant phones receive only the controls and their own permitted life count, while host/display projections may show the complete lives board after the round. Rapid Fire uses the same scorer and additionally owns a server-authoritative `targetAt`/`remainingMs` timer; an answer arriving after the window is rejected even if a client is stale.

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

1. Quiz & Answer: Trivia, Fact or Fiction, rapid review, short-answer recall, numeric lock-ins, closest-answer scoring, closest-without-going-over scoring, and future host-judged variants. Choice questions remain backward compatible, while each question may now declare `answerMode: choice`, `text`, or `number`.
2. Poll & Prediction: Read the Room, Majority Rules, Minority Report, Prediction Machine, Hot Take, predictions, and opinion scales. Poll presets can opt into server-side majority, minority, or room-prediction scoring while live vote distributions remain hidden until reveal.
3. Buzzer & Progressive Clue: Buzzer Battle, Clue Ladder, Mystery Person/Place/Object. Clue values are teacher-controlled per clue; lockout, steal-on-miss, manual steal reopen, and answer reveal are server-authoritative.
4. Creative Response & Voting: Punchline, Caption This, Bad Advice, and similar moderated response games. Punchline supports Gallery Vote and a server-paired Head-to-Head bracket over the same submissions and moderation records.
5. Bluffing & Deception: Fake Out and related truth/false-answer voting. Truth-finder, successful-bluff, and host-favorite points are shared score events; bluff authors remain hidden until the configured reveal.
6. Survey Board: ranked answers, server-owned strikes, team turns, steals, buzzers, conservative alias/word matching suggestions, and host matching. Suggestions are advisory; the host's selected board item is always authoritative.
7. Drawing: Doodle & Guess now has bounded mobile vector strokes, a touch-safe pen/eraser toolbar with undo, clear, brush sizes, and a small color palette, moderation, gallery voting, and a room-favorite reveal.
8. Ordering/Ranking: Order Up now has teacher-authored item lists, accessible phone controls, public answer projection, and partial position scoring. Match-Up uses the same engine with server-validated left/right pairs and per-pair scoring; Connections uses grouped items, partial/exact scoring, and role-safe answer reveals.
9. Word/Category: Word Storm now has moderated multi-word submissions, exact normalized duplicate aggregation, and a scalable word-cloud reveal. Last One Standing reuses that engine with server-authoritative turns, one-word-per-turn limits, exact duplicate detection, and elimination without creating a second runtime.
10. Match-the-Player: Match Minds uses a role-specific participant projection so the selected player answers privately while others predict. The same participant/host flow supports A/B, multiple-choice, and short-text rounds.
11. Media Reveal: the existing Image Reveal/Mystery Image activity now uses the shared session snapshot and public projection, while reusing its existing media URL and reveal presentation. `MEDIA_REVEAL_PRESETS` supplies editable Mystery Image, Zoomed In, Blur Reveal, Silhouette, Missing Piece, Memory Grid, Flash Frame, Picture Puzzler, Freeze Frame, What Happens Next?, Sound Check, Sound Bite, Backwards Audio, and One Second Challenge templates. Memory Grid hides card labels from participant projections until the host shows or reveals them. Audio rounds use host-triggered playback, bounded duration, and a browser-side reversed WAV fallback for Backwards Audio without modifying source media.
12. Host-Judged Stage Challenge: Beat the Clock uses server timer metadata, a host success/fail ruling, and the shared scoring/leaderboard path. It can run without phones, or optionally open a server-authoritative audience success/fail vote; the host still owns the final ruling and matching callers can receive a configurable bonus. `STAGE_PRESETS` supplies editable Beat the Clock, Minute to Win It, Teach It Back, Best Explanation, Scenario Judge, Example / Non-Example, Unnecessary Debate, Courtroom, Sell Me This, Pose Match, and Photo Hunt starters over the same runtime.
13. Bracket/Tournament: Bracket Battle uses teacher-entered or live participant/team entrants, server-authoritative pairings/byes/advancement, audience voting, host recovery controls, optional shared score events, and role-safe bracket projections. A definition can ask the shared random source to draw a configured entrant subset at start; the chosen roster is snapshotted into the run so reconnects and later utility actions cannot change it. A host can import ranked finalists from a completed interactive run before the bracket starts; matching target-roster names become scoreable live entrants and unmatched finalists remain safe label-only entrants.
14. Physical Room: Four Corners uses a no-phone host/display runtime with server timer metadata, pause/resume, randomization, reveal, round navigation, and optional quick team awards. Stand/Sit, Move If…, Human Spectrum, Line Up, Find Someone Who, Simon Says, Freeze Dance, Challenge Wheel, Relay Board, Scavenger Hunt, Heads or Tails, Rock Paper Scissors Royale, Animal Relay, Silent Line-Up, and Adventure are editable templates over this runtime. Adventure adds server-controlled story choices, branch transitions, history, and optional phone voting while remaining a Physical Room definition.
15. Utility engine: one `utility` Activity type now supports Coin Flip, Dice, Random Number, Mystery Boxes, Challenge Picker, Random Person, Random Team, Countdown, and live-roster Team Generator presets. Team generation supports manual assignment, balanced random assignment, and fully random assignment over the shared team records. Outcomes use an injected server-side random source, countdowns expose server timer metadata, mystery-box values are removed from public config/display projections until reveal, and the editor/controller/display share one game-show surface. Brackets can consume that same randomness through `entrantSelection: "random"`; the chosen roster is stored in the bracket session. Buzzer, Punchline, and Fake Out can opt into an `embeddedUtility` configuration that uses namespaced `utility.*` host actions and a role-safe nested display projection without creating a second selector or runtime.
16. Preset authoring: `activityPresetRegistry.ts` supplies editable starter templates for the Quiz, Poll, Buzzer, Creative, Bluffing, Drawing, Survey, Ordering, Word/Category, Match-the-Player, Media Reveal, Stage Challenge, and Physical Room engines. The selected template is saved as `config.preset` plus the definition `PresetType`, while the server continues to run the existing engine/type and keeps preset metadata out of runtime branching. Fully implemented formats own server state/actions/projections; simpler labels remain honest teacher-authored starters until their rule modifiers are implemented.

Later presets should be expressed through configuration/modifiers over these proven engines and the remaining Stage Challenge, Physical Room, Adventure, and Utility capabilities. Do not add a new engine when an existing engine plus configuration and modifiers can express the game cleanly.

## Host and participant flow

1. The host creates or selects a definition in Activities.
2. A run is created from the existing direct-launch or lesson cue path.
3. The run opens a reusable lobby with a short code and QR URL.
4. A participant joins without a LessonCue account, receives a token, and can reconnect after refresh.
5. The host starts the game, and participant browsers switch input according to the authoritative phase.
6. Host, participant, and display clients receive SignalR state updates and can recover by fetching the current projection after reconnect. The host `ActivityController` also shows a live/reconnecting/offline status, exposes a manual authoritative refresh, reports command acknowledgements and server errors, and temporarily falls back to run-state refreshes while SignalR reconnects.
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
2. Six high-value vertical slices listed above, with deterministic server tests and at least one complete browser path. Shared Quiz modifiers, creative Head-to-Head voting, conservative Survey matching, and randomized Bracket rosters now extend those slices without new runtimes.
3. Rich interaction engines: drawing, ordering/ranking, word/category, match-the-player, media reveal, and the host-led Stage Challenge slice are proven vertical slices. Match-Up, Connections, Memory Grid, audio rounds, chained Telephone Draw, and the initial Adventure runtime now exercise distinct state/projection paths without adding new selectors.
4. Continue tournament composition, Physical Room differentiation, and utility composition. The named formats are discoverable in the existing library; the remaining work is richer finalist adapters, Leaderboard/Audience Meter embedding, browser recovery coverage, and replacing any remaining starter-only labels with rule-backed modifiers.
5. Add the remaining advanced node types for Adventure, richer Telephone Draw chain composition, and additional power modifiers only when the shared contracts need them.

The detailed remaining work, including preset expansion and presentation/controller polish, is tracked in [Activities & Games TODO](activities-games-todo.md).

The user-facing experience remains `Activities → choose a game → add content → save → add to lesson or launch`; engine names are implementation detail.
