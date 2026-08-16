import React, { useEffect, useState } from 'react';
import type { ActivityComponentProps, ActivityEditorProps } from '../../activityRegistry';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

type JsonRecord = Record<string, unknown>;
const stateOf = (envelope: ActivityStateEnvelope) => (envelope.state || {}) as JsonRecord;
const configOf = (envelope: ActivityStateEnvelope) => (envelope.config || {}) as JsonRecord;
const listOf = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
const stringArrayOf = (value: unknown): string[] => Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : [];
const stringOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;
const utilityName = (type: string) => ({
  coinFlip: 'COIN FLIP',
  dice: 'DICE ROLL',
  randomNumber: 'RANDOM NUMBER',
  mysteryBoxes: 'MYSTERY BOXES',
  challengePicker: 'CHALLENGE PICKER',
  teamGenerator: 'TEAM GENERATOR',
  randomPerson: 'RANDOM PERSON',
  randomTeam: 'RANDOM TEAM',
  countdown: 'COUNTDOWN'
}[type] || 'UTILITY');
const phaseLabel = (value: unknown) => stringOf(value, 'lobby').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
const formatTimer = (milliseconds: number) => {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const UtilityShell: React.FC<{ title: string; utilityType: string; phase: unknown; children: React.ReactNode }> = ({ title, utilityType, phase, children }) => (
  <div className="activity-stage interactive-game-stage utility-game-stage">
    <div className="activity-stage-content">
      <div className="activity-header">
        <div className="stage-kicker">🎲 {utilityName(utilityType)} · {phaseLabel(phase)}</div>
        <h1 className="activity-title">{title}</h1>
      </div>
      <div className="utility-game-badge"><strong>HOST CONTROLLED</strong><span>One shared utility engine · server-randomized outcomes</span></div>
      {children}
    </div>
  </div>
);

export const UtilityDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const utilityType = stringOf(state.utilityType, stringOf(config.utilityType, 'coinFlip'));
  const result = state.result && typeof state.result === 'object' ? state.result as JsonRecord : null;
  const boxes = listOf(state.boxes);
  const history = listOf(state.history).slice(-4).reverse();
  const [clockNow, setClockNow] = useState(() => Date.now());
  const timerRunning = utilityType === 'countdown' && state.timerRunning === true;
  const timerStartedAt = stringOf(state.timerStartedAt);
  const timerDurationMs = numberOf(state.timerDurationMs, numberOf(config.durationSeconds, 60) * 1000);
  const storedRemainingMs = numberOf(state.timerRemainingMs, timerDurationMs);
  useEffect(() => {
    if (!timerRunning) return undefined;
    const interval = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [timerRunning, timerStartedAt]);
  const remainingMs = timerRunning && timerStartedAt
    ? Math.max(0, timerDurationMs - (clockNow - Date.parse(timerStartedAt)))
    : storedRemainingMs;
  return <UtilityShell title={stringOf(config.title, envelope.name || 'Game Show Utility')} utilityType={utilityType} phase={state.phase}>
    {utilityType === 'countdown' ? <section className={`utility-result-card utility-countdown-card ${state.timerWarning === true ? 'warning' : ''}`} aria-live="polite">
      <span>{state.timerExpired === true || remainingMs <= 0 ? 'TIME' : timerRunning ? 'COUNTDOWN RUNNING' : 'READY'}</span>
      <strong>{formatTimer(remainingMs)}</strong>
      <small>{state.timerExpired === true || remainingMs <= 0 ? 'TIME IS UP' : timerRunning ? 'The host can pause or adjust the timer.' : 'The host starts this timer from the web controller.'}</small>
    </section> : utilityType === 'mysteryBoxes' ? <section className="utility-box-grid" aria-label="Mystery boxes">
      {boxes.map((box, index) => <div className={`utility-box ${box.revealed === true ? 'revealed' : ''}`} key={stringOf(box.id, String(index))}><span>{index + 1}</span><strong>{stringOf(box.revealed === true ? box.label : box.label, `Mystery Box ${index + 1}`)}</strong><small>{box.revealed === true ? 'REVEALED' : 'CHOOSE A BOX'}</small></div>)}
    </section> : <section className="utility-result-card" aria-live="polite">
      <span>{result ? 'RESULT' : 'READY WHEN YOU ARE'}</span>
      <strong>{result ? stringOf(result.label, stringOf(result.value, 'Complete')) : utilityName(utilityType)}</strong>
      {result && stringOf(result.instructions) && <p>{stringOf(result.instructions)}</p>}
      {result && result.points !== undefined && <small>{numberOf(result.points)} points</small>}
    </section>}
    {utilityType === 'mysteryBoxes' && result && <section className="utility-result-card utility-mystery-result" aria-live="polite"><span>REVEAL</span><strong>{stringOf(result.value, stringOf(result.prize, stringOf(result.label, 'Mystery revealed')))}</strong>{result.points !== undefined && <small>{numberOf(result.points)} points</small>}</section>}
    {history.length > 0 && <section className="utility-history" aria-label="Recent utility results"><span>RECENT RESULTS</span><div>{history.map((item, index) => <b key={`${stringOf(item.id, stringOf(item.label))}-${index}`}>{stringOf(item.label, stringOf(item.value, 'Result'))}</b>)}</div></section>}
    {state.phase === 'lobby' && <div className="interactive-help">The host controls this utility from the web controller.</div>}
  </UtilityShell>;
};

export const UtilityController: React.FC<ActivityComponentProps> = ({ envelope, onCommandSent, hostView }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const utilityType = stringOf(config.utilityType, 'coinFlip');
  const lastResult = state.result && typeof state.result === 'object' ? state.result as JsonRecord : null;
  const [busy, setBusy] = useState(false);
  const [teamCount, setTeamCount] = useState(numberOf(config.teamCount, 2));
  const [assignmentMode, setAssignmentMode] = useState(stringOf(config.teamAssignmentMode, 'balanced'));
  const send = async (action: string, payload?: JsonRecord) => {
    setBusy(true);
    try { await ActivityApi.executeCommand(envelope.runId, { action, payload }); onCommandSent?.(); }
    finally { setBusy(false); }
  };
  const actionLabel = utilityType === 'coinFlip' ? 'Flip coin' : utilityType === 'dice' ? 'Roll dice' : utilityType === 'randomNumber' ? 'Draw number' : utilityType === 'challengePicker' ? 'Pick challenge' : utilityType === 'randomPerson' ? 'Pick person' : utilityType === 'randomTeam' ? 'Pick team' : utilityType === 'teamGenerator' ? 'Generate teams' : 'Open a box';
  const action = utilityType === 'teamGenerator' ? 'generateteams' : utilityType === 'randomPerson' ? 'pickperson' : utilityType === 'randomTeam' ? 'pickteam' : utilityType === 'dice' ? 'roll' : utilityType === 'randomNumber' ? 'draw' : utilityType === 'challengePicker' ? 'pick' : 'flip';
  const boxes = listOf(config.boxes);
  const revealedBoxIds = stringArrayOf(state.revealedBoxIds);
  const teams = hostView?.teams || [];
  const timerRunning = state.timerRunning === true;
  const timerRemainingMs = numberOf(state.timerRemainingMs, numberOf(config.durationSeconds, 60) * 1000);
  return <div className="act-ctrl-container interactive-host-controller utility-controller">
    <div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">UTILITY CONTROL</span><strong>{utilityName(utilityType)}</strong><small>All outcomes are generated by the server. The TV only receives the public result.</small></div><span className="controller-score">{listOf(state.history).length}<small> results</small></span></div>
    <div className="act-controller-button-row">
      <button type="button" className="act-btn act-btn-primary" disabled={busy} onClick={() => void send('start')}>Start utility</button>
      {utilityType !== 'mysteryBoxes' && utilityType !== 'countdown' && <button type="button" className="act-btn act-btn-gold" disabled={busy} onClick={() => void send(action, utilityType === 'teamGenerator' ? { teamCount, assignmentMode } : undefined)}>{actionLabel}</button>}
      <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('clear')}>Clear result</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('next')}>Next</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('showleaderboard')}>Show leaderboard</button>
      <button type="button" className="act-btn act-btn-danger" disabled={busy} onClick={() => void send('finish')}>End utility</button>
    </div>
    {utilityType === 'countdown' && <div className="act-ctrl-card utility-countdown-controller">
      <strong>{formatTimer(timerRemainingMs)}</strong>
      <span>{timerRunning ? 'Timer is running on the server.' : state.timerCompleted === true ? 'Time is up. Reset or set a new time.' : 'Timer is paused and ready.'}</span>
      <div className="act-controller-button-row">
        {timerRunning ? <button type="button" className="act-btn act-btn-danger" disabled={busy} onClick={() => void send('pausetimer')}>Pause timer</button> : <button type="button" className="act-btn act-btn-primary" disabled={busy || timerRemainingMs <= 0} onClick={() => void send(state.timerCompleted === true ? 'clear' : 'resumetimer')}>{state.timerCompleted === true ? 'Reset timer' : 'Start / resume timer'}</button>}
        <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('adjusttime', { deltaSeconds: -10 })}>−10s</button>
        <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('adjusttime', { deltaSeconds: 10 })}>+10s</button>
        <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('clear')}>Reset</button>
      </div>
    </div>}
    {utilityType === 'mysteryBoxes' && <div className="act-ctrl-card utility-box-controller"><strong>Choose a box to reveal</strong><div>{boxes.map((box, index) => <button type="button" className="act-btn act-btn-primary" key={stringOf(box.id, String(index))} disabled={busy || revealedBoxIds.includes(stringOf(box.id))} onClick={() => void send('revealbox', { boxId: stringOf(box.id) })}>Box {index + 1} · {stringOf(box.label, 'Mystery')}</button>)}</div></div>}
    {utilityType === 'teamGenerator' && <div className="act-ctrl-card utility-team-controller"><label>Teams to create<input type="number" min={2} max={12} value={teamCount} onChange={event => setTeamCount(Math.max(2, Math.min(12, Number(event.target.value) || 2)))} /></label><label>Assignment mode<select value={assignmentMode} onChange={event => setAssignmentMode(event.target.value)}><option value="balanced">Balanced random</option><option value="random">Fully random</option><option value="manual">Manual assignment</option></select></label><span>{hostView?.participants.length || 0} players joined · {teams.length} teams currently configured</span></div>}
    {utilityType === 'randomPerson' && <div className="act-ctrl-card utility-team-controller"><span>{hostView?.participants.length || 0} active participants are available to pick.</span></div>}
    {utilityType === 'randomTeam' && <div className="act-ctrl-card utility-team-controller"><span>{teams.length} active teams are available to pick.</span></div>}
    {lastResult && <div className="act-ctrl-card utility-controller-result"><span>LAST RESULT</span><strong>{stringOf(lastResult.label, stringOf(lastResult.value, 'Complete'))}</strong><div className="act-controller-button-row"><button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('retry', utilityType === 'teamGenerator' ? { teamCount, assignmentMode } : undefined)}>Retry</button><button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('skip')}>Skip result</button></div></div>}
  </div>;
};

