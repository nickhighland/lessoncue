import type { GameThemeCue } from './gameAudio';

/**
 * Which looping bed belongs under the stage right now.
 *
 * Kept apart from the stings, and from React, because "what music should be
 * playing" is a question about the game's state and nothing else. Until this
 * existed the answer during an actual round was "none": every sting stopped
 * the single audio element, so play itself was silent.
 */
export function stageBedFor(input: {
  inLobby: boolean;
  finished: boolean;
  counting: boolean;
}): GameThemeCue | null {
  if (input.finished) return null;
  if (input.inLobby) return 'lobby';
  // The countdown bed replaces the gameplay bed rather than layering over it.
  // Two beds at once is noise, and the timed moment is the one to lift.
  return input.counting ? 'countdown' : 'gameplay';
}

/** The window in which the final-five cue is the right thing to play. */
export const FINAL_STRETCH_MS = 5_000;

/**
 * Whether the "last five seconds" cue is due on this tick.
 *
 * Edge-triggered on purpose: the cue is a recording of a five second count, so
 * it must start once as the countdown crosses five seconds and never restart
 * while it plays. A countdown shorter than the window never crosses it from
 * above, so it does not fire at all rather than firing halfway through.
 */
export function finalStretchDue(previousMs: number | null, remainingMs: number | null): boolean {
  if (remainingMs === null || previousMs === null) return false;
  if (remainingMs <= 0) return false;
  return previousMs > FINAL_STRETCH_MS && remainingMs <= FINAL_STRETCH_MS;
}
