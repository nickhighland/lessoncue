import React, { useEffect, useState, useRef } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { playCountdownTickSound, playBuzzerSound, playHornSound, launchConfetti } from '../../effects';

interface CountdownState {
  remainingMs?: number;
  isRunning?: boolean;
  targetAt?: string | null;
  durationSeconds?: number;
}

export const CountdownDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const state: CountdownState = (envelope.state as CountdownState) || {};
  const config = (envelope as unknown as { config?: { durationSeconds?: number } }).config || {};
  const totalSeconds = state.durationSeconds || config.durationSeconds || 60;
  const totalMs = totalSeconds * 1000;

  const [currentRemainingMs, setCurrentRemainingMs] = useState(state.remainingMs ?? totalMs);
  const lastSecondRef = useRef<number | null>(null);
  const hasFinishedRef = useRef(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (state.isRunning && state.targetAt) {
      const targetTime = new Date(state.targetAt).getTime();
      hasFinishedRef.current = false;

      interval = setInterval(() => {
        const now = Date.now();
        const diff = Math.max(0, targetTime - now);
        setCurrentRemainingMs(diff);

        const currentSec = Math.ceil(diff / 1000);
        if (currentSec !== lastSecondRef.current && diff > 0) {
          lastSecondRef.current = currentSec;
          if (currentSec <= 10) {
            playCountdownTickSound(currentSec <= 5);
          }
        }

        if (diff === 0 && !hasFinishedRef.current) {
          hasFinishedRef.current = true;
          if (interval) clearInterval(interval);
          playHornSound();
          playBuzzerSound();
          launchConfetti(containerRef.current, 150);
        }
      }, 50);
    } else {
      setCurrentRemainingMs(state.remainingMs ?? totalMs);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.isRunning, state.targetAt, state.remainingMs, totalMs]);

  const totalSecsLeft = Math.ceil(currentRemainingMs / 1000);
  const minutes = Math.floor(totalSecsLeft / 60);
  const seconds = totalSecsLeft % 60;
  const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const progress = Math.max(0, Math.min(1, currentRemainingMs / totalMs));
  const strokeDashoffset = 2 * Math.PI * 180 * (1 - progress);

  const isWarning = totalSecsLeft <= 10 && totalSecsLeft > 5;
  const isCritical = totalSecsLeft <= 5 && totalSecsLeft > 0;
  const isFinished = totalSecsLeft === 0;

  return (
    <div ref={containerRef} className="activity-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">⏱️ CLOCK IS RUNNING</div>
          <h1 className="activity-title">{envelope.name || 'Time Remaining'}</h1>
          <div className="activity-subtitle">Keep the room moving</div>
        </div>

        <div className="countdown-stage">
          <div className="countdown-ring-container">
            <svg className="countdown-svg" viewBox="0 0 400 400">
              <circle className="countdown-circle-bg" cx="200" cy="200" r="180" />
              <circle
                className={`countdown-circle-progress ${isCritical ? 'critical' : isWarning ? 'warning' : ''}`}
                cx="200"
                cy="200"
                r="180"
                strokeDasharray={2 * Math.PI * 180}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>

            <div className="countdown-digits">
              <div
                className="countdown-time-text"
                style={{
                  color: isFinished ? '#ef4444' : isCritical ? '#ff007f' : isWarning ? '#ffe600' : '#ffffff',
                  animation: isCritical ? 'popBounce 0.5s infinite alternate' : 'none'
                }}
              >
                {formatted}
              </div>
              {isFinished && (
                <div className="countdown-time-up">
                  TIME'S UP!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
