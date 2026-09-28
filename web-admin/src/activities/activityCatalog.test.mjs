import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVITY_CATALOG_CATEGORIES,
  categoryForActivityType,
  getActivityCatalogCategory,
} from './activityCatalog.ts';

const EXPECTED_TYPES = {
  wheel: 'utility',
  picker: 'utility',
  scoreboard: 'utility',
  countdown: 'utility',
  prizeGrid: 'gameShow',
  trivia: 'quiz',
  rapidFire: 'quiz',
  emojiPrompt: 'puzzle',
  rankIt: 'puzzle',
  wordScramble: 'puzzle',
  prediction: 'audience',
  surveyBoard: 'gameShow',
  imageReveal: 'media',
  imageShuffle: 'media',
  buzzer: 'gameShow',
  punchline: 'creative',
  fakeOut: 'creative',
  drawing: 'creative',
  ordering: 'puzzle',
  word: 'puzzle',
  matchPlayer: 'puzzle',
  stageChallenge: 'movement',
  bracket: 'gameShow',
  physicalRoom: 'movement',
  utility: 'utility',
  poll: 'audience',
  responses: 'audience',
};

test('every shipped activity type has one predictable teacher-facing category', () => {
  for (const [type, expected] of Object.entries(EXPECTED_TYPES)) {
    assert.equal(categoryForActivityType(type), expected, type);
  }
});

test('catalog categories have unique ids and useful teacher-facing descriptions', () => {
  assert.equal(new Set(ACTIVITY_CATALOG_CATEGORIES.map(category => category.id)).size, ACTIVITY_CATALOG_CATEGORIES.length);
  for (const category of ACTIVITY_CATALOG_CATEGORIES) {
    assert.ok(category.label.length > 4, category.id);
    assert.ok(category.description.length > 25, category.id);
    assert.equal(getActivityCatalogCategory(category.id), category);
  }
});

test('legacy preset labels remain categorized for future catalog entries', () => {
  assert.equal(categoryForActivityType('futureQuiz', 'knowledge'), 'quiz');
  assert.equal(categoryForActivityType('futureMovement', 'physical'), 'movement');
  assert.equal(categoryForActivityType('futureMedia', 'media'), 'media');
});
