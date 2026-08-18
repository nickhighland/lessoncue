import React, { useState } from 'react';
import type { ActivityComponentProps, ActivityEditorProps } from '../../activityRegistry';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';
import { ActivityRevealCurtain, ActivityScoreBurst, ActivityWinnerBanner } from '../../ActivityMotion';
import { ActivityLeaderboard } from '../../ActivityLeaderboard';
import { ActivityPresetPicker } from '../../ActivityPresetPicker';
import { BUZZER_PRESETS, FAKE_OUT_PRESETS, PUNCHLINE_PRESETS } from '../../activityPresetRegistry';
import { ActivityJoinBanner } from '../../ActivityJoin';
import { ActivityLobbyStage } from '../../ActivityLobbyStage';
import { isLobbyPhase } from '../../activityPhase';

type JsonRecord = Record<string, unknown>;

const stateOf = (envelope: ActivityStateEnvelope) => (envelope.state || {}) as JsonRecord;
const configOf = (envelope: ActivityStateEnvelope) => (envelope.config || {}) as JsonRecord;
const listOf = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
const stringOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;
const phaseLabel = (phase: unknown) => stringOf(phase, 'lobby').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
const StageShell: React.FC<{ children: React.ReactNode; title: string; kicker: string; phase?: unknown; joinCode?: unknown; joinUrl?: unknown; participantCount?: unknown; roster?: unknown }> = ({ children, title, kicker, phase, joinCode, joinUrl, participantCount, roster }) => (
  <div className="activity-stage interactive-game-stage">
    <div className="activity-stage-content">
      {isLobbyPhase(phase) ? <ActivityLobbyStage title={title} kicker={kicker} joinCode={joinCode} joinUrl={joinUrl} participantCount={participantCount} roster={roster} /> : <>
        <div className="activity-header">
          <div className="stage-kicker">{kicker} · {phaseLabel(phase)}</div>
          <h1 className="activity-title">{title}</h1>
        </div>
        <ActivityJoinBanner joinCode={joinCode} joinUrl={joinUrl} participantCount={participantCount} />
        {children}
      </>}
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
    <StageShell title={stringOf(config.title, envelope.name || 'Buzzer Battle')} kicker={`⚡ ${stringOf(config.presetLabel, 'BUZZER BATTLE')}`} phase={state.phase} joinCode={state.joinCode} joinUrl={state.joinUrl} participantCount={state.participantCount} roster={state.roster}>
      <div className="interactive-clue-ladder" aria-label="Progressive clues">
        {!visibleClues.length && <div className="interactive-prompt-card"><span className="interactive-round-label">CLUE LADDER</span><p>The host will reveal clues one at a time.</p></div>}
        {visibleClues.map((clue, index) => <div className={`interactive-prompt-card ${index === visibleClues.length - 1 ? 'current' : 'past'}`} key={stringOf(clue.id, String(index))}><span className="interactive-round-label">CLUE {index + 1} OF {clues.length || 1}</span><p>{stringOf(clue.prompt, 'Clue')}</p><small className="interactive-clue-value">{numberOf(clue.points, 100)} POINTS</small></div>)}
      </div>
      <ActivityWinnerBanner visible={Boolean(state.buzzWinnerName)} winner={stringOf(state.buzzWinnerName)} subtitle="BUZZ FIRST" />
      <ActivityRevealCurtain visible={Boolean(state.answerRevealed)} kicker="ANSWER">{stringOf(state.revealedAnswer, 'Reveal the answer from the host.')}</ActivityRevealCurtain>
      <EmbeddedUtilityDisplay config={config} state={state} />
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
  const headToHead = stringOf(config.votingStyle, 'gallery') === 'headToHead';
  const currentMatch = state.creativeCurrentMatch && typeof state.creativeCurrentMatch === 'object' ? state.creativeCurrentMatch as JsonRecord : null;
  const displayedSubmissions = headToHead && currentMatch
    ? [{ id: stringOf(currentMatch.entrantAId), text: stringOf(currentMatch.entrantA, 'Response A') }, { id: stringOf(currentMatch.entrantBId), text: stringOf(currentMatch.entrantB, 'Response B') }].filter(item => item.id)
    : submissions;
  return (
    <StageShell title={stringOf(config.title, envelope.name || 'Punchline')} kicker={`✍ ${stringOf(config.presetLabel, headToHead ? 'HEAD-TO-HEAD CREATIVE' : 'CREATIVE ROUND')}`} phase={state.phase} joinCode={state.joinCode} joinUrl={state.joinUrl} participantCount={state.participantCount} roster={state.roster}>
      <div className="interactive-prompt-card"><span className="interactive-round-label">FINISH THIS</span><p>{stringOf(prompt.prompt, 'Write the funniest answer you can.')}</p></div>
      {(Boolean(state.votingOpen) || Boolean(state.resultsVisible) || state.phase === 'reveal') && (
        <div className="creative-response-grid">
          {displayedSubmissions.map((item, index) => <div className={`creative-response-card ${stringOf(state.winningSubmissionId) === stringOf(item.id) ? 'winner' : ''}`} key={stringOf(item.id, `response-${index}`)}><span>{String(index + 1).padStart(2, '0')}</span><p>{stringOf(item.text)}</p>{headToHead && <small>{index === 0 ? 'OPTION A' : 'OPTION B'}</small>}</div>)}
          {!displayedSubmissions.length && <div className="interactive-empty-card">Waiting for approved answers…</div>}
        </div>
      )}
      <ActivityScoreBurst visible={Boolean(state.winningSubmissionId) && Boolean(state.resultsVisible)} amount={numberOf(state.winningPoints, numberOf(state.pointsAwarded))} />
      <EmbeddedUtilityDisplay config={config} state={state} />
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
    <StageShell title={stringOf(config.title, envelope.name || 'Fake Out')} kicker={`🎭 ${stringOf(config.presetLabel, 'TRUTH OR TRAP')}`} phase={state.phase} joinCode={state.joinCode} joinUrl={state.joinUrl} participantCount={state.participantCount} roster={state.roster}>
      <div className="interactive-prompt-card"><span className="interactive-round-label">FIND THE TRUTH</span><p>{stringOf(round.prompt, 'Which answer is real?')}</p></div>
      {(Boolean(state.votingOpen) || Boolean(state.resultsVisible) || Boolean(state.answerRevealed)) && (
        <div className="fakeout-option-grid">
          {options.map((item, index) => <div className={`fakeout-option-card ${item.isTruth === true ? 'truth' : ''}`} key={stringOf(item.id, `option-${index}`)}><span>{String(index + 1).padStart(2, '0')}</span><p>{stringOf(item.text)}</p>{item.isTruth === true && <strong>REAL</strong>}{stringOf(item.author) && <small className="fakeout-option-author">{stringOf(item.author)}</small>}</div>)}
          {!options.length && <div className="interactive-empty-card">Waiting for answers to mix into the round…</div>}
        </div>
      )}
      <EmbeddedUtilityDisplay config={config} state={state} />
      <div className="interactive-help">Spot the real answer. A convincing bluff can still score.</div>
      <ActivityLeaderboard state={state} showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />
    </StageShell>
  );
};

