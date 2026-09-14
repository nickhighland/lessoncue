import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareDrawing, samplePoints, drawingLimit, strokeTouchesPoint } from './drawingData.ts';

test('eraser intersects complete segments while preserving nearby unrelated strokes', () => {
  const stroke = points => ({ points, color: '#ffffff', width: .012 });
  assert.equal(strokeTouchesPoint(stroke([[.1, .5], [.9, .5]]), [.5, .5], .03), true);
  assert.equal(strokeTouchesPoint(stroke([[.1, .1], [.9, .9]]), [.5, .52], .03), true);
  assert.equal(strokeTouchesPoint(stroke([[.1, .5], [.9, .5]]), [.5, .6], .03), false);
  assert.equal(strokeTouchesPoint(stroke([[.1, .1], [.4, .4]]), [.9, .9], .03), false);
  assert.equal(strokeTouchesPoint(stroke([[.5, .5]]), [.5, .51], .03), true);
  assert.equal(strokeTouchesPoint(stroke([[.5, .5], [.5, .5]]), [.5, .51], .03), true);
  assert.equal(strokeTouchesPoint(stroke([]), [.5, .5], .03), false);
});

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
