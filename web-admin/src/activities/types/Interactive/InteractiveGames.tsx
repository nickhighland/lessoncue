import React, { useState } from 'react';
import type { ActivityComponentProps, ActivityEditorProps } from '../../activityRegistry';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';
import { ActivityRevealCurtain, ActivityScoreBurst, ActivityWinnerBanner } from '../../ActivityMotion';
import { ActivityLeaderboard } from '../../ActivityLeaderboard';

type JsonRecord = Record<string, unknown>;

const stateOf = (envelope: ActivityStateEnvelope) => (envelope.state || {}) as JsonRecord;
const configOf = (envelope: ActivityStateEnvelope) => (envelope.config || {}) as JsonRecord;
const listOf = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
const stringOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;
const phaseLabel = (phase: unknown) => stringOf(phase, 'lobby').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
const StageShell: React.FC<{ children: React.ReactNode; title: string; kicker: string; phase?: unknown; joinCode?: unknown; participantCount?: unknown }> = ({ children, title, kicker, phase, joinCode, participantCount }) => (
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

export const BuzzerDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const clues = listOf(config.clues);
  const cluesRevealed = Math.min(numberOf(state.cluesRevealed), clues.length);
  const visibleClues = clues.slice(0, cluesRevealed);
  return (
    <StageShell title={stringOf(config.title, envelope.name || 'Buzzer Battle')} kicker="⚡ BUZZER BATTLE" phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
      <div className="interactive-clue-ladder">
        {!visibleClues.length && <div className="interactive-prompt-card"><span className="interactive-round-label">CLUE LADDER</span><p>The host will reveal clues one at a time.</p></div>}
        {visibleClues.map((clue, index) => <div className={`interactive-prompt-card ${index === visibleClues.length - 1 ? 'current' : 'past'}`} key={stringOf(clue.id, String(index))}><span className="interactive-round-label">CLUE {index + 1} OF {clues.length || 1}</span><p>{stringOf(clue.prompt, 'Clue')}</p></div>)}
      </div>
      <ActivityWinnerBanner visible={Boolean(state.buzzWinnerName)} winner={stringOf(state.buzzWinnerName)} subtitle="BUZZ FIRST" />
      <ActivityRevealCurtain visible={Boolean(state.answerRevealed)} kicker="ANSWER">{stringOf(state.revealedAnswer, 'Reveal the answer from the host.')}</ActivityRevealCurtain>
      <ActivityLeaderboard state={state} showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />
      <div className="interactive-help">Watch the clue ladder. When the host opens the buzzers, tap your giant buzzer.</div>
    </StageShell>
  );
};

export const PunchlineDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const prompts = listOf(config.prompts);
  const prompt = prompts[numberOf(state.currentPromptIndex)] || prompts[0] || {};
  const submissions = listOf(state.submissions);
  return (
    <StageShell title={stringOf(config.title, envelope.name || 'Punchline')} kicker="✍ CREATIVE ROUND" phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
      <div className="interactive-prompt-card"><span className="interactive-round-label">FINISH THIS</span><p>{stringOf(prompt.prompt, 'Write the funniest answer you can.')}</p></div>
      {(Boolean(state.votingOpen) || Boolean(state.resultsVisible) || state.phase === 'reveal') && (
        <div className="creative-response-grid">
          {submissions.map((item, index) => <div className={`creative-response-card ${stringOf(state.winningSubmissionId) === stringOf(item.id) ? 'winner' : ''}`} key={stringOf(item.id, `response-${index}`)}><span>{String(index + 1).padStart(2, '0')}</span><p>{stringOf(item.text)}</p></div>)}
          {!submissions.length && <div className="interactive-empty-card">Waiting for approved answers…</div>}
        </div>
      )}
      <ActivityScoreBurst visible={Boolean(state.winningSubmissionId) && Boolean(state.resultsVisible)} amount={numberOf(state.winningPoints, numberOf(state.pointsAwarded))} />
      <div className="interactive-help">Answers are anonymous until the host chooses the reveal.</div>
      <ActivityLeaderboard state={state} showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />
    </StageShell>
  );
};

