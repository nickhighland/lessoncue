# LessonCue Activities & Games TODO

This is the working backlog for the existing Activities/Games system. It extends the current selector, activity definitions, live runs, web controller, participant route, display protocol, lesson integration, and shared session infrastructure. It is not a second Activities system.

The list is intentionally ordered by product value and architectural dependency. Keep game-specific behavior in reusable engines and presets; do not create a new runtime when an existing engine plus configuration or modifiers can express the experience.

## How the implementation phases are determined

The phase labels are an implementation roadmap, not a runtime setting, database
field, or teacher-visible game mode. They follow the dependency order in the
Activities expansion brief:

1. Shared foundation: definitions, live sessions, lobby/reconnect, projections,
   teams, timers, scoring, transport, and lesson integration.
2. Highest-value engines: Quiz, Poll, Buzzer, Creative Response, Bluffing, and
   Survey Board.
3. Rich interaction engines: Drawing, Ordering, Match-the-Player, Word/Category,
   and Media Reveal.
4. Group and stage systems: Bracket/Tournament, Host-Judged Stage Challenge,
   Physical Room, and shared Utilities.
5. Advanced composition: Branching Adventure, Telephone Draw chains, and richer
   power/tournament modifiers.

This ordering favors reusable infrastructure and real vertical slices over a
large list of disconnected presets. The separate player-facing plan in
`activities-fun-plan.md` also uses five phases, but those describe visual and
participation polish; they are not the same implementation sequence.

## Next build program — 2026-08-15

This is the active implementation sequence. It covers the next product-value layer without creating a second selector or a separate runtime for every named game.

### 1. Finish the tournament slice

- [x] Initial teacher-entered Bracket Battle with seeded pairings, byes, voting, host winner selection, and role-safe display state.
- [x] Add live participant/team entrants from the session roster plus a server-side random roster draw; keep generic drawing/creative/image/finalist adapters as the next composition step.
- [x] Complete the first host recovery controls: close voting, skip a broken matchup, remove an entrant, reset, score, and end; shared score undo remains available.
- [x] Connect tournament wins to shared score events when `pointsPerWin` is configured and show the shared live leaderboard/podium presentation.
- [x] Add reusable tournament templates for Sudden Death, Survivor Trivia, Rock Paper Scissors Royale, and Heads or Tails; keep them on the Bracket engine and allow the teacher to apply/edit the template.

### 2. Build the no-phone Physical Room slice

- [x] Add one reusable physical-room runtime with prompts, instructions, round navigation, countdown metadata, pause/resume, randomize, reveal, and team awards.
- [x] Prove the runtime with Four Corners; Stand/Sit remains a configuration/preset follow-up, and phones remain optional rather than required.
- [x] Add large-TV display and a compact host controller with Previous, Next, Timer, Pause, Reset, Randomize, Reveal, Award Team, and End.
- [x] Add editable room templates for Move If…, Human Spectrum, Line Up, Find Someone Who, Simon Says Controller, Freeze Dance Controller, Challenge Wheel, Relay Board, Scavenger Hunt, Heads or Tails, and Rock Paper Scissors Royale over the same runtime.

### 3. Make utilities composable

- [x] Preserve the existing Wheel, Random Picker, Countdown, Prize Grid, Buzzer, Leaderboard, and Audience Meter implementations as the utility foundation.
- [x] Add the first shared utility metadata/presentation layer so registered utilities can declare standalone/embedding capabilities without a second selector.
- [x] Ship one reusable `utility` Activity runtime with Coin Flip, Dice, Random Number, Mystery Boxes, Challenge Picker, Random Person, Random Team, Countdown, and live-roster Team Generator presets.
- [x] Add server-authoritative randomness/timer metadata, secret-safe mystery-box projections, utility editor/controller/display surfaces, and deterministic outcome tests.
- [x] Add host retry, skip, clear, reset, pause, resume, and time-adjust controls to the utility surface.
- [x] Let the Bracket engine consume the shared utility randomness path for a configured random participant/team/teacher roster.
- [x] Embed utility displays/actions directly inside Buzzer, Punchline, and Fake Out through the shared host/display utility surface; extend the same hook to other engines as their editors gain optional bonus rounds.

### 4. Improve library and teacher workflow

