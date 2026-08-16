import React, { useEffect, useRef, useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';
import { launchConfetti, playChimeSound, playCountdownTickSound, playFanfareSound } from '../../effects';

type ActivityProps = {
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
};

interface RapidFireQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  points?: number;
  timerSeconds?: number;
  category?: string;
}

interface RapidFireConfig {
  title?: string;
  questions?: RapidFireQuestion[];
  defaultTimerSeconds?: number;
}

interface RapidFireState {
  currentQuestionIndex?: number;
  isRunning?: boolean;
  targetAt?: string | null;
  remainingMs?: number | null;
  answerRevealed?: boolean;
  explanationRevealed?: boolean;
  revealedCorrectIndex?: number | null;
  revealedExplanation?: string;
}

interface EmojiRound {
  id: string;
  emoji: string;
  prompt: string;
  answer: string;
  hint?: string;
  points?: number;
  category?: string;
}

interface EmojiConfig {
  title?: string;
  rounds?: EmojiRound[];
  instruction?: string;
}

interface EmojiState {
  currentRoundIndex?: number;
  hintRevealed?: boolean;
  answerRevealed?: boolean;
}

interface RankItem {
  id: string;
  label: string;
  detail?: string;
  icon?: string;
}

interface RankRound {
  id: string;
  prompt: string;
  items: RankItem[];
  revealNote?: string;
  category?: string;
}

interface RankConfig {
  title?: string;
  rounds?: RankRound[];
  instruction?: string;
}

interface RankState {
  currentRoundIndex?: number;
  answerRevealed?: boolean;
}

interface ScrambleRound {
  id: string;
  word: string;
  clue: string;
  category?: string;
  hint?: string;
  points?: number;
  scrambledWord?: string;
}

interface ScrambleConfig {
  title?: string;
  rounds?: ScrambleRound[];
  secondsPerRound?: number;
  instruction?: string;
}

interface ScrambleState {
  currentRoundIndex?: number;
  isRunning?: boolean;
  targetAt?: string | null;
  remainingMs?: number | null;
  hintRevealed?: boolean;
  answerRevealed?: boolean;
}

interface PredictionRound {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  points?: number;
  category?: string;
}

interface PredictionConfig {
  title?: string;
  rounds?: PredictionRound[];
  instruction?: string;
}

interface PredictionState {
  currentRoundIndex?: number;
  responsesOpen?: boolean;
  answerRevealed?: boolean;
  explanationRevealed?: boolean;
  revealedCorrectIndex?: number;
  revealedExplanation?: string;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const OPTION_COLORS = ['#ff4d6d', '#28b8ff', '#37e59a', '#ffd166', '#a78bfa', '#fb7dd4', '#5ee7f5', '#b8ec55'];

function useActivityCommands(envelope: ActivityStateEnvelope, onCommandSent?: () => void) {
  const [isBusy, setIsBusy] = useState(false);

  const sendAction = async (action: string, payload?: Record<string, unknown>) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, { action, payload });
      onCommandSent?.();
    } catch (error) {
      console.error(`Failed to execute ${action}:`, error);
    } finally {
      setIsBusy(false);
    }
  };

  const reset = async (message: string) => {
    if (isBusy || !window.confirm(message)) return;
    setIsBusy(true);
    try {
      await ActivityApi.resetRun(envelope.runId);
      onCommandSent?.();
    } catch (error) {
      console.error('Failed to reset activity:', error);
    } finally {
      setIsBusy(false);
    }
  };

  return { isBusy, sendAction, reset };
}

function useTargetCountdown(isRunning: boolean | undefined, targetAt: string | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning || !targetAt) {
      setNow(Date.now());
      return undefined;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [isRunning, targetAt]);

  if (!isRunning || !targetAt) return 0;
  return Math.max(0, new Date(targetAt).getTime() - now);
}

function formatSeconds(milliseconds: number): string {
  return Math.ceil(milliseconds / 1000).toString().padStart(2, '0');
}

function roundStatus(index: number, total: number): string {
  return `ROUND ${index + 1} OF ${Math.max(1, total)}`;
}

function RoundTabs({
  count,
  activeIndex,
  onSelect,
  onAdd,
  label
}: {
  count: number;
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  label: string;
}) {
  return (
    <div className="activity-question-tabs" aria-label={`${label} rounds`}>
      {Array.from({ length: count }, (_, index) => (
        <button key={index} type="button" className={activeIndex === index ? 'active' : ''} onClick={() => onSelect(index)}>
          {label[0]}{index + 1}
        </button>
      ))}
      <button type="button" onClick={onAdd}>+ Add {label.toLowerCase()}</button>
    </div>
  );
}

function ActivityEditorShell({ children }: { children: React.ReactNode }) {
  return <div className="activity-editor-form">{children}</div>;
}