export const FakeOutDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const rounds = listOf(config.rounds);
  const round = rounds[numberOf(state.currentRoundIndex)] || rounds[0] || {};
  const options = listOf(state.options);
  return (
    <StageShell title={stringOf(config.title, envelope.name || 'Fake Out')} kicker="🎭 TRUTH OR TRAP" phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
      <div className="interactive-prompt-card"><span className="interactive-round-label">FIND THE TRUTH</span><p>{stringOf(round.prompt, 'Which answer is real?')}</p></div>
      {(Boolean(state.votingOpen) || Boolean(state.resultsVisible) || Boolean(state.answerRevealed)) && (
        <div className="fakeout-option-grid">
          {options.map((item, index) => <div className={`fakeout-option-card ${item.isTruth === true ? 'truth' : ''}`} key={stringOf(item.id, `option-${index}`)}><span>{String(index + 1).padStart(2, '0')}</span><p>{stringOf(item.text)}</p>{item.isTruth === true && <strong>REAL</strong>}</div>)}
          {!options.length && <div className="interactive-empty-card">Waiting for answers to mix into the round…</div>}
        </div>
      )}
      <div className="interactive-help">Spot the real answer. A convincing bluff can still score.</div>
      <ActivityLeaderboard state={state} showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />
    </StageShell>
  );
};

const QuickAction: React.FC<{ label: string; action: string; envelope: ActivityStateEnvelope; tone?: string; onCommandSent?: () => void }> = ({ label, action, envelope, tone = 'act-btn-primary', onCommandSent }) => {
  const [busy, setBusy] = useState(false);
  return <button type="button" className={`act-btn ${tone}`} disabled={busy} onClick={async () => { setBusy(true); try { await ActivityApi.executeCommand(envelope.runId, { action }); onCommandSent?.(); } finally { setBusy(false); } }}>{busy ? 'Working…' : label}</button>;
};

const InteractiveControllerShell: React.FC<ActivityComponentProps & { children: React.ReactNode; actions: Array<{ label: string; action: string; tone?: string }> }> = ({ envelope, children, actions, onCommandSent }) => {
  const state = stateOf(envelope);
  return <div className="act-ctrl-container interactive-host-controller">
    <div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">LIVE GAME CONTROL</span><strong>{phaseLabel(state.phase)}</strong><small>Use the stage controls to pace this round.</small></div><span className="controller-score">{numberOf(state.participantCount)}<small> joined</small></span></div>
    <div className="act-controller-button-row">{actions.map(item => <QuickAction key={item.action} {...item} envelope={envelope} onCommandSent={onCommandSent} />)}</div>
    {children}
  </div>;
};

export const BuzzerController: React.FC<ActivityComponentProps> = props => <InteractiveControllerShell {...props} actions={[{ label: 'Start game', action: 'start' }, { label: 'Reveal clue', action: 'revealclue', tone: 'act-btn-secondary' }, { label: 'Open buzzers', action: 'open' }, { label: 'Correct', action: 'correct', tone: 'act-btn-gold' }, { label: 'Incorrect', action: 'incorrect', tone: 'act-btn-danger' }, { label: 'Reset buzzers', action: 'resetbuzzers', tone: 'act-btn-secondary' }, { label: 'Next clue', action: 'next', tone: 'act-btn-secondary' }]}><div className="act-ctrl-card"><p className="muted">Winner: {stringOf(stateOf(props.envelope).buzzWinnerName, 'No buzzer yet')}</p></div></InteractiveControllerShell>;

export const PunchlineController: React.FC<ActivityComponentProps> = props => <InteractiveControllerShell {...props} actions={[{ label: 'Start game', action: 'start' }, { label: 'Open responses', action: 'open' }, { label: 'Lock responses', action: 'lock', tone: 'act-btn-secondary' }, { label: 'Open voting', action: 'openvoting' }, { label: 'Reveal winner', action: 'reveal', tone: 'act-btn-gold' }, { label: 'Next prompt', action: 'next', tone: 'act-btn-secondary' }]}><div className="act-ctrl-card"><p className="muted">Approved responses appear on the stage after voting opens.</p></div></InteractiveControllerShell>;

export const FakeOutController: React.FC<ActivityComponentProps> = props => <InteractiveControllerShell {...props} actions={[{ label: 'Start game', action: 'start' }, { label: 'Open answers', action: 'open' }, { label: 'Lock answers', action: 'lock', tone: 'act-btn-secondary' }, { label: 'Open voting', action: 'openvoting' }, { label: 'Reveal truth', action: 'reveal', tone: 'act-btn-gold' }, { label: 'Next round', action: 'next', tone: 'act-btn-secondary' }]}><div className="act-ctrl-card"><p className="muted">Moderate anonymous answers from the host session panel before voting.</p></div></InteractiveControllerShell>;