- [x] Grid/list views, filters, multi-select, safe bulk deletion, archive recovery, and manual arranging.
- [x] Add favorites/pinning, thumbnails, and clearer setup/participation metadata.
- [x] Add editor dirty-state protection and client-only preview snapshots for TV, participant, reveal, leaderboard, and podium modes.
- [x] Add lesson/template/live-run dependency metadata and explain safe archive-versus-delete behavior before destructive actions.
- [x] Add atomic bulk archive, restore, and duplicate operations alongside existing bulk delete.

### 5. Raise the game-show presentation floor

- [x] Existing original Web Audio effects and reduced-motion CSS foundation.
- [x] Add a shared host sound control with volume and mute, independent of lesson media volume.
- [x] Add reusable reveal, score-burst, countdown, and winner presentation primitives; integrate them into representative buzzer, creative, bracket, stage, and physical-room displays.
- [x] Add reduced-motion CSS for the shared motion primitives; host progression remains manual and skippable.
- [x] Add leaderboard rank-movement animation and wire the shared podium treatment into final live-session results.

### 6. Expand presets only after the engines prove stable

- [x] Add the first registry-backed Quiz, Poll, Buzzer, Creative, Bluffing, Drawing, and Survey templates; teachers can apply named formats and edit the starter content without switching engines.
- [x] Extend the existing Quiz engine beyond choice boards with teacher-configurable short-answer and number lock-in rounds, accepted-answer matching, numeric tolerance, closest-answer scoring, and closest-without-going-over scoring.
- [x] Add shared Quiz modifiers for Wager, server-timestamp speed bonus, Lives/Elimination, and Double or Nothing; expose Wager Trivia and Survivor Trivia as registry presets and reuse the same rules in Rapid Fire.
- [x] Add Rapid Fire server-authoritative start/pause/resume timing and reject participant answers after the response window expires.
- [ ] Add the remaining named poll, quiz, buzzer, bluffing, creative, drawing, survey, ordering, word, match, media, stage, physical, and adventure presets listed below through registry configuration.
- [ ] Prefer an existing engine plus modifiers over another bespoke runtime.
- [ ] Add one deterministic server test and one representative browser path for each new engine family before broad preset expansion.

## Whole-system evaluation — 2026-08-15

The existing Activities experience was audited end to end: library, definition editor, lesson insertion, direct launch, host/controller, participant route, display projection, persistence, and the Audience Interaction primitives. The existing selector and live-session path remain authoritative.

Completed in this evaluation pass:

- [x] Keep the existing Activities Studio as the single entry point for browsing, editing, previewing, launching, and adding activities to lessons.
- [x] Add persistent grid and list views, with the preference remembered per browser.
- [x] Add search plus category, game-family, phone, team, media, and archived filters.
- [x] Add select-all-visible, multi-selection, accessible bulk actions, and clear operation feedback.
- [x] Add safe bulk delete semantics: unused definitions are deleted; definitions referenced by lessons, templates, or runs are archived instead.
- [x] Add archived-item recovery and retain the existing lesson/run references.
- [x] Add persistent manual library order with drag-and-drop and keyboard move controls.
- [x] Replace native delete/save/import/duplicate alerts with inline status feedback and an accessible confirmation surface.
- [x] Add server/API/database coverage for library order, bulk mutation, restore, and the `LibraryPosition` migration.
- [x] Make structured content counts teacher-controlled: add/remove questions, rounds, answers, choices, clues, prompts, entries, boxes, challenges, teams, and ordering items within each engine's safe limits.
- [x] Keep required minimums visible in the editor and enforce the same minimums server-side; multiple-choice activities accept 2–8 choices rather than assuming four.
- [x] Add explicit add/remove controls for picker pools, utility choices/boxes/challenges, and physical-room choices instead of requiring comma-separated bulk editing.

Still needed for a large or heavily curated library:

- [x] Add bounded server-side library pages and search while keeping the existing full-list endpoint backward-compatible; manual arranging is disabled when the page does not contain the full unfiltered library.
- [x] Add thumbnails, favorites/pinning, and richer card metadata without making the selector harder to scan.
- [x] Add bulk archive/restore/duplicate operations where the action is unambiguous.
- [x] Add an editor dirty-state warning, preview snapshots, and lesson-dependency details before destructive actions.
- [x] Add browser coverage for list/grid persistence, arranging, filtering, and bulk deletion.
- [x] Add browser coverage for the paged library endpoint; server coverage already exercises lesson-linked usage, archive, restore, and dependency messaging data. A full UI lesson-linked fixture remains a follow-up for the lesson workflow suite.

