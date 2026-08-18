import React, { useState } from 'react';
import type { ActivityComponentProps, ActivityEditorProps } from '../../activityRegistry';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';
import { ActivityCountdown, ActivityRevealCurtain, useActivityCountdown } from '../../ActivityMotion';
import { ActivityLeaderboard } from '../../ActivityLeaderboard';
import { ActivityJoinBanner } from '../../ActivityJoin';

type JsonRecord = Record<string, unknown>;
const stateOf = (envelope: ActivityStateEnvelope) => (envelope.state || {}) as JsonRecord;
const configOf = (envelope: ActivityStateEnvelope) => (envelope.config || {}) as JsonRecord;
const listOf = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
const stringOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;
const phaseLabel = (value: unknown) => stringOf(value, 'lobby').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
const ADVENTURE_NODE_TYPES = [
  ['scene', 'Scene'],
  ['choice', 'Choice'],
  ['poll', 'Poll'],
  ['quiz', 'Quiz'],
  ['media', 'Media reveal'],
  ['random', 'Random fork'],
  ['score', 'Score effect'],
  ['inventory', 'Inventory item'],
  ['condition', 'Condition'],
  ['end', 'End'],
] as const;
const adventureNodeType = (round: JsonRecord) => stringOf(round.nodeType, 'choice').toLowerCase();

const PHYSICAL_PRESETS: Record<string, { label: string; title: string; instructions: string; choices: string[]; seconds: number; revealText: string; adventure?: boolean; rounds?: JsonRecord[] }> = {
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
  rockPaperScissors: { label: 'Rock Paper Scissors Royale', title: 'Rock Paper Scissors Royale', instructions: 'Pair up, play one round, and winners move toward the center.', choices: ['Rock', 'Paper', 'Scissors'], seconds: 20, revealText: 'Winners advance; reset for the next wave.' },
  animalRelay: { label: 'Animal Relay', title: 'Animal Relay', instructions: 'One player from each team completes the animal movement and tags the next teammate.', choices: ['Penguin waddle', 'Crab walk', 'Kangaroo hops'], seconds: 60, revealText: 'Award the team that completed the relay first.' },
  silentLineUp: { label: 'Silent Line-Up', title: 'Silent Line-Up', instructions: 'Line up by the host’s category without speaking or using phones.', choices: ['Shortest to tallest', 'Oldest to youngest', 'Earliest to latest'], seconds: 60, revealText: 'Check the line and celebrate the silent teamwork.' },
  adventure: { label: 'Adventure', title: 'Animal Adventure', instructions: 'Your animal team reaches a fork in the trail. Choose the next move.', choices: ['Follow the pawprints', 'Climb the lookout'], seconds: 30, revealText: 'The trail opens…', adventure: true, rounds: [{ id: 'node-1', title: 'The Moonlit Trail', instructions: 'Your animal team reaches a fork in the trail. Choose the next move.', choices: ['Follow the pawprints', 'Climb the lookout'], seconds: 30, revealText: 'The trail opens…', branches: { '0': 1, '1': 2 } }, { id: 'node-2', title: 'The Hidden Waterfall', instructions: 'The pawprints lead to a waterfall. What will the team do?', choices: ['Search behind the falls', 'Build a bridge'], seconds: 30, revealText: 'You discover a glowing animal badge.', branches: { '0': 3, '1': 3 } }, { id: 'node-3', title: 'The High Lookout', instructions: 'From the lookout, the team spots two routes across the valley.', choices: ['Call the flock', 'Take the sunny path'], seconds: 30, revealText: 'A friendly guide appears.', branches: { '0': 3, '1': 3 } }, { id: 'node-4', title: 'The Safari Celebration', instructions: 'You made it! Tell the room which animal helped your team most.', choices: [], seconds: 15, revealText: 'The adventure is complete. Give the winning team a roar!' }] }
};

