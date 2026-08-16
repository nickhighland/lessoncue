import React, { useState } from 'react';
import type { ActivityComponentProps, ActivityEditorProps } from '../../activityRegistry';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';
import { ActivityCountdown, ActivityRevealCurtain, useActivityCountdown } from '../../ActivityMotion';

type JsonRecord = Record<string, unknown>;
const stateOf = (envelope: ActivityStateEnvelope) => (envelope.state || {}) as JsonRecord;
const configOf = (envelope: ActivityStateEnvelope) => (envelope.config || {}) as JsonRecord;
const listOf = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
const stringOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;
const phaseLabel = (value: unknown) => stringOf(value, 'lobby').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();

const PHYSICAL_PRESETS: Record<string, { label: string; title: string; instructions: string; choices: string[]; seconds: number; revealText: string }> = {
  fourCorners: { label: 'Four Corners', title: 'Four Corners', instructions: 'Choose a corner of the room. When the timer ends, the host reveals the prompt.', choices: ['North', 'South', 'East', 'West'], seconds: 30, revealText: 'Show your corner and explain your choice.' },
  standSit: { label: 'Stand / Sit', title: 'Stand / Sit', instructions: 'Stand if the statement is true for you. Sit if it is not.', choices: ['Stand', 'Sit'], seconds: 20, revealText: 'Look around the room and notice the split.' },
  moveIf: { label: 'Move If…', title: 'Move If…', instructions: 'Move to the marked side of the room if the statement applies to you.', choices: ['Move', 'Stay'], seconds: 20, revealText: 'The room has made its choice.' },
  humanSpectrum: { label: 'Human Spectrum', title: 'Human Spectrum', instructions: 'Place yourself along the spectrum from one end of the room to the other.', choices: ['Strongly disagree', 'Disagree', 'Agree', 'Strongly agree'], seconds: 35, revealText: 'Compare where everyone landed and invite a few voices.' },
  lineUp: { label: 'Line Up', title: 'Line Up', instructions: 'Without talking, line up according to the host’s category.', choices: [], seconds: 45, revealText: 'Freeze the line and check the order.' },
  findSomeone: { label: 'Find Someone Who', title: 'Find Someone Who', instructions: 'Find someone in the room who matches the host’s prompt before the timer ends.', choices: [], seconds: 45, revealText: 'Point out a few surprising matches.' },
  simonSays: { label: 'Simon Says Controller', title: 'Simon Says Controller', instructions: 'Follow the command only when it begins with “Simon says.”', choices: ['Simon says', 'Freeze'], seconds: 30, revealText: 'The host checks who is still in.' },
  freezeDance: { label: 'Freeze Dance Controller', title: 'Freeze Dance Controller', instructions: 'Move while the music or host cue is active. Freeze instantly when it stops.', choices: ['Dance', 'Freeze'], seconds: 45, revealText: 'Celebrate the last movers standing.' },
  challengeWheel: { label: 'Challenge Wheel', title: 'Challenge Wheel', instructions: 'The host chooses or randomizes a quick physical challenge for the room.', choices: ['Challenge A', 'Challenge B', 'Challenge C'], seconds: 30, revealText: 'Reveal the challenge result.' },
  relayBoard: { label: 'Relay Board', title: 'Relay Board', instructions: 'Teams send one player at a time to complete the visible relay task.', choices: ['Team 1', 'Team 2'], seconds: 60, revealText: 'Award the relay round.' },
  scavengerHunt: { label: 'Scavenger Hunt', title: 'Scavenger Hunt', instructions: 'Find or photograph the requested item and return before time runs out.', choices: [], seconds: 60, revealText: 'Show what each team found.' },
  headsOrTails: { label: 'Heads or Tails', title: 'Heads or Tails', instructions: 'Choose heads or tails, then hold your choice while the host reveals the result.', choices: ['Heads', 'Tails'], seconds: 15, revealText: 'Reveal the winning side.' },
  rockPaperScissors: { label: 'Rock Paper Scissors Royale', title: 'Rock Paper Scissors Royale', instructions: 'Pair up, play one round, and winners move toward the center.', choices: ['Rock', 'Paper', 'Scissors'], seconds: 20, revealText: 'Winners advance; reset for the next wave.' }
};

