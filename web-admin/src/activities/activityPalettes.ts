import type { CSSProperties } from 'react';
import type { ActivityTheme } from './types';

/**
 * Per-game colour identity.
 *
 * Every engine gets its own palette so two Activities never look like the same
 * screen with different words on it, and each named preset within an engine is
 * shifted deterministically off its engine's base so siblings stay related but
 * distinguishable. Colours are authored here rather than copied from any
 * commercial game (see docs/activities-assets-and-sound.md).
 *
 * Backgrounds stay deep and text stays near-white so the same palette reads at
 * classroom distance on a projector and in a hand on a phone.
 */

export interface ActivityPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

const palette = (primary: string, secondary: string, accent: string, background: string, text = '#ffffff'): ActivityPalette =>
  ({ primary, secondary, accent, background, text });

/**
 * Base identity per engine type.
 *
 * Hues are planned rather than picked ad hoc: each catalog-visible engine sits
 * far from its neighbours on the colour wheel, its accent sits well away from
 * its own secondary, and the background is a deep tint of the primary so a
 * game is recognisable from across the room before any text is read. Every
 * combination clears WCAG AA for white-on-background and for label text on an
 * accent fill.
 */
export const ACTIVITY_TYPE_PALETTES: Record<string, ActivityPalette> = {
  trivia: palette('#4129a3', '#9e4ee4', '#f6c531', '#0d091d'), // Knowledge — indigo hall, gold answer
  rapidFire: palette('#a33129', '#e48a4e', '#31e3f6', '#1d0b09'), // Knowledge under pressure — red alert, cold accent
  poll: palette('#29a39f', '#4eb7e4', '#9af631', '#091d1c'), // Opinion — teal calm, lime highlight
  prediction: palette('#296ea3', '#4e71e4', '#f6b531', '#09141d'), // Forecasting — sky and amber
  buzzer: palette('#a32956', '#e44e53', '#f6cf31', '#1d0910'), // Game-show floor — crimson and stage gold
  surveyBoard: palette('#2949a3', '#584ee4', '#f6bb31', '#090e1d'), // Survey board — royal blue and brass
  punchline: palette('#a3299f', '#e44ead', '#f6e931', '#1d091c'), // Comedy club — magenta and lamp yellow
  fakeOut: palette('#6a29a3', '#d04ee4', '#31f687', '#14091d'), // Deception — violet with an emerald tell
  drawing: palette('#a35229', '#e4b24e', '#f6319a', '#1d1009'), // Studio — burnt orange and hot pink
  ordering: palette('#29a37a', '#4ee4e4', '#f65f31', '#091d16'), // Structure — jade with coral markers
  word: palette('#56a329', '#53e44e', '#31cff6', '#101d09'), // Word field — leaf green and cyan
  matchPlayer: palette('#a32949', '#e4584e', '#314cf6', '#1d090e'), // Pairing — rose and periwinkle
  imageReveal: palette('#2993a3', '#4e9ee4', '#cf31f6', '#091a1d'), // Media — cyan and violet, image is the hero
  stageChallenge: palette('#a36229', '#e4c64e', '#31c2f6', '#1d1209'), // Spotlight — ember and gold, cyan call to action
  physicalRoom: palette('#29a341', '#4ee49e', '#dcf631', '#091d0d'), // Movement — bright grass and citrus
  bracket: palette('#295aa3', '#4e58e4', '#f68731', '#09111d'), // Tournament — steel and orange seeding
  wheel: palette('#a3297e', '#e44e85', '#31f6dc', '#1d0917'), // Carnival — hot pink and turquoise
  utility: palette('#5a29a3', '#bc4ee4', '#f6c831', '#11091d'), // Toolkit — retro purple and gold
  picker: palette('#8729a3', '#e44ed5', '#f6e931', '#18091d'),
  prizeGrid: palette('#a38329', '#dae44e', '#31d6f6', '#1d1809'),
  scoreboard: palette('#29a387', '#4ed5e4', '#f6bb31', '#091d18'),
  countdown: palette('#a32939', '#e46c4e', '#f6e331', '#1d090c'),
  imageShuffle: palette('#297ea3', '#4e85e4', '#f631f6', '#09171d'),
  wordScramble: palette('#292da3', '#7b4ee4', '#f6d631', '#090a1d'),
  ranking: palette('#29a362', '#4ee4c6', '#f67a31', '#091d12'),
  rankIt: palette('#29a362', '#4ee4c6', '#f67a31', '#091d12'),
  responses: palette('#7a29a3', '#e44ee4', '#f6d631', '#16091d'),
  emojiPrompt: palette('#a32972', '#e44e76', '#f6f631', '#1d0915'),
};

