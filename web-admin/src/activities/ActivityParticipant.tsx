import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityParticipantView, ActivitySessionPublicView, ActivityStateEnvelope } from './types';
import { ActivityApi, activityHub } from './api';
import { ApiError } from '../admin/api';
import { createRefreshLoop } from './refreshLoop';
import { DrawingInput } from './DrawingInput';
import { DrawingPreview } from './DrawingPreview';
import { ActivityCountdown, useActivityCountdown, useDeadlineCountdown } from './ActivityMotion';
import { GameAudioProvider, GameButton, idleWobbleStyle, useGamePanic } from './ActivityJuice';
import { activityThemeVariables, resolveActivityTheme } from './activityPalettes';
import { ACTIVITY_AVATARS, ACTIVITY_COLORS, DEFAULT_ACTIVITY_AVATAR, DEFAULT_ACTIVITY_COLOR, inkOnPlayerColor } from './activityIdentity';
import { ActivityPlayerResult, readPersonalResult } from './ActivityPlayerResult';
import { isAudioMuted, setAudioMuted } from './effects';
import { primeGameAudio, resolveGameAudioChain } from './audio/gameAudio';
import { useAudioPreloader } from './audio/useAudioPreloader';
import './activity.css';

type JsonRecord = Record<string, unknown>;
const objectOf = (value: unknown) => value && typeof value === 'object' ? value as JsonRecord : {};
const listOf = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
const textOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;
const participantTokenKey = (code: string) => `lessoncue:activity-participant:${code.toUpperCase()}`;
const randomFrom = <T,>(options: readonly T[], fallback: T): T => options.length
  ? options[Math.floor(Math.random() * options.length)]
  : fallback;
const muteKey = 'lessoncue:activity-participant-muted';

/**
 * Per-device sound switch.
 *
 * A phone plays a cue on every tap, and a classroom full of them is the
 * loudest part of the room. Hardware volume works but is a blunt instrument
 * mid-lesson, so the choice is remembered here per device.
 */
const MuteToggle: React.FC = () => {
  const [muted, setMuted] = useState(() => {
    try {
      const stored = localStorage.getItem(muteKey);
      if (stored !== null) return stored === 'true';
    } catch { /* private browsing */ }
    return isAudioMuted();
  });

  useEffect(() => {
    setAudioMuted(muted);
    try { localStorage.setItem(muteKey, String(muted)); } catch { /* private browsing */ }
  }, [muted]);

  return <GameButton
    type="button"
    className="participant-mute-button"
    silent
    aria-pressed={muted}
    aria-label={muted ? 'Turn game sound on' : 'Turn game sound off'}
    onClick={() => setMuted(current => !current)}
  >{muted ? '🔇' : '🔊'}</GameButton>;
};