const PhysicalShell: React.FC<{ title: string; kicker?: string; phase: unknown; children: React.ReactNode; joinCode?: unknown; participantCount?: unknown }> = ({ title, kicker = '🧭 PHYSICAL ROOM', phase, children, joinCode, participantCount }) => (
  <div className="activity-stage interactive-game-stage physical-room-stage">
    <div className="activity-stage-content">
      <div className="activity-header">
        <div className="stage-kicker">{kicker} · {phaseLabel(phase)}</div>
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
  const remaining = useActivityCountdown({ durationMs: numberOf(state.timerDurationMs), startedAt: state.timerStartedAt, pausedAt: state.timerPausedAt, running: stringOf(state.challengeStatus) === 'running' });
  const duration = numberOf(state.timerDurationMs);
  const timerActive = stringOf(state.challengeStatus) === 'running' || stringOf(state.challengeStatus) === 'paused';
  return <PhysicalShell title={stringOf(config.title, envelope.name || 'Physical Room')} kicker={`🧭 ${stringOf(config.presetLabel, 'PHYSICAL ROOM')}`} phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
    <section className="physical-room-prompt">
      <span className="interactive-round-label">ROUND {numberOf(state.currentRoundIndex, 0) + 1} OF {numberOf(state.roundCount, 1)}</span>
      <h2>{stringOf(round?.title, 'Get ready')}</h2>
      <p>{stringOf(round?.instructions, 'Follow the host instructions and get into position.')}</p>
    </section>
    {visibleChoices.length > 0 && <div className="physical-room-choice-grid" aria-label="Room choices">{visibleChoices.map((choice, index) => <div className={`physical-room-choice physical-room-choice-${index % 6}`} key={`${choice}-${index}`}><span>{index + 1}</span><strong>{choice}</strong></div>)}</div>}
    {timerActive && <ActivityCountdown remainingMs={remaining} durationMs={duration} label={stringOf(state.challengeStatus) === 'paused' ? 'PAUSED' : 'TIME LEFT'} />}
    <ActivityRevealCurtain visible={state.revealed === true} title="Show your choice and explain it.">{stringOf(round?.revealText, 'Show your choice and explain it.')}</ActivityRevealCurtain>
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
  const selectedPreset = stringOf(config.preset, 'fourCorners');
  const rounds = listOf(config.rounds);
  const updateRounds = (next: JsonRecord[]) => onChange({ ...config, rounds: next });
  const applyPreset = () => {
    const preset = PHYSICAL_PRESETS[selectedPreset] || PHYSICAL_PRESETS.fourCorners;
    onChange({
      ...config,
      preset: selectedPreset,
      presetLabel: preset.label.toUpperCase(),
      title: preset.title,
      rounds: [{ id: `round-${Date.now()}`, title: preset.title, instructions: preset.instructions, choices: preset.choices, seconds: preset.seconds, revealText: preset.revealText }]
    });
  };
  return <div className="activity-editor-stack">
    <div className="activity-editor-card preset-picker-card">
      <div className="activity-editor-card-heading"><strong>Room activity format</strong><span className="activity-library-chip">One host-led engine · many room games</span></div>
      <div className="activity-editor-row">
        <select aria-label="Physical room preset" value={selectedPreset} onChange={event => onChange({ ...config, preset: event.target.value })}>{Object.entries(PHYSICAL_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}</select>
        <button type="button" className="button" onClick={applyPreset}>Apply preset template</button>
      </div>
      <p className="muted">Applying a template replaces the current rounds with one editable example. Add, remove, and customize as many rounds as you need below.</p>
    </div>
    <label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label>
    <label className="checkbox-row"><input type="checkbox" checked={config.randomizeChoices === true} onChange={event => onChange({ ...config, randomizeChoices: event.target.checked })} /> Allow the host to randomize room choices</label>
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
