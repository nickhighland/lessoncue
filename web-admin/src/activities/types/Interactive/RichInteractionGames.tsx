import React, { useState } from 'react';
import type { ActivityComponentProps, ActivityEditorProps } from '../../activityRegistry';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';
import { ActivityCountdown, ActivityRevealCurtain, ActivityWinnerBanner, useActivityCountdown } from '../../ActivityMotion';
import { ActivityLeaderboard } from '../../ActivityLeaderboard';
import { ActivityPresetPicker } from '../../ActivityPresetPicker';
import { DRAWING_PRESETS, MATCH_PRESETS, ORDERING_PRESETS, STAGE_PRESETS, WORD_PRESETS } from '../../activityPresetRegistry';

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
  const voteCounts = new Map(listOf(state.drawingVoteCounts).map(item => [stringOf(item.submissionId), numberOf(item.votes)]));
  const votingRemaining = useActivityCountdown({ durationMs: numberOf(state.votingDurationMs), startedAt: state.votingStartedAt, running: state.votingTimerRunning === true });
  const showGallery = state.phase === 'voting' || state.phase === 'reveal' || state.phase === 'leaderboard' || state.phase === 'finalResults' || state.phase === 'complete';
  const telephone = config.telephoneChain === true;
  const telephoneChain = listOf(state.telephoneChain);
  const telephoneKind = stringOf(state.telephoneStepKind, 'drawing');
  return <RichStage title={stringOf(config.title, envelope.name || 'Doodle & Guess')} kicker={`🎨 ${stringOf(config.presetLabel, 'DRAWING ROUND')}`} phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
    <div className={`interactive-prompt-card ${telephone ? 'telephone-prompt-card' : ''}`}><span className="interactive-round-label">{telephone ? `${stringOf(state.telephoneStepLabel, 'CHAIN STEP')} · ${telephoneKind === 'description' ? 'DESCRIBE IT' : 'DRAW IT'}` : 'DRAW THIS'}</span><p>{telephone ? stringOf(state.telephoneStepPrompt, 'Continue the chain.') : stringOf(prompt.prompt, 'Draw something surprising.')}</p>{telephone && stringOf(state.telephoneStepPhrase) && <small className="telephone-source-phrase">STARTING PHRASE · {stringOf(state.telephoneStepPhrase)}</small>}{telephone && telephoneKind === 'description' && Boolean(state.telephoneSourceStrokes) && <div className="telephone-source-drawing"><DrawingSvg strokes={state.telephoneSourceStrokes} /></div>}</div>
    {state.phase === 'voting' && <ActivityCountdown remainingMs={votingRemaining} durationMs={numberOf(state.votingDurationMs)} label="VOTE FOR A FAVORITE" compact />}
    {telephone && showGallery ? <div className="telephone-chain-replay" aria-label="Telephone Draw chain replay">{telephoneChain.map((step, index) => <article className="telephone-chain-step" key={stringOf(step.id, String(index))}><span>STEP {numberOf(step.stepIndex) + 1} · {stringOf(step.kind, 'drawing').toUpperCase()}</span>{stringOf(step.kind, 'drawing') === 'description' ? <strong>{stringOf(step.text, 'No description submitted')}</strong> : <DrawingSvg strokes={step.strokes} />}</article>)}{!telephoneChain.length && <div className="interactive-empty-card">The chain will replay after the first reveal.</div>}</div> : telephone ? <div className="interactive-help">Each player passes the idea to the next step. The full chain appears after the host reveals it.</div> : showGallery ? <div className="drawing-response-grid">{drawings.map((drawing, index) => <div className={`drawing-card ${stringOf(state.winningSubmissionId) === stringOf(drawing.id) ? 'winner' : ''}`} key={stringOf(drawing.id, String(index))}><span className="drawing-card-number">{String(index + 1).padStart(2, '0')}</span><DrawingSvg strokes={drawing.strokes} /><small>{stringOf(state.winningSubmissionId) === stringOf(drawing.id) ? `ROOM FAVORITE · ${numberOf(state.winningVoteCount)} VOTES` : `${voteCounts.get(stringOf(drawing.id)) || 0} VOTES`}</small></div>)}{!drawings.length && <div className="interactive-empty-card">Waiting for approved drawings…</div>}</div> : <div className="interactive-help">Use your phone as a sketchpad. The host will reveal the gallery when the drawing window closes.</div>}
    <ActivityWinnerBanner visible={state.phase === 'reveal' && Boolean(state.winningSubmissionId)} winner="Room favorite selected" subtitle="DRAWING REVEAL" />
    <ActivityLeaderboard state={state} showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />
  </RichStage>;
};

const OrderingItems: React.FC<{ items: JsonRecord[]; correctOrder?: string[]; reveal?: boolean }> = ({ items, correctOrder = [], reveal = false }) => {
  const labels = new Map(items.map(item => [stringOf(item.id), stringOf(item.label, 'Item')]));
  const values = reveal && correctOrder.length ? correctOrder : items.map(item => stringOf(item.id));
  return <div className="ordering-stage-list">{values.map((id, index) => <div className={`ordering-stage-item ${reveal ? 'revealed' : ''}`} key={`${id}-${index}`}><b>{index + 1}</b><span>{labels.get(id) || id}</span>{reveal && <em>✓</em>}</div>)}</div>;
};

const MatchingStage: React.FC<{ leftItems: JsonRecord[]; rightItems: JsonRecord[]; correctPairs: JsonRecord[]; reveal: boolean }> = ({ leftItems, rightItems, correctPairs, reveal }) => {
  const correct = new Map(correctPairs.map(pair => [stringOf(pair.id, stringOf(pair.left)), stringOf(pair.right)]));
  return <div className="matching-stage-board"><div className="matching-stage-column"><span>CLUES</span>{leftItems.map((item, index) => <div className="matching-stage-card" key={stringOf(item.id, String(index))}><b>{String(index + 1).padStart(2, '0')}</b><strong>{stringOf(item.label, 'Clue')}</strong>{reveal && <em>→ {correct.get(stringOf(item.id, stringOf(item.label))) || '—'}</em>}</div>)}</div><div className="matching-stage-column matching-stage-right"><span>OPTIONS</span>{rightItems.map((item, index) => <div className="matching-stage-card" key={stringOf(item.id, String(index))}><b>{String.fromCharCode(65 + index)}</b><strong>{stringOf(item.label, 'Option')}</strong></div>)}</div></div>;
};

