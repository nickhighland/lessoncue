import React, { useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

interface TriviaState {
  currentQuestionIndex?: number;
  responsesOpen?: boolean;
  answerRevealed?: boolean;
  explanationRevealed?: boolean;
}

export const TriviaController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const state: TriviaState = (envelope.state as TriviaState) || {};
  const config = (envelope as unknown as { config?: { questions?: unknown[] } }).config || {};
  const totalQ = (config.questions || []).length;
  const currentIdx = state.currentQuestionIndex ?? 0;

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
      console.error(`Failed to execute ${action}:`, err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="act-ctrl-container">
      {/* Current Question Position */}
      <div className="act-ctrl-card activity-controller-summary">
        <span>
          <span className="controller-eyebrow">TRIVIA ROUND</span>
          <strong>
          Question {currentIdx + 1} of {totalQ || 1}
          </strong>
        </span>
        <div className="act-controller-button-row">
          <button
            type="button"
            className="act-btn act-btn-secondary"
            onClick={() => sendAction('prevquestion')}
            disabled={isBusy || currentIdx <= 0}
          >
            ◀ Prev
          </button>
          <button
            type="button"
            className="act-btn act-btn-secondary"
            onClick={() => sendAction('nextquestion')}
            disabled={isBusy || currentIdx >= (totalQ - 1)}
          >
            Next ▶
          </button>
        </div>
      </div>

      <div className="act-ctrl-card">
        <div className="controller-section-heading"><strong>Response window</strong><span>{state.responsesOpen ? 'Open' : 'Closed'}</span></div>
        <button
          type="button"
          className={`act-btn ${state.responsesOpen ? 'act-btn-danger' : 'act-btn-primary'}`}
          onClick={() => sendAction(state.responsesOpen ? 'closeresponses' : 'openresponses')}
          disabled={isBusy}
        >
          {state.responsesOpen ? '❚❚ Close answers' : '▶ Open answers'}
        </button>
      </div>

      {/* Answer & Explanation Reveal Buttons */}
      <div className="act-controller-button-row">
        <button
          type="button"
          className="act-btn act-btn-gold"
          style={{ height: '60px', fontSize: '1.2rem' }}
          onClick={() => sendAction(state.answerRevealed ? 'hideanswer' : 'revealanswer')}
          disabled={isBusy}
        >
          {state.answerRevealed ? '↩ Hide correct answer' : '🎯 Reveal correct answer'}
        </button>

        <button
          type="button"
          className="act-btn act-btn-primary"
          onClick={() => sendAction(state.explanationRevealed ? 'hideexplanation' : 'revealexplanation')}
          disabled={isBusy}
        >
          {state.explanationRevealed ? '↩ Hide explanation' : '💡 Show explanation'}
        </button>
      </div>

      {/* Reset Run */}
      <button
        type="button"
        className="act-btn act-btn-secondary"
        style={{ opacity: 0.7 }}
        onClick={async () => {
          if (!window.confirm('Reset trivia to Question 1?')) return;
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
        🔄 Reset Trivia to Start
      </button>
    </div>
  );
};