export const DEFAULT_ACTIVITY_PALETTE = palette('#2a6e4a', '#2563eb', '#f59e0b', '#091c1d');

/* ------------------------------------------------------------------ colour */

const hexOf = (value: string) => /^#([0-9a-f]{6})$/i.exec(value.trim())?.[1];

function toHsl(hex: string): [number, number, number] | null {
  const match = hexOf(hex);
  if (!match) return null;
  const number = Number.parseInt(match, 16);
  const red = (number >> 16) / 255;
  const green = ((number >> 8) & 255) / 255;
  const blue = (number & 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (!delta) return [0, 0, lightness];
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue = max === red ? ((green - blue) / delta + (green < blue ? 6 : 0))
    : max === green ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  return [hue * 60, saturation, lightness];
}

function toHex(hue: number, saturation: number, lightness: number): string {
  const normalizedHue = ((hue % 360) + 360) % 360 / 360;
  const clampedSaturation = Math.min(1, Math.max(0, saturation));
  const clampedLightness = Math.min(1, Math.max(0, lightness));
  if (!clampedSaturation) {
    const value = Math.round(clampedLightness * 255).toString(16).padStart(2, '0');
    return `#${value}${value}${value}`;
  }
  const q = clampedLightness < 0.5
    ? clampedLightness * (1 + clampedSaturation)
    : clampedLightness + clampedSaturation - clampedLightness * clampedSaturation;
  const p = 2 * clampedLightness - q;
  const channel = (offset: number) => {
    let t = normalizedHue + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    const value = t < 1 / 6 ? p + (q - p) * 6 * t
      : t < 1 / 2 ? q
        : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6
          : p;
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(1 / 3)}${channel(0)}${channel(-1 / 3)}`;
}

const rotate = (hex: string, degrees: number, saturationShift = 0, lightnessShift = 0): string => {
  const hsl = toHsl(hex);
  if (!hsl) return hex;
  return toHex(hsl[0] + degrees, hsl[1] + saturationShift, hsl[2] + lightnessShift);
};

/** Stable 0–1 value from a preset id, so a preset always looks the same. */
function seed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 2048) / 2048;
}

/**
 * Palette for one Activity. The engine sets the family; the named preset
 * shifts it far enough to be recognisably its own screen without leaving that
 * family or darkening the background into unreadability.
 */
export function paletteForActivity(type?: string | null, preset?: unknown): ActivityPalette {
  const base = (type && ACTIVITY_TYPE_PALETTES[type]) || DEFAULT_ACTIVITY_PALETTE;
  if (typeof preset !== 'string' || !preset.trim()) return base;

  const unit = seed(preset);
  const hueShift = (unit - 0.5) * 44;
  const saturationShift = (unit - 0.5) * 0.12;
  return {
    primary: rotate(base.primary, hueShift, saturationShift),
    secondary: rotate(base.secondary, hueShift * 1.2, saturationShift),
    accent: rotate(base.accent, hueShift * 0.55),
    // Backgrounds move least: contrast against text must not drift.
    background: rotate(base.background, hueShift * 0.8),
    text: base.text,
  };
}

/* ------------------------------------------------------------- theme bridge */

export type ActivityThemePreset = NonNullable<ActivityTheme['preset']>;

/**
 * The six hand-authored shared themes. These remain the teacher-selectable
 * options in the editor; the per-game palettes above are what an Activity uses
 * when the teacher has not picked one explicitly.
 */
export const ACTIVITY_THEME_PRESETS: Record<ActivityThemePreset, ActivityTheme> = {
  stage: { preset: 'stage', primaryColor: '#2a6e4a', secondaryColor: '#2563eb', accentColor: '#f59e0b', backgroundColor: '#091c1d', textColor: '#ffffff', soundPack: 'gameshow', backgroundMotion: true },
  neon: { preset: 'neon', primaryColor: '#7c3aed', secondaryColor: '#ec4899', accentColor: '#22d3ee', backgroundColor: '#100724', textColor: '#ffffff', soundPack: 'arcade', backgroundMotion: true },
  retro: { preset: 'retro', primaryColor: '#c2410c', secondaryColor: '#eab308', accentColor: '#14b8a6', backgroundColor: '#21130d', textColor: '#fff7ed', soundPack: 'gameshow', backgroundMotion: true },
  arcade: { preset: 'arcade', primaryColor: '#0f766e', secondaryColor: '#22c55e', accentColor: '#f97316', backgroundColor: '#041c1a', textColor: '#f0fdf4', soundPack: 'arcade', backgroundMotion: true },
  cyberpunk: { preset: 'cyberpunk', primaryColor: '#0e7490', secondaryColor: '#a855f7', accentColor: '#f43f5e', backgroundColor: '#080c1f', textColor: '#f8fafc', soundPack: 'arcade', backgroundMotion: true },
  clean: { preset: 'clean', primaryColor: '#2563eb', secondaryColor: '#0f766e', accentColor: '#f59e0b', backgroundColor: '#0f172a', textColor: '#f8fafc', soundPack: 'minimal', backgroundMotion: false }
};

/**
 * True when a stored theme is an untouched shared preset (or has no colours).
 *
 * Existing definitions were all seeded from one of six shared presets, so most
 * of the library shares four looks. Those may be upgraded to the game's own
 * palette. Anything a teacher actually customised is left exactly as saved.
 */
export function isUnmodifiedSharedTheme(theme?: ActivityTheme | null): boolean {
  if (!theme) return true;
  if (!theme.primaryColor && !theme.secondaryColor && !theme.accentColor && !theme.backgroundColor) return true;
  return Object.values(ACTIVITY_THEME_PRESETS).some(shared =>
    shared.primaryColor === theme.primaryColor &&
    shared.secondaryColor === theme.secondaryColor &&
    shared.accentColor === theme.accentColor &&
    shared.backgroundColor === theme.backgroundColor);
}

export function themeFromPalette(source: ActivityPalette, theme?: ActivityTheme | null): ActivityTheme {
  return {
    ...theme,
    primaryColor: source.primary,
    secondaryColor: source.secondary,
    accentColor: source.accent,
    backgroundColor: source.background,
    textColor: source.text,
  };
}

/**
 * Resolve the theme actually used for rendering: the teacher's saved theme
 * when they customised it, otherwise this game's own palette.
 */
export function resolveActivityTheme(
  type?: string | null,
  preset?: unknown,
  theme?: ActivityTheme | null,
): ActivityTheme {
  if (!isUnmodifiedSharedTheme(theme)) return theme as ActivityTheme;
  return themeFromPalette(paletteForActivity(type, preset), theme);
}

function colorWithAlpha(value: string, alpha: number) {
  const match = hexOf(value);
  if (!match) return value;
  const number = Number.parseInt(match, 16);
  return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}

/** CSS custom properties shared by the TV stage and the participant phone. */
export function activityThemeVariables(theme?: ActivityTheme | null): CSSProperties {
  const primary = theme?.primaryColor || DEFAULT_ACTIVITY_PALETTE.primary;
  const secondary = theme?.secondaryColor || DEFAULT_ACTIVITY_PALETTE.secondary;
  const accent = theme?.accentColor || DEFAULT_ACTIVITY_PALETTE.accent;
  const background = theme?.backgroundColor || DEFAULT_ACTIVITY_PALETTE.background;
  const text = theme?.textColor || '#ffffff';
  return {
    '--act-gold': accent,
    '--act-gold-start': accent,
    '--act-gold-end': primary,
    '--act-green': primary,
    '--act-green-bright': secondary,
    '--act-stage-bg': background,
    '--act-stage-primary': primary,
    '--act-stage-secondary': secondary,
    '--act-stage-accent': accent,
    '--act-stage-primary-soft': colorWithAlpha(primary, 0.26),
    '--act-stage-secondary-soft': colorWithAlpha(secondary, 0.22),
    '--act-stage-accent-soft': colorWithAlpha(accent, 0.18),
    '--act-stage-text': text,
    // Participant surfaces derive their washes from the same three colours.
    '--act-stage-primary-wash': colorWithAlpha(primary, 0.55),
    '--act-stage-secondary-wash': colorWithAlpha(secondary, 0.3),
    '--act-stage-accent-contrast': readableInkOn(accent),
  } as CSSProperties;
}

/** Pick black or white ink for text sitting directly on an accent fill. */
export function readableInkOn(background: string): string {
  const match = hexOf(background);
  if (!match) return '#10231c';
  const number = Number.parseInt(match, 16);
  const channel = (value: number) => {
    const linear = value / 255;
    return linear <= 0.03928 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(number >> 16) + 0.7152 * channel((number >> 8) & 255) + 0.0722 * channel(number & 255);
  return luminance > 0.179 ? '#141017' : '#ffffff';
}