const GroupingStage: React.FC<{ items: JsonRecord[]; groups: JsonRecord[]; correctGroups: JsonRecord[]; reveal: boolean }> = ({ items, groups, correctGroups, reveal }) => {
  const itemLabels = new Map(items.map(item => [stringOf(item.id), stringOf(item.label, 'Item')]));
  const answerGroups = reveal ? correctGroups : groups;
  return <div className="grouping-stage-board">{answerGroups.map((group, index) => <section className="grouping-stage-group" key={stringOf(group.id, String(index))}><span>{stringOf(group.label, `GROUP ${index + 1}`)}</span><div>{(Array.isArray(group.itemIds) ? group.itemIds : []).map((id, itemIndex) => <strong key={String(id) + itemIndex}>{itemLabels.get(String(id)) || String(id)}</strong>)}</div></section>)}</div>;
};

export const OrderingDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const rounds = listOf(config.rounds);
  const round = rounds[numberOf(state.currentRoundIndex)] || rounds[0] || {};
  const reveal = state.phase === 'reveal' || state.phase === 'leaderboard' || state.phase === 'finalResults' || state.phase === 'complete';
  const results = listOf(state.orderingResults);
  const interactionMode = stringOf(state.interactionMode, stringOf(state.orderingInteractionMode, stringOf(config.interactionMode, 'ordering')));
  const matchingLeft = listOf(state.matchingLeft);
  const matchingRight = listOf(state.matchingRight);
  const groupingItems = listOf(state.groupingItems);
  const groupingGroups = listOf(state.groupingGroups);
  return <RichStage title={stringOf(config.title, envelope.name || 'Order Up')} kicker={`↕ ${stringOf(config.presetLabel, 'ORDERING CHALLENGE')}`} phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
    <div className="interactive-prompt-card"><span className="interactive-round-label">{interactionMode === 'matching' ? 'MATCH THE PAIRS' : interactionMode === 'grouping' ? 'FIND THE CONNECTIONS' : 'PUT THESE IN ORDER'}</span><p>{stringOf(round.prompt, interactionMode === 'matching' ? 'Connect each clue to its match.' : interactionMode === 'grouping' ? 'Sort every item into the group where it belongs.' : 'Arrange the items in the best order.')}</p></div>
    {interactionMode === 'matching' ? <MatchingStage leftItems={matchingLeft} rightItems={matchingRight} correctPairs={listOf(state.correctPairs)} reveal={reveal} /> : interactionMode === 'grouping' ? <GroupingStage items={groupingItems} groups={groupingGroups} correctGroups={listOf(state.correctGroups)} reveal={reveal} /> : <OrderingItems items={listOf(round.items)} correctOrder={stringList(state.correctOrder)} reveal={reveal} />}
    {!reveal && <div className="interactive-help">Use your phone to {interactionMode === 'matching' ? 'connect each clue to one option.' : interactionMode === 'grouping' ? 'place every item into one group.' : `move the cards. ${stringOf(config.scoringMode, 'partial') === 'exact' ? 'Only a perfect order scores.' : 'Exact positions earn partial credit, so every good move matters.'}`}</div>}
    {reveal && results.length > 0 && <div className="interactive-result-strip"><strong>{stringOf(state.orderingScoringMode, stringOf(config.scoringMode, 'partial')).toUpperCase()} SCORING</strong><span>{results.filter(item => numberOf(item.earned) > 0).length} answers scored</span></div>}
    <ActivityLeaderboard state={state} showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />
  </RichStage>;
};

export const WordDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const rounds = listOf(config.rounds);
  const round = rounds[numberOf(state.currentRoundIndex)] || rounds[0] || {};
  const words = listOf(state.wordCloud);
  const timerRemaining = useActivityCountdown({ durationMs: numberOf(state.timerDurationMs), startedAt: state.timerStartedAt, pausedAt: state.timerPausedAt, running: state.timerRunning === true });
  return <RichStage title={stringOf(config.title, envelope.name || 'Word Storm')} kicker={`☁ ${stringOf(config.presetLabel, 'WORD STORM')}`} phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
    <div className="interactive-prompt-card"><span className="interactive-round-label">CATEGORY · {stringOf(round.category, 'OPEN CATEGORY')}</span><p>{stringOf(round.prompt, 'Add words to the storm.')}</p></div>
    {config.turnBased === true && <div className="interactive-help">{stringOf(state.lastTurnMessage) || `TURN · ${stringOf(state.turnParticipantName, 'the next player')}`}</div>}
    {state.timerRunning === true && <ActivityCountdown remainingMs={timerRemaining} durationMs={numberOf(state.timerDurationMs)} label="WORD STORM CLOCK" compact />}
    {words.length ? <div className="word-cloud" aria-label="Approved word cloud">{words.map((word, index) => <span className="word-cloud-chip" style={{ '--word-size': `${Math.min(2.6, 1 + numberOf(word.count, 1) * .28)}rem` } as React.CSSProperties} key={`${stringOf(word.word)}-${index}`}>{stringOf(word.word)}<small>{numberOf(word.count, 1)}</small></span>)}</div> : <div className="interactive-help">Submit several answers. Approved words will grow as the room repeats them.</div>}
    <ActivityLeaderboard state={state} showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />
  </RichStage>;
};

