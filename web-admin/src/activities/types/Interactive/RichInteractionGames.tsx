import React, { useState } from 'react';
import type { ActivityComponentProps, ActivityEditorProps } from '../../activityRegistry';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';
import { ActivityCountdown, ActivityRevealCurtain, ActivityWinnerBanner, useActivityCountdown } from '../../ActivityMotion';

type JsonRecord = Record<string, unknown>;

const stateOf = (envelope: ActivityStateEnvelope) => (envelope.state || {}) as JsonRecord;
const configOf = (envelope: ActivityStateEnvelope) => (envelope.config || {}) as JsonRecord;
const listOf = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
const stringList = (value: unknown) => Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : [];
const stringOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;
const phaseLabel = (phase: unknown) => stringOf(phase, 'lobby').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();

const RichStage: React.FC<{ children: React.ReactNode; title: string; kicker: string; phase?: unknown; joinCode?: unknown; participantCount?: unknown }> = ({ children, title, kicker, phase, joinCode, participantCount }) => (
  <div className="activity-stage interactive-game-stage">
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

const LeaderboardPanel: React.FC<{ state: JsonRecord }> = ({ state }) => {
  const entries = listOf(state.leaderboard);
  if (!entries.length) return null;
  return <div className="interactive-leaderboard"><span className="interactive-round-label">SCOREBOARD</span>{entries.slice(0, 5).map((entry, index) => <div key={stringOf(entry.id, String(index))}><b>{numberOf(entry.rank, index + 1)}</b><span>{stringOf(entry.name, 'Player')}</span><strong>{numberOf(entry.score)} pts</strong></div>)}</div>;
};

const DrawingSvg: React.FC<{ strokes: unknown; className?: string }> = ({ strokes, className = '' }) => (
  <svg className={`drawing-svg ${className}`} viewBox="0 0 1 1" role="img" aria-label="Submitted drawing">
    <rect width="1" height="1" rx=".035" fill="rgba(255,255,255,.06)" />
    {listOf(strokes).map((stroke, index) => {
      const points = Array.isArray(stroke.points) ? stroke.points.filter(point => Array.isArray(point) && point.length >= 2).map(point => `${Number(point[0])},${Number(point[1])}`).join(' ') : '';
      return points ? <polyline key={index} points={points} fill="none" stroke={stringOf(stroke.color, '#f8fafc')} strokeWidth={numberOf(stroke.width, .008)} strokeLinecap="round" strokeLinejoin="round" /> : null;
    })}
  </svg>
);

export const DrawingDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const prompts = listOf(config.prompts);
  const prompt = prompts[numberOf(state.currentPromptIndex)] || prompts[0] || {};
  const drawings = listOf(state.drawings);
  const showGallery = state.phase === 'voting' || state.phase === 'reveal' || state.phase === 'leaderboard' || state.phase === 'finalResults' || state.phase === 'complete';
  return <RichStage title={stringOf(config.title, envelope.name || 'Doodle & Guess')} kicker="🎨 DRAWING ROUND" phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
    <div className="interactive-prompt-card"><span className="interactive-round-label">DRAW THIS</span><p>{stringOf(prompt.prompt, 'Draw something surprising.')}</p></div>
    {showGallery ? <div className="drawing-response-grid">{drawings.map((drawing, index) => <div className={`drawing-card ${stringOf(state.winningSubmissionId) === stringOf(drawing.id) ? 'winner' : ''}`} key={stringOf(drawing.id, String(index))}><span className="drawing-card-number">{String(index + 1).padStart(2, '0')}</span><DrawingSvg strokes={drawing.strokes} /><small>{stringOf(state.winningSubmissionId) === stringOf(drawing.id) ? 'ROOM FAVORITE' : 'ANONYMOUS DRAWING'}</small></div>)}{!drawings.length && <div className="interactive-empty-card">Waiting for approved drawings…</div>}</div> : <div className="interactive-help">Use your phone as a sketchpad. The host will reveal the gallery when the drawing window closes.</div>}
    <LeaderboardPanel state={state} />
  </RichStage>;
};

