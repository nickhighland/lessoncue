/**
 * Player avatars and colours offered on the join screen.
 *
 * Mirrors `ActivityIdentity` on the server, which is authoritative: anything
 * not on its list is replaced at join time, so drift here degrades to the
 * default rather than storing arbitrary text the whole room would see.
 */
export const ACTIVITY_AVATARS = [
  '😀', '😎', '🤩', '🤡', '🦄', '🐶',
  '🐱', '🦊', '🐸', '🐧', '🐙', '🐝',
  '🚀', '🍕', '🎸', '🎯',
] as const;

export const ACTIVITY_COLORS = [
  '#f6c531', '#ff6b6b', '#4ecdc4', '#8f7bff', '#ff9f43',
  '#2dd4bf', '#f472b6', '#60a5fa', '#a3e635', '#fb7185',
] as const;

export const DEFAULT_ACTIVITY_AVATAR = ACTIVITY_AVATARS[0];
export const DEFAULT_ACTIVITY_COLOR = ACTIVITY_COLORS[0];

/** Ink that stays readable on a player's chosen colour. */
export function inkOnPlayerColor(color: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return '#141017';
  const value = Number.parseInt(match[1], 16);
  const channel = (part: number) => {
    const linear = part / 255;
    return linear <= 0.03928 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(value >> 16) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255);
  return luminance > 0.179 ? '#141017' : '#ffffff';
}