export const MatchPlayerDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const rounds = listOf(config.rounds);
  const round = rounds[numberOf(state.currentRoundIndex)] || rounds[0] || {};
  const answerMode = stringOf(round.answerMode, 'choice');
  const options = Array.isArray(round.options) ? round.options.map(item => stringOf(item)) : [];
  const revealedIndex = numberOf(state.revealedOptionIndex, -1);
  const isRevealed = state.phase === 'reveal' || state.phase === 'leaderboard' || state.phase === 'finalResults' || state.phase === 'complete';
  return <RichStage title={stringOf(config.title, envelope.name || 'Match Minds')} kicker={`🧠 ${stringOf(config.presetLabel, 'MATCH MINDS')}`} phase={state.phase} joinCode={state.joinCode} participantCount={state.participantCount}>
    <div className="interactive-prompt-card"><span className="interactive-round-label">{stringOf(state.targetName, 'A mystery player')} ANSWERS PRIVATELY</span><p>{stringOf(round.prompt, 'Which answer will they choose?')}</p></div>
    {answerMode === 'text' ? <div className={`match-text-reveal ${isRevealed ? 'revealed' : ''}`}><span>{isRevealed ? 'THE TARGET ANSWERED' : 'PRIVATE ANSWER'}</span><strong>{isRevealed ? stringOf(state.revealedAnswer, 'No answer recorded') : '???'}</strong></div> : <div className="match-option-grid">{options.map((option, index) => <div className={`match-option-card ${isRevealed && index === revealedIndex ? 'matched' : ''}`} key={`${option}-${index}`}><b>{String.fromCharCode(65 + index)}</b><span>{option}</span>{isRevealed && index === revealedIndex && <em>MATCHED ANSWER</em>}</div>)}</div>}
    {isRevealed && <div className="interactive-winner-card"><span>ROOM MATCHES</span><strong>{numberOf(state.matchCount)} {numberOf(state.matchCount) === 1 ? 'player' : 'players'} thought alike</strong></div>}
    {!isRevealed && <div className="interactive-help">The selected player answers in private. Everyone else predicts before the reveal.</div>}
    <ActivityLeaderboard state={state} showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />
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
  const audienceCounts = state.audienceVoteCounts && typeof state.audienceVoteCounts === 'object' ? state.audienceVoteCounts as JsonRecord : {};
  return <RichStage title={stringOf(config.title, envelope.name || 'Beat the Clock')} kicker={`⏱ ${stringOf(config.presetLabel, 'HOST CHALLENGE')}`} phase={state.phase}>
    <div className="stage-challenge-card"><span className="interactive-round-label">CHALLENGE {numberOf(state.currentChallengeIndex) + 1} OF {challenges.length || 1}</span><h2>{stringOf(challenge.title, 'Your challenge')}</h2><p>{stringOf(challenge.instructions, 'The host will explain the challenge.')}</p>{stringOf(state.selectedParticipantName) && <strong className="stage-contestant">CONTESTANT · {stringOf(state.selectedParticipantName)}</strong>}</div>
    {(running || status === 'paused') ? <ActivityCountdown remainingMs={remaining} durationMs={duration} label={status === 'paused' ? 'PAUSED' : 'TIME REMAINING'} urgentAtSeconds={10} /> : <div className={`stage-timer-card ${status === 'success' ? 'success' : status === 'failure' ? 'failure' : ''}`}><span>{status === 'success' ? 'SUCCESS' : status === 'failure' ? 'TIME / TRY COMPLETE' : 'READY'}</span><strong>{`${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`}</strong></div>}
    {config.audienceVoting === true && state.phase === 'voting' && <div className="interactive-prompt-card"><span className="interactive-round-label">AUDIENCE CALL</span><p>Everyone on a phone is voting: will the contestant succeed?</p></div>}
    {config.audienceVoting === true && (state.phase === 'reveal' || state.phase === 'finalResults' || state.phase === 'leaderboard' || state.phase === 'complete') && <div className="interactive-result-strip"><span>ROOM CALL</span><strong>{numberOf(audienceCounts.success)} SUCCESS</strong><strong>{numberOf(audienceCounts.fail)} FAIL</strong></div>}
    <ActivityRevealCurtain visible={status === 'success' || status === 'failure'} kicker={status === 'success' ? 'SUCCESS' : 'RESULT'}>{status === 'success' ? 'Challenge complete!' : 'Give it another try.'}</ActivityRevealCurtain>
    <ActivityWinnerBanner visible={status === 'success' && Boolean(state.selectedParticipantName)} winner={stringOf(state.selectedParticipantName)} subtitle="CHALLENGE WINNER" />
    <ActivityLeaderboard state={state} showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />
  </RichStage>;
};

const QuickAction: React.FC<{ label: string; action: string; envelope: ActivityStateEnvelope; tone?: string; onCommandSent?: () => void }> = ({ label, action, envelope, tone = 'act-btn-primary', onCommandSent }) => {
  const [busy, setBusy] = useState(false);
  return <button type="button" className={`act-btn ${tone}`} disabled={busy} onClick={async () => { setBusy(true); try { await ActivityApi.executeCommand(envelope.runId, { action }); onCommandSent?.(); } catch (error) { console.debug('Activity command was rejected; the host notice contains the reason.', error); } finally { setBusy(false); } }}>{busy ? 'Working…' : label}</button>;
};

type RichAction = { label: string; action: string; tone?: string; phases?: string[] };

const RichController: React.FC<ActivityComponentProps & { children?: React.ReactNode; actions: RichAction[] }> = ({ envelope, children, actions, onCommandSent }) => {
  const state = stateOf(envelope);
  const phase = stringOf(state.phase, 'lobby');
  const visibleActions = actions.filter(item => !item.phases || item.phases.includes(phase));
  return <div className="act-ctrl-container interactive-host-controller"><div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">LIVE GAME CONTROL</span><strong>{phaseLabel(state.phase)}</strong><small>{numberOf(state.participantCount)} phones connected · advance when the room is ready</small></div><span className="controller-score">{numberOf(state.submissionCount)}<small> responses</small></span></div><div className="act-controller-button-row">{visibleActions.map(item => <QuickAction key={item.action} {...item} envelope={envelope} onCommandSent={onCommandSent} />)}</div>{children}</div>;
};

