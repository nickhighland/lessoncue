import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stageKicker } from './stageHeading.ts';

test('drops a label that only repeats the title', () => {
  // The reported case: "❓ TRIVIA" sitting directly above "Trivia".
  assert.equal(stageKicker('❓', 'TRIVIA', 'TRIVIA SHOWDOWN', 'QUESTION 1 OF 5', 'Trivia'),
    '❓ QUESTION 1 OF 5');
});

test('keeps a label that says something the title does not', () => {
  assert.equal(stageKicker('❓', 'FACT OR FICTION', 'TRIVIA SHOWDOWN', 'QUESTION 1 OF 5', 'Week 3 Warm-Up'),
    '❓ FACT OR FICTION · QUESTION 1 OF 5');
});

test('ignores punctuation and case when comparing', () => {
  assert.equal(stageKicker('🕵️', "WHAT'S DIFFERENT?", 'X', 'OBSERVE CLOSELY', 'Whats Different'),
    '🕵️ OBSERVE CLOSELY');
});

test('a teacher title that contains the format still counts as one name', () => {
  assert.equal(stageKicker('❓', 'TRIVIA SHOWDOWN', 'X', 'STANDINGS', 'Trivia Showdown'),
    '❓ STANDINGS');
});

test('falls back to the shipped label when none is configured', () => {
  assert.equal(stageKicker('🔍', undefined, 'MYSTERY IMAGE', '40% REVEALED', 'Week 2 Puzzle'),
    '🔍 MYSTERY IMAGE · 40% REVEALED');
});

test('no context leaves just the label', () => {
  assert.equal(stageKicker('🎲', undefined, 'RANDOM SELECTION', undefined, 'Week 2'),
    '🎲 RANDOM SELECTION');
});
