# Activities assets and sound policy

LessonCue's Activities presentation must remain recognizably its own work. The
game-show feeling comes from LessonCue layout, typography, color themes, CSS
motion, and synthesized Web Audio effects—not copied artwork, sound effects,
music, logos, or exact visual trade dress from another product.

## Bundled presentation

- Shared sound effects are generated locally with the Web Audio API in
  `web-admin/src/activities/effects.ts`.
- Theme colors, gradients, motion, icons, and reveal treatments are authored in
  the LessonCue web client and are not copied from a commercial game.
- New bundled bitmap, vector, music, or sound assets require a source note,
  license/permission record, and an attribution entry in this document or a
  linked release asset manifest.
- Do not add a commercial trivia, joke, image, music, or sound-effects library
  as seed content. Presets should contain small, generic examples that teachers
  can replace or delete.

## Optional sampled sound packs

Bundled cues stay synthesized. A deployment may *additionally* supply licensed
samples under `web-admin/public/assets/games/`, which is scaffolded with `.txt`
placeholders documenting every filename. To use a cue, delete the `.txt` and
drop in an `.mp3` of the same base name; no code or configuration changes.

```
assets/games/{gameId}/audio/themes/intro-theme.mp3        looping lobby bed
assets/games/{gameId}/audio/themes/gameplay-bed.mp3       looping bed under play
assets/games/{gameId}/audio/themes/countdown-bed.mp3      looping bed while a clock runs
assets/games/{gameId}/audio/themes/game-intro.mp3         one-shot, game starts
assets/games/{gameId}/audio/themes/round-transition.mp3   one-shot, round intro
assets/games/{gameId}/audio/themes/countdown-announce.mp3 one-shot, a clock starts
assets/games/{gameId}/audio/themes/countdown-final-five.mp3 one-shot, five seconds left
assets/games/{gameId}/audio/themes/game-outro.mp3         one-shot, game ends
assets/games/{gameId}/audio/sfx/ui-btn-hover.mp3          pointer hover
assets/games/{gameId}/audio/sfx/ui-btn-select.mp3         every tap
assets/games/{gameId}/audio/sfx/ui-btn-lock-in.mp3        committing a response
assets/games/{gameId}/audio/sfx/game-timer-tick.mp3       final five seconds
assets/games/{gameId}/audio/sfx/game-timer-alarm.mp3      window closes
assets/games/{gameId}/audio/sfx/fx-confetti-pop.mp3       celebration
```

Beds and stings play on separate channels. A sting sounds over the music rather
than replacing it, and asking for the bed that is already playing does nothing —
so a phase update arriving every second does not restart the music. Only one bed
plays at a time: `countdown-bed` takes over from `gameplay-bed` while a clock is
running and hands back when it stops.

`countdown-final-five` starts once, as the clock crosses five seconds. A window
shorter than that never crosses the mark from above, so the cue stays silent
there rather than still playing after the game has moved on.

Lookup cascades **preset → engine → shared**, per cue:

1. the named preset, for example `assets/games/wagerTrivia/`
2. the engine behind it, for example `assets/games/trivia/`
3. `assets/games/shared/`
4. otherwise the synthesized effect — or, for a theme, silence

Only the 28 engine folders and `shared` are scaffolded, because that covers all
164 named games in the catalog. A single preset can override one cue by adding
its own folder with just that file; everything omitted keeps falling through.

Theme cues play on the TV/projector only. Player phones stay effects-only —
thirty phones playing the same music bed is a bad room.

Rules for this tree:

- **It contains no audio in the shipped repository, and that is the supported
  default.** Every effect has an original synthesized fallback in `effects.ts`,
  so a missing file changes the sound and nothing else — never a silent
  control, an error, or a blocked interaction. A missing *theme* means that bed
  or sting does not play.
- Adding any audio file here is adding a bundled asset, so it needs the source
  note, license/permission record, and attribution entry required above before
  release.
- `ui-btn-select.mp3` is pitch-randomized 0.85x–1.15x on every press, so author
  one dry take and let the randomizer supply the variation. Effects are decoded
  into memory when a player reaches the lobby; keep them short.
- Playback routes through the one shared `AudioContext`, so the existing host
  mute and volume controls stay authoritative over sampled and synthesized
  cues alike.

`web-admin/public/assets/games/manifest.json` records which cue files exist.
Regenerate it with `npm run audio:manifest` after adding or removing any
`.mp3`. Without it the client must discover packs by requesting each cue and
treating 404 as absent, which logs 20-30 console errors per game load; with it,
a stock install requests nothing. A missing manifest falls back to probing, so
forgetting the step degrades noise rather than function.

`web-admin/public/assets/games/README.txt` repeats this next to the files.

## Teacher-provided media

Teachers remain responsible for having permission to use media they upload or
select from the existing LessonCue media library. Activities reuse the existing
media storage and playback URLs; reveal transformations are temporary client
presentation state and do not create modified copies of source media.

## Typography

Activity surfaces bundle two local, licensed faces under
`web-admin/public/assets/fonts/activities/`. Fredoka (`Fredoka-Variable.ttf`)
is the UI face for questions, answers, instructions, buttons, and player names.
Luckiest Guy (`LuckiestGuy-Regular.ttf`) is reserved for the game-show moments:
game names, round/status callouts, scores, reveals, and winner emphasis. This
keeps the Jackbox energy focused instead of turning every control into a novelty
font.

The supplied Fredoka notice is the SIL Open Font License 1.1 and is recorded in
`Fredoka-OFL.txt`; the supplied Luckiest Guy notice is Apache License 2.0 and is
recorded in `LuckiestGuy-Apache-2.0.txt`. The asset directory README repeats the
role mapping and license sources.

## Review checklist for new presets

1. Is the prompt/content freely authored and easy for a teacher to replace?
2. Does the presentation use shared LessonCue components instead of copied
   artwork or trade dress?
3. If a new asset is necessary, is its license and attribution recorded?
4. Can the activity run without an external cloud audio, AI, or asset service?
