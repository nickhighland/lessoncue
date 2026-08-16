import React, { useEffect, useState } from 'react';
import type { ActivityComponentProps, ActivityEditorProps } from '../../activityRegistry';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

type JsonRecord = Record<string, unknown>;
const stateOf = (envelope: ActivityStateEnvelope) => (envelope.state || {}) as JsonRecord;
const configOf = (envelope: ActivityStateEnvelope) => (envelope.config || {}) as JsonRecord;
const listOf = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
const stringOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;
const phaseLabel = (value: unknown) => stringOf(value, 'lobby').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();

const useRemainingMs = (state: JsonRecord) => {
  const [now, setNow] = useState(() => Date.now());
  const duration = numberOf(state.timerDurationMs);
  const started = Date.parse(stringOf(state.timerStartedAt));
  const paused = Date.parse(stringOf(state.timerPausedAt));
  useEffect(() => {
    if (!duration || !Number.isFinite(started) || stringOf(state.challengeStatus) !== 'running') return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [duration, started, state.challengeStatus]);
  if (!duration || !Number.isFinite(started)) return 0;
  const end = Number.isFinite(paused) ? paused : now;
  return Math.max(0, duration - (end - started));
};

const PhysicalShell: React.FC<{ title: string; phase: unknown; children: React.ReactNode; joinCode?: unknown; participantCount?: unknown }> = ({ title, phase, children, joinCode, participantCount }) => (
  <div className="activity-stage interactive-game-stage physical-room-stage">
    <div className="activity-stage-content">
      <div className="activity-header">
        <div className="stage-kicker">🧭 PHYSICAL ROOM · {phaseLabel(phase)}</div>
        <h1 className="activity-title">{title}</h1>
      </div>
      <div className="physical-room-badge"><strong>NO PHONES REQUIRED</strong><span>{joinCode ? `${participantCount ?? 0} optional phone participants` : 'The host leads this round from the controller.'}</span></div>
      {children}
    </div>
  </div>
);

export const PhysicalRoomDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const round = state.currentRound && typeof state.currentRound === 'object' ? state.currentRound as JsonRecord : null;
  const choices = listOf(round?.choices).map(choice => stringOf(choice.value, stringOf(choice.label, String(choice))));
  const fallbackChoices = Array.isArray(round?.choices) ? round?.choices.map(choice => stringOf(choice)) : [];
  const visibleChoices = choices.length ? choices : fallbackChoices;
  const remaining = useRemainingMs(state);
  const duration = numberOf(state.timerDurationMs);
  const seconds = Math.ceil(remaining / 1000);
  const timerActive = stringOf(state.challengeStatus) === 'running' || stringOf(state.challengeStatus) === 'paused';
  return <PhysicalShell title={stringOf(config.title, envelope.name || 'Physical Room')} phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
    <section className="physical-room-prompt">
      <span className="interactive-round-label">ROUND {numberOf(state.currentRoundIndex, 0) + 1} OF {numberOf(state.roundCount, 1)}</span>
      <h2>{stringOf(round?.title, 'Get ready')}</h2>
      <p>{stringOf(round?.instructions, 'Follow the host instructions and get into position.')}</p>
    </section>
    {visibleChoices.length > 0 && <div className="physical-room-choice-grid" aria-label="Room choices">{visibleChoices.map((choice, index) => <div className={`physical-room-choice physical-room-choice-${index % 6}`} key={`${choice}-${index}`}><span>{index + 1}</span><strong>{choice}</strong></div>)}</div>}
    {timerActive && <section className={`physical-room-timer ${seconds <= 5 ? 'urgent' : ''}`} aria-live="polite"><span>{stringOf(state.challengeStatus) === 'paused' ? 'PAUSED' : 'TIME LEFT'}</span><strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong><div><i style={{ width: `${duration ? Math.min(100, Math.max(0, remaining / duration * 100)) : 0}%` }} /></div></section>}
    {state.revealed === true && <div className="physical-room-reveal"><span>REVEAL</span><strong>{stringOf(round?.revealText, 'Show your choice and explain it.')}</strong></div>}
    {state.phase === 'lobby' && <div className="interactive-help">The host will start the room when everyone is ready.</div>}
  </PhysicalShell>;
};

