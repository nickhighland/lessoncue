import React, { useMemo, useState } from 'react';
import type { ActivityDefinition, ActivityStateEnvelope, ActivityTheme } from './types';
import { getActivityDescriptor } from './activityRegistry';
import './activity.css';

export type ActivityPreviewMode = 'display' | 'participant' | 'reveal' | 'leaderboard' | 'podium';

type JsonRecord = Record<string, unknown>;

const objectOf = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const listOf = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
const textOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const recordAt = (value: unknown, index = 0) => listOf(value)[index];

const activityThemeVariables = (theme?: ActivityTheme | null): React.CSSProperties => {
  const primary = theme?.primaryColor || '#2a6e4a';
  const secondary = theme?.secondaryColor || '#2563eb';
  const accent = theme?.accentColor || '#f59e0b';
  const background = theme?.backgroundColor || '#091c1d';
  const colorWithAlpha = (value: string, alpha: number) => {
    const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
    if (!match) return value;
    const number = Number.parseInt(match[1], 16);
    return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
  };
  return {
    '--act-gold': accent,
    '--act-gold-start': accent,
    '--act-gold-end': primary,
    '--act-green': primary,
    '--act-green-bright': secondary,
    '--act-stage-bg': background,
    '--act-stage-primary': primary,
    '--act-stage-secondary': secondary,
    '--act-stage-accent': accent,
    '--act-stage-primary-soft': colorWithAlpha(primary, 0.26),
    '--act-stage-secondary-soft': colorWithAlpha(secondary, 0.22),
    '--act-stage-accent-soft': colorWithAlpha(accent, 0.18),
    '--act-stage-text': theme?.textColor || '#ffffff'
  } as React.CSSProperties;
};

const firstRoundOrQuestion = (config: JsonRecord): JsonRecord => {
  return recordAt(config.questions) || recordAt(config.rounds) || recordAt(config.prompts) || recordAt(config.challenges) || {};
};

const promptFor = (config: JsonRecord): string => {
  const item = firstRoundOrQuestion(config);
  return textOf(item.prompt, textOf(item.question, textOf(config.prompt, textOf(config.question, 'Get ready for the next challenge.'))));
};

const optionsFor = (config: JsonRecord): string[] => {
  const item = firstRoundOrQuestion(config);
  const values = Array.isArray(item.options) && item.options.length
    ? item.options
    : Array.isArray(config.options) && config.options.length
      ? config.options
      : Array.isArray(config.choices) && config.choices.length
        ? config.choices
        : [];
  return values.map((value, index) => {
    if (value && typeof value === 'object') {
      const record = value as JsonRecord;
      return textOf(record.label, textOf(record.value, `Option ${index + 1}`));
    }
    return String(value);
  }).filter(Boolean);
};

const answerIndexFor = (config: JsonRecord): number => {
  const item = firstRoundOrQuestion(config);
  return Math.max(0, numberOf(item.correctIndex, numberOf(config.correctIndex, 0)));
};

const answerTextFor = (config: JsonRecord): string => {
  const item = firstRoundOrQuestion(config);
  return textOf(item.correctAnswer, textOf(item.answer, textOf(config.correctAnswer, textOf(config.answer, optionsFor(config)[answerIndexFor(config)] || 'The host will reveal the answer.'))));
};

const stripSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  const secretKeys = new Set([
    'correctIndex', 'correctAnswer', 'answer', 'acceptedAnswers', 'explanation',
    'hiddenPrize', 'realAnswer', 'truth', 'winnerId', 'revealedAnswer',
    'revealedCorrectIndex', 'revealedExplanation'
  ]);
  return Object.fromEntries(Object.entries(value as JsonRecord)
    .filter(([key]) => !secretKeys.has(key))
    .map(([key, item]) => [key, stripSecrets(item)]));
};

const sampleLeaderboard = [
  { id: 'preview-1', rank: 1, name: 'Taylor', score: 760 },
  { id: 'preview-2', rank: 2, name: 'Jordan', score: 625 },
  { id: 'preview-3', rank: 3, name: 'Alex', score: 490 },
  { id: 'preview-4', rank: 4, name: 'Sam', score: 335 }
];