export const UtilityEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const utilityType = stringOf(config.utilityType, 'coinFlip');
  const choices = Array.isArray(config.choices) ? config.choices.map(choice => String(choice)).filter(Boolean) : ['Heads', 'Tails'];
  const boxes = listOf(config.boxes);
  const challenges = listOf(config.challenges);
  const updateChoices = (next: string[]) => onChange({ ...config, choices: next });
  const updateBox = (index: number, value: JsonRecord) => onChange({ ...config, boxes: boxes.map((box, itemIndex) => itemIndex === index ? value : box) });
  const updateChallenge = (index: number, value: JsonRecord) => onChange({ ...config, challenges: challenges.map((item, itemIndex) => itemIndex === index ? value : item) });
  return <div className="activity-editor-stack utility-editor">
    <label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label>
    <label>Utility preset<select value={utilityType} onChange={event => onChange({ ...config, utilityType: event.target.value })}><option value="coinFlip">Coin Flip</option><option value="dice">Dice</option><option value="randomNumber">Random Number</option><option value="randomPerson">Random Person Picker</option><option value="randomTeam">Random Team Picker</option><option value="mysteryBoxes">Mystery Boxes</option><option value="challengePicker">Challenge Picker</option><option value="teamGenerator">Team Generator</option><option value="countdown">Countdown</option></select></label>
    {utilityType === 'coinFlip' && <div className="utility-editor-list"><div className="activity-editor-card-heading"><strong>Choices ({choices.length})</strong><button type="button" className="button" onClick={() => updateChoices([...choices, `Choice ${choices.length + 1}`])} disabled={choices.length >= 8}>+ Add choice</button></div>{choices.map((choice, index) => <div className="activity-editor-row" key={`${index}-${choice}`}><input value={choice} aria-label={`Coin choice ${index + 1}`} onChange={event => updateChoices(choices.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /><button type="button" className="button danger" onClick={() => updateChoices(choices.filter((_, itemIndex) => itemIndex !== index))} disabled={choices.length <= 2} aria-label={`Remove coin choice ${index + 1}`}>Remove</button></div>)}<small>Use two to eight choices for coin-like decisions.</small></div>}
    {utilityType === 'dice' && <label>Number of sides<input type="number" min={2} max={1000} value={numberOf(config.diceSides, 6)} onChange={event => onChange({ ...config, diceSides: Number(event.target.value) || 6 })} /></label>}
    {utilityType === 'randomNumber' && <div className="two-fields"><label>Minimum<input type="number" value={numberOf(config.minimum, 1)} onChange={event => onChange({ ...config, minimum: Number(event.target.value) || 1 })} /></label><label>Maximum<input type="number" value={numberOf(config.maximum, 100)} onChange={event => onChange({ ...config, maximum: Number(event.target.value) || 100 })} /></label></div>}
    {utilityType === 'randomPerson' && <div className="activity-editor-callout"><strong>Live participant picker</strong><span>The host will pick from active participants who joined this run. No names are stored in the reusable definition.</span></div>}
    {utilityType === 'randomTeam' && <div className="activity-editor-callout"><strong>Live team picker</strong><span>The host will pick from active teams in this run. Generate or assign teams before using the picker.</span></div>}
    {utilityType === 'countdown' && <div className="two-fields"><label>Duration (seconds)<input type="number" min={1} max={3600} value={numberOf(config.durationSeconds, 60)} onChange={event => onChange({ ...config, durationSeconds: Math.max(1, Math.min(3600, Number(event.target.value) || 60)) })} /></label><label>Warning threshold<input type="number" min={0} max={3600} value={numberOf(config.warningThresholdSeconds, 10)} onChange={event => onChange({ ...config, warningThresholdSeconds: Math.max(0, Math.min(3600, Number(event.target.value) || 0)) })} /></label></div>}
    {utilityType === 'mysteryBoxes' && <div className="utility-editor-list"><div className="activity-editor-card-heading"><strong>Mystery boxes ({boxes.length})</strong><button type="button" className="button" onClick={() => onChange({ ...config, boxes: [...boxes, { id: `box-${Date.now()}`, label: `Mystery Box ${boxes.length + 1}`, value: '', points: 0 }] })} disabled={boxes.length >= 50}>+ Add box</button></div>{boxes.map((box, index) => <div className="activity-editor-card utility-editor-row" key={stringOf(box.id, String(index))}><input value={stringOf(box.label, `Mystery Box ${index + 1}`)} aria-label={`Box ${index + 1} label`} onChange={event => updateBox(index, { ...box, label: event.target.value })} /><input value={stringOf(box.value)} aria-label={`Box ${index + 1} reveal`} placeholder="Revealed value" onChange={event => updateBox(index, { ...box, value: event.target.value })} /><input type="number" value={numberOf(box.points)} aria-label={`Box ${index + 1} points`} onChange={event => updateBox(index, { ...box, points: Number(event.target.value) || 0 })} /><button type="button" className="button danger" onClick={() => onChange({ ...config, boxes: boxes.filter((_, itemIndex) => itemIndex !== index) })} disabled={boxes.length <= 2} aria-label={`Remove mystery box ${index + 1}`}>Remove</button></div>)}<small>Mystery Boxes needs at least two boxes to create a choice.</small></div>}
    {utilityType === 'challengePicker' && <div className="utility-editor-list"><div className="activity-editor-card-heading"><strong>Challenges ({challenges.length})</strong><button type="button" className="button" onClick={() => onChange({ ...config, challenges: [...challenges, { id: `challenge-${Date.now()}`, label: `Challenge ${challenges.length + 1}`, instructions: '', points: 0 }] })} disabled={challenges.length >= 100}>+ Add challenge</button></div>{challenges.map((challenge, index) => <div className="activity-editor-card utility-editor-challenge" key={stringOf(challenge.id, String(index))}><input value={stringOf(challenge.label, `Challenge ${index + 1}`)} aria-label={`Challenge ${index + 1} label`} onChange={event => updateChallenge(index, { ...challenge, label: event.target.value })} /><textarea value={stringOf(challenge.instructions)} aria-label={`Challenge ${index + 1} instructions`} placeholder="Instructions" onChange={event => updateChallenge(index, { ...challenge, instructions: event.target.value })} /><input type="number" value={numberOf(challenge.points)} aria-label={`Challenge ${index + 1} points`} onChange={event => updateChallenge(index, { ...challenge, points: Number(event.target.value) || 0 })} /><button type="button" className="button danger" onClick={() => onChange({ ...config, challenges: challenges.filter((_, itemIndex) => itemIndex !== index) })} disabled={challenges.length <= 1} aria-label={`Remove challenge ${index + 1}`}>Remove</button></div>)}<small>Keep at least one challenge in the picker.</small></div>}
    {utilityType === 'teamGenerator' && <div className="two-fields"><label>Default team count<input type="number" min={2} max={12} value={numberOf(config.teamCount, 2)} onChange={event => onChange({ ...config, teamCount: Number(event.target.value) || 2 })} /></label><label>Assignment mode<select value={stringOf(config.teamAssignmentMode, 'balanced')} onChange={event => onChange({ ...config, teamAssignmentMode: event.target.value })}><option value="balanced">Balanced random</option><option value="random">Fully random</option><option value="manual">Manual assignment</option></select></label><small>Participants must join before the host generates teams. Manual mode leaves them unassigned for the host to place.</small></div>}
  </div>;
};