export const DrawingController: React.FC<ActivityComponentProps> = props => {
  const telephone = configOf(props.envelope).telephoneChain === true;
  const actions = telephone
    ? [{ label: 'Start chain', action: 'start', phases: ['lobby', 'setup', 'roundIntro'] }, { label: 'Open step', action: 'open', phases: ['roundIntro'] }, { label: 'Lock step', action: 'lock', tone: 'act-btn-secondary', phases: ['acceptingResponses'] }, { label: 'Reveal chain step', action: 'reveal', tone: 'act-btn-gold', phases: ['responsesLocked'] }, { label: 'Next chain step', action: 'nextstep', tone: 'act-btn-secondary', phases: ['reveal', 'leaderboard'] }]
    : [{ label: 'Start drawing', action: 'start', phases: ['lobby', 'setup', 'roundIntro'] }, { label: 'Open responses', action: 'open', phases: ['prompt', 'roundIntro'] }, { label: 'Lock drawings', action: 'lock', tone: 'act-btn-secondary', phases: ['acceptingResponses'] }, { label: 'Open voting', action: 'openvoting', phases: ['responsesLocked'] }, { label: 'Reveal favorite', action: 'reveal', tone: 'act-btn-gold', phases: ['voting', 'responsesLocked'] }, { label: 'Next prompt', action: 'next', tone: 'act-btn-secondary', phases: ['reveal', 'leaderboard', 'finalResults'] }];
  return <RichController {...props} actions={actions}><div className="act-ctrl-card"><p className="muted">{telephone ? 'Each chain step is held for approval. Reveal the full anonymous chain at the end.' : 'Anonymous drawings are held for host approval before they reach the stage. Players cannot vote for their own drawing.'}</p></div></RichController>;
};
export const OrderingController: React.FC<ActivityComponentProps> = props => <RichController {...props} actions={[{ label: 'Start round', action: 'start', phases: ['lobby', 'setup', 'roundIntro'] }, { label: 'Open responses', action: 'open', phases: ['roundIntro'] }, { label: 'Lock answers', action: 'lock', tone: 'act-btn-secondary', phases: ['acceptingResponses'] }, { label: 'Reveal order', action: 'reveal', tone: 'act-btn-gold', phases: ['responsesLocked'] }, { label: 'Next round', action: 'next', tone: 'act-btn-secondary', phases: ['reveal', 'leaderboard', 'finalResults'] }]}><div className="act-ctrl-card"><p className="muted">Participants must place every card exactly once. Choose partial scoring for generous classroom play or exact scoring for a tougher challenge.</p></div></RichController>;
export const WordController: React.FC<ActivityComponentProps> = props => <RichController {...props} actions={[{ label: 'Start round', action: 'start', phases: ['lobby', 'setup', 'roundIntro'] }, { label: 'Open responses', action: 'open', phases: ['roundIntro'] }, { label: 'Lock words', action: 'lock', tone: 'act-btn-secondary', phases: ['acceptingResponses'] }, { label: 'Reveal word cloud', action: 'reveal', tone: 'act-btn-gold', phases: ['responsesLocked', 'acceptingResponses'] }, { label: 'Next round', action: 'next', tone: 'act-btn-secondary', phases: ['reveal', 'leaderboard', 'finalResults'] }]}><div className="act-ctrl-card"><p className="muted">The round clock is server-authoritative. Approve or hide submissions from the live host panel before revealing the storm.</p></div></RichController>;
export const MatchPlayerController: React.FC<ActivityComponentProps> = props => <RichController {...props} actions={[{ label: 'Start round', action: 'start', phases: ['lobby', 'setup', 'roundIntro'] }, { label: 'Open predictions', action: 'open', phases: ['prompt', 'roundIntro'] }, { label: 'Lock predictions', action: 'lock', tone: 'act-btn-secondary', phases: ['acceptingResponses'] }, { label: 'Reveal the match', action: 'reveal', tone: 'act-btn-gold', phases: ['responsesLocked'] }, { label: 'Next round', action: 'next', tone: 'act-btn-secondary', phases: ['reveal', 'leaderboard', 'finalResults'] }]}><div className="act-ctrl-card"><p className="muted">Choose the target player in the session panel, then open the private answer and prediction window. Text rounds compare normalized answers after the reveal.</p></div></RichController>;
export const StageChallengeController: React.FC<ActivityComponentProps> = props => <RichController {...props} actions={[{ label: 'Start challenge', action: 'start', phases: ['lobby', 'setup', 'roundIntro'] }, { label: 'Start timer', action: 'starttimer', phases: ['prompt', 'roundIntro', 'acceptingResponses'] }, { label: 'Pause timer', action: 'pausetimer', tone: 'act-btn-secondary', phases: ['acceptingResponses'] }, { label: 'Resume timer', action: 'resumetimer', tone: 'act-btn-secondary', phases: ['acceptingResponses'] }, { label: 'Open audience vote', action: 'openaudiencevote', phases: ['acceptingResponses'] }, { label: 'Close audience vote', action: 'closeaudiencevote', tone: 'act-btn-secondary', phases: ['voting'] }, { label: 'Use audience result', action: 'useaudiencevote', tone: 'act-btn-gold', phases: ['judging'] }, { label: 'Success', action: 'success', tone: 'act-btn-gold', phases: ['acceptingResponses', 'voting', 'judging'] }, { label: 'Fail', action: 'fail', tone: 'act-btn-danger', phases: ['acceptingResponses', 'voting', 'judging'] }, { label: 'Next challenge', action: 'next', tone: 'act-btn-secondary', phases: ['reveal', 'leaderboard', 'finalResults'] }]}><div className="act-ctrl-card"><p className="muted">Choose a contestant in the session panel, run the clock, then make the ruling. When audience voting is enabled, the room can call success or fail before you reveal the result.</p></div></RichController>;

