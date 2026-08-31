/** Phases where the stage should show the lobby rather than play content. */
export function isLobbyPhase(phase: unknown): boolean {
  return phase === 'lobby' || phase === 'setup';
}

/**
 * Phases where a deadline is a countdown the room should see, not a scene
 * change. Shared so the clock the room watches and the music underneath it
 * cannot disagree about whether this is a timed moment.
 */
export const TIMED_PHASES = ['acceptingResponses', 'voting', 'prompt'];