## Completed foundation — reference only

- [x] Shared activity run/session boundary with reusable-definition snapshots.
- [x] Role-safe host, participant, and display projections.
- [x] QR/join-code lobby with anonymous browser participants and reconnect handling.
- [x] Shared participants, teams, score events, moderation, timers, and SignalR updates.
- [x] Config-driven poll scoring for Majority Rules, Minority Report, and Prediction Machine, with the live distribution hidden until reveal.
- [x] End-to-end vertical slices for Trivia, Read the Room, Buzzer Battle/Clue Ladder, Punchline, Fake Out, Survey Showdown, Doodle & Guess, Order Up, Word Storm, Match Minds, Mystery Image, and Beat the Clock.
- [x] Initial shared Utility engine slice: Coin Flip, Dice, Random Number, Mystery Boxes, Challenge Picker, Random Person, Random Team, Countdown, and live-roster Team Generator.
- [x] Flexible multiple-choice answers; choices are no longer fixed at four.
- [x] Flexible Quiz answer formats: choice boards (2–8), short answers, exact/tolerant numbers, closest answer, and closest without going over.
- [x] Shared Quiz modifiers: wagers, server-timestamp speed bonuses, lives/elimination, and Double or Nothing, with Wager Trivia and Survivor Trivia presets.
- [x] Creative Gallery Vote and Head-to-Head matchup voting over the existing moderated response engine.
- [x] Conservative Survey Board match suggestions with manual host override.
- [x] Signage is always live; the obsolete admin test checkbox is removed.

## 1. Bracket & Tournament engine — in progress

The first Bracket Battle vertical slice now supports teacher-entered entrants plus live participant/team rosters. Generic entrants from other engines, score presentation, and tournament composition remain backlog items.

- [x] Define and validate the initial teacher-entered entrant model, with 2–32 unique entrants.
- [x] Implement the first-round pairings, byes, elimination, advancement, and champion state for a seeded bracket.
- [x] Support initial head-to-head audience voting with host-selected winner override.
- [x] Add server-authoritative match lifecycle and state transitions: create bracket, open matchup, collect result, reveal winner, advance, and complete.
- [x] Add host controls for start matchup, open/close voting, reveal, advance, skip broken matchup, remove entrant, award points, reset, and end tournament; shared score undo is available from the session controls.
- [x] Add role-specific participant and display projections; never expose hidden matchup answers or unrevealed results early.
- [x] Reuse live participant/team entrants and shared score events; leaderboard, timers, moderation, and richer reveal presentation remain follow-up work.
- [x] Register Bracket Battle with a guided entrant editor, TV display, host controller, and phone voting input.
- [x] Add editable presets over the engine: Rock Paper Scissors Royale, Sudden Death, Survivor Trivia, and Heads or Tails.
- [x] Add the first composition path through the shared participant/team roster and utility-randomized entrant draw without duplicating a runtime.
- [x] Add a generic finalist handoff adapter from completed interactive runs into a bracket, mapping names to the target roster and preserving unmatched finalists as label-only entrants.
- [x] Add a deterministic server test covering multiple rounds and the final champion.
- [x] Add a host controller import flow, results-screen guard, deterministic service coverage for finalist handoff, and browser matchup-to-final coverage.
- [x] Document how another engine hands its ranked participant/team results to the bracket engine.

## 2. Physical Room engine — no-phone group play

