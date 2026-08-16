import React, { FormEvent, useEffect, useRef, useState } from 'react';
import type { ActivityParticipantView, ActivitySessionPublicView } from './types';
import { ActivityApi, activityHub } from './api';
import './activity.css';

type JsonRecord = Record<string, unknown>;
const objectOf = (value: unknown) => value && typeof value === 'object' ? value as JsonRecord : {};
const listOf = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
const textOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;
const participantTokenKey = (code: string) => `lessoncue:activity-participant:${code.toUpperCase()}`;

export const ActivityParticipantApp: React.FC = () => {
  const code = location.pathname.split('/')[2]?.trim().toUpperCase() || '';
  const [publicSession, setPublicSession] = useState<ActivitySessionPublicView | null>(null);
  const [participant, setParticipant] = useState<ActivityParticipantView | null>(null);
  const [name, setName] = useState('');
  const [token, setToken] = useState(() => { try { return localStorage.getItem(participantTokenKey(code)) || ''; } catch { return ''; } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async (runId?: string) => {
    try {
      const activeToken = token || (() => { try { return localStorage.getItem(participantTokenKey(code)) || ''; } catch { return ''; } })();
      if (runId && activeToken) {
        try {
          const current = await ActivityApi.getParticipantState(runId, activeToken);
          setParticipant(current);
          setName(current.displayName);
          setError('');
        } catch (cause) {
          setError((cause as Error).message || 'The game connection is waiting to recover.');
        }
        return;
      }
      const session = await ActivityApi.getPublicSession(code);
      setPublicSession(session);
      if (activeToken && (runId || session.state.runId)) {
        try {
          const current = await ActivityApi.getParticipantState(runId || session.state.runId, activeToken);
          setParticipant(current);
          setName(current.displayName);
        } catch { setParticipant(null); }
      }
      setError('');
    } catch (cause) {
      setError((cause as Error).message || 'That game code is not active.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [code]);

  useEffect(() => {
    const runId = participant?.state.runId || publicSession?.state.runId;
    if (!runId || !token) return;
    let active = true;
    const poll = window.setInterval(() => { if (active) void refresh(runId); }, 5000);
    let unsubscribe: (() => void) | undefined;
    void activityHub.subscribeRun(runId, () => { if (active) void refresh(runId); }).then(stop => { unsubscribe = stop; });
    return () => { active = false; window.clearInterval(poll); unsubscribe?.(); };
  }, [participant?.state.runId, publicSession?.state.runId, token]);

  const join = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await ActivityApi.joinSession(code, token || undefined, name.trim() || undefined);
      setToken(result.token); setParticipant(result.participant); setName(result.participant.displayName);
      try { localStorage.setItem(participantTokenKey(code), result.token); } catch { /* private browsing */ }
      await refresh(result.participant.state.runId);
    } catch (cause) { setError((cause as Error).message || 'Could not join this game.'); }
    finally { setBusy(false); }
  };

  const action = async (name: string, payload?: JsonRecord) => {
    if (!participant || busy) return;
    setBusy(true); setError('');
    try { await ActivityApi.participantAction(participant.state.runId, token, name, payload); await refresh(participant.state.runId); }
    catch (cause) { setError((cause as Error).message || 'That response could not be sent.'); }
    finally { setBusy(false); }
  };

  if (loading) return <main className="activity-participant-page"><div className="participant-card"><span className="participant-mark">⚡</span><h1>Joining the game…</h1></div></main>;
  if (error && !publicSession) return <main className="activity-participant-page"><div className="participant-card"><span className="participant-mark">⚠</span><h1>Game unavailable</h1><p>{error}</p></div></main>;
  if (!publicSession) return null;
  if (!participant) return <JoinCard title={textOf(publicSession.state.name, 'LessonCue Game')} code={code} name={name} setName={setName} onSubmit={join} busy={busy} error={error} />;
  return <ParticipantGame view={participant} token={token} busy={busy} error={error} onAction={action} onLeave={() => { setParticipant(null); setToken(''); try { localStorage.removeItem(participantTokenKey(code)); } catch { /* ignore */ } }} />;
};

const JoinCard: React.FC<{ title: string; code: string; name: string; setName: (value: string) => void; onSubmit: (event: FormEvent) => void; busy: boolean; error: string }> = ({ title, code, name, setName, onSubmit, busy, error }) => (
  <main className="activity-participant-page"><div className="participant-card participant-join-card"><span className="participant-mark">⚡</span><span className="participant-kicker">JOIN A LIVE ACTIVITY</span><h1>{title}</h1><div className="participant-code">{code}</div><p>Choose a display name if this game uses a scoreboard. You can play anonymously when the host allows it.</p><form onSubmit={onSubmit}><label>Display name <input autoFocus maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder="Optional name" /></label>{error && <div className="participant-error" role="alert">{error}</div>}<button className="participant-primary-button" disabled={busy}>{busy ? 'Joining…' : 'Join game'}</button></form><small>No LessonCue account required.</small></div></main>
);

const ParticipantGame: React.FC<{ view: ActivityParticipantView; token: string; busy: boolean; error: string; onAction: (action: string, payload?: JsonRecord) => void; onLeave: () => void }> = ({ view, busy, error, onAction, onLeave }) => {
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
  const rawOptions = Array.isArray(question.options) && question.options.length ? question.options : Array.isArray(config.options) ? config.options : [];
  const options = rawOptions.map(option => option && typeof option === 'object' ? option as JsonRecord : { value: option });
  const submissions = listOf(state.submissions);
  const bluffOptions = listOf(state.options);
  const bracketMatch = listOf(state.bracketMatches).find(match => textOf(match.id) === textOf(state.currentMatchId)) || objectOf(state.currentMatch);
  const bracketOptions = [
    { id: textOf(bracketMatch.entrantAId), label: textOf(bracketMatch.entrantA, 'Entrant A') },
    { id: textOf(bracketMatch.entrantBId), label: textOf(bracketMatch.entrantB, 'Entrant B') }
  ].filter(option => option.id).map(option => ({ value: option.label, entrantId: option.id }));
  const [selected, setSelected] = useState<string | null>(null);
  const isChoice = envelope.type === 'trivia' || envelope.type === 'rapidFire' || envelope.type === 'poll' || envelope.type === 'prediction';
  const isTurnBasedWord = envelope.type === 'word' && config.turnBased === true;
  const pollMode = textOf(config.pollMode);
  const choiceKicker = envelope.type !== 'poll' ? undefined : pollMode === 'minority' ? 'PREDICT THE MINORITY' : pollMode === 'majority' ? 'PREDICT THE MAJORITY' : pollMode === 'prediction' ? 'PREDICT THE ROOM' : 'CHOOSE ONE';

  const submitText = (event: FormEvent) => { event.preventDefault(); if (text.trim()) { onAction('submit', { text: text.trim() }); setText(''); } };
  const sendChoice = (index: number) => { setSelected(String(index)); onAction(envelope.type === 'trivia' || envelope.type === 'rapidFire' ? 'answer' : envelope.type === 'poll' && pollMode ? 'predict' : 'vote', { optionIndex: index }); };
  const sendMatchChoice = (index: number) => { setSelected(String(index)); onAction(state.isTarget === true ? 'answer' : 'predict', { optionIndex: index }); };
  const sendBracketChoice = (index: number) => { const entrantId = textOf(bracketOptions[index]?.entrantId); setSelected(entrantId); onAction('vote', { entrantId }); };
  const submitVote = (id: string) => onAction('vote', { targetId: id });

  return <main className="activity-participant-page"><div className="participant-game-shell"><header className="participant-game-header"><div><span className="participant-kicker">{textOf(envelope.name, 'LIVE ACTIVITY')}</span><h1>{title}</h1></div><div className="participant-identity"><strong>{view.displayName}</strong><small>{view.hasSubmitted ? 'Response saved' : phase.replace(/([a-z])([A-Z])/g, '$1 $2')}</small></div></header>{error && <div className="participant-error" role="alert">{error}</div>}
    {phase === 'lobby' || phase === 'setup' ? <section className="participant-waiting"><span className="waiting-orb">✦</span><h2>You’re in.</h2><p>Waiting for the host to start the game.</p><div className="participant-count">{numberOf(state.participantCount)} players joined</div></section> :
      phase === 'acceptingResponses' && isChoice ? <ChoiceInput kicker={choiceKicker} prompt={prompt} options={options} selected={selected === null ? null : Number(selected)} disabled={busy || view.hasSubmitted} onSelect={sendChoice} /> :
      phase === 'acceptingResponses' && envelope.type === 'buzzer' ? <section className="participant-buzzer-card"><h2>{prompt}</h2><button className="participant-buzzer" disabled={busy || Boolean(state.buzzWinnerParticipantId)} onClick={() => onAction('buzz')}>{state.buzzWinnerName ? `${textOf(state.buzzWinnerName)} buzzed first` : 'BUZZ'}</button></section> :
      phase === 'acceptingResponses' && envelope.type === 'drawing' ? <DrawingInput prompt={prompt} disabled={busy || view.hasSubmitted} onSubmit={strokes => onAction('submit', { strokes })} /> :
      phase === 'acceptingResponses' && envelope.type === 'ordering' ? <OrderingInput prompt={prompt} items={orderingItems} disabled={busy || view.hasSubmitted} onSubmit={order => onAction('sort', { order })} /> :
      phase === 'acceptingResponses' && envelope.type === 'matchPlayer' ? <ChoiceInput kicker={state.isTarget === true ? 'ANSWER PRIVATELY' : 'PREDICT THE TARGET'} prompt={prompt} options={options} selected={selected === null ? null : Number(selected)} disabled={busy || view.hasSubmitted} onSelect={sendMatchChoice} /> :
      phase === 'acceptingResponses' && envelope.type === 'word' ? <WordInput prompt={prompt} text={text} setText={setText} submit={submitText} disabled={busy || view.hasSubmitted} waitingForTurn={isTurnBasedWord && state.isCurrentTurn !== true && state.isEliminated !== true} eliminated={isTurnBasedWord && state.isEliminated === true} turnParticipantName={textOf(state.turnParticipantName, 'another player')} /> :
      phase === 'acceptingResponses' && (envelope.type === 'punchline' || envelope.type === 'fakeOut' || envelope.type === 'surveyBoard') ? <TextResponse prompt={prompt} text={text} setText={setText} submit={submitText} disabled={busy || view.hasSubmitted} /> :
      phase === 'voting' && envelope.type === 'bracket' ? <ChoiceInput kicker="VOTE TO ADVANCE" prompt="Which entrant should move forward?" options={bracketOptions} selected={bracketOptions.findIndex(option => option.entrantId === selected)} disabled={busy || view.hasSubmitted || bracketOptions.length < 2} onSelect={sendBracketChoice} /> :
      phase === 'voting' && envelope.type === 'punchline' ? <VoteInput items={submissions} selected={selected} disabled={busy || view.hasSubmitted} onSelect={id => { setSelected(id); submitVote(id); }} /> :
      phase === 'voting' && envelope.type === 'fakeOut' ? <VoteInput items={bluffOptions} selected={selected} disabled={busy || view.hasSubmitted} onSelect={id => { setSelected(id); submitVote(id); }} /> :
      phase === 'judging' || phase === 'responsesLocked' ? <section className="participant-waiting"><span className="waiting-orb">⏳</span><h2>Locked in.</h2><p>The host is reviewing the room.</p></section> :
      phase === 'reveal' || phase === 'leaderboard' || phase === 'finalResults' ? <section className="participant-waiting"><span className="waiting-orb">✨</span><h2>Reveal time.</h2><p>Look up at the main display.</p></section> : <section className="participant-waiting"><h2>Watch the stage.</h2><p>Your next input will appear here.</p></section>}
    <button className="participant-leave-button" onClick={onLeave}>Leave this device</button></div></main>;
};

const ChoiceInput: React.FC<{ kicker?: string; prompt: string; options: JsonRecord[]; selected: number | null; disabled: boolean; onSelect: (index: number) => void }> = ({ kicker = 'CHOOSE ONE', prompt, options, selected, disabled, onSelect }) => <section className="participant-input-card"><span className="participant-kicker">{kicker}</span><h2>{prompt}</h2><div className="participant-choice-list">{options.map((option, index) => <button key={index} className={selected === index ? 'selected' : ''} disabled={disabled} onClick={() => onSelect(index)}><span>{String.fromCharCode(65 + index)}</span>{textOf(option.value, textOf(option.label, textOf(option)))}</button>)}</div>{disabled && <small className="participant-saved-note">Your answer is locked in.</small>}</section>;

const TextResponse: React.FC<{ prompt: string; text: string; setText: (value: string) => void; submit: (event: FormEvent) => void; disabled: boolean }> = ({ prompt, text, setText, submit, disabled }) => <section className="participant-input-card"><span className="participant-kicker">YOUR RESPONSE</span><h2>{prompt}</h2><form onSubmit={submit}><textarea maxLength={1000} value={text} onChange={event => setText(event.target.value)} placeholder="Type your answer…" disabled={disabled} /><button className="participant-primary-button" disabled={disabled || !text.trim()}>Send response</button></form>{disabled && <small className="participant-saved-note">Your response is locked in.</small>}</section>;

type DrawingStroke = { points: Array<[number, number]>; color: string; width: number };

const DrawingInput: React.FC<{ prompt: string; disabled: boolean; onSubmit: (strokes: DrawingStroke[]) => void }> = ({ prompt, disabled, onSubmit }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    strokes.forEach(stroke => {
      if (!stroke.points.length) return;
      context.beginPath();
      stroke.points.forEach(([x, y], index) => index === 0 ? context.moveTo(x * rect.width, y * rect.height) : context.lineTo(x * rect.width, y * rect.height));
      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.width * rect.width;
      context.stroke();
    });
  }, [strokes]);

  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
  };
  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing(true);
    setStrokes(current => [...current, { points: [pointFor(event)], color: '#f8fafc', width: .012 }]);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || disabled) return;
    const point = pointFor(event);
    setStrokes(current => { if (!current.length) return current; const next = [...current]; const last = next[next.length - 1]; next[next.length - 1] = { ...last, points: [...last.points, point] }; return next; });
  };
  const end = () => setDrawing(false);
  return <section className="participant-input-card drawing-input-card"><span className="participant-kicker">SKETCH IT</span><h2>{prompt}</h2><canvas ref={canvasRef} className="drawing-canvas" aria-label="Draw your answer" style={{ touchAction: 'none' }} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} /><div className="drawing-tool-row"><button type="button" className="participant-secondary-button" disabled={disabled || !strokes.length} onClick={() => setStrokes(current => current.slice(0, -1))}>Undo</button><button type="button" className="participant-secondary-button" disabled={disabled || !strokes.length} onClick={() => setStrokes([])}>Clear</button><button type="button" className="participant-primary-button" disabled={disabled || !strokes.length} onClick={() => onSubmit(strokes)}>{disabled ? 'Drawing saved' : 'Submit drawing'}</button></div>{disabled && <small className="participant-saved-note">Your drawing is locked in.</small>}</section>;
};