const sampleTeams = [
  { id: 'team-1', name: 'North Stars', score: 760, color: '#f2b943', icon: '⭐' },
  { id: 'team-2', name: 'Green Lights', score: 625, color: '#52d39b', icon: '⚡' },
  { id: 'team-3', name: 'Blue Comets', score: 490, color: '#65b7ff', icon: '☄️' }
];

const previewStateFor = (definition: ActivityDefinition, mode: ActivityPreviewMode): JsonRecord => {
  const config = objectOf(definition.config);
  const reveal = mode === 'reveal';
  const finalResults = mode === 'podium';
  const firstRound = firstRoundOrQuestion(config);
  const firstRoundItems = listOf(firstRound.items);
  const answerIndex = answerIndexFor(config);
  const answerText = answerTextFor(config);
  const surveyAnswers = listOf(firstRound.answers || firstRound.items || config.answers);
  const bracketEntrants = listOf(config.entrants).slice(0, 4).map((entrant, index) => ({
    id: textOf(entrant.id, `entrant-${index + 1}`),
    label: textOf(entrant.label, `Entrant ${index + 1}`)
  }));
  const bracketA = bracketEntrants[0] || { id: 'entrant-a', label: 'North Stars' };
  const bracketB = bracketEntrants[1] || { id: 'entrant-b', label: 'Green Lights' };

  return {
    phase: mode === 'participant' ? 'acceptingResponses' : finalResults ? 'finalResults' : reveal ? 'reveal' : mode === 'leaderboard' ? 'leaderboard' : 'prompt',
    participantCount: 12,
    joinCode: 'DEMO42',
    currentQuestionIndex: 0,
    currentRoundIndex: 0,
    currentPromptIndex: 0,
    currentStage: reveal ? Math.max(1, numberOf(config.totalStages, 5)) : 1,
    totalStages: numberOf(config.totalStages, 5),
    revealed: reveal,
    currentChallengeIndex: 0,
    currentMatchId: 'preview-match-1',
    responsesOpen: mode === 'participant' || mode === 'display',
    votingOpen: mode === 'participant' || reveal,
    resultsVisible: reveal || finalResults,
    answerRevealed: reveal,
    explanationRevealed: reveal,
    revealedCorrectIndex: reveal ? answerIndex : undefined,
    revealedAnswer: reveal ? answerText : undefined,
    revealedExplanation: reveal ? textOf(firstRound.explanation) : undefined,
    cluesRevealed: reveal ? Math.max(1, listOf(firstRound.clues).length) : 1,
    buzzWinnerName: reveal ? 'Jordan' : undefined,
    buzzWinnerParticipantId: reveal ? 'preview-2' : undefined,
    submissions: reveal ? [
      { id: 'submission-1', text: 'A surprisingly bad idea', participantName: 'Anonymous' },
      { id: 'submission-2', text: 'The answer nobody expected', participantName: 'Anonymous' },
      { id: 'submission-3', text: 'Definitely not the safe choice', participantName: 'Anonymous' }
    ] : [],
    winningSubmissionId: reveal ? 'submission-2' : undefined,
    options: reveal ? [
      { id: 'bluff-1', text: answerText, isCorrect: true },
      { id: 'bluff-2', text: 'A convincing decoy', isCorrect: false },
      { id: 'bluff-3', text: 'A confident guess', isCorrect: false }
    ] : [],
    drawings: reveal ? [
      { id: 'drawing-1', strokes: [{ points: [[.12, .7], [.42, .2], [.82, .68]], color: '#f8fafc', width: .018 }] },
      { id: 'drawing-2', strokes: [{ points: [[.18, .28], [.5, .8], [.78, .28]], color: '#f2b943', width: .02 }] }
    ] : [],
    correctOrder: firstRoundItems.map(item => textOf(item.id)).filter(Boolean),
    revealedOptionIndex: reveal ? answerIndex : -1,
    targetName: 'Jordan',
    matchCount: reveal ? 7 : 0,
    wordCloud: reveal ? [
      { word: 'school', count: 8 },
      { word: 'music', count: 5 },
      { word: 'snacks', count: 3 },
      { word: 'travel', count: 2 }
    ] : [],
    selectedParticipantName: 'Taylor',
    challengeStatus: reveal ? 'success' : 'ready',
    outcome: reveal ? 'success' : undefined,
    timerDurationMs: Math.max(1000, numberOf(firstRound.seconds, 60) * 1000),
    currentMatch: {
      id: 'preview-match-1',
      round: 1,
      status: reveal ? 'complete' : 'open',
      entrantAId: bracketA.id,
      entrantA: bracketA.label,
      entrantBId: bracketB.id,
      entrantB: bracketB.label,
      winnerId: reveal ? bracketA.id : undefined
    },
    bracketMatches: [
      { id: 'preview-match-1', round: 1, entrantA: bracketA.label, entrantB: bracketB.label, winnerId: reveal ? bracketA.id : undefined, status: reveal ? 'complete' : 'open' },
      { id: 'preview-match-2', round: 1, entrantA: bracketEntrants[2]?.label || 'Blue Comets', entrantB: bracketEntrants[3]?.label || 'Red Rockets', status: 'pending' },
      { id: 'preview-final', round: 2, entrantA: bracketA.label, entrantB: bracketEntrants[2]?.label || 'Blue Comets', status: 'pending' }
    ],
    bracketChampion: finalResults || reveal ? bracketA.label : undefined,
    answers: surveyAnswers.map((answer, index) => ({ rank: numberOf(answer.rank, index + 1), revealed: reveal })),
    revealedRanks: reveal ? surveyAnswers.map((answer, index) => numberOf(answer.rank, index + 1)) : [],
    revealedAnswers: reveal ? surveyAnswers : [],
    revealedScore: reveal ? surveyAnswers.reduce((sum, answer) => sum + numberOf(answer.points, numberOf(answer.count)), 0) : 0,
    strikes: reveal ? 1 : 0,
    leaderboard: sampleLeaderboard,
    teams: sampleTeams,
    previewOnly: true
  };
};