const PhysicalShell: React.FC<{ title: string; kicker?: string; phase: unknown; children: React.ReactNode; joinCode?: unknown; joinUrl?: unknown; participantCount?: unknown }> = ({ title, kicker = '🧭 PHYSICAL ROOM', phase, children, joinCode, joinUrl, participantCount }) => (
  <div className="activity-stage interactive-game-stage physical-room-stage">
    <div className="activity-stage-content">
      <div className="activity-header">
        <div className="stage-kicker">{kicker} · {phaseLabel(phase)}</div>
        <h1 className="activity-title">{title}</h1>
      </div>
      <div className="physical-room-badge"><strong>NO PHONES REQUIRED</strong><span>{joinCode ? `${participantCount ?? 0} optional phone participants` : 'The host leads this round from the controller.'}</span></div>
      {/* Phones are optional here, so the join details stay secondary. */}
      <ActivityJoinBanner joinCode={joinCode} joinUrl={joinUrl} participantCount={participantCount} />
      {children}
    </div>
  </div>
);

export const PhysicalRoomDisplay: React.FC<ActivityComponentProps> = ({ envelope }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const isAdventure = config.adventure === true;
  const round = state.currentRound && typeof state.currentRound === 'object' ? state.currentRound as JsonRecord : null;
  const nodeType = adventureNodeType(round || {});
  const nodeTypeLabel = ADVENTURE_NODE_TYPES.find(([value]) => value === nodeType)?.[1] || 'Story node';
  const choices = listOf(round?.choices).map(choice => stringOf(choice.value, stringOf(choice.label, String(choice))));
  const fallbackChoices = Array.isArray(round?.choices) ? round?.choices.map(choice => stringOf(choice)) : [];
  const visibleChoices = choices.length ? choices : fallbackChoices;
  const remaining = useActivityCountdown({ durationMs: numberOf(state.timerDurationMs), startedAt: state.timerStartedAt, pausedAt: state.timerPausedAt, running: stringOf(state.challengeStatus) === 'running' });
  const duration = numberOf(state.timerDurationMs);
  const timerActive = stringOf(state.challengeStatus) === 'running' || stringOf(state.challengeStatus) === 'paused';
  const presentation = config.presentation && typeof config.presentation === 'object' ? config.presentation as JsonRecord : {};
  const revealPacing = stringOf(config.revealPacing, stringOf(presentation.revealPacing, 'dramatic'));
  const mediaUrl = stringOf(round?.mediaUrl, stringOf(round?.mediaId));
  const mediaIsVideo = /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl);
  return <PhysicalShell title={stringOf(config.title, envelope.name || 'Physical Room')} kicker={`🧭 ${stringOf(config.presetLabel, 'PHYSICAL ROOM')}`} phase={state.phase} joinCode={state.joinCode} joinUrl={state.joinUrl} participantCount={state.participantCount}>
    <section className={`physical-room-prompt ${isAdventure ? 'adventure-prompt' : ''} adventure-node-${nodeType}`}>
      <span className="interactive-round-label">{isAdventure ? `CHAPTER ${numberOf(state.currentRoundIndex, 0) + 1} OF ${numberOf(state.roundCount, 1)}` : `ROUND ${numberOf(state.currentRoundIndex, 0) + 1} OF ${numberOf(state.roundCount, 1)}`}</span>
      {isAdventure && <span className="adventure-node-type">{nodeTypeLabel}</span>}
      <h2>{stringOf(round?.title, 'Get ready')}</h2>
      <p>{stringOf(round?.instructions, 'Follow the host instructions and get into position.')}</p>
    </section>
    {mediaUrl && <div className="adventure-media-card">{mediaIsVideo ? <video src={mediaUrl} autoPlay muted loop playsInline /> : <img src={mediaUrl} alt={stringOf(round?.mediaCaption, stringOf(round?.title, 'Adventure media'))} />}<span>{stringOf(round?.mediaCaption)}</span></div>}
    {visibleChoices.length > 0 && <div className="physical-room-choice-grid" aria-label="Room choices">{visibleChoices.map((choice, index) => <div className={`physical-room-choice physical-room-choice-${index % 6}`} key={`${choice}-${index}`}><span>{index + 1}</span><strong>{choice}</strong></div>)}</div>}
    {timerActive && <ActivityCountdown remainingMs={remaining} durationMs={duration} label={stringOf(state.challengeStatus) === 'paused' ? 'PAUSED' : 'TIME LEFT'} />}
    {isAdventure && state.phase === 'acceptingResponses' && <div className="adventure-choice-callout">Choose a path on your phone—or let the host make the story call.</div>}
    {isAdventure && stringOf(state.adventureLastChoice) && <div className="adventure-last-choice"><span>THE ROOM CHOSE</span><strong>{stringOf(state.adventureLastChoice)}</strong></div>}
    {isAdventure && stringOf(state.adventureEffectText) && <div className="adventure-effect-card"><span>STORY EFFECT</span><strong>{stringOf(state.adventureEffectText)}</strong></div>}
    <ActivityRevealCurtain visible={state.revealed === true} pacing={revealPacing} title="Show your choice and explain it.">{stringOf(round?.revealText, 'Show your choice and explain it.')}</ActivityRevealCurtain>
    <ActivityLeaderboard state={state} mode="teams" showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />
    {state.phase === 'lobby' && <div className="interactive-help">The host will start the room when everyone is ready.</div>}
  </PhysicalShell>;
};

