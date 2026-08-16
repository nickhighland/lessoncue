# LessonCue Activities & Games TODO

This is the working backlog for the existing Activities/Games system. It extends the current selector, activity definitions, live runs, web controller, participant route, display protocol, lesson integration, and shared session infrastructure. It is not a second Activities system.

The list is intentionally ordered by product value and architectural dependency. Keep game-specific behavior in reusable engines and presets; do not create a new runtime when an existing engine plus configuration or modifiers can express the experience.

## Next build program — 2026-08-15

This is the active implementation sequence. It covers the next product-value layer without creating a second selector or a separate runtime for every named game.

### 1. Finish the tournament slice

- [x] Initial teacher-entered Bracket Battle with seeded pairings, byes, voting, host winner selection, and role-safe display state.
- [x] Add live participant/team entrants from the session roster; keep generic drawing/creative/image/finalist adapters as the next composition step.
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
- [ ] Embed the utilities inside other engines where that improves a game without creating another selector.

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

- [ ] Add pagination or server-side search/filtering for very large libraries.
- [x] Add thumbnails, favorites/pinning, and richer card metadata without making the selector harder to scan.
- [x] Add bulk archive/restore/duplicate operations where the action is unambiguous.
- [x] Add an editor dirty-state warning, preview snapshots, and lesson-dependency details before destructive actions.
- [x] Add browser coverage for list/grid persistence, arranging, filtering, and bulk deletion.
- [ ] Add browser coverage for archived-item recovery and lesson-dependency messaging through a real lesson-linked fixture.

## Completed foundation — reference only

- [x] Shared activity run/session boundary with reusable-definition snapshots.
- [x] Role-safe host, participant, and display projections.
- [x] QR/join-code lobby with anonymous browser participants and reconnect handling.
- [x] Shared participants, teams, score events, moderation, timers, and SignalR updates.
- [x] End-to-end vertical slices for Trivia, Read the Room, Buzzer Battle/Clue Ladder, Punchline, Fake Out, Survey Showdown, Doodle & Guess, Order Up, Word Storm, Match Minds, Mystery Image, and Beat the Clock.
- [x] Initial shared Utility engine slice: Coin Flip, Dice, Random Number, Mystery Boxes, Challenge Picker, Random Person, Random Team, Countdown, and live-roster Team Generator.
- [x] Flexible multiple-choice answers; choices are no longer fixed at four.
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
- [ ] Compose the engine with Trivia, Creative Response, Drawing, Poll/Vote, and Team modes without duplicating their runtimes.
- [x] Add a deterministic server test covering multiple rounds and the final champion.
- [ ] Add complete invalid-action, reconnection, and browser end-to-end matchup-to-final coverage.
- [ ] Document how another engine can hand its finalists to the bracket engine.

## 2. Physical Room engine — no-phone group play

- [x] Create a deliberately simple display-and-host runtime for activities that primarily use the room rather than phones.
- [x] Support server-authoritative instructions, round progression, countdowns, pause/resume, randomization, reveal, and manual score/team awards.
- [x] Provide the host controls: Previous, Next, Start Timer, Pause, Reset, Randomize, Reveal, Award Team, and End.
- [x] Make phone participation optional; the activity remains usable when no participants are connected.
- [x] Add reusable physical prompts, team assignment, timer, scoreboard, and display-state primitives through the shared session panel and public projection.
- [x] Add editable presets: Four Corners, Stand/Sit, Move If…, Human Spectrum, Line Up, Find Someone Who, Simon Says Controller, Freeze Dance Controller, Challenge Wheel, Relay Board, Scavenger Hunt, Heads or Tails, and Rock Paper Scissors Royale.
- [x] Add large-TV presentation, keyboard-operable controls, and reduced-motion support; reconnect diagnostics and richer paused/reconnect states remain cross-cutting follow-up work.
- [x] Add server and browser coverage for no-phone operation, timer control, randomization, reveal, and round navigation; richer team-score interaction remains follow-up work.

## 3. Game-show utilities and composition

