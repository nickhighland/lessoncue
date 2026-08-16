import React, { useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

interface SurveyAnswer { id?: string; rank: number; text: string; points?: number; count?: number; }
interface SurveyQuestion { id?: string; prompt: string; answers?: SurveyAnswer[]; items?: SurveyAnswer[]; }
interface SurveyState { answers?: Array<{ rank: number; revealed: boolean }>; currentQuestionIndex?: number; strikes?: number; revealedScore?: number; phase?: string; buzzLocked?: boolean; }
interface SurveyConfig { question?: string; answers?: SurveyAnswer[]; questions?: SurveyQuestion[]; }

const questionsFor = (config: SurveyConfig): SurveyQuestion[] => config.questions?.length
  ? config.questions
  : [{ prompt: config.question || 'Name something people know about.', answers: config.answers || [] }];
const answersFor = (question: SurveyQuestion): SurveyAnswer[] => question.answers || question.items || [];
const pointsFor = (answer: SurveyAnswer) => answer.points ?? answer.count ?? 0;

export const SurveyBoardController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const state = (envelope.state as SurveyState) || {};
  const config = ((envelope as unknown as { config?: SurveyConfig }).config || {});
  const questions = questionsFor(config);
  const currentIndex = Math.min(state.currentQuestionIndex ?? 0, questions.length - 1);
  const currentQuestion = questions[currentIndex] || questions[0];
  const answers = currentQuestion ? answersFor(currentQuestion) : [];
  const revealed = new Set((state.answers || []).filter(answer => answer.revealed).map(answer => answer.rank));
  const strikes = state.strikes || 0;

  const sendAction = async (action: string, payload?: Record<string, unknown>) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, { action, payload });
      onCommandSent?.();
    } catch (err) {
      console.error(`Failed to execute ${action}:`, err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="act-ctrl-container">
      <div className="act-ctrl-card activity-controller-summary">
        <div>
          <span className="controller-eyebrow">SURVEY ROUND</span>
          <strong>Question {currentIndex + 1} of {questions.length}</strong>
          <small>{currentQuestion?.prompt}</small>
        </div>
        <strong className="controller-score">{state.revealedScore || 0}<small> pts</small></strong>
      </div>

      <div className="act-controller-button-row">
        <button type="button" className="act-btn act-btn-primary" onClick={() => sendAction('start')} disabled={isBusy || state.phase !== 'lobby'}>▶ Start board</button>
        <button type="button" className={`act-btn ${state.phase === 'acceptingResponses' ? 'act-btn-danger' : 'act-btn-primary'}`} onClick={() => sendAction(state.phase === 'acceptingResponses' ? 'resetbuzzers' : 'open')} disabled={isBusy}>{state.phase === 'acceptingResponses' ? 'Reset buzzers' : 'Open answers'}</button>
      </div>

      {questions.length > 1 && (
        <div className="act-controller-button-row">
          <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('prevquestion')} disabled={isBusy || currentIndex <= 0}>‹ Previous</button>
          <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('nextquestion')} disabled={isBusy || currentIndex >= questions.length - 1}>Next ›</button>
        </div>
      )}

      <div className="act-ctrl-card">
        <div className="controller-section-heading"><strong>Strikes</strong><span>{strikes}/3</span></div>
        <div className="act-controller-button-row">
          <button type="button" className="act-btn act-btn-danger" onClick={() => sendAction('addstrike')} disabled={isBusy || strikes >= 3}>+1 Strike ✕</button>
          <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('clearstrikes')} disabled={isBusy || strikes === 0}>Clear strikes</button>
        </div>
      </div>

      {currentQuestion && (
        <div className="act-ctrl-card">
          <div className="controller-section-heading"><strong>Reveal answers</strong><span>{revealed.size}/{answers.length}</span></div>
          <div className="survey-controller-answers">
            {answers.map((answer, index) => {
              const isRevealed = revealed.has(answer.rank);
              return (
                <button key={answer.id || answer.rank || index} type="button" className={`act-btn ${isRevealed ? 'act-btn-secondary' : 'act-btn-primary'}`} onClick={() => sendAction('revealitem', { rank: answer.rank })} disabled={isBusy || isRevealed}>
                  <span>#{answer.rank || index + 1} · {answer.text}</span>
                  <strong>{pointsFor(answer)} pts</strong>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button type="button" className="act-btn act-btn-gold" onClick={() => sendAction('revealall')} disabled={isBusy || revealed.size >= answers.length}>✨ Reveal all answers</button>
      <button
        type="button"
        className="act-btn act-btn-secondary"
        onClick={async () => {
          if (!window.confirm('Reset this survey board?')) return;
          setIsBusy(true);
          try { await ActivityApi.resetRun(envelope.runId); onCommandSent?.(); }
          finally { setIsBusy(false); }
        }}
        disabled={isBusy}
      >
        🔄 Reset board
      </button>
    </div>
  );
};