- [x] Create a deliberately simple display-and-host runtime for activities that primarily use the room rather than phones.
- [x] Support server-authoritative instructions, round progression, countdowns, pause/resume, randomization, reveal, and manual score/team awards.
- [x] Provide the host controls: Previous, Next, Start Timer, Pause, Reset, Randomize, Reveal, Award Team, and End.
- [x] Make phone participation optional; the activity remains usable when no participants are connected.
- [x] Add reusable physical prompts, team assignment, timer, scoreboard, and display-state primitives through the shared session panel and public projection.
- [x] Add editable presets: Four Corners, Stand/Sit, Move If…, Human Spectrum, Line Up, Find Someone Who, Simon Says Controller, Freeze Dance Controller, Challenge Wheel, Relay Board, Scavenger Hunt, Heads or Tails, and Rock Paper Scissors Royale.
- [x] Add large-TV presentation, keyboard-operable controls, and reduced-motion support; reconnect diagnostics and richer paused/reconnect states remain cross-cutting follow-up work.
- [x] Add server and browser coverage for no-phone operation, timer control, randomization, reveal, and round navigation; richer team-score interaction remains follow-up work.
- [x] Make the Physical Room controller phase-aware and enforce the same timer, randomize, reveal, leaderboard, and navigation lifecycle on the server.

## 3. Game-show utilities and composition

- [x] Establish the shared utility registry metadata contract so utilities can run standalone from Activities and be embedded by future engines without another selector.
- [x] Add Wheel with teacher-provided choices and safe random selection; the existing server-authoritative Wheel reducer is now exposed as named Safari Spin and Spin Challenge Wheel presets in the primary Activities catalog.
- [x] Add Random Person Picker and Random Team Picker using the live participant/team roster.
- [x] Add Mystery Boxes with hidden values, server-side reveal, and optional score/action payloads.
- [x] Add Countdown with pause, resume, reset, adjustment, and server timer metadata.
- [x] Add Coin Flip, Dice, Random Number, and Challenge Picker with server-authoritative outcomes.
- [x] Add live-roster random Team Generator with shared team records and participant assignments.
- [x] Add manual, balanced-random, and fully-random Team Generator assignment options through the existing shared team records.
- [x] Add richer team-management recovery controls such as renaming a live team without recreating assignments.
- [x] Reuse the existing utility command path for embedded bonus actions in representative engines; Leaderboard/Audience Meter embedding remains a separate presentation follow-up.
- [x] Add the first shared utility presentation, sound hooks, accessibility labels, and reduced-motion path.
- [x] Add utility host skip/retry/clear/reset controls and richer timer recovery behavior.
- [x] Add richer standalone composition hooks and embed optional utility actions/displays inside other engines without creating another selector.
- [x] Register the current utility/physical entries in the existing Activities library with clear “phones required,” “phones optional,” and “no phones” metadata.
- [x] Add deterministic tests for randomization with an injectable server source and tests proving that client input cannot control outcomes or reveal hidden box values early.

## 4. Expand named presets over proven engines

Add these as registry-backed presets and guided editors. Each preset should reuse an existing engine, content schema, modifiers, scoring configuration, and presentation variant.

### Poll & Prediction

- [x] Majority Rules
- [x] Minority Report
- [x] Split Decision
- [x] Would You Rather
- [x] This or That Gauntlet starter poll template
- [x] Hot Take
- [x] Consensus starter poll template
- [x] One of Us
- [x] Most Likely To
- [x] Know Your Group
- [x] Yearbook Awards
- [x] Prediction Machine starter poll template
- [x] Tiny Hill to Die On
- [x] Unpopular Opinion
- [x] Worst Choice Possible

### Quiz & Answer

- [x] Fact or Fiction
- [x] Two Truths & a Lie
- [x] Spot the Fake
- [x] Who Said It?
- [x] Finish the Quote
- [x] Fill the Blank
- [x] Which Lesson?
- [x] Recap Race
- [x] Key Word
- [x] Before or After
- [x] Which Came First?
- [x] Higher or Lower
- [x] Over / Under
- [x] Guess the Number
- [x] Closest Without Going Over
- [x] The Price Is Wrong
- [x] Definitely Real
- [x] That Can’t Be Right
- [x] Is It a Horse? as a generic configurable binary-classification preset, not a hard-coded horse game
- [x] Wager Trivia over the shared Quiz modifier layer
- [x] Survivor Trivia over the shared Lives/Elimination modifier layer
- [x] Rapid Fire uses the same Quiz scoring/modifier contract with a server-authoritative response timer

### Buzzer & Progressive Clue

- [x] Mystery Person
- [x] Mystery Place
- [x] Mystery Object
- [x] Common Thread
- [x] Secret Category
- [x] Concept Pyramid
- [x] Password
- [x] Verify declining clue values and optional lockout/steal behavior in the editor and host flow

