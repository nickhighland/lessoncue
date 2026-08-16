import React from 'react';
import type { ActivityTypeDescriptor, ActivityStateEnvelope, ActivityHostView } from './types';

// Game Show Display & Controller Components
import { WheelDisplay } from './types/Wheel/WheelDisplay';
import { WheelController } from './types/Wheel/WheelController';
import { WheelEditor } from './types/Wheel/WheelEditor';

import { PickerDisplay } from './types/Picker/PickerDisplay';
import { PickerController } from './types/Picker/PickerController';
import { PickerEditor } from './types/Picker/PickerEditor';

import { ScoreboardDisplay } from './types/Scoreboard/ScoreboardDisplay';
import { ScoreboardController } from './types/Scoreboard/ScoreboardController';
import { ScoreboardEditor } from './types/Scoreboard/ScoreboardEditor';

import { CountdownDisplay } from './types/Countdown/CountdownDisplay';
import { CountdownController } from './types/Countdown/CountdownController';
import { CountdownEditor } from './types/Countdown/CountdownEditor';

import { PrizeGridDisplay } from './types/PrizeGrid/PrizeGridDisplay';
import { PrizeGridController } from './types/PrizeGrid/PrizeGridController';
import { PrizeGridEditor } from './types/PrizeGrid/PrizeGridEditor';

import { TriviaDisplay } from './types/Trivia/TriviaDisplay';
import { TriviaController } from './types/Trivia/TriviaController';
import { TriviaEditor } from './types/Trivia/TriviaEditor';

import { SurveyBoardDisplay } from './types/SurveyBoard/SurveyBoardDisplay';
import { SurveyBoardController } from './types/SurveyBoard/SurveyBoardController';
import { SurveyBoardEditor } from './types/SurveyBoard/SurveyBoardEditor';

import { ImageRevealDisplay } from './types/ImageReveal/ImageRevealDisplay';
import { ImageRevealController } from './types/ImageReveal/ImageRevealController';
import { ImageRevealEditor } from './types/ImageReveal/ImageRevealEditor';

import { ImageShuffleDisplay } from './types/ImageShuffle/ImageShuffleDisplay';
import { ImageShuffleController } from './types/ImageShuffle/ImageShuffleController';
import { ImageShuffleEditor } from './types/ImageShuffle/ImageShuffleEditor';

import { PollDisplay, PollController, PollEditor, ResponsesDisplay, ResponsesController } from './types/Audience/AudienceComponents';
import {
  RapidFireDisplay,
  RapidFireController,
  RapidFireEditor,
  EmojiPromptDisplay,
  EmojiPromptController,
  EmojiPromptEditor,
  RankItDisplay,
  RankItController,
  RankItEditor,
  WordScrambleDisplay,
  WordScrambleController,
  WordScrambleEditor,
  PredictionDisplay,
  PredictionController,
  PredictionEditor
} from './types/NewGames/NewGames';
import {
  BuzzerDisplay,
  BuzzerController,
  BuzzerEditor,
  PunchlineDisplay,
  PunchlineController,
  PunchlineEditor,
  FakeOutDisplay,
  FakeOutController,
  FakeOutEditor
} from './types/Interactive/InteractiveGames';
import {
  DrawingDisplay,
  DrawingController,
  DrawingEditor,
  OrderingDisplay,
  OrderingController,
  OrderingEditor,
  WordDisplay,
  WordController,
  WordEditor,
  MatchPlayerDisplay,
  MatchPlayerController,
  MatchPlayerEditor,
  StageChallengeDisplay,
  StageChallengeController,
  StageChallengeEditor
} from './types/Interactive/RichInteractionGames';
import { BracketDisplay, BracketController, BracketEditor } from './types/Interactive/BracketGames';
import { PhysicalRoomDisplay, PhysicalRoomController, PhysicalRoomEditor } from './types/Interactive/PhysicalRoomGames';
import { UtilityDisplay, UtilityController, UtilityEditor } from './types/Interactive/UtilityGames';

export interface ActivityComponentProps {
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
  interactive?: boolean;
  hostView?: ActivityHostView | null;
}