export const PhysicalRoomController: React.FC<ActivityComponentProps> = ({ envelope, onCommandSent, hostView }) => {
  const state = stateOf(envelope);
  const [busy, setBusy] = useState(false);
  const [awardPoints, setAwardPoints] = useState(100);
  const send = async (action: string, payload?: JsonRecord) => {
    setBusy(true);
    try { await ActivityApi.executeCommand(envelope.runId, { action, payload }); onCommandSent?.(); }
    finally { setBusy(false); }
  };
  const status = stringOf(state.challengeStatus, 'ready');
  const hasTimer = Boolean(numberOf(state.timerDurationMs));
  return <div className="act-ctrl-container interactive-host-controller physical-room-controller">
    <div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">PHYSICAL ROOM CONTROL</span><strong>{phaseLabel(state.phase)}</strong><small>Everything needed is on the TV and in the room. Phones remain optional.</small></div><span className="controller-score">{numberOf(state.currentRoundIndex, 0) + 1}<small> round</small></span></div>
    <div className="act-controller-button-row">
      <button type="button" className="act-btn act-btn-primary" disabled={busy} onClick={() => void send('start')}>Start room</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('previous')}>Previous</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('next')}>Next</button>
      <button type="button" className="act-btn act-btn-primary" disabled={busy} onClick={() => void send('starttimer')}>Start timer</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy || !hasTimer || status !== 'running'} onClick={() => void send('pausetimer')}>Pause</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy || status !== 'paused'} onClick={() => void send('resumetimer')}>Resume</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('reset')}>Reset</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('randomize')}>Randomize</button>
      <button type="button" className="act-btn act-btn-gold" disabled={busy} onClick={() => void send('reveal')}>Reveal</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('showleaderboard')}>Show leaderboard</button>
      <button type="button" className="act-btn act-btn-danger" disabled={busy} onClick={() => void send('finish')}>End room</button>
    </div>
    {hostView?.teams?.length ? <div className="act-ctrl-card physical-room-awards"><div><strong>Award a team</strong><span>Credit the room challenge without opening the full score panel.</span></div><label>Points<input type="number" min={-1000} max={1000} step={25} value={awardPoints} onChange={event => setAwardPoints(Number(event.target.value) || 0)} /></label><div className="act-controller-button-row">{hostView.teams.filter(team => team.active).map(team => <button type="button" className="act-btn act-btn-gold" key={team.id} disabled={busy} onClick={() => void send('awardpoints', { teamId: team.id, amount: awardPoints, reason: 'Physical room challenge' })}>+{awardPoints} · {team.name}</button>)}</div></div> : null}
    <div className="act-ctrl-card physical-room-controller-status"><strong>{status.toUpperCase()}</strong><span>{hostView?.teams?.length ? 'Use the quick award buttons above or the full session panel for score adjustments.' : 'Create teams in the session panel when the room needs team scoring.'}</span></div>
  </div>;
};

export const PhysicalRoomEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const rounds = listOf(config.rounds);
  const updateRounds = (next: JsonRecord[]) => onChange({ ...config, rounds: next });
  return <div className="activity-editor-stack">
    <label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label>
    <p className="muted">Write short, visible instructions for activities that happen in the room. The TV paces the group; the host controls the round.</p>
    {rounds.map((round, index) => {
      const choices = Array.isArray(round.choices) ? round.choices.map(choice => stringOf(choice)) : [];
      const updateRound = (updated: JsonRecord) => { const next = [...rounds]; next[index] = updated; updateRounds(next); };
      return <div className="activity-editor-card physical-room-editor-card" key={stringOf(round.id, String(index))}>
        <div className="activity-editor-row"><strong>Round {index + 1}</strong><input value={stringOf(round.title)} placeholder="Four Corners" onChange={event => updateRound({ ...round, title: event.target.value })} /><input type="number" min={5} max={3600} value={numberOf(round.seconds, 30)} aria-label={`Round ${index + 1} seconds`} onChange={event => updateRound({ ...round, seconds: Number(event.target.value) || 30 })} /></div>
        <textarea value={stringOf(round.instructions)} placeholder="Choose a corner of the room." onChange={event => updateRound({ ...round, instructions: event.target.value })} />
        <div className="physical-room-choice-editor"><div className="activity-editor-card-heading"><strong>Room choices ({choices.length})</strong><button type="button" className="button" onClick={() => updateRound({ ...round, choices: [...choices, `Choice ${choices.length + 1}`] })} disabled={choices.length >= 12}>+ Add choice</button></div>{choices.map((choice, choiceIndex) => <div className="activity-editor-row" key={`${choiceIndex}-${choice}`}><input value={choice} aria-label={`Round ${index + 1} choice ${choiceIndex + 1}`} placeholder={`Choice ${choiceIndex + 1}`} onChange={event => updateRound({ ...round, choices: choices.map((item, itemIndex) => itemIndex === choiceIndex ? event.target.value : item) })} /><button type="button" className="button danger" onClick={() => updateRound({ ...round, choices: choices.filter((_, itemIndex) => itemIndex !== choiceIndex) })} aria-label={`Remove round ${index + 1} choice ${choiceIndex + 1}`}>Remove</button></div>)}{choices.length === 0 && <small className="muted">No choices yet. This round can still be used for host-led instructions.</small>}</div>
        <input value={stringOf(round.revealText)} placeholder="Show your choice and explain it." onChange={event => updateRound({ ...round, revealText: event.target.value })} />
        <button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateRounds(rounds.filter((_, itemIndex) => itemIndex !== index))}>Remove round</button>
      </div>;
    })}
    <button type="button" className="button" onClick={() => updateRounds([...rounds, { id: `round-${Date.now()}`, title: `Round ${rounds.length + 1}`, instructions: '', choices: [], seconds: 30, revealText: '' }])}>+ Add round</button>
  </div>;
};
