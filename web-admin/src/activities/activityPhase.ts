/** Phases where the stage should show the lobby rather than play content. */
export function isLobbyPhase(phase: unknown): boolean {
  return phase === 'lobby' || phase === 'setup';
}