const OrderingItems: React.FC<{ items: JsonRecord[]; correctOrder?: string[]; reveal?: boolean }> = ({ items, correctOrder = [], reveal = false }) => {
  const labels = new Map(items.map(item => [stringOf(item.id), stringOf(item.label, 'Item')]));
  const values = reveal && correctOrder.length ? correctOrder : items.map(item => stringOf(item.id));
  return <div className="ordering-stage-list">{values.map((id, index) => <div className={`ordering-stage-item ${reveal ? 'revealed' : ''}`} key={`${id}-${index}`}><b>{index + 1}</b><span>{labels.get(id) || id}</span>{reveal && <em>✓</em>}</div>)}</div>;
};

export const OrderingDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const rounds = listOf(config.rounds);
  const round = rounds[numberOf(state.currentRoundIndex)] || rounds[0] || {};
  const reveal = state.phase === 'reveal' || state.phase === 'leaderboard' || state.phase === 'finalResults' || state.phase === 'complete';
  return <RichStage title={stringOf(config.title, envelope.name || 'Order Up')} kicker="↕ ORDERING CHALLENGE" phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
    <div className="interactive-prompt-card"><span className="interactive-round-label">PUT THESE IN ORDER</span><p>{stringOf(round.prompt, 'Arrange the items in the best order.')}</p></div>
    <OrderingItems items={listOf(round.items)} correctOrder={stringList(state.correctOrder)} reveal={reveal} />
    {!reveal && <div className="interactive-help">Move the cards on your phone. Exact positions earn the most points.</div>}
    <LeaderboardPanel state={state} />
  </RichStage>;
};

export const WordDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const rounds = listOf(config.rounds);
  const round = rounds[numberOf(state.currentRoundIndex)] || rounds[0] || {};
  const words = listOf(state.wordCloud);
  return <RichStage title={stringOf(config.title, envelope.name || 'Word Storm')} kicker="☁ WORD STORM" phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
    <div className="interactive-prompt-card"><span className="interactive-round-label">CATEGORY · {stringOf(round.category, 'OPEN CATEGORY')}</span><p>{stringOf(round.prompt, 'Add words to the storm.')}</p></div>
    {words.length ? <div className="word-cloud" aria-label="Approved word cloud">{words.map((word, index) => <span className="word-cloud-chip" style={{ '--word-size': `${Math.min(2.6, 1 + numberOf(word.count, 1) * .28)}rem` } as React.CSSProperties} key={`${stringOf(word.word)}-${index}`}>{stringOf(word.word)}<small>{numberOf(word.count, 1)}</small></span>)}</div> : <div className="interactive-help">Submit several answers. Approved words will grow as the room repeats them.</div>}
    <LeaderboardPanel state={state} />
  </RichStage>;
};

export const MatchPlayerDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const rounds = listOf(config.rounds);
  const round = rounds[numberOf(state.currentRoundIndex)] || rounds[0] || {};
  const options = Array.isArray(round.options) ? round.options.map(item => stringOf(item)) : [];
  const revealedIndex = numberOf(state.revealedOptionIndex, -1);
  const isRevealed = state.phase === 'reveal' || state.phase === 'leaderboard' || state.phase === 'finalResults' || state.phase === 'complete';
  return <RichStage title={stringOf(config.title, envelope.name || 'Match Minds')} kicker="🧠 MATCH MINDS" phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
    <div className="interactive-prompt-card"><span className="interactive-round-label">{stringOf(state.targetName, 'A mystery player')} ANSWERS PRIVATELY</span><p>{stringOf(round.prompt, 'Which answer will they choose?')}</p></div>
    <div className="match-option-grid">{options.map((option, index) => <div className={`match-option-card ${isRevealed && index === revealedIndex ? 'matched' : ''}`} key={`${option}-${index}`}><b>{String.fromCharCode(65 + index)}</b><span>{option}</span>{isRevealed && index === revealedIndex && <em>MATCHED ANSWER</em>}</div>)}</div>
    {isRevealed && <div className="interactive-winner-card"><span>ROOM MATCHES</span><strong>{numberOf(state.matchCount)} {numberOf(state.matchCount) === 1 ? 'player' : 'players'} thought alike</strong></div>}
    {!isRevealed && <div className="interactive-help">The selected player answers in private. Everyone else predicts before the reveal.</div>}
    <LeaderboardPanel state={state} />
  </RichStage>;
};