const QuickAction: React.FC<{ label: string; action: string; envelope: ActivityStateEnvelope; tone?: string; disabled?: boolean; payload?: JsonRecord; onCommandSent?: () => void }> = ({ label, action, envelope, tone = 'act-btn-primary', disabled = false, payload, onCommandSent }) => {
  const [busy, setBusy] = useState(false);
  return <button type="button" className={`act-btn ${tone}`} disabled={busy || disabled} onClick={async () => { setBusy(true); try { await ActivityApi.executeCommand(envelope.runId, { action, payload }); onCommandSent?.(); } catch (error) { console.debug('Activity command was rejected; the host notice contains the reason.', error); } finally { setBusy(false); } }}>{busy ? 'Working…' : label}</button>;
};

const EmbeddedUtilityDisplay: React.FC<{ config: JsonRecord; state: JsonRecord }> = ({ config, state }) => {
  const utility = config.embeddedUtility && typeof config.embeddedUtility === 'object' ? config.embeddedUtility as JsonRecord : null;
  const utilityState = state.embeddedUtilityState && typeof state.embeddedUtilityState === 'object' ? state.embeddedUtilityState as JsonRecord : null;
  if (!utility || !utilityState) return null;
  const result = utilityState.result && typeof utilityState.result === 'object' ? utilityState.result as JsonRecord : null;
  const utilityType = stringOf(utility.utilityType, 'coinFlip');
  const remainingMs = numberOf(utilityState.timerRemainingMs, 0);
  return <section className="embedded-utility-result" aria-live="polite"><span>✦ BONUS UTILITY · {utilityType.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()}</span>{utilityType === 'countdown' ? <strong>{Math.ceil(remainingMs / 1000)}s</strong> : <strong>{result ? stringOf(result.label, stringOf(result.value, 'Ready')) : 'Ready when the host needs it'}</strong>}{result && typeof result.instructions === 'string' && <small>{result.instructions}</small>}</section>;
};