const updateList = (config: JsonRecord, key: string, value: JsonRecord[], onChange: ActivityEditorProps['onChange']) => onChange({ ...config, [key]: value });

export const DrawingEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const prompts = listOf(config.prompts);
  return <div className="activity-editor-stack"><ActivityPresetPicker label="Drawing format" value={typeof config.preset === 'string' ? config.preset : 'doodle'} templates={DRAWING_PRESETS} onPresetChange={preset => onChange({ ...config, preset: preset.id, presetLabel: preset.label.toUpperCase() })} onApply={preset => onChange({ ...config, ...preset.config })} /><label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label><div className="activity-editor-row activity-editor-numbers"><label>Max strokes<input type="number" min={1} max={240} value={numberOf(config.maxStrokes, 80)} onChange={event => onChange({ ...config, maxStrokes: Number(event.target.value) || 80 })} /></label><label>Max points per stroke<input type="number" min={1} max={240} value={numberOf(config.maxPointsPerStroke, 120)} onChange={event => onChange({ ...config, maxPointsPerStroke: Number(event.target.value) || 120 })} /></label><label>Voting seconds<input type="number" min={5} max={600} value={numberOf(config.votingSeconds, 30)} onChange={event => onChange({ ...config, votingSeconds: Number(event.target.value) || 30 })} /></label></div><label className="checkbox-row"><input type="checkbox" checked={config.requireModeration !== false} onChange={event => onChange({ ...config, requireModeration: event.target.checked })} /> Hold drawings for host approval</label><p className="muted">Keep prompts short enough to read quickly on a phone and a TV. Approved entries become an anonymous gallery for voting.</p>{prompts.map((prompt, index) => <div className="activity-editor-row" key={stringOf(prompt.id, String(index))}><strong>Prompt {index + 1}</strong><textarea value={stringOf(prompt.prompt)} placeholder="Draw a place where you would never want to lose your keys." onChange={event => { const next = [...prompts]; next[index] = { ...prompt, prompt: event.target.value }; updateList(config, 'prompts', next, onChange); }} /><label>Points<input type="number" min={0} max={10000} value={numberOf(prompt.points, 100)} onChange={event => { const next = [...prompts]; next[index] = { ...prompt, points: Number(event.target.value) || 0 }; updateList(config, 'prompts', next, onChange); }} /></label><button type="button" className="button danger" disabled={prompts.length <= 1} onClick={() => updateList(config, 'prompts', prompts.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove</button></div>)}<button type="button" className="button" onClick={() => updateList(config, 'prompts', [...prompts, { id: `prompt-${Date.now()}`, prompt: '', points: 100 }], onChange)}>+ Add prompt</button></div>;
};

const normalizedOrder = (round: JsonRecord) => {
  const items = listOf(round.items);
  const ids = items.map(item => stringOf(item.id)).filter(Boolean);
  return [...stringList(round.correctOrder).filter(id => ids.includes(id)), ...ids.filter(id => !stringList(round.correctOrder).includes(id))];
};

const MatchingOrderingEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const rounds = listOf(config.rounds);
  const updateRounds = (next: JsonRecord[]) => onChange({ ...config, rounds: next, interactionMode: 'matching' });
  return <div className="activity-editor-stack"><ActivityPresetPicker label="Ordering format" value={typeof config.preset === 'string' ? config.preset : 'matchUp'} templates={ORDERING_PRESETS} onPresetChange={preset => onChange({ ...config, preset: preset.id, presetLabel: preset.label.toUpperCase() })} onApply={preset => onChange({ ...config, ...preset.config })} /><label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label><p className="muted">Every left clue must be paired with one right option. Add as many pairs as the round needs.</p>{rounds.map((round, roundIndex) => { const pairs = listOf(round.pairs); const updateRound = (updated: JsonRecord) => { const next = [...rounds]; next[roundIndex] = updated; updateRounds(next); }; return <div className="activity-editor-card" key={stringOf(round.id, String(roundIndex))}><div className="activity-editor-row"><strong>Round {roundIndex + 1}</strong><textarea value={stringOf(round.prompt)} placeholder="Match each animal to its home." onChange={event => updateRound({ ...round, prompt: event.target.value })} /><input type="number" min={1} max={1000} value={numberOf(round.points, 100)} aria-label="Points" onChange={event => updateRound({ ...round, points: Number(event.target.value) || 0 })} /></div>{pairs.map((pair, pairIndex) => <div className="activity-editor-row ordering-pair-editor" key={stringOf(pair.id, String(pairIndex))}><input value={stringOf(pair.left)} aria-label={`Pair ${pairIndex + 1} left item`} placeholder="Left clue" onChange={event => { const next = [...pairs]; next[pairIndex] = { ...pair, left: event.target.value }; updateRound({ ...round, pairs: next }); }} /><span>↔</span><input value={stringOf(pair.right)} aria-label={`Pair ${pairIndex + 1} right item`} placeholder="Right match" onChange={event => { const next = [...pairs]; next[pairIndex] = { ...pair, right: event.target.value }; updateRound({ ...round, pairs: next }); }} /><button type="button" className="button danger" disabled={pairs.length <= 2} onClick={() => updateRound({ ...round, pairs: pairs.filter((_, index) => index !== pairIndex) })}>Remove</button></div>)}<button type="button" className="button" onClick={() => updateRound({ ...round, pairs: [...pairs, { id: `pair-${Date.now()}`, left: '', right: '' }] })}>+ Add pair</button><button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateRounds(rounds.filter((_, index) => index !== roundIndex))}>Remove round</button></div>; })}<button type="button" className="button" onClick={() => updateRounds([...rounds, { id: `round-${Date.now()}`, prompt: '', pairs: [{ id: `pair-${Date.now()}-1`, left: '', right: '' }, { id: `pair-${Date.now()}-2`, left: '', right: '' }], points: 100 }])}>+ Add round</button></div>;
};

const GroupingOrderingEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const rounds = listOf(config.rounds);
  const updateRounds = (next: JsonRecord[]) => onChange({ ...config, rounds: next, interactionMode: 'grouping' });
  return <div className="activity-editor-stack"><ActivityPresetPicker label="Ordering format" value={typeof config.preset === 'string' ? config.preset : 'connections'} templates={ORDERING_PRESETS} onPresetChange={preset => onChange({ ...config, preset: preset.id, presetLabel: preset.label.toUpperCase() })} onApply={preset => onChange({ ...config, ...preset.config })} /><label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label><p className="muted">Create hidden categories and place each clue into exactly one group. The group names appear on the TV only after reveal.</p>{rounds.map((round, roundIndex) => { const items = listOf(round.items); const groups = listOf(round.groups); const updateRound = (updated: JsonRecord) => { const next = [...rounds]; next[roundIndex] = updated; updateRounds(next); }; return <div className="activity-editor-card" key={stringOf(round.id, String(roundIndex))}><div className="activity-editor-row"><strong>Round {roundIndex + 1}</strong><textarea value={stringOf(round.prompt)} placeholder="Sort these clues into hidden animal groups." onChange={event => updateRound({ ...round, prompt: event.target.value })} /><input type="number" min={1} max={1000} value={numberOf(round.points, 100)} aria-label="Points" onChange={event => updateRound({ ...round, points: Number(event.target.value) || 0 })} /></div><div className="activity-editor-card-heading"><strong>Clues ({items.length})</strong><button type="button" className="button" onClick={() => updateRound({ ...round, items: [...items, { id: `item-${Date.now()}`, label: '' }] })}>+ Add clue</button></div>{items.map((item, itemIndex) => <div className="activity-editor-row" key={stringOf(item.id, String(itemIndex))}><input value={stringOf(item.label)} aria-label={`Clue ${itemIndex + 1}`} placeholder="Clue" onChange={event => { const next = [...items]; next[itemIndex] = { ...item, label: event.target.value }; updateRound({ ...round, items: next }); }} /><button type="button" className="button danger" disabled={items.length <= 2} onClick={() => updateRound({ ...round, items: items.filter((_, index) => index !== itemIndex), groups: groups.map(group => ({ ...group, itemIds: Array.isArray(group.itemIds) ? group.itemIds.filter(id => id !== item.id) : [] })) })}>Remove clue</button></div>)}<div className="activity-editor-card-heading"><strong>Hidden groups ({groups.length})</strong><button type="button" className="button" onClick={() => updateRound({ ...round, groups: [...groups, { id: `group-${Date.now()}`, label: '', itemIds: [] }] })}>+ Add group</button></div>{groups.map((group, groupIndex) => <div className="activity-editor-card grouping-editor-group" key={stringOf(group.id, String(groupIndex))}><div className="activity-editor-row"><input value={stringOf(group.label)} aria-label={`Group ${groupIndex + 1} name`} placeholder={`Group ${groupIndex + 1} name`} onChange={event => { const next = [...groups]; next[groupIndex] = { ...group, label: event.target.value }; updateRound({ ...round, groups: next }); }} /><button type="button" className="button danger" disabled={groups.length <= 2} onClick={() => updateRound({ ...round, groups: groups.filter((_, index) => index !== groupIndex) })}>Remove group</button></div><div className="grouping-editor-item-picker">{items.map(item => { const itemId = stringOf(item.id); const selected = Array.isArray(group.itemIds) && group.itemIds.includes(itemId); return <label key={itemId}><input type="checkbox" checked={selected} onChange={event => { const next = [...groups]; const currentIds = Array.isArray(next[groupIndex].itemIds) ? next[groupIndex].itemIds as string[] : []; next[groupIndex] = { ...next[groupIndex], itemIds: event.target.checked ? [...currentIds, itemId] : currentIds.filter(id => id !== itemId) }; updateRound({ ...round, groups: next }); }} />{stringOf(item.label, 'Clue')}</label>; })}</div></div>)}<button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateRounds(rounds.filter((_, index) => index !== roundIndex))}>Remove round</button></div>; })}<button type="button" className="button" onClick={() => updateRounds([...rounds, { id: `round-${Date.now()}`, prompt: '', items: [{ id: `item-${Date.now()}-1`, label: '' }, { id: `item-${Date.now()}-2`, label: '' }], groups: [{ id: `group-${Date.now()}-1`, label: '', itemIds: [] }, { id: `group-${Date.now()}-2`, label: '', itemIds: [] }], points: 100 }])}>+ Add round</button></div>;
};