export const StageChallengeDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const challenges = listOf(config.challenges);
  const challenge = challenges[numberOf(state.currentChallengeIndex)] || challenges[0] || {};
  const running = state.challengeStatus === 'running';
  const duration = numberOf(state.timerDurationMs);
  const remaining = useActivityCountdown({ durationMs: duration, startedAt: state.timerStartedAt, pausedAt: state.timerPausedAt, running });
  const seconds = duration ? Math.ceil(remaining / 1000) : numberOf(challenge.seconds, 60);
  const status = stringOf(state.outcome, stringOf(state.challengeStatus, 'ready'));
  return <RichStage title={stringOf(config.title, envelope.name || 'Beat the Clock')} kicker="⏱ HOST CHALLENGE" phase={state.phase}>
    <div className="stage-challenge-card"><span className="interactive-round-label">CHALLENGE {numberOf(state.currentChallengeIndex) + 1} OF {challenges.length || 1}</span><h2>{stringOf(challenge.title, 'Your challenge')}</h2><p>{stringOf(challenge.instructions, 'The host will explain the challenge.')}</p>{stringOf(state.selectedParticipantName) && <strong className="stage-contestant">CONTESTANT · {stringOf(state.selectedParticipantName)}</strong>}</div>
    {(running || status === 'paused') ? <ActivityCountdown remainingMs={remaining} durationMs={duration} label={status === 'paused' ? 'PAUSED' : 'TIME REMAINING'} urgentAtSeconds={10} /> : <div className={`stage-timer-card ${status === 'success' ? 'success' : status === 'failure' ? 'failure' : ''}`}><span>{status === 'success' ? 'SUCCESS' : status === 'failure' ? 'TIME / TRY COMPLETE' : 'READY'}</span><strong>{`${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`}</strong></div>}
    <ActivityRevealCurtain visible={status === 'success' || status === 'failure'} kicker={status === 'success' ? 'SUCCESS' : 'RESULT'}>{status === 'success' ? 'Challenge complete!' : 'Give it another try.'}</ActivityRevealCurtain>
    <ActivityWinnerBanner visible={status === 'success' && Boolean(state.selectedParticipantName)} winner={stringOf(state.selectedParticipantName)} subtitle="CHALLENGE WINNER" />
    <LeaderboardPanel state={state} />
  </RichStage>;
};

const QuickAction: React.FC<{ label: string; action: string; envelope: ActivityStateEnvelope; tone?: string; onCommandSent?: () => void }> = ({ label, action, envelope, tone = 'act-btn-primary', onCommandSent }) => {
  const [busy, setBusy] = useState(false);
  return <button type="button" className={`act-btn ${tone}`} disabled={busy} onClick={async () => { setBusy(true); try { await ActivityApi.executeCommand(envelope.runId, { action }); onCommandSent?.(); } finally { setBusy(false); } }}>{busy ? 'Working…' : label}</button>;
};

const RichController: React.FC<ActivityComponentProps & { children?: React.ReactNode; actions: Array<{ label: string; action: string; tone?: string }> }> = ({ envelope, children, actions, onCommandSent }) => {
  const state = stateOf(envelope);
  return <div className="act-ctrl-container interactive-host-controller"><div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">LIVE GAME CONTROL</span><strong>{phaseLabel(state.phase)}</strong><small>{numberOf(state.participantCount)} phones connected · advance when the room is ready</small></div><span className="controller-score">{numberOf(state.submissionCount)}<small> responses</small></span></div><div className="act-controller-button-row">{actions.map(item => <QuickAction key={item.action} {...item} envelope={envelope} onCommandSent={onCommandSent} />)}</div>{children}</div>;
};