function TitleField({
  value,
  onChange,
  placeholder
}: {
  value?: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="activity-editor-label">Activity title
      <input value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="activity-editor-label">{label}
      {multiline ? (
        <textarea rows={2} value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
      ) : (
        <input value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
}

function NumberField({ label, value, onChange, min = 0, max }: { label: string; value?: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <label className="activity-editor-label">{label}
      <input type="number" min={min} max={max} value={value ?? 0} onChange={event => onChange(Number(event.target.value) || 0)} />
    </label>
  );
}

function SendActionButton({
  action,
  label,
  sendAction,
  isBusy,
  className = 'act-btn act-btn-primary',
  disabled = false
}: {
  action: string;
  label: string;
  sendAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  isBusy: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return <button type="button" className={className} onClick={() => sendAction(action)} disabled={isBusy || disabled}>{label}</button>;
}

// ---------------------------------------------------------------------------
// Rapid Fire
// ---------------------------------------------------------------------------

function defaultRapidQuestions(): RapidFireQuestion[] {
  return [{ id: 'q1', prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter'], correctIndex: 1, explanation: 'Mars looks red because of iron oxide on its surface.', points: 100, timerSeconds: 15 }];
}

function rapidQuestions(config: RapidFireConfig): RapidFireQuestion[] {
  return config.questions?.length ? config.questions : defaultRapidQuestions();
}

export const RapidFireDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const state = (envelope.state as RapidFireState) || {};
  const config = ((envelope as unknown as { config?: RapidFireConfig }).config || {});
  const questions = rapidQuestions(config);
  const index = Math.min(Math.max(0, state.currentQuestionIndex ?? 0), questions.length - 1);
  const question = questions[index];
  const liveRemainingMs = useTargetCountdown(state.isRunning, state.targetAt);
  const remainingMs = state.isRunning ? liveRemainingMs : state.remainingMs || 0;
  const timedOut = Boolean(state.isRunning && state.targetAt && remainingMs === 0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (state.answerRevealed) {
      playChimeSound();
      playFanfareSound();
      launchConfetti(containerRef.current, 90);
    }
  }, [state.answerRevealed]);

  if (!question) return <div className="activity-stage"><h1 className="activity-title">Rapid Fire Complete!</h1></div>;

  return (
    <div ref={containerRef} className="activity-stage new-game-stage rapid-fire-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">⚡ RAPID FIRE · {roundStatus(index, questions.length)}</div>
          <h1 className="activity-title">{config.title || envelope.name || 'Rapid Fire Showdown'}</h1>
          <div className="activity-subtitle">Read fast. Decide faster. The host controls the reveal.</div>
        </div>

        <div className={`new-game-timer ${timedOut ? 'expired' : remainingMs <= 5000 && state.isRunning ? 'urgent' : ''}`}>
          <span>{state.isRunning || state.remainingMs ? formatSeconds(remainingMs) : state.answerRevealed ? '✓' : '—'}</span>
          <small>{state.isRunning ? 'SECONDS' : state.answerRevealed ? 'ANSWER LOCKED' : state.remainingMs ? 'PAUSED' : 'READY?'}</small>
        </div>

        <div className="new-game-prompt-card">
          <span className="new-game-category">{question.points || 100} POINTS</span>
          <h2>{question.prompt}</h2>
        </div>

        <div className="new-game-choice-grid" style={{ gridTemplateColumns: `repeat(${question.options.length <= 2 ? 1 : question.options.length <= 4 ? 2 : 4}, minmax(0, 1fr))` }}>
          {question.options.map((option, optionIndex) => {
            const isCorrect = optionIndex === (state.revealedCorrectIndex ?? question.correctIndex);
            const status = state.answerRevealed ? (isCorrect ? 'correct' : 'wrong') : '';
            return (
              <div className={`new-game-choice ${status}`} key={`${option}-${optionIndex}`}>
                <span className="new-game-choice-letter" style={{ background: OPTION_COLORS[optionIndex % OPTION_COLORS.length] }}>{OPTION_LETTERS[optionIndex]}</span>
                <span>{option}</span>
                {state.answerRevealed && isCorrect && <strong>✓ CORRECT</strong>}
              </div>
            );
          })}
        </div>

        {state.explanationRevealed && (state.revealedExplanation || question.explanation) && <div className="new-game-explanation">💡 {state.revealedExplanation || question.explanation}</div>}
      </div>
    </div>
  );
};

export const RapidFireController: React.FC<ActivityProps> = ({ envelope, onCommandSent }) => {
  const state = (envelope.state as RapidFireState) || {};
  const config = ((envelope as unknown as { config?: RapidFireConfig }).config || {});
  const questions = rapidQuestions(config);
  const index = Math.min(Math.max(0, state.currentQuestionIndex ?? 0), questions.length - 1);
  const question = questions[index];
  const liveRemainingMs = useTargetCountdown(state.isRunning, state.targetAt);
  const remainingMs = state.isRunning ? liveRemainingMs : state.remainingMs || 0;
  const { isBusy, sendAction, reset } = useActivityCommands(envelope, onCommandSent);

  return (
    <div className="act-ctrl-container">
      <div className="act-ctrl-card activity-controller-summary">
        <div><span className="controller-eyebrow">RAPID FIRE</span><strong>{roundStatus(index, questions.length)}</strong><small>{question?.prompt}</small></div>
        <strong className="controller-score">{question?.points || 100}<small> pts</small></strong>
      </div>

      <div className="new-game-controller-timer">
        <span>{state.isRunning || state.remainingMs ? formatSeconds(remainingMs) : '—'}</span>
        <small>{state.isRunning ? 'LIVE TIMER' : state.answerRevealed ? 'REVEALED' : state.remainingMs ? 'PAUSED' : `${question?.timerSeconds || config.defaultTimerSeconds || 15}s round`}</small>
      </div>

      <div className="act-controller-button-row">
        <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('prev')} disabled={isBusy || index <= 0}>‹ Previous</button>
        <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('next')} disabled={isBusy || index >= questions.length - 1}>Next ›</button>
      </div>

      <button type="button" className={`act-btn ${state.isRunning ? 'act-btn-danger' : 'act-btn-primary'}`} style={{ height: 62, fontSize: '1.2rem' }} onClick={() => sendAction(state.isRunning ? 'pause' : 'start')} disabled={isBusy || Boolean(state.answerRevealed)}>
        {state.isRunning ? '❚❚ PAUSE CLOCK' : '▶ START ROUND'}
      </button>

      <div className="act-controller-button-row">
        <SendActionButton action={state.answerRevealed ? 'hideanswer' : 'reveal'} label={state.answerRevealed ? '↩ Hide answer' : '🎯 Reveal answer'} sendAction={sendAction} isBusy={isBusy} className="act-btn act-btn-gold" />
        <SendActionButton action={state.explanationRevealed ? 'hideexplanation' : 'showexplanation'} label={state.explanationRevealed ? 'Hide note' : '💡 Show note'} sendAction={sendAction} isBusy={isBusy} className="act-btn act-btn-primary" disabled={!question?.explanation} />
      </div>

      <button type="button" className="act-btn act-btn-secondary" style={{ opacity: 0.75 }} onClick={() => reset('Reset Rapid Fire to the first question?')} disabled={isBusy}>🔄 Reset Rapid Fire</button>
    </div>
  );
};

export const RapidFireEditor: React.FC<{ config: Record<string, unknown>; onChange: (updated: Record<string, unknown>) => void }> = ({ config, onChange }) => {
  const current = config as RapidFireConfig;
  const questions = rapidQuestions(current);
  const [activeIndex, setActiveIndex] = useState(0);
  const index = Math.min(activeIndex, questions.length - 1);
  const question = questions[index];
  const updateQuestions = (next: RapidFireQuestion[]) => onChange({ ...current, questions: next });
  const updateQuestion = (changes: Partial<RapidFireQuestion>) => updateQuestions(questions.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const addQuestion = () => {
    const next = [...questions, { id: `q-${Date.now()}`, prompt: `New rapid-fire question ${questions.length + 1}`, options: ['Option A', 'Option B', 'Option C'], correctIndex: 0, explanation: '', points: 100, timerSeconds: current.defaultTimerSeconds || 15 }];
    updateQuestions(next);
    setActiveIndex(next.length - 1);
  };
  const removeQuestion = () => {
    if (questions.length <= 1) return;
    updateQuestions(questions.filter((_, itemIndex) => itemIndex !== index));
    setActiveIndex(Math.max(0, index - 1));
  };
  const updateOption = (optionIndex: number, value: string) => updateQuestion({ options: question.options.map((option, itemIndex) => itemIndex === optionIndex ? value : option) });
  const addOption = () => question.options.length < 8 && updateQuestion({ options: [...question.options, `Option ${String.fromCharCode(65 + question.options.length)}`] });
  const removeOption = (optionIndex: number) => {
    if (question.options.length <= 2) return;
    const options = question.options.filter((_, itemIndex) => itemIndex !== optionIndex);
    const correctIndex = question.correctIndex === optionIndex ? 0 : question.correctIndex > optionIndex ? question.correctIndex - 1 : question.correctIndex;
    updateQuestion({ options, correctIndex: Math.min(correctIndex, options.length - 1) });
  };

  return (
    <ActivityEditorShell>
      <TitleField value={current.title} onChange={title => onChange({ ...current, title })} placeholder="e.g. 60-Second Showdown" />
      <NumberField label="Default seconds per question" value={current.defaultTimerSeconds ?? 15} min={3} max={600} onChange={defaultTimerSeconds => onChange({ ...current, defaultTimerSeconds })} />
      <RoundTabs count={questions.length} activeIndex={index} onSelect={setActiveIndex} onAdd={addQuestion} label="Question" />
      <div className="activity-editor-card">
        <div className="activity-editor-card-heading"><strong>Question {index + 1}</strong>{questions.length > 1 && <button type="button" className="button danger" onClick={removeQuestion}>Delete question</button>}</div>
        <TextField label="Prompt" value={question.prompt} onChange={prompt => updateQuestion({ prompt })} multiline />
        <div className="activity-editor-card-heading"><strong>Choices (2–8)</strong><span className="activity-editor-help">Select the correct choice</span></div>
        <div className="new-game-editor-options">
          {question.options.map((option, optionIndex) => <div className="new-game-editor-option" key={optionIndex}>
            <input type="radio" name={`rapid-correct-${question.id}`} checked={question.correctIndex === optionIndex} onChange={() => updateQuestion({ correctIndex: optionIndex })} aria-label={`Mark choice ${optionIndex + 1} correct`} />
            <span className="new-game-choice-letter" style={{ background: OPTION_COLORS[optionIndex % OPTION_COLORS.length] }}>{OPTION_LETTERS[optionIndex]}</span>
            <input value={option} onChange={event => updateOption(optionIndex, event.target.value)} aria-label={`Choice ${optionIndex + 1}`} />
            <button type="button" className="button danger" onClick={() => removeOption(optionIndex)} disabled={question.options.length <= 2} aria-label={`Remove choice ${optionIndex + 1}`}>×</button>
          </div>)}
        </div>
        <button type="button" className="button" onClick={addOption} disabled={question.options.length >= 8}>+ Add choice</button>
        <div className="new-game-editor-inline-fields">
          <NumberField label="Points" value={question.points ?? 100} min={0} max={10000} onChange={points => updateQuestion({ points })} />
          <NumberField label="This question's timer" value={question.timerSeconds ?? current.defaultTimerSeconds ?? 15} min={3} max={600} onChange={timerSeconds => updateQuestion({ timerSeconds })} />
        </div>
        <TextField label="Host note / explanation" value={question.explanation} onChange={explanation => updateQuestion({ explanation })} placeholder="Optional explanation after the reveal" />
      </div>
    </ActivityEditorShell>
  );
};

// ---------------------------------------------------------------------------
// Emoji Prompt
// ---------------------------------------------------------------------------

function defaultEmojiRounds(): EmojiRound[] {
  return [{ id: 'r1', emoji: '🦁👑', prompt: 'Name the movie', answer: 'The Lion King', hint: 'A famous animated royal adventure.', points: 100, category: 'Movies' }];
}

function emojiRounds(config: EmojiConfig): EmojiRound[] {
  return config.rounds?.length ? config.rounds : defaultEmojiRounds();
}

export const EmojiPromptDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const state = (envelope.state as EmojiState) || {};
  const config = ((envelope as unknown as { config?: EmojiConfig }).config || {});
  const rounds = emojiRounds(config);
  const index = Math.min(Math.max(0, state.currentRoundIndex ?? 0), rounds.length - 1);
  const round = rounds[index];
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (state.answerRevealed) {
      playChimeSound();
      playFanfareSound();
      launchConfetti(containerRef.current, 90);
    }
  }, [state.answerRevealed]);

  return (
    <div ref={containerRef} className="activity-stage new-game-stage emoji-prompt-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">🎭 EMOJI PROMPT · {roundStatus(index, rounds.length)}{round.category ? ` · ${round.category}` : ''}</div>
          <h1 className="activity-title">{config.title || envelope.name || 'Emoji Charades'}</h1>
          <div className="activity-subtitle">{config.instruction || 'Decode the clues before the reveal!'}</div>
        </div>

        <div className="emoji-clue-card">
          <div className="emoji-clue-emoji" aria-label="Emoji clue">{round.emoji || '❓'}</div>
          <div className="emoji-clue-prompt">{round.prompt}</div>
          <span className="new-game-points-chip">{round.points || 100} POINTS</span>
        </div>

        {state.hintRevealed && round.hint && <div className="new-game-hint">🧩 HINT · {round.hint}</div>}
        {state.answerRevealed ? <div className="new-game-answer-card"><span>THE ANSWER</span><strong>{round.answer}</strong></div> : <div className="new-game-waiting">Shout your guess before the host flips the card!</div>}
      </div>
    </div>
  );
};

