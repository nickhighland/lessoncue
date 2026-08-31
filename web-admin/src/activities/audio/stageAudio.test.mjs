import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stageBedFor, finalStretchDue, FINAL_STRETCH_MS } from './stageAudio.ts';

test('the lobby has its own bed', () => {
  assert.equal(stageBedFor({ inLobby: true, finished: false, counting: false }), 'lobby');
});

test('play has a bed of its own, which it did not before', () => {
  assert.equal(stageBedFor({ inLobby: false, finished: false, counting: false }), 'gameplay');
});

test('a timed window lifts to the countdown bed', () => {
  assert.equal(stageBedFor({ inLobby: false, finished: false, counting: true }), 'countdown');
});

test('the end of the game is silence, so the outro sting stands alone', () => {
  assert.equal(stageBedFor({ inLobby: false, finished: true, counting: true }), null);
});

test('the final five fires once, as the clock crosses five seconds', () => {
  assert.equal(finalStretchDue(6_000, 4_900), true);
  // Already inside the window: the recording is playing, do not restart it.
  assert.equal(finalStretchDue(4_900, 4_100), false);
});

test('a countdown shorter than the window never fires it', () => {
  // Starting at three seconds never crosses five from above; playing a five
  // second recording over a three second clock would end after the game moved.
  assert.equal(finalStretchDue(3_000, 2_900), false);
});

test('nothing fires without a countdown, or once it has run out', () => {
  assert.equal(finalStretchDue(null, 4_000), false);
  assert.equal(finalStretchDue(6_000, null), false);
  assert.equal(finalStretchDue(6_000, 0), false);
});

test('the window is five seconds', () => {
  assert.equal(FINAL_STRETCH_MS, 5_000);
});