### Bluffing & Deception

- [x] Who Wrote That?
- [x] Confessions
- [x] Secret Talent
- [x] Why Is This Here?
- [x] Support correct-answer points, successful-bluff points, optional host-favorite points, and anonymous reveal

### Creative Response & Voting

- [x] Caption This
- [x] Autocomplete
- [x] Bad Advice
- [x] Explain It Badly
- [x] Wrong Answers Only
- [x] Rename It
- [x] New Product
- [x] Slogan Factory
- [x] Movie Pitch
- [x] Headline
- [x] Deleted Scene
- [x] Alternate Ending
- [x] Plot Twist
- [x] Excuse Generator
- [x] Superpower / Catch
- [x] Make It Worse
- [x] Explain This Photo
- [x] Who Approved This?
- [x] Worst Ranking
- [x] Reuse mandatory moderation and support Gallery Vote plus Head-to-Head voting

### Drawing

- [x] Doodle as a simple drawing-only preset
- [x] Draw & Vote
- [x] Mascot Maker
- [x] Logo Disaster
- [x] Invention Lab
- [x] Draw the Description
- [x] Add a touch-safe mobile drawing toolbar with pen, eraser, undo, clear, brush sizes, and a small color palette.
- [x] Telephone Draw chain: phrase → drawing → description → drawing → description
- [x] Add chain replay and animated reveal once the base drawing flow is stable

### Survey Board

- [x] Top Five
- [x] Top Answer
- [x] Bottom of the Barrel
- [x] Add conservative alias/word matching suggestions with a host override that always wins
- [x] Add strikes, steals, and team-turn flow as configurable modifiers

### Ordering, Ranking, Matching & Sorting

- [x] Timeline
- [x] Rank It
- [x] Verse Scramble
- [x] Missing Step
- [x] Cause & Effect
- [x] Order Up as the shared editable ordering template
- [x] Match-Up
- [x] Sorting Hat
- [x] Connections
- [x] Odd One Out
- [x] Add accessible non-drag input for Match-Up, Connections, and the shared ordering editor

### Word & Category

- [x] Category Blitz
- [x] Name Five
- [x] Alphabet Challenge
- [x] Last One Standing turn order, duplicate detection, and elimination; timeout remains a follow-up
- [x] Chain Reaction starter template
- [x] Word Association
- [x] Word Storm variants with repeated-word aggregation
- [x] One Word Too Far starter template

### Match-the-Player

- [x] Same Brain
- [x] Know Your Leader
- [x] Friend Match
- [x] Newlywed Game
- [x] How Well Do You Know Me?
- [x] Guess My Answer
- [x] Support A/B, multiple-choice, and host-judged short-text matching

### Media Reveal & Observation

- [x] Zoomed In
- [x] Blur Reveal
- [x] Silhouette
- [x] Missing Piece
- [x] What’s Different? with a dedicated two-scene comparison display and teacher-authored change answer
- [x] Memory Grid
- [x] Flash Frame
- [x] Emoji Decode with a purpose-built clue/answer reveal layout
- [x] Picture Puzzler
- [x] Rebus Rush with a purpose-built symbol/phrase reveal layout
- [x] Sound Check
- [x] Sound Bite
- [x] Backwards Audio
- [x] One Second Challenge
- [x] Freeze Frame
- [x] What Happens Next?
- [x] Add client-side transformations: pixelate, blur, zoom, crop, silhouette, timed flash/progressive exposure, and bounded audio duration/reverse playback
- [x] Reuse the existing media library and playback URLs; never modify source media or create an unnecessary upload system

### Host-Judged Stage Challenge

- [x] Teach It Back
- [x] Best Explanation
- [x] Scenario Judge
- [x] Example / Non-Example
- [x] Unnecessary Debate
- [x] Courtroom
- [x] Sell Me This
- [x] Pose Match
- [x] Photo Hunt
- [x] Beat the Clock and Minute to Win It starter templates
- [x] Add optional audience voting and configurable success/failure scoring; audience callers can earn a configurable bonus while the host keeps the final ruling

### Physical Room