const EmbeddedUtilityController: React.FC<ActivityComponentProps> = ({ envelope, onCommandSent }) => {
  const config = configOf(envelope);
  const utility = config.embeddedUtility && typeof config.embeddedUtility === 'object' ? config.embeddedUtility as JsonRecord : null;
  const state = stateOf(envelope);
  const utilityState = state.embeddedUtilityState && typeof state.embeddedUtilityState === 'object' ? state.embeddedUtilityState as JsonRecord : {};
  if (!utility) return null;
  const utilityType = stringOf(utility.utilityType, 'coinFlip');
  const result = utilityState.result && typeof utilityState.result === 'object' ? utilityState.result as JsonRecord : null;
  const revealedBoxIds = Array.isArray(utilityState.revealedBoxIds) ? utilityState.revealedBoxIds.filter(item => typeof item === 'string') as string[] : [];
  const randomAction = utilityType === 'randomPerson' ? 'pickperson' : utilityType === 'randomTeam' ? 'pickteam' : utilityType === 'dice' ? 'roll' : utilityType === 'randomNumber' ? 'draw' : utilityType === 'challengePicker' ? 'pick' : 'flip';
  return <div className="act-ctrl-card embedded-utility-controller"><div><strong>Bonus utility</strong><small>Run this helper without leaving the current game.</small></div><div className="act-controller-button-row">{utilityType === 'mysteryBoxes' ? listOf(utility.boxes).map((box, index) => { const id = stringOf(box.id, `box-${index + 1}`); return <QuickAction key={id} label={`Open box ${index + 1}`} action="utility.revealbox" payload={{ boxId: id }} envelope={envelope} onCommandSent={onCommandSent} disabled={revealedBoxIds.includes(id)} />; }) : utilityType === 'countdown' ? <><QuickAction label="Start timer" action="utility.starttimer" envelope={envelope} onCommandSent={onCommandSent} /><QuickAction label="Pause" action="utility.pausetimer" envelope={envelope} onCommandSent={onCommandSent} tone="act-btn-secondary" /><QuickAction label="Reset" action="utility.reset" envelope={envelope} onCommandSent={onCommandSent} tone="act-btn-secondary" /></> : <QuickAction label={`Run ${utilityType.replace(/([a-z])([A-Z])/g, '$1 $2')}`} action={`utility.${randomAction}`} envelope={envelope} onCommandSent={onCommandSent} />}{result && <span className="embedded-utility-last-result">Last: {stringOf(result.label, stringOf(result.value, 'complete'))}</span>}</div></div>;
};

