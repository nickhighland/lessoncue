/**
 * Sampled game-audio layer for Activities.
 *
 * Bundled cues stay synthesized in `effects.ts` (see
 * docs/activities-assets-and-sound.md — LessonCue ships no third-party audio).
 * This module adds the optional sampled layer on top: when a deployment drops
 * licensed files into `/assets/games/{gameId}/audio/...` they are used; when a
 * file is absent the matching original Web Audio cue plays instead. Nothing
 * here depends on a file existing, so the default build sounds correct with an
 * empty assets folder.
 *
 * Lookup cascades preset → engine → shared, so a sound pack authored once for
 * an engine covers every named game built on it, and a single preset can still
 * override one cue by adding its own folder.
 */
import {
  getSharedAudioContext,
  getSharedAudioDestination,
  isAudioMuted,
  playChimeSound,
  playCountdownTickSound,
  playHornSound,
  playPopSound,
  playThudSound,
  playTickSound,
} from '../effects';

/** Short effects decoded into memory so a tap has no request latency. */
export const GAME_SFX = {
  uiButtonHover: 'sfx/ui-btn-hover.mp3',
  uiButtonSelect: 'sfx/ui-btn-select.mp3',
  uiButtonLockIn: 'sfx/ui-btn-lock-in.mp3',
  timerTick: 'sfx/game-timer-tick.mp3',
  timerAlarm: 'sfx/game-timer-alarm.mp3',
  confettiPop: 'sfx/fx-confetti-pop.mp3',
} as const;

/** Longer beds and stings streamed through an element rather than decoded. */
export const GAME_THEMES = {
  /** Looping lobby bed while players are joining. */
  lobby: 'themes/intro-theme.mp3',
  /** One-shot sting the moment the game leaves the lobby. */
  gameIntro: 'themes/game-intro.mp3',
  /** One-shot sting between rounds. */
  roundTransition: 'themes/round-transition.mp3',
  /** One-shot sting when the game finishes. */
  gameOutro: 'themes/game-outro.mp3',
} as const;

export type GameSfxCue = keyof typeof GAME_SFX;
export type GameThemeCue = keyof typeof GAME_THEMES;

/** Only the lobby bed repeats; every other theme cue is a single sting. */
const LOOPING_THEMES: ReadonlySet<GameThemeCue> = new Set<GameThemeCue>(['lobby']);

/**
 * Original synthesized stand-in for each sampled effect. These are what
 * actually play in a stock LessonCue install.
 */
const SFX_FALLBACK: Record<GameSfxCue, (urgent: boolean) => void> = {
  uiButtonHover: () => playTickSound(1200),
  uiButtonSelect: () => playPopSound(true),
  uiButtonLockIn: () => playThudSound(),
  timerTick: urgent => playCountdownTickSound(urgent),
  timerAlarm: () => playHornSound(),
  confettiPop: () => playChimeSound(),
};

export const SHARED_GAME_AUDIO_ID = 'shared';

/** Folder names come from registry ids, so keep them to a safe path segment. */
const safeSegment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

export function gameAudioUrl(gameId: string, relativePath: string): string {
  return `/assets/games/${safeSegment(gameId) || SHARED_GAME_AUDIO_ID}/audio/${relativePath}`;
}

/**
 * Folders to search for one Activity, most specific first: the named preset,
 * then the engine that runs it, then the shared pack.
 */
export function resolveGameAudioChain(
  input?: { type?: string; config?: Record<string, unknown> | null } | null,
): string[] {
  const chain: string[] = [];
  const preset = input?.config?.preset;
  if (typeof preset === 'string' && safeSegment(preset)) chain.push(safeSegment(preset));
  if (typeof input?.type === 'string' && safeSegment(input.type) && !chain.includes(safeSegment(input.type))) {
    chain.push(safeSegment(input.type));
  }
  chain.push(SHARED_GAME_AUDIO_ID);
  return chain;
}

const chainKey = (chain: string[]) => chain.join('>');