export const ActivityParticipantApp: React.FC = () => {
  const code = location.pathname.split('/')[2]?.trim().toUpperCase() || '';
  const [publicSession, setPublicSession] = useState<ActivitySessionPublicView | null>(null);
  const [participant, setParticipant] = useState<ActivityParticipantView | null>(null);
  const [name, setName] = useState('');
  const [token, setToken] = useState(() => { try { return localStorage.getItem(participantTokenKey(code)) || ''; } catch { return ''; } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingJoinToken = useRef('');
  // Seed a look per device rather than sending the same default from every
  // phone, which made a whole room join in the same colour.
  const [avatar, setAvatar] = useState<string>(() => randomFrom(ACTIVITY_AVATARS, DEFAULT_ACTIVITY_AVATAR));
  const [color, setColor] = useState<string>(() => randomFrom(ACTIVITY_COLORS, DEFAULT_ACTIVITY_COLOR));

  // Warm this game's sound pack as soon as the lobby resolves, so the first
  // tap of the first round plays with no load latency. A game with no asset
  // folder simply resolves to the bundled synthesized cues.
  const audioChain = resolveGameAudioChain(participant?.state || publicSession?.state);
  useAudioPreloader(audioChain, Boolean(publicSession));

  const refreshLoop = useRef<ReturnType<typeof createRefreshLoop> | null>(null);
  const refresh = useCallback(async () => { await refreshLoop.current?.refresh(); }, []);

  useEffect(() => {
    const runId = participant?.state.runId || publicSession?.state.runId;
    const loop = createRefreshLoop(async signal => {
      try {
        let activeRunId = runId;
        if (!activeRunId || !token) {
          const session = await ActivityApi.getPublicSession(code, signal);
          if (signal.aborted) return;
          setPublicSession(session);
          activeRunId = session.state.runId;
        }
        if (token && activeRunId) {
          const current = await ActivityApi.getParticipantState(activeRunId, token, signal);
          if (signal.aborted) return;
          setParticipant(previous => previous?.state.runId === current.state.runId
            && previous.state.revision > current.state.revision ? previous : current);
          setName(current.displayName);
          if (current.avatar) setAvatar(current.avatar);
          if (current.color) setColor(current.color);
        }
        if (!signal.aborted) setError('');
      } catch (cause) {
        if (signal.aborted) return;
        if (token && cause instanceof ApiError && cause.status === 404) {
          setParticipant(null);
          setToken('');
          try { localStorage.removeItem(participantTokenKey(code)); } catch { /* private browsing */ }
        }
        setError((cause as Error).message || 'The game connection is waiting to recover.');
      } finally { if (!signal.aborted) setLoading(false); }
    }, () => document.hidden ? 15000 : 5000);
    refreshLoop.current = loop;
    void loop.refresh();
    let pushTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = runId && token ? activityHub.subscribeRun(runId, () => {
      // A room joining/answering together produces a burst of pushes. Fetch
      // private state once for that burst, never one overlapping GET per player.
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => { void loop.refresh(); }, 250);
    }) : undefined;
    const wake = () => { if (!document.hidden) void loop.refresh(); };
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      loop.stop();
      clearTimeout(pushTimer);
      unsubscribe?.();
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [code, token, participant?.state.runId, publicSession?.state.runId]);
  const join = async (event: FormEvent) => {
    event.preventDefault();
    // The join tap is the gesture browsers require before audio may start.
    primeGameAudio();
    setBusy(true); setError('');
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 10000);
    try {
      // Keep the same identity if the server accepts a join but its reply is
      // lost. getRandomValues also works on the local HTTP phone address.
      const joiningToken = token || pendingJoinToken.current || Array.from(crypto.getRandomValues(new Uint8Array(24)), value => value.toString(16).padStart(2, '0')).join('');
      pendingJoinToken.current = joiningToken;
      try { localStorage.setItem(participantTokenKey(code), joiningToken); } catch { /* private browsing */ }
      const result = await ActivityApi.joinSession(code, joiningToken, name.trim() || undefined, { avatar, color }, request.signal);
      setToken(result.token); setParticipant(result.participant); setName(result.participant.displayName);
      try { localStorage.setItem(participantTokenKey(code), result.token); } catch { /* private browsing */ }
    } catch (cause) { setError(request.signal.aborted ? 'Joining timed out. Try again; your player will not be duplicated.' : (cause as Error).message || 'Could not join this game.'); }
    finally { clearTimeout(timeout); setBusy(false); }
  };

  /**
   * Change name or character without losing the session.
   *
   * Joining again with the same token updates that player rather than creating
   * one: identity is keyed to the lobby, so this keeps their score and their
   * place in the standings.
   */
  const updateIdentity = async (next: { displayName?: string; avatar?: string; color?: string }) => {
    if (!participant || busy) return;
    setBusy(true); setError('');
    try {
      const result = await ActivityApi.joinSession(
        code, token || undefined,
        next.displayName ?? participant.displayName,
        { avatar: next.avatar ?? avatar, color: next.color ?? color },
      );
      if (next.avatar) setAvatar(next.avatar);
      if (next.color) setColor(next.color);
      setParticipant(result.participant);
      setName(result.participant.displayName);
      await refresh();
    } catch (cause) { setError((cause as Error).message || 'That change could not be saved.'); }
    finally { setBusy(false); }
  };

  const action = async (name: string, payload?: JsonRecord) => {
    if (!participant || busy) return false;
    setBusy(true); setError('');
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 10000);
    try {
      await ActivityApi.participantAction(participant.state.runId, token, name, payload, request.signal);
      await refresh();
      return true;
    }
    catch (cause) {
      setError(request.signal.aborted ? 'The connection timed out. Your response is still here; try sending it again.' : (cause as Error).message || 'That response could not be sent.');
      return false;
    }
    finally { clearTimeout(timeout); setBusy(false); }
  };

  if (loading) return <main className="activity-participant-page"><div className="participant-card"><span className="participant-mark lc-idle-wobble" style={idleWobbleStyle('joining')}>⚡</span><h1>Joining the game…</h1></div></main>;
  if (error && !publicSession) return <main className="activity-participant-page"><div className="participant-card"><span className="participant-mark">⚠</span><h1>Game unavailable</h1><p>{error}</p></div></main>;
  if (!publicSession) return null;
  if (!participant) return <JoinCard title={textOf(publicSession.state.name, 'LessonCue Game')} code={code} name={name} setName={setName} onSubmit={join} busy={busy} error={error} envelope={publicSession.state} avatar={avatar} setAvatar={setAvatar} color={color} setColor={setColor} />;
  return <ParticipantGame view={participant} token={token} busy={busy} error={error} onAction={action} onUpdateIdentity={updateIdentity} onLeave={() => { refreshLoop.current?.stop(); pendingJoinToken.current = ''; setParticipant(null); setToken(''); setName(''); try { localStorage.removeItem(participantTokenKey(code)); } catch { /* ignore */ } }} />;
};

const JoinCard: React.FC<{ title: string; code: string; name: string; setName: (value: string) => void; onSubmit: (event: FormEvent) => void; busy: boolean; error: string; envelope: ActivityStateEnvelope; avatar: string; setAvatar: (value: string) => void; color: string; setColor: (value: string) => void }> = ({ title, code, name, setName, onSubmit, busy, error, envelope, avatar, setAvatar, color, setColor }) => (
  <main className="activity-participant-page" data-activity-type={envelope.type} style={activityThemeVariables(resolveActivityTheme(envelope.type, envelope.config?.preset, envelope.theme))}><div className="participant-card participant-join-card"><span className="participant-mark lc-idle-wobble" style={idleWobbleStyle(code || 'join')}>⚡</span><span className="participant-kicker">JOIN A LIVE ACTIVITY</span><h1>{title}</h1><div className="participant-code">{code}</div><p>Choose a display name if this game uses a scoreboard. You can play anonymously when the host allows it.</p><form onSubmit={onSubmit}><label>Display name <input autoFocus maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder="Optional name" /></label>
    <div className="participant-identity-picker">
      <span className="participant-identity-preview" style={{ background: color, color: inkOnPlayerColor(color) }} aria-hidden="true">{avatar}</span>
      <div className="participant-identity-choices" role="radiogroup" aria-label="Choose your character">
        {ACTIVITY_AVATARS.map(option => <GameButton key={option} type="button" className={`participant-avatar-swatch ${avatar === option ? 'selected' : ''}`} role="radio" aria-checked={avatar === option} aria-label={`Character ${option}`} onClick={() => setAvatar(option)}>{option}</GameButton>)}
      </div>
      <div className="participant-identity-choices" role="radiogroup" aria-label="Choose your colour">
        {ACTIVITY_COLORS.map(option => <GameButton key={option} type="button" className={`participant-color-swatch ${color === option ? 'selected' : ''}`} role="radio" aria-checked={color === option} aria-label={`Colour ${option}`} style={{ background: option }} onClick={() => setColor(option)} />)}
      </div>
    </div>{error && <div className="participant-error" role="alert">{error}</div>}<GameButton className="participant-primary-button" lockIn disabled={busy}>{busy ? 'Joining…' : 'Join game'}</GameButton></form><small>No LessonCue account required.</small><div className="participant-join-sound"><MuteToggle /></div></div></main>
);

