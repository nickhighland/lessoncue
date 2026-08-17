import React, { useState } from 'react';
import type { ActivityComponentProps, ActivityEditorProps } from '../../activityRegistry';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';
import { ActivityRevealCurtain, ActivityWinnerBanner } from '../../ActivityMotion';
import { ActivityLeaderboard } from '../../ActivityLeaderboard';
import { EmbeddedUtilityEditor } from './InteractiveGames';

type JsonRecord = Record<string, unknown>;

const stateOf = (envelope: ActivityStateEnvelope) => (envelope.state || {}) as JsonRecord;
const configOf = (envelope: ActivityStateEnvelope) => (envelope.config || {}) as JsonRecord;
const listOf = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
const stringOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;
const phaseLabel = (value: unknown) => stringOf(value, 'lobby').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();

const BRACKET_PRESETS: Record<string, () => JsonRecord> = {
  bracketBattle: () => ({
    preset: 'bracketBattle',
    presetLabel: 'BRACKET BATTLE',
    title: 'Bracket Battle',
    entrantSource: 'teacher',
    entrants: ['North Team', 'South Team', 'East Team', 'West Team'].map((label, index) => ({ id: `entrant-${index + 1}`, label })),
    pointsPerWin: 100
  }),
  rockPaperScissors: () => ({
    preset: 'rockPaperScissors',
    presetLabel: 'ROCK · PAPER · SCISSORS',
    title: 'Rock Paper Scissors Royale',
    entrantSource: 'participants',
    entrants: [],
    pointsPerWin: 100
  }),
  suddenDeath: () => ({
    preset: 'suddenDeath',
    presetLabel: 'SUDDEN DEATH',
    title: 'Sudden Death',
    entrantSource: 'participants',
    entrants: [],
    pointsPerWin: 250
  }),
  survivorTrivia: () => ({
    preset: 'survivorTrivia',
    presetLabel: 'SURVIVOR TRIVIA',
    title: 'Survivor Trivia',
    entrantSource: 'teams',
    entrants: [],
    pointsPerWin: 150
  }),
  headsOrTails: () => ({
    preset: 'headsOrTails',
    presetLabel: 'HEADS OR TAILS',
    title: 'Heads or Tails',
    entrantSource: 'participants',
    entrants: [],
    pointsPerWin: 50
  })
};

const BRACKET_PRESET_LABELS: Record<string, string> = {
  bracketBattle: 'Bracket Battle',
  rockPaperScissors: 'Rock Paper Scissors Royale',
  suddenDeath: 'Sudden Death',
  survivorTrivia: 'Survivor Trivia',
  headsOrTails: 'Heads or Tails'
};

const BracketShell: React.FC<{ children: React.ReactNode; title: string; kicker?: string; phase?: unknown; joinCode?: unknown; participantCount?: unknown }> = ({ children, title, kicker = '🏆 BRACKET BATTLE', phase, joinCode, participantCount }) => (
  <div className="activity-stage interactive-game-stage bracket-stage">
    <div className="activity-stage-content">
      <div className="activity-header">
        <div className="stage-kicker">{kicker} · {phaseLabel(phase)}</div>
        <h1 className="activity-title">{title}</h1>
      </div>
      {stringOf(joinCode) && <div className="interactive-join-banner"><span>JOIN THE GAME</span><strong>/play/{stringOf(joinCode)}</strong><b>CODE {stringOf(joinCode)}</b><small>{numberOf(participantCount)} joined</small></div>}
      {children}
    </div>
  </div>
);

