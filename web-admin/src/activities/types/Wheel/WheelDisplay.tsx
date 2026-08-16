import React, { useEffect, useRef, useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { playTickSound, playFanfareSound, launchConfetti } from '../../effects';

interface WheelItem {
  id: string;
  label: string;
  weight: number;
  color?: string;
}

interface WheelConfig {
  title?: string;
  subtitle?: string;
  items?: WheelItem[];
  spinDurationSeconds?: number;
  removeWinner?: boolean;
}

interface WheelState {
  winnerId?: string | null;
  winnerLabel?: string | null;
  isSpinning?: boolean;
  targetAngle?: number | null;
  removedIds?: string[];
  spinCount?: number;
  spinNonce?: number;
  spinDurationMs?: number;
}

const DEFAULT_COLORS = [
  '#d88c1e', '#2a6e4a', '#2563eb', '#dc2626', '#7c3aed', '#0f766e',
  '#f59e0b', '#059669', '#3b82f6', '#e11d48', '#8b5cf6', '#0d9488'
];

export const WheelDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const rawConfig = (envelope as unknown as { config?: WheelConfig }).config || {};
  const items: WheelItem[] = (envelope.state as unknown as { items?: WheelItem[] })?.items
    || rawConfig.items
    || [];
  const state: WheelState = (envelope.state as WheelState) || {};

  const activeItems = items.filter(it => !(state.removedIds || []).includes(it.id) && (it.weight ?? 1) > 0);
  const currentAngleRef = useRef(0);
  const [showWinner, setShowWinner] = useState(false);
  const lastSpinNonceRef = useRef<number | undefined>(undefined);
  const [isPointerTicking, setIsPointerTicking] = useState(false);

  // Render Wheel on Canvas
  const drawWheel = (angle: number, itemsToDraw: WheelItem[] = activeItems) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.65, 600);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 20;

    const displayItems = itemsToDraw.filter(item => (item.weight ?? 1) > 0);

    if (displayItems.length === 0) {
      ctx.fillStyle = '#6b7280';
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No Items Left', centerX, centerY);
      ctx.restore();
      return;
    }

    const totalWeight = displayItems.reduce((acc, it) => acc + (it.weight ?? 1), 0);
    let startAngle = angle;

    displayItems.forEach((item, index) => {
      const sliceAngle = ((item.weight ?? 1) / totalWeight) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      // Draw Slice
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();

      ctx.fillStyle = item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw Text
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(14, Math.min(22, 360 / displayItems.length))}px sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;

      const maxTextLen = radius - 60;
      let text = item.label;
      if (ctx.measureText(text).width > maxTextLen) {
        while (text.length > 3 && ctx.measureText(text + '…').width > maxTextLen) {
          text = text.slice(0, -1);
        }
        text += '…';
      }
      ctx.fillText(text, radius - 30, 6);
      ctx.restore();

      startAngle = endAngle;
    });

    // Outer Chrome Rim with Lights
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#22223b';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 6, 0, 2 * Math.PI);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffe600';
    ctx.stroke();

    ctx.restore();
  };

  useEffect(() => {
    drawWheel(currentAngleRef.current);
  }, [activeItems.length, envelope.revision]);

  // Handle server-authoritative spin animation
  useEffect(() => {
    if (state.spinNonce !== undefined && state.spinNonce !== lastSpinNonceRef.current && state.targetAngle !== undefined && state.targetAngle !== null) {
      lastSpinNonceRef.current = state.spinNonce;
      setShowWinner(false);

      const target = state.targetAngle;
      const animationItems = state.winnerId && !activeItems.some(item => item.id === state.winnerId)
        ? items.filter(item => !(state.removedIds || []).includes(item.id) || item.id === state.winnerId)
        : activeItems;
      const startAngle = currentAngleRef.current;
      const deltaAngle = target - startAngle;
      const durationMs = state.spinDurationMs || 4500;
      const startTime = performance.now();
      let lastTickAngle = startAngle;

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);

        // Ease Out Cubic physics for dramatic game-show spin deceleration
        const easeOut = 1 - Math.pow(1 - progress, 3.5);
        const current = startAngle + deltaAngle * easeOut;
        currentAngleRef.current = current;
        drawWheel(current, animationItems);

        // Tick SFX every ~20 degrees
        if (Math.abs(current - lastTickAngle) >= (Math.PI / 10)) {
          lastTickAngle = current;
          playTickSound();
          setIsPointerTicking(true);
          setTimeout(() => setIsPointerTicking(false), 40);
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          currentAngleRef.current = target % (2 * Math.PI);
          setShowWinner(true);
          playFanfareSound();
          launchConfetti(containerRef.current, 120);
        }
      };

      requestAnimationFrame(animate);
    }
  }, [state.spinNonce, state.targetAngle]);

  return (
    <div ref={containerRef} className="activity-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">☸ LIVE SPIN · {activeItems.length} ENTRIES</div>
          <h1 className="activity-title">{rawConfig.title || envelope.name || 'Spin the Wheel'}</h1>
          <div className="activity-subtitle">The host is choosing the next winner</div>
        </div>

        <div className="wheel-container">
          <div className={`wheel-pointer ${isPointerTicking ? 'ticking' : ''}`} />
          <canvas ref={canvasRef} className="wheel-canvas" />
          <div className="wheel-center-hub">🎯</div>
        </div>

        {showWinner && state.winnerLabel && (
          <div className="wheel-winner-overlay" onClick={() => setShowWinner(false)}>
            <div className="wheel-winner-title">🎉 WINNER 🎉</div>
            <div className="wheel-winner-name">{state.winnerLabel}</div>
            <div style={{ color: '#9ca3af', fontSize: '1rem', marginTop: '0.5rem' }}>
              Tap anywhere to dismiss
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