const ParticipantGame: React.FC<{ view: ActivityParticipantView; token: string; busy: boolean; error: string; onAction: (action: string, payload?: JsonRecord) => Promise<boolean>; onUpdateIdentity: (next: { displayName?: string; avatar?: string; color?: string }) => void; onLeave: () => void }> = ({ view, busy, error, onAction, onUpdateIdentity, onLeave }) => {
  const envelope = view.state;
  const state = objectOf(envelope.state);
  const config = objectOf(envelope.config);
  const phase = textOf(state.phase, 'lobby');
  const title = textOf(config.title, envelope.name || 'LessonCue Activity');
  const [text, setText] = useState('');
  const questionIndex = numberOf(state.currentQuestionIndex, 0);
  const roundIndex = numberOf(state.currentRoundIndex, 0);
  const promptIndex = numberOf(state.currentPromptIndex, 0);
  const questions = listOf(config.questions);
  const rounds = listOf(config.rounds);
  const prompts = listOf(config.prompts);
  const question = questions[questionIndex] || questions[0] || rounds[roundIndex] || rounds[0] || prompts[promptIndex] || prompts[0] || {};
  const prompt = textOf(question.prompt, textOf(question.question, textOf(config.prompt, textOf(config.question, 'Make your choice.'))));
  const orderingItems = listOf(question.items);
  const orderingMode = envelope.type === 'ordering' ? textOf(state.interactionMode, textOf(state.orderingInteractionMode, textOf(config.interactionMode, 'ordering'))) : 'ordering';
  const matchingLeft = listOf(state.matchingLeft);
  const matchingRight = listOf(state.matchingRight);
  const groupingItems = listOf(state.groupingItems);
  const groupingGroups = listOf(state.groupingGroups);
  const physicalRound = objectOf(state.currentRound);
  const physicalChoices = Array.isArray(physicalRound.choices) ? physicalRound.choices.map(choice => choice && typeof choice === 'object' ? choice as JsonRecord : { value: choice }) : [];
  const rawOptions = Array.isArray(question.options) && question.options.length ? question.options : Array.isArray(config.options) ? config.options : [];
  const options = rawOptions.map(option => option && typeof option === 'object' ? option as JsonRecord : { value: option });
  const submissions = listOf(state.submissions);
  const creativeHeadToHead = envelope.type === 'punchline' && textOf(config.votingStyle, 'gallery') === 'headToHead';
  const creativeCurrentMatch = objectOf(state.creativeCurrentMatch);
  const creativeVoteOptions = creativeHeadToHead && textOf(creativeCurrentMatch.entrantAId)
    ? [
        { id: textOf(creativeCurrentMatch.entrantAId), text: textOf(creativeCurrentMatch.entrantA, 'Response A') },
        ...(textOf(creativeCurrentMatch.entrantBId) ? [{ id: textOf(creativeCurrentMatch.entrantBId), text: textOf(creativeCurrentMatch.entrantB, 'Response B') }] : [])
      ]
    : submissions;
  const bluffOptions = listOf(state.options);
  const bracketMatch = listOf(state.bracketMatches).find(match => textOf(match.id) === textOf(state.currentMatchId)) || objectOf(state.currentMatch);
  const bracketOptions = [
    { id: textOf(bracketMatch.entrantAId), label: textOf(bracketMatch.entrantA, 'Entrant A') },
    { id: textOf(bracketMatch.entrantBId), label: textOf(bracketMatch.entrantB, 'Entrant B') }
  ].filter(option => option.id).map(option => ({ value: option.label, entrantId: option.id }));
  const [selected, setSelected] = useState<string | null>(null);
  const quizModifiers = objectOf(config.modifiers);
  const quizWager = objectOf(quizModifiers.wager);
  const quizSpeedBonus = objectOf(quizModifiers.speedBonus);
  const quizLives = objectOf(quizModifiers.lives);
  const quizDoubleOrNothing = objectOf(quizModifiers.doubleOrNothing);
  const wagerEnabled = (envelope.type === 'trivia' || envelope.type === 'rapidFire') && quizWager.enabled === true;
  const doubleOrNothingEnabled = (envelope.type === 'trivia' || envelope.type === 'rapidFire') && quizDoubleOrNothing.enabled === true;
  const [wager, setWager] = useState('');
  const [doubleRisk, setDoubleRisk] = useState(false);
  const quizAnswerMode = envelope.type === 'trivia' ? textOf(question.answerMode, 'choice') : 'choice';
  const isChoice = ((envelope.type === 'trivia' || envelope.type === 'rapidFire') && quizAnswerMode === 'choice') || envelope.type === 'poll' || envelope.type === 'prediction';
  const isQuizFreeResponse = envelope.type === 'trivia' && (quizAnswerMode === 'text' || quizAnswerMode === 'shorttext' || quizAnswerMode === 'number');
  const matchAnswerMode = envelope.type === 'matchPlayer' ? textOf(question.answerMode, 'choice') : 'choice';
  const telephoneChain = envelope.type === 'drawing' && config.telephoneChain === true;
  const telephoneDescription = telephoneChain && textOf(state.telephoneStepKind, 'drawing') === 'description';
  const isTurnBasedWord = envelope.type === 'word' && config.turnBased === true;
  const engineTimerDurationMs = numberOf(state.timerDurationMs);
  const engineTimerRemainingMs = useActivityCountdown({ durationMs: engineTimerDurationMs, startedAt: state.timerStartedAt, pausedAt: state.timerPausedAt, running: state.timerRunning === true });
  const engineTimerRunning = state.timerRunning === true && engineTimerDurationMs > 0;
  // Most engines run no timer of their own; autonomy times them, publishing a
  // deadline instead. Without this the answer window the server is counting
  // down is invisible on the phone, and the last five seconds never land.
  const autoRemainingMs = useDeadlineCountdown(state.autoAdvanceAt);
  const autoTimerRunning = !engineTimerRunning && autoRemainingMs !== null;
  const timerRunning = engineTimerRunning || autoTimerRunning;
  const timerDurationMs = engineTimerRunning ? engineTimerDurationMs : numberOf(state.autoAdvanceMs);
  const responseTimerRemainingMs = engineTimerRunning ? engineTimerRemainingMs : (autoRemainingMs ?? 0);
  const audioChain = resolveGameAudioChain(envelope);
  // The phone wears the same colours as the stage, so a player glancing down
  // stays inside the same game rather than a generic form.
  const themeVariables = activityThemeVariables(resolveActivityTheme(envelope.type, config.preset, envelope.theme));
  // Only ever this player's own standing; the server keeps other scores out.
  const personalResult = readPersonalResult(state.you);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [draftName, setDraftName] = useState(view.displayName);
  // The server owns the clock. This only mirrors it into the shared
  // last-five-seconds presentation and its tick/alarm cues.
  const secondsRemaining = Math.max(0, Math.ceil(responseTimerRemainingMs / 1000));
  const panicking = useGamePanic({
    secondsRemaining,
    active: timerRunning && phase === 'acceptingResponses' && !view.hasSubmitted,
    chain: audioChain
  });
  const pollMode = textOf(config.pollMode);
  const choiceKicker = envelope.type !== 'poll' ? undefined : pollMode === 'minority' ? 'PREDICT THE MINORITY' : pollMode === 'majority' ? 'PREDICT THE MAJORITY' : pollMode === 'prediction' ? 'PREDICT THE ROOM' : 'CHOOSE ONE';
  const waitingForSurveyTeam = envelope.type === 'surveyBoard' && phase === 'acceptingResponses' && state.isActiveTeam === false;

  if (view.status === 'locked') return <GameAudioProvider chain={audioChain}><main className="activity-participant-page" data-activity-type={envelope.type} style={themeVariables}><div className="participant-game-shell"><header className="participant-game-header"><div><h1>{title}</h1></div><div className="participant-identity"><MuteToggle /><span className="participant-identity-badge" style={{ background: textOf(view.color, '#f6c531'), color: inkOnPlayerColor(textOf(view.color, '#f6c531')) }} aria-hidden="true">{textOf(view.avatar, '🙂')}</span><div><strong>{view.displayName}</strong><small>Locked out</small></div></div></header>{error && <div className="participant-error" role="alert">{error}</div>}<section className="participant-waiting participant-locked" role="alert"><span className="waiting-orb" style={idleWobbleStyle(view.participantId, 2)}>🔒</span><h2>Locked out</h2><p>The host locked this player out of the game. Ask the host to unlock you, or switch player.</p></section><GameButton className="participant-leave-button" onClick={onLeave}>Switch player</GameButton></div></main></GameAudioProvider>;

  const submitText = async (event: FormEvent) => { event.preventDefault(); if (text.trim() && await onAction('submit', { text: text.trim() })) setText(''); };
  const submitQuizResponse = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    if (quizAnswerMode === 'number') {
      const number = Number(text.trim());
      if (!Number.isFinite(number)) return;
      if (await onAction('answer', { number, ...quizModifierPayload() })) setText('');
    } else {
      if (await onAction('answer', { text: text.trim(), ...quizModifierPayload() })) setText('');
    }
  };
  const quizModifierPayload = () => ({
    ...(wagerEnabled ? { wager: Math.max(0, Math.round(Number(wager) || 0)) } : {}),
    ...(doubleOrNothingEnabled ? { doubleOrNothing: doubleRisk } : {})
  });
  const quizModifierControls = (wagerEnabled || doubleOrNothingEnabled || quizSpeedBonus.enabled === true || quizLives.enabled === true)
    ? <QuizModifierControls wagerEnabled={wagerEnabled} wager={wager} setWager={setWager} maxWager={numberOf(quizWager.maxPoints, 500)} doubleOrNothingEnabled={doubleOrNothingEnabled} doubleRisk={doubleRisk} setDoubleRisk={setDoubleRisk} speedBonusEnabled={quizSpeedBonus.enabled === true} livesEnabled={quizLives.enabled === true} />
    : undefined;
  const sendChoice = (index: number) => { setSelected(String(index)); onAction(envelope.type === 'trivia' || envelope.type === 'rapidFire' ? 'answer' : envelope.type === 'poll' && pollMode ? 'predict' : 'vote', { optionIndex: index, ...((envelope.type === 'trivia' || envelope.type === 'rapidFire') ? quizModifierPayload() : {}) }); };
  const sendMatchChoice = (index: number) => { setSelected(String(index)); onAction(state.isTarget === true ? 'answer' : 'predict', { optionIndex: index }); };
  const sendMatchText = async (event: FormEvent) => { event.preventDefault(); if (text.trim() && await onAction(state.isTarget === true ? 'answer' : 'predict', { text: text.trim() })) setText(''); };
  const sendBracketChoice = (index: number) => { const entrantId = textOf(bracketOptions[index]?.entrantId); setSelected(entrantId); onAction('vote', { entrantId }); };
  const sendStageVote = (index: number) => { const outcome = index === 0 ? 'success' : 'fail'; setSelected(outcome); onAction('vote', { outcome }); };
  const submitVote = (id: string) => onAction('vote', { targetId: id });
  const sendMatches = (matches: Array<{ leftId: string; rightId: string }>) => onAction('match', { matches });
  const sendGroups = (groups: Array<{ groupId: string; itemIds: string[] }>) => onAction('group', { groups });
  const sendAdventureChoice = (index: number) => { setSelected(String(index)); onAction('choose', { choiceIndex: index }); };

  return <GameAudioProvider chain={audioChain}><main className="activity-participant-page" data-activity-type={envelope.type} data-activity-preset={textOf(config.preset) || undefined} data-activity-panic={panicking ? 'true' : 'false'} style={themeVariables}><div className="participant-game-shell"><header className="participant-game-header"><div><h1>{title}</h1></div><div className="participant-identity"><MuteToggle /><GameButton type="button" className="participant-identity-edit" silent aria-label="Change your name and character" onClick={() => setEditingIdentity(current => !current)}><span className="participant-identity-badge" style={{ background: textOf(view.color, '#f6c531'), color: inkOnPlayerColor(textOf(view.color, '#f6c531')) }} aria-hidden="true">{textOf(view.avatar, '🙂')}</span><div><strong>{view.displayName}</strong><small>{view.hasSubmitted ? 'Response saved' : phase.replace(/([a-z])([A-Z])/g, '$1 $2')}</small></div></GameButton></div></header>{error && <div className="participant-error" role="alert">{error}</div>}
    {editingIdentity && <section className="participant-input-card participant-identity-editor">
      <span className="participant-kicker">YOUR PLAYER</span>
      <label>Name <input maxLength={40} value={draftName} onChange={event => setDraftName(event.target.value)} /></label>
      <div className="participant-identity-choices" role="radiogroup" aria-label="Choose your character">
        {ACTIVITY_AVATARS.map(option => <GameButton key={option} type="button" className={`participant-avatar-swatch ${textOf(view.avatar) === option ? 'selected' : ''}`} role="radio" aria-checked={textOf(view.avatar) === option} aria-label={`Character ${option}`} disabled={busy} onClick={() => onUpdateIdentity({ avatar: option })}>{option}</GameButton>)}
      </div>
      <div className="participant-identity-choices" role="radiogroup" aria-label="Choose your colour">
        {ACTIVITY_COLORS.map(option => <GameButton key={option} type="button" className={`participant-color-swatch ${textOf(view.color) === option ? 'selected' : ''}`} role="radio" aria-checked={textOf(view.color) === option} aria-label={`Colour ${option}`} style={{ background: option }} disabled={busy} onClick={() => onUpdateIdentity({ color: option })} />)}
      </div>
      <GameButton className="participant-primary-button" lockIn disabled={busy || !draftName.trim()} onClick={() => { onUpdateIdentity({ displayName: draftName.trim() }); setEditingIdentity(false); }}>Save</GameButton>
      <small className="participant-saved-note">Your score and place in the standings stay with you.</small>
    </section>}
    {timerRunning && phase === 'acceptingResponses' && envelope.type !== 'word' && <ActivityCountdown remainingMs={responseTimerRemainingMs} durationMs={timerDurationMs} label="TIME LEFT" compact />}
    {telephoneChain && phase === 'acceptingResponses' && <aside className="participant-input-card telephone-source" aria-label="Passed to you">
      {telephoneDescription && Array.isArray(state.telephoneSourceStrokes) ? <DrawingPreview strokes={state.telephoneSourceStrokes} />
        : <p>{textOf(state.telephoneSourceText) || textOf(state.telephoneStepPhrase) || 'No response was passed along. Use the prompt below.'}</p>}
    </aside>}
    {phase === 'lobby' || phase === 'setup' ? <section className="participant-waiting"><span className="waiting-orb" style={idleWobbleStyle(view.participantId, 1)}>✦</span><h2>You’re in.</h2><p>Waiting for the host to start the game.</p><div className="participant-count">{numberOf(state.participantCount)} players joined</div></section> :
      phase === 'acceptingResponses' && isChoice ? <ChoiceInput kicker={choiceKicker} prompt={prompt} options={options} selected={selected === null ? null : Number(selected)} disabled={busy || view.hasSubmitted} onSelect={sendChoice} modifierControls={quizModifierControls} /> :
      phase === 'acceptingResponses' && isQuizFreeResponse ? <TextResponse prompt={prompt} text={text} setText={setText} submit={submitQuizResponse} disabled={busy || view.hasSubmitted} inputType={quizAnswerMode === 'number' ? 'number' : 'text'} kicker={quizAnswerMode === 'number' ? 'NUMBER LOCK-IN' : 'SHORT ANSWER'} placeholder={quizAnswerMode === 'number' ? 'Type a number…' : 'Type your answer…'} submitLabel="Lock in answer" modifierControls={quizModifierControls} /> :
      phase === 'acceptingResponses' && envelope.type === 'buzzer' ? <section className="participant-buzzer-card"><h2>{prompt}</h2><GameButton className="participant-buzzer" lockIn disabled={busy || Boolean(state.buzzWinnerName) || state.isLockedOut === true} onClick={() => onAction('buzz')}>{state.isLockedOut === true ? 'LOCKED OUT' : state.buzzWinnerName ? `${textOf(state.buzzWinnerName)} buzzed first` : 'BUZZ'}</GameButton>{state.isLockedOut === true && <small className="participant-saved-note">You can watch this clue, but you cannot buzz again.</small>}</section> :
      phase === 'acceptingResponses' && telephoneDescription ? <TextResponse prompt={textOf(state.telephoneStepPrompt, prompt)} text={text} setText={setText} submit={submitText} disabled={busy || view.hasSubmitted} kicker="DESCRIBE THE DRAWING" placeholder="Describe what you see…" submitLabel="Pass it on" /> :
      phase === 'acceptingResponses' && envelope.type === 'drawing' ? <DrawingInput key={`${envelope.runId}:${promptIndex}:${numberOf(state.telephoneStepIndex)}`} prompt={telephoneChain ? textOf(state.telephoneStepPrompt, prompt) : prompt} config={config} disabled={busy || view.hasSubmitted} saved={view.hasSubmitted} onSubmit={strokes => onAction('submit', { strokes })} /> :
      phase === 'acceptingResponses' && envelope.type === 'ordering' && orderingMode === 'matching' ? <MatchingInput prompt={prompt} leftItems={matchingLeft} rightItems={matchingRight} disabled={busy || view.hasSubmitted} onSubmit={sendMatches} /> :
      phase === 'acceptingResponses' && envelope.type === 'ordering' && orderingMode === 'grouping' ? <GroupingInput prompt={prompt} items={groupingItems} groups={groupingGroups} disabled={busy || view.hasSubmitted} onSubmit={sendGroups} /> :
      phase === 'acceptingResponses' && envelope.type === 'ordering' ? <OrderingInput prompt={prompt} items={orderingItems} disabled={busy || view.hasSubmitted} onSubmit={order => onAction('sort', { order })} /> :
      phase === 'acceptingResponses' && envelope.type === 'matchPlayer' && matchAnswerMode === 'text' ? <TextResponse prompt={prompt} text={text} setText={setText} submit={sendMatchText} disabled={busy || view.hasSubmitted} kicker={state.isTarget === true ? 'ANSWER PRIVATELY' : 'PREDICT THE TARGET'} placeholder={state.isTarget === true ? 'Type your answer…' : 'Predict their answer…'} submitLabel="Lock in answer" /> :
      phase === 'acceptingResponses' && envelope.type === 'matchPlayer' ? <ChoiceInput kicker={state.isTarget === true ? 'ANSWER PRIVATELY' : 'PREDICT THE TARGET'} prompt={prompt} options={options} selected={selected === null ? null : Number(selected)} disabled={busy || view.hasSubmitted} onSelect={sendMatchChoice} /> :
      phase === 'acceptingResponses' && envelope.type === 'physicalRoom' && config.adventure === true ? <ChoiceInput kicker="CHOOSE THE NEXT PATH" prompt={textOf(physicalRound.instructions, 'Which path should the story take?')} options={physicalChoices} selected={selected === null ? null : Number(selected)} disabled={busy || view.hasSubmitted} onSelect={sendAdventureChoice} /> :
      phase === 'acceptingResponses' && envelope.type === 'word' ? <WordInput prompt={prompt} text={text} setText={setText} submit={submitText} disabled={busy || view.hasSubmitted} waitingForTurn={isTurnBasedWord && state.isCurrentTurn !== true && state.isEliminated !== true} eliminated={isTurnBasedWord && state.isEliminated === true} turnParticipantName={textOf(state.turnParticipantName, 'another player')} timerRemainingMs={engineTimerRemainingMs} timerDurationMs={engineTimerDurationMs} timerRunning={engineTimerRunning} /> :
      phase === 'acceptingResponses' && waitingForSurveyTeam ? <section className="participant-waiting"><span className="waiting-orb" style={idleWobbleStyle('waiting', 2)}>⏳</span><h2>{state.stealOpen === true ? `${textOf(state.stealTeamName, 'The steal team')} is up` : `${textOf(state.currentTeamName, 'Another team')} is up`}</h2><p>Watch the board. Your team will get the next chance.</p></section> :
      phase === 'acceptingResponses' && (envelope.type === 'punchline' || envelope.type === 'fakeOut' || envelope.type === 'surveyBoard') ? <TextResponse prompt={prompt} text={text} setText={setText} submit={submitText} disabled={busy || view.hasSubmitted} /> :
      phase === 'voting' && envelope.type === 'bracket' ? <ChoiceInput kicker="VOTE TO ADVANCE" prompt="Which entrant should move forward?" options={bracketOptions} selected={bracketOptions.findIndex(option => option.entrantId === selected)} disabled={busy || view.hasSubmitted || bracketOptions.length < 2} onSelect={sendBracketChoice} /> :
      phase === 'voting' && envelope.type === 'stageChallenge' ? <ChoiceInput kicker="CALL THE CHALLENGE" prompt="Will the contestant succeed?" options={[{ value: 'Success' }, { value: 'Fail' }]} selected={selected === 'success' ? 0 : selected === 'fail' ? 1 : null} disabled={busy || view.hasSubmitted || state.audienceVotingOpen !== true} onSelect={sendStageVote} /> :
      phase === 'voting' && envelope.type === 'punchline' ? <VoteInput items={creativeVoteOptions} selected={selected} disabled={busy || view.hasSubmitted || creativeVoteOptions.length < 2} onSelect={id => { setSelected(id); submitVote(id); }} /> :
      phase === 'voting' && envelope.type === 'fakeOut' ? <VoteInput items={bluffOptions} selected={selected} disabled={busy || view.hasSubmitted} onSelect={id => { setSelected(id); submitVote(id); }} /> :
      phase === 'voting' && envelope.type === 'drawing' ? <section className="participant-input-card"><h2>Vote for a drawing</h2><div className="drawing-response-grid">{listOf(state.drawings).filter(drawing => drawing.isOwn !== true).map((drawing, index) => <GameButton key={textOf(drawing.id)} className="drawing-card" aria-label={`Vote for drawing ${index + 1}`} disabled={busy || view.hasSubmitted} onClick={() => submitVote(textOf(drawing.id))}><DrawingPreview strokes={drawing.strokes} /><span>Drawing {index + 1}</span></GameButton>)}</div>{view.hasSubmitted ? <small className="participant-saved-note">Your vote is locked in.</small> : <small>Choose another player's drawing.</small>}</section> :
      phase === 'judging' || phase === 'responsesLocked' ? <section className="participant-waiting"><span className="waiting-orb" style={idleWobbleStyle('waiting', 2)}>⏳</span><h2>Locked in.</h2><p>The host is reviewing the room.</p></section> :
      (phase === 'reveal' || phase === 'leaderboard' || phase === 'finalResults') && personalResult ? <ActivityPlayerResult result={personalResult} color={textOf(view.color, '#f6c531')} chain={audioChain} /> :
      phase === 'reveal' || phase === 'leaderboard' || phase === 'finalResults' ? <section className="participant-waiting"><span className="waiting-orb" style={idleWobbleStyle('reveal', 3)}>✨</span><h2>Reveal time.</h2><p>Look up at the main display.</p></section> : <section className="participant-waiting"><h2>Watch the stage.</h2><p>Your next input will appear here.</p></section>}
    <GameButton className="participant-leave-button" onClick={onLeave}>Not {view.displayName}? Switch player</GameButton></div></main></GameAudioProvider>;
};