/** `undefined` = not attempted, `null` = confirmed absent, buffer = decoded. */
const decoded = new Map<string, AudioBuffer | null>();
const inFlight = new Map<string, Promise<AudioBuffer | null>>();
/** `chainKey:cue` → the folder that actually supplied the file, or null. */
const resolvedSfx = new Map<string, string | null>();
const resolvedTheme = new Map<string, string | null>();
const themeProbes = new Map<string, Promise<boolean>>();
const themeElements = new Map<string, HTMLAudioElement>();
let activeTheme: HTMLAudioElement | null = null;

/**
 * Resume the shared context. Browsers keep audio suspended until a real user
 * gesture, so participants call this from the join tap.
 */
export function primeGameAudio(): void {
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
}

async function loadSfxBuffer(url: string): Promise<AudioBuffer | null> {
  if (decoded.has(url)) return decoded.get(url) ?? null;
  const pending = inFlight.get(url);
  if (pending) return pending;

  const request = (async () => {
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return null;
      const response = await fetch(url, { cache: 'force-cache' });
      // A missing pack is the normal case, not an error worth logging.
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength) return null;
      return await ctx.decodeAudioData(bytes);
    } catch {
      return null;
    }
  })().then(buffer => {
    decoded.set(url, buffer);
    inFlight.delete(url);
    return buffer;
  });

  inFlight.set(url, request);
  return request;
}

/** Walk the cascade and remember which folder supplied this effect. */
async function resolveSfx(chain: string[], cue: GameSfxCue): Promise<AudioBuffer | null> {
  const key = `${chainKey(chain)}:${cue}`;
  if (resolvedSfx.has(key)) {
    const owner = resolvedSfx.get(key);
    return owner ? decoded.get(gameAudioUrl(owner, GAME_SFX[cue])) ?? null : null;
  }
  for (const gameId of chain) {
    const buffer = await loadSfxBuffer(gameAudioUrl(gameId, GAME_SFX[cue]));
    if (buffer) {
      resolvedSfx.set(key, gameId);
      return buffer;
    }
  }
  resolvedSfx.set(key, null);
  return null;
}

async function themeExists(url: string): Promise<boolean> {
  const probe = themeProbes.get(url);
  if (probe) return probe;
  const request = fetch(url, { method: 'GET', cache: 'force-cache' })
    .then(response => response.ok)
    .catch(() => false);
  themeProbes.set(url, request);
  return request;
}

async function resolveTheme(chain: string[], cue: GameThemeCue): Promise<string | null> {
  const key = `${chainKey(chain)}:${cue}`;
  if (resolvedTheme.has(key)) return resolvedTheme.get(key) ?? null;
  for (const gameId of chain) {
    const url = gameAudioUrl(gameId, GAME_THEMES[cue]);
    if (await themeExists(url)) {
      resolvedTheme.set(key, url);
      return url;
    }
  }
  resolvedTheme.set(key, null);
  return null;
}

function themeElement(url: string): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  const existing = themeElements.get(url);
  if (existing) return existing;
  const element = new Audio();
  element.preload = 'auto';
  element.src = url;
  element.addEventListener('error', () => {}, { once: true });
  element.load();
  themeElements.set(url, element);
  return element;
}

export interface PlaySfxOptions {
  /** Folders to search, most specific first. */
  chain?: string[];
  /**
   * Randomize playback rate so repeated taps do not sound machine-gunned.
   * Defaults to on for every cue except the timer tick, where a steady pulse
   * is the point.
   */
  pitchJitter?: boolean;
  /** Passed to the synthesized fallback for cues that have an urgent variant. */
  urgent?: boolean;
  volume?: number;
}

/** Pitch range required by the game-feel spec. */
const PITCH_MIN = 0.85;
const PITCH_MAX = 1.15;

export function randomPlaybackRate(random: () => number = Math.random): number {
  return PITCH_MIN + random() * (PITCH_MAX - PITCH_MIN);
}

