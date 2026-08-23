# Activities live-play repair plan

The Activities system demonstrates well but does not yet survive a real lesson.
This plan records what is actually broken, why, and the order to fix it in.

Every root cause below was traced in the current tree rather than assumed. Where
a reported symptom turned out to have a different cause than it appeared, that
is called out — the fix belongs where the cause is.

## Status

| # | Work | State |
| --- | --- | --- |
| 0 | This plan | done |
| 1 | Shrink the controller pause button | done |
| 2 | Server-admin switch to hide Activities while testing | done |
| 3 | Repair live play: shared lesson session, host visibility, flow | done |
| 4 | Exercise every game individually | not started |
| 5 | Remove the Android launch hang | not started |

---

## Confirmed root causes

### A. Every game in a lesson asks players to join again

`ActivityRun` owns `JoinCode`, and `ActivityService.GetOrCreateRunAsync` scopes a
run to `LessonItemId`. A lesson with four activities therefore creates four runs,
four join codes, and four separate participant rosters. Players re-scan and
re-enter a name for every game.

`ActivityParticipant`, `ActivityTeam`, and `ActivityScoreEvent` all hang off
`ActivityRunId`, so identity, teams, and scores reset with the code.

Two further field reports trace to the same cause:

**"Several people signed in but were not added to the game."** One definition can
have more than one live run at once — the controller creates a lesson-scoped run
(`LessonItemId` set), while launching from Activities Studio or opening the
display with only a `definitionId` creates an unscoped one (`LessonId == null`).
Each gets its own join code and its own roster, so a room scanning the wrong
code joins a real, working session that simply is not the one the host is
driving. There is no signal to either side that this has happened. This is not
theoretical — it happened during testing here, and looked exactly like players
failing to join.

**"Someone changed their name and it counted them as a new player."** Two
reasons, both structural. Participant tokens are salted per run
(`TokenHash(run.Id, token)`) and cached in `localStorage` under the join code,
so the same person on the same phone is a different participant in every game.
And there is no rename on the phone at all: the only way a player can change
their name today is to re-join, which by definition creates a new participant
and abandons their score.

The join-code uniqueness index rules out a code collision as an explanation;
both symptoms are the per-run identity boundary.

**Consequences the user reported:** one QR per lesson is impossible; scores cannot
carry between games; players silently join the wrong session; renaming forks a
player in two.

### B. The host cannot see submissions

Submissions *do* reach the server. `HandleDrawingParticipantAsync` and the other
participant handlers write `ActivitySubmission` rows with the correct moderation
status, and the browser suite covers that path.

The moderation queue lives in `ActivityHostSessionPanel`, which
`ActivityController` renders only when `showSessionSetup` is true:

```
{isInteractive && hostView && showSessionSetup && <ActivityHostSessionPanel …/>}
```

During live play setup is closed, so the queue — and with it every drawing and
written answer awaiting approval — is invisible to the person running the
controller. Nothing is lost; it simply cannot be reached.

**This is a visibility bug, not a submission bug.** The fix is in the host
surface, not the engines.

### C. Round progression is confusing to run

The controller exposes engine actions as a flat set of buttons whose available
set changes with phase, with no statement of what phase the game is in, what the
host is expected to do next, or what will happen when they press a control. A
host has to already know each engine's lifecycle.

### D. Players cannot change their name or character

`JoinAsync` accepts a display name and identity on every call, and the host can
rename a participant, but the phone offers no way to edit either after joining.
The only escape is "Switch player", which discards the session token and starts
over as a new participant — losing that player's score.

### E2. The phone prints the game title twice

`ParticipantGame` renders `envelope.name` as a small kicker directly above an
`<h1>` of `config.title`. Those are the same string for almost every activity,
so the heading appears twice — small, then large.

### E. The pause button dominates the remote

`.remote-transport .transport-main` is `min-height: 76px` against 64px siblings,
filled gold with a coloured shadow, inside a four-column grid. It reads as the
primary action of the whole remote when it is one transport control among four.

### F. Android hangs on launch

`MainActivity.onCreate` renders `AppScreen.Loading` and the first
`LaunchedEffect` calls `reconnectSavedServer`, which:

1. calls `manifest()` — `connectTimeout` 8s, `readTimeout` 15s;
2. on failure runs mDNS discovery (`LessonCueDiscovery.findServer()`);
3. only then falls back to the cached manifest already on disk.

A slow or absent server blocks the first frame for up to ~23s plus discovery,
even though a usable cached manifest exists locally.

---

## Design decision: the lesson session

Fixing A, D, and score carry-over with per-run state is not possible. They need a
join boundary wider than one activity.

**Introduce a session that owns the lobby, and let runs attach to it.**

- A new `ActivitySessionGroup` owns `JoinCode`, participants, teams, and score
  events. It is scoped to a lesson (or to a class for ad-hoc play), not to a
  playlist item.
- `ActivityRun` keeps its per-game state and gains a nullable
  `SessionGroupId`. Runs in the same lesson resolve to the same group.
- `ActivityParticipant`, `ActivityTeam`, and `ActivityScoreEvent` move their
  ownership to the group, keeping `ActivityRunId` on score events so a single
  game's contribution stays attributable and undoable.

**Backward compatibility.** Existing runs have no group. `EnsureInteractiveRunAsync`
creates a group on demand and adopts the run's existing join code, participants,
teams, and score events into it, so an in-flight run keeps working and its
history stays intact. Columns are added idempotently by `DatabaseUpgrade`, per
the existing migration rules.

**Score reset.** Because scores now persist across games, the host needs an
explicit way to clear them: a session-level reset that undoes score events for
the group rather than deleting them, matching the existing reversible
`ActivityScoreEvent` model.