const ChoiceInput: React.FC<{ kicker?: string; prompt: string; options: JsonRecord[]; selected: number | null; disabled: boolean; onSelect: (index: number) => void; modifierControls?: React.ReactNode }> = ({ kicker = 'CHOOSE ONE', prompt, options, selected, disabled, onSelect, modifierControls }) => <section className="participant-input-card"><span className="participant-kicker">{kicker}</span><h2>{prompt}</h2>{modifierControls}<div className="participant-choice-list">{options.map((option, index) => <GameButton key={index} className={selected === index ? 'selected' : ''} lockIn disabled={disabled} onClick={() => onSelect(index)}><span>{String.fromCharCode(65 + index)}</span>{textOf(option.value, textOf(option.label, textOf(option)))}</GameButton>)}</div>{disabled && <small className="participant-saved-note">Your answer is locked in.</small>}</section>;

const TextResponse: React.FC<{ prompt: string; text: string; setText: (value: string) => void; submit: (event: FormEvent) => void; disabled: boolean; inputType?: 'text' | 'number'; kicker?: string; placeholder?: string; submitLabel?: string; modifierControls?: React.ReactNode }> = ({ prompt, text, setText, submit, disabled, inputType = 'text', kicker = 'YOUR RESPONSE', placeholder = 'Type your answer…', submitLabel = 'Send response', modifierControls }) => <section className="participant-input-card"><span className="participant-kicker">{kicker}</span><h2>{prompt}</h2>{modifierControls}<form onSubmit={submit}>{inputType === 'number' ? <input className="participant-number-input" type="number" inputMode="decimal" step="any" value={text} onChange={event => setText(event.target.value)} placeholder={placeholder} disabled={disabled} /> : <textarea maxLength={1000} value={text} onChange={event => setText(event.target.value)} placeholder={placeholder} disabled={disabled} />}<GameButton className="participant-primary-button" lockIn disabled={disabled || !text.trim()}>{submitLabel}</GameButton></form>{disabled && <small className="participant-saved-note">Your response is locked in.</small>}</section>;

