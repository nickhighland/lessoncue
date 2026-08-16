import React, { useState } from 'react';
import { ActivityPresetPicker } from '../../ActivityPresetPicker';
import { QUIZ_PRESETS } from '../../activityPresetRegistry';

interface TriviaQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

interface TriviaConfig {
  title?: string;
  preset?: string;
  presetLabel?: string;
  questions?: TriviaQuestion[];
}

export const TriviaEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const trConfig = (config as TriviaConfig) || {};
  const questions: TriviaQuestion[] = trConfig.questions || [
    {
      id: '1',
      prompt: 'Which planet is known as the Red Planet?',
      options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
      correctIndex: 1,
      explanation: 'Mars appears red due to iron oxide.'
    }
  ];

  const [activeIndex, setActiveIndex] = useState(0);
  const currentQ = questions[activeIndex] || questions[0];

  const updateQuestions = (newQ: TriviaQuestion[]) => {
    onChange({ ...trConfig, questions: newQ });
  };

  const handleAddQuestion = () => {
    const nextQ: TriviaQuestion = {
      id: Math.random().toString(36).substring(2, 9),
      prompt: `New Question ${questions.length + 1}`,
      options: ['Option A', 'Option B', 'Option C'],
      correctIndex: 0,
      explanation: ''
    };
    const nextList = [...questions, nextQ];
    updateQuestions(nextList);
    setActiveIndex(nextList.length - 1);
  };

  const handleRemoveQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    const nextList = questions.filter((_, i) => i !== idx);
    updateQuestions(nextList);
    setActiveIndex(Math.max(0, idx - 1));
  };

  const handleCurrentQChange = (field: keyof TriviaQuestion, val: unknown) => {
    const nextList = [...questions];
    nextList[activeIndex] = { ...nextList[activeIndex], [field]: val };
    updateQuestions(nextList);
  };

  const handleOptionChange = (optIdx: number, val: string) => {
    const nextOpts = [...(currentQ.options || [])];
    nextOpts[optIdx] = val;
    handleCurrentQChange('options', nextOpts);
  };

  const handleAddOption = () => {
    const options = [...(currentQ.options || [])];
    if (options.length >= 8) return;
    options.push(`Option ${String.fromCharCode(65 + options.length)}`);
    handleCurrentQChange('options', options);
  };

  const handleRemoveOption = (optIdx: number) => {
    const options = (currentQ.options || []).filter((_, idx) => idx !== optIdx);
    if (options.length < 2) return;
    const nextCorrect = currentQ.correctIndex === optIdx
      ? 0
      : currentQ.correctIndex > optIdx ? currentQ.correctIndex - 1 : currentQ.correctIndex;
    const nextList = [...questions];
    nextList[activeIndex] = {
      ...nextList[activeIndex],
      options,
      correctIndex: Math.min(nextCorrect, options.length - 1)
    };
    updateQuestions(nextList);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <ActivityPresetPicker
        label="Quiz format"
        value={typeof trConfig.preset === 'string' ? trConfig.preset : 'trivia'}
        templates={QUIZ_PRESETS}
        onPresetChange={preset => onChange({ ...config, preset: preset.id, presetLabel: preset.label.toUpperCase() })}
        onApply={preset => {
          onChange({ ...config, ...preset.config });
          setActiveIndex(0);
        }}
      />
      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Activity Title
        </label>
        <input
          type="text"
          value={trConfig.title || ''}
          onChange={e => onChange({ ...trConfig, title: e.target.value })}
          placeholder="e.g. Youth Trivia Challenge"
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>

      {/* Question Selector Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', alignItems: 'center' }}>
        {questions.map((q, idx) => (
          <button
            key={q.id || idx}
            type="button"
            onClick={() => setActiveIndex(idx)}
            className={`button ${activeIndex === idx ? 'primary' : ''}`}
            style={{
              padding: '0.4rem 0.8rem',
              margin: 0,
              fontSize: '0.85rem'
            }}
          >
            Q{idx + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={handleAddQuestion}
          className="button"
          style={{ padding: '0.4rem 0.8rem', margin: 0, fontSize: '0.85rem' }}
        >
          + Add Q
        </button>
      </div>

      {/* Active Question Editor */}
      {currentQ && (
        <div style={{ background: 'var(--mint)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, color: 'var(--ink)' }}>Editing Question {activeIndex + 1}</span>
            {questions.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveQuestion(activeIndex)}
                className="button danger"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', margin: 0 }}
              >
                Delete Question
              </button>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.25rem' }}>
              Question Prompt
            </label>
            <textarea
              rows={2}
              value={currentQ.prompt}
              onChange={e => handleCurrentQChange('prompt', e.target.value)}
              style={{ width: '100%', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '8px', padding: '0.5rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.25rem' }}>
              Choices (2–8; select the radio button for the correct answer)
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(currentQ.options || []).map((opt, optIdx) => (
                <div key={optIdx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="radio"
                    name={`correct-${currentQ.id}`}
                    checked={currentQ.correctIndex === optIdx}
                    onChange={() => handleCurrentQChange('correctIndex', optIdx)}
                    title="Mark as correct answer"
                  />
                  <input
                    type="text"
                    value={opt}
                    onChange={e => handleOptionChange(optIdx, e.target.value)}
                    style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(optIdx)}
                    className="button danger"
                    disabled={(currentQ.options || []).length <= 2}
                    aria-label={`Remove choice ${optIdx + 1}`}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.9rem', margin: 0 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddOption}
              className="button"
              disabled={(currentQ.options || []).length >= 8}
              style={{ padding: '0.35rem 0.7rem', marginTop: '0.6rem', fontSize: '0.8rem' }}
            >
              + Add choice
            </button>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.25rem' }}>
              Explanation (Optional)
            </label>
            <input
              type="text"
              value={currentQ.explanation || ''}
              onChange={e => handleCurrentQChange('explanation', e.target.value)}
              placeholder="e.g. Why this answer is correct..."
              style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
