export type DrawingStroke = { points: Array<[number, number]>; color: string; width: number };

export function drawingLimit(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.min(240, Math.floor(value))) : fallback;
}

export function samplePoints(points: DrawingStroke['points'], limit: number): DrawingStroke['points'] {
  if (points.length <= limit) return points;
  if (limit === 1) return [points[0]];
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * (points.length - 1) / (limit - 1))]);
}

/** Match server limits without rejecting a perfectly ordinary long gesture. */
export function prepareDrawing(strokes: DrawingStroke[], maxStrokes = 80, maxPoints = 120): DrawingStroke[] {
  const source = strokes.slice(0, maxStrokes).filter(stroke => stroke.points.length);
  let limit = drawingLimit(maxPoints, 120);
  let result: DrawingStroke[];
  do {
    result = source.map(stroke => ({ ...stroke, points: samplePoints(stroke.points, limit)
      .map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]) }));
    if (JSON.stringify({ strokes: result }).length <= 95000 || limit === 1) return result;
    limit = Math.max(1, Math.floor(limit * .8));
  } while (limit >= 1);
  return result;
}
