import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareDrawing, samplePoints, drawingLimit } from './drawingData.ts';

test('long touch strokes preserve their endpoints within the configured point limit', () => {
  const points = Array.from({ length: 1000 }, (_, i) => [i / 999, Math.sin(i) / 2 + .5]);
  const [drawing] = prepareDrawing([{ color: '#f8fafc', width: .012, points }], 80, 12);
  assert.equal(drawing.points.length, 12);
  assert.equal(drawing.points[0][0], 0);
  assert.equal(drawing.points.at(-1)[0], 1);
  assert.deepEqual(samplePoints([[.5, .5]], 1), [[.5, .5]]);
});

test('a densely drawn canvas stays within the server payload budget', () => {
  const strokes = Array.from({ length: 240 }, () => ({ color: '#f8fafc', width: .012,
    points: Array.from({ length: 240 }, (_, i) => [(i + .123456) / 240, (i + .987654) / 240]) }));
  const drawing = prepareDrawing(strokes, 240, 240);
  assert.equal(drawing.length, 240);
  assert.ok(JSON.stringify({ strokes: drawing }).length <= 95000);
  assert.ok(drawing.every(stroke => stroke.points.length <= 240));
  assert.equal(drawingLimit(Infinity, 80), 80);
  assert.equal(drawingLimit(1000, 80), 240);
});
