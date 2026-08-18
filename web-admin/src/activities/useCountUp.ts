import { useEffect, useRef, useState } from 'react';

/** Count toward a value so a score lands rather than blinking into place. */
export function useCountUp(target: number, durationMs = 900): number {
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
