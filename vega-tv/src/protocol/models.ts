/**
 * The wire shapes LessonCue's server speaks to a display.
 *
 * Ported from the Android client's Models.kt rather than invented: the server
 * is the same, so a Vega display that disagreed with a Fire TV about what a cue
 * is would be a bug in this file, not a difference of opinion.
 */

export interface DeviceIdentity {
  screenId: string;
  token: string;
  serverUrl: string;
}

export interface CuePoint {
  name: string;
  positionMs: number;
}

export interface CueItem {
  id: string;
  title: string;
  type: string;
  url?: string;
  playbackUrl?: string;
  linkKind?: string;
  contentType?: string;
  fileExtension?: string;
  sha256?: string;
  sizeBytes?: number;
  durationMs?: number;
  startMs: number;
  endMs?: number;
  endBehavior: string;
  volumePercent: number;
  notes: string;
  flexibleTime: boolean;
  imageDurationSeconds?: number;
  estimatedDurationSeconds?: number;
  fadeInMs: number;
  fadeOutMs: number;
  fitMode: string;
  rotationDegrees: number;
  cropLeftPercent: number;
  cropTopPercent: number;
  cropRightPercent: number;
  cropBottomPercent: number;
  muted: boolean;
  playbackRatePercent: number;
  repeatCount: number;
  backgroundColor: string;
  transitionStyle: string;
  transitionDurationMs: number;
  offlineEligible: boolean;
  renderSupport: string;
  fallbackMessage?: string;
  cuePoints: CuePoint[];
  activityDefinitionId?: string;
}

export interface CountdownCue {
  itemId: string;
  durationMs: number;
  startAt?: string;
  item: CueItem;
}

export interface PreRollCue {
  items: CueItem[];
}

export interface LessonPlaylist {
  id: string;
  title: string;
  designatedStartAt?: string;
  preRollStartsAt?: string;
  countdown?: CountdownCue;
  preRoll?: PreRollCue;
  postLesson?: PreRollCue;
  items: CueItem[];
}

export interface DisplayCapability {
  id: string;
  label: string;
  supported: boolean;
  fallback: string;
  notes?: string;
}

export interface DisplayCapabilityContract {
  platform: string;
  displayName: string;
  contractVersion: number;
  minimumClientVersion: string;
  capabilities: DisplayCapability[];
  limitations: string[];
}

export interface DisplayCompatibilityWarning {
  code: string;
  title: string;
  message: string;
  fallback: string;
}

export interface ScreenManifest {
  version: number;
  screenName: string;
  signage: SignageCue[];
  playlists: LessonPlaylist[];
  signageSchedule: SignageCue[];
  displayCapabilities?: DisplayCapabilityContract;
  compatibilityWarnings: DisplayCompatibilityWarning[];
  signageOnly: boolean;
}

export interface SignageCue {
  id: string;
  name: string;
  mode: string;
  priority: number;
  message: string;
  publishedVersion?: number;
  widgetCacheError?: string;
  backgroundColor?: string;
  zones: SignageZone[];
}

export interface SignageZone {
  id: string;
  type: string;
  title?: string;
  content?: string;
  hidden: boolean;
  zIndex: number;
  textColor?: string;
  textAlign?: string;
}

export interface ControlCommand {
  changed: boolean;
  version: number;
  action: string;
  lessonId?: string;
  itemId?: string;
  positionMs?: number;
  screenshotRequestId?: string;
  screenshotExpiresAt?: string;
}

export interface PlaybackTelemetry {
  state: string;
  lessonId?: string;
  itemId?: string;
  positionMs?: number;
  durationMs?: number;
  volumePercent?: number;
  error?: string;
}

/** Every cue in a lesson, in the order a room sees them. */
export function timelineOf(playlist: LessonPlaylist): CueItem[] {
  return [
    ...(playlist.preRoll?.items ?? []),
    ...(playlist.countdown ? [playlist.countdown.item] : []),
    ...playlist.items,
    ...(playlist.postLesson?.items ?? []),
  ];
}

export function allItems(manifest: ScreenManifest): CueItem[] {
  return manifest.playlists.flatMap(timelineOf);
}

/**
 * The name a downloaded cue is cached under.
 *
 * The extension is checked rather than trusted: it arrives from the server and
 * ends up as a path, and "bin" is a perfectly good extension for anything that
 * does not look like one.
 */
export function cacheFileName(item: CueItem): string {
  const extension = item.fileExtension && /^[a-zA-Z0-9]{1,8}$/.test(item.fileExtension)
    ? item.fileExtension
    : "bin";
  return `${item.id}.${extension}`;
}
