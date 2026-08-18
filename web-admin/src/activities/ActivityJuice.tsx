import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { type GameSfxCue, playGameSfx } from './audio/gameAudio';
import './activity-juice.css';

/**
 * Tactile presentation primitives shared by the participant phone UI and the
 * TV stage. These are presentation only: the server still owns phase, timing,
 * scoring, and every transition. Nothing here changes what is submitted.
 */

/**
 * Sound-pack folder for the surrounding Activity. Provided once at the root of
 * a surface so individual controls do not have to thread it down.
 */
const GameAudioChainContext = createContext<string[] | undefined>(undefined);

export const GameAudioProvider: React.FC<{ chain: string[]; children: React.ReactNode }> = ({ chain, children }) =>
  <GameAudioChainContext.Provider value={chain}>{children}</GameAudioChainContext.Provider>;

export const useGameAudioChain = (): string[] | undefined => useContext(GameAudioChainContext);

type JuiceState = 'idle' | 'pressed' | 'released';

export interface GameButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Folders to search for this game's sound pack, most specific first. */
  chain?: string[];
  /**
   * Final submissions get the heavy lock-in cue; ordinary taps get the light
   * organic one.
   */
  lockIn?: boolean;
  /** Opt out of the tap cue for controls that already trigger their own sound. */
  silent?: boolean;
}

const canHover = () => typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(hover: hover)').matches;

/**
 * Button with squash-and-stretch feedback and pitch-varied tap audio.
 *
 * It renders a plain `<button>` and preserves any className the caller passes,
 * so existing styling, disabled semantics, and test selectors keep working.
 */
export const GameButton: React.FC<GameButtonProps> = ({
  chain: chainProp,
  lockIn = false,
  silent = false,
  className = '',
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onPointerEnter,
  onClick,
  children,
  ...rest
}) => {
  const contextChain = useGameAudioChain();
  const chain = chainProp ?? contextChain;
  const [juice, setJuice] = useState<JuiceState>('idle');
  const pressed = useRef(false);
  // Touch-generated clicks report an inconsistent `detail`, so track the
  // pointer explicitly to tell a real keyboard activation from a tap.
  const viaPointer = useRef(false);

  const release = useCallback(() => {
    if (!pressed.current) return;
    pressed.current = false;
    setJuice('released');
  }, []);

  useEffect(() => {
    if (juice !== 'released') return;
    // Matches the release animation in activity-juice.css.
    const timer = window.setTimeout(() => setJuice('idle'), 420);
    return () => window.clearTimeout(timer);
  }, [juice]);

  return <button
    {...rest}
    className={`${className} lc-juicy`.trim()}
    data-juice={juice}
    onPointerEnter={event => {
      if (!rest.disabled && !silent && canHover()) playGameSfx('uiButtonHover', { chain, volume: 0.5 });
      onPointerEnter?.(event);
    }}
    onPointerDown={event => {
      if (!rest.disabled) {
        pressed.current = true;
        viaPointer.current = true;
        setJuice('pressed');
        if (!silent) playGameSfx('uiButtonSelect', { chain });
      }
      onPointerDown?.(event);
    }}
    onPointerUp={event => { release(); onPointerUp?.(event); }}
    onPointerLeave={event => { release(); onPointerLeave?.(event); }}
    onPointerCancel={event => { release(); onPointerCancel?.(event); }}
    onClick={event => {
      // Keyboard activation fires no pointer events, so cue the tap here.
      const keyboard = !viaPointer.current;
      viaPointer.current = false;
      if (!rest.disabled && !silent && keyboard) playGameSfx('uiButtonSelect', { chain });
      if (!rest.disabled && lockIn) playGameSfx('uiButtonLockIn', { chain, pitchJitter: false });
      onClick?.(event);
    }}
  >{children}</button>;
};

/**
 * Stable pseudo-random offsets so each wobbling element drifts on its own
 * rhythm. Seeded rather than random so snapshots and browser tests are
 * deterministic.
 */
export function idleWobbleStyle(seed: string | number, index = 0): React.CSSProperties {
  const text = `${seed}:${index}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unit = ((hash >>> 0) % 1000) / 1000;
  return {
    ['--lc-wobble-delay' as string]: `${(unit * -6).toFixed(2)}s`,
    ['--lc-wobble-duration' as string]: `${(5.5 + unit * 3.5).toFixed(2)}s`,
    ['--lc-wobble-drift' as string]: `${(0.7 + unit * 0.6).toFixed(2)}`,
  };
}

export interface GamePanicOptions {
  /** Seconds left on the authoritative server clock. */
  secondsRemaining: number;
  /** Only panic while a response window is genuinely open. */
  active: boolean;
  threshold?: number;
  chain?: string[];
  /** Play the tick/alarm cues. Off for previews and secondary surfaces. */
  sound?: boolean;
}

/**
 * Global "last few seconds" state.
 *
 * Adds `lc-panic` to `document.body` so full-bleed backgrounds can react, and
 * returns the flag for local styling. Ticks once per second and fires the
 * alarm exactly once when the window closes.
 */
export function useGamePanic({
  secondsRemaining,
  active,
  threshold = 5,
  chain,
  sound = true,
}: GamePanicOptions): boolean {
  const panicking = active && secondsRemaining > 0 && secondsRemaining <= threshold;
  const lastTick = useRef<number | null>(null);
  const alarmed = useRef(false);

  useEffect(() => {
    if (!panicking || typeof document === 'undefined') return;
    document.body.classList.add('lc-panic');
    return () => document.body.classList.remove('lc-panic');
  }, [panicking]);

  useEffect(() => {
    if (!sound) return;
    if (panicking && lastTick.current !== secondsRemaining) {
      lastTick.current = secondsRemaining;
      playGameSfx('timerTick', { chain, urgent: true });
    }
    if (!panicking) lastTick.current = null;
  }, [chain, panicking, secondsRemaining, sound]);

  useEffect(() => {
    if (!active) { alarmed.current = false; return; }
    if (secondsRemaining > 0 || alarmed.current) return;
    alarmed.current = true;
    if (sound) playGameSfx('timerAlarm', { chain, pitchJitter: false });
  }, [active, chain, secondsRemaining, sound]);

  return panicking;
}

/** Fire a one-off cue when a condition first becomes true. */
export function useGameCue(cue: GameSfxCue, when: boolean, chain?: string[]): void {
  const fired = useRef(false);
  const key = chain?.join('>');
  useEffect(() => {
    if (!when) { fired.current = false; return; }
    if (fired.current) return;
    fired.current = true;
    playGameSfx(cue, { chain: key ? key.split('>') : undefined });
  }, [cue, key, when]);
}