const CurrentMatch: React.FC<{ match: JsonRecord; phase: unknown }> = ({ match, phase }) => {
  const winnerId = stringOf(match.winnerId);
  const voteCounts = listOf(match.voteCounts);
  const items = [
    { id: stringOf(match.entrantAId), label: stringOf(match.entrantA, 'Entrant A') },
    { id: stringOf(match.entrantBId), label: stringOf(match.entrantB, 'Entrant B') }
  ].filter(item => item.id);
  return <div className="bracket-current-match">
    <span className="interactive-round-label">ROUND {numberOf(match.round, 1)} · LIVE MATCHUP</span>
    <div className="bracket-versus-row">
      {items.map((item, index) => <div className={`bracket-entrant-card ${winnerId === item.id ? 'winner' : ''}`} key={item.id}><span>{index === 0 ? 'A' : 'B'}</span><strong>{item.label}</strong>{winnerId === item.id && <small>ADVANCES</small>}</div>)}
      {items.length === 2 && <b className="bracket-versus">VS</b>}
    </div>
    {phase === 'voting' && <div className="interactive-help">Choose the entrant you think should advance. The host reveals the result.</div>}
    {phase === 'reveal' && voteCounts.length > 0 && <div className="bracket-vote-results" aria-label="Audience vote results">{voteCounts.map((vote, index) => <div key={stringOf(vote.entrantId, String(index))}><span>{stringOf(vote.label, 'Entrant')}</span><strong>{numberOf(vote.count)} votes</strong></div>)}</div>}
    <ActivityRevealCurtain visible={phase === 'reveal'} kicker="ADVANCING">{items.find(item => item.id === winnerId)?.label || 'Winner selected'}</ActivityRevealCurtain>
  </div>;
};

export const BracketDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const current = state.currentMatch && typeof state.currentMatch === 'object' ? state.currentMatch as JsonRecord : null;
  const matches = listOf(state.bracketMatches);
  const rounds = [...new Set(matches.map(match => numberOf(match.round, 1)))].sort((a, b) => a - b);
  return <BracketShell title={stringOf(config.title, envelope.name || 'Bracket Battle')} kicker={`🏆 ${stringOf(config.presetLabel, 'BRACKET BATTLE')}`} phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
    {current ? <CurrentMatch match={current} phase={state.phase} /> : <ActivityWinnerBanner visible={true} winner={stringOf(state.bracketChampion, 'The final winner will appear here.')} subtitle="CHAMPION" />}
    <div className="bracket-board" aria-label="Tournament bracket">
      {rounds.map(round => <section className="bracket-round" key={round}><span className="interactive-round-label">ROUND {round}</span>{matches.filter(match => numberOf(match.round, 1) === round).map((match, index) => <div className={`bracket-mini-match ${stringOf(match.status) === 'complete' ? 'complete' : ''}`} key={stringOf(match.id, `${round}-${index}`)}><span>{stringOf(match.entrantA, 'Bye')}</span><b>{stringOf(match.winnerId) ? '✓' : '·'}</b><span>{stringOf(match.entrantB, 'Bye')}</span></div>)}</section>)}
    </div>
    <ActivityLeaderboard state={state} showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />
    <div className="interactive-help">The host opens each matchup, the room votes, and the host advances the winner.</div>
  </BracketShell>;
};

