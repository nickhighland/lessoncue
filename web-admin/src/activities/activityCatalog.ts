export type ActivityCatalogCategoryId =
  | 'quiz'
  | 'puzzle'
  | 'gameShow'
  | 'creative'
  | 'audience'
  | 'movement'
  | 'media'
  | 'utility';

export interface ActivityCatalogCategory {
  id: ActivityCatalogCategoryId;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
}

/**
 * One teacher-facing taxonomy shared by the library and the activity chooser.
 * Runtime categories and engines are implementation details and are deliberately
 * not exposed here: a teacher should not have to know that a poll and a
 * prediction use different engines to find them beside one another.
 */
export const ACTIVITY_CATALOG_CATEGORIES: readonly ActivityCatalogCategory[] = [
  {
    id: 'quiz',
    label: 'Quizzes & knowledge',
    shortLabel: 'Quizzes',
    description: 'Question-based games for review, recall, estimation, and fast answers.',
    icon: '🧠',
  },
  {
    id: 'puzzle',
    label: 'Puzzles & word games',
    shortLabel: 'Puzzles',
    description: 'Ordering, matching, decoding, ranking, and word challenges.',
    icon: '🧩',
  },
  {
    id: 'gameShow',
    label: 'Game show games',
    shortLabel: 'Game shows',
    description: 'Competitive buzzers, surveys, brackets, and prize-board formats.',
    icon: '🏆',
  },
  {
    id: 'creative',
    label: 'Creative & social',
    shortLabel: 'Creative',
    description: 'Drawing, jokes, bluffs, and games built around original responses.',
    icon: '🎨',
  },
  {
    id: 'audience',
    label: 'Polls & audience',
    shortLabel: 'Audience',
    description: 'Collect opinions, predictions, and live responses from participant devices.',
    icon: '📊',
  },
  {
    id: 'movement',
    label: 'Challenges & movement',
    shortLabel: 'Movement',
    description: 'Host-led timers and activities that get the room moving.',
    icon: '🏃',
  },
  {
    id: 'media',
    label: 'Picture & media games',
    shortLabel: 'Media',
    description: 'Reveal, shuffle, compare, or guess with pictures and other media.',
    icon: '🖼️',
  },
  {
    id: 'utility',
    label: 'Classroom tools',
    shortLabel: 'Tools',
    description: 'Wheels, pickers, timers, scoreboards, and other game helpers.',
    icon: '🎛️',
  },
] as const;

const CATEGORY_BY_ID = new Map(ACTIVITY_CATALOG_CATEGORIES.map(category => [category.id, category]));

const ACTIVITY_TYPE_CATEGORIES: Readonly<Record<string, ActivityCatalogCategoryId>> = {
  trivia: 'quiz',
  rapidFire: 'quiz',

  emojiPrompt: 'puzzle',
  rankIt: 'puzzle',
  wordScramble: 'puzzle',
  ordering: 'puzzle',
  word: 'puzzle',
  matchPlayer: 'puzzle',

  buzzer: 'gameShow',
  surveyBoard: 'gameShow',
  bracket: 'gameShow',
  prizeGrid: 'gameShow',

  punchline: 'creative',
  fakeOut: 'creative',
  drawing: 'creative',

  poll: 'audience',
  prediction: 'audience',
  responses: 'audience',

  stageChallenge: 'movement',
  physicalRoom: 'movement',

  imageReveal: 'media',
  imageShuffle: 'media',

  wheel: 'utility',
  picker: 'utility',
  scoreboard: 'utility',
  countdown: 'utility',
  utility: 'utility',
};

const categoryFromLegacyLabel = (category?: string): ActivityCatalogCategoryId | null => {
  const normalized = (category || '').trim().toLowerCase();
  if (['knowledge', 'quiz', 'quizzes'].includes(normalized)) return 'quiz';
  if (['sorting', 'match', 'puzzle', 'puzzles', 'word'].includes(normalized)) return 'puzzle';
  if (['gameshow', 'game show', 'games'].includes(normalized)) return 'gameShow';
  if (['creative', 'drawing'].includes(normalized)) return 'creative';
  if (['poll', 'polls', 'audience'].includes(normalized)) return 'audience';
  if (['stage', 'physical', 'challenge', 'challenges'].includes(normalized)) return 'movement';
  if (normalized === 'media') return 'media';
  if (['utility', 'utilities'].includes(normalized)) return 'utility';
  return null;
};

export const categoryForActivityType = (type: string, legacyCategory?: string): ActivityCatalogCategoryId =>
  ACTIVITY_TYPE_CATEGORIES[type] || categoryFromLegacyLabel(legacyCategory) || 'utility';

export const getActivityCatalogCategory = (id: ActivityCatalogCategoryId): ActivityCatalogCategory =>
  CATEGORY_BY_ID.get(id) || ACTIVITY_CATALOG_CATEGORIES[ACTIVITY_CATALOG_CATEGORIES.length - 1];

export const compareActivityCatalogCategories = (left: ActivityCatalogCategoryId, right: ActivityCatalogCategoryId): number =>
  ACTIVITY_CATALOG_CATEGORIES.findIndex(category => category.id === left)
  - ACTIVITY_CATALOG_CATEGORIES.findIndex(category => category.id === right);
