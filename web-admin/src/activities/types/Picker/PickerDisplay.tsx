import React, { useEffect, useRef, useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { playTickSound, playFanfareSound, playDrumrollSound, launchConfetti } from '../../effects';

interface PickerState {
  currentPick?: string | null;
  isPicking?: boolean;
  pickCount?: number;
  pickNonce?: number;
}

function itemLabel(item: unknown): string {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  const value = item as { text?: unknown; label?: unknown };
  return String(value.text ?? value.label ?? '');
}

export const PickerDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const state: PickerState = (envelope.state as PickerState) || {};
  const config = (envelope as unknown as { config?: { items?: unknown[]; title?: string } }).config || {};
  const items = (config.items || []).map(itemLabel).filter(Boolean);

  const [displayText, setDisplayText] = useState<string>(state.currentPick || 'READY TO ROLL');
  const [isCycling, setIsCycling] = useState(false);
  const [isWinner, setIsWinner] = useState(false);
  const lastPickNonceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.pickNonce !== undefined && state.pickNonce !== lastPickNonceRef.current && state.currentPick) {
      lastPickNonceRef.current = state.pickNonce;
      setIsWinner(false);
      setIsCycling(true);

      const targetPick = state.currentPick;
      const durationMs = 3800;
      const startTime = performance.now();
      let lastTickTime = 0;
      let tickInterval = 40;

      const stopDrumroll = playDrumrollSound(durationMs);
      const pool = items.length > 0 ? items : ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);

        // Increase interval smoothly for dramatic slot-machine slowdown
        tickInterval = 40 + Math.pow(progress, 3.2) * 400;

        if (now - lastTickTime >= tickInterval) {
          lastTickTime = now;
          const randomName = pool[Math.floor(Math.random() * pool.length)];
          setDisplayText(randomName);
          playTickSound(800 - progress * 350);
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          stopDrumroll();
          setDisplayText(targetPick);
          setIsCycling(false);
          setIsWinner(true);
          playFanfareSound();
          launchConfetti(containerRef.current, 140);
        }
      };

      requestAnimationFrame(animate);
    } else if (state.currentPick && !isCycling) {
      setDisplayText(state.currentPick);
      setIsWinner(true);
    }
  }, [state.pickNonce, state.currentPick]);

  return (
    <div ref={containerRef} className="activity-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">🎲 RANDOM SELECTION · {items.length} CONTENDERS</div>
          <h1 className="activity-title">{config.title || envelope.name || 'Random Picker'}</h1>
          <div className="activity-subtitle">
            {items.length > 0 ? `${items.length} contenders in pool` : ''}
          </div>
        </div>

        <div className="picker-display" style={{ maxWidth: '800px', width: '100%' }}>
          <div
            className={`picker-box ${isWinner ? 'picker-winner' : ''}`}
            style={{
              padding: '2.5rem 3rem',
              background: isWinner
                ? 'linear-gradient(135deg, #183d37 0%, #0d2623 100%)'
                : 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
              border: isWinner ? '4px solid var(--act-gold)' : '3px solid #374151',
              borderRadius: '24px',
              boxShadow: isWinner ? '0 0 40px rgba(216, 140, 30, 0.6), 0 20px 40px rgba(0,0,0,0.6)' : '0 10px 30px rgba(0,0,0,0.4)',
              textAlign: 'center',
              transform: isWinner ? 'scale(1.05)' : 'scale(1)',
              transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            {isWinner && (
              <div style={{ color: 'var(--act-gold)', fontSize: '1.2rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.75rem', animation: 'fadeIn 0.3s' }}>
                🎉 SELECTED WINNER 🎉
              </div>
            )}
            <div
              className={`picker-text ${isCycling ? 'cycling' : ''}`}
              style={{
                fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
                fontWeight: 900,
                color: isWinner ? '#ffffff' : isCycling ? '#f59e0b' : '#9ca3af',
                textShadow: isWinner ? '0 0 25px var(--act-gold)' : 'none',
                letterSpacing: '-0.02em',
                wordBreak: 'break-word'
              }}
            >
              {displayText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