const OrderingInput: React.FC<{ prompt: string; items: JsonRecord[]; disabled: boolean; onSubmit: (order: string[]) => void }> = ({ prompt, items, disabled, onSubmit }) => {
  const [order, setOrder] = useState<string[]>(() => items.map(item => textOf(item.id)));
  useEffect(() => setOrder(items.map(item => textOf(item.id))), [items]);
  const move = (index: number, direction: -1 | 1) => setOrder(current => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const labels = new Map(items.map(item => [textOf(item.id), textOf(item.label, 'Item')]));
  return <section className="participant-input-card"><span className="participant-kicker">ORDER THE CARDS</span><h2>{prompt}</h2><div className="ordering-participant-list">{order.map((id, index) => <div className="ordering-participant-row" key={id}><b>{index + 1}</b><span>{labels.get(id) || id}</span><button type="button" className="ordering-move-button" aria-label={`Move ${labels.get(id) || 'item'} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className="ordering-move-button" aria-label={`Move ${labels.get(id) || 'item'} down`} disabled={disabled || index === order.length - 1} onClick={() => move(index, 1)}>↓</button></div>)}</div><button type="button" className="participant-primary-button" disabled={disabled || !order.length} onClick={() => onSubmit(order)}>{disabled ? 'Order saved' : 'Lock in order'}</button>{disabled && <small className="participant-saved-note">Your answer is locked in.</small>}</section>;
};

const WordInput: React.FC<{ prompt: string; text: string; setText: (value: string) => void; submit: (event: FormEvent) => void; disabled: boolean; waitingForTurn?: boolean; eliminated?: boolean; turnParticipantName?: string }> = ({ prompt, text, setText, submit, disabled, waitingForTurn = false, eliminated = false, turnParticipantName = 'another player' }) => <section className="participant-input-card participant-word-entry"><span className="participant-kicker">BUILD THE STORM</span><h2>{prompt}</h2>{eliminated ? <div className="participant-waiting"><span className="waiting-orb">✕</span><strong>You’re out</strong><p>A duplicate answer ended your run. Watch the rest of the round.</p></div> : waitingForTurn ? <div className="participant-waiting"><span className="waiting-orb">⏳</span><strong>{turnParticipantName} is up</strong><p>Your turn will appear here automatically.</p></div> : <form onSubmit={submit}><textarea maxLength={1200} value={text} onChange={event => setText(event.target.value)} placeholder="Type words separated by commas…" disabled={disabled} /><small>Use commas, semicolons, or new lines to send several short answers.</small><button className="participant-primary-button" disabled={disabled || !text.trim()}>Send words</button></form>}{disabled && !waitingForTurn && !eliminated && <small className="participant-saved-note">Your words are locked in.</small>}</section>;

const VoteInput: React.FC<{ items: JsonRecord[]; selected: string | null; disabled: boolean; onSelect: (id: string) => void }> = ({ items, selected, disabled, onSelect }) => <section className="participant-input-card"><span className="participant-kicker">VOTE FOR YOUR FAVORITE</span><div className="participant-choice-list">{items.map((item, index) => { const id = textOf(item.id, String(index)); return <button key={id} className={selected === id ? 'selected' : ''} disabled={disabled} onClick={() => onSelect(id)}><span>{index + 1}</span>{textOf(item.text, textOf(item.label))}</button>; })}</div>{disabled && <small className="participant-saved-note">Your vote is locked in.</small>}</section>;