export const EmojiPromptController: React.FC<ActivityProps> = ({ envelope, onCommandSent }) => {
  const state = (envelope.state as EmojiState) || {};
  const config = ((envelope as unknown as { config?: EmojiConfig }).config || {});
  const rounds = emojiRounds(config);
  const index = Math.min(Math.max(0, state.currentRoundIndex ?? 0), rounds.length - 1);
  const round = rounds[index];
  const { isBusy, sendAction, reset } = useActivityCommands(envelope, onCommandSent);

  return (
    <div className="act-ctrl-container">
      <div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">EMOJI PROMPT</span><strong>{roundStatus(index, rounds.length)}</strong><small>{round?.emoji} {round?.prompt}</small></div><strong className="controller-score">{round?.points || 100}<small> pts</small></strong></div>
      <div className="act-controller-button-row">
        <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('prev')} disabled={isBusy || index <= 0}>‹ Previous</button>
        <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('next')} disabled={isBusy || index >= rounds.length - 1}>Next ›</button>
      </div>
      <div className="act-controller-button-row">
        <SendActionButton action={state.hintRevealed ? 'hidehint' : 'showhint'} label={state.hintRevealed ? '↩ Hide hint' : '🧩 Show hint'} sendAction={sendAction} isBusy={isBusy} className="act-btn act-btn-primary" disabled={!round?.hint} />
        <SendActionButton action={state.answerRevealed ? 'hideanswer' : 'reveal'} label={state.answerRevealed ? '↩ Hide answer' : '✨ Reveal answer'} sendAction={sendAction} isBusy={isBusy} className="act-btn act-btn-gold" />
      </div>
      <button type="button" className="act-btn act-btn-secondary" style={{ opacity: 0.75 }} onClick={() => reset('Reset Emoji Prompt to the first round?')} disabled={isBusy}>🔄 Reset Emoji Prompt</button>
    </div>
  );
};

