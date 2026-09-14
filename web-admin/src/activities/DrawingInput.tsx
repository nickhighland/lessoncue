import React, { useEffect, useRef, useState } from 'react';
import { GameButton } from './ActivityJuice';
import { drawingLimit, prepareDrawing, samplePoints, strokeTouchesPoint, type DrawingStroke } from './drawingData';

export const DrawingInput: React.FC<{
  prompt: string; disabled: boolean; saved: boolean; config: Record<string, unknown>;
  onSubmit: (strokes: DrawingStroke[]) => void;
}> = ({ prompt, disabled, saved, config, onSubmit }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<DrawingStroke[]>([]);
  const pointer = useRef<number | null>(null);
  const repaint = useRef(() => {});
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#f8fafc');
  const [width, setWidth] = useState(.012);
  const [notice, setNotice] = useState('');
  const maxStrokes = drawingLimit(config.maxStrokes, 80);
  const maxPoints = drawingLimit(config.maxPointsPerStroke ?? config.maxStrokePoints, 120);
  const palette = ['#f8fafc', '#f2c35a', '#ff6b8b', '#67e8f9', '#7cf29a'];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(rect.width * ratio));
      const pixelHeight = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (const stroke of strokesRef.current) {
        if (!stroke.points.length) continue;
        context.beginPath();
        context.strokeStyle = context.fillStyle = stroke.color;
        context.lineWidth = stroke.width * rect.width;
        if (stroke.points.length === 1) {
          const [x, y] = stroke.points[0];
          context.arc(x * rect.width, y * rect.height, context.lineWidth / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          stroke.points.forEach(([x, y], index) => index === 0 ? context.moveTo(x * rect.width, y * rect.height) : context.lineTo(x * rect.width, y * rect.height));
          context.stroke();
        }
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    repaint.current = schedule;
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    observer?.observe(canvas);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      repaint.current = () => {};
    };
  }, []);

  const replace = (next: DrawingStroke[], updateControls = true) => {
    strokesRef.current = next;
    if (updateControls) setStrokes(next);
    repaint.current();
  };
  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))), Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)))];
  };
  const erase = (point: [number, number]) => replace(strokesRef.current.filter(stroke =>
    !strokeTouchesPoint(stroke, point, Math.max(width * 2.5, .022))));
  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || pointer.current !== null || !event.isPrimary || event.button !== 0) return;
    if (tool === 'pen' && strokesRef.current.length >= maxStrokes) {
      setNotice(`This drawing allows ${maxStrokes} strokes. Undo or erase a stroke to continue.`);
      return;
    }
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setNotice('');
    const point = pointFor(event);
    if (tool === 'eraser') erase(point);
    else replace([...strokesRef.current, { points: [point], color, width }]);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId || disabled) return;
    const point = pointFor(event);
    if (tool === 'eraser') { erase(point); return; }
    const current = strokesRef.current;
    const last = current[current.length - 1];
    if (!last) return;
    const previous = last.points[last.points.length - 1];
    if (Math.hypot(previous[0] - point[0], previous[1] - point[1]) < .001) return;
    // Bounded capture, painted once per frame rather than reallocating the
    // canvas and its ResizeObserver on every pointer event.
    replace([...current.slice(0, -1), { ...last, points: [...samplePoints(last.points, 2048), point] }], false);
  };
  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    replace(prepareDrawing(strokesRef.current, maxStrokes, maxPoints));
  };

  return <section className="participant-input-card drawing-input-card"><span className="participant-kicker">SKETCH IT</span><h2>{prompt}</h2>
    <canvas ref={canvasRef} className="drawing-canvas" aria-label="Draw your answer" style={{ touchAction: 'none' }} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />
    <div className="drawing-tool-controls" role="toolbar" aria-label="Drawing tools">
      <GameButton type="button" className={`participant-secondary-button ${tool === 'pen' ? 'selected' : ''}`} aria-pressed={tool === 'pen'} disabled={disabled} onClick={() => setTool('pen')}>✎ Pen</GameButton>
      <GameButton type="button" className={`participant-secondary-button ${tool === 'eraser' ? 'selected' : ''}`} aria-pressed={tool === 'eraser'} disabled={disabled} onClick={() => setTool('eraser')}>⌫ Eraser</GameButton>
      <label>Size<select aria-label="Brush size" value={String(width)} disabled={disabled} onChange={event => setWidth(Number(event.target.value))}><option value="0.008">Fine</option><option value="0.012">Medium</option><option value="0.022">Bold</option><option value="0.04">Marker</option></select></label>
    </div>
    <div className="drawing-palette" role="toolbar" aria-label="Ink color">{palette.map(swatch => <GameButton key={swatch} type="button" className={color === swatch && tool === 'pen' ? 'selected' : ''} aria-label={`Use ${swatch} ink`} aria-pressed={color === swatch && tool === 'pen'} disabled={disabled} onClick={() => { setColor(swatch); setTool('pen'); }} style={{ background: swatch }} />)}</div>
    <div className="drawing-tool-row">
      <GameButton type="button" className="participant-secondary-button" disabled={disabled || !strokes.length} onClick={() => replace(strokesRef.current.slice(0, -1))}>Undo</GameButton>
      <GameButton type="button" className="participant-secondary-button" disabled={disabled || !strokes.length} onClick={() => replace([])}>Clear</GameButton>
      <GameButton type="button" className="participant-primary-button" lockIn disabled={disabled || !strokes.length} onClick={() => onSubmit(prepareDrawing(strokesRef.current, maxStrokes, maxPoints))}>{saved ? 'Drawing saved' : disabled ? 'Submitting…' : 'Submit drawing'}</GameButton>
    </div>
    {notice && <small role="status">{notice}</small>}
    {saved && <small className="participant-saved-note">Your drawing is locked in.</small>}
  </section>;
};
