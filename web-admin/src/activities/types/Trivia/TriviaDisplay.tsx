import React, { useEffect, useRef } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { playChimeSound, playFanfareSound, launchConfetti } from '../../effects';

interface TriviaQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  timeLimitSeconds?: number;
}

interface TriviaConfig {
  title?: string;
  questions?: TriviaQuestion[];
}

interface TriviaState {
  currentQuestionIndex?: number;
  responsesOpen?: boolean;
  answerRevealed?: boolean;
  explanationRevealed?: boolean;
  timerRemainingSeconds?: number | null;
  actionNonce?: number;
  revealedCorrectIndex?: number | null;
  revealedExplanation?: string;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const OPTION_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

export const TriviaDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const state: TriviaState = (envelope.state as TriviaState) || {};
  const config = (envelope as unknown as { config?: TriviaConfig }).config || {};
  const questions: TriviaQuestion[] = config.questions || [
    {
      id: '1',
      prompt: 'Which planet in our solar system is known as the Red Planet?',
      options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
      correctIndex: 1,
      explanation: 'Mars appears reddish because of widespread iron oxide on its surface.'
    }
  ];

  const qIndex = state.currentQuestionIndex ?? 0;
  const currentQ = questions[qIndex] || questions[0];
  const correctIndex = state.revealedCorrectIndex ?? currentQ?.correctIndex;

  useEffect(() => {
    if (state.answerRevealed) {
      playChimeSound();
      playFanfareSound();
      launchConfetti(containerRef.current, 80);
    }
  }, [state.answerRevealed]);

  if (!currentQ) {
    return (
      <div className="activity-stage">
        <h1 className="activity-title">Trivia Complete!</h1>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="activity-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">❓ {config.title || envelope.name || 'TRIVIA SHOWDOWN'} · QUESTION {qIndex + 1} OF {questions.length}</div>
          <h1 className="activity-title">{config.title || envelope.name || 'Trivia Showdown'}</h1>
          <div className="activity-subtitle">Choose your answer · the host controls the reveal</div>
        </div>

        {/* Question Prompt Card */}
        <div className="trivia-question-card">
          <div className="trivia-question-text">{currentQ.prompt}</div>
        </div>

        {/* Variable-size choice board: editors can use 2–8 choices. */}
        <div
          className="trivia-options-grid"
          style={{ gridTemplateColumns: `repeat(${currentQ.options.length <= 2 ? 1 : currentQ.options.length <= 4 ? 2 : 4}, minmax(0, 1fr))` }}
        >
          {currentQ.options.map((opt, idx) => {
            const isCorrect = idx === correctIndex;
            const isRevealed = state.answerRevealed;

            let cardClass = 'trivia-option-btn';
            if (isRevealed && isCorrect) {
              cardClass += ' correct';
            } else if (isRevealed && !isCorrect) {
              cardClass += ' incorrect';
            }

            return (
              <div
                key={idx}
                className={cardClass}
                style={{
                  borderLeft: `8px solid ${OPTION_COLORS[idx % OPTION_COLORS.length]}`
                }}
              >
                <span
                  className="trivia-option-letter"
                  style={{ background: OPTION_COLORS[idx % OPTION_COLORS.length] }}
                >
                  {OPTION_LETTERS[idx]}
                </span>
                <span>{opt}</span>
              </div>
            );
          })}
        </div>

        {/* Explanation Card */}
        {state.explanationRevealed && (state.revealedExplanation || currentQ.explanation) && (
          <div className="trivia-explanation-card">
            💡 {state.revealedExplanation || currentQ.explanation}
          </div>
        )}
      </div>
    </div>
  );
};