export const OrderingEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const interactionMode = stringOf(config.interactionMode, 'ordering');
  if (interactionMode === 'matching') return <MatchingOrderingEditor config={config} onChange={onChange} />;
  if (interactionMode === 'grouping') return <GroupingOrderingEditor config={config} onChange={onChange} />;
  const rounds = listOf(config.rounds);
  return <div className="activity-editor-stack"><ActivityPresetPicker label="Ordering format" value={typeof config.preset === 'string' ? config.preset : 'orderUp'} templates={ORDERING_PRESETS} onPresetChange={preset => onChange({ ...config, preset: preset.id, presetLabel: preset.label.toUpperCase() })} onApply={preset => onChange({ ...config, ...preset.config })} /><label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label><label>Scoring style<select aria-label="Ordering scoring style" value={stringOf(config.scoringMode, 'partial')} onChange={event => onChange({ ...config, scoringMode: event.target.value })}><option value="partial">Partial credit</option><option value="exact">Perfect order only</option></select></label><p className="muted">Set the correct order with the position selectors. Participants must submit every item exactly once.</p>{rounds.map((round, roundIndex) => {
    const items = listOf(round.items);
    const order = normalizedOrder(round);
    const updateRound = (updated: JsonRecord) => { const next = [...rounds]; next[roundIndex] = updated; updateList(config, 'rounds', next, onChange); };
    const changePosition = (position: number, selectedId: string) => { const next = [...order]; const oldPosition = next.indexOf(selectedId); [next[position], next[oldPosition]] = [next[oldPosition], next[position]]; updateRound({ ...round, correctOrder: next }); };
    return <div className="activity-editor-card" key={stringOf(round.id, String(roundIndex))}><div className="activity-editor-row"><strong>Round {roundIndex + 1}</strong><textarea value={stringOf(round.prompt)} placeholder="Put these steps in the best order." onChange={event => updateRound({ ...round, prompt: event.target.value })} /><input type="number" min={1} max={1000} value={numberOf(round.points, 100)} aria-label="Points" onChange={event => updateRound({ ...round, points: Number(event.target.value) || 0 })} /></div><div className="ordering-editor-items">{items.map((item, itemIndex) => <div className="activity-editor-row" key={stringOf(item.id, String(itemIndex))}><input value={stringOf(item.label)} aria-label={`Item ${itemIndex + 1}`} onChange={event => { const nextItems = [...items]; nextItems[itemIndex] = { ...item, label: event.target.value }; updateRound({ ...round, items: nextItems }); }} /><button type="button" className="button danger" disabled={items.length <= 2} onClick={() => { const removedId = stringOf(item.id); const nextItems = items.filter((_, index) => index !== itemIndex); updateRound({ ...round, items: nextItems, correctOrder: order.filter(id => id !== removedId) }); }}>Remove item</button></div>)}<button type="button" className="button" onClick={() => { const id = `item-${Date.now()}`; updateRound({ ...round, items: [...items, { id, label: '' }], correctOrder: [...order, id] }); }}>+ Add item</button></div><div className="ordering-answer-editor"><strong>Correct order</strong>{order.map((id, position) => <label key={`${id}-${position}`}>{position + 1}<select value={id} onChange={event => changePosition(position, event.target.value)}>{items.map(item => <option key={stringOf(item.id)} value={stringOf(item.id)}>{stringOf(item.label, 'Untitled item')}</option>)}</select></label>)}</div><button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateList(config, 'rounds', rounds.filter((_, index) => index !== roundIndex), onChange)}>Remove round</button></div>;
  })}<button type="button" className="button" onClick={() => { const firstId = `item-${Date.now()}-1`; const secondId = `item-${Date.now()}-2`; updateList(config, 'rounds', [...rounds, { id: `round-${Date.now()}`, prompt: '', items: [{ id: firstId, label: '' }, { id: secondId, label: '' }], correctOrder: [firstId, secondId], points: 100 }], onChange); }}>+ Add round</button></div>;
};

export const WordEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const rounds = listOf(config.rounds);
  return <div className="activity-editor-stack"><ActivityPresetPicker label="Word format" value={typeof config.preset === 'string' ? config.preset : 'wordStorm'} templates={WORD_PRESETS} onPresetChange={preset => onChange({ ...config, preset: preset.id, presetLabel: preset.label.toUpperCase() })} onApply={preset => onChange({ ...config, ...preset.config })} /><label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label><div className="activity-editor-row activity-editor-numbers"><label>Max words per response<input type="number" min={1} max={30} value={numberOf(config.maxWords, 30)} onChange={event => onChange({ ...config, maxWords: Number(event.target.value) || 30 })} /></label><label className="checkbox-row"><input type="checkbox" checked={config.turnBased === true} onChange={event => onChange({ ...config, turnBased: event.target.checked })} /> Turn-based elimination</label><label className="checkbox-row"><input type="checkbox" checked={config.eliminateOnDuplicate === true} onChange={event => onChange({ ...config, eliminateOnDuplicate: event.target.checked })} /> Duplicate answers eliminate a player</label></div><label className="checkbox-row"><input type="checkbox" checked={config.requireModeration !== false} onChange={event => onChange({ ...config, requireModeration: event.target.checked })} /> Hold words for host approval</label>{rounds.map((round, index) => <div className="activity-editor-card" key={stringOf(round.id, String(index))}><div className="activity-editor-row"><strong>Round {index + 1}</strong><textarea value={stringOf(round.prompt)} placeholder="Name something that helps a team work well." onChange={event => { const next = [...rounds]; next[index] = { ...round, prompt: event.target.value }; updateList(config, 'rounds', next, onChange); }} /></div><div className="activity-editor-row"><input value={stringOf(round.category)} placeholder="Category label" onChange={event => { const next = [...rounds]; next[index] = { ...round, category: event.target.value }; updateList(config, 'rounds', next, onChange); }} /><label>Seconds<input type="number" min={5} max={600} value={numberOf(round.seconds, 45)} onChange={event => { const next = [...rounds]; next[index] = { ...round, seconds: Number(event.target.value) || 45 }; updateList(config, 'rounds', next, onChange); }} /></label><input type="number" min={1} max={100} value={numberOf(round.points, 10)} aria-label="Points per word" onChange={event => { const next = [...rounds]; next[index] = { ...round, points: Number(event.target.value) || 0 }; updateList(config, 'rounds', next, onChange); }} /><button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateList(config, 'rounds', rounds.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove</button></div></div>)}<button type="button" className="button" onClick={() => updateList(config, 'rounds', [...rounds, { id: `round-${Date.now()}`, prompt: '', category: '', points: 10, seconds: 45 }], onChange)}>+ Add round</button></div>;
};