const InteractiveControllerShell: React.FC<ActivityComponentProps & { children: React.ReactNode; actions: Array<{ label: string; action: string; tone?: string; disabled?: boolean; payload?: JsonRecord }> }> = ({ envelope, children, actions, onCommandSent }) => {
  const state = stateOf(envelope);
  return <div className="act-ctrl-container interactive-host-controller">
    <div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">LIVE GAME CONTROL</span><strong>{phaseLabel(state.phase)}</strong><small>Use the stage controls to pace this round.</small></div><span className="controller-score">{numberOf(state.participantCount)}<small> joined</small></span></div>
    <div className="act-controller-button-row">{actions.map((item, index) => <QuickAction key={item.action + '-' + index} {...item} envelope={envelope} onCommandSent={onCommandSent} />)}</div>
    <EmbeddedUtilityController envelope={envelope} onCommandSent={onCommandSent} />
    {children}
  </div>;
};

export const BuzzerController: React.FC<ActivityComponentProps> = props => {
  const state = stateOf(props.envelope);
  const config = configOf(props.envelope);
  const clues = listOf(config.clues);
  const phase = stringOf(state.phase, 'lobby');
  const winner = stringOf(state.buzzWinnerName);
  const hasWinner = Boolean(winner);
  const canReveal = phase === 'lobby' || phase === 'roundIntro' || phase === 'acceptingResponses' || phase === 'judging' || phase === 'reveal';
  const canJudge = phase === 'judging' && hasWinner;
  const canReset = phase === 'acceptingResponses' || phase === 'judging' || phase === 'reveal';
  const stealOpen = state.stealOpen === true;
  const currentIndex = numberOf(state.currentClueIndex);
  const revealed = Math.min(numberOf(state.cluesRevealed), clues.length);
  return <InteractiveControllerShell {...props} actions={[
    { label: 'Start game', action: 'start', disabled: phase !== 'lobby' },
    { label: revealed >= clues.length ? 'All clues revealed' : 'Reveal clue', action: 'revealclue', tone: 'act-btn-secondary', disabled: !canReveal || revealed >= clues.length },
    { label: 'Open buzzers', action: 'open', disabled: phase !== 'roundIntro' && phase !== 'reveal' && phase !== 'acceptingResponses' },
    { label: 'Correct', action: 'correct', tone: 'act-btn-gold', disabled: !canJudge },
    { label: 'Incorrect', action: 'incorrect', tone: 'act-btn-danger', disabled: !canJudge },
    { label: stealOpen ? 'Steal buzzers open' : 'Open steal buzzers', action: 'opensteal', tone: 'act-btn-secondary', disabled: phase !== 'reveal' || stealOpen },
    { label: 'Reveal answer', action: 'revealanswer', tone: 'act-btn-gold', disabled: phase !== 'reveal' && phase !== 'acceptingResponses' },
    { label: 'Reset buzzers', action: 'resetbuzzers', tone: 'act-btn-secondary', disabled: !canReset },
    { label: currentIndex >= Math.max(0, clues.length - 1) ? 'Finish game' : 'Next clue', action: 'next', tone: 'act-btn-secondary', disabled: phase !== 'reveal' && phase !== 'roundIntro' }
  ]}><div className="act-ctrl-card"><p className="muted">Clue {Math.min(currentIndex + 1, Math.max(1, clues.length))} of {Math.max(1, clues.length)} · {revealed} revealed</p><strong>{winner ? `Winner: ${winner}` : stealOpen ? 'Steal attempt open' : 'No buzzer yet'}</strong>{stringOf(state.lockedOutParticipantId) && <small className="muted">One miss has been locked out for this clue.</small>}</div></InteractiveControllerShell>;
};