export const DrawingController: React.FC<ActivityComponentProps> = props => <RichController {...props} actions={[{ label: 'Start drawing', action: 'start' }, { label: 'Open responses', action: 'open' }, { label: 'Lock drawings', action: 'lock', tone: 'act-btn-secondary' }, { label: 'Open voting', action: 'openvoting' }, { label: 'Reveal favorite', action: 'reveal', tone: 'act-btn-gold' }, { label: 'Next prompt', action: 'next', tone: 'act-btn-secondary' }]}><div className="act-ctrl-card"><p className="muted">Anonymous drawings are held for host approval before they reach the stage.</p></div></RichController>;
export const OrderingController: React.FC<ActivityComponentProps> = props => <RichController {...props} actions={[{ label: 'Start round', action: 'start' }, { label: 'Open responses', action: 'open' }, { label: 'Lock answers', action: 'lock', tone: 'act-btn-secondary' }, { label: 'Reveal order', action: 'reveal', tone: 'act-btn-gold' }, { label: 'Next round', action: 'next', tone: 'act-btn-secondary' }]}><div className="act-ctrl-card"><p className="muted">Participants get partial credit for correct positions, so imperfect answers can still feel rewarding.</p></div></RichController>;
export const WordController: React.FC<ActivityComponentProps> = props => <RichController {...props} actions={[{ label: 'Start round', action: 'start' }, { label: 'Open responses', action: 'open' }, { label: 'Lock words', action: 'lock', tone: 'act-btn-secondary' }, { label: 'Reveal word cloud', action: 'reveal', tone: 'act-btn-gold' }, { label: 'Next round', action: 'next', tone: 'act-btn-secondary' }]}><div className="act-ctrl-card"><p className="muted">Approve or hide submissions from the live host panel before revealing the storm.</p></div></RichController>;
export const MatchPlayerController: React.FC<ActivityComponentProps> = props => <RichController {...props} actions={[{ label: 'Start round', action: 'start' }, { label: 'Open predictions', action: 'open' }, { label: 'Lock predictions', action: 'lock', tone: 'act-btn-secondary' }, { label: 'Reveal the match', action: 'reveal', tone: 'act-btn-gold' }, { label: 'Next round', action: 'next', tone: 'act-btn-secondary' }]}><div className="act-ctrl-card"><p className="muted">Choose the target player in the phone lobby panel, then open the private answer and prediction window.</p></div></RichController>;
export const StageChallengeController: React.FC<ActivityComponentProps> = props => <RichController {...props} actions={[{ label: 'Start challenge', action: 'start' }, { label: 'Start timer', action: 'starttimer' }, { label: 'Pause timer', action: 'pausetimer', tone: 'act-btn-secondary' }, { label: 'Resume timer', action: 'resumetimer', tone: 'act-btn-secondary' }, { label: 'Success', action: 'success', tone: 'act-btn-gold' }, { label: 'Fail', action: 'fail', tone: 'act-btn-danger' }, { label: 'Next challenge', action: 'next', tone: 'act-btn-secondary' }]}><div className="act-ctrl-card"><p className="muted">Choose a contestant in the session panel, run the clock, then make the ruling when the room is ready.</p></div></RichController>;

const updateList = (config: JsonRecord, key: string, value: JsonRecord[], onChange: ActivityEditorProps['onChange']) => onChange({ ...config, [key]: value });

