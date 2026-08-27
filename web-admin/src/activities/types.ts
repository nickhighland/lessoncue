export interface ActivityAsset {
  id: string;
  mediaId: string;
  role: string;
  position: number;
  metadata?: Record<string, unknown>;
  media?: {
    id: string;
    fileName: string;
    contentType: string;
    playbackUrl: string;
    thumbnailUrl?: string | null;
  };
}

export interface ActivityDefinition {
  id: string;
  name: string;
  type: string;
  engineType?: string;
  presetType?: string;
  schemaVersion?: number;
  description: string;
  config: Record<string, unknown>;
  theme?: ActivityTheme;
  settings?: Record<string, unknown>;
  modifiers?: Record<string, unknown>;
  presentation?: Record<string, unknown>;
  thumbnailMediaId?: string | null;
  thumbnailUrl?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  libraryPosition?: number;
  version: number;
  assets?: ActivityAsset[];
  assetCount?: number;
  usage?: ActivityDefinitionUsage;
}

export interface ActivityDefinitionUsage {
  lessonCount: number;
  templateCount: number;
  runCount: number;
  activeRunCount: number;
  lessonNames: string[];
  templateNames: string[];
  isInUse: boolean;
}

export interface ActivityDefinitionPage {
  items: ActivityDefinition[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface ActivityTheme {
  preset?: 'neon' | 'stage' | 'retro' | 'arcade' | 'cyberpunk' | 'clean';
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  soundPack?: 'gameshow' | 'arcade' | 'minimal' | 'muted';
  backgroundMotion?: boolean;
}

export interface ActivityStateEnvelope<TState = Record<string, unknown>, TConfig = Record<string, unknown>> {
  runId: string;
  definitionId: string;
  type: string;
  revision: number;
  status: 'prepared' | 'live' | 'paused' | 'ended' | 'completed' | 'cancelled';
  state: TState;
  serverTime: string;
  name: string;
  theme?: ActivityTheme | null;
  config?: TConfig | null;
}

export interface ActivityCommandEnvelope {
  commandId?: string;
  expectedRevision?: number | null;
  action: string;
  payload?: Record<string, unknown>;
}

export interface ActivityCommandResult<TState = Record<string, unknown>> {
  success: boolean;
  revision: number;
  status: 'prepared' | 'live' | 'paused' | 'ended' | 'completed' | 'cancelled';
  state: TState;
  error?: string | null;
}

export interface ActivityRunCreateInput {
  activityDefinitionId: string;
  lessonId?: string | null;
  lessonItemId?: string | null;
  scope?: string | null;
}

export interface ActivityTypeDescriptor {
  type: string;
  name: string;
  description: string;
  icon: string;
  category: 'games' | 'utility' | 'audience' | 'lesson' | 'creative' | 'polls' | 'team' | 'media' | 'physical' | 'discussion';
  badge?: string;
  engineType?: string;
  presetType?: string;
  supportedModes?: string[];
  inputTypes?: string[];
  requiresPhones?: boolean;
  supportsTeams?: boolean;
  createDefaultConfig: () => Record<string, unknown>;
}

export type ActivityPhase =
  | 'setup' | 'lobby' | 'intro' | 'instructions' | 'roundIntro' | 'prompt'
  | 'acceptingResponses' | 'responsesLocked' | 'reveal' | 'voting' | 'judging'
  | 'scoring' | 'leaderboard' | 'roundComplete' | 'finalResults' | 'complete';

export interface ActivitySessionPublicView {
  state: ActivityStateEnvelope;
  joinCode: string;
  joinCodeExpiresAt?: string | null;
  participantCount: number;
  participants: Array<{ id: string; displayName: string; avatar?: string; color?: string; teamId?: string | null }>;
  teams: Array<{ id: string; name: string; color: string; icon: string; score: number }>;
}

export interface ActivityParticipantView {
  state: ActivityStateEnvelope;
  participantId: string;
  displayName: string;
  avatar?: string;
  color?: string;
  teamId?: string | null;
  status?: string;
  hasSubmitted: boolean;
  canRespond: boolean;
}

export interface ActivityHostView {
  state: ActivityStateEnvelope;
  joinCode?: string | null;
  /** Absolute, teacher-selected address players can open. */
  joinUrl?: string | null;
  joinCodeExpiresAt?: string | null;
  participants: Array<{ id: string; displayName: string; avatar?: string; color?: string; status: string; teamId?: string | null; lives: number; joinedAt: string; lastSeenAt: string }>;
  teams: Array<{ id: string; name: string; color: string; icon: string; score: number; active: boolean }>;
  submissions: Array<{ id: string; participantId: string; participantName?: string | null; roundId: string; kind: string; payload: Record<string, unknown>; moderationStatus: string; hidden: boolean; submittedAt: string; updatedAt: string }>;
  votes: Array<{ id: string; voterParticipantId: string; voterName?: string | null; roundId: string; targetId: string; payload: Record<string, unknown>; createdAt: string }>;
  scoreEvents: Array<{ id: string; participantId?: string | null; teamId?: string | null; roundId?: string | null; amount: number; reason: string; createdAt: string; isUndone: boolean; undoneAt?: string | null }>;
}