export const EmojiPromptEditor: React.FC<{ config: Record<string, unknown>; onChange: (updated: Record<string, unknown>) => void }> = ({ config, onChange }) => {
  const current = config as EmojiConfig;
  const rounds = emojiRounds(current);
  const [activeIndex, setActiveIndex] = useState(0);
  const index = Math.min(activeIndex, rounds.length - 1);
  const round = rounds[index];
  const updateRounds = (next: EmojiRound[]) => onChange({ ...current, rounds: next });
  const updateRound = (changes: Partial<EmojiRound>) => updateRounds(rounds.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const addRound = () => {
    const next = [...rounds, { id: `r-${Date.now()}`, emoji: '🎯❓', prompt: 'What does this clue mean?', answer: 'Add the answer', hint: '', points: 100, category: 'New round' }];
    updateRounds(next);
    setActiveIndex(next.length - 1);
  };
  const removeRound = () => {
    if (rounds.length <= 1) return;
    updateRounds(rounds.filter((_, itemIndex) => itemIndex !== index));
    setActiveIndex(Math.max(0, index - 1));
  };

  return <ActivityEditorShell>
    <TitleField value={current.title} onChange={title => onChange({ ...current, title })} placeholder="e.g. Emoji Charades" />
    <TextField label="Stage instruction" value={current.instruction} onChange={instruction => onChange({ ...current, instruction })} placeholder="What should the room do?" />
    <RoundTabs count={rounds.length} activeIndex={index} onSelect={setActiveIndex} onAdd={addRound} label="Round" />
    <div className="activity-editor-card">
      <div className="activity-editor-card-heading"><strong>Round {index + 1}</strong>{rounds.length > 1 && <button type="button" className="button danger" onClick={removeRound}>Delete round</button>}</div>
      <TextField label="Emoji clue" value={round.emoji} onChange={emoji => updateRound({ emoji })} placeholder="🦁👑" />
      <TextField label="Prompt" value={round.prompt} onChange={prompt => updateRound({ prompt })} placeholder="Name the movie" />
      <TextField label="Answer" value={round.answer} onChange={answer => updateRound({ answer })} placeholder="The answer shown on reveal" />
      <TextField label="Hint (optional)" value={round.hint} onChange={hint => updateRound({ hint })} placeholder="A gentle nudge for the room" />
      <div className="new-game-editor-inline-fields"><NumberField label="Points" value={round.points ?? 100} min={0} max={10000} onChange={points => updateRound({ points })} /><TextField label="Category" value={round.category} onChange={category => updateRound({ category })} placeholder="Movies, phrases..." /></div>
    </div>
  </ActivityEditorShell>;
};

// ---------------------------------------------------------------------------
// Rank It
// ---------------------------------------------------------------------------

function defaultRankRounds(): RankRound[] {
  return [{ id: 'r1', prompt: 'Rank these from smallest to biggest.', items: [{ id: 'i1', label: 'Small', icon: '🔹' }, { id: 'i2', label: 'Medium', icon: '🔷' }, { id: 'i3', label: 'Big', icon: '💠' }], revealNote: 'Talk through your tiebreaker as a team.', category: 'Warm-up' }];
}

function rankRounds(config: RankConfig): RankRound[] {
  return config.rounds?.length ? config.rounds : defaultRankRounds();
}

function stableHash(value: string): number {
  return value.split('').reduce((hash, character) => ((hash << 5) - hash) + character.charCodeAt(0), 0);
}

function scrambledItems(items: RankItem[]): RankItem[] {
  const sorted = [...items].sort((a, b) => stableHash(a.id || a.label) - stableHash(b.id || b.label));
  if (sorted.every((item, index) => item.id === items[index]?.id) && sorted.length > 1) sorted.reverse();
  return sorted;
}

export const RankItDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const state = (envelope.state as RankState) || {};
  const config = ((envelope as unknown as { config?: RankConfig }).config || {});
  const rounds = rankRounds(config);
  const index = Math.min(Math.max(0, state.currentRoundIndex ?? 0), rounds.length - 1);
  const round = rounds[index];
  const items = state.answerRevealed ? round.items : scrambledItems(round.items);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (state.answerRevealed) {
      playChimeSound();
      launchConfetti(containerRef.current, 70);
    }
  }, [state.answerRevealed]);

  return <div ref={containerRef} className="activity-stage new-game-stage rank-it-stage">
    <div className="activity-stage-content">
      <div className="activity-header"><div className="stage-kicker">📈 RANK IT · {roundStatus(index, rounds.length)}{round.category ? ` · ${round.category}` : ''}</div><h1 className="activity-title">{config.title || envelope.name || 'Rank It!'}</h1><div className="activity-subtitle">{config.instruction || 'Put the items in the right order before the reveal!'}</div></div>
      <div className="new-game-prompt-card"><h2>{round.prompt}</h2><span className="new-game-category">{state.answerRevealed ? 'THE OFFICIAL ORDER' : 'LOCK IN YOUR ORDER'}</span></div>
      <div className={`rank-it-list ${state.answerRevealed ? 'revealed' : ''}`}>
        {items.map((item, itemIndex) => <div className="rank-it-item" key={item.id || itemIndex}><span className="rank-it-number">{itemIndex + 1}</span><span className="rank-it-icon">{item.icon || '◆'}</span><div><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</div>{state.answerRevealed && <span className="rank-it-check">{itemIndex === 0 ? '🥇' : itemIndex === 1 ? '🥈' : itemIndex === 2 ? '🥉' : '✓'}</span>}</div>)}
      </div>
      {state.answerRevealed && round.revealNote && <div className="new-game-explanation">🗣️ {round.revealNote}</div>}
    </div>
  </div>;
};

