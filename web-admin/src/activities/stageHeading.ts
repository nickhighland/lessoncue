/**
 * The kicker above a game's title names the format; the title names this
 * particular game.
 *
 * A teacher who keeps the preset's name as the activity's name -- which is what
 * happens by default -- then reads the same word twice: "❓ TRIVIA" sitting
 * directly above "Trivia". Dropping the label in that case leaves the kicker
 * saying the thing the title does not: which question, how many votes, how much
 * is revealed.
 */
export function stageKicker(
  icon: string,
  label: string | undefined,
  fallbackLabel: string,
  context: string | undefined,
  title: string | undefined,
): string {
  const chosen = (label || fallbackLabel).trim();
  const parts = [saysTheSameThing(chosen, title) ? '' : chosen, (context || '').trim()]
    .filter(part => part.length > 0);
  return [icon.trim(), parts.join(' · ')].filter(part => part.length > 0).join(' ');
}

/**
 * Compared without punctuation, case or spacing, so "What's Different?" and
 * "WHATS DIFFERENT" count as one name rather than two.
 */
function saysTheSameThing(label: string, title: string | undefined): boolean {
  if (!title) return false;
  const bare = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  const left = bare(label);
  const right = bare(title);
  if (!left || !right) return false;
  // A title of "Trivia" under a "TRIVIA SHOWDOWN" kicker is still the same name
  // said twice, so containment counts either way round.
  return left === right || left.includes(right) || right.includes(left);
}