export const DrawingEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const prompts = listOf(config.prompts);
  return <div className="activity-editor-stack"><label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label><label className="checkbox-row"><input type="checkbox" checked={config.requireModeration !== false} onChange={event => onChange({ ...config, requireModeration: event.target.checked })} /> Hold drawings for host approval</label><p className="muted">Keep prompts short enough to read quickly on a phone and a TV.</p>{prompts.map((prompt, index) => <div className="activity-editor-row" key={stringOf(prompt.id, String(index))}><strong>Prompt {index + 1}</strong><textarea value={stringOf(prompt.prompt)} placeholder="Draw a place where you would never want to lose your keys." onChange={event => { const next = [...prompts]; next[index] = { ...prompt, prompt: event.target.value }; updateList(config, 'prompts', next, onChange); }} /><button type="button" className="button danger" disabled={prompts.length <= 1} onClick={() => updateList(config, 'prompts', prompts.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove</button></div>)}<button type="button" className="button" onClick={() => updateList(config, 'prompts', [...prompts, { id: `prompt-${Date.now()}`, prompt: '', points: 100 }], onChange)}>+ Add prompt</button></div>;
};

const normalizedOrder = (round: JsonRecord) => {
  const items = listOf(round.items);
  const ids = items.map(item => stringOf(item.id)).filter(Boolean);
  return [...stringList(round.correctOrder).filter(id => ids.includes(id)), ...ids.filter(id => !stringList(round.correctOrder).includes(id))];
};

export const OrderingEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const rounds = listOf(config.rounds);
  return <div className="activity-editor-stack"><label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label><p className="muted">Set the correct order with the position selectors. Participants also receive partial credit.</p>{rounds.map((round, roundIndex) => {
    const items = listOf(round.items);
    const order = normalizedOrder(round);
    const updateRound = (updated: JsonRecord) => { const next = [...rounds]; next[roundIndex] = updated; updateList(config, 'rounds', next, onChange); };
    const changePosition = (position: number, selectedId: string) => { const next = [...order]; const oldPosition = next.indexOf(selectedId); [next[position], next[oldPosition]] = [next[oldPosition], next[position]]; updateRound({ ...round, correctOrder: next }); };
    return <div className="activity-editor-card" key={stringOf(round.id, String(roundIndex))}><div className="activity-editor-row"><strong>Round {roundIndex + 1}</strong><textarea value={stringOf(round.prompt)} placeholder="Put these steps in the best order." onChange={event => updateRound({ ...round, prompt: event.target.value })} /><input type="number" min={1} max={1000} value={numberOf(round.points, 100)} aria-label="Points" onChange={event => updateRound({ ...round, points: Number(event.target.value) || 0 })} /></div><div className="ordering-editor-items">{items.map((item, itemIndex) => <div className="activity-editor-row" key={stringOf(item.id, String(itemIndex))}><input value={stringOf(item.label)} aria-label={`Item ${itemIndex + 1}`} onChange={event => { const nextItems = [...items]; nextItems[itemIndex] = { ...item, label: event.target.value }; updateRound({ ...round, items: nextItems }); }} /><button type="button" className="button danger" disabled={items.length <= 2} onClick={() => { const removedId = stringOf(item.id); const nextItems = items.filter((_, index) => index !== itemIndex); updateRound({ ...round, items: nextItems, correctOrder: order.filter(id => id !== removedId) }); }}>Remove item</button></div>)}<button type="button" className="button" onClick={() => { const id = `item-${Date.now()}`; updateRound({ ...round, items: [...items, { id, label: '' }], correctOrder: [...order, id] }); }}>+ Add item</button></div><div className="ordering-answer-editor"><strong>Correct order</strong>{order.map((id, position) => <label key={`${id}-${position}`}>{position + 1}<select value={id} onChange={event => changePosition(position, event.target.value)}>{items.map(item => <option key={stringOf(item.id)} value={stringOf(item.id)}>{stringOf(item.label, 'Untitled item')}</option>)}</select></label>)}</div><button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateList(config, 'rounds', rounds.filter((_, index) => index !== roundIndex), onChange)}>Remove round</button></div>;
  })}<button type="button" className="button" onClick={() => { const firstId = `item-${Date.now()}-1`; const secondId = `item-${Date.now()}-2`; updateList(config, 'rounds', [...rounds, { id: `round-${Date.now()}`, prompt: '', items: [{ id: firstId, label: '' }, { id: secondId, label: '' }], correctOrder: [firstId, secondId], points: 100 }], onChange); }}>+ Add round</button></div>;
};

export const WordEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const rounds = listOf(config.rounds);
  return <div className="activity-editor-stack"><label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label><label className="checkbox-row"><input type="checkbox" checked={config.requireModeration !== false} onChange={event => onChange({ ...config, requireModeration: event.target.checked })} /> Hold words for host approval</label>{rounds.map((round, index) => <div className="activity-editor-card" key={stringOf(round.id, String(index))}><div className="activity-editor-row"><strong>Round {index + 1}</strong><textarea value={stringOf(round.prompt)} placeholder="Name something that helps a team work well." onChange={event => { const next = [...rounds]; next[index] = { ...round, prompt: event.target.value }; updateList(config, 'rounds', next, onChange); }} /></div><div className="activity-editor-row"><input value={stringOf(round.category)} placeholder="Category label" onChange={event => { const next = [...rounds]; next[index] = { ...round, category: event.target.value }; updateList(config, 'rounds', next, onChange); }} /><input type="number" min={1} max={100} value={numberOf(round.points, 10)} aria-label="Points per word" onChange={event => { const next = [...rounds]; next[index] = { ...round, points: Number(event.target.value) || 0 }; updateList(config, 'rounds', next, onChange); }} /><button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateList(config, 'rounds', rounds.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove</button></div></div>)}<button type="button" className="button" onClick={() => updateList(config, 'rounds', [...rounds, { id: `round-${Date.now()}`, prompt: '', category: '', points: 10, seconds: 45 }], onChange)}>+ Add round</button></div>;
};