- [x] Establish the shared utility registry metadata contract so utilities can run standalone from Activities and be embedded by future engines without another selector.
- [ ] Add Wheel with teacher-provided choices and safe random selection.
- [x] Add Random Person Picker and Random Team Picker using the live participant/team roster.
- [x] Add Mystery Boxes with hidden values, server-side reveal, and optional score/action payloads.
- [x] Add Countdown with pause, resume, reset, adjustment, and server timer metadata.
- [x] Add Coin Flip, Dice, Random Number, and Challenge Picker with server-authoritative outcomes.
- [x] Add live-roster random Team Generator with shared team records and participant assignments.
- [x] Add manual, balanced-random, and fully-random Team Generator assignment options through the existing shared team records.
- [x] Add richer team-management recovery controls such as renaming a live team without recreating assignments.
- [ ] Reuse the existing Buzzer, Leaderboard, and Audience Meter capabilities as embeddable utilities rather than creating duplicate systems.
- [x] Add the first shared utility presentation, sound hooks, accessibility labels, and reduced-motion path.
- [x] Add utility host skip/retry/clear/reset controls and richer timer recovery behavior.
- [ ] Add richer standalone composition hooks and embed utilities inside other engines.
- [x] Register the current utility/physical entries in the existing Activities library with clear “phones required,” “phones optional,” and “no phones” metadata.
- [x] Add deterministic tests for randomization with an injectable server source and tests proving that client input cannot control outcomes or reveal hidden box values early.

## 4. Expand named presets over proven engines

Add these as registry-backed presets and guided editors. Each preset should reuse an existing engine, content schema, modifiers, scoring configuration, and presentation variant.

### Poll & Prediction

- [x] Majority Rules
- [x] Minority Report
- [x] Split Decision
- [x] Would You Rather
- [ ] This or That Gauntlet
- [x] Hot Take
- [ ] Consensus as a ranking/prediction configuration
- [ ] One of Us
- [x] Most Likely To
- [ ] Know Your Group
- [ ] Yearbook Awards
- [ ] Prediction Machine
- [ ] Tiny Hill to Die On
- [x] Unpopular Opinion
- [x] Worst Choice Possible

### Quiz & Answer

- [x] Fact or Fiction
- [x] Two Truths & a Lie
- [x] Spot the Fake
- [ ] Who Said It?
- [x] Finish the Quote
- [x] Fill the Blank
- [ ] Which Lesson?
- [ ] Recap Race
- [ ] Key Word
- [ ] Before or After
- [ ] Which Came First?
- [x] Higher or Lower
- [ ] Over / Under
- [x] Guess the Number
- [ ] Closest Without Going Over
- [ ] The Price Is Wrong
- [ ] Definitely Real
- [ ] That Can’t Be Right
- [x] Is It a Horse? as a generic configurable binary-classification preset, not a hard-coded horse game

### Buzzer & Progressive Clue

- [x] Mystery Person
- [x] Mystery Place
- [x] Mystery Object
- [x] Common Thread
- [ ] Secret Category
- [ ] Concept Pyramid
- [x] Password
- [ ] Verify declining clue values and optional lockout/steal behavior in the editor and host flow

### Bluffing & Deception

- [x] Who Wrote That?
- [x] Confessions
- [x] Secret Talent
- [x] Why Is This Here?
- [ ] Support correct-answer points, successful-bluff points, optional host-favorite points, and anonymous reveal

### Creative Response & Voting

- [x] Caption This
- [x] Autocomplete
- [x] Bad Advice
- [ ] Explain It Badly
- [x] Wrong Answers Only
- [ ] Rename It
- [ ] New Product
- [x] Slogan Factory
- [x] Movie Pitch
- [ ] Headline
- [ ] Deleted Scene
- [ ] Alternate Ending
- [ ] Plot Twist
- [ ] Excuse Generator
- [ ] Superpower / Catch
- [x] Make It Worse
- [ ] Explain This Photo
- [ ] Who Approved This?
- [ ] Worst Ranking
- [ ] Reuse mandatory moderation and support Gallery Vote plus Head-to-Head voting

### Drawing

- [x] Doodle as a simple drawing-only preset
- [x] Draw & Vote
- [x] Mascot Maker
- [x] Logo Disaster
- [x] Invention Lab
- [x] Draw the Description
- [ ] Telephone Draw chain: phrase → drawing → description → drawing → description
- [ ] Add chain replay and animated reveal once the base drawing flow is stable

### Survey Board

- [x] Top Five
- [x] Top Answer
- [x] Bottom of the Barrel
- [ ] Add conservative fuzzy matching with a host override that always wins
- [ ] Add strikes, steals, and team-turn flow as configurable modifiers

### Ordering, Ranking, Matching & Sorting

- [ ] Timeline
- [ ] Rank It
- [ ] Verse Scramble
- [ ] Missing Step
- [ ] Cause & Effect
- [ ] Match-Up
- [ ] Sorting Hat
- [ ] Connections
- [ ] Odd One Out
- [ ] Add accessible non-drag input for every ordering/sorting preset

### Word & Category

