import React from 'react';
import { ActivityCountdown, useActivityCountdown, useDeadlineCountdown } from './ActivityMotion';

/**
 * The response clock, on the TV.
 *
 * Timers were only ever drawn on the phones, so the room could not see how
 * long was left — the one piece of information everyone in it wants at once.
 * Reads the same server timestamps the phones do; the server still decides
 * when the window actually closes.
 *
 * Two clocks can drive this. A few engines run their own explicit timer, which
 * a host starts and can pause. Everything else is timed by autonomy, which
 * publishes a deadline instead — and that clock was invisible to the room, so
 * the thirty and sixty second answer windows ran with nothing on screen
 * counting them down.
 */
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;

/** Phases where a deadline is a countdown the room should see, not a scene change. */
const TIMED_PHASES = ['acceptingResponses', 'voting', 'prompt'];

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

  const autoRemainingMs = useDeadlineCountdown(state.autoAdvanceAt);
  const autoDurationMs = numberOf(state.autoAdvanceMs);
  const phase = typeof state.phase === 'string' ? state.phase : '';
  const autoRunning = !running && autoRemainingMs !== null && TIMED_PHASES.includes(phase);

  if (!running && !autoRunning) return null;

  if (autoRunning) {
    return <ActivityStageClockFrame paused={false}>
      <ActivityCountdown remainingMs={autoRemainingMs} durationMs={autoDurationMs} label={label} stage />
    </ActivityStageClockFrame>;
  }

  const paused = typeof state.timerPausedAt === 'string' || typeof state.timerPausedAt === 'number';
  return <ActivityStageClockFrame paused={paused}>
    <ActivityCountdown remainingMs={remainingMs} durationMs={durationMs} label={paused ? 'PAUSED' : label} stage />
  </ActivityStageClockFrame>;
};

const ActivityStageClockFrame: React.FC<{ paused: boolean; children: React.ReactNode }> = ({ paused, children }) =>
  <div className={`activity-stage-clock ${paused ? 'paused' : ''}`}>{children}</div>;
