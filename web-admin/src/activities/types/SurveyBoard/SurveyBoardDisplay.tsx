import React, { useEffect, useRef, useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { playBuzzerSound, playChimeSound } from '../../effects';
import { ActivityLeaderboard } from '../../ActivityLeaderboard';

interface SurveyAnswer {
  id?: string;
  rank: number;
  text: string;
  points?: number;
  count?: number;
}

interface SurveyQuestion {
  id?: string;
  prompt: string;
  answers?: SurveyAnswer[];
  items?: SurveyAnswer[];
  answerCount?: number;
}

interface SurveyConfig {
  title?: string;
  presetLabel?: string;
  question?: string;
  answers?: SurveyAnswer[];
  questions?: SurveyQuestion[];
}

interface SurveyState {
  answers?: Array<{ rank: number; revealed: boolean }>;
  currentQuestionIndex?: number;
  strikes?: number;
  revealedScore?: number;
  actionNonce?: number;
  phase?: string;
  revealedRank?: number;
  revealedRanks?: number[];
  revealedAnswers?: SurveyAnswer[];
  revealedAnswer?: string;
  revealedPoints?: number;
  strikeLimit?: number;
  currentTeamName?: string;
  stealOpen?: boolean;
  stealTeamName?: string;
  lastBoardEvent?: string;
}

function questionsFor(config: SurveyConfig): SurveyQuestion[] {
  if (config.questions?.length) return config.questions;
  return [{ prompt: config.question || 'Name something people know about.', answers: config.answers || [] }];
}

function answersFor(question: SurveyQuestion): SurveyAnswer[] {
  return question.answers || question.items || [];
}

function answerPoints(answer: SurveyAnswer): number {
  return answer.points ?? answer.count ?? 0;
}

export const SurveyBoardDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastActionRef = useRef<number | undefined>(undefined);
  const lastStrikeRef = useRef(0);
  const [showStrikeOverlay, setShowStrikeOverlay] = useState(false);
  const state = (envelope.state as SurveyState) || {};
  const config = ((envelope as unknown as { config?: SurveyConfig }).config || {});
  const questions = questionsFor(config);
  const currentIndex = Math.min(state.currentQuestionIndex ?? 0, questions.length - 1);
  const currentQuestion = questions[currentIndex] || questions[0];
  const configuredAnswers = answersFor(currentQuestion);
  const answers = configuredAnswers.length
    ? configuredAnswers
    : Array.from({ length: Math.max(0, currentQuestion.answerCount || 0) }, (_, index): SurveyAnswer => ({ id: `answer-${index + 1}`, rank: index + 1, text: '', points: 0 }));
  const revealed = new Set((state.answers || []).filter(answer => answer.revealed).map(answer => answer.rank));
  (state.revealedRanks || []).forEach(rank => revealed.add(rank));
  const revealedAnswers = new Map((state.revealedAnswers || []).map(answer => [answer.rank, answer]));
  const strikeLimit = Math.max(1, Math.min(5, state.strikeLimit || 3));
  const strikes = Math.min(strikeLimit, Math.max(0, state.strikes || 0));

  useEffect(() => {
    if (state.actionNonce !== undefined && state.actionNonce !== lastActionRef.current) {
      if (lastActionRef.current !== undefined) playChimeSound();
      lastActionRef.current = state.actionNonce;
    }
  }, [state.actionNonce]);

  useEffect(() => {
    if (strikes > lastStrikeRef.current) {
      playBuzzerSound();
      setShowStrikeOverlay(true);
      const timer = window.setTimeout(() => setShowStrikeOverlay(false), 1400);
      lastStrikeRef.current = strikes;
      return () => window.clearTimeout(timer);
    }
    lastStrikeRef.current = strikes;
  }, [strikes]);

  if (!currentQuestion) return null;

  return (
    <div ref={containerRef} className="activity-stage survey-board-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">📋 {config.presetLabel || 'LIVE SURVEY BOARD'} · {currentIndex + 1}/{questions.length}</div>
          <h1 className="activity-title">{currentQuestion.prompt}</h1>
          <div className="activity-subtitle">{envelope.name || config.title || 'Survey Board'}</div>
        </div>

        {state.stealOpen ? (
          <div className="survey-board-turn-banner steal">
            <span>STEAL CHANCE</span>
            <strong>{state.stealTeamName || 'The steal team'} is up</strong>
            <small>{state.lastBoardEvent || 'Submit one answer to take the board.'}</small>
          </div>
        ) : state.currentTeamName ? (
          <div className="survey-board-turn-banner">
            <span>CURRENT TEAM</span>
            <strong>{state.currentTeamName}</strong>
            <small>Submit one answer to claim the board.</small>
          </div>
        ) : null}

        <div className="survey-score-banner">
          <span>ROUND SCORE</span>
          <strong>{state.revealedScore || 0}</strong>
        </div>

        <div className="survey-board-list" aria-label="Survey answers">
          {answers.map((answer, index) => {
            const isRevealed = revealed.has(answer.rank);
            const revealedAnswer = revealedAnswers.get(answer.rank);
            return (
              <div key={answer.id || answer.rank || index} className={`survey-answer-slat ${isRevealed ? 'revealed' : ''}`}>
                <span className="survey-answer-rank">{answer.rank || index + 1}</span>
                <span className="survey-answer-text">{isRevealed ? (revealedAnswer?.text || (state.revealedRank === answer.rank ? state.revealedAnswer : answer.text) || 'Revealed') : '••••••••••••••••'}</span>
                <strong className="survey-answer-points">{isRevealed ? (revealedAnswer ? answerPoints(revealedAnswer) : state.revealedRank === answer.rank ? state.revealedPoints || 0 : answerPoints(answer)) : '—'}</strong>
              </div>
            );
          })}
        </div>

        <div className="survey-strikes" aria-label={`${strikes} of ${strikeLimit} strikes`}>
          {Array.from({ length: strikeLimit }, (_, index) => <span key={index} className={index < strikes ? 'active' : ''}>✕</span>)}
        </div>

        <ActivityLeaderboard state={state as Record<string, unknown>} showPodium={state.phase === 'finalResults' || state.phase === 'complete'} />

        {showStrikeOverlay && (
          <div className="survey-strike-overlay" aria-hidden="true">
            <strong>{'✕'.repeat(Math.max(1, strikes))}</strong>
          </div>
        )}
      </div>
    </div>
  );
};