/**
 * Play an effect. Returns synchronously; sampled playback uses an already
 * decoded buffer, and anything not resolved yet uses the synthesized cue so
 * the first tap of a session is never silent.
 */
export function playGameSfx(cue: GameSfxCue, options: PlaySfxOptions = {}): void {
  if (isAudioMuted()) return;
  const {
    chain = [SHARED_GAME_AUDIO_ID],
    pitchJitter = cue !== 'timerTick',
    urgent = false,
    volume = 1,
  } = options;

  const key = `${chainKey(chain)}:${cue}`;
  const owner = resolvedSfx.get(key);
  const buffer = owner ? decoded.get(gameAudioUrl(owner, GAME_SFX[cue])) : undefined;

  if (!buffer) {
    SFX_FALLBACK[cue](urgent);
    // Warm the cascade for next time without blocking this tap.
    if (!resolvedSfx.has(key)) void resolveSfx(chain, cue);
    return;
  }

  try {
    const ctx = getSharedAudioContext();
    const destination = getSharedAudioDestination();
    if (!ctx || !destination) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (pitchJitter) source.playbackRate.value = randomPlaybackRate();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.min(1, Math.max(0, volume)), ctx.currentTime);
    source.connect(gain);
    gain.connect(destination);
    source.start();
  } catch {
    SFX_FALLBACK[cue](urgent);
  }
}

export interface PlayThemeOptions {
  chain?: string[];
  /** Defaults to looping for the lobby bed and one-shot for every sting. */
  loop?: boolean;
  volume?: number;
}

/**
 * Start a bed or sting. Silently does nothing when no folder in the cascade
 * supplies the file, which is the default for a stock install.
 */
export function playGameTheme(cue: GameThemeCue, options: PlayThemeOptions = {}): void {
  if (isAudioMuted()) return;
  const { chain = [SHARED_GAME_AUDIO_ID], loop = LOOPING_THEMES.has(cue), volume = 0.4 } = options;
  void resolveTheme(chain, cue).then(url => {
    if (!url || isAudioMuted()) return;
    const element = themeElement(url);
    if (!element) return;
    stopGameTheme();
    element.loop = loop;
    element.volume = Math.min(1, Math.max(0, volume));
    element.currentTime = 0;
    activeTheme = element;
    void element.play().catch(() => {
      // Autoplay refused before a gesture. Non-fatal.
      if (activeTheme === element) activeTheme = null;
    });
  });
}

export function stopGameTheme(): void {
  if (!activeTheme) return;
  try {
    activeTheme.pause();
    activeTheme.currentTime = 0;
  } catch { /* element already torn down */ }
  activeTheme = null;
}

export interface GameAudioPreloadResult {
  /** Effects whose sampled file resolved somewhere in the cascade. */
  sampled: GameSfxCue[];
  /** Effects that will use the synthesized fallback. */
  synthesized: GameSfxCue[];
}

/**
 * Eagerly warm every documented cue for one cascade. Safe to call repeatedly —
 * results are cached for the life of the page.
 */
export async function preloadGameAudio(chain: string[]): Promise<GameAudioPreloadResult> {
  const cues = Object.keys(GAME_SFX) as GameSfxCue[];
  const buffers = await Promise.all(cues.map(cue => resolveSfx(chain, cue)));
  await Promise.all((Object.keys(GAME_THEMES) as GameThemeCue[]).map(async cue => {
    const url = await resolveTheme(chain, cue);
    if (url) themeElement(url);
  }));
  return {
    sampled: cues.filter((_, index) => buffers[index] !== null),
    synthesized: cues.filter((_, index) => buffers[index] === null),
  };
}

/** Test seam: forget every cached probe/decode/element between cases. */
export function resetGameAudioCache(): void {
  decoded.clear();
  inFlight.clear();
  resolvedSfx.clear();
  resolvedTheme.clear();
  themeProbes.clear();
  themeElements.clear();
  activeTheme = null;
}