export const createActivityPreviewEnvelope = (definition: ActivityDefinition, mode: ActivityPreviewMode): ActivityStateEnvelope => ({
  runId: `preview-${definition.id}`,
  definitionId: definition.id,
  type: definition.type,
  revision: 0,
  status: 'prepared',
  state: previewStateFor(definition, mode),
  serverTime: new Date().toISOString(),
  name: definition.name,
  theme: definition.theme || null,
  config: mode === 'participant' ? stripSecrets(definition.config) as Record<string, unknown> : definition.config
});

const displayPromptFor = (envelope: ActivityStateEnvelope) => promptFor(objectOf(envelope.config));

const participantOptionsFor = (envelope: ActivityStateEnvelope) => optionsFor(objectOf(envelope.config));

const ParticipantPreview: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [response, setResponse] = useState('');
  const options = participantOptionsFor(envelope);
  const prompt = displayPromptFor(envelope);
  const type = envelope.type;
  const isPhysical = type === 'physicalRoom' || type === 'stageChallenge' || type === 'utility';
  const isBuzzer = type === 'buzzer';
  const isChoice = ['trivia', 'rapidFire', 'poll', 'prediction', 'matchPlayer', 'bracket', 'emojiPrompt'].includes(type);
  const choiceOptions = options.length ? options : ['Option A', 'Option B', 'Option C'];

  return <div className="activity-preview-participant activity-participant-page">
    <div className="activity-preview-participant-card">
      <div className="activity-preview-phone-header"><span className="participant-mark">⚡</span><div><span className="participant-kicker">PARTICIPANT PREVIEW</span><strong>{envelope.name}</strong></div><span className="activity-preview-demo-pill">DEMO</span></div>
      {isPhysical ? <section className="participant-waiting activity-preview-physical-card"><span className="waiting-orb">✦</span><h2>Watch the stage</h2><p>This activity is host-led, so participants follow the instructions in the room.</p></section> : isBuzzer ? <section className="participant-buzzer-card"><h2>{prompt}</h2><button type="button" className="participant-buzzer" onClick={() => setSelected(selected === 0 ? null : 0)}>{selected === 0 ? 'BUZZ LOCKED' : 'BUZZ'}</button><small className="activity-preview-interaction-note">Preview interaction only — nothing is sent.</small></section> : isChoice ? <section className="participant-input-card"><span className="participant-kicker">CHOOSE ONE</span><h2>{prompt}</h2><div className="participant-choice-list">{choiceOptions.map((option, index) => <button type="button" key={`${option}-${index}`} className={selected === index ? 'selected' : ''} onClick={() => setSelected(index)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>{selected !== null && <small className="participant-saved-note">Preview answer selected.</small>}</section> : <section className="participant-input-card"><span className="participant-kicker">YOUR RESPONSE</span><h2>{prompt}</h2><textarea value={response} onChange={event => setResponse(event.target.value)} placeholder={type === 'drawing' ? 'A drawing surface appears here on a phone.' : 'Type your response…'} /><button type="button" className="participant-primary-button" disabled={!response.trim()} onClick={() => setResponse('')}>{type === 'drawing' ? 'Submit drawing' : 'Send response'}</button></section>}
      <div className="activity-preview-participant-footer"><span>● Connected to demo session</span><span>12 players</span></div>
    </div>
  </div>;
};

const LeaderboardPreview: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const state = objectOf(envelope.state);
  const leaderboard = listOf(state.leaderboard);
  const teams = listOf(state.teams);
  return <div className="activity-preview-utility-screen activity-preview-leaderboard-screen">
    <span className="activity-preview-screen-kicker">SCOREBOARD PREVIEW</span>
    <h2>{envelope.name}</h2>
    <p>Scores stay readable from across the room and update between rounds.</p>
    <div className="activity-preview-leaderboard-list">{(teams.length ? teams : leaderboard).map((entry, index) => <div className="activity-preview-leaderboard-row" key={textOf(entry.id, String(index))}><span className="activity-preview-rank">{numberOf(entry.rank, index + 1)}</span><span className="activity-preview-entry-icon">{textOf(entry.icon, index === 0 ? '★' : '◆')}</span><strong>{textOf(entry.name, 'Player')}</strong><b>{numberOf(entry.score)} pts</b></div>)}</div>
    <small>Preview data is representative and never saved.</small>
  </div>;
};

const PodiumPreview: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const leaderboard = listOf(objectOf(envelope.state).leaderboard);
  const first = leaderboard[0] || { name: 'Taylor', score: 760 };
  const second = leaderboard[1] || { name: 'Jordan', score: 625 };
  const third = leaderboard[2] || { name: 'Alex', score: 490 };
  return <div className="activity-preview-utility-screen activity-preview-podium-screen">
    <span className="activity-preview-screen-kicker">FINAL RESULTS PREVIEW</span>
    <h2>{envelope.name}</h2>
    <p>A short, dramatic winner reveal closes the activity.</p>
    <div className="activity-preview-podium"><div className="activity-preview-podium-place second"><span>2</span><strong>{textOf(second.name)}</strong><small>{numberOf(second.score)} pts</small></div><div className="activity-preview-podium-place first"><span>1</span><strong>{textOf(first.name)}</strong><small>{numberOf(first.score)} pts</small></div><div className="activity-preview-podium-place third"><span>3</span><strong>{textOf(third.name)}</strong><small>{numberOf(third.score)} pts</small></div></div>
    <div className="activity-preview-winner-banner">🏆 {textOf(first.name)} wins the round</div>
  </div>;
};

export const ActivityPreview: React.FC<{ definition: ActivityDefinition; mode: ActivityPreviewMode }> = ({ definition, mode }) => {
  const envelope = useMemo(() => createActivityPreviewEnvelope(definition, mode), [definition, mode]);
  const previewClass = `activity-preview-themed activity-theme-${envelope.theme?.preset || 'stage'}`;
  const previewStyle = activityThemeVariables(envelope.theme);
  if (mode === 'participant') return <div className={previewClass} style={previewStyle}><ParticipantPreview envelope={envelope} /></div>;
  if (mode === 'leaderboard') return <div className={previewClass} style={previewStyle}><LeaderboardPreview envelope={envelope} /></div>;
  if (mode === 'podium') return <div className={previewClass} style={previewStyle}><PodiumPreview envelope={envelope} /></div>;

  const DisplayComponent = getActivityDescriptor(definition.type).displayComponent;
  return <div className={`${previewClass} activity-preview-display activity-preview-${mode}`} style={previewStyle}><DisplayComponent envelope={envelope} /></div>;
};