const updateListConfig = (config: JsonRecord, key: string, list: JsonRecord[], onChange: ActivityEditorProps['onChange']) => onChange({ ...config, [key]: list });
const TextInput: React.FC<{ value: string; onChange: (value: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => <input value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />;

export const BuzzerEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const clues = listOf(config.clues);
  return <div className="activity-editor-stack"><label>Title<input value={stringOf(config.title)} onChange={e => onChange({ ...config, title: e.target.value })} /></label><p className="muted">Add clues from broad to specific. The host can reveal them one at a time.</p>{clues.map((clue, index) => <div className="activity-editor-row" key={stringOf(clue.id, String(index))}><strong>Clue {index + 1}</strong><TextInput value={stringOf(clue.prompt)} placeholder="Clue text" onChange={value => { const next = [...clues]; next[index] = { ...clue, prompt: value }; updateListConfig(config, 'clues', next, onChange); }} /><TextInput value={stringOf(clue.answer)} placeholder="Answer" onChange={value => { const next = [...clues]; next[index] = { ...clue, answer: value }; updateListConfig(config, 'clues', next, onChange); }} /><button type="button" className="button danger" disabled={clues.length <= 1} onClick={() => updateListConfig(config, 'clues', clues.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove</button></div>)}<button type="button" className="button" onClick={() => updateListConfig(config, 'clues', [...clues, { id: `clue-${Date.now()}`, prompt: '', answer: '', points: 100 }], onChange)}>+ Add clue</button></div>;
};

export const PunchlineEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const prompts = listOf(config.prompts);
  return <div className="activity-editor-stack"><label>Title<input value={stringOf(config.title)} onChange={e => onChange({ ...config, title: e.target.value })} /></label><label className="checkbox-row"><input type="checkbox" checked={config.requireModeration !== false} onChange={e => onChange({ ...config, requireModeration: e.target.checked })} /> Hold anonymous answers for host approval</label>{prompts.map((prompt, index) => <div className="activity-editor-row" key={stringOf(prompt.id, String(index))}><strong>Prompt {index + 1}</strong><textarea value={stringOf(prompt.prompt)} placeholder="The worst possible school mascot would be ______." onChange={e => { const next = [...prompts]; next[index] = { ...prompt, prompt: e.target.value }; updateListConfig(config, 'prompts', next, onChange); }} /><button type="button" className="button danger" disabled={prompts.length <= 1} onClick={() => updateListConfig(config, 'prompts', prompts.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove</button></div>)}<button type="button" className="button" onClick={() => updateListConfig(config, 'prompts', [...prompts, { id: `prompt-${Date.now()}`, prompt: '', points: 100 }], onChange)}>+ Add prompt</button></div>;
};

export const FakeOutEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const rounds = listOf(config.rounds);
  return <div className="activity-editor-stack"><label>Title<input value={stringOf(config.title)} onChange={e => onChange({ ...config, title: e.target.value })} /></label><label className="checkbox-row"><input type="checkbox" checked={config.requireModeration !== false} onChange={e => onChange({ ...config, requireModeration: e.target.checked })} /> Hold fake answers for host approval</label>{rounds.map((round, index) => <div className="activity-editor-row" key={stringOf(round.id, String(index))}><strong>Round {index + 1}</strong><textarea value={stringOf(round.prompt)} placeholder="Which statement is true?" onChange={e => { const next = [...rounds]; next[index] = { ...round, prompt: e.target.value }; updateListConfig(config, 'rounds', next, onChange); }} /><TextInput value={stringOf(round.truth)} placeholder="The true answer" onChange={value => { const next = [...rounds]; next[index] = { ...round, truth: value }; updateListConfig(config, 'rounds', next, onChange); }} /><button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateListConfig(config, 'rounds', rounds.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove</button></div>)}<button type="button" className="button" onClick={() => updateListConfig(config, 'rounds', [...rounds, { id: `round-${Date.now()}`, prompt: '', truth: '', points: 100 }], onChange)}>+ Add round</button></div>;
};
