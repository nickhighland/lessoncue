import React, { useEffect, useRef, useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';
import { launchConfetti } from '../../effects';
import { ActivityPresetPicker } from '../../ActivityPresetPicker';
import { POLL_PRESETS } from '../../activityPresetRegistry';

// ============================================================================
// Live Poll
// ============================================================================

interface PollOption {
  id: string;
  text: string;
}

function normalizePollOptions(value: unknown): PollOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === 'string') return { id: String(index), text: item };
    if (!item || typeof item !== 'object') return null;
    const option = item as { id?: unknown; text?: unknown; label?: unknown };
    const text = String(option.text ?? option.label ?? '').trim();
    return text ? { id: String(option.id ?? index), text } : null;
  }).filter((item): item is PollOption => item !== null);
}

export const PollDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const state = (envelope.state as {
    votes?: Record<string, number>;
    totalVotes?: number;
    resultsVisible?: boolean;
    winningOptionIndex?: number;
    winningOptionIndices?: number[];
    scoringMode?: string;
    winningVoteCount?: number;
  }) || {};
  const config = (envelope as unknown as { config?: { question?: string; prompt?: string; options?: unknown[]; rounds?: Array<{ question?: string; prompt?: string; options?: unknown[] }>; presetLabel?: string; pollMode?: string } }).config || {};
  const rounds = Array.isArray(config.rounds) && config.rounds.length ? config.rounds : [];
  const stateRoundIndex = typeof (state as { currentRoundIndex?: unknown }).currentRoundIndex === 'number'
    ? (state as { currentRoundIndex: number }).currentRoundIndex
    : 0;
  const round = rounds[Math.min(Math.max(0, stateRoundIndex), Math.max(0, rounds.length - 1))];
  const roundOptions = normalizePollOptions(round?.options);
  const options = roundOptions.length ? roundOptions : normalizePollOptions(config.options).length ? normalizePollOptions(config.options) : [
    { id: '1', text: 'Option A' },
    { id: '2', text: 'Option B' }
  ];
  const votes = state.votes || {};
  const totalVotes = state.totalVotes || Object.values(votes).reduce((sum, count) => sum + count, 0);
  const resultsVisible = state.resultsVisible !== false;
  const winningOptions = state.winningOptionIndices?.length ? state.winningOptionIndices : typeof state.winningOptionIndex === 'number' ? [state.winningOptionIndex] : [];
  const scoringLabel = state.scoringMode === 'minority' ? 'MINORITY PICKS SCORE' : state.scoringMode === 'prediction' ? 'ROOM PREDICTIONS SCORE' : state.scoringMode === 'majority' ? 'MAJORITY PICKS SCORE' : '';

  const colors = ['#00F0FF', '#FF007F', '#FFE600', '#00FF66', '#B026FF', '#FF9100'];

  return (
    <div className="activity-stage poll-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">📊 {config.presetLabel || 'LIVE AUDIENCE POLL'} · {totalVotes} {totalVotes === 1 ? 'VOTE' : 'VOTES'}</div>
          <h1 className="activity-title">{round?.question || round?.prompt || config.question || config.prompt || envelope.name || 'Live Poll'}</h1>
          {rounds.length > 1 && <div className="activity-subtitle">ROUND {Math.min(Math.max(0, stateRoundIndex), rounds.length - 1) + 1} OF {rounds.length}</div>}
        </div>
        {resultsVisible && scoringLabel && <div className="poll-scoring-banner">{scoringLabel}{typeof state.winningVoteCount === 'number' && <strong>{state.winningVoteCount} {state.winningVoteCount === 1 ? 'pick' : 'picks'}</strong>}</div>}

        <div className="poll-results-list">
          {options.map((opt, idx) => {
            const optionVotes = votes[opt.id] ?? votes[String(idx)] ?? 0;
            const percent = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
            const color = colors[idx % colors.length];
            const winner = resultsVisible && winningOptions.includes(idx);

            return (
              <div key={opt.id || idx} className={`poll-result-row ${winner ? 'winner' : ''}`} style={{ borderColor: color }}>
                {/* Fill Bar Behind */}
                <div
                  className="poll-result-fill"
                  style={{ width: resultsVisible ? `${percent}%` : '0%', background: `${color}33` }}
                />

                <div className="poll-result-content">
                  <span className="poll-result-label">{opt.text}</span>
                  <div className="poll-result-value">
                    {resultsVisible ? <>
                      <span style={{ color }}>{percent}%</span>
                      <small>({optionVotes})</small>
                      {winner && <b className="poll-winner-badge">SCORE</b>}
                    </> : <span className="poll-results-hidden">Results hidden</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const PollController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const state = (envelope.state as { resultsVisible?: boolean; responsesOpen?: boolean; currentRoundIndex?: number }) || {};
  const config = (envelope.config as { rounds?: unknown[] } | undefined) || {};
  const roundCount = Array.isArray(config.rounds) ? config.rounds.length : 0;
  const roundIndex = Math.min(Math.max(0, state.currentRoundIndex || 0), Math.max(0, roundCount - 1));

  const sendAction = async (action: string, payload?: Record<string, unknown>) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action,
        payload
      });
      onCommandSent?.();
    } catch (err) {
      console.error(`Failed ${action}:`, err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="act-ctrl-container">
      {roundCount > 1 && <div className="act-ctrl-card activity-controller-summary"><div><span className="controller-eyebrow">POLL SEQUENCE</span><strong>Round {roundIndex + 1} of {roundCount}</strong><small>Advance only after the room has seen the current result.</small></div><div className="act-controller-button-row"><button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('previous')} disabled={isBusy || roundIndex <= 0}>‹ Previous</button><button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('next')} disabled={isBusy || roundIndex >= roundCount - 1}>Next ›</button></div></div>}
      <div className="act-controller-button-row">
        <button
          type="button"
          className={`act-btn ${state.responsesOpen ? 'act-btn-danger' : 'act-btn-primary'}`}
          style={{ flex: 1 }}
          onClick={() => sendAction(state.responsesOpen ? 'close' : 'open')}
          disabled={isBusy}
        >
          {state.responsesOpen ? '❚❚ Close Voting' : '▶ Open Voting'}
        </button>

        <button
          type="button"
          className="act-btn act-btn-gold"
          style={{ flex: 1 }}
          onClick={() => sendAction(state.resultsVisible ? 'hideresults' : 'showresults')}
          disabled={isBusy}
        >
          {state.resultsVisible ? 'Hide Results' : 'Show Results'}
        </button>
      </div>

      <button
        type="button"
        className="act-btn act-btn-secondary"
        style={{ opacity: 0.7 }}
        onClick={async () => {
          if (!window.confirm('Reset all poll votes to 0?')) return;
          setIsBusy(true);
          try {
            await ActivityApi.resetRun(envelope.runId);
            onCommandSent?.();
          } finally {
            setIsBusy(false);
          }
        }}
        disabled={isBusy}
      >
        🔄 Reset Poll
      </button>
    </div>
  );
};

export const PollEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const current = config as { question?: string; prompt?: string; options?: unknown[]; rounds?: Array<{ id?: string; question?: string; prompt?: string; options?: unknown[] }>; preset?: string; presetLabel?: string; pollMode?: string; points?: number };
  const hasRounds = Array.isArray(current.rounds);
  const rounds = hasRounds && current.rounds?.length ? current.rounds : [{ id: 'round-1', question: current.question || current.prompt || '', options: current.options || ['Option A', 'Option B'] }];
  const [activeIndex, setActiveIndex] = useState(0);
  const roundIndex = Math.min(activeIndex, Math.max(0, rounds.length - 1));
  const round = rounds[roundIndex] || rounds[0];
  const options = normalizePollOptions(round?.options);
  const updateRounds = (next: typeof rounds) => onChange({ ...current, rounds: next });
  const updateRound = (changes: Partial<(typeof rounds)[number]>) => updateRounds(rounds.map((item, index) => index === roundIndex ? { ...item, ...changes } : item));
  const updateOptions = (next: PollOption[]) => {
    if (hasRounds) updateRound({ options: next.map(option => option.text) });
    else onChange({ ...current, options: next.map(option => option.text), question: current.question || current.prompt || '' });
  };
  const addRound = () => {
    const next = [...rounds, { id: `round-${Date.now()}`, question: `Round ${rounds.length + 1}`, options: ['Option A', 'Option B'] }];
    updateRounds(next);
    setActiveIndex(next.length - 1);
  };
  const removeRound = () => {
    if (!hasRounds || rounds.length <= 1) return;
    const next = rounds.filter((_, index) => index !== roundIndex);
    updateRounds(next);
    setActiveIndex(Math.max(0, roundIndex - 1));
  };
  const applyPreset = (preset: { config: Record<string, unknown> }) => {
    const next = { ...current, ...preset.config };
    if (!Array.isArray(preset.config.rounds)) delete next.rounds;
    if (typeof preset.config.pollMode !== 'string') delete next.pollMode;
    onChange(next);
  };
  return (
    <div className="activity-editor-form">
      <ActivityPresetPicker
        label="Poll format"
        value={typeof current.preset === 'string' ? current.preset : 'readTheRoom'}
        templates={POLL_PRESETS}
        onPresetChange={preset => onChange({ ...current, preset: preset.id, presetLabel: preset.label.toUpperCase() })}
        onApply={applyPreset}
      />
      <div className="activity-editor-row">
        <label className="activity-editor-label">Scoring mode
          <select value={current.pollMode || ''} onChange={event => onChange({ ...current, pollMode: event.target.value || undefined })}>
            <option value="">Live poll only</option>
            <option value="majority">Majority prediction</option>
            <option value="minority">Minority prediction</option>
            <option value="prediction">Predict the room</option>
          </select>
        </label>
        {current.pollMode && <label className="activity-editor-label">Points per correct prediction
          <input type="number" min={0} max={1000} value={current.points ?? 100} onChange={event => onChange({ ...current, points: Math.max(0, Math.min(1000, Number(event.target.value) || 0)) })} />
        </label>}
      </div>
      <label className="activity-editor-label">Poll question
        <textarea rows={2} value={round?.question || round?.prompt || ''} onChange={event => hasRounds ? updateRound({ question: event.target.value }) : onChange({ ...current, question: event.target.value })} placeholder="What should the room choose?" />
      </label>
      <div className="activity-editor-card-heading"><strong>{hasRounds ? `Rounds (${rounds.length})` : 'Single round'}</strong><div className="act-controller-button-row"><button type="button" className="button" onClick={addRound}>+ Add round</button>{hasRounds && <button type="button" className="button danger" onClick={removeRound} disabled={rounds.length <= 1}>Remove round</button>}</div></div>
      {hasRounds && <div className="activity-editor-tabs" aria-label="Poll rounds">{rounds.map((item, index) => <button type="button" key={item.id || index} className={`button ${index === roundIndex ? 'primary' : ''}`} onClick={() => setActiveIndex(index)}>Round {index + 1}</button>)}</div>}
      <div className="activity-editor-card-heading"><strong>Choices ({options.length})</strong><button type="button" className="button" disabled={options.length >= 8} onClick={() => updateOptions([...options, { id: String(options.length), text: `Choice ${options.length + 1}` }])}>+ Add choice</button></div>
      <div className="survey-editor-answers">
        {options.map((option, index) => (
          <div className="survey-editor-answer" key={option.id || index}>
            <span>#{index + 1}</span>
            <input value={option.text} onChange={event => updateOptions(options.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} aria-label={`Poll choice ${index + 1}`} />
            <button type="button" className="button danger" onClick={() => updateOptions(options.filter((_, itemIndex) => itemIndex !== index))} disabled={options.length <= 2} aria-label={`Remove poll choice ${index + 1}`}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// Multi-Question Live Q&A Wall (Jackbox Style)
// ============================================================================

interface QAQuestion {
  id: string;
  prompt: string;
  category?: string;
}

interface QAResponse {
  id: string;
  questionId: string;
  text: string;
  author?: string;
  upvotes?: number;
  approved?: boolean;
  featured?: boolean;
  createdAt?: string;
}

interface QAConfig {
  title?: string;
  questions?: QAQuestion[];
  prompt?: string;
  requireModeration?: boolean;
  displayStyle?: string;
}

interface QAState {
  activeQuestionIndex?: number;
  responsesOpen?: boolean;
  featuredResponseId?: string | null;
  responses?: QAResponse[];
  approvedCount?: number;
}

export const ResponsesDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const state: QAState = (envelope.state as QAState) || {};
  const config: QAConfig = ((envelope as unknown as { config?: QAConfig }).config) || {};

  const questions: QAQuestion[] = (config.questions && config.questions.length > 0)
    ? config.questions
    : [
        { id: 'q1', prompt: config.prompt || envelope.name || "What's on your mind today?", category: 'Live Discussion' },
        { id: 'q2', prompt: 'Share your favorite takeaway or reflection:', category: 'Takeaway' },
        { id: 'q3', prompt: 'Send in your questions or praises:', category: 'Q&A' }
      ];

  const activeIndex = Math.min(Math.max(0, state.activeQuestionIndex ?? 0), questions.length - 1);
  const currentQ = questions[activeIndex] || questions[0];

  const allResponses: QAResponse[] = state.responses || [];
  // Filter for active question and approved (or if moderation not required)
  const questionResponses = allResponses.filter(
    r => (r.questionId === currentQ.id || (!r.questionId && activeIndex === 0)) && (r.approved !== false)
  );

  const featured = allResponses.find(r => r.id === state.featuredResponseId);

  useEffect(() => {
    if (state.featuredResponseId) {
      launchConfetti(containerRef.current, 80);
    }
  }, [state.featuredResponseId]);

  return (
    <div ref={containerRef} className="activity-stage">
      <div className="activity-stage-content" style={{ justifyContent: 'flex-start', paddingTop: '2.5rem' }}>
        <div className="qa-wall-container">
          {/* Question Banner with Badge */}
          <div className="qa-question-banner">
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', alignItems: 'center' }}>
              <span className="qa-question-badge">
                {currentQ.category || `Question ${activeIndex + 1} of ${questions.length}`}
              </span>
              <span style={{ color: '#c0d1cb', fontSize: '0.85rem', fontWeight: 600 }}>
                {questionResponses.length} {questionResponses.length === 1 ? 'Response' : 'Responses'}
              </span>
            </div>
            <h1 className="qa-question-text">
              {currentQ.prompt}
            </h1>
          </div>

          {/* Response Bubble Wall */}
          {questionResponses.length === 0 ? (
            <div style={{ marginTop: '4rem', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>💬</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>
                Waiting for audience responses...
              </div>
              <div style={{ fontSize: '1rem', color: '#a0aec0', marginTop: '0.25rem' }}>
                Scan the QR code to post your thought or question!
              </div>
            </div>
          ) : (
            <div className="qa-wall-masonry">
              {questionResponses.map((item, idx) => {
                const bubbleColors = [
                  '#fef08a', '#bbf7d0', '#fed7aa', '#bae6fd', '#e9d5ff', '#fbcfe8'
                ];
                const cardBg = bubbleColors[idx % bubbleColors.length];

                return (
                  <div
                    key={item.id || idx}
                    className="qa-bubble-card"
                    style={{ background: cardBg }}
                  >
                    <div className="qa-bubble-text">
                      “{item.text}”
                    </div>
                    <div className="qa-bubble-footer">
                      <span style={{ fontWeight: 800, color: '#374151' }}>
                        {item.author ? `— ${item.author}` : '— Guest'}
                      </span>
                      {(item.upvotes || 0) > 0 && (
                        <span style={{ fontWeight: 800, color: '#dc2626' }}>
                          ❤️ {item.upvotes}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Featured Spotlight Pop-out Modal */}
          {featured && (
            <div className="qa-spotlight-overlay">
              <div className="qa-spotlight-card">
                <div style={{ display: 'inline-block', background: 'var(--act-gold)', color: '#2b1800', fontWeight: 900, padding: '0.3rem 1rem', borderRadius: '999px', fontSize: '1rem', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
                  ⭐ Spotlight
                </div>
                <div style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 900, color: '#111827', lineHeight: 1.3 }}>
                  “{featured.text}”
                </div>
                {featured.author && (
                  <div style={{ marginTop: '1.5rem', fontSize: '1.6rem', fontWeight: 800, color: 'var(--act-green)' }}>
                    — {featured.author}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ResponsesEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const qaConfig = (config as QAConfig) || {};
  const questions: QAQuestion[] = (qaConfig.questions && qaConfig.questions.length > 0)
    ? qaConfig.questions
    : [
        { id: 'q1', prompt: qaConfig.prompt || "What questions do you have about today's message?", category: 'Discussion' },
        { id: 'q2', prompt: 'Share your favorite takeaway or reflection:', category: 'Takeaway' },
        { id: 'q3', prompt: 'Send in your prayer requests or praises:', category: 'Prayer' }
      ];

  const updateQuestions = (next: QAQuestion[]) => {
    onChange({ ...qaConfig, questions: next });
  };

  const handleAddQuestion = () => {
    const nextIdx = questions.length + 1;
    updateQuestions([
      ...questions,
      { id: `q${Date.now()}`, prompt: `Question ${nextIdx}`, category: 'Discussion' }
    ]);
  };

  const handleRemoveQuestion = (idx: number) => {
    updateQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleQuestionChange = (idx: number, field: keyof QAQuestion, val: string) => {
    const next = [...questions];
    next[idx] = { ...next[idx], [field]: val };
    updateQuestions(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Activity Title
        </label>
        <input
          type="text"
          value={qaConfig.title || ''}
          onChange={e => onChange({ ...qaConfig, title: e.target.value })}
          placeholder="e.g. Live Q&A & Discussion Wall"
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label style={{ fontWeight: 700, color: 'var(--ink)' }}>Prompt Questions ({questions.length})</label>
          <button
            type="button"
            onClick={handleAddQuestion}
            className="button"
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', margin: 0 }}
          >
            + Add Question
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {questions.map((q, idx) => (
            <div
              key={q.id || idx}
              style={{
                background: 'var(--mint)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--ink)' }}>
                  Q{idx + 1}
                </span>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(idx)}
                    className="button danger"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', margin: 0 }}
                  >
                    Delete
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={q.category || ''}
                  onChange={e => handleQuestionChange(idx, 'category', e.target.value)}
                  placeholder="Badge (e.g. Reflection)"
                  style={{ width: '140px', padding: '0.4rem 0.6rem', borderRadius: '6px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
                />
                <input
                  type="text"
                  value={q.prompt}
                  onChange={e => handleQuestionChange(idx, 'prompt', e.target.value)}
                  placeholder="Question prompt text..."
                  style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ResponsesController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const [testText, setTestText] = useState('');
  const [testAuthor, setTestAuthor] = useState('');

  const state: QAState = (envelope.state as QAState) || {};
  const config: QAConfig = ((envelope as unknown as { config?: QAConfig }).config) || {};
  const questions: QAQuestion[] = config.questions || [
    { id: 'q1', prompt: config.prompt || 'Question 1', category: 'Discussion' }
  ];
  const activeIndex = Math.min(Math.max(0, state.activeQuestionIndex ?? 0), questions.length - 1);
  const currentQ = questions[activeIndex] || questions[0];
  const responses = state.responses || [];
  const currentResponses = responses.filter(r => r.questionId === currentQ.id || (!r.questionId && activeIndex === 0));

  const sendAction = async (action: string, payload?: Record<string, unknown>) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action,
        payload
      });
      onCommandSent?.();
    } catch (err) {
      console.error(`Failed ${action}:`, err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddTestResponse = () => {
    if (!testText.trim()) return;
    sendAction('submitresponse', {
      text: testText.trim(),
      author: testAuthor.trim() || undefined,
      questionId: currentQ.id
    });
    setTestText('');
    setTestAuthor('');
  };

  return (
    <div className="act-ctrl-container">
      {/* Question Selector Bar */}
      <div className="act-ctrl-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--muted)' }}>
            Active Prompt ({activeIndex + 1} of {questions.length})
          </h4>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              className="act-btn act-btn-secondary"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
              disabled={isBusy}
              onClick={() => sendAction('prevquestion')}
            >
              ‹ Prev Q
            </button>
            <button
              type="button"
              className="act-btn act-btn-primary"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
              disabled={isBusy}
              onClick={() => sendAction('nextquestion')}
            >
              Next Q ›
            </button>
          </div>
        </div>

        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--ink)', marginBottom: '0.5rem' }}>
          {currentQ.prompt}
        </div>

        {/* Quick Question Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingTop: '0.25rem' }}>
          {questions.map((q, idx) => (
            <button
              key={q.id || idx}
              type="button"
              className={`button ${activeIndex === idx ? 'primary' : ''}`}
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', margin: 0 }}
              onClick={() => sendAction('setquestion', { questionIndex: idx })}
              disabled={isBusy}
            >
              Q{idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Spotlight Control */}
      {state.featuredResponseId && (
        <button
          type="button"
          className="act-btn act-btn-danger"
          onClick={() => sendAction('setfeatured', { responseId: null })}
          disabled={isBusy}
        >
          ✕ Dismiss Spotlight from Screen
        </button>
      )}

      {/* Add Simulated Post (Host Direct Entry) */}
      <div className="act-ctrl-card">
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
          Host Direct Post / Test Entry
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <input
            type="text"
            placeholder="Participant name (optional)"
            value={testAuthor}
            onChange={e => setTestAuthor(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '6px' }}
          />
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="text"
              placeholder="Type message or thought..."
              value={testText}
              onChange={e => setTestText(e.target.value)}
              style={{ flex: 1, padding: '0.4rem 0.6rem', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '6px' }}
              onKeyDown={e => e.key === 'Enter' && handleAddTestResponse()}
            />
            <button
              type="button"
              className="act-btn act-btn-primary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              onClick={handleAddTestResponse}
              disabled={!testText.trim() || isBusy}
            >
              Post
            </button>
          </div>
        </div>
      </div>

      {/* Incoming Responses List */}
      <div className="act-ctrl-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--muted)' }}>
            Responses for Q{activeIndex + 1} ({currentResponses.length})
          </h4>
          {currentResponses.length > 0 && (
            <button
              type="button"
              className="button danger"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', margin: 0 }}
              onClick={() => {
                if (window.confirm('Clear all responses?')) {
                  sendAction('clearresponses');
                }
              }}
              disabled={isBusy}
            >
              Clear All
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '350px', overflowY: 'auto' }}>
          {currentResponses.length === 0 ? (
            <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '1rem' }}>
              No responses posted for this question yet.
            </div>
          ) : (
            currentResponses.map(r => (
              <div
                key={r.id}
                style={{
                  background: 'var(--mint)',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem'
                }}
              >
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
                  “{r.text}”
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  <span>{r.author ? `By: ${r.author}` : 'Anonymous'}</span>
                  <span>❤️ {r.upvotes || 0}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    className={`act-btn ${state.featuredResponseId === r.id ? 'act-btn-danger' : 'act-btn-gold'}`}
                    style={{ flex: 1, padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => sendAction('togglefeature', { responseId: r.id })}
                    disabled={isBusy}
                  >
                    {state.featuredResponseId === r.id ? '✕ Dismiss Spotlight' : '⭐ Spotlight on Screen'}
                  </button>
                  <button
                    type="button"
                    className="act-btn act-btn-secondary"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => sendAction('upvote', { responseId: r.id })}
                    disabled={isBusy}
                  >
                    ❤️ +1
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