const QuizModifierControls: React.FC<{ wagerEnabled: boolean; wager: string; setWager: (value: string) => void; maxWager: number; doubleOrNothingEnabled: boolean; doubleRisk: boolean; setDoubleRisk: (value: boolean) => void; speedBonusEnabled: boolean; livesEnabled: boolean }> = ({ wagerEnabled, wager, setWager, maxWager, doubleOrNothingEnabled, doubleRisk, setDoubleRisk, speedBonusEnabled, livesEnabled }) => <div className="participant-quiz-modifiers" aria-label="Quiz options">
  {wagerEnabled && <label>Wager points<input type="number" min={0} max={maxWager} inputMode="numeric" value={wager} onChange={event => setWager(event.target.value)} placeholder={`0–${maxWager}`} /></label>}
  {doubleOrNothingEnabled && <label className="checkbox-row"><input type="checkbox" checked={doubleRisk} onChange={event => setDoubleRisk(event.target.checked)} /> Risk it for double points</label>}
  {speedBonusEnabled && <small>Fast correct answers earn a speed bonus.</small>}
  {livesEnabled && <small>Misses cost a life.</small>}
</div>;

/**
 * A stable key for a round's cards.
 *
 * These inputs used to re-seed their local state from an array prop, which is
 * rebuilt on every render, so every re-render silently threw away whatever the
 * player had arranged so far. It went unnoticed while these rounds had no
 * clock; once one ticked four times a second the work never survived at all.
 * Keying on the ids means the reset happens when the round actually changes.
 */
