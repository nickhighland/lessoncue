import React, { useEffect, useRef, useState } from 'react';
import { playGameSfx } from './audio/gameAudio';
import { inkOnPlayerColor } from './activityIdentity';

/**
 * What the player sees at reveal.
 *
 * The phone used to go passive here ("look up at the main display") at exactly
 * the moment the round resolves. The server sends each player only their own
 * standing, so this can say how they did without leaking anyone else's score.
 */

export interface PersonalResult {
  score: number;
  rank: number;
  playerCount: number;
  roundPoints: number;
  outcome: 'correct' | 'incorrect' | 'missed' | 'scored';
  answered: boolean;
  graded: boolean;
}

export function readPersonalResult(value: unknown): PersonalResult | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const outcome = raw.outcome;
  if (outcome !== 'correct' && outcome !== 'incorrect' && outcome !== 'missed' && outcome !== 'scored') return null;
  const number = (candidate: unknown) => typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
  return {
    score: number(raw.score),
    rank: number(raw.rank) || 1,
    playerCount: number(raw.playerCount) || 1,
    roundPoints: number(raw.roundPoints),
    outcome,
    answered: raw.answered === true,
    graded: raw.graded === true,
  };
}

/** Count toward a value so a score lands rather than blinking into place. */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    const from = previous.current;
    previous.current = target;
    if (from === target) { setValue(target); return; }

    const reduce = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setValue(target); return; }

    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      // Ease out so the last digits settle rather than snapping.
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, target]);

  return value;
}

const COPY: Record<PersonalResult['outcome'], { mark: string; title: string; detail: string }> = {
  correct: { mark: '✓', title: 'Correct!', detail: 'Nicely done.' },
  incorrect: { mark: '✗', title: 'Not this time', detail: 'Look up for the answer.' },
  missed: { mark: '–', title: 'No answer in', detail: 'Your answer did not arrive before the window closed.' },
  scored: { mark: '★', title: 'Round complete', detail: 'Look up at the main display.' },
};

export const ActivityPlayerResult: React.FC<{
  result: PersonalResult;
  color?: string;
  chain?: string[];
}> = ({ result, color = '#f6c531', chain }) => {
  const copy = COPY[result.outcome];
  const points = useCountUp(result.roundPoints);
  const total = useCountUp(result.score);
  const cued = useRef(false);

  useEffect(() => {
    if (cued.current) return;
    cued.current = true;
    if (result.outcome === 'correct') playGameSfx('confettiPop', { chain });
  }, [chain, result.outcome]);

  return <section className={`participant-result participant-result-${result.outcome}`} aria-live="polite">
    <span className="participant-result-mark" style={{ background: color, color: inkOnPlayerColor(color) }} aria-hidden="true">{copy.mark}</span>
    <h2>{copy.title}</h2>
    {result.roundPoints !== 0 && <div className="participant-result-points">
      {result.roundPoints > 0 ? '+' : ''}{points.toLocaleString()}
      <small>this round</small>
    </div>}
    <p>{copy.detail}</p>
    <dl className="participant-result-standing">
      <div>
        <dt>Rank</dt>
        <dd>{result.rank}<span> of {result.playerCount}</span></dd>
      </div>
      <div>
        <dt>Score</dt>
        <dd>{total.toLocaleString()}</dd>
      </div>
    </dl>
  </section>;
};
