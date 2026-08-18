LessonCue Activities — game sound packs
=======================================

Everything here is OPTIONAL. LessonCue ships with no third-party audio: every
effect has an original synthesized fallback in
web-admin/src/activities/effects.ts, and that is what plays out of the box.
This tree exists so a deployment can layer licensed samples on top without
touching any code.

The .txt files are placeholders that document the naming. To use a cue, delete
the .txt and drop in an .mp3 with the same base name in the same folder.


LAYOUT
------

  assets/games/{gameId}/audio/themes/*.mp3    beds and stings (TV/projector)
  assets/games/{gameId}/audio/sfx/*.mp3       short effects (phones + host)


LOOKUP CASCADE
--------------

For a live Activity, LessonCue searches three folders in order and uses the
first that has the file:

  1. the named preset      e.g. assets/games/wagerTrivia/
  2. the engine behind it  e.g. assets/games/trivia/
  3. the shared pack            assets/games/shared/
  4. otherwise, the synthesized effect (or, for music, silence)

Only the 28 engine folders and `shared` are scaffolded here, because that is
enough to cover all 164 named games in the catalog. Wager Trivia, Fact or
Fiction, Finish the Quote and every other quiz preset resolve through
assets/games/trivia/.

To give one named game its own sound, create a folder using its preset id and
add only the files you want to override. Everything you leave out keeps falling
through to the engine folder. For example:

  assets/games/wagerTrivia/audio/themes/game-intro.mp3

...gives Wager Trivia its own opening sting while every other Wager Trivia cue
still comes from assets/games/trivia/. Resolution is per-cue, not per-folder,
so a partial pack is fine.


CUE LIST
--------

themes/ — played on the TV/projector only, never on player phones, because
          thirty phones playing the same music bed is a bad room.

  intro-theme.mp3       loops while the join code is up and players arrive
  game-intro.mp3        one-shot, fires when the game leaves the lobby
  round-transition.mp3  one-shot, fires at each round intro
  game-outro.mp3        one-shot, fires at final results / end of run

sfx/ — played on participant phones and host controls.

  ui-btn-hover.mp3      pointer hover; never heard on touch devices
  ui-btn-select.mp3     every tap — PITCH-RANDOMIZED 0.85x–1.15x per press
  ui-btn-lock-in.mp3    committing an answer, vote, drawing, or buzz
  game-timer-tick.mp3   once per second in the final five seconds
  game-timer-alarm.mp3  response window reaching zero
  fx-confetti-pop.mp3   celebration burst


MANIFEST
--------

manifest.json records which cue files actually exist. Without it the client can
only discover packs by requesting every cue and treating 404 as "absent" —
correct, but it logs 20-30 console errors on every game load and buries real
ones. With it, a stock install requests nothing.

After adding or removing any .mp3 here, regenerate it:

  npm run audio:manifest

If manifest.json is missing entirely, the client falls back to probing, so a
deployment that forgets this step still works — it is just noisier.


LOADING
-------

Effects are fetched and decoded into memory when a player reaches the lobby, so
the first tap of the first round has no latency. Themes are preloaded as media
elements. Keep effects short and music modest.

Playback routes through the one shared AudioContext, so the existing host mute
and volume controls stay authoritative over sampled and synthesized cues alike.


LICENSING
---------

Any audio committed to this tree is a bundled asset. It needs a source note, a
licence or permission record, and an attribution entry before release. See
docs/activities-assets-and-sound.md.