export const PunchlineController: React.FC<ActivityComponentProps> = props => {
  const config = configOf(props.envelope);
  const headToHead = stringOf(config.votingStyle, 'gallery') === 'headToHead';
  const state = stateOf(props.envelope);
  const rawMatches = listOf(state.creativeMatches);
  const rawCurrent = state.creativeCurrentMatch && typeof state.creativeCurrentMatch === 'object'
    ? state.creativeCurrentMatch as JsonRecord
    : rawMatches.find(match => stringOf(match.id) === stringOf(state.creativeCurrentMatchId));
  const hostResponseText = (id: unknown) => {
    const submission = props.hostView?.submissions.find(item => item.id === stringOf(id));
    return submission?.payload && typeof submission.payload.text === 'string' ? submission.payload.text : '';
  };
  const current: JsonRecord | null = rawCurrent ? {
    ...rawCurrent,
    entrantA: stringOf(rawCurrent.entrantA, hostResponseText(rawCurrent.entrantAId) || 'Response A'),
    entrantB: stringOf(rawCurrent.entrantB, hostResponseText(rawCurrent.entrantBId) || 'Response B')
  } : null;
  const phase = stringOf(state.phase, 'lobby');
  const matchStatus = stringOf(current?.status, 'pending');
  const canResolve = headToHead && Boolean(current) && ['open', 'closed'].includes(matchStatus);
  const winnerActions = headToHead && current && canResolve
    ? [
        { label: 'Advance ' + stringOf(current.entrantA, 'A'), action: 'reveal', payload: { winnerId: stringOf(current.entrantAId) }, tone: 'act-btn-gold' },
        ...(stringOf(current.entrantBId) ? [{ label: 'Advance ' + stringOf(current.entrantB, 'B'), action: 'reveal', payload: { winnerId: stringOf(current.entrantBId) }, tone: 'act-btn-gold' }] : [])
      ]
    : [];
  const description = headToHead
    ? 'Compare two approved responses at a time.' + (current ? ' Current matchup: ' + stringOf(current.entrantA, 'A') + ' vs ' + stringOf(current.entrantB, 'B') + '.' : '')
    : 'Approved responses appear on the stage after voting opens.';
  return <InteractiveControllerShell {...props} actions={[
    { label: 'Start game', action: 'start', disabled: phase !== 'lobby' },
    { label: 'Open responses', action: 'open', disabled: phase !== 'prompt' && phase !== 'roundIntro' },
    { label: 'Lock responses', action: 'lock', tone: 'act-btn-secondary', disabled: phase !== 'acceptingResponses' },
    { label: headToHead ? 'Open matchup voting' : 'Open gallery voting', action: 'openvoting', disabled: phase !== 'responsesLocked' && phase !== 'acceptingResponses' && !(headToHead && phase === 'roundIntro') },
    ...(headToHead
      ? [{ label: 'Resolve by vote', action: 'reveal', tone: 'act-btn-gold', disabled: !canResolve }, ...winnerActions, { label: 'Next matchup', action: 'nextmatchup', tone: 'act-btn-secondary', disabled: !current || (matchStatus !== 'complete' && phase !== 'reveal') }]
      : [{ label: 'Reveal winner', action: 'reveal', tone: 'act-btn-gold', disabled: phase !== 'voting' }]),
    { label: 'Next prompt', action: 'next', tone: 'act-btn-secondary', disabled: phase !== 'reveal' }
  ]}><div className="act-ctrl-card"><p className="muted">{description}</p></div></InteractiveControllerShell>;
};

