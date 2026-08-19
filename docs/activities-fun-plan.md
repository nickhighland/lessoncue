# Activities: making the player experience more fun

The administrative workflow can stay calm, clear, and efficient. The game
experience on the TV and participant phones should carry the energy.

## Product goal

When a teacher launches an activity, the room should immediately understand:

1. what kind of game is happening;
2. what to do next;
3. how much time is left; and
4. why the next reveal is worth watching.

The visual language should be original to LessonCue: bright, readable, playful,
and useful across classrooms, youth groups, churches, and training rooms. It
should not copy any commercial game's artwork, wording, sound pack, or trade
dress.

## Player-facing plan

### Phase 1: make every screen feel intentional

- Give every preset a short visual identity: a color pair, accent color, icon,
  and opening phrase.
- Apply the saved activity theme to the TV stage, transitions, progress bars,
  answer cards, and participant controller.
- Replace generic loading, empty, and error states with clear game-aware states.
- Use large type, strong contrast, and one primary action per phase.
- Keep the phone page focused on one big interaction instead of an admin form.

### Phase 2: build the game-show rhythm

- Add a short intro card with the activity name and a one-line challenge.
- Use shared countdown, lock-in, reveal, score, leaderboard, and winner moments.
- Make the host's “next” action visibly move the room through a sequence.
- Add optional original sound cues for countdown, lock, correct, incorrect,
  reveal, points, and winner; keep mute and reduced-motion controls global.
- Add skippable celebration motion rather than forcing the room to wait.

### Phase 3: add variety without adding complexity

- Establish six theme packs: Neon Night, Jungle Pop, Ocean Glow, Arcade Candy,
  Storybook, and Spotlight.
- Use a different visual treatment for trivia, polls, drawing, buzzer, brackets,
  physical-room activities, and utilities while preserving shared components.
- Give library cards and preview snapshots a representative illustration or
  visual motif so teachers can recognize the experience before launch.
- Make TV layouts responsive from projector distance to a small classroom panel.

### Phase 4: make participation feel rewarding

- Confirm phone actions immediately with a small, tactile response.
- Show “locked in” and “waiting for the host” states that feel reassuring.
- Use color plus words/icons for every status; never depend on color alone.
- Give anonymous creative responses a polished gallery and reveal sequence.
- Make team identity visible through icons, color, and score movement.

### Phase 5: validate with real rooms

- Test the complete lesson on a projector/TV and at least two phone browsers.
- Test 5, 20, 50, and 100 participant/viewer conditions where practical.
- Test reduced motion, keyboard host control, small screens, reconnects, and a
  host refresh between every major phase.
- Review screenshots/video with teachers and students, then tune pacing and
  hierarchy before adding more named presets.

## Test fixture

The repository includes an opt-in animal-themed pack covering all 27 current
Activities Studio types. It creates reusable definitions and adds one cue for
each definition to `Animal Adventure: Activities Safari` in the
`Animal Adventure Lab` class.

Run it against the local LessonCue data directory with:

```bash
dotnet run --project server/LessonCue.Server -- --seed-animal-activity-pack
```

The command is idempotent. It is intended for local QA and demonstrations; it
does not run automatically on ordinary installations.
