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

export const supportsAutoAdvance = (type: string) => AUTO_ADVANCE_ENGINES.has(type);

export const ActivityAutoAdvanceEditor: React.FC<{
  type: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}> = ({ type, config, onChange }) => {
  if (!supportsAutoAdvance(type)) return null;
  const enabled = config.autoAdvance === true;

  return <div className="activity-editor-card">
    <strong>Round pacing</strong>
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
  </div>;
};