const cardKey = (...groups: JsonRecord[][]): string =>
  groups.map(items => items.map(item => textOf(item.id)).join('\u0000')).join('\u0001');

const OrderingInput: React.FC<{ prompt: string; items: JsonRecord[]; disabled: boolean; onSubmit: (order: string[]) => void }> = ({ prompt, items, disabled, onSubmit }) => {
  const [order, setOrder] = useState<string[]>(() => items.map(item => textOf(item.id)));
  const itemsKey = cardKey(items);
  useEffect(() => setOrder(itemsKey ? itemsKey.split('\u0000') : []), [itemsKey]);
  const move = (index: number, direction: -1 | 1) => setOrder(current => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const labels = new Map(items.map(item => [textOf(item.id), textOf(item.label, 'Item')]));
  return <section className="participant-input-card"><span className="participant-kicker">ORDER THE CARDS</span><h2>{prompt}</h2><div className="ordering-participant-list">{order.map((id, index) => <div className="ordering-participant-row" key={id}><b>{index + 1}</b><span>{labels.get(id) || id}</span><GameButton type="button" className="ordering-move-button" aria-label={`Move ${labels.get(id) || 'item'} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</GameButton><GameButton type="button" className="ordering-move-button" aria-label={`Move ${labels.get(id) || 'item'} down`} disabled={disabled || index === order.length - 1} onClick={() => move(index, 1)}>↓</GameButton></div>)}</div><GameButton type="button" className="participant-primary-button" lockIn disabled={disabled || !order.length} onClick={() => onSubmit(order)}>{disabled ? 'Order saved' : 'Lock in order'}</GameButton>{disabled && <small className="participant-saved-note">Your answer is locked in.</small>}</section>;
};

const MatchingInput: React.FC<{ prompt: string; leftItems: JsonRecord[]; rightItems: JsonRecord[]; disabled: boolean; onSubmit: (matches: Array<{ leftId: string; rightId: string }>) => void }> = ({ prompt, leftItems, rightItems, disabled, onSubmit }) => {
  const [matches, setMatches] = useState<Record<string, string>>({});
  const pairsKey = cardKey(leftItems, rightItems);
  useEffect(() => setMatches({}), [pairsKey]);
  const complete = leftItems.length > 0 && leftItems.every(item => textOf(matches[textOf(item.id)]));
  return <section className="participant-input-card matching-input-card"><span className="participant-kicker">MATCH THE PAIRS</span><h2>{prompt}</h2><div className="matching-participant-list">{leftItems.map((left, index) => <label className="matching-participant-row" key={textOf(left.id, String(index))}><span>{textOf(left.label, 'Left item')}</span><select value={matches[textOf(left.id)] || ''} disabled={disabled} onChange={event => setMatches(current => ({ ...current, [textOf(left.id)]: event.target.value }))}><option value="">Choose a match…</option>{rightItems.map((right, rightIndex) => <option key={textOf(right.id, String(rightIndex))} value={textOf(right.id, textOf(right.label))}>{textOf(right.label, 'Right item')}</option>)}</select></label>)}</div><GameButton type="button" className="participant-primary-button" lockIn disabled={disabled || !complete} onClick={() => onSubmit(leftItems.map(item => ({ leftId: textOf(item.id), rightId: matches[textOf(item.id)] })))}>{disabled ? 'Matches saved' : 'Lock in matches'}</GameButton>{disabled && <small className="participant-saved-note">Your matches are locked in.</small>}</section>;
};

const GroupingInput: React.FC<{ prompt: string; items: JsonRecord[]; groups: JsonRecord[]; disabled: boolean; onSubmit: (groups: Array<{ groupId: string; itemIds: string[] }>) => void }> = ({ prompt, items, groups, disabled, onSubmit }) => {
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const seatsKey = cardKey(items, groups);
  const firstGroupId = textOf(groups[0]?.id);
  useEffect(() => setAssignments(Object.fromEntries(items.map((item, index) => [textOf(item.id, String(index)), firstGroupId]))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the cards, not the array identity
    [seatsKey, firstGroupId]);
  const complete = items.length > 0 && groups.length > 0 && items.every(item => textOf(assignments[textOf(item.id)]));
  return <section className="participant-input-card grouping-input-card"><span className="participant-kicker">FIND THE CONNECTIONS</span><h2>{prompt}</h2><div className="grouping-participant-list">{items.map((item, index) => <label className="grouping-participant-row" key={textOf(item.id, String(index))}><span>{textOf(item.label, 'Item')}</span><select value={assignments[textOf(item.id)] || ''} disabled={disabled} onChange={event => setAssignments(current => ({ ...current, [textOf(item.id)]: event.target.value }))}>{groups.map((group, groupIndex) => <option key={textOf(group.id, String(groupIndex))} value={textOf(group.id)}>{textOf(group.label, `Group ${groupIndex + 1}`)}</option>)}</select></label>)}</div><GameButton type="button" className="participant-primary-button" lockIn disabled={disabled || !complete} onClick={() => onSubmit(groups.map(group => ({ groupId: textOf(group.id), itemIds: items.filter(item => assignments[textOf(item.id)] === textOf(group.id)).map(item => textOf(item.id)) })))}>{disabled ? 'Groups saved' : 'Lock in groups'}</GameButton>{disabled && <small className="participant-saved-note">Your groups are locked in.</small>}</section>;
};

const WordInput: React.FC<{ prompt: string; text: string; setText: (value: string) => void; submit: (event: FormEvent) => void; disabled: boolean; waitingForTurn?: boolean; eliminated?: boolean; turnParticipantName?: string; timerRemainingMs?: number; timerDurationMs?: number; timerRunning?: boolean }> = ({ prompt, text, setText, submit, disabled, waitingForTurn = false, eliminated = false, turnParticipantName = 'another player', timerRemainingMs = 0, timerDurationMs = 0, timerRunning = false }) => <section className="participant-input-card participant-word-entry"><span className="participant-kicker">BUILD THE STORM</span><h2>{prompt}</h2>{timerRunning && <ActivityCountdown remainingMs={timerRemainingMs} durationMs={timerDurationMs} label="TIME TO SEND" compact />}{eliminated ? <div className="participant-waiting"><span className="waiting-orb" style={idleWobbleStyle('eliminated', 4)}>✕</span><strong>You’re out</strong><p>A duplicate answer ended your run. Watch the rest of the round.</p></div> : waitingForTurn ? <div className="participant-waiting"><span className="waiting-orb" style={idleWobbleStyle('waiting', 2)}>⏳</span><strong>{turnParticipantName} is up</strong><p>Your turn will appear here automatically.</p></div> : <form onSubmit={submit}><textarea maxLength={1200} value={text} onChange={event => setText(event.target.value)} placeholder="Type words separated by commas…" disabled={disabled} /><small>Use commas, semicolons, or new lines to send several short answers.</small><GameButton className="participant-primary-button" lockIn disabled={disabled || !text.trim()}>Send words</GameButton></form>}{disabled && !waitingForTurn && !eliminated && <small className="participant-saved-note">Your words are locked in.</small>}</section>;

const VoteInput: React.FC<{ items: JsonRecord[]; selected: string | null; disabled: boolean; onSelect: (id: string) => void }> = ({ items, selected, disabled, onSelect }) => <section className="participant-input-card"><span className="participant-kicker">VOTE FOR YOUR FAVORITE</span><div className="participant-choice-list">{items.map((item, index) => { const id = textOf(item.id, String(index)); return <GameButton key={id} className={selected === id ? 'selected' : ''} lockIn disabled={disabled} onClick={() => onSelect(id)}><span>{index + 1}</span>{textOf(item.text, textOf(item.label))}</GameButton>; })}</div>{disabled && <small className="participant-saved-note">Your vote is locked in.</small>}</section>;