- [ ] Category Blitz
- [ ] Name Five
- [ ] Alphabet Challenge
- [ ] Last One Standing with turn order, timeout, elimination, and duplicate detection
- [ ] Chain Reaction
- [ ] Word Association
- [ ] Word Storm variants with repeated-word aggregation
- [ ] One Word Too Far

### Match-the-Player

- [ ] Same Brain
- [ ] Know Your Leader
- [ ] Friend Match
- [ ] Newlywed Game
- [ ] How Well Do You Know Me?
- [ ] Guess My Answer
- [ ] Support A/B, multiple-choice, and host-judged short-text matching

### Media Reveal & Observation

- [ ] Zoomed In
- [ ] Blur Reveal
- [ ] Silhouette
- [ ] Missing Piece
- [ ] What’s Different?
- [ ] Memory Grid
- [ ] Flash Frame
- [ ] Emoji Decode
- [ ] Picture Puzzler
- [ ] Rebus Rush
- [ ] Sound Check
- [ ] Sound Bite
- [ ] Backwards Audio
- [ ] One Second Challenge
- [ ] Freeze Frame
- [ ] What Happens Next?
- [ ] Add client-side transformations: pixelate, blur, zoom, crop, silhouette, timed flash, progressive exposure, audio duration/reverse, and video pause
- [ ] Reuse the existing media library and playback URLs; never modify source media or create an unnecessary upload system

### Host-Judged Stage Challenge

- [ ] Teach It Back
- [ ] Best Explanation
- [ ] Scenario Judge
- [ ] Example / Non-Example
- [ ] Unnecessary Debate
- [ ] Courtroom
- [ ] Sell Me This
- [ ] Pose Match
- [ ] Photo Hunt
- [ ] Add optional audience voting and configurable success/failure scoring

### Physical Room

- [ ] Add the remaining physical presets after the Physical Room engine is stable
- [ ] Support classroom, youth-group, church, and training-friendly prompt templates without requiring a built-in content marketplace

### Branching Adventure

- [ ] Define a small ordered/node editor for scene, choice, poll, quiz, media, random, score, inventory, condition, and end nodes
- [ ] Build the runtime only after the shared session contract is stable
- [ ] Add Adventure as the first preset

## 5. Game-show presentation and sound polish

- [x] Create the initial shared original Web Audio primitives and route them through a common game-sound gain node; the remaining cue catalog is still expanding.
- [x] Add a global host sound-effects volume control and mute control; keep game audio separate from lesson media volume.
- [ ] Build shared TV components for animated intro, round title, prompt reveal, countdown, answer lock, buzzer winner, correctness reveal, point animation, vote result, leaderboard, podium, final score reveal, team bars, participant cards, response cards, strikes, lives, and progress.
- [ ] Ensure every animation has a reduced-motion path and a host skip path.
- [ ] Tune TV layouts for readability across classroom distances: large type, high contrast, limited information per screen, and no tiny admin controls.
- [ ] Add theme/presentation variants that are recognizably LessonCue and do not copy commercial game-show artwork, sound, or trade dress.
- [ ] Add suspense/reveal pacing without making the host wait unnecessarily; every transition must be manually advanceable or skippable.
- [ ] Add audio/image asset licensing notes and original asset attribution where required.

## 6. Controller and operational follow-through

- [ ] Verify every new engine has a working web-controller path, not merely a display or participant UI.
- [ ] Make host actions contextual to the current phase: start, open/lock, reveal, vote, judge, score, undo, next, pause, reset, skip, remove, and end as applicable.
- [ ] Preserve physical remote scrolling/navigation as a display/control-navigation feature; do not make physical remotes responsible for participant activity input.
- [ ] Add controller recovery after refresh, SignalR reconnect, stale revision, display disconnect, and participant disconnect.
- [ ] Add a visible connection/acknowledgement state for important controller commands.
- [ ] Test mobile controller touch targets, keyboard use, and D-pad/remote navigation.

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
- [ ] Add reconnect and refresh tests for host, display, and participant clients.
- [ ] Add moderation and payload-size tests for text, drawings, media references, and other user-generated content.
- [ ] Add OpenAPI/protocol fixtures whenever routes or public state shapes change.
- [ ] Add mobile participant, accessibility, and reduced-motion coverage for each input type.
- [ ] Keep the existing full server, browser, accessibility, typecheck, build, lint, and protocol suites green.
- [ ] Update [the Activities architecture document](activities-games-architecture.md) whenever a shared contract, engine boundary, projection, or migration rule changes.

## Product rule

The teacher experience remains:

`Activities → choose a game → enter content → save → add to lesson or launch`

The engine architecture, state machine, projections, scoring events, and transport remain implementation details unless a teacher needs them to make a deliberate game choice.