export const RankItController: React.FC<ActivityProps> = ({ envelope, onCommandSent }) => {
  const state = (envelope.state as RankState) || {};
  const config = ((envelope as unknown as { config?: RankConfig }).config || {});
  const rounds = rankRounds(config);
  const index = Math.min(Math.max(0, state.currentRoundIndex ?? 0), rounds.length - 1);
  const round = rounds[index];
  const { isBusy, sendAction, reset } = useActivityCommands(envelope, onCommandSent);
  return <div className="act-ctrl-container">
    <div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">RANK IT</span><strong>{roundStatus(index, rounds.length)}</strong><small>{round?.prompt}</small></div><strong className="controller-score">{round?.items.length || 0}<small> items</small></strong></div>
    <div className="act-controller-button-row"><button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('prev')} disabled={isBusy || index <= 0}>‹ Previous</button><button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('next')} disabled={isBusy || index >= rounds.length - 1}>Next ›</button></div>
    <button type="button" className="act-btn act-btn-gold" style={{ height: 62, fontSize: '1.2rem' }} onClick={() => sendAction(state.answerRevealed ? 'hideanswer' : 'reveal')} disabled={isBusy}>{state.answerRevealed ? '↩ HIDE OFFICIAL ORDER' : '✨ REVEAL OFFICIAL ORDER'}</button>
    <div className="act-ctrl-card"><span className="controller-eyebrow">HOST TIP</span><p style={{ margin: '0.4rem 0 0', color: 'var(--muted)' }}>Let the room argue its case before revealing. Use a scoreboard for points.</p></div>
    <button type="button" className="act-btn act-btn-secondary" style={{ opacity: 0.75 }} onClick={() => reset('Reset Rank It to the first round?')} disabled={isBusy}>🔄 Reset Rank It</button>
  </div>;
};

