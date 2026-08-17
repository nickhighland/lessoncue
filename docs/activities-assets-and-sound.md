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

## Teacher-provided media

Teachers remain responsible for having permission to use media they upload or
select from the existing LessonCue media library. Activities reuse the existing
media storage and playback URLs; reveal transformations are temporary client
presentation state and do not create modified copies of source media.

## Review checklist for new presets

1. Is the prompt/content freely authored and easy for a teacher to replace?
2. Does the presentation use shared LessonCue components instead of copied
   artwork or trade dress?
3. If a new asset is necessary, is its license and attribution recorded?
4. Can the activity run without an external cloud audio, AI, or asset service?
