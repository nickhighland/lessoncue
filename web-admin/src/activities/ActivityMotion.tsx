import React, { useEffect, useState } from 'react';

export interface ActivityTimerInput {
  durationMs?: number;
  startedAt?: unknown;
  pausedAt?: unknown;
  running?: boolean;
}

const timestampMs = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
};

/**
 * Calculate remaining time from server timestamps. The server remains the
 * authority; the local interval only makes the visual clock feel continuous.
 */
export const useActivityCountdown = ({ durationMs = 0, startedAt, pausedAt, running = true }: ActivityTimerInput): number => {
  const [now, setNow] = useState(() => Date.now());
  const startedMs = timestampMs(startedAt);
  const pausedMs = timestampMs(pausedAt);

  useEffect(() => {
    if (!durationMs || !Number.isFinite(startedMs) || !running || Number.isFinite(pausedMs)) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [durationMs, pausedMs, running, startedMs]);

  if (!durationMs || !Number.isFinite(startedMs)) return 0;
  const endMs = Number.isFinite(pausedMs) ? pausedMs : now;
  return Math.max(0, durationMs - (endMs - startedMs));
};

/** Seconds at or below which the clock enters the shared panic treatment. */
export const ACTIVITY_PANIC_SECONDS = 5;

export const ActivityCountdown: React.FC<{
  remainingMs: number;
  durationMs?: number;
  label?: string;
  urgentAtSeconds?: number;
  compact?: boolean;
  /** TV sizing: readable from across a room rather than at arm's length. */
  stage?: boolean;
}> = ({ remainingMs, durationMs = 0, label = 'TIME LEFT', urgentAtSeconds = 5, compact = false, stage = false }) => {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const progress = durationMs > 0 ? Math.min(100, Math.max(0, remainingMs / durationMs * 100)) : 0;
  const urgent = seconds <= urgentAtSeconds;
  // `urgent` is caller-tunable; panic is the fixed last-five-seconds state the
  // shared presentation layer keys its colour and pulse off.
  const panic = seconds > 0 && seconds <= ACTIVITY_PANIC_SECONDS;
  return <section
    className={`activity-motion-countdown ${urgent ? 'urgent' : ''} ${panic ? 'panic' : ''} ${compact ? 'compact' : ''} ${stage ? 'stage' : ''}`}
    data-panic={panic ? 'true' : 'false'}
    aria-live="polite"
  >
    <span>{urgent && seconds > 0 ? 'HURRY' : label}</span>
    <strong>{minutes}:{String(seconds % 60).padStart(2, '0')}</strong>
    {durationMs > 0 && <div className="activity-motion-countdown-track" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>}
  </section>;
};

export const ActivityRevealCurtain: React.FC<{
  visible: boolean;
  kicker?: string;
  title?: string;
  /** Renderer-only pacing. Host actions remain immediately available. */
  pacing?: string;
  children: React.ReactNode;
}> = ({ visible, kicker = 'REVEAL', title, pacing = 'dramatic', children }) => {
  if (!visible) return null;
  const safePacing = pacing === 'quick' || pacing === 'epic' ? pacing : 'dramatic';
  return <section className={`activity-motion-reveal pacing-${safePacing}`} data-reveal-pacing={safePacing} aria-live="polite">
    <span>{kicker}</span>
    {title && <h2>{title}</h2>}
    <div>{children}</div>
  </section>;
};

export const ActivityScoreBurst: React.FC<{
  visible: boolean;
  amount: number;
  label?: string;
}> = ({ visible, amount, label = 'POINTS' }) => {
  if (!visible) return null;
  return <div className={`activity-motion-score-burst ${amount < 0 ? 'negative' : ''}`} aria-live="polite">
    <span>{label}</span>
    <strong>{amount > 0 ? '+' : ''}{amount}</strong>
  </div>;
};

export const ActivityWinnerBanner: React.FC<{
  visible: boolean;
  winner: string;
  subtitle?: string;
  score?: number;
}> = ({ visible, winner, subtitle = 'WINNER', score }) => {
  if (!visible) return null;
  return <section className="activity-motion-winner" aria-live="polite">
    <span>{subtitle}</span>
    <strong>{winner}</strong>
    {typeof score === 'number' && <small>{score.toLocaleString()} points</small>}
  </section>;
};
