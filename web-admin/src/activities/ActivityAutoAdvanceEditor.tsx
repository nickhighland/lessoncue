import React from 'react';

/**
 * Pre-arm auto-advance when authoring, rather than only mid-run.
 *
 * The host console can toggle this live, but a teacher setting up a lesson
 * should be able to decide it in advance. The run-level toggle still wins once
 * a game is in progress.
 *
 * Mirrors `SupportsAutoAdvance` on the server, which is authoritative: it
 * refuses the host action outright for engines where a head count is
 * meaningless, so an unsupported value here would simply never apply.
 */
const AUTO_ADVANCE_ENGINES = new Set([
  'trivia', 'rapidFire', 'poll', 'prediction',
  'punchline', 'fakeOut', 'drawing', 'ordering', 'matchPlayer',
]);

/**
 * Engines the server paces on a clock. Wider than the set above: `word` runs
 * itself without a head count being meaningful, so it has a pace to set even
 * though it has no auto-advance switch.
 *
 * Mirrors `ActivityAutoPilot.Supported`.
 */
const PACED_ENGINES = new Set([...AUTO_ADVANCE_ENGINES, 'word']);

/** Engines where players compose rather than pick, so the default is longer. */
const COMPOSE_ENGINES = new Set(['punchline', 'fakeOut', 'drawing', 'ordering', 'word']);

export const supportsAutoAdvance = (type: string) => AUTO_ADVANCE_ENGINES.has(type);
export const supportsPacing = (type: string) => PACED_ENGINES.has(type);

/** The shipped pace, mirroring the constants on the server. */
const defaultSeconds = (type: string) => ({
  introSeconds: 4,
  responseSeconds: COMPOSE_ENGINES.has(type) ? 60 : 30,
  revealSeconds: 6,
  standingsSeconds: 6,
});

const BEATS = [
  { key: 'introSeconds', label: 'Reading the question', hint: 'Before answering opens.' },
  { key: 'responseSeconds', label: 'Answering', hint: 'How long players get.' },
  { key: 'revealSeconds', label: 'Showing the answer', hint: 'Before scores appear.' },
  { key: 'standingsSeconds', label: 'Showing the scores', hint: 'Before the next round.' },
] as const;

export const ActivityAutoAdvanceEditor: React.FC<{
  type: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}> = ({ type, config, onChange }) => {
  if (!supportsAutoAdvance(type) && !supportsPacing(type)) return null;
  const enabled = config.autoAdvance === true;
  const defaults = defaultSeconds(type);

  return <div className="activity-editor-card">
    <strong>Round pacing</strong>
    {supportsAutoAdvance(type) && (
      <>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={enabled}
            onChange={event => onChange({ ...config, autoAdvance: event.target.checked })}
          />
          {' '}Close the response window as soon as every player has answered
        </label>
        <small className="muted">
          You can still close it yourself at any time, and change this during the game
          from the host controls.
        </small>
      </>
    )}

    {supportsPacing(type) && (
      <>
        <div className="activity-pacing-grid">
          {BEATS.map(beat => {
            const authored = config[beat.key];
            const value = typeof authored === 'number' ? String(authored)
              : typeof authored === 'string' ? authored : '';
            return <label key={beat.key}>
              <span>{beat.label}</span>
              <input
                type="number"
                min={beat.key === 'responseSeconds' ? 5 : 1}
                max={beat.key === 'responseSeconds' ? 600 : 300}
                // Empty means "use the shipped pace", so the placeholder shows
                // what that is rather than leaving the teacher to guess.
                placeholder={`${defaults[beat.key]}`}
                value={value}
                aria-label={`${beat.label}, seconds`}
                onChange={event => {
                  const next = { ...config };
                  const typed = event.target.value.trim();
                  if (typed === '') delete next[beat.key];
                  else next[beat.key] = Number(typed);
                  onChange(next);
                }}
              />
              <small className="muted">{beat.hint}</small>
            </label>;
          })}
        </div>
        <small className="muted">
          Seconds. Leave a box empty to use the shipped pace shown in it. These run the
          game on its own once you have started it — you can still step in at any point.
        </small>
      </>
    )}
  </div>;
};
