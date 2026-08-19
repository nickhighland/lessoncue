import { useEffect, useRef, useState } from 'react';
import {
  GAME_SFX,
  type GameAudioPreloadResult,
  type GameSfxCue,
  preloadGameAudio,
  primeGameAudio,
} from './gameAudio';

export interface AudioPreloadStatus {
  /** Preload finished. Cues are playable either sampled or synthesized. */
  ready: boolean;
  /** Cues backed by a decoded sample from the game's asset folder. */
  sampled: GameSfxCue[];
  /** Cues falling back to the bundled synthesized effect. */
  synthesized: GameSfxCue[];
  /** Folders searched, most specific first. */
  chain: string[];
}

const cueCount = Object.keys(GAME_SFX).length;

/**
 * Warm every documented audio cue for one game as soon as the player reaches
 * the lobby, so the first tap of the first round plays instantly.
 *
 * The hook never blocks play. A game whose asset folder is empty — the default
 * for a stock LessonCue install — resolves with every cue listed under
 * `synthesized` and the original Web Audio cues take over.
 */
export function useAudioPreloader(chain: string[] | undefined, enabled = true): AudioPreloadStatus {
  const [status, setStatus] = useState<AudioPreloadStatus>(() => ({
    ready: false,
    sampled: [],
    synthesized: [],
    chain: chain || [],
  }));
  // Preloading is idempotent per cascade; this keeps re-renders — and the new
  // array identity they produce — from re-running it.
  const requested = useRef<string | null>(null);
  const key = chain?.join('>') || '';

  useEffect(() => {
    if (!enabled || !key) return;
    if (requested.current === key) return;
    requested.current = key;
    const folders = key.split('>');

    let active = true;
    const apply = (result: GameAudioPreloadResult) => {
      if (!active) return;
      setStatus({ ready: true, sampled: result.sampled, synthesized: result.synthesized, chain: folders });
    };

    setStatus({ ready: false, sampled: [], synthesized: [], chain: folders });
    void preloadGameAudio(folders).then(apply, () => {
      // A rejected preload still leaves every cue playable via fallback.
      apply({ sampled: [], synthesized: Object.keys(GAME_SFX) as GameSfxCue[] });
    });

    return () => { active = false; };
  }, [enabled, key]);

  // Browsers hold the audio context suspended until a real gesture. Listening
  // once here means the join tap — or any first touch — unlocks playback.
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => primeGameAudio();
    const options = { once: true, passive: true } as const;
    window.addEventListener('pointerdown', unlock, options);
    window.addEventListener('keydown', unlock, options);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled]);

  return status;
}

export { cueCount as GAME_SFX_CUE_COUNT };