export const BracketController: React.FC<ActivityComponentProps> = ({ envelope, onCommandSent }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const entrants = listOf(state.bracketEntrants).length ? listOf(state.bracketEntrants) : listOf(config.entrants);
  const rawCurrent = state.currentMatch && typeof state.currentMatch === 'object'
    ? state.currentMatch as JsonRecord
    : listOf(state.matchups).find(match => stringOf(match.id) === stringOf(state.currentMatchId));
  const entrantLabel = (id: unknown, fallback: string) => stringOf(entrants.find(entrant => stringOf(entrant.id) === stringOf(id))?.label, fallback);
  const current: JsonRecord | null = rawCurrent ? {
    ...rawCurrent,
    entrantA: stringOf(rawCurrent.entrantA, entrantLabel(rawCurrent.entrantAId, 'Entrant A')),
    entrantB: stringOf(rawCurrent.entrantB, entrantLabel(rawCurrent.entrantBId, 'Entrant B'))
  } : null;
  const [busy, setBusy] = useState(false);
  const [sourceRunId, setSourceRunId] = useState('');
  const [handoffMessage, setHandoffMessage] = useState('');
  const send = async (action: string, payload?: JsonRecord) => {
    setBusy(true);
    try { await ActivityApi.executeCommand(envelope.runId, { action, payload }); onCommandSent?.(); }
    catch (error) { console.debug('Bracket command was rejected; the host notice contains the reason.', error); }
    finally { setBusy(false); }
  };
  const importFinalists = async () => {
    if (!sourceRunId.trim()) return;
    setBusy(true);
    setHandoffMessage('');
    try {
      const result = await ActivityApi.importBracketFinalists(envelope.runId, sourceRunId.trim());
      setHandoffMessage(`${result.imported} finalists imported. The bracket is ready to start.`);
      onCommandSent?.();
    } catch (error) {
      setHandoffMessage(`Could not import finalists: ${(error as Error).message}`);
    } finally { setBusy(false); }
  };
  const status = stringOf(current?.status, 'pending');
  const phase = stringOf(state.phase, 'lobby');
  const aId = stringOf(current?.entrantAId);
  const bId = stringOf(current?.entrantBId);
  const aLabel = stringOf(current?.entrantA, 'Entrant A');
  const bLabel = stringOf(current?.entrantB, 'Entrant B');
  return <div className="act-ctrl-container interactive-host-controller">
    <div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">TOURNAMENT CONTROL</span><strong>{phaseLabel(state.phase)}</strong><small>Open a matchup, let the room vote, then choose or reveal the winner.</small></div><span className="controller-score">{numberOf(state.currentRound, 1)}<small> round</small></span></div>
    <div className="act-controller-button-row">
      <button type="button" className="act-btn act-btn-primary" disabled={busy} onClick={() => void send('start')}>Start tournament</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy || !current || status === 'complete'} onClick={() => void send('open')}>Open matchup</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy || !current || status !== 'open'} onClick={() => void send('close')}>Close voting</button>
      <button type="button" className="act-btn act-btn-gold" disabled={busy || !current || !['open', 'closed'].includes(status) || !aId} onClick={() => void send('reveal', { winnerId: aId })}>Advance {aLabel}</button>
      {bId && <button type="button" className="act-btn act-btn-gold" disabled={busy || !current || !['open', 'closed'].includes(status)} onClick={() => void send('reveal', { winnerId: bId })}>Advance {bLabel}</button>}
      {bId && <button type="button" className="act-btn act-btn-danger" disabled={busy || !current || !['open', 'closed'].includes(status)} onClick={() => void send('removeentrant', { entrantId: bId })}>Remove {bLabel}</button>}
      <button type="button" className="act-btn act-btn-secondary" disabled={busy || !current} onClick={() => void send('skip')}>Skip matchup</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy || !current || status !== 'complete'} onClick={() => void send('next')}>Next matchup</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy || !current} onClick={() => void send('resetmatch')}>Reset matchup</button>
      <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('showbracket')}>Show bracket</button>
      <button type="button" className="act-btn act-btn-danger" disabled={busy} onClick={() => void send('finish')}>End tournament</button>
    </div>
    <div className="act-ctrl-card bracket-handoff-card"><strong>Import finalists from another activity</strong><small>Paste the completed source run ID to bring its top players or teams into this bracket. The target roster is used when names match.</small><div className="activity-editor-row"><input value={sourceRunId} onChange={event => setSourceRunId(event.target.value)} placeholder="Source activity run ID" aria-label="Source activity run ID" /><button type="button" className="act-btn act-btn-secondary" disabled={busy || phase !== 'lobby' || !sourceRunId.trim()} onClick={() => void importFinalists()}>Import finalists</button></div>{handoffMessage && <span className="muted" role="status">{handoffMessage}</span>}</div>
    {current && <div className="act-ctrl-card bracket-controller-match"><span className="interactive-round-label">CURRENT MATCHUP</span><strong>{aLabel} <em>vs</em> {bLabel || 'BYE'}</strong><small>{status === 'open' ? 'Voting is open.' : status === 'complete' ? 'Winner selected. Advance when ready.' : 'Waiting for the host to open this matchup.'}</small></div>}
  </div>;
};

