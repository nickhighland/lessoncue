# Activities & Games audit — 2026-09-28

An audit of the phone-connected games system: the server engines, lobby and join-code lifecycle, projections, auto-pilot, host controls, and the TV, phone, and host clients. It found 43 issues. 18 are fixed in this change, each with a regression test that failed before its fix. The other 25 are written up with evidence and a recommendation.

This is a targeted review. It does not guarantee that the system is free of defects, and it does not cover native TV behavior or real classroom Wi-Fi.

## Baseline and method

- **Code reviewed:** `main` at `12037a6` (v0.46.4). Line numbers in this document refer to that commit unless a line says "this change".
- **Server, read in full:** `ActivityApi.cs`, `ActivityControllerAccess.cs`, `ActivityHub.cs`, `ActivityService.cs`, `ActivitySessionService.cs` (5,733 lines), `ActivityModels.cs`, `ActivityValidation.cs`, `ActivityAutoPilot*.cs`, `ActivityEngineCatalog.cs`, `QuizModifiers.cs`, `ActivityRandomSource.cs`, `ReservedGameCodePool.cs`, `ActivityJoinAddressService.cs`, and the relevant parts of `ShortenerService.cs`, `ShortenerHealthService.cs`, `Program.cs`, and `LessonCueDb.cs`.
- **Clients, read in full:** `ActivityParticipant.tsx`, `ActivityDisplay.tsx`, `ActivityTvDisplay.tsx`, `ActivityController.tsx`, `ActivityLiveHostPanel.tsx`, `ActivityHostFlow.tsx`, `activityConnection.ts`, `refreshLoop.ts`, `api.ts`, `DrawingPreview.tsx`, and `drawingData.ts`, plus the engine components, editors, and presets that the findings below cite.
- **Evidence:** each fixed finding has an xUnit regression test in `server/LessonCue.Server.Tests/ActivityGamesAuditTests.cs`. All 21 of those tests failed on `main` and pass with this change. The body-size limit was measured against a running Kestrel server. Two open findings, the concurrent-launch race and clue-ladder scoring, were checked with throwaway probes that were not committed; their output is quoted below.
- **Validation:** see [Validation](#validation) at the end.

### Where the brief and `main` disagree

The brief this audit started from describes behavior that is not on `main`. It appears to describe a local working tree with unpushed changes: its `ActivitySessionService.cs` line numbers run about 140 lines ahead of `main`. The findings below are against `main`. Whoever merges this should check them against that working tree.

| Brief says | `main` actually does |
| --- | --- |
| The join code shows only in the opening lobby (`OpeningRunId`). | There is no `OpeningRunId`. The code is projected in every active phase (`ActivitySessionService.cs:4490`, `:4497`), and the TV draws it in a corner banner during play (`ActivityDisplay.tsx:255-262`). |
| Names are checked against an offensive-name filter. | There is no filter. `NormalizeDisplayName` only trims and truncates to 40 characters (`:5338`). |
| Phones fall back to a device-wide token, `lessoncue:activity-device-token`. | Phones store one token per code only (`ActivityParticipant.tsx:23`). |
| Team scores are recalculated from the score ledger. | The team leaderboard reads the stored `ActivityTeam.Score` total (`:4543`), which `AwardScoreAsync` and `UndoScoreAsync` adjust (`:3887`, `:3326`). |
| Team rows are reused by position across games. | `SetTeamsAsync` and team generation delete the lobby's teams and create new ones (`:872`, `:2914`). See AUD-23. |

## Severity scale

- **High:** breaks a core game mechanic, loses data, lets a player cheat, or lets an anonymous caller exhaust server resources.
- **Medium:** gives a wrong result in a common flow, or exposes information to a player who makes some effort.
- **Low:** edge cases, hardening, and diagnostics.

## Summary

| ID | Sev. | Area | Finding | Status |
| --- | --- | --- | --- | --- |
| AUD-01 | High | Scores, moderation | "Reset" on one game deleted every game's points in the lesson and let removed or locked players back in. | Fixed |
| AUD-02 | High | Fake Out | The real answer was always the last option, and its id was the literal string `"truth"`. A vote for `"truth"` scored without reading anything. | Fixed |
| AUD-03 | High | Order Up, Connections | Cards were dealt in authoring order, which is the answer for every shipped preset. Pressing "Lock in order" straight away scored full marks. | Fixed |
| AUD-04 | High | Rapid Fire | With the auto-pilot on, which is the default, every question after the first refused all answers ("This rapid-fire question has ended."). | Fixed |
| AUD-05 | High | Survivor Trivia | Being eliminated carried into every later game in the lesson, so the player's phone could not answer anything. | Fixed |
| AUD-06 | High | API | Anonymous JSON endpoints accepted request bodies up to the server-wide 20 GB limit, and each body is read into memory whole. | Fixed |
| AUD-07 | Medium | Survey Board | Only the first answer a team or player matched in a question scored. | Fixed |
| AUD-08 | Medium | Host awards | Pressing the same award again, such as the Physical Room "+100 · Team 1" button, was silently dropped. | Fixed |
| AUD-09 | Medium | Scores | "Clear scores" never cleared team standings. | Fixed |
| AUD-10 | Medium | Bracket | A bracket that seats "participants" or "teams" found nobody when it was not the lesson's first game. | Fixed |
| AUD-11 | Medium | Quiz speed bonus | A quick placeholder answer, changed later to the real one, kept the full speed bonus. | Fixed |
| AUD-12 | Medium | Punchline | Players could vote for their own response. | Fixed |
| AUD-13 | Medium | Buzzer | Only the latest miss stayed locked out. After a second miss, the first player could buzz again. | Fixed |
| AUD-14 | Medium | Input handling | A payload that was not a JSON object, or a malformed Match-Up or Connections answer, caused a 500 error. | Fixed |
| AUD-15 | Medium | Telephone Draw | A description step stored and later rebroadcast whatever the phone sent, of any size. | Fixed |
| AUD-16 | Low | Join codes | Looking up a retired code shared by several ended runs threw an exception (a 500). | Fixed |
| AUD-17 | Low | Engine config | A decimal points value, such as `12.5`, made the reveal fail with a 500. | Fixed |
| AUD-18 | Low | TV display | The TV's 5-second safety poll never ran for lesson cues. | Fixed |
| AUD-19 | High | Buzzer, Clue Ladder | A correct buzz earns the first clue's points no matter how many clues are showing, and "Next clue" starts the ladder over on screen. | Open |
| AUD-20 | Medium | Image Reveal, Buzzer | The unrevealed image URL and the upcoming clues are sent to every phone. | Open |
| AUD-21 | Medium | Concurrency | Launching the same cue concurrently creates duplicate runs and lobbies. | Open |
| AUD-22 | Medium | Privacy | Activity session data is never purged. `RetentionDays` is not used anywhere. | Open |
| AUD-23 | Medium | Teams | Regenerating teams disconnects earlier team points from their team, so they drop off the team board. | Open |
| AUD-24 | Medium | Legacy engines | Public reads and SignalR broadcasts carry raw legacy config, including answers. | Open |
| AUD-25 | Medium | API | Anonymous `POST /activity-runs` returns 500s and can switch a lesson's lobby back to an older game. | Open |
| AUD-26 | Low | Performance | Every read writes a heartbeat to the database, and polling keeps a session alive forever. | Open |
| AUD-27 | Low | Performance | Each projection resolves the join address, which reads a file and lists network interfaces. | Open |
| AUD-28 | Low | Host UI | Host clients never send `expectedRevision`. | Open |
| AUD-29 | Low | Host UI | "Clear scores" takes one tap, with no confirmation or undo. | Open |
| AUD-30 | Low | Privacy | The public roster is visible in every phase, and phones receive other players' lives. | Open |
| AUD-31 | Low | Poll | "Previous" shows the wrong round's tally and skips scoring. | Open |
| AUD-32 | Low | Quiz | Lives are taken again when a question is revealed a second time. | Open |
| AUD-33 | Low | Library API | An update is validated against a type it never saves, and `EngineType` can be set to anything. | Open |
| AUD-34 | Low | Legacy engines | Legacy commands are accepted after a run ends, and they read the live definition, not the run's snapshot. | Open |
| AUD-35 | Low | SignalR | The hub accepts any group name, with no limit per connection. | Open |
| AUD-36 | Low | Moderation | Removing a player is not a ban. A fresh token rejoins. | Open |
| AUD-37 | Low | Auto-pilot | The auto-pilot keeps driving games nobody is watching, and that keeps them alive. | Open |
| AUD-38 | Low | Bracket | Imported finalists are ranked by lesson-wide totals, not by the source game's points. | Open |
| AUD-39 | Low | Tokens | The participant token travels in a query string. | Open |
| AUD-40 | Low | Join codes | Two lobbies created at once can collide on a code, and the loser gets a 500 instead of a retry. | Open |
| AUD-41 | Low | Punchline | Phones cannot tell which response is their own. | Open |
| AUD-42 | Low | Physical Room | `revealText` is sent before the reveal. | Open |
| AUD-43 | Low | Lifecycle | Legacy runs also expire after two idle hours, so a scoreboard left over lunch starts again at zero. | Open |

## Fixed in this change

### AUD-01 — High — Resetting one game wiped the whole lesson's scores and moderation

**Where:** `ActivitySessionService.ResetAsync` (`:727-759`), with `LoadRunAsync` (`:5057-5082`). The host reaches it through `POST /activity-runs/{id}/reset`, which the Reset buttons in the Trivia, Rapid Fire, Survey Board, Image Reveal, and Poll controllers call. The Trivia button is at `TriviaController.tsx:103-120`.

**What happened:** `LoadRunAsync` fills `run.Participants`, `run.Teams`, and `run.ScoreEvents` with the whole lobby's rows so that totals carry across a lesson. `ResetAsync` treated those lists as belonging to one game:

- `RemoveRange(run.ScoreEvents)` deleted every score event in the lesson since the last "Clear scores", from every game.
- Every team's `Score` was set to zero.
- Every participant's status was set to `"active"`, which re-admitted players the host had removed or locked.

The confirmation the host sees says only "Reset trivia to Question 1?".

**Fix:** delete only this run's score events, rebuild each team's total from the rest of the ledger, and lift only `eliminated` statuses. Removed and locked players stay that way.

**Test:** `ResettingOneGameKeepsTheLessonsOtherScoresAndModeration`. Before the fix, game 1's 100 points dropped to 0.

### AUD-02 — High — Fake Out gave away the real answer

**Where:** the Fake Out projection (`:4598-4618`) appended the truth after the bluffs and gave it the id `"truth"`. `SaveVoteAsync` accepted that literal id (`:3283-3287`). The TV (`InteractiveGames.tsx:98`) and the phone (`ActivityParticipant.tsx:253`, `:374`) both render options in the order received.

**What happened:** during voting, the truth was always the last option on the TV and on every phone. Its id, `"truth"`, is visible in any network response. A client could send `{"targetId":"truth"}` and score truth-finder points without looking. The existing browser test relied on this: it clicked `.last()` to find the truth (`zz-activity-games.spec.ts:628`).

**Fix:**

- `openvoting` gives each round an opaque `truthOptionId`, a random GUID.
- The projection sorts every option by id. All the ids are random, so the order is a stable shuffle that stays the same between polls.
- The projection removes `truthOptionId` from public state.
- A vote naming the round's opaque id is stored as the canonical `"truth"`, so scoring is unchanged. The literal `"truth"` is refused once a round has an opaque id. Rounds whose voting was already open when this change is deployed keep accepting the literal.

**Tests:** `FakeOutVotingDoesNotRevealWhichOptionIsTheTruth`. Two existing server tests and one browser test now vote with the projected id, found through the host's config.

### AUD-03 — High — Order Up and Connections dealt the cards in the answer order

**Where:** `ProjectPublicConfig` (`:4971-4983`) kept each round's `items` in authoring order, and the grouping projection (`:4733-4739`) did the same. The phone seeds its list from that order (`ActivityParticipant.tsx:405-406`), and so does the TV (`RichInteractionGames.tsx:62-66`).

**What happened:**

- All eight sequencing presets list their items in `correctOrder` (`activityPresetRegistry.ts:359-366`), and the editor's "+ Add item" appends to both `items` and `correctOrder` (`RichInteractionGames.tsx:217-218`). The room therefore saw the answer on the TV, and the phone began already solved, so "Lock in order" scored 100%.
- Connections clues are authored group by group (`activityPresetRegistry.ts:368`), so their order gave away the groups.

**Fix:** `DealRoundItems` orders the cards by a SHA-256 hash of the run, round, and item id. The order is stable for a run, so a phone keeps the player's arrangement between polls. If the dealt order ever matches the answer, or for Connections the authored order, it is rotated by one card. The config projection and the grouping state projection use the same deal.

**Tests:** `OrderingNeverPresentsItemsInTheAnswerOrder` and `ConnectionsNeverPresentsCluesInTheirGroupOrder`. Two browser tests assumed the authored order and now work from whatever order is dealt.

### AUD-04 — High — Rapid Fire questions after the first refused every answer

**Where:** the quiz `open` handler (`:1100-1106`) set no timer. `next` clears `targetAt` and `remainingMs` (`:1143`), so `RapidFireRemainingMs` returned 0 and the participant check (`:1157-1158`) refused the answer.

**What happened:**

- `start` arms the clock for question 1 only. With the auto-pilot on, which is the default for Rapid Fire, question 2 onward is opened with `open` (`ActivityAutoPilot.cs:168-169`). Every phone then got "This rapid-fire question has ended." while the window showed as open.
- The auto-pilot also closed windows on its 30-second default instead of each question's own `timerSeconds` (`ActivityAutoPilot.cs:224-246`).

**Fix:** `open` arms the question's clock unless the run is paused or the clock is already running. `ResponseDeadline` closes on `targetAt` when a question has one.

**Test:** `RapidFireQuestionsAfterTheFirstAcceptAnswersWhenOpened`. Before the fix it failed with "This rapid-fire question has ended.".

### AUD-05 — High — A Survivor Trivia elimination silenced the player for the rest of the lesson

**Where:** `ScoreQuizAsync` set `participant.Status = "eliminated"` (`:3485`) on the lobby-wide participant. Only another lives-enabled quiz resets that status (`InitializeQuizParticipants`, `:5298-5308`). `GetParticipantViewAsync` requires `Status == active` before a phone may respond (`:455-457`).

**What happened:** after a knockout in one game, the player's phone showed "can't respond" in every later poll, drawing, or other game in the lesson.

**Fix:** starting any game from its lobby puts eliminated players back to active. Removed and locked players are unchanged.

**Test:** `AQuizEliminationDoesNotFollowThePlayerIntoTheNextGame`.

### AUD-06 — High — Anonymous endpoints accepted bodies up to 20 GB

**Where:** `Program.cs:49` sets Kestrel's `MaxRequestBodySize` to 20 GB for the whole server, for media uploads. Model binding reads a JSON body into memory in full before any handler can refuse it. The rate limits allow 600 to 1,200 requests per minute per IP.

**Measured:** before the fix, a 1 MB `POST /activity-sessions/join/ABCD` was read and processed (HTTP 409), and so was a 300 KB participant action (HTTP 400).

**Fix:** per-endpoint `IRequestSizeLimitMetadata` limits, which routing applies before the body is read:

- 16 KB for join and `POST /activity-runs`.
- 256 KB for participant actions and host commands. A drawing is at most about 100 KB.

**Measured after the fix:** 413 for the 1 MB join and the 300 KB action; a 200 KB action is still processed.

### AUD-07 — Medium — Survey Board scored only the first answer a team matched

**Where:** `matchanswer` (`:3188-3205`) awarded points with the fixed reason "Matched survey answer". `AwardScoreAsync` skips any award whose participant or team, round, and reason match an existing event (`:3882`).

**What happened:** a team, or a solo buzz winner, that revealed several board answers in one question was credited only for the first. The board's banked total disagreed with the standings.

**Fix:** the reason now includes the answer's rank, for example "Matched survey answer #2". Revealing the same answer twice still scores once.

**Test:** `SurveyBoardCreditsEveryAnswerAPlayerMatches`. Before the fix: 60 points instead of 100.

### AUD-08 — Medium — A repeated host award was silently dropped

**Where:** `AwardFromPayloadAsync` (`:3310-3316`) goes through the same duplicate check as automatic scoring. The Physical Room award button sends a fixed reason with no round id (`PhysicalRoomGames.tsx:151`).

**What happened:** pressing "+100 · Team 1" a second time, in any round, returned success but recorded nothing.

**Related problem:** host awards also accepted any participant or team GUID. An unknown id caused a foreign-key 500 error. An id from another class's lobby wrote points under this lobby.

**Fix:**

- Host awards skip the duplicate check. Automatic scoring keeps it.
- The named participant or team must belong to this lobby.

**Test:** `AHostCanAwardTheSameTeamAgain`. Before the fix: 100 points instead of 200.

### AUD-09 — Medium — "Clear scores" left team standings unchanged

**Where:** `resetscores` (`:1023-1035`) only sets `ScoresResetAt`. The team leaderboard reads `ActivityTeam.Score` (`:4543`).

**Fix:** clearing scores also resets the team totals to zero.

**Test:** `ClearingScoresAlsoClearsTeamStandings`. Before the fix the team still showed 150.

### AUD-10 — Medium — A bracket later in a lesson had nobody to seat

**Where:** `EnsureBracketEntrantsAsync` (`:4018-4033`) filtered participants and teams by `ActivityRunId == run.Id`. That column records the game in which a player first joined.

**Fix:** entrants now come from the lobby's roster.

**Test:** `ABracketLaterInTheLessonSeatsPlayersWhoJoinedEarlier`. Before the fix it failed with "Add at least two active participants or teams…".

### AUD-11 — Medium — The speed bonus timed the first answer, not the final one

**Where:** a changed answer updated the stored payload but kept `SubmittedAt` (`:1198-1201`). The speed bonus reads `SubmittedAt` (`:3453-3458`), and so does "first correct" (`:4414-4418`).

**Fix:** `SubmittedAt` moves when the answer actually changes. Resending the same answer keeps its time.

**Test:** `TheSpeedBonusIsMeasuredFromTheFinalAnswer`. Before the fix: 150 points instead of 100.

### AUD-12 — Medium — Punchline allowed voting for your own response

**Where:** the creative vote passed no `preventSelfVote` (`:1423`). Fake Out and Drawing already refuse self-votes.

**Fix:** creative votes refuse the voter's own response, in both gallery and head-to-head voting. One existing test voted for its own response and now cross-votes. The winner in that test is chosen explicitly, so its result is unchanged.

**Test:** `PunchlineRefusesAVoteForYourOwnResponse`.

### AUD-13 — Medium — Buzzer lockout forgot earlier misses

**Where:** the buzzer engine kept a single `lockedOutParticipantId` slot (`:1333-1347`, `:1369`).

**What happened:** after two misses on the same clue, the first player who missed could buzz again.

**Fix:**

- Misses now accumulate in `lockedOutParticipantIds`, alongside the old field.
- Reset buzzers, reveal clue, and next clear the list.
- Public projections strip the list, and each phone's `isLockedOut` reads it.
- The host note now counts the misses.

**Test:** `EveryPlayerWhoMissesStaysLockedOutForTheClue`.

### AUD-14 — Medium — Malformed payloads caused 500 errors

**Where:** the `ReadString`, `ReadInt`, and related helpers call `JsonElement.TryGetProperty` (`:5371-5407`), which throws when the payload is not an object. Match-Up and Connections called `GetString()` on elements they had not type-checked (`:1713-1742`).

**What happened:** any participant could send a string, array, or number as the payload and get a 500 error and a stack trace in the troubleshooting log. Anyone with the join code can send these at 600 requests per minute.

**Fix:** both command entry points treat a payload that is not an object as absent. Match-Up and Connections check each element's type before reading it.

**Tests:** `NonObjectParticipantPayloadsAreRefusedNotThrown` and `MalformedMatchUpAnswersAreRefusedNotThrown`.

### AUD-15 — Medium — Telephone descriptions stored and rebroadcast anything

**Where:** a description step checked only `text`, then stored the whole payload (`:1619-1631`). The chain reveal (`:4679-4690`) and the next player's source view (`:4661-4676`) send stored `strokes` to the TV and to phones.

**What happened:** combined with AUD-06, one phone could store megabytes per step, and those bytes were broadcast to every client at the reveal.

**Fix:** only the validated field is stored: `text` for a description step and `strokes` for a drawing step. That matches what the phone sends.

**Test:** `TelephoneDescriptionsKeepOnlyTheirText`.

### AUD-16 — Low — A retired code could cause a 500 error

**Where:** when no lobby holds a code, `FindByJoinCodeAsync` falls back to `SingleOrDefaultAsync` on `ActivityRun.JoinCode` (`:222-224`). That column stopped being unique once lobbies existed. `ReleaseDormantCodeAsync` retires the lobby's code but leaves each run's copy of it (`:5214-5241`).

**Fix:** the fallback considers only live runs from before lobbies existed (`SessionGroupId == null`) and uses `FirstOrDefault`.

**Test:** `ARetiredCodeSharedByEndedRunsResolvesToNothingInsteadOfThrowing`. Before the fix: "Sequence contains more than one element".

### AUD-17 — Low — A decimal points value broke the reveal

**Where:** `IntValue` and `LongValue` (`:5364-5365`) used `GetValue<int>()` and `GetValue<long>()`, which throw on `12.5` and on `"100"`. Punchline prompt points, among other fields, are not type-checked by validation.

**Fix:** both helpers now accept whole numbers, rounded decimals, and numeric strings, and fall back to the default otherwise. `StringValue` and `BoolValue` still throw on a mismatched type; see the recommendations.

**Test:** `ADecimalPointValueDoesNotBreakTheReveal`.

### AUD-18 — Low — The TV's safety poll never ran for lesson cues

**Where:** the 5-second poll in `ActivityDisplay` read only `propRunId` or `initialEnvelope.runId` (`ActivityDisplay.tsx:181-187`). The web player (`WebPlayer.tsx:1486-1491`) and the Android TV route (`ActivityTvDisplay.tsx`) mount lesson cues by definition id, so the poll did nothing on the main TV path.

**Fix:** the poll now uses the run id once it has been resolved.

**Verification:** covered by typecheck and the display browser tests; see [Validation](#validation).

## Open findings

### AUD-19 — High — Clue ladders score and navigate inconsistently

**Where:** `correct` awards `clues[currentClueIndex].points` (`:1331`), but `revealclue` advances `cluesRevealed` (`:1309-1323`). The TV shows `clues.slice(0, cluesRevealed)` (`InteractiveGames.tsx:41-48`) with each clue's point value. `next` moves `currentClueIndex` on and resets `cluesRevealed` to 0 (`:1360`).

**Probe (not committed):** with the Clue Ladder preset's values of 300, 200, and 100, a correct buzz after all three clues were revealed awarded 300. The TV's highlighted current clue read "100 POINTS". After `next` and one `revealclue`, the state read `currentClueIndex=1, cluesRevealed=1`, so the TV showed clue 1 again while the answer and points came from clue 2.

Every buzzer preset writes its clues as one ladder with one answer (`activityPresetRegistry.ts:204-260`), and the host button offers "Next clue" after a correct answer.

**Recommendation:** decide the model.

- **One ladder per game:** award the points of the latest revealed clue, and replace "Next clue" with "Finish".
- **Several ladders:** make them rounds that each hold their own clue list.

Either model needs a matching controller label and display. This change does not pick one.

### AUD-20 — Medium — Hidden media and upcoming clues reach every phone

**Image Reveal:** the image is hidden only by CSS or a canvas effect. The public and participant config still carries `imageUrl`, `mediaId`, and `audioUrl` (`ProjectPublicConfig`, `:4984-4989`), and the TV builds `/api/v1/media/{mediaId}/playback` from them (`ImageRevealDisplay.tsx:47`). Any phone can open the full image before the reveal. The architecture note says CSS is never a security boundary, but here it is the only one.

**Buzzer:** every clue's `prompt` is public from the start. Only `answer` is removed (`:4958-4961`), so a phone can read the easier clues early.

**Recommendation:**

- Do not send media URLs to the participant role unless a phone needs them.
- For real secrecy, serve reveal stages as images derived on the server.
- Project only the clues revealed so far.

### AUD-21 — Medium — Concurrent launches create duplicate runs and lobbies

**Where:** `GetOrCreateRunAsync` (`ActivityService.cs:625-708`) reads and then inserts with no lock. Nothing unique covers `(LessonItemId, not ended)`, and `ActivitySessionGroup.LessonId` has an index but it is not unique (`LessonCueDb.cs:116`). `ActivityService` and `ActivitySessionService` also keep separate lock dictionaries for the same run ids (`ActivityService.cs:14`, `ActivitySessionService.cs:34`), and both are per-process.

**Probe (not committed):** four concurrent launches of the same game for the same lesson, each with its own `DbContext` on a file-backed SQLite database, created 4 runs in 3 lobbies with 3 different join codes. Two launches shared a lobby, and the other two each opened their own.

**Impact:** the TV and the host remote both call `POST /activity-runs` when a cue starts. If they race, the TV can show one run while the phones follow another lobby, and joiners are split across codes.

**Recommendation:**

- Serialize run creation per lesson or lesson item, using a keyed lock or a unique partial index with retry.
- Make the lobby unique per active lesson.
- Handle `DbUpdateException` on group inserts by re-reading.

### AUD-22 — Medium — Activity session data is never purged

**Where:** `ActivityRun.RetentionDays` defaults to 7 (`ActivityModels.cs:240`), but no code reads it, and no service deletes activity participants, submissions, drawings, or votes.

**Impact:** the architecture document calls these rows short-lived, but students' names, free-text answers, and drawings are kept for as long as the database exists.

**Recommendation:** add a background purge, like `AudienceRetentionService`, that deletes ended runs past their retention and lobbies with no remaining runs.

### AUD-23 — Medium — Regenerating teams disconnects earlier team points

**Where:** `SetTeamsAsync` (`:859-888`) and team generation (`:2913-2915`) delete the lobby's team rows. `ActivityScoreEvent.TeamId` is set to `NULL` on delete (`LessonCueDb.cs:146-147`).

**Impact:** points a team earned in earlier games lose their team, and team-only awards disappear from every board.

**Recommendation:** rename and reuse existing team rows by position, as the brief describes, or soft-delete teams with `Active = false`.

### AUD-24 — Medium — Legacy engines publish their raw config

**Where:** `GET /activity-runs/{id}` and the reset, end, and create responses return raw `StateJson` and `ConfigJson` for legacy runs (`ActivityApi.cs:17-44`, `:250-269`, `:318-337`, `:358-377`). The legacy SignalR broadcast does the same (`ActivityService.cs:790-810`).

**Affected types:** the legacy-only types are Wheel, Picker, Prize Grid, Scoreboard, Countdown, Image Shuffle, Ranking, Responses, Emoji Prompt, Rank It, and Word Scramble, plus old definitions with no engine. Their configs contain hidden prizes, correct orders, and unscrambled words.

**Exposure:** a client needs the run GUID. These games have no phone flow, so students do not normally have it.

**Recommendation:** send legacy public reads through a redacting projection, or migrate these types onto engines.

### AUD-25 — Medium — Anonymous run creation is loosely checked

`POST /activity-runs` requires no sign-in:

- An unknown `activityDefinitionId` throws `InvalidOperationException` and returns a 500 (`ActivityService.cs:632-633`).
- An unknown `lessonId` or `lessonItemId` fails a foreign key, also a 500.
- A valid lesson id and definition id reuse a live run for that lesson. `AttachSessionGroupAsync(activate: true)` then points the lobby at that run (`:118-132`), which moves every phone back to an older game.

**Exposure:** phones see `definitionId` and `runId` but never the lesson id, which limits who can do this.

**Recommendation:** return 404 and 400 instead of 500. Require a TV or controller credential before a request may activate a lesson's lobby.

### AUD-26 — Low — Every read writes, so sessions never go idle

**Where:** the public, display, participant, and host reads each save `UpdatedAt` for the run and its lobby (`:344-354`, `:385-395`, `:423-431`, `:468-478`). They also take the run lock through `EnsureInteractiveRunAsync`.

**Impact:**

- 30 phones polling every 5 seconds, plus a TV, make about 7 SQLite writes a second while nothing is happening.
- The two-hour expiry measures inactivity, so any open tab keeps a lobby alive indefinitely. This is brief flag 7.

**Recommendation:** write the heartbeat at most once a minute. Consider a hard maximum age for a lobby.

### AUD-27 — Low — Join-address resolution is expensive and runs on every projection

**Where:** `ResolveJoinUrl` reads the mode file and enumerates network interfaces on every call (`ActivityJoinAddressService.cs:97-131`, `:160-236`). Every display projection and every host view calls it (`:4497`, `:498`).

**Recommendation:** cache the result for a few seconds and clear the cache when settings change.

### AUD-28 — Low — Host clients never send `expectedRevision`

**Where:** the server checks the revision when one is sent (`:714-715`), but no client sends it. The field exists only in `types.ts:86`.

**Impact:** a teacher's laptop and phone remote can both press "Next" and skip a question.

**Recommendation:** send the revision the host is looking at with phase-changing commands. On a conflict, refresh and let the host confirm.

### AUD-29 — Low — "Clear scores" has no confirmation or undo

**Where:** `ActivityLiveHostPanel.tsx:208-213`. It sits next to "Reset players", which does ask for confirmation.

**Recommendation:** ask for confirmation, and offer "Undo clear" by restoring the previous `ScoresResetAt`. The Reset buttons' confirmation text should also say what a reset clears.

### AUD-30 — Low — Roster and lives are visible beyond the documented limits

- `GET /activity-sessions/join/{code}` returns every active participant's id, name, and team in every phase (`:356-365`). The display projection shows the roster only in the lobby, on purpose (`:4502-4527`).
- Phones receive every player's lives (`:4545-4559`) and the full leaderboard (`:4529-4544`), although comments say other players' scores stay off phones.

**Recommendation:** apply the lobby-only rule to the public view, or document why it does not apply.

### AUD-31 — Low — Poll "Previous" keeps the later round's state

**Where:** `prev` (`:1239-1240`) leaves `votes`, `totalVotes`, and `scoresApplied` untouched.

**Impact:** revealing the earlier round shows the later round's distribution and skips its scoring.

**Recommendation:** rebuild the tally for the round being shown and reset `scoresApplied`.

### AUD-32 — Low — Lives are taken again on a second reveal

**Where:** `next` resets `scoresApplied`, and lives are not ledger events (`:3482-3486`). After Previous and then Next, revealing a question again takes another life from each wrong answer.

**Recommendation:** record life loss per question, in state or as ledger rows, and make it idempotent.

**Design question:** a player who does not answer loses no life, so in Survivor Trivia staying silent is safer than guessing.

### AUD-33 — Low — Library updates are validated against a type they never save

**Where:** `PUT /activities/{id}` validates the config against `input.Type`, but `UpdateDefinitionAsync` never changes `Type` (`ActivityApi.cs:163-182`, `ActivityService.cs:230-289`). The update also accepts any `EngineType`, and adding one moves a legacy definition's live runs onto the interactive path with incompatible state.

**Exposure:** this needs Planning access.

**Recommendation:** validate against the stored type, and accept only catalog engine values.

### AUD-34 — Low — Legacy commands after a run ends, and live config

**Where:** `ExecuteCommandAsync` (`ActivityService.cs:733-818`).

- It accepts commands on ended runs.
- It enforces the revision only when a client sends one.
- It reads `ActivityDefinition.ConfigJson` from the live definition, so editing the definition changes a game in progress. Interactive runs read their snapshot instead (brief flag 10).

### AUD-35 — Low — The SignalR hub accepts any group name

**Where:** `JoinRun(string runId)` adds the connection to `run:{runId}` for any string, with no limit on how many groups one connection joins (`ActivityHub.cs:5-9`).

**Recommendation:**

- Accept only GUIDs.
- Cap group memberships per connection.
- Optionally require the same display or participant credential the REST endpoints use.

### AUD-36 — Low — Removing a player is not a ban

**Where:** `JoinAsync` refuses a removed player's token (`:304-305`), but clearing browser storage creates a new player (`:268-301`). The comment at `:3331-3332` says the phone "cannot simply reconnect".

**Recommendation:** document this as a soft removal. For a hard ban, a lobby-level device marker or a host-approved join mode would be needed.

### AUD-37 — Low — The auto-pilot drives games nobody is watching

**Where:** `ActivityAutoPilotService` advances any due run (`ActivityAutoPilotService.cs:49-72`), including runs that are no longer their lobby's current game.

**Impact:** an abandoned game plays itself through every question, and each commit refreshes `UpdatedAt` and the lobby's activity time.

**Recommendation:** skip runs that are not their lobby's current run.

### AUD-38 — Low — Bracket finalists are ranked by lesson-wide totals

**Where:** `BuildBracketHandoffCandidates` sums `source.ScoreEvents` (`:4146-4153`), which is lobby-wide once groups exist.

**Recommendation:** filter by `ActivityRunId == source.Id`.

### AUD-39 — Low — The participant token travels in a query string

**Where:** `GET …/participant-state?participantToken=…` (`api.ts:173-175`).

**Current state:** LessonCue does not log query strings. `Microsoft.AspNetCore` logs at Warning level, and the failure middleware logs only `Path`. Cloudflare and other proxy access logs may still record the URL.

**Recommendation:** move the token to a header.

### AUD-40 — Low — Two lobbies created at once can collide on a code

**Where:** `NewJoinCodeAsync` checks whether a code is in use, and the insert happens later (`:5126-5161`). Nothing catches the `DbUpdateException` that the unique index raises (`ReservedGameCodePool.cs:57-60` says the database settles such races), so the losing request returns a 500.

**Recommendation:** catch the unique-index violation and retry with a fresh code.

### AUD-41 — Low — Punchline phones cannot tell which response is theirs

**Where:** the creative projection has no `isOwn` flag (`:4571`). Drawing has one.

**Impact:** now that AUD-12 refuses self-votes, a player who taps their own response sees an error.

**Recommendation:** add `isOwn` and disable that option on the phone.

### AUD-42 — Low — Physical Room reveal text is sent early

**Where:** `revealText` is in the public config and in `currentRound` before the reveal (`:4865`).

**Impact:** the shipped presets use generic reveal text, but a teacher who writes an answer there sends it to every phone early.

**Recommendation:** send it only after the reveal.

### AUD-43 — Low — Legacy runs also expire after two idle hours

**Where:** `GetOrCreateRunAsync` ends any run idle for two hours (`ActivityService.cs:651-655`), legacy runs included. The legacy display read does not refresh `UpdatedAt`.

**Impact:** a Scoreboard cue left over lunch comes back at zero.

**Recommendation:** limit the idle rule to interactive runs, or make the reset visible to the teacher.

## The brief's audit flags

1. **Legacy public-state leakage.** Confirmed. See AUD-24.
2. **Unauthenticated run creation.** Confirmed. Duplicate runs come from concurrency (AUD-21), not from a caller reaching another class. Arbitrary lesson ids fail a foreign key with a 500. A caller who knows valid ids can move a lesson's lobby. See AUD-25.
3. **Public run ids and SignalR.** Every interactive broadcast goes through `BroadcastDisplayAsync`, which uses the Display projection (`:3969-3975`). No host envelope reaches a public group. Fixed leaks inside the Display projection: AUD-02, AUD-03, AUD-15. Open ones: AUD-20, AUD-42. The hub itself: AUD-35.
4. **Participant tokens.** Tokens are 24 random bytes from `crypto.getRandomValues`, stored as SHA-256 hashes salted with the lobby id. The app does not log them. The query string: AUD-39. Removal is not a ban: AUD-36.
5. **Process-local locking.** Confirmed. There are two separate per-process lock dictionaries and no handling of the unique-index exception. See AUD-21 and AUD-40. Anything beyond one server process would need a distributed lock or database constraints.
6. **Permanent short URLs with reusable codes.** A reused code resolves to whichever lobby holds it now. A retired lobby's data is never served through it, because the lookup requires a current run (`:209-220`). After AUD-16, a retired code resolves to nothing. That printed QR codes eventually point at a different class is a product decision.
7. **Heartbeat-driven expiry.** Confirmed. See AUD-26.
8. **Reset semantics.** This was a real data-loss bug and is fixed. See AUD-01.
9. **Activity retention.** Confirmed unused. See AUD-22.
10. **Legacy versus interactive snapshots.** Confirmed. See AUD-34.

## The brief's test matrix

| # | Scenario | Coverage |
| --- | --- | --- |
| 1 | Healthy shortener | Already covered by `ActivitySessionGroupTests` (`WithTheShortenerRunningAGameTakesAReservedCode`, and reserved-code reuse) and `ActivityJoinAddressTests`. |
| 2 | Shortener unavailable | Already covered by `WithoutTheShortenerAGameNeverTakesAReservedCode` and the fallback tests in `ActivityJoinAddressTests`. |
| 3 | Code normalization | Already covered by `ReservedGameCodeTests` and `LegacyFiveDigitCodesAreRejectedAndRotated`. The alphabet has 32 characters, so mapping bytes with modulo 32 is unbiased. |
| 4 | Same lesson | Already covered by `ActivitySessionGroupTests`. Added: `ARetiredCodeSharedByEndedRunsResolvesToNothingInsteadOfThrowing`. |
| 5 | Player reset | Already covered by `HostCanLockUnlockAndResetThePlayerLobby`. Added: `ResettingOneGameKeepsTheLessonsOtherScoresAndModeration`. |
| 6 | Expiration | Already covered by `AJoinCodeStopsResolvingAfterTwoHoursOfInactivity`. The polling behavior is AUD-26. |
| 7 | Projection security | Added: `FakeOutVotingDoesNotRevealWhichOptionIsTheTruth`, `OrderingNeverPresentsItemsInTheAnswerOrder`, `ConnectionsNeverPresentsCluesInTheirGroupOrder`, and the buzzer lockout projection. Legacy redaction is still open (AUD-24). |
| 8 | Concurrency | Probed. See AUD-21. Duplicate joins with the same token are already covered by a browser test in `zz-activity-reliability.spec.ts`. |
| 9 | Revisions | The server's stale-revision check is covered. The host never sends a revision (AUD-28). The client's ordering is covered by `activityConnection.test.mjs`. |
| 10 | Privacy and tokens | Checked by reading the code. See AUD-39. |

## Recommended improvements

These are listed in priority order, beyond the individual findings.

1. **Keep each game's state separate from the lobby's.** Status, lives, and team rows are shared by the whole lesson, which is the root cause of AUD-01, AUD-05, AUD-10, and AUD-23. Per-game facts such as elimination, lives, and knockouts belong in run-scoped rows or run state. Operations that reach lobby-wide collections, like `RemoveRange(run.ScoreEvents)`, should need an explicit lobby-level intent.
2. **Give the score ledger explicit idempotency keys.** Today the duplicate guard compares participant or team, round, and reason, which is what caused AUD-07 and AUD-08. Give each automatic award a key that names what earned it, such as `quiz:{run}:{question}:{participant}` or `survey:{run}:{question}:{rank}`, and skip only on an exact key match. Derive team totals from the ledger, as the brief describes, instead of a stored counter.
3. **Add a property test for secrets in projections.** Build every engine and preset with sentinel secrets, such as answers, truths, prizes, correct orders, and image URLs, and assert that the display and participant projections never contain them in any phase before the reveal. AUD-02, AUD-03, AUD-20, and AUD-42 would all have failed this test.
4. **Let the server own presentation order.** Any list the room chooses from should arrive in a stable server-side shuffle: Fake Out options, drawing and punchline galleries, and ordering cards. The deal helper added here can be reused.
5. **Type the participant action payloads.** Replace the scattered `ReadX` helpers with small DTOs for each action, bound with size limits. Make `StringValue` and `BoolValue` as tolerant as `IntValue` is now.
6. **Make runs and lobbies safe under concurrency.** Add a unique partial index for one live run per lesson item and one active lobby per lesson, retry on `DbUpdateException`, and use one lock provider for both services. See AUD-21 and AUD-40.
7. **Reduce load on busy games.** Throttle heartbeats, cache the join address, and avoid running `EnsureInteractiveRunAsync`, which takes the lock and saves, on every public read. See AUD-26 and AUD-27.
8. **Enforce retention.** Honor `RetentionDays` with a purge service, and describe activity data in `privacy.md`. See AUD-22.
9. **Make host controls safer.** Send `expectedRevision` on transitions, ask for confirmation and offer undo on Clear scores, and explain in the confirmation dialogs what "Reset this game" and "Reset players" each clear. See AUD-28 and AUD-29.
10. **Decide the clue ladder model** before adding more buzzer presets. See AUD-19.

## Validation

- **Server, new tests:** 21 tests in `ActivityGamesAuditTests`. All 21 failed on `main`, each for the reason its finding describes. All 21 pass with this change.
- **Server, full suite:** 575 of 575 tests pass. That is the existing 554 plus the 21 new ones.
- **Web:** `npm run typecheck:admin` and `npm run build:admin` pass. `npm run lint` reports 0 errors and the same 15 warnings as before; none are in files this change touches. `npm run test:units` passes 23 of 23. The other CI web checks also pass: `test:protocol`, `test:network-config`, and `test:amazon`.
- **Browser, activity suite:** 137 tests, covering `activity-tv-display.spec.ts` and every `zz-activity-*` spec. 136 passed, including the four this change edits: Fake Out, Punchline head-to-head, Order Up, and ordering under a running clock.
- **Browser, the one failure:** `zz-activity-lobby.spec.ts:102`, which checks that 34 names fit on the lobby wall without scrolling, failed once and did not fail again. On its own it passed once on `main` and twice on this change. It passed twice more alongside the specs that run before it. This change does not touch the lobby wall, and that test opens the TV with an explicit run id, a path AUD-18 leaves unchanged.
- **Browser, not run locally:** the browser specs outside activities. CI runs them.
- **Probes:** AUD-19 and AUD-21 were reproduced with throwaway tests that are not committed. Their output is quoted in those findings.
- **Body-size limits:** measured against a running Kestrel server, as described under AUD-06.
- **Environment:** .NET SDK 10.0.112 from the Ubuntu archive. For the local browser run only, Playwright 1.61 was pointed at the pre-installed Chromium 1194 build through a scratch config that is not committed.
