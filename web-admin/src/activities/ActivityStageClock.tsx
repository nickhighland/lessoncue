import React from 'react';
import { ActivityCountdown, useActivityCountdown } from './ActivityMotion';

/**
 * The response clock, on the TV.
 *
 * Timers were only ever drawn on the phones, so the room could not see how
 * long was left — the one piece of information everyone in it wants at once.
 * Reads the same server timestamps the phones do; the server still decides
 * when the window actually closes.
 */
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;

export const ActivityStageClock: React.FC<{
  state: Record<string, unknown>;
  label?: string;
}> = ({ state, label = 'TIME LEFT' }) => {
  const durationMs = numberOf(state.timerDurationMs);
  const running = state.timerRunning === true && durationMs > 0;
  const remainingMs = useActivityCountdown({
    durationMs,
    startedAt: state.timerStartedAt,
    pausedAt: state.timerPausedAt,
    running,
  });

  if (!running) return null;
  const paused = typeof state.timerPausedAt === 'string' || typeof state.timerPausedAt === 'number';
  return <ActivityStageClockFrame paused={paused}>
    <ActivityCountdown remainingMs={remainingMs} durationMs={durationMs} label={paused ? 'PAUSED' : label} stage />
  </ActivityStageClockFrame>;
};

const ActivityStageClockFrame: React.FC<{ paused: boolean; children: React.ReactNode }> = ({ paused, children }) =>
  <div className={`activity-stage-clock ${paused ? 'paused' : ''}`}>{children}</div>;