export const RankItEditor: React.FC<{ config: Record<string, unknown>; onChange: (updated: Record<string, unknown>) => void }> = ({ config, onChange }) => {
  const current = config as RankConfig;
  const rounds = rankRounds(current);
  const [activeIndex, setActiveIndex] = useState(0);
  const index = Math.min(activeIndex, rounds.length - 1);
  const round = rounds[index];
  const updateRounds = (next: RankRound[]) => onChange({ ...current, rounds: next });
  const updateRound = (changes: Partial<RankRound>) => updateRounds(rounds.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const addRound = () => { const next = [...rounds, { id: `r-${Date.now()}`, prompt: 'Rank these items...', items: [{ id: `${Date.now()}-1`, label: 'Item 1' }, { id: `${Date.now()}-2`, label: 'Item 2' }], revealNote: '', category: 'New round' }]; updateRounds(next); setActiveIndex(next.length - 1); };
  const removeRound = () => { if (rounds.length <= 1) return; updateRounds(rounds.filter((_, itemIndex) => itemIndex !== index)); setActiveIndex(Math.max(0, index - 1)); };
  const updateItem = (itemIndex: number, changes: Partial<RankItem>) => updateRound({ items: round.items.map((item, currentItemIndex) => currentItemIndex === itemIndex ? { ...item, ...changes } : item) });
  const addItem = () => updateRound({ items: [...round.items, { id: `i-${Date.now()}`, label: `Item ${round.items.length + 1}`, icon: '◆' }] });
  const removeItem = (itemIndex: number) => round.items.length > 2 && updateRound({ items: round.items.filter((_, currentItemIndex) => currentItemIndex !== itemIndex) });
  return <ActivityEditorShell>
    <TitleField value={current.title} onChange={title => onChange({ ...current, title })} placeholder="e.g. Rank It!" />
    <TextField label="Stage instruction" value={current.instruction} onChange={instruction => onChange({ ...current, instruction })} placeholder="Put the items in the right order" />
    <RoundTabs count={rounds.length} activeIndex={index} onSelect={setActiveIndex} onAdd={addRound} label="Round" />
    <div className="activity-editor-card"><div className="activity-editor-card-heading"><strong>Round {index + 1}</strong>{rounds.length > 1 && <button type="button" className="button danger" onClick={removeRound}>Delete round</button>}</div>
      <TextField label="Prompt" value={round.prompt} onChange={prompt => updateRound({ prompt })} multiline />
      <TextField label="Category" value={round.category} onChange={category => updateRound({ category })} placeholder="Warm-up, story, sports..." />
      <div className="activity-editor-card-heading"><strong>Correct order (top to bottom)</strong><button type="button" className="button" onClick={addItem}>+ Add item</button></div>
      <div className="rank-it-editor-items">{round.items.map((item, itemIndex) => <div className="rank-it-editor-item" key={item.id || itemIndex}><span>{itemIndex + 1}</span><input value={item.icon || ''} onChange={event => updateItem(itemIndex, { icon: event.target.value })} aria-label={`Icon for item ${itemIndex + 1}`} /><input value={item.label} onChange={event => updateItem(itemIndex, { label: event.target.value })} aria-label={`Rank item ${itemIndex + 1}`} /><button type="button" className="button danger" onClick={() => removeItem(itemIndex)} disabled={round.items.length <= 2} aria-label={`Remove item ${itemIndex + 1}`}>×</button></div>)}</div>
      <TextField label="Reveal note (optional)" value={round.revealNote} onChange={revealNote => updateRound({ revealNote })} placeholder="Explain the tiebreaker or celebrate the answer" />
    </div>
  </ActivityEditorShell>;
};

// ---------------------------------------------------------------------------
// Word Scramble
// ---------------------------------------------------------------------------

function defaultScrambleRounds(): ScrambleRound[] {
  return [{ id: 'r1', word: 'CREATIVE', clue: 'A way to make something new', category: 'Making', hint: 'It starts with C and ends with E.', points: 100, scrambledWord: 'EIVTAERC' }];
}

function scrambleRounds(config: ScrambleConfig): ScrambleRound[] {
  return config.rounds?.length ? config.rounds : defaultScrambleRounds();
}

function generatedScramble(word: string, supplied?: string): string {
  if (supplied) return supplied;
  const letters = word.replace(/\s+/g, '').split('');
  if (letters.length < 2) return word;
  return `${letters.slice(1).reverse().join('')}${letters[0]}`;
}

export const WordScrambleDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const state = (envelope.state as ScrambleState) || {};
  const config = ((envelope as unknown as { config?: ScrambleConfig }).config || {});
  const rounds = scrambleRounds(config);
  const index = Math.min(Math.max(0, state.currentRoundIndex ?? 0), rounds.length - 1);
  const round = rounds[index];
  const liveRemainingMs = useTargetCountdown(state.isRunning, state.targetAt);
  const remainingMs = state.isRunning ? liveRemainingMs : state.remainingMs || 0;
  const timedOut = Boolean(state.isRunning && state.targetAt && remainingMs === 0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastSecondRef = useRef<number | null>(null);

  useEffect(() => {
    const seconds = Math.ceil(remainingMs / 1000);
    if (!state.isRunning || seconds <= 0 || seconds > 5) {
      lastSecondRef.current = null;
      return;
    }
    if (lastSecondRef.current !== seconds) {
      lastSecondRef.current = seconds;
      playCountdownTickSound(true);
    }
  }, [state.isRunning, remainingMs]);
  useEffect(() => {
    if (state.answerRevealed) {
      playChimeSound();
      playFanfareSound();
      launchConfetti(containerRef.current, 90);
    }
  }, [state.answerRevealed]);

  return <div ref={containerRef} className="activity-stage new-game-stage word-scramble-stage"><div className="activity-stage-content">
    <div className="activity-header"><div className="stage-kicker">🔤 WORD SCRAMBLE · {roundStatus(index, rounds.length)}{round.category ? ` · ${round.category}` : ''}</div><h1 className="activity-title">{config.title || envelope.name || 'Word Scramble'}</h1><div className="activity-subtitle">{config.instruction || 'Unscramble the word before time runs out!'}</div></div>
    <div className={`new-game-timer ${timedOut ? 'expired' : remainingMs <= 5000 && state.isRunning ? 'urgent' : ''}`}><span>{state.isRunning || state.remainingMs ? formatSeconds(remainingMs) : state.answerRevealed ? '✓' : '—'}</span><small>{state.isRunning ? 'SECONDS' : state.answerRevealed ? 'SOLVED' : state.remainingMs ? 'PAUSED' : 'READY?'}</small></div>
    <div className="scramble-word-card"><span className="new-game-points-chip">{round.points || 100} POINTS</span><div className="scramble-letters" aria-label="Scrambled word">{generatedScramble(round.word, round.scrambledWord).split('').map((letter, letterIndex) => <span key={`${letter}-${letterIndex}`}>{letter}</span>)}</div><div className="scramble-clue">CLUE · {round.clue}</div></div>
    {state.hintRevealed && round.hint && <div className="new-game-hint">🧩 HINT · {round.hint}</div>}
    {state.answerRevealed ? <div className="new-game-answer-card"><span>THE WORD</span><strong>{round.word}</strong></div> : <div className="new-game-waiting">Say it out loud when your team has it!</div>}
  </div></div>;
};

export const WordScrambleController: React.FC<ActivityProps> = ({ envelope, onCommandSent }) => {
  const state = (envelope.state as ScrambleState) || {};
  const config = ((envelope as unknown as { config?: ScrambleConfig }).config || {});
  const rounds = scrambleRounds(config);
  const index = Math.min(Math.max(0, state.currentRoundIndex ?? 0), rounds.length - 1);
  const round = rounds[index];
  const liveRemainingMs = useTargetCountdown(state.isRunning, state.targetAt);
  const remainingMs = state.isRunning ? liveRemainingMs : state.remainingMs || 0;
  const { isBusy, sendAction, reset } = useActivityCommands(envelope, onCommandSent);
  return <div className="act-ctrl-container">
    <div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">WORD SCRAMBLE</span><strong>{roundStatus(index, rounds.length)}</strong><small>{round?.clue}</small></div><strong className="controller-score">{round?.points || 100}<small> pts</small></strong></div>
    <div className="new-game-controller-timer"><span>{state.isRunning || state.remainingMs ? formatSeconds(remainingMs) : '—'}</span><small>{state.isRunning ? 'LIVE TIMER' : state.remainingMs ? 'PAUSED' : `${config.secondsPerRound || 30}s round`}</small></div>
    <div className="act-controller-button-row"><button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('prev')} disabled={isBusy || index <= 0}>‹ Previous</button><button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('next')} disabled={isBusy || index >= rounds.length - 1}>Next ›</button></div>
    <button type="button" className={`act-btn ${state.isRunning ? 'act-btn-danger' : 'act-btn-primary'}`} style={{ height: 62, fontSize: '1.2rem' }} onClick={() => sendAction(state.isRunning ? 'pause' : 'start')} disabled={isBusy || Boolean(state.answerRevealed)}>{state.isRunning ? '❚❚ PAUSE CLOCK' : '▶ START ROUND'}</button>
    <div className="act-controller-button-row"><SendActionButton action={state.hintRevealed ? 'hidehint' : 'showhint'} label={state.hintRevealed ? '↩ Hide hint' : '🧩 Show hint'} sendAction={sendAction} isBusy={isBusy} className="act-btn act-btn-primary" disabled={!round?.hint} /><SendActionButton action={state.answerRevealed ? 'hideanswer' : 'reveal'} label={state.answerRevealed ? '↩ Hide answer' : '✨ Reveal answer'} sendAction={sendAction} isBusy={isBusy} className="act-btn act-btn-gold" /></div>
    <button type="button" className="act-btn act-btn-secondary" style={{ opacity: 0.75 }} onClick={() => reset('Reset Word Scramble to the first round?')} disabled={isBusy}>🔄 Reset Word Scramble</button>
  </div>;
};