- [x] Add the remaining physical presets after the Physical Room engine is stable, including Animal Relay and Silent Line-Up
- [x] Support classroom, youth-group, church, and training-friendly prompt templates without requiring a built-in content marketplace

### Branching Adventure

- [x] Define the full node vocabulary and editor for scene, choice, poll, quiz, media, random, score, inventory, condition, and end nodes
- [x] Build the first server-authoritative ordered choice/branch runtime over the shared Physical Room session contract
- [x] Add Adventure as the first preset, with editable animal story nodes, phone voting, host resolution, and branch history
- [x] Add a simple ordered node editor with stable node IDs, branch destination selectors, explicit finish targets, and server validation

## 5. Game-show presentation and sound polish

- [x] Create the initial shared original Web Audio primitives and route them through a common game-sound gain node; the remaining cue catalog is still expanding.
- [x] Add a global host sound-effects volume control and mute control; keep game audio separate from lesson media volume.
- [x] Build shared TV components for animated intro, round title, prompt reveal, countdown, answer lock, buzzer winner, correctness reveal, point animation, vote result, leaderboard, podium, final score reveal, team bars, participant cards, response cards, strikes, lives, and progress; representative engine coverage is live and the remaining displays reuse the same primitives incrementally.
- [x] Ensure the shared animation system has a reduced-motion path and host-controlled/skippable progression; full per-engine coverage remains a follow-up.
- [x] Tune current TV layouts for readability across classroom distances: large type, high contrast, limited information per screen, and no tiny admin controls.
- [x] Add theme/presentation variants that are recognizably LessonCue and do not copy commercial game-show artwork, sound, or trade dress. Named catalog presets now seed stage, neon, retro, arcade, cyberpunk, or clean treatments; teachers can change the TV theme, sound pack, and ambient-motion preference in the existing editor.
- [x] Add renderer-only suspense/reveal pacing without making the host wait unnecessarily; every transition remains manually advanceable and reduced-motion safe.
- [x] Add audio/image asset licensing notes and original asset attribution guidance in [Activities assets and sound policy](activities-assets-and-sound.md); new bundled assets still require an entry before release.
- [x] Offer a numeric network address alongside the `.local` name, so a room can still join when mDNS does not resolve on the Wi-Fi.
- [x] Let a teacher pre-arm auto-advance in the editor rather than only from the host console mid-run.
- [x] Give each phone its own sound switch, remembered per device.
- [x] Replace the inherited Georgia serif on game surfaces with a heavy system display treatment; no bundled font, so no new licence obligation.
- [x] Build streaks once per projection instead of walking the run per player.
- [x] Add streak and speed callouts: "First in!" for the earliest correct answer of a round and a run counter on both the phone result card and the standings race, derived from the server's own submission times and score events.
- [x] Add opt-in auto-advance: once every active player has answered, the server closes the response window itself. Off by default, host-togglable per run, and only offered for engines where a head count is meaningful.
- [x] Give the host live controls: the join code and QR stay visible during a round, a roster shows who has answered with an "answers in" count, and a standings button is available. The Universal Remote tabs are named for what they do.
- [x] Put the response clock on the stage so the room can see it, not only the phones.
- [x] Show between-round standings as a race: each player runs their own avatar and colour along a lane, position encodes score, and a lane surges when it gains points. Trivia previously rendered no standings at all.
- [x] Replace the small join pill with a real lobby stage: the room code and QR dominate, and players appear one at a time with their avatar and colour as they join.
- [x] Tell each player how they did at reveal: outcome, points counting up, rank and total on their own phone, instead of "look up at the main display". The projection carries only that player's own standing.
- [x] Add player identity: an avatar/colour picker at join, shown on the phone header and carried into the roster and standings, plus a "Not <name>? Switch player" handover so a shared device no longer silently resumes as the previous player.
- [x] Publish a scannable join address: server-resolved absolute `joinUrl` (Cloudflare tunnel or `.local`), a teacher-selectable preference in Settings, and one shared join banner with a QR code replacing five duplicated copies.
- [x] Give every engine and named preset its own planned palette instead of four shared looks, apply it to the participant phone as well as the TV stage, and keep any theme a teacher customised. Contrast is checked for white-on-background and label-on-accent.
- [x] Fix participant headings inheriting the admin's dark `--ink`, which made phone titles and prompts dark-on-dark.
- [x] Add the shared tactile layer for phone play: squash-and-stretch press feedback, seeded idle drift on waiting states, chunky touch targets, and a last-five-seconds panic treatment driven by the authoritative clock. Reduced motion drops the animation and keeps the colour.
- [x] Add the optional sampled sound-pack path (`/assets/games/{gameId}/audio/...`) with lobby preloading, per-tap pitch variation, and a synthesized fallback for every absent file. The shipped repository still bundles no third-party audio.
- [x] Add per-game opening and closing stings alongside the looping lobby bed and round transition, fired from real phase transitions on the display.
- [x] Resolve sound packs through a preset → engine → shared cascade and scaffold the 29 engine folders with documented `.txt` placeholders for every cue.
- [ ] Extend the same tactile layer to the host controller and the remaining TV stage renderers; participant coverage is complete.