export const BracketEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const selectedPreset = stringOf(config.preset, 'bracketBattle');
  const entrants = listOf(config.entrants);
  const entrantSource = stringOf(config.entrantSource, 'teacher');
  const entrantSelection = stringOf(config.entrantSelection, 'all');
  const updateEntrants = (next: JsonRecord[]) => onChange({ ...config, entrants: next });
  const applyPreset = () => {
    const factory = BRACKET_PRESETS[selectedPreset] || BRACKET_PRESETS.bracketBattle;
    onChange({ ...config, ...factory() });
  };
  return <div className="activity-editor-stack">
    <div className="activity-editor-card preset-picker-card">
      <div className="activity-editor-card-heading"><strong>Tournament format</strong><span className="activity-library-chip">One bracket engine · multiple game styles</span></div>
      <div className="activity-editor-row">
        <select aria-label="Tournament preset" value={selectedPreset} onChange={event => onChange({ ...config, preset: event.target.value })}>{Object.entries(BRACKET_PRESET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button type="button" className="button" onClick={applyPreset}>Apply preset template</button>
      </div>
      <p className="muted">Templates set a friendly starting roster and participation mode. You can still rename entrants, switch to live participants/teams, and change the score value.</p>
    </div>
    <label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label>
    <label>Entrants come from<select value={entrantSource} onChange={event => onChange({ ...config, entrantSource: event.target.value })}><option value="teacher">Teacher-entered list</option><option value="participants">Joined participants</option><option value="teams">Live teams</option></select></label>
    <label>Roster selection<select value={entrantSelection} onChange={event => onChange({ ...config, entrantSelection: event.target.value })}><option value="all">Use everyone in the roster</option><option value="random">Randomly draw a roster at start</option></select></label>
    {entrantSelection === 'random' && <label>Random roster size<input type="number" min={2} max={32} value={numberOf(config.randomEntrantCount, Math.max(2, Math.min(8, entrants.length || 8)))} onChange={event => onChange({ ...config, randomEntrantCount: Math.max(2, Math.min(32, Number(event.target.value) || 2)) })} /><small className="muted">The server draws this many entrants once when the tournament starts.</small></label>}
    <label>Points per win<input type="number" min={0} max={1000} value={numberOf(config.pointsPerWin, 0)} onChange={event => onChange({ ...config, pointsPerWin: Number(event.target.value) || 0 })} /></label>
    {entrantSource === 'teacher' ? <>
      <p className="muted">Teacher-entered entrants can be people, teams, ideas, drawings, or finalists from another activity. Dynamic participant/team sources are seeded when the host starts.</p>
      {entrants.map((entrant, index) => <div className="activity-editor-row bracket-editor-row" key={stringOf(entrant.id, String(index))}><strong>{index + 1}</strong><input value={stringOf(entrant.label)} aria-label={`Entrant ${index + 1}`} placeholder={`Entrant ${index + 1}`} onChange={event => { const next = [...entrants]; next[index] = { ...entrant, label: event.target.value }; updateEntrants(next); }} /><button type="button" className="button danger" disabled={entrants.length <= 2} onClick={() => updateEntrants(entrants.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}
      <button type="button" className="button" disabled={entrants.length >= 32} onClick={() => updateEntrants([...entrants, { id: `entrant-${Date.now()}`, label: `Entrant ${entrants.length + 1}` }])}>+ Add entrant</button>
    </> : <div className="activity-editor-callout"><strong>Live roster mode</strong><span>The host must have at least two active {entrantSource} before starting. The bracket will use their live names and IDs.</span></div>}
    <EmbeddedUtilityEditor config={config} onChange={onChange} />
  </div>;
};