export const WordScrambleEditor: React.FC<{ config: Record<string, unknown>; onChange: (updated: Record<string, unknown>) => void }> = ({ config, onChange }) => {
  const current = config as ScrambleConfig;
  const rounds = scrambleRounds(current);
  const [activeIndex, setActiveIndex] = useState(0);
  const index = Math.min(activeIndex, rounds.length - 1);
  const round = rounds[index];
  const updateRounds = (next: ScrambleRound[]) => onChange({ ...current, rounds: next });
  const updateRound = (changes: Partial<ScrambleRound>) => updateRounds(rounds.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const addRound = () => { const next = [...rounds, { id: `r-${Date.now()}`, word: 'NEWWORD', clue: 'Add a clue', category: 'New round', hint: '', points: 100, scrambledWord: 'WEDRONW' }]; updateRounds(next); setActiveIndex(next.length - 1); };
  const removeRound = () => { if (rounds.length <= 1) return; updateRounds(rounds.filter((_, itemIndex) => itemIndex !== index)); setActiveIndex(Math.max(0, index - 1)); };
  return <ActivityEditorShell>
    <TitleField value={current.title} onChange={title => onChange({ ...current, title })} placeholder="e.g. Word Scramble" />
    <TextField label="Stage instruction" value={current.instruction} onChange={instruction => onChange({ ...current, instruction })} placeholder="Unscramble the word!" />
    <NumberField label="Seconds per round" value={current.secondsPerRound ?? 30} min={5} max={600} onChange={secondsPerRound => onChange({ ...current, secondsPerRound })} />
    <RoundTabs count={rounds.length} activeIndex={index} onSelect={setActiveIndex} onAdd={addRound} label="Round" />
    <div className="activity-editor-card"><div className="activity-editor-card-heading"><strong>Round {index + 1}</strong>{rounds.length > 1 && <button type="button" className="button danger" onClick={removeRound}>Delete round</button>}</div>
      <div className="new-game-editor-inline-fields"><TextField label="Answer word" value={round.word} onChange={word => updateRound({ word })} placeholder="CREATIVE" /><TextField label="Scrambled letters" value={round.scrambledWord || generatedScramble(round.word)} onChange={scrambledWord => updateRound({ scrambledWord })} placeholder="EIVTAERC" /></div>
      <TextField label="Clue" value={round.clue} onChange={clue => updateRound({ clue })} placeholder="A clue for the room" />
      <div className="new-game-editor-inline-fields"><TextField label="Category" value={round.category} onChange={category => updateRound({ category })} placeholder="Stories, people..." /><NumberField label="Points" value={round.points ?? 100} min={0} max={10000} onChange={points => updateRound({ points })} /></div>
      <TextField label="Hint (optional)" value={round.hint} onChange={hint => updateRound({ hint })} placeholder="A gentle nudge after the timer starts" />
    </div>
  </ActivityEditorShell>;
};

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

function defaultPredictionRounds(): PredictionRound[] {
  return [{ id: 'r1', prompt: 'Which team will score first?', options: ['Gold', 'Green', 'Blue', 'Red'], correctIndex: 0, explanation: 'Gold is the sample answer for this warm-up round.', points: 100, category: 'Warm-up' }];
}

function predictionRounds(config: PredictionConfig): PredictionRound[] {
  return config.rounds?.length ? config.rounds : defaultPredictionRounds();
}

export const PredictionDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const state = (envelope.state as PredictionState) || {};
  const config = ((envelope as unknown as { config?: PredictionConfig }).config || {});
  const rounds = predictionRounds(config);
  const index = Math.min(Math.max(0, state.currentRoundIndex ?? 0), rounds.length - 1);
  const round = rounds[index];
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (state.answerRevealed) {
      playChimeSound();
      launchConfetti(containerRef.current, 80);
    }
  }, [state.answerRevealed]);

  return <div ref={containerRef} className="activity-stage new-game-stage prediction-stage"><div className="activity-stage-content">
    <div className="activity-header"><div className="stage-kicker">🔮 PREDICTION · {roundStatus(index, rounds.length)}{round.category ? ` · ${round.category}` : ''}</div><h1 className="activity-title">{config.title || envelope.name || 'Make Your Prediction'}</h1><div className="activity-subtitle">{config.instruction || 'Lock in your prediction before the reveal!'}</div></div>
    <div className={`prediction-lockup ${state.responsesOpen ? 'open' : state.answerRevealed ? 'revealed' : ''}`}><span>{state.answerRevealed ? 'THE MOMENT OF TRUTH' : state.responsesOpen ? 'PREDICTIONS OPEN' : 'WAITING FOR THE HOST'}</span><strong>{state.answerRevealed ? 'REVEALED' : state.responsesOpen ? 'MAKE YOUR PICK' : 'GET READY'}</strong></div>
    <div className="new-game-prompt-card"><span className="new-game-category">{round.points || 100} POINTS{round.category ? ` · ${round.category}` : ''}</span><h2>{round.prompt}</h2></div>
    <div className="new-game-choice-grid prediction-choice-grid" style={{ gridTemplateColumns: `repeat(${round.options.length <= 2 ? 1 : round.options.length <= 4 ? 2 : 4}, minmax(0, 1fr))` }}>{round.options.map((option, optionIndex) => { const isCorrect = optionIndex === (state.revealedCorrectIndex ?? round.correctIndex); return <div className={`new-game-choice ${state.answerRevealed ? isCorrect ? 'correct' : 'wrong' : state.responsesOpen ? 'prediction-open' : ''}`} key={`${option}-${optionIndex}`}><span className="new-game-choice-letter" style={{ background: OPTION_COLORS[optionIndex % OPTION_COLORS.length] }}>{OPTION_LETTERS[optionIndex]}</span><span>{option}</span>{state.answerRevealed && isCorrect && <strong>✓ THE CALL</strong>}</div>; })}</div>
    {state.explanationRevealed && (state.revealedExplanation || round.explanation) && <div className="new-game-explanation">💡 {state.revealedExplanation || round.explanation}</div>}
  </div></div>;
};

export const PredictionController: React.FC<ActivityProps> = ({ envelope, onCommandSent }) => {
  const state = (envelope.state as PredictionState) || {};
  const config = ((envelope as unknown as { config?: PredictionConfig }).config || {});
  const rounds = predictionRounds(config);
  const index = Math.min(Math.max(0, state.currentRoundIndex ?? 0), rounds.length - 1);
  const round = rounds[index];
  const { isBusy, sendAction, reset } = useActivityCommands(envelope, onCommandSent);
  return <div className="act-ctrl-container">
    <div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">PREDICTION ROUND</span><strong>{roundStatus(index, rounds.length)}</strong><small>{round?.prompt}</small></div><strong className="controller-score">{round?.points || 100}<small> pts</small></strong></div>
    <div className="act-controller-button-row"><button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('prev')} disabled={isBusy || index <= 0}>‹ Previous</button><button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('next')} disabled={isBusy || index >= rounds.length - 1}>Next ›</button></div>
    <button type="button" className={`act-btn ${state.responsesOpen ? 'act-btn-danger' : 'act-btn-primary'}`} style={{ height: 60, fontSize: '1.15rem' }} onClick={() => sendAction(state.responsesOpen ? 'close' : 'open')} disabled={isBusy || Boolean(state.answerRevealed)}>{state.responsesOpen ? '❚❚ CLOSE PREDICTIONS' : '▶ OPEN PREDICTIONS'}</button>
    <div className="act-controller-button-row"><SendActionButton action={state.answerRevealed ? 'hideanswer' : 'reveal'} label={state.answerRevealed ? '↩ Hide answer' : '✨ Reveal answer'} sendAction={sendAction} isBusy={isBusy} className="act-btn act-btn-gold" /><SendActionButton action={state.explanationRevealed ? 'hideexplanation' : 'showexplanation'} label={state.explanationRevealed ? 'Hide note' : '💡 Show note'} sendAction={sendAction} isBusy={isBusy} className="act-btn act-btn-primary" disabled={!round?.explanation} /></div>
    <button type="button" className="act-btn act-btn-secondary" style={{ opacity: 0.75 }} onClick={() => reset('Reset Prediction to the first round?')} disabled={isBusy}>🔄 Reset Predictions</button>
  </div>;
};