export interface ActivityEditorProps {
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}

export interface ActivityTypeEntry extends ActivityTypeDescriptor {
  displayComponent: React.ComponentType<ActivityComponentProps>;
  controllerComponent: React.ComponentType<ActivityComponentProps>;
  editorComponent: React.ComponentType<ActivityEditorProps>;
}

export const ACTIVITY_REGISTRY: Record<string, ActivityTypeEntry> = {
  wheel: {
    type: 'wheel',
    name: 'Spin Wheel',
    description: 'Flashy customizable spinning wheel with physics, indicator ticks, and winner fanfare.',
    icon: '☸',
    category: 'utility',
    badge: 'Popular',
    engineType: 'utility',
    presetType: 'wheel',
    supportedModes: ['hostOnly', 'teams'],
    inputTypes: ['random'],
    requiresPhones: false,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Spin Wheel',
      items: [
        { id: '1', label: 'Prize 1', weight: 1 },
        { id: '2', label: 'Prize 2', weight: 1 },
        { id: '3', label: 'Prize 3', weight: 1 },
        { id: '4', label: 'Prize 4', weight: 1 }
      ],
      removeWinner: true
    }),
    displayComponent: WheelDisplay,
    controllerComponent: WheelController,
    editorComponent: WheelEditor
  },

  picker: {
    type: 'picker',
    name: 'Random Picker',
    description: 'Slot-machine style high-speed name / number cycler with dramatic slowdown.',
    icon: '🎲',
    category: 'utility',
    badge: 'Fast',
    engineType: 'utility',
    presetType: 'randomPicker',
    supportedModes: ['hostOnly', 'teams'],
    inputTypes: ['random'],
    requiresPhones: false,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Random Picker',
      items: ['Alice', 'Bob', 'Charlie', 'David', 'Emma', 'Frank', 'Grace', 'Henry'],
      removeAfterPick: true
    }),
    displayComponent: PickerDisplay,
    controllerComponent: PickerController,
    editorComponent: PickerEditor
  },

  scoreboard: {
    type: 'scoreboard',
    name: 'Scoreboard',
    description: 'Multi-team animated stadium scoreboard with point bars, podium ranks, and quick remotes.',
    icon: '🏆',
    category: 'utility',
    badge: 'Essential',
    engineType: 'utility',
    presetType: 'leaderboard',
    supportedModes: ['hostOnly', 'teams'],
    inputTypes: ['score'],
    requiresPhones: false,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Team Scoreboard',
      teams: [
        { id: '1', name: 'Gold Team', color: '#d88c1e', icon: '⭐', initialScore: 0 },
        { id: '2', name: 'Green Team', color: '#2a6e4a', icon: '🌲', initialScore: 0 },
        { id: '3', name: 'Blue Team', color: '#2563eb', icon: '⚡', initialScore: 0 },
        { id: '4', name: 'Red Team', color: '#dc2626', icon: '🔥', initialScore: 0 }
      ],
      increment: 1,
      decrement: 1
    }),
    displayComponent: ScoreboardDisplay,
    controllerComponent: ScoreboardController,
    editorComponent: ScoreboardEditor
  },

  countdown: {
    type: 'countdown',
    name: 'Game Countdown',
    description: 'Dynamic pulsing digital clock with circular SVG progress ring, warning shifts, and ticking audio.',
    icon: '⏱️',
    category: 'utility',
    engineType: 'utility',
    presetType: 'countdown',
    supportedModes: ['hostOnly'],
    inputTypes: ['timer'],
    requiresPhones: false,
    supportsTeams: false,
    createDefaultConfig: () => ({
      title: 'Game Countdown',
      durationSeconds: 60
    }),
    displayComponent: CountdownDisplay,
    controllerComponent: CountdownController,
    editorComponent: CountdownEditor
  },

  prizeGrid: {
    type: 'prizeGrid',
    name: 'Prize Grid',
    description: '3D flipping gold boxes with concealed mystery prizes and point reveals.',
    icon: '🎁',
    category: 'utility',
    engineType: 'utility',
    presetType: 'mysteryBoxes',
    supportedModes: ['hostOnly', 'teams'],
    inputTypes: ['random', 'score'],
    requiresPhones: false,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Prize Grid',
      boxes: [
        { boxNumber: 1, frontText: '1', frontEmoji: '🎁', hiddenPrize: '$10 Gift Card', points: 100 },
        { boxNumber: 2, frontText: '2', frontEmoji: '🎁', hiddenPrize: 'Mystery Box', points: 50 },
        { boxNumber: 3, frontText: '3', frontEmoji: '🎁', hiddenPrize: 'Grand Prize', points: 500 },
        { boxNumber: 4, frontText: '4', frontEmoji: '🎁', hiddenPrize: 'Candy Bar', points: 10 },
        { boxNumber: 5, frontText: '5', frontEmoji: '🎁', hiddenPrize: 'Bonus Points', points: 250 },
        { boxNumber: 6, frontText: '6', frontEmoji: '🎁', hiddenPrize: 'Double Points', points: 200 }
      ]
    }),
    displayComponent: PrizeGridDisplay,
    controllerComponent: PrizeGridController,
    editorComponent: PrizeGridEditor
  },

  trivia: {
    type: 'trivia',
    name: 'Trivia Quiz',
    description: 'Flexible 2–8 choice quiz cards with suspense, reveals, and host-controlled pacing.',
    icon: '❓',
    category: 'games',
    engineType: 'quiz',
    presetType: 'trivia',
    supportedModes: ['everyone', 'teams', 'stage'],
    inputTypes: ['singleChoice', 'multipleChoice', 'boolean', 'text', 'number'],
    requiresPhones: true,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Trivia Quiz',
      questions: [
        {
          id: '1',
          prompt: 'Which planet in our solar system is known as the Red Planet?',
          options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
          correctIndex: 1,
          explanation: 'Mars appears reddish because of widespread iron oxide on its surface.'
        }
      ]
    }),
    displayComponent: TriviaDisplay,
    controllerComponent: TriviaController,
    editorComponent: TriviaEditor
  },

  rapidFire: {
    type: 'rapidFire',
    name: 'Rapid Fire',
    description: 'A host-paced timed quiz with pressure-clock energy, flexible 2–8 choices, and dramatic reveals.',
    icon: '⚡',
    category: 'games',
    badge: 'Fast',
    createDefaultConfig: () => ({
      title: 'Rapid Fire Showdown',
      defaultTimerSeconds: 15,
      questions: [
        { id: 'q1', prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter'], correctIndex: 1, points: 100, timerSeconds: 15, explanation: 'Mars looks red because of iron oxide on its surface.' }
      ]
    }),
    displayComponent: RapidFireDisplay,
    controllerComponent: RapidFireController,
    editorComponent: RapidFireEditor
  },

  emojiPrompt: {
    type: 'emojiPrompt',
    name: 'Emoji Charades',
    description: 'A bright visual guessing game built around emoji clues, optional hints, and a big answer flip.',
    icon: '🎭',
    category: 'games',
    badge: 'Crowd Favorite',
    createDefaultConfig: () => ({
      title: 'Emoji Charades',
      instruction: 'What phrase, song, or story do these emojis describe?',
      rounds: [
        { id: 'r1', emoji: '🦁👑', prompt: 'Name the movie', answer: 'The Lion King', hint: 'A famous animated royal adventure.', points: 100, category: 'Movies' }
      ]
    }),
    displayComponent: EmojiPromptDisplay,
    controllerComponent: EmojiPromptController,
    editorComponent: EmojiPromptEditor
  },

  rankIt: {
    type: 'rankIt',
    name: 'Rank It!',
    description: 'A debate-friendly ordering challenge where teams lock in a list before the official order appears.',
    icon: '📈',
    category: 'games',
    badge: 'Debate',
    createDefaultConfig: () => ({
      title: 'Rank It!',
      instruction: 'Put the items in the right order before the reveal!',
      rounds: [
        { id: 'r1', prompt: 'Rank these from smallest to biggest.', items: [{ id: 'i1', label: 'Small', icon: '🔹' }, { id: 'i2', label: 'Medium', icon: '🔷' }, { id: 'i3', label: 'Big', icon: '💠' }], category: 'Warm-up' }
      ]
    }),
    displayComponent: RankItDisplay,
    controllerComponent: RankItController,
    editorComponent: RankItEditor
  },

  wordScramble: {
    type: 'wordScramble',
    name: 'Word Scramble',
    description: 'A timed letter scramble with clues, hints, escalating rounds, and a satisfying solve reveal.',
    icon: '🔤',
    category: 'games',
    badge: 'Timed',
    createDefaultConfig: () => ({
      title: 'Word Scramble',
      instruction: 'Unscramble the word before time runs out!',
      secondsPerRound: 30,
      rounds: [
        { id: 'r1', word: 'CREATIVE', clue: 'A way to make something new', scrambledWord: 'EIVTAERC', points: 100, category: 'Making' }
      ]
    }),
    displayComponent: WordScrambleDisplay,
    controllerComponent: WordScrambleController,
    editorComponent: WordScrambleEditor
  },

  prediction: {
    type: 'prediction',
    name: 'Make Your Prediction',
    description: 'A host-controlled prediction board for story beats, tie-breakers, and “what happens next?” moments.',
    icon: '🔮',
    category: 'games',
    engineType: 'poll',
    presetType: 'prediction',
    supportedModes: ['everyone', 'teams'],
    inputTypes: ['singleChoice', 'multipleChoice', 'number'],
    requiresPhones: true,
    supportsTeams: true,
    badge: 'New',
    createDefaultConfig: () => ({
      title: 'Make Your Prediction',
      instruction: 'Lock in your prediction before the reveal!',
      rounds: [
        { id: 'r1', prompt: 'Which team will score first?', options: ['Gold', 'Green', 'Blue', 'Red'], correctIndex: 0, explanation: 'Gold is the sample answer for this warm-up round.', points: 100, category: 'Warm-up' }
      ]
    }),
    displayComponent: PredictionDisplay,
    controllerComponent: PredictionController,
    editorComponent: PredictionEditor
  },

  surveyBoard: {
    type: 'surveyBoard',
    name: 'Survey Board',
    description: 'Family Feud-style answer slats with multiple rounds, scores, and host-controlled strikes.',
    icon: '📋',
    category: 'games',
    engineType: 'survey',
    presetType: 'surveyShowdown',
    supportedModes: ['teams', 'stage'],
    inputTypes: ['text', 'buzzer'],
    requiresPhones: true,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Survey Board',
      questions: [
        {
          id: '1',
          prompt: 'Name something people bring to church on Sunday',
          answers: [
            { id: '1', rank: 1, text: 'Bible / Notes', points: 42 },
            { id: '2', rank: 2, text: 'Coffee / Drink', points: 28 },
            { id: '3', rank: 3, text: 'Offering / Tithe', points: 18 },
            { id: '4', rank: 4, text: 'Children / Family', points: 12 }
          ]
        }
      ]
    }),
    displayComponent: SurveyBoardDisplay,
    controllerComponent: SurveyBoardController,
    editorComponent: SurveyBoardEditor
  },

  imageReveal: {
    type: 'imageReveal',
    name: 'Image Reveal',
    description: 'Progressive unblur / tile reveal for mystery pictures with dramatic stage spotlights.',
    icon: '🔍',
    category: 'games',
    engineType: 'media',
    presetType: 'mysteryImage',
    supportedModes: ['stage', 'audience'],
    inputTypes: ['media', 'buzzer'],
    requiresPhones: false,
    supportsTeams: false,
    createDefaultConfig: () => ({
      title: 'Mystery Image Reveal',
      imageUrl: '',
      totalStages: 5
    }),
    displayComponent: ImageRevealDisplay,
    controllerComponent: ImageRevealController,
    editorComponent: ImageRevealEditor
  },

  imageShuffle: {
    type: 'imageShuffle',
    name: 'Image Shuffle',
    description: 'Rapid image cycler / visual randomizer slot machine with stopping trigger.',
    icon: '🔀',
    category: 'games',
    createDefaultConfig: () => ({
      title: 'Image Shuffle',
      images: []
    }),
    displayComponent: ImageShuffleDisplay,
    controllerComponent: ImageShuffleController,
    editorComponent: ImageShuffleEditor
  },

  buzzer: {
    type: 'buzzer',
    name: 'Buzzer Battle',
    description: 'A server-timed race through progressive clues with a clear winner and host-controlled ruling.',
    icon: '⚡',
    category: 'games',
    badge: 'Race',
    engineType: 'buzzer',
    presetType: 'buzzerBattle',
    supportedModes: ['stage', 'teams'],
    inputTypes: ['buzzer', 'text'],
    requiresPhones: true,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Buzzer Battle',
      clues: [
        { id: 'clue-1', prompt: 'This warm-up answer is something bright in the night sky.', answer: 'The moon', points: 100 },
        { id: 'clue-2', prompt: 'It can be full, new, or crescent.', answer: 'The moon', points: 75 }
      ],
      lockOutOnMiss: true,
      wrongPenalty: 0
    }),
    displayComponent: BuzzerDisplay,
    controllerComponent: BuzzerController,
    editorComponent: BuzzerEditor
  },

  punchline: {
    type: 'punchline',
    name: 'Punchline',
    description: 'Anonymous creative responses, host moderation, and a bright gallery vote for the room favorite.',
    icon: '✍️',
    category: 'creative',
    badge: 'Creative',
    engineType: 'creative',
    presetType: 'punchline',
    supportedModes: ['everyone', 'audience'],
    inputTypes: ['text', 'vote'],
    requiresPhones: true,
    supportsTeams: false,
    createDefaultConfig: () => ({
      title: 'Punchline',
      prompts: [{ id: 'prompt-1', prompt: 'The worst possible school mascot would be ______.', points: 100 }],
      requireModeration: true,
      votingSeconds: 30
    }),
    displayComponent: PunchlineDisplay,
    controllerComponent: PunchlineController,
    editorComponent: PunchlineEditor
  },

  fakeOut: {
    type: 'fakeOut',
    name: 'Fake Out',
    description: 'Write believable bluffs, spot the true answer, and reward the player whose lie fooled the room.',
    icon: '🎭',
    category: 'creative',
    badge: 'Bluffing',
    engineType: 'bluff',
    presetType: 'fakeOut',
    supportedModes: ['everyone', 'audience'],
    inputTypes: ['text', 'vote'],
    requiresPhones: true,
    supportsTeams: false,
    createDefaultConfig: () => ({
      title: 'Fake Out',
      rounds: [{ id: 'round-1', prompt: 'Which of these facts is true? Write a believable fake answer.', truth: 'Honey never spoils.', points: 100 }],
      requireModeration: true,
      votingSeconds: 30,
      bluffPoints: 50,
      truthPoints: 100
    }),
    displayComponent: FakeOutDisplay,
    controllerComponent: FakeOutController,
    editorComponent: FakeOutEditor
  },

  drawing: {
    type: 'drawing',
    name: 'Doodle & Guess',
    description: 'A lightweight phone sketchpad with moderation, gallery reveal, and room-favorite scoring.',
    icon: '🎨',
    category: 'creative',
    badge: 'Drawing',
    engineType: 'drawing',
    presetType: 'doodle',
    supportedModes: ['everyone', 'audience'],
    inputTypes: ['drawing', 'vote'],
    requiresPhones: true,
    supportsTeams: false,
    createDefaultConfig: () => ({
      title: 'Doodle & Guess',
      prompts: [{ id: 'prompt-1', prompt: 'Draw a place where you would never want to lose your keys.', points: 100 }],
      requireModeration: true,
      votingSeconds: 30,
      maxStrokePoints: 80
    }),
    displayComponent: DrawingDisplay,
    controllerComponent: DrawingController,
    editorComponent: DrawingEditor
  },

  ordering: {
    type: 'ordering',
    name: 'Order Up',
    description: 'Arrange lesson steps, timelines, or ideas with touch-friendly and accessible move controls.',
    icon: '↕️',
    category: 'games',
    badge: 'Logic',
    engineType: 'ordering',
    presetType: 'orderUp',
    supportedModes: ['everyone', 'teams'],
    inputTypes: ['sorting', 'ranking'],
    requiresPhones: true,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Order Up',
      rounds: [{ id: 'round-1', prompt: 'Put these steps in the best order.', items: [{ id: 'item-1', label: 'Start' }, { id: 'item-2', label: 'Try' }, { id: 'item-3', label: 'Reflect' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }]
    }),
    displayComponent: OrderingDisplay,
    controllerComponent: OrderingController,
    editorComponent: OrderingEditor
  },

  word: {
    type: 'word',
    name: 'Word Storm',
    description: 'Collect short category answers, moderate them, and grow a shared visual word cloud.',
    icon: '☁️',
    category: 'creative',
    badge: 'Group Play',
    engineType: 'word',
    presetType: 'wordStorm',
    supportedModes: ['everyone', 'audience'],
    inputTypes: ['text'],
    requiresPhones: true,
    supportsTeams: false,
    createDefaultConfig: () => ({
      title: 'Word Storm',
      rounds: [{ id: 'round-1', prompt: 'Name something that helps a team work well.', category: 'Teamwork', points: 10, seconds: 45 }],
      requireModeration: true,
      allowDuplicates: false
    }),
    displayComponent: WordDisplay,
    controllerComponent: WordController,
    editorComponent: WordEditor
  },

  matchPlayer: {
    type: 'matchPlayer',
    name: 'Match Minds',
    description: 'Pick a target player, predict their private answer, and see who thinks alike.',
    icon: '🧠',
    category: 'games',
    badge: 'People Match',
    engineType: 'match',
    presetType: 'matchMinds',
    supportedModes: ['everyone', 'stage'],
    inputTypes: ['singleChoice', 'text'],
    requiresPhones: true,
    supportsTeams: false,
    createDefaultConfig: () => ({
      title: 'Match Minds',
      rounds: [{ id: 'round-1', prompt: 'Which would you choose for a free afternoon?', options: ['Read', 'Explore', 'Create', 'Rest'], points: 100 }]
    }),
    displayComponent: MatchPlayerDisplay,
    controllerComponent: MatchPlayerController,
    editorComponent: MatchPlayerEditor
  },

  stageChallenge: {
    type: 'stageChallenge',
    name: 'Beat the Clock',
    description: 'Host-led timed challenges with a clear clock, success/fail ruling, and quick scoring.',
    icon: '⏱️',
    category: 'physical',
    badge: 'Host Led',
    engineType: 'stage',
    presetType: 'beatTheClock',
    supportedModes: ['stage', 'teams', 'hostOnly'],
    inputTypes: ['timer', 'hostJudge'],
    requiresPhones: false,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Beat the Clock',
      challenges: [{ id: 'challenge-1', title: 'Build a paper tower', instructions: 'Build the tallest free-standing tower you can before the clock stops.', seconds: 60, points: 100, failPoints: 0 }]
    }),
    displayComponent: StageChallengeDisplay,
    controllerComponent: StageChallengeController,
    editorComponent: StageChallengeEditor
  },

  bracket: {
    type: 'bracket',
    name: 'Bracket Battle',
    description: 'Advance teacher-entered matchups through audience voting and a host-controlled final.',
    icon: '🏆',
    category: 'games',
    badge: 'Tournament',
    engineType: 'bracket',
    presetType: 'bracketBattle',
    supportedModes: ['everyone', 'audience', 'teams'],
    inputTypes: ['vote', 'hostJudge'],
    requiresPhones: true,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Bracket Battle',
      entrants: [
        { id: 'entrant-1', label: 'North Team' },
        { id: 'entrant-2', label: 'South Team' },
        { id: 'entrant-3', label: 'East Team' },
        { id: 'entrant-4', label: 'West Team' }
      ],
      votingSeconds: 30
    }),
    displayComponent: BracketDisplay,
    controllerComponent: BracketController,
    editorComponent: BracketEditor
  },

  physicalRoom: {
    type: 'physicalRoom',
    name: 'Four Corners',
    description: 'A no-phone room activity with large instructions, optional choices, timers, randomization, and host awards.',
    icon: '🧭',
    category: 'physical',
    badge: 'No phones',
    engineType: 'physical',
    presetType: 'fourCorners',
    supportedModes: ['hostOnly', 'teams', 'everyone'],
    inputTypes: ['timer', 'hostJudge', 'reaction'],
    requiresPhones: false,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Four Corners',
      rounds: [{ id: 'round-1', title: 'Four Corners', instructions: 'Choose a corner of the room. When the timer ends, the host reveals the prompt.', choices: ['North', 'South', 'East', 'West'], seconds: 30, revealText: 'Show your corner and explain your choice.' }],
      randomizeChoices: false
    }),
    displayComponent: PhysicalRoomDisplay,
    controllerComponent: PhysicalRoomController,
    editorComponent: PhysicalRoomEditor
  },

  utility: {
    type: 'utility',
    name: 'Game Show Utilities',
    description: 'Coin flips, dice, live person/team pickers, countdowns, mystery boxes, challenge picks, and team generation in one reusable utility engine.',
    icon: '🎲',
    category: 'utility',
    badge: 'Composable',
    engineType: 'utility',
    presetType: 'gameShowUtilities',
    supportedModes: ['hostOnly', 'teams'],
    inputTypes: ['random', 'score', 'team'],
    requiresPhones: false,
    supportsTeams: true,
    createDefaultConfig: () => ({
      title: 'Coin Flip',
      utilityType: 'coinFlip',
      choices: ['Heads', 'Tails'],
      diceSides: 6,
      minimum: 1,
      maximum: 100,
      durationSeconds: 60,
      warningThresholdSeconds: 10,
      boxes: [
        { id: 'box-1', label: 'Mystery Box 1', value: 'Bonus points', points: 100 },
        { id: 'box-2', label: 'Mystery Box 2', value: 'Choose the next challenge', points: 0 },
        { id: 'box-3', label: 'Mystery Box 3', value: 'Double points', points: 200 }
      ],
      challenges: [
        { id: 'challenge-1', label: 'Answer a bonus question', instructions: 'Give the room a quick review question.', points: 100 },
        { id: 'challenge-2', label: 'Do a ten-second celebration', instructions: 'Let the winning team celebrate.', points: 50 }
      ],
      teamCount: 2,
      teamAssignmentMode: 'balanced'
    }),
    displayComponent: UtilityDisplay,
    controllerComponent: UtilityController,
    editorComponent: UtilityEditor
  },

  poll: {
    type: 'poll',
    name: 'Live Poll',
    description: 'Live audience voting with animated real-time percentage bars.',
    icon: '📊',
    category: 'audience',
    engineType: 'poll',
    presetType: 'readTheRoom',
    supportedModes: ['everyone', 'audience'],
    inputTypes: ['singleChoice', 'multipleChoice', 'slider', 'ranking'],
    requiresPhones: true,
    supportsTeams: false,
    createDefaultConfig: () => ({
      question: 'What is your favorite activity?',
      options: ['Option A', 'Option B', 'Option C']
    }),
    displayComponent: PollDisplay,
    controllerComponent: PollController,
    editorComponent: PollEditor
  },

  responses: {
    type: 'responses',
    name: 'Live Responses',
    description: 'Live moderated text submissions spotlighting participant feedback on screen.',
    icon: '💬',
    category: 'audience',
    createDefaultConfig: () => ({
      prompt: 'Share your thoughts with the room:'
    }),
    displayComponent: ResponsesDisplay,
    controllerComponent: ResponsesController,
    editorComponent: PickerEditor
  }
};

export function getActivityDescriptor(type: string): ActivityTypeEntry {
  return ACTIVITY_REGISTRY[type] || ACTIVITY_REGISTRY.wheel;
}