export const PhysicalRoomController: React.FC<ActivityComponentProps> = ({ envelope, onCommandSent, hostView }) => {
  const state = stateOf(envelope);
  const config = configOf(envelope);
  const rounds = listOf(config.rounds);
  const currentRound = rounds[numberOf(state.currentRoundIndex, 0)] || rounds[0] || {};
  const adventure = config.adventure === true;
  const nodeType = adventureNodeType(currentRound);
  const adventureChoices = Array.isArray(currentRound.choices) ? currentRound.choices.map(choice => stringOf(choice)) : [];
  const [busy, setBusy] = useState(false);
  const [awardPoints, setAwardPoints] = useState(100);
  const send = async (action: string, payload?: JsonRecord) => {
    setBusy(true);
    try { await ActivityApi.executeCommand(envelope.runId, { action, payload }); onCommandSent?.(); }
    catch (error) { console.debug('Physical Room command was rejected; the host notice contains the reason.', error); }
    finally { setBusy(false); }
  };
  const phase = stringOf(state.phase, 'lobby');
  const status = stringOf(state.challengeStatus, 'ready');
  const hasTimer = Boolean(numberOf(state.timerDurationMs));
  const canStart = phase === 'lobby';
  const canStartTimer = phase === 'roundIntro';
  const canOpenChoices = adventure && phase === 'roundIntro' && adventureChoices.length > 0 && nodeType !== 'end';
  const canResolveNode = adventure && phase === 'roundIntro' && (adventureChoices.length === 0 || ['scene', 'score', 'inventory', 'condition', 'media', 'end'].includes(nodeType));
  const canResolveChoices = adventure && phase === 'acceptingResponses' && adventureChoices.length > 0;
  const canPause = phase === 'acceptingResponses' && status === 'running';
  const canResume = phase === 'acceptingResponses' && status === 'paused';
  const canReset = ['roundIntro', 'acceptingResponses', 'reveal', 'leaderboard'].includes(phase);
  const canRandomize = phase === 'roundIntro';
  const canReveal = phase === 'acceptingResponses' && (status === 'running' || status === 'paused');
  const canShowLeaderboard = phase === 'reveal';
  const canAdvance = phase === 'reveal' || phase === 'leaderboard';
  const canGoBack = phase !== 'lobby' && phase !== 'complete' && numberOf(state.currentRoundIndex, 0) > 0;
  const canEnd = phase !== 'lobby' && phase !== 'finalResults' && phase !== 'complete';
  return <div className="act-ctrl-container interactive-host-controller physical-room-controller">
    <div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">PHYSICAL ROOM CONTROL</span><strong>{phaseLabel(state.phase)}</strong><small>Everything needed is on the TV and in the room. Phones remain optional.</small></div><span className="controller-score">{numberOf(state.currentRoundIndex, 0) + 1}<small> round</small></span></div>
    <div className="act-controller-button-row">
      {canStart && <button type="button" className="act-btn act-btn-primary" disabled={busy} onClick={() => void send('start')}>Start room</button>}
      {canGoBack && <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('previous')}>Previous</button>}
      {canAdvance && <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('next')}>Next</button>}
      {canResolveNode && <button type="button" className="act-btn act-btn-primary" disabled={busy} onClick={() => void send('resolvenode')}>Resolve {nodeType === 'end' ? 'ending' : 'story node'}</button>}
      {canOpenChoices && <button type="button" className="act-btn act-btn-primary" disabled={busy} onClick={() => void send('openchoices')}>Open story choices</button>}
      {canStartTimer && !adventure && <button type="button" className="act-btn act-btn-primary" disabled={busy} onClick={() => void send('starttimer')}>Start timer</button>}
      {canPause && <button type="button" className="act-btn act-btn-secondary" disabled={busy || !hasTimer} onClick={() => void send('pausetimer')}>Pause</button>}
      {canResume && <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('resumetimer')}>Resume</button>}
      {canReset && <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('reset')}>Reset</button>}
      {canRandomize && <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('randomize')}>Randomize</button>}
      {canReveal && <button type="button" className="act-btn act-btn-gold" disabled={busy} onClick={() => void send('reveal')}>Reveal</button>}
      {canResolveChoices && adventureChoices.map((choice, index) => <button type="button" className="act-btn act-btn-gold" disabled={busy} key={`${choice}-${index}`} onClick={() => void send('resolvechoice', { choiceIndex: index })}>Choose {index + 1}: {choice}</button>)}
      {canShowLeaderboard && <button type="button" className="act-btn act-btn-secondary" disabled={busy} onClick={() => void send('showleaderboard')}>Show leaderboard</button>}
      {canEnd && <button type="button" className="act-btn act-btn-danger" disabled={busy} onClick={() => void send('finish')}>End room</button>}
    </div>
    {hostView?.teams?.length ? <div className="act-ctrl-card physical-room-awards"><div><strong>Award a team</strong><span>Credit the room challenge without opening the full score panel.</span></div><label>Points<input type="number" min={-1000} max={1000} step={25} value={awardPoints} onChange={event => setAwardPoints(Number(event.target.value) || 0)} /></label><div className="act-controller-button-row">{hostView.teams.filter(team => team.active).map(team => <button type="button" className="act-btn act-btn-gold" key={team.id} disabled={busy} onClick={() => void send('awardpoints', { teamId: team.id, amount: awardPoints, reason: 'Physical room challenge' })}>+{awardPoints} · {team.name}</button>)}</div></div> : null}
    <div className="act-ctrl-card physical-room-controller-status"><strong>{status.toUpperCase()}</strong><span>{hostView?.teams?.length ? 'Use the quick award buttons above or the full session panel for score adjustments.' : 'Create teams in the session panel when the room needs team scoring.'}</span></div>
  </div>;
};