This is the largest change in the plan and everything in phase 3 depends on it.

---

## Phase 1 — Pause button

Bring `.transport-main` to the same footprint as its siblings and let colour
alone carry emphasis. Verify at the narrow breakpoint too, where the grid
already tightens.

## Phase 2 — Hide Activities while testing

A Service Admin switch that removes Activities from teacher-facing surfaces
without deleting anything, so an unfinished game cannot be launched into a real
lesson.

- Server: a setting alongside the existing address settings, read by the
  Activities API and the lesson editor.
- When disabled: the Activities Studio entry, the activity playlist-item type,
  and direct launch are hidden; existing lesson items degrade to a clear
  "unavailable" cue rather than erroring.
- Service Admin only, consistent with `LessonCuePermissions`.
- The switch must not disturb a run already in progress.

## Phase 3 — Repair live play

Depends on the lesson session above.

1. **One code per lesson.** *(done)* `ActivitySessionGroup` owns the join code,
   the roster, the teams and the score history. Runs attach to it, existing runs
   are adopted with their code and history intact, and a join code resolves to
   whichever game the lesson is currently on. Uniqueness moved from
   `ActivityRuns.JoinCode` to the group, since runs in one lobby now share a
   code. Identity is salted by the lobby, so the same phone is the same player
   in every game, and a rename updates that player instead of forking them.

   Still to do here: surface the "two runs exist" case in the host UI, since a
   run started outside a lesson still forms its own lobby.
2. **Carry scores.** *(done)* Totals span the lesson, and a host can clear the
   board — a reset marker rather than a delete, so history stays auditable.
3. **Host visibility.** *(done)* The moderation queue lives in the live panel,
   so pending drawings and answers are reachable during play rather than only
   when setup happens to be open.
4. **Games run themselves.** *(done)* The host presses Start and then watches the room, not the screen. Once a game starts
   the server drives it:

   | Phase | Leaves when |
   | --- | --- |
   | Round intro | a short beat, so the room can read the question |
   | Accepting responses | the timer runs out, or everyone has answered |
   | Awaiting moderation | the host approves or hides what is pending |
   | Reveal | a short beat |
   | Standings | a short beat, then the next round starts |

   **Host interaction is moderation, and nothing else.** Where a game holds
   anonymous work for approval, autonomy stops and waits for a decision —
   that judgement is the host's and cannot be timed out. Everywhere else a
   timer replaces the button press.

   The host keeps a manual override on every step: skip ahead, hold, reopen,
   go back. Autonomy only ever performs the action the host would have taken
   next, and pausing must actually pause — not queue up a burst of catch-up
   transitions.

   Progression is server-driven. A client-side timer would stall the moment a
   TV sleeps or a browser is closed, and the server is already the authority
   for phase, scoring and timing.

5. **Default response timers.** *(server side done)* 30 seconds for multiple
   choice, 60 seconds for drawing, text entry and other compose-an-answer
   inputs. Whichever comes
   first — the clock or the last answer — ends the round. Teacher-editable per
   activity; these are defaults, not limits, and a teacher can still turn the
   clock off for a round that needs to breathe.

6. **Standings after every round.** *(done)* Not only at the end and not only
   when the host remembers to ask for them. The race screen already exists; autonomy
   shows it between rounds as a matter of course.

7. **Player self-service.** *(done)* Tapping your own badge opens an editor for
   name and character. Re-joining with the existing token updates that player,
   so the score and standings place stay with them.

## Phase 4 — Exercise every game

Per engine, end to end through the real host surface rather than the API:
lobby → open → submit from a phone → host review where applicable → reveal →
standings. Record what works, what is awkward, and what is broken. The existing
163-preset smoke test covers rendering only; this is about operation.

## Phase 5 — Android launch

Render from the cached manifest first and reconnect in the background, so the
first frame does not wait on the network. Keep discovery, but off the launch
path. Verify cold start with the server present, absent, and slow.

---

## Requirements added after the first draft

Recorded here so nothing is lost between sessions.

- **One join code per lesson.** Players sign up once, not once per game.
- **Scores carry across games in a lesson**, with a way in LessonCue to wipe
  them and start over.
- **Players can change their username and picture** after joining.
- **"Submissions don't reach the host"** means the person running the
  controller cannot see them — the submissions themselves arrive fine. See
  root cause B.
- **The phone printed the game title twice**, small then large. The small one
  goes. See root cause E2. *(fixed)*
- **Host controls state what to do and what will happen**, per phase — see the
  table above.
- **Auto-progress** once all answers are in and all votes are cast.
- **Default response timers**, so a round is never open-ended: 30 seconds for
  multiple choice, 60 seconds for drawing, text entry and the other
  compose-an-answer inputs. The round advances on whichever comes first — the
  timer running out, or everyone having submitted. Teacher-editable per
  activity; these are defaults, not limits.
- **Games run autonomously with host moderation.** The host presses Start; the
  game handles the rest. Where host interaction was previously required, a
  timer takes its place — except moderation, which stays a human decision.
- **Show scores after every round**, not just at the end.
- **Players signed in but were not added to the game** — see root cause A.
- **A player renaming themselves became a second player** — see root cause A.

## Verification

Each phase lands with coverage. Existing suites that must keep passing:
the 163-preset render smoke, the participant juice layer, palettes, join QR,
player results, standings, host console, auto-advance, and callouts.

## Notes

- Existing behaviour that already works stays working: the 163-preset smoke
  test, the participant juice layer, palettes, the join QR, and the host live
  panel all have coverage and should not regress.
- The `CompactRemoteShell` refactor currently drops the lesson run summary and
  the "save as app" instructions, and no longer flags a screen error state.
  Worth deciding whether those return as part of the host flow work.
