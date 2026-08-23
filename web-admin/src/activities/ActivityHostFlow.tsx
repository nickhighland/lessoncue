import React, { useEffect, useState } from 'react';

/**
 * What the host is being asked to do, in plain language.
 *
 * The controller used to show a flat set of engine actions whose available set
 * changed with the phase, with nothing saying what phase the game was in or
 * what a button would cause. A host had to already know each engine's
 * lifecycle. Now there is one primary action per phase, labelled with its
 * consequence.
 */

export interface HostStep {
  /** Host action to send, or null when the game is driving itself. */
  action: string | null;
  label: string;
  detail: string;
  /** Moderation is the one thing a timer must never do for the host. */
  needsHost: boolean;
}

export function hostStepFor(phase: string, moderationCount: number, autoPaused: boolean): HostStep {
  if (moderationCount > 0) {
    return {
      action: null,
      label: `${moderationCount} waiting for you`,
      detail: 'Approve or hide each response below. The game continues once the queue is clear.',
      needsHost: true,
    };
  }

  switch (phase) {
    case 'setup':
    case 'lobby':
      return {
        action: 'start',
        label: 'Start the game',
        detail: 'Press this once everyone has joined. The game runs itself from here.',
        needsHost: true,
      };
    case 'finalResults':
    case 'complete':
      return {
        action: null,
        label: 'Game finished',
        detail: 'Final standings are on screen. Move the lesson on when you are ready.',
        needsHost: false,
      };
    default:
      return autoPaused
        ? {
            action: 'resume',
            label: 'Resume',
            detail: 'The game is held. Resume to hand it back to the clock.',
            needsHost: true,
          }
        : {
            action: null,
            label: 'Running',
            detail: 'The game is moving on its own. Hold it if you need the room back.',
            needsHost: false,
          };
  }
}

/** Seconds until the game makes its own next move, or null when it is not on a clock. */
export function useAutoAdvanceCountdown(autoAdvanceAt: unknown, paused: boolean): number | null {
  const target = typeof autoAdvanceAt === 'string' ? Date.parse(autoAdvanceAt) : Number.NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!Number.isFinite(target) || paused) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [paused, target]);

  if (!Number.isFinite(target) || paused) return null;
  return Math.max(0, Math.ceil((target - now) / 1000));
}