export const MatchPlayerEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const rounds = listOf(config.rounds);
  return <div className="activity-editor-stack"><ActivityPresetPicker label="Match format" value={typeof config.preset === 'string' ? config.preset : 'matchMinds'} templates={MATCH_PRESETS} onPresetChange={preset => onChange({ ...config, preset: preset.id, presetLabel: preset.label.toUpperCase() })} onApply={preset => onChange({ ...config, ...preset.config })} /><label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label><p className="muted">Each round gives one selected player a private answer while everyone else predicts. Choice rounds support 2–8 options; text rounds accept short answers.</p>{rounds.map((round, index) => { const answerMode = stringOf(round.answerMode, 'choice'); const options = Array.isArray(round.options) ? round.options.map(item => stringOf(item)) : []; const updateRound = (updated: JsonRecord) => { const next = [...rounds]; next[index] = updated; updateList(config, 'rounds', next, onChange); }; return <div className="activity-editor-card" key={stringOf(round.id, String(index))}><div className="activity-editor-row"><strong>Round {index + 1}</strong><textarea value={stringOf(round.prompt)} placeholder="Which would you choose for a free afternoon?" onChange={event => updateRound({ ...round, prompt: event.target.value })} /><label>Answer type<select aria-label={`Answer type ${index + 1}`} value={answerMode} onChange={event => updateRound({ ...round, answerMode: event.target.value, options: event.target.value === 'choice' && options.length < 2 ? ['Choice A', 'Choice B'] : round.options })}><option value="choice">Multiple choice</option><option value="text">Short text</option></select></label><input type="number" min={1} max={1000} value={numberOf(round.points, 100)} aria-label="Points" onChange={event => updateRound({ ...round, points: Number(event.target.value) || 0 })} /></div>{answerMode === 'text' ? <p className="muted">The target and the room each type a short answer. Matching ignores case and extra spaces.</p> : <><div className="match-editor-options">{options.map((option, optionIndex) => <div className="activity-editor-row" key={`${optionIndex}-${option}`}><input value={option} aria-label={`Choice ${optionIndex + 1}`} onChange={event => { const next = [...options]; next[optionIndex] = event.target.value; updateRound({ ...round, options: next }); }} /><button type="button" className="button danger" disabled={options.length <= 2} onClick={() => updateRound({ ...round, options: options.filter((_, itemIndex) => itemIndex !== optionIndex) })}>Remove choice</button></div>)}</div><button type="button" className="button" disabled={options.length >= 8} onClick={() => updateRound({ ...round, options: [...options, `Choice ${options.length + 1}`] })}>+ Add choice</button></>}<button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateList(config, 'rounds', rounds.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove round</button></div>; })}<button type="button" className="button" onClick={() => updateList(config, 'rounds', [...rounds, { id: `round-${Date.now()}`, prompt: '', answerMode: 'choice', options: ['Choice A', 'Choice B'], points: 100 }], onChange)}>+ Add round</button></div>;
};

export const StageChallengeEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const challenges = listOf(config.challenges);
  const updateChallenge = (index: number, value: JsonRecord) => {
    const next = [...challenges];
    next[index] = value;
    updateList(config, 'challenges', next, onChange);
  };

  return (
    <div className="activity-editor-stack">
      <ActivityPresetPicker
        label="Stage challenge format"
        value={typeof config.preset === 'string' ? config.preset : 'beatTheClock'}
        templates={STAGE_PRESETS}
        onPresetChange={preset => onChange({ ...config, preset: preset.id, presetLabel: preset.label.toUpperCase() })}
        onApply={preset => onChange({ ...config, ...preset.config })}
      />
      <label>Title<input value={stringOf(config.title)} onChange={event => onChange({ ...config, title: event.target.value })} /></label>
      <label className="checkbox-row">
        <input type="checkbox" checked={config.audienceVoting === true} onChange={event => onChange({ ...config, audienceVoting: event.target.checked })} />
        Let the audience call success or fail
      </label>
      {config.audienceVoting === true && (
        <label>
          Audience vote bonus
          <input
            type="number"
            min={0}
            max={1000}
            value={numberOf(config.audienceVotePoints, 25)}
            onChange={event => onChange({
              ...config,
              audienceVotePoints: Math.max(0, Math.min(1000, Number(event.target.value) || 0))
            })}
          />
          <small className="muted">Each participant who matches the host’s final ruling receives this many points.</small>
        </label>
      )}
      <p className="muted">These are host-led activities. Keep instructions short and let the host judge success or failure. Audience voting is optional and never replaces the host’s final ruling.</p>
      {challenges.map((challenge, index) => (
        <div className="activity-editor-card" key={stringOf(challenge.id, String(index))}>
          <div className="activity-editor-row">
            <strong>Challenge {index + 1}</strong>
            <input value={stringOf(challenge.title)} placeholder="Build a paper tower" onChange={event => updateChallenge(index, { ...challenge, title: event.target.value })} />
            <textarea value={stringOf(challenge.instructions)} placeholder="Challenge instructions" onChange={event => updateChallenge(index, { ...challenge, instructions: event.target.value })} />
          </div>
          <div className="activity-editor-row stage-editor-numbers">
            <label>Seconds<input type="number" min={5} max={3600} value={numberOf(challenge.seconds, 60)} onChange={event => updateChallenge(index, { ...challenge, seconds: Number(event.target.value) || 60 })} /></label>
            <label>Success points<input type="number" min={0} max={1000} value={numberOf(challenge.points, 100)} onChange={event => updateChallenge(index, { ...challenge, points: Number(event.target.value) || 0 })} /></label>
            <label>Fail points<input type="number" min={-1000} max={1000} value={numberOf(challenge.failPoints)} onChange={event => updateChallenge(index, { ...challenge, failPoints: Number(event.target.value) || 0 })} /></label>
          </div>
          <button type="button" className="button danger" disabled={challenges.length <= 1} onClick={() => updateList(config, 'challenges', challenges.filter((_, itemIndex) => itemIndex !== index), onChange)}>Remove challenge</button>
        </div>
      ))}
      <button type="button" className="button" onClick={() => updateList(config, 'challenges', [...challenges, { id: `challenge-${Date.now()}`, title: '', instructions: '', seconds: 60, points: 100, failPoints: 0 }], onChange)}>+ Add challenge</button>
    </div>
  );
};