export const FakeOutController: React.FC<ActivityComponentProps> = props => {
  const state = stateOf(props.envelope);
  const phase = stringOf(state.phase, 'lobby');
  const submissions = props.hostView?.submissions.filter(item => item.kind === 'bluff' && item.moderationStatus === 'approved' && !item.hidden) || [];
  return <InteractiveControllerShell {...props} actions={[
    { label: 'Start game', action: 'start', disabled: phase !== 'lobby' },
    { label: 'Open answers', action: 'open', disabled: phase !== 'prompt' && phase !== 'roundIntro' },
    { label: 'Lock answers', action: 'lock', tone: 'act-btn-secondary', disabled: phase !== 'acceptingResponses' },
    { label: 'Open voting', action: 'openvoting', disabled: phase !== 'responsesLocked' && phase !== 'acceptingResponses' },
    { label: 'Reveal truth', action: 'reveal', tone: 'act-btn-gold', disabled: phase !== 'voting' },
    { label: 'Next round', action: 'next', tone: 'act-btn-secondary', disabled: phase !== 'reveal' }
  ]}>
    <div className="act-ctrl-card"><p className="muted">Approved answers stay anonymous on the stage until the reveal.</p><div className="act-controller-button-row">{submissions.map(item => <QuickAction key={item.id} label={`Mark favorite: ${typeof item.payload.text === 'string' ? item.payload.text.slice(0, 42) : 'answer'}`} action="hostfavorite" payload={{ submissionId: item.id }} envelope={props.envelope} tone={stringOf(state.hostFavoriteSubmissionId) === item.id ? 'act-btn-gold' : 'act-btn-secondary'} disabled={phase !== 'voting' && phase !== 'reveal'} onCommandSent={props.onCommandSent} />)}</div></div>
  </InteractiveControllerShell>;
};