type ChoiceEditorConfig = {
  title?: string;
  questions?: RapidFireQuestion[];
  rounds?: PredictionRound[];
  defaultTimerSeconds?: number;
};

function MultipleChoiceEditor({
  config,
  onChange,
  collectionKey,
  label,
  placeholder,
  includeTimer
}: {
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
  collectionKey: 'questions' | 'rounds';
  label: string;
  placeholder: string;
  includeTimer?: boolean;
}) {
  const current = config as ChoiceEditorConfig;
  const fallback: RapidFireQuestion[] = collectionKey === 'questions' ? defaultRapidQuestions() : defaultPredictionRounds();
  const items = ((current[collectionKey] as RapidFireQuestion[] | undefined)?.length ? current[collectionKey] as RapidFireQuestion[] : fallback);
  const [activeIndex, setActiveIndex] = useState(0);
  const index = Math.min(activeIndex, items.length - 1);
  const item = items[index];
  const updateItems = (next: RapidFireQuestion[]) => onChange({ ...current, [collectionKey]: next });
  const updateItem = (changes: Partial<RapidFireQuestion>) => updateItems(items.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...changes } : entry));
  const addItem = () => {
    const next = [...items, { id: `${collectionKey[0]}-${Date.now()}`, prompt: `New ${label.toLowerCase()} ${items.length + 1}`, options: ['Option A', 'Option B', 'Option C'], correctIndex: 0, explanation: '', points: 100, ...(includeTimer ? { timerSeconds: current.defaultTimerSeconds || 15 } : {}) }];
    updateItems(next);
    setActiveIndex(next.length - 1);
  };
  const removeItem = () => { if (items.length <= 1) return; updateItems(items.filter((_, entryIndex) => entryIndex !== index)); setActiveIndex(Math.max(0, index - 1)); };
  const updateOption = (optionIndex: number, value: string) => updateItem({ options: item.options.map((option, entryIndex) => entryIndex === optionIndex ? value : option) });
  const addOption = () => item.options.length < 8 && updateItem({ options: [...item.options, `Option ${String.fromCharCode(65 + item.options.length)}`] });
  const removeOption = (optionIndex: number) => {
    if (item.options.length <= 2) return;
    const options = item.options.filter((_, entryIndex) => entryIndex !== optionIndex);
    const correctIndex = item.correctIndex === optionIndex ? 0 : item.correctIndex > optionIndex ? item.correctIndex - 1 : item.correctIndex;
    updateItem({ options, correctIndex: Math.min(correctIndex, options.length - 1) });
  };
  return <ActivityEditorShell>
    <TitleField value={current.title} onChange={title => onChange({ ...current, title })} placeholder={placeholder} />
    {includeTimer && <NumberField label="Default seconds per question" value={current.defaultTimerSeconds ?? 15} min={3} max={600} onChange={defaultTimerSeconds => onChange({ ...current, defaultTimerSeconds })} />}
    <RoundTabs count={items.length} activeIndex={index} onSelect={setActiveIndex} onAdd={addItem} label={label} />
    <div className="activity-editor-card"><div className="activity-editor-card-heading"><strong>{label} {index + 1}</strong>{items.length > 1 && <button type="button" className="button danger" onClick={removeItem}>Delete {label.toLowerCase()}</button>}</div>
      <TextField label="Prompt" value={item.prompt} onChange={prompt => updateItem({ prompt })} multiline />
      <div className="activity-editor-card-heading"><strong>Choices (2–8)</strong><span className="activity-editor-help">Select the correct choice</span></div>
      <div className="new-game-editor-options">{item.options.map((option, optionIndex) => <div className="new-game-editor-option" key={optionIndex}><input type="radio" name={`${collectionKey}-correct-${item.id}`} checked={item.correctIndex === optionIndex} onChange={() => updateItem({ correctIndex: optionIndex })} aria-label={`Mark choice ${optionIndex + 1} correct`} /><span className="new-game-choice-letter" style={{ background: OPTION_COLORS[optionIndex % OPTION_COLORS.length] }}>{OPTION_LETTERS[optionIndex]}</span><input value={option} onChange={event => updateOption(optionIndex, event.target.value)} aria-label={`Choice ${optionIndex + 1}`} /><button type="button" className="button danger" onClick={() => removeOption(optionIndex)} disabled={item.options.length <= 2} aria-label={`Remove choice ${optionIndex + 1}`}>×</button></div>)}</div>
      <button type="button" className="button" onClick={addOption} disabled={item.options.length >= 8}>+ Add choice</button>
      <div className="new-game-editor-inline-fields"><NumberField label="Points" value={item.points ?? 100} min={0} max={10000} onChange={points => updateItem({ points })} />{includeTimer && <NumberField label="This question's timer" value={item.timerSeconds ?? current.defaultTimerSeconds ?? 15} min={3} max={600} onChange={timerSeconds => updateItem({ timerSeconds })} />}</div>
      {!includeTimer && <TextField label="Category" value={item.category} onChange={category => updateItem({ category })} placeholder="Warm-up, story, tie-breaker..." />}
      <TextField label="Host note / explanation" value={item.explanation} onChange={explanation => updateItem({ explanation })} placeholder="Optional explanation after the reveal" />
    </div>
  </ActivityEditorShell>;
}

export const PredictionEditor: React.FC<{ config: Record<string, unknown>; onChange: (updated: Record<string, unknown>) => void }> = props => <MultipleChoiceEditor {...props} collectionKey="rounds" label="Round" placeholder="e.g. Make Your Prediction" />;
