import React, { useState } from 'react';
import type { ActivityComponentProps } from '../../activityRegistry';
import { ActivityApi } from '../../api';

interface SurveyAnswer { id?: string; rank: number; text: string; points?: number; count?: number; }
interface SurveyQuestion { id?: string; prompt: string; answers?: SurveyAnswer[]; items?: SurveyAnswer[]; }
interface SurveyMatchSuggestion { rank: number; text: string; confidence: number; matchedBy?: string; }
interface SurveyState {
  answers?: Array<{ rank: number; revealed: boolean }>;
  currentQuestionIndex?: number;
  strikes?: number;
  strikeLimit?: number;
  revealedScore?: number;
  phase?: string;
  buzzLocked?: boolean;
  responsesOpen?: boolean;
  currentTeamName?: string;
  stealOpen?: boolean;
  stealTeamName?: string;
  lastBoardEvent?: string;
  surveyMatchInput?: string;
  surveyMatchSuggestions?: SurveyMatchSuggestion[];
}
interface SurveyConfig {
  title?: string;
  question?: string;
  answers?: SurveyAnswer[];
  questions?: SurveyQuestion[];
  teamPlay?: boolean;
  stealEnabled?: boolean;
  strikesToSteal?: number;
}

const questionsFor = (config: SurveyConfig): SurveyQuestion[] => config.questions?.length
  ? config.questions
  : [{ prompt: config.question || 'Name something people know about.', answers: config.answers || [] }];
const answersFor = (question: SurveyQuestion): SurveyAnswer[] => question.answers || question.items || [];
const pointsFor = (answer: SurveyAnswer) => answer.points ?? answer.count ?? 0;

export const SurveyBoardController: React.FC<ActivityComponentProps> = ({ envelope, onCommandSent, hostView }) => {
  const [isBusy, setIsBusy] = useState(false);
  const state = (envelope.state as SurveyState) || {};
  const config = ((envelope as unknown as { config?: SurveyConfig }).config || {});
  const questions = questionsFor(config);
  const currentIndex = Math.min(state.currentQuestionIndex ?? 0, questions.length - 1);
  const currentQuestion = questions[currentIndex] || questions[0];
  const answers = currentQuestion ? answersFor(currentQuestion) : [];
  const revealed = new Set((state.answers || []).filter(answer => answer.revealed).map(answer => answer.rank));
  const strikes = state.strikes || 0;
  const strikeLimit = Math.max(1, Math.min(5, state.strikeLimit || config.strikesToSteal || 3));
  const teamMode = config.teamPlay === true || config.stealEnabled === true;
  const teamName = state.stealOpen ? state.stealTeamName : state.currentTeamName;
  const roundId = currentQuestion?.id || `round-${currentIndex + 1}`;
  const latestAnswer = hostView?.submissions.find(submission => submission.roundId === roundId && submission.kind === 'surveyAnswer');
  const latestAnswerText = latestAnswer && typeof latestAnswer.payload.text === 'string' ? latestAnswer.payload.text : '';
  const submittedAnswerText = state.surveyMatchInput || latestAnswerText;
  const suggestions = Array.isArray(state.surveyMatchSuggestions) ? state.surveyMatchSuggestions : [];

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

      {teamMode && teamName && (
        <div className={`survey-controller-team-banner ${state.stealOpen ? 'steal' : ''}`}>
          <span>{state.stealOpen ? 'STEAL CHANCE' : 'CURRENT TEAM'}</span>
          <strong>{teamName}</strong>
          <small>{state.stealOpen ? 'Only this team can submit the steal.' : 'Only this team can answer until the board moves on.'}</small>
        </div>
      )}

      {submittedAnswerText && (
        <div className="act-ctrl-card survey-controller-answer-preview">
          <span className="controller-eyebrow">ANSWER TO JUDGE</span>
          <strong>“{submittedAnswerText}”</strong>
          <small>{state.stealOpen ? `${state.stealTeamName || 'The steal team'} submitted this answer.` : 'Choose the matching board answer below.'}</small>
          <div className="act-controller-button-row">
            <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('suggestmatch')} disabled={isBusy}>Find likely board match</button>
          </div>
          {suggestions.length > 0 && <div className="survey-match-suggestions" aria-label="Suggested survey matches">
            <span className="controller-eyebrow">CONSERVATIVE SUGGESTION · MANUAL CONFIRMATION REQUIRED</span>
            {suggestions.map(suggestion => <button key={suggestion.rank} type="button" className="act-btn act-btn-gold" onClick={() => sendAction('revealitem', { rank: suggestion.rank })} disabled={isBusy}><span>#{suggestion.rank} · {suggestion.text}</span><strong>{suggestion.confidence}% match</strong></button>)}
          </div>}
        </div>
      )}

      <div className="act-controller-button-row">
        <button type="button" className="act-btn act-btn-primary" onClick={() => sendAction('start')} disabled={isBusy || state.phase !== 'lobby'}>▶ Start board</button>
        <button type="button" className={`act-btn ${state.phase === 'acceptingResponses' ? 'act-btn-danger' : 'act-btn-primary'}`} onClick={() => sendAction(state.phase === 'acceptingResponses' ? 'resetbuzzers' : 'open')} disabled={isBusy}>{state.phase === 'acceptingResponses' ? 'Reset buzzers' : 'Open answers'}</button>
        <button type="button" className="act-btn act-btn-gold" onClick={() => sendAction(state.phase === 'leaderboard' ? 'open' : 'showleaderboard')} disabled={isBusy || state.phase === 'lobby'}>{state.phase === 'leaderboard' ? 'Resume board' : 'Show leaderboard'}</button>
      </div>

      {questions.length > 1 && (
        <div className="act-controller-button-row">
          <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('prevquestion')} disabled={isBusy || currentIndex <= 0}>‹ Previous</button>
          <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('nextquestion')} disabled={isBusy || currentIndex >= questions.length - 1}>Next ›</button>
        </div>
      )}

      <div className="act-ctrl-card">
        <div className="controller-section-heading"><strong>Strikes</strong><span>{strikes}/{strikeLimit}</span></div>
        <div className="act-controller-button-row">
          <button type="button" className="act-btn act-btn-danger" onClick={() => sendAction('addstrike')} disabled={isBusy || strikes >= strikeLimit || Boolean(state.stealOpen)}>+1 Strike ✕</button>
          <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('clearstrikes')} disabled={isBusy || strikes === 0}>Clear strikes</button>
          {state.stealOpen && <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('closesteeal')} disabled={isBusy}>Close steal</button>}
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
