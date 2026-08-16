import React, { useState } from 'react';
import { ActivityPresetPicker } from '../../ActivityPresetPicker';
import { SURVEY_PRESETS } from '../../activityPresetRegistry';

interface SurveyAnswer { id: string; rank: number; text: string; points: number; count?: number; }
interface SurveyQuestion { id: string; prompt: string; answers?: SurveyAnswer[]; items?: SurveyAnswer[]; }
interface SurveyBoardConfig { title?: string; question?: string; answers?: SurveyAnswer[]; questions?: SurveyQuestion[]; preset?: string; presetLabel?: string; }

function normalizeQuestions(config: SurveyBoardConfig): SurveyQuestion[] {
  if (config.questions?.length) {
    return config.questions.map((question, qIndex) => ({
      id: question.id || `q-${qIndex + 1}`,
      prompt: question.prompt,
      answers: (question.answers || question.items || []).map((answer, index) => ({
        id: answer.id || `${qIndex + 1}-${answer.rank || index + 1}`,
        rank: answer.rank || index + 1,
        text: answer.text,
        points: answer.points ?? answer.count ?? 0
      }))
    }));
  }
  return [{
    id: 'q1',
    prompt: config.question || 'Name something people know about.',
    answers: (config.answers || []).map((answer, index) => ({
      id: answer.id || `1-${answer.rank || index + 1}`,
      rank: answer.rank || index + 1,
      text: answer.text,
      points: answer.points ?? answer.count ?? 0
    }))
  }];
}

export const SurveyBoardEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const boardConfig = (config as SurveyBoardConfig) || {};
  const questions = normalizeQuestions(boardConfig);
  const [activeIndex, setActiveIndex] = useState(0);
  const currentQuestion = questions[Math.min(activeIndex, questions.length - 1)];

  const updateQuestions = (nextQuestions: SurveyQuestion[]) => {
    onChange({ ...boardConfig, questions: nextQuestions.map(question => ({
      id: question.id,
      prompt: question.prompt,
      answers: (question.answers || []).map(answer => ({
        id: answer.id,
        rank: answer.rank,
        text: answer.text,
        points: answer.points
      }))
    })) });
  };

  const updateQuestion = (changes: Partial<SurveyQuestion>) => {
    const next = [...questions];
    next[activeIndex] = { ...next[activeIndex], ...changes };
    updateQuestions(next);
  };

  const updateAnswer = (answerIndex: number, changes: Partial<SurveyAnswer>) => {
    const answers = [...(currentQuestion.answers || [])];
    answers[answerIndex] = { ...answers[answerIndex], ...changes };
    updateQuestion({ answers });
  };

  const addQuestion = () => {
    const next = [...questions, {
      id: `q-${Date.now()}`,
      prompt: `New survey question ${questions.length + 1}`,
      answers: [
        { id: `${Date.now()}-1`, rank: 1, text: 'Answer 1', points: 40 },
        { id: `${Date.now()}-2`, rank: 2, text: 'Answer 2', points: 25 }
      ]
    }];
    updateQuestions(next);
    setActiveIndex(next.length - 1);
  };

  const removeQuestion = () => {
    if (questions.length <= 1) return;
    const next = questions.filter((_, index) => index !== activeIndex);
    updateQuestions(next);
    setActiveIndex(Math.max(0, activeIndex - 1));
  };

  const addAnswer = () => {
    const answers = [...(currentQuestion.answers || [])];
    const rank = answers.length + 1;
    updateQuestion({ answers: [...answers, { id: `${Date.now()}-${rank}`, rank, text: `Answer ${rank}`, points: 10 }] });
  };

  const removeAnswer = (answerIndex: number) => {
    const answers = (currentQuestion.answers || [])
      .filter((_, index) => index !== answerIndex)
      .map((answer, index) => ({ ...answer, rank: index + 1 }));
    updateQuestion({ answers });
  };

  return (
    <div className="activity-editor-form">
      <ActivityPresetPicker
        label="Survey board format"
        value={typeof boardConfig.preset === 'string' ? boardConfig.preset : 'surveyShowdown'}
        templates={SURVEY_PRESETS}
        onPresetChange={preset => onChange({ ...boardConfig, preset: preset.id, presetLabel: preset.label.toUpperCase() })}
        onApply={preset => {
          onChange({ ...boardConfig, ...preset.config });
          setActiveIndex(0);
        }}
      />
      <label className="activity-editor-label">Activity title
        <input value={boardConfig.title || ''} onChange={event => onChange({ ...boardConfig, title: event.target.value })} placeholder="e.g. Family Feud Face-off" />
      </label>

      <div className="activity-question-tabs" aria-label="Survey questions">
        {questions.map((question, index) => (
          <button key={question.id} type="button" className={activeIndex === index ? 'active' : ''} onClick={() => setActiveIndex(index)}>Q{index + 1}</button>
        ))}
        <button type="button" onClick={addQuestion} disabled={questions.length >= 100}>+ Add question</button>
      </div>

      {currentQuestion && (
        <div className="activity-editor-card">
          <div className="activity-editor-card-heading">
            <strong>Question {activeIndex + 1}</strong>
            {questions.length > 1 && <button type="button" className="button danger" onClick={removeQuestion}>Delete question</button>}
          </div>
          <label className="activity-editor-label">Prompt
            <textarea rows={2} value={currentQuestion.prompt} onChange={event => updateQuestion({ prompt: event.target.value })} />
          </label>

          <div className="activity-editor-card-heading">
            <strong>Top answers</strong>
            <button type="button" className="button" onClick={addAnswer} disabled={(currentQuestion.answers || []).length >= 100}>+ Add answer</button>
          </div>
          <div className="survey-editor-answers">
            {(currentQuestion.answers || []).map((answer, index) => (
              <div className="survey-editor-answer survey-editor-answer-points" key={answer.id || index}>
                <span>#{answer.rank}</span>
                <input value={answer.text} onChange={event => updateAnswer(index, { text: event.target.value })} aria-label={`Answer ${index + 1}`} />
                <input type="number" min={0} value={answer.points} onChange={event => updateAnswer(index, { points: Number(event.target.value) || 0 })} aria-label={`Points for answer ${index + 1}`} />
                <button type="button" className="button danger" onClick={() => removeAnswer(index)} disabled={(currentQuestion.answers || []).length <= 1} aria-label={`Remove answer ${index + 1}`}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