export const MatchPlayerEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const rounds = listOf(config.rounds);
  return <div className="activity-editor-stack"><label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label><p className="muted">Each round gives one selected player a private answer while everyone else predicts. Use 2–8 choices.</p>{rounds.map((round, index) => { const options = Array.isArray(round.options) ? round.options.map(item => stringOf(item)) : []; const updateRound = (updated: JsonRecord) => { const next = [...rounds]; next[index] = updated; updateList(config, 'rounds', next, onChange); }; return <div className="activity-editor-card" key={stringOf(round.id, String(index))}><div className="activity-editor-row"><strong>Round {index + 1}</strong><textarea value={stringOf(round.prompt)} placeholder="Which would you choose for a free afternoon?" onChange={event => updateRound({ ...round, prompt: event.target.value })} /><input type="number" min={1} max={1000} value={numberOf(round.points, 100)} aria-label="Points" onChange={event => updateRound({ ...round, points: Number(event.target.value) || 0 })} /></div><div className="match-editor-options">{options.map((option, optionIndex) => <div className="activity-editor-row" key={`${optionIndex}-${option}`}><input value={option} aria-label={`Choice ${optionIndex + 1}`} onChange={event => { const next = [...options]; next[optionIndex] = event.target.value; updateRound({ ...round, options: next }); }} /><button type="button" className="button danger" disabled={options.length <= 2} onClick={() => updateRound({ ...round, options: options.filter((_, itemIndex) => itemIndex !== optionIndex) })}>Remove choice</button></div>)}</div><button type="button" className="button" disabled={options.length >= 8} onClick={() => updateRound({ ...round, options: [...options, `Choice ${options.length + 1}`] })}>+ Add choice</button><button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateList(config, 'rounds', rounds.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove round</button></div>; })}<button type="button" className="button" onClick={() => updateList(config, 'rounds', [...rounds, { id: `round-${Date.now()}`, prompt: '', options: ['Choice A', 'Choice B'], points: 100 }], onChange)}>+ Add round</button></div>;
};

export const StageChallengeEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const challenges = listOf(config.challenges);
  return <div className="activity-editor-stack"><label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label><p className="muted">These are host-led activities. Keep instructions short and let the host judge success or failure.</p>{challenges.map((challenge, index) => <div className="activity-editor-card" key={stringOf(challenge.id, String(index))}><div className="activity-editor-row"><strong>Challenge {index + 1}</strong><input value={stringOf(challenge.title)} placeholder="Build a paper tower" onChange={event => { const next = [...challenges]; next[index] = { ...challenge, title: event.target.value }; updateList(config, 'challenges', next, onChange); }} /><textarea value={stringOf(challenge.instructions)} placeholder="Challenge instructions" onChange={event => { const next = [...challenges]; next[index] = { ...challenge, instructions: event.target.value }; updateList(config, 'challenges', next, onChange); }} /></div><div className="activity-editor-row stage-editor-numbers"><label>Seconds<input type="number" min={5} max={3600} value={numberOf(challenge.seconds, 60)} onChange={event => { const next = [...challenges]; next[index] = { ...challenge, seconds: Number(event.target.value) || 60 }; updateList(config, 'challenges', next, onChange); }} /></label><label>Success points<input type="number" min={0} max={1000} value={numberOf(challenge.points, 100)} onChange={event => { const next = [...challenges]; next[index] = { ...challenge, points: Number(event.target.value) || 0 }; updateList(config, 'challenges', next, onChange); }} /></label><label>Fail points<input type="number" min={-1000} max={1000} value={numberOf(challenge.failPoints)} onChange={event => { const next = [...challenges]; next[index] = { ...challenge, failPoints: Number(event.target.value) || 0 }; updateList(config, 'challenges', next, onChange); }} /></label></div><button type="button" className="button danger" disabled={challenges.length <= 1} onClick={() => updateList(config, 'challenges', challenges.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove challenge</button></div>)}<button type="button" className="button" onClick={() => updateList(config, 'challenges', [...challenges, { id: `challenge-${Date.now()}`, title: '', instructions: '', seconds: 60, points: 100, failPoints: 0 }], onChange)}>+ Add challenge</button></div>;
};