const updateListConfig = (config: JsonRecord, key: string, list: JsonRecord[], onChange: ActivityEditorProps['onChange']) => onChange({ ...config, [key]: list });
const TextInput: React.FC<{ value: string; onChange: (value: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => <input value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />;

export const EmbeddedUtilityEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const utility = config.embeddedUtility && typeof config.embeddedUtility === 'object' ? config.embeddedUtility as JsonRecord : {};
  const enabled = Object.keys(utility).length > 0;
  const utilityType = stringOf(utility.utilityType, 'coinFlip');
  const updateUtility = (next: JsonRecord) => onChange({ ...config, embeddedUtility: next });
  const removeUtility = () => { const next = { ...config }; delete next.embeddedUtility; onChange(next); };
  return <div className="activity-editor-card embedded-utility-editor"><strong>Optional bonus utility</strong><label className="checkbox-row"><input type="checkbox" checked={enabled} onChange={event => event.target.checked ? updateUtility({ utilityType: 'coinFlip', choices: ['Heads', 'Tails'] }) : removeUtility()} /> Give the host a reusable helper inside this game</label>{enabled && <><label>Utility<select value={utilityType} onChange={event => { const next: JsonRecord = { ...utility, utilityType: event.target.value }; if (event.target.value === 'coinFlip' && !Array.isArray(next.choices)) next.choices = ['Heads', 'Tails']; updateUtility(next); }}><option value="coinFlip">Coin flip / choice</option><option value="dice">Dice</option><option value="randomNumber">Random number</option><option value="randomPerson">Random person</option><option value="randomTeam">Random team</option><option value="challengePicker">Challenge picker</option><option value="mysteryBoxes">Mystery boxes</option><option value="countdown">Countdown</option></select></label>{utilityType === 'dice' && <label>Sides<input type="number" min={2} max={1000} value={numberOf(utility.diceSides, 6)} onChange={event => updateUtility({ ...utility, diceSides: Math.max(2, Math.min(1000, Number(event.target.value) || 6)) })} /></label>}{utilityType === 'randomNumber' && <div className="two-fields"><label>Minimum<input type="number" value={numberOf(utility.minimum, 1)} onChange={event => updateUtility({ ...utility, minimum: Number(event.target.value) || 1 })} /></label><label>Maximum<input type="number" value={numberOf(utility.maximum, 100)} onChange={event => updateUtility({ ...utility, maximum: Number(event.target.value) || 100 })} /></label></div>}{utilityType === 'countdown' && <label>Seconds<input type="number" min={1} max={3600} value={numberOf(utility.durationSeconds, 30)} onChange={event => updateUtility({ ...utility, durationSeconds: Math.max(1, Math.min(3600, Number(event.target.value) || 30)) })} /></label>}<small className="muted">The helper shares the current session, server randomness, and TV projection. It does not create another activity selector.</small></>}</div>;
};

export const BuzzerEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const clues = listOf(config.clues);
  return <div className="activity-editor-stack"><ActivityPresetPicker label="Buzzer format" value={typeof config.preset === 'string' ? config.preset : 'buzzerBattle'} templates={BUZZER_PRESETS} onPresetChange={preset => onChange({ ...config, preset: preset.id, presetLabel: preset.label.toUpperCase() })} onApply={preset => onChange({ ...config, ...preset.config })} /><label>Title<input value={stringOf(config.title)} onChange={e => onChange({ ...config, title: e.target.value })} /></label><div className="activity-editor-card"><strong>Answer rules</strong><label className="checkbox-row"><input type="checkbox" checked={config.lockOutOnMiss !== false} onChange={event => onChange({ ...config, lockOutOnMiss: event.target.checked })} /> Lock a player out after an incorrect answer</label><label className="checkbox-row"><input type="checkbox" checked={config.stealOnMiss !== false} onChange={event => onChange({ ...config, stealOnMiss: event.target.checked })} /> Open a steal attempt for the other players</label><small className="muted">When steal is off, the host can reveal the answer or manually reopen the buzzers.</small></div><p className="muted">Add clues from broad to specific. Point values can decline as clues become easier.</p>{clues.map((clue, index) => <div className="activity-editor-row" key={stringOf(clue.id, String(index))}><strong>Clue {index + 1}</strong><TextInput value={stringOf(clue.prompt)} placeholder="Clue text" onChange={value => { const next = [...clues]; next[index] = { ...clue, prompt: value }; updateListConfig(config, 'clues', next, onChange); }} /><TextInput value={stringOf(clue.answer)} placeholder="Answer" onChange={value => { const next = [...clues]; next[index] = { ...clues[index], answer: value }; updateListConfig(config, 'clues', next, onChange); }} /><input type="number" min={0} max={10000} value={numberOf(clue.points, 100)} aria-label={`Clue ${index + 1} points`} onChange={event => { const next = [...clues]; next[index] = { ...clue, points: Math.max(0, Math.min(10000, Number(event.target.value) || 0)) }; updateListConfig(config, 'clues', next, onChange); }} /><button type="button" className="button danger" disabled={clues.length <= 1} onClick={() => updateListConfig(config, 'clues', clues.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove</button></div>)}<button type="button" className="button" onClick={() => updateListConfig(config, 'clues', [...clues, { id: `clue-${Date.now()}`, prompt: '', answer: '', points: Math.max(0, 100 - clues.length * 25) }], onChange)}>+ Add clue</button><EmbeddedUtilityEditor config={config} onChange={onChange} /></div>;
};

export const PunchlineEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const prompts = listOf(config.prompts);
  return <div className="activity-editor-stack"><ActivityPresetPicker label="Creative format" value={typeof config.preset === 'string' ? config.preset : 'punchline'} templates={PUNCHLINE_PRESETS} onPresetChange={preset => onChange({ ...config, preset: preset.id, presetLabel: preset.label.toUpperCase() })} onApply={preset => onChange({ ...config, ...preset.config })} /><label>Title<input value={stringOf(config.title)} onChange={e => onChange({ ...config, title: e.target.value })} /></label><label>Voting style<select value={stringOf(config.votingStyle, 'gallery')} onChange={event => onChange({ ...config, votingStyle: event.target.value })}><option value="gallery">Gallery vote · everyone chooses a favorite</option><option value="headToHead">Head-to-head · resolve paired matchups</option></select></label>{stringOf(config.votingStyle, 'gallery') === 'headToHead' && <label>Points per matchup win<input type="number" min={0} max={1000} value={numberOf(config.headToHeadMatchPoints, 0)} onChange={event => onChange({ ...config, headToHeadMatchPoints: Number(event.target.value) || 0 })} /></label>}<label className="checkbox-row"><input type="checkbox" checked={config.requireModeration !== false} onChange={e => onChange({ ...config, requireModeration: e.target.checked })} /> Hold anonymous answers for host approval</label>{prompts.map((prompt, index) => <div className="activity-editor-row" key={stringOf(prompt.id, String(index))}><strong>Prompt {index + 1}</strong><textarea value={stringOf(prompt.prompt)} placeholder="The worst possible school mascot would be ______." onChange={e => { const next = [...prompts]; next[index] = { ...prompt, prompt: e.target.value }; updateListConfig(config, 'prompts', next, onChange); }} /><button type="button" className="button danger" disabled={prompts.length <= 1} onClick={() => updateListConfig(config, 'prompts', prompts.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove</button></div>)}<button type="button" className="button" onClick={() => updateListConfig(config, 'prompts', [...prompts, { id: `prompt-${Date.now()}`, prompt: '', points: 100 }], onChange)}>+ Add prompt</button><EmbeddedUtilityEditor config={config} onChange={onChange} /></div>;
};

export const FakeOutEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const rounds = listOf(config.rounds);
  return <div className="activity-editor-stack"><ActivityPresetPicker label="Bluffing format" value={typeof config.preset === 'string' ? config.preset : 'fakeOut'} templates={FAKE_OUT_PRESETS} onPresetChange={preset => onChange({ ...config, preset: preset.id, presetLabel: preset.label.toUpperCase() })} onApply={preset => onChange({ ...config, ...preset.config })} /><label>Title<input value={stringOf(config.title)} onChange={e => onChange({ ...config, title: e.target.value })} /></label><div className="two-fields"><label>Truth-finder points<input type="number" min={0} max={10000} value={numberOf(config.truthPoints, 100)} onChange={event => onChange({ ...config, truthPoints: Math.max(0, Math.min(10000, Number(event.target.value) || 0)) })} /></label><label>Successful bluff points<input type="number" min={0} max={10000} value={numberOf(config.bluffPoints, 50)} onChange={event => onChange({ ...config, bluffPoints: Math.max(0, Math.min(10000, Number(event.target.value) || 0)) })} /></label></div><div className="two-fields"><label>Host favorite points<input type="number" min={0} max={10000} value={numberOf(config.hostFavoritePoints, 25)} onChange={event => onChange({ ...config, hostFavoritePoints: Math.max(0, Math.min(10000, Number(event.target.value) || 0)) })} /></label><label className="checkbox-row"><input type="checkbox" checked={config.revealAuthors !== false} onChange={event => onChange({ ...config, revealAuthors: event.target.checked })} /> Reveal bluff authors after scoring</label></div><label className="checkbox-row"><input type="checkbox" checked={config.requireModeration !== false} onChange={e => onChange({ ...config, requireModeration: e.target.checked })} /> Hold fake answers for host approval</label>{rounds.map((round, index) => <div className="activity-editor-row" key={stringOf(round.id, String(index))}><strong>Round {index + 1}</strong><textarea value={stringOf(round.prompt)} placeholder="Which statement is true?" onChange={e => { const next = [...rounds]; next[index] = { ...round, prompt: e.target.value }; updateListConfig(config, 'rounds', next, onChange); }} /><TextInput value={stringOf(round.truth)} placeholder="The true answer" onChange={value => { const next = [...rounds]; next[index] = { ...round, truth: value }; updateListConfig(config, 'rounds', next, onChange); }} /><button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateListConfig(config, 'rounds', rounds.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove</button></div>)}<button type="button" className="button" onClick={() => updateListConfig(config, 'rounds', [...rounds, { id: `round-${Date.now()}`, prompt: '', truth: '', points: 100 }], onChange)}>+ Add round</button><EmbeddedUtilityEditor config={config} onChange={onChange} /></div>;
};