export const PhysicalRoomEditor: React.FC<ActivityEditorProps> = ({ config, onChange }) => {
  const selectedPreset = stringOf(config.preset, 'fourCorners');
  const rounds = listOf(config.rounds);
  const adventure = config.adventure === true;
  const updateRounds = (next: JsonRecord[]) => onChange({ ...config, rounds: next });
  const nodeId = (round: JsonRecord, index: number) => stringOf(round.id, `node-${index + 1}`);
  const branchTarget = (round: JsonRecord, choiceIndex: number, index: number) => {
    const branches = round.branches && typeof round.branches === 'object' ? round.branches as JsonRecord : {};
    const rawTarget = branches[String(choiceIndex)];
    if (typeof rawTarget === 'number') return nodeId(rounds[rawTarget] || {}, rawTarget);
    if (typeof rawTarget === 'string' && rawTarget.trim()) return rawTarget;
    return rounds[index + 1] ? nodeId(rounds[index + 1], index + 1) : '__end__';
  };
  const renameNode = (index: number, value: string) => {
    const currentId = nodeId(rounds[index], index);
    const nextId = value.trim() || `node-${index + 1}`;
    const next = rounds.map((round, roundIndex) => {
      const updated: JsonRecord = { ...round, ...(roundIndex === index ? { id: nextId } : {}) };
      const branches = updated.branches && typeof updated.branches === 'object' ? { ...(updated.branches as JsonRecord) } : null;
      if (branches) {
        Object.keys(branches).forEach(key => { if (branches[key] === currentId) branches[key] = nextId; });
        updated.branches = branches;
      }
      for (const key of ['trueTarget', 'falseTarget', 'next', 'nextTarget']) if (updated[key] === currentId) updated[key] = nextId;
      if (Array.isArray(updated.randomTargets)) updated.randomTargets = updated.randomTargets.map(target => target === currentId ? nextId : target);
      return updated;
    });
    updateRounds(next);
  };
  const setBranchTarget = (roundIndex: number, choiceIndex: number, target: string) => {
    const round = rounds[roundIndex];
    if (!round) return;
    const branches = round.branches && typeof round.branches === 'object' ? { ...(round.branches as JsonRecord) } : {};
    branches[String(choiceIndex)] = target || '__end__';
    const next = [...rounds];
    next[roundIndex] = { ...round, branches };
    updateRounds(next);
  };
  const targetValue = (round: JsonRecord, key: string, index: number) => {
    const rawTarget = round[key];
    if (typeof rawTarget === 'number') return nodeId(rounds[rawTarget] || {}, rawTarget);
    if (typeof rawTarget === 'string' && rawTarget.trim()) return rawTarget;
    return rounds[index + 1] ? nodeId(rounds[index + 1], index + 1) : '__end__';
  };
  const setNodeTarget = (roundIndex: number, key: string, target: string) => {
    const round = rounds[roundIndex];
    if (!round) return;
    const next = [...rounds];
    next[roundIndex] = { ...round, [key]: target || '__end__' };
    updateRounds(next);
  };
  const setNodeType = (roundIndex: number, value: string) => {
    const round = rounds[roundIndex];
    if (!round) return;
    const existingChoices = Array.isArray(round.choices) ? round.choices.map(choice => stringOf(choice)) : [];
    const nextRound: JsonRecord = { ...round, nodeType: value };
    if (value === 'end' || ['scene', 'score', 'inventory', 'condition'].includes(value)) nextRound.choices = [];
    if (['choice', 'poll', 'quiz', 'random'].includes(value)) nextRound.choices = existingChoices.length >= 2 ? existingChoices : [...existingChoices, 'Path A', 'Path B'].slice(0, 2);
    if (value === 'quiz' && typeof nextRound.correctIndex !== 'number') nextRound.correctIndex = 0;
    if (value === 'score') { if (typeof nextRound.scoreDelta !== 'number') nextRound.scoreDelta = 100; if (!nextRound.scoreTarget) nextRound.scoreTarget = 'team'; }
    if (value === 'inventory') { if (!nextRound.inventoryKey) nextRound.inventoryKey = 'trailBadge'; if (!nextRound.inventoryValue) nextRound.inventoryValue = 'glowing badge'; }
    if (value === 'condition') { if (!nextRound.conditionKey) nextRound.conditionKey = 'trailBadge'; if (typeof nextRound.conditionEquals !== 'string') nextRound.conditionEquals = 'glowing badge'; }
    if (value === 'media') { if (typeof nextRound.mediaUrl !== 'string') nextRound.mediaUrl = ''; if (!nextRound.mediaCaption) nextRound.mediaCaption = 'Story evidence'; }
    const next = [...rounds];
    next[roundIndex] = nextRound;
    updateRounds(next);
  };
  const applyPreset = () => {
    const preset = PHYSICAL_PRESETS[selectedPreset] || PHYSICAL_PRESETS.fourCorners;
    onChange({
      ...config,
      preset: selectedPreset,
      presetLabel: preset.label.toUpperCase(),
      title: preset.title,
      adventure: preset.adventure === true,
      rounds: preset.rounds || [{ id: `round-${Date.now()}`, title: preset.title, instructions: preset.instructions, choices: preset.choices, seconds: preset.seconds, revealText: preset.revealText }]
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
    {adventure && <div className="activity-editor-card adventure-node-map"><div className="activity-editor-card-heading"><strong>Adventure story map</strong><span className="activity-library-chip">Editable nodes · server-validated branches</span></div><p className="muted">Each round is a story node. After a choice, choose the next node—or finish the adventure. Node IDs keep links intact when the story is edited.</p></div>}
    {rounds.map((round, index) => {
      const choices = Array.isArray(round.choices) ? round.choices.map(choice => stringOf(choice)) : [];
      const nodeType = adventureNodeType(round);
      const updateRound = (updated: JsonRecord) => { const next = [...rounds]; next[index] = updated; updateRounds(next); };
      const removeChoice = (choiceIndex: number) => {
        const branches = round.branches && typeof round.branches === 'object' ? round.branches as JsonRecord : {};
        const nextBranches: JsonRecord = {};
        Object.entries(branches).forEach(([key, value]) => {
          const numericKey = Number(key);
          if (!Number.isInteger(numericKey) || numericKey === choiceIndex) return;
          nextBranches[String(numericKey > choiceIndex ? numericKey - 1 : numericKey)] = value;
        });
        updateRound({ ...round, choices: choices.filter((_, itemIndex) => itemIndex !== choiceIndex), ...(adventure ? { branches: nextBranches } : {}) });
      };
      return <div className="activity-editor-card physical-room-editor-card" key={stringOf(round.id, String(index))}>
        <div className="activity-editor-row"><strong>Round {index + 1}</strong><input value={stringOf(round.title)} placeholder="Four Corners" onChange={event => updateRound({ ...round, title: event.target.value })} /><input type="number" min={5} max={3600} value={numberOf(round.seconds, 30)} aria-label={`Round ${index + 1} seconds`} onChange={event => updateRound({ ...round, seconds: Number(event.target.value) || 30 })} /></div>
        <textarea value={stringOf(round.instructions)} placeholder="Choose a corner of the room." onChange={event => updateRound({ ...round, instructions: event.target.value })} />
        {adventure && <div className="adventure-node-editor">
          <div className="adventure-node-fields">
            <label>Node type<select aria-label={`Round ${index + 1} node type`} value={nodeType} onChange={event => setNodeType(index, event.target.value)}>{ADVENTURE_NODE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Node ID<input value={nodeId(round, index)} onChange={event => renameNode(index, event.target.value)} placeholder={`node-${index + 1}`} /></label>
          </div>
          {nodeType === 'media' && <div className="adventure-node-fields"><label>Media URL or asset path<input aria-label={`Round ${index + 1} media URL`} value={stringOf(round.mediaUrl)} placeholder="/media/safari-clue.jpg" onChange={event => updateRound({ ...round, mediaUrl: event.target.value })} /></label><label>Media caption<input value={stringOf(round.mediaCaption)} placeholder="A clue from the trail" onChange={event => updateRound({ ...round, mediaCaption: event.target.value })} /></label></div>}
          {nodeType === 'quiz' && <label>Correct choice number<input type="number" min={1} max={12} value={numberOf(round.correctIndex, 0) + 1} onChange={event => updateRound({ ...round, correctIndex: Math.max(0, Number(event.target.value) - 1) })} /></label>}
          {nodeType === 'score' && <div className="adventure-node-fields"><label>Score effect<input type="number" min={-10000} max={10000} value={numberOf(round.scoreDelta, 100)} onChange={event => updateRound({ ...round, scoreDelta: Number(event.target.value) || 0 })} /></label><label>Apply to<select value={stringOf(round.scoreTarget, 'team')} onChange={event => updateRound({ ...round, scoreTarget: event.target.value })}><option value="team">Current team</option><option value="allTeams">All teams</option><option value="participant">Selected participant</option><option value="none">Reveal only</option></select></label></div>}
          {nodeType === 'inventory' && <div className="adventure-node-fields"><label>Item key<input value={stringOf(round.inventoryKey)} placeholder="trailBadge" onChange={event => updateRound({ ...round, inventoryKey: event.target.value })} /></label><label>Item value<input value={stringOf(round.inventoryValue)} placeholder="glowing badge" onChange={event => updateRound({ ...round, inventoryValue: event.target.value })} /></label></div>}
          {nodeType === 'condition' && <div className="adventure-condition-editor"><div className="adventure-node-fields"><label>Check item key<input value={stringOf(round.conditionKey)} placeholder="trailBadge" onChange={event => updateRound({ ...round, conditionKey: event.target.value })} /></label><label>Expected value<input value={stringOf(round.conditionEquals)} placeholder="glowing badge" onChange={event => updateRound({ ...round, conditionEquals: event.target.value })} /></label></div><div className="adventure-branch-row"><span className="adventure-branch-choice">If the condition is true</span><select aria-label={`Round ${index + 1} true destination`} value={targetValue(round, 'trueTarget', index)} onChange={event => setNodeTarget(index, 'trueTarget', event.target.value)}>{rounds.map((targetRound, targetIndex) => <option key={nodeId(targetRound, targetIndex)} value={nodeId(targetRound, targetIndex)}>{targetIndex + 1}. {stringOf(targetRound.title, nodeId(targetRound, targetIndex))}</option>)}<option value="__end__">🏁 Finish adventure</option></select></div><div className="adventure-branch-row"><span className="adventure-branch-choice">If the condition is false</span><select aria-label={`Round ${index + 1} false destination`} value={targetValue(round, 'falseTarget', index)} onChange={event => setNodeTarget(index, 'falseTarget', event.target.value)}>{rounds.map((targetRound, targetIndex) => <option key={nodeId(targetRound, targetIndex)} value={nodeId(targetRound, targetIndex)}>{targetIndex + 1}. {stringOf(targetRound.title, nodeId(targetRound, targetIndex))}</option>)}<option value="__end__">🏁 Finish adventure</option></select></div></div>}
          {['scene', 'score', 'inventory', 'media'].includes(nodeType) && <div className="adventure-branch-row"><span className="adventure-branch-choice">Next node</span><select aria-label={`Round ${index + 1} next destination`} value={targetValue(round, 'nextTarget', index)} onChange={event => setNodeTarget(index, 'nextTarget', event.target.value)}>{rounds.map((targetRound, targetIndex) => <option key={nodeId(targetRound, targetIndex)} value={nodeId(targetRound, targetIndex)}>{targetIndex + 1}. {stringOf(targetRound.title, nodeId(targetRound, targetIndex))}</option>)}<option value="__end__">🏁 Finish adventure</option></select></div>}
          {choices.length > 0 ? <div className="adventure-branch-editor"><div className="activity-editor-card-heading"><strong>Story branches</strong><small className="muted">Where each choice leads</small></div>{choices.map((choice, choiceIndex) => <div className="adventure-branch-row" key={`${choiceIndex}-${choice}`}><span className="adventure-branch-choice">{choice || `Choice ${choiceIndex + 1}`}</span><select aria-label={`Round ${index + 1} choice ${choiceIndex + 1} destination`} value={branchTarget(round, choiceIndex, index)} onChange={event => setBranchTarget(index, choiceIndex, event.target.value)}>{rounds.map((targetRound, targetIndex) => <option key={nodeId(targetRound, targetIndex)} value={nodeId(targetRound, targetIndex)}>{targetIndex + 1}. {stringOf(targetRound.title, nodeId(targetRound, targetIndex))}</option>)}<option value="__end__">🏁 Finish adventure</option></select></div>)}</div> : <small className="muted">{nodeType === 'end' ? 'This is the finish line.' : 'This node has no phone choices. The host resolves it from the controller.'}</small>}
        </div>}
        <div className="physical-room-choice-editor"><div className="activity-editor-card-heading"><strong>Room choices ({choices.length})</strong><button type="button" className="button" onClick={() => updateRound({ ...round, choices: [...choices, `Choice ${choices.length + 1}`] })} disabled={choices.length >= 12}>+ Add choice</button></div>{choices.map((choice, choiceIndex) => <div className="activity-editor-row" key={`${choiceIndex}-${choice}`}><input value={choice} aria-label={`Round ${index + 1} choice ${choiceIndex + 1}`} placeholder={`Choice ${choiceIndex + 1}`} onChange={event => updateRound({ ...round, choices: choices.map((item, itemIndex) => itemIndex === choiceIndex ? event.target.value : item) })} /><button type="button" className="button danger" onClick={() => removeChoice(choiceIndex)} aria-label={`Remove round ${index + 1} choice ${choiceIndex + 1}`}>Remove</button></div>)}{choices.length === 0 && <small className="muted">No choices yet. This round can still be used for host-led instructions.</small>}</div>
        <input value={stringOf(round.revealText)} placeholder="Show your choice and explain it." onChange={event => updateRound({ ...round, revealText: event.target.value })} />
        <button type="button" className="button danger" disabled={rounds.length <= 1} onClick={() => updateRounds(rounds.filter((_, itemIndex) => itemIndex !== index))}>Remove round</button>
      </div>;
    })}
    <button type="button" className="button" onClick={() => updateRounds([...rounds, { id: adventure ? `node-${rounds.length + 1}` : `round-${Date.now()}`, nodeType: adventure ? 'choice' : undefined, title: adventure ? `Story node ${rounds.length + 1}` : `Round ${rounds.length + 1}`, instructions: '', choices: adventure ? ['Path A', 'Path B'] : [], branches: adventure ? { '0': '__end__', '1': '__end__' } : undefined, seconds: 30, revealText: '' }])}>{adventure ? '+ Add story node' : '+ Add round'}</button>
  </div>;
};
