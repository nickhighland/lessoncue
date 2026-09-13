import React from 'react';

export const DrawingPreview: React.FC<{ strokes: unknown; className?: string }> = ({ strokes, className = '' }) => (
  <svg className={`drawing-svg ${className}`} viewBox="0 0 1 1" role="img" aria-label="Submitted drawing">
    <rect width="1" height="1" rx=".035" fill="rgba(255,255,255,.06)" />
    {Array.isArray(strokes) && strokes.map((stroke, index) => {
      if (!stroke || typeof stroke !== 'object') return null;
      const points = Array.isArray(stroke.points) ? stroke.points.filter((point: unknown) => Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(value => typeof value === 'number' && Number.isFinite(value))) as number[][] : [];
      const color = typeof stroke.color === 'string' && /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : '#f8fafc';
      const width = typeof stroke.width === 'number' && Number.isFinite(stroke.width) ? Math.max(.002, Math.min(.1, stroke.width)) : .012;
      return points.length === 1 ? <circle key={index} cx={points[0][0]} cy={points[0][1]} r={width / 2} fill={color} />
        : points.length ? <polyline key={index} points={points.map(point => point.slice(0, 2).join(',')).join(' ')} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" /> : null;
    })}
  </svg>
);