## 6. Controller and operational follow-through

- [ ] Verify every new engine has a working web-controller path, not merely a display or participant UI.
- [ ] Make host actions contextual to the current phase: start, open/lock, reveal, vote, judge, score, undo, next, pause, reset, skip, remove, and end as applicable.
- [ ] Preserve physical remote scrolling/navigation as a display/control-navigation feature; do not make physical remotes responsible for participant activity input.
- [x] Add controller recovery after refresh, SignalR reconnect, stale revision, display disconnect, and participant disconnect. The shared ActivityController now refreshes the authoritative run while SignalR is reconnecting/offline and refreshes again after reconnection; display and participant projections continue to recover through the existing hub/run subscription path.
- [x] Add a visible connection/acknowledgement state for important controller commands. Host controls now expose connection status, manual refresh, success revisions, and server/API errors without creating a second control system.
- [ ] Test mobile controller touch targets, keyboard use, and D-pad/remote navigation. Participant phone targets and keyboard activation are covered by `tests/browser/activity-participant-juice.spec.ts`; the host controller and remote navigation remain.

## 7. Library, editor, and teacher workflow

- [x] Keep the existing Activities selector as the primary entry point; do not create a competing game selector.
- [x] Add registry metadata for category, engine family, supported modes, phone requirements, teams, and media requirements; continue filling in audience, lesson-friendly setup, and setup complexity.
- [x] Add manageable library filters and cards with game name, description, icon, participation tags, engine family, and category.
- [x] Add grid/list views, multi-select, bulk delete/archive semantics, restore, and manual arranging.
- [ ] Keep setup guided: Choose Game → Name Game → Add Content → Configure Rules → Preview → Save.
- [ ] Keep Simple and Advanced settings separate where the rules become complex.
- [ ] Support duplicate, rename, archive/delete, reuse across lessons, edit, preview, launch directly, and add to lesson.
- [ ] Add representative previews for TV prompt, participant input, reveal, and leaderboard without requiring a live session.
- [ ] Provide generic, freely authored seed examples that teachers can delete immediately.
- [ ] Preserve direct launch, lesson cue insertion, cue-order semantics, and clean transition back to lesson controls.

## 8. Cross-cutting quality gates for each new slice

- [ ] Add definition validation and schema-version migration coverage.
- [ ] Add server-authority tests for permissions, phase restrictions, duplicate submissions, lock/reveal behavior, scoring, and invalid participant actions.
- [ ] Add role-projection tests proving secrets never reach participant or display clients early.
- [ ] Add reconnect and refresh tests for host, display, and participant clients. Host recovery behavior is implemented; browser coverage for forced disconnects and refresh remains a quality-gate follow-up.
- [ ] Add moderation and payload-size tests for text, drawings, media references, and other user-generated content.
- [ ] Add OpenAPI/protocol fixtures whenever routes or public state shapes change.
- [ ] Add mobile participant, accessibility, and reduced-motion coverage for each input type.
- [ ] Keep the existing full server, browser, accessibility, typecheck, build, lint, and protocol suites green.
- [ ] Update [the Activities architecture document](activities-games-architecture.md) whenever a shared contract, engine boundary, projection, or migration rule changes.

## Product rule

The teacher experience remains:

`Activities → choose a game → enter content → save → add to lesson or launch`

The engine architecture, state machine, projections, scoring events, and transport remain implementation details unless a teacher needs them to make a deliberate game choice.
