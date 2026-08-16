import React from 'react';
import type { ActivityEditorProps } from '../../activityRegistry';

type JsonRecord = Record<string, unknown>;

const objectOf = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const boolOf = (value: unknown, fallback = false) => typeof value === 'boolean' ? value : fallback;
const numberOf = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const QuizModifierEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const modifiers = objectOf(config.modifiers);
  const wager = objectOf(modifiers.wager);
  const speedBonus = objectOf(modifiers.speedBonus);
  const lives = objectOf(modifiers.lives);
  const doubleOrNothing = objectOf(modifiers.doubleOrNothing);
  const update = (section: string, changes: JsonRecord) => onChange({ ...config, modifiers: { ...modifiers, [section]: { ...objectOf(modifiers[section]), ...changes } } });

  return <section className="activity-editor-card quiz-modifier-editor" aria-label="Quiz rules">
    <div className="activity-editor-card-heading"><strong>Game-show rules</strong><span className="activity-library-chip">Shared Quiz engine modifiers</span></div>
    <p className="muted">These rules work for Trivia, Rapid Fire, Wager Trivia, and Survivor Trivia. Leave them off for a straightforward review quiz.</p>
    <label className="checkbox-row"><input type="checkbox" checked={boolOf(wager.enabled)} onChange={event => update('wager', { enabled: event.target.checked })} /> Wager points before answering</label>
    {boolOf(wager.enabled) && <div className="two-fields quiz-modifier-fields">
      <label>Maximum wager<input type="number" min={0} max={10000} value={numberOf(wager.maxPoints, 500)} onChange={event => update('wager', { maxPoints: Math.max(0, Math.min(10000, Number(event.target.value) || 0)) })} /></label>
      <label>Suggested wager<input type="number" min={0} max={10000} value={numberOf(wager.defaultPoints, 0)} onChange={event => update('wager', { defaultPoints: Math.max(0, Math.min(10000, Number(event.target.value) || 0)) })} /></label>
    </div>}
    <label className="checkbox-row"><input type="checkbox" checked={boolOf(speedBonus.enabled)} onChange={event => update('speedBonus', { enabled: event.target.checked })} /> Reward fast correct answers</label>
    {boolOf(speedBonus.enabled) && <div className="two-fields quiz-modifier-fields">
      <label>Maximum speed bonus<input type="number" min={0} max={2000} value={numberOf(speedBonus.maxPoints, 50)} onChange={event => update('speedBonus', { maxPoints: Math.max(0, Math.min(2000, Number(event.target.value) || 0)) })} /></label>
      <label>Bonus window (seconds)<input type="number" min={1} max={600} value={numberOf(speedBonus.windowSeconds, 20)} onChange={event => update('speedBonus', { windowSeconds: Math.max(1, Math.min(600, Number(event.target.value) || 1)) })} /></label>
    </div>}
    <label className="checkbox-row"><input type="checkbox" checked={boolOf(lives.enabled)} onChange={event => update('lives', { enabled: event.target.checked })} /> Give players limited lives</label>
    {boolOf(lives.enabled) && <div className="two-fields quiz-modifier-fields">
      <label>Starting lives<input type="number" min={1} max={9} value={numberOf(lives.startingLives, 3)} onChange={event => update('lives', { startingLives: Math.max(1, Math.min(9, Number(event.target.value) || 1)) })} /></label>
      <label className="checkbox-row"><input type="checkbox" checked={lives.eliminateAtZero !== false} onChange={event => update('lives', { eliminateAtZero: event.target.checked })} /> Eliminate at zero</label>
    </div>}
    <label className="checkbox-row"><input type="checkbox" checked={boolOf(doubleOrNothing.enabled)} onChange={event => update('doubleOrNothing', { enabled: event.target.checked })} /> Offer double-or-nothing risk</label>
  </section>;
};
