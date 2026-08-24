

export type Permission =
  | "planning.manage"
  | "uploads.manage"
  | "playback.control"
  | "screens.manage"
  | "users.manage"
  | "app-settings.manage"
  | "settings.manage"
  | "backups.manage"
  | "updates.manage";
export type Session = {
  setupRequired: boolean;
  authenticated: boolean;
  username?: string;
  displayName?: string;
  role?: string;
  permissions?: Permission[];
  mustChangePassword?: boolean;
  registrationMode?: "closed" | "approval" | "open" | "code";
  registrationAvailable?: boolean;
  emailConfigured?: boolean;
};
export type Bootstrap = {
  serverId: string;
  serverName: string;
  organization: string;
  timeZone: string;
  pairingPin?: string;
  pairingExpiresAt?: string;
  pairingFixed: boolean;
  controllerPinConfigured: boolean;
  settings: Organization;
  storage: StorageStatus;
  mediaTaxonomy: MediaTaxonomy;
  update: UpdateStatus;
  backupPolicy?: BackupPolicyStatus;
  localAddress: LocalAddressStatus;
  httpPort: HttpPortStatus;
  cloudflareTunnel: CloudflareTunnelStatus;
  hardwareAcceleration: HardwareAccelerationStatus;
  uploadQuotaPolicy?: UploadQuotaPolicy;
  mediaFormats: MediaFormats;
  mediaConverters: MediaConverterStatus;
  accountEmail: { configured: boolean; provider: string };
  counts: { classes: number; lessons: number; media: number; screens: number };
  /** Service Admin switch: hides Activities from teacher-facing surfaces. */
  activitiesEnabled: boolean;
  permissionDefinitions: Permission[];
  permissionPresets: Record<string, Permission[]>;
};
export type MediaTaxonomy = { folders: string[]; tags: string[] };
export type MediaFormat = {
  extension: string;
  family: "video" | "audio" | "image" | "document";
  contentType: string;
  converter: string;
  label: string;
};
export type MediaFormats = {
  accept: string;
  extensions: string[];
  formats: MediaFormat[];
};
export type MediaConverterStatus = {
  ffmpeg: boolean;
  ffprobe: boolean;
  libreOffice: boolean;
  poppler: boolean;
  webpEncoder: boolean;
  theoraEncoder: boolean;
  missing: string[];
  checkedAt: string;
};
export type Organization = {
  id: string;
  name: string;
  siteName: string;
  timeZone: string;
  weekStartsOn: string;
  defaultLessonDurationMinutes: number;
  defaultRetentionDays: number;
  primaryColor: string;
  accentColor: string;
  navigationTextColor: string;
  selectedTabColor: string;
  welcomeMessage: string;
  storageLimitBytes: number;
  adaptiveTranscodingEnabled: boolean;
  transcodeLeadDays: number;
  hardwareAccelerationEnabled: boolean;
  requireLocalRoomControllers: boolean;
  registrationMode: "closed" | "approval" | "open" | "code";
  publicBaseUrl: string;
  emailFromAddress: string;
  emailFromName: string;
  emailProvider: "none" | "resend" | "brevo";
  signageSourceAllowlistJson: string;
  signageEnabled: boolean;
};
export type StorageStatus = {
  usedBytes: number;
  diskAvailableBytes: number;
  maximumAllocationBytes: number;
  allocationBytes: number;
  remainingBytes: number;
  reservedBytes: number;
  automaticAllocation: boolean;
};
export type UploadQuotaPolicy = {
  maxFileBytes: number;
  maxDailyBytes: number;
  maxActiveSessionsPerUser: number;
  userDailyBytes: Record<string, number>;
  roleDailyBytes: Record<string, number>;
  classDailyBytes: Record<string, number>;
  allowedVideoCodecs: string[];
  allowedAudioCodecs: string[];
};
export type UploadSessionStatus = {
  id: string;
  fileName: string;
  expectedLength: number;
  chunkSize: number;
  chunkCount: number;
  receivedBytes: number;
  state:
    | "active"
    | "paused"
    | "failed"
    | "completing"
    | "complete"
    | "cancelled"
    | "expired";
  failureReason?: string;
  expiresAt: string;
  missingChunks: number[];
};
export type MediaUploadControl = {
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
};
export type MediaPreflight = {
  fileName: string;
  extension: string;
  family: "video" | "audio" | "image" | "document" | string;
  label: string;
  contentType: string;
  converter: string;
  converterReady: boolean;
  supported: boolean;
  sizeBytes: number;
  sizeAllowed: boolean;
  codec?: string;
  expectedOutput: string;
  queuePosition: number;
  activeUploads: number;
  warnings: string[];
  ready: boolean;
};
export type SupportBundle = {
  schemaVersion: number;
  generatedAt: string;
  server: {
    serverId: string;
    serverName: string;
    version: string;
    timeZone: string;
  };
  storage: {
    usedBytes: number;
    allocationBytes: number;
    remainingBytes: number;
    reservedBytes: number;
    diskAvailableBytes: number;
  };
  converters: {
    ffmpeg: boolean;
    ffprobe: boolean;
    libreOffice: boolean;
    poppler: boolean;
    webpEncoder: boolean;
    theoraEncoder: boolean;
    missing: string[];
    checkedAt: string;
  };
  queue: {
    activeUploads: number;
    reservedBytes: number;
    states: Record<string, number>;
  };
  media: {
    count: number;
    bytes: number;
    processing: Record<string, number>;
    compatibility: Record<string, number>;
    conversion: Record<string, number>;
  };
  screens: {
    count: number;
    online: number;
    failedDownloads: number;
    playbackErrors: number;
    commandsAwaitingReceipt: number;
    networkQuality: Record<string, number>;
  };
  backup: BackupPolicyStatus;
  update: UpdateStatus;
};
export type UpdateStatus = {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  lastCheckedAt?: string;
  releaseUrl?: string;
  releaseNotes?: string;
  error?: string;
  automaticInstallSupported: boolean;
  installing: boolean;
  lastInstallSucceeded?: boolean;
  lastInstallAt?: string;
  lastInstallVersion?: string;
  lastInstallMessage?: string;
  rollbackSnapshotAvailable: boolean;
  rollbackTargetVersion?: string;
};
export type LocalAddressStatus = {
  hostname: string;
  address: string;
  supported: boolean;
  pending: boolean;
  appliedAt?: string;
  error?: string;
};
export type HttpPortStatus = {
  port: number;
  address: string;
  configurable: boolean;
  supported: boolean;
  pending: boolean;
  appliedAt?: string;
  error?: string;
};
export type CloudflareTunnelStatus = {
  enabled: boolean;
  publicHostname?: string;
  publicUrl?: string;
  originUrl: string;
  supported: boolean;
  pending: boolean;
  credentialConfigured: boolean;
  serviceInstalled: boolean;
  connected: boolean;
  activeConnections: number;
  cloudflaredVersion?: string;
  cloudflaredCheckedAt?: string;
  cloudflaredUpdateError?: string;
  appliedAt?: string;
  error?: string;
};
export type HardwareAccelerationStatus = {
  supported: boolean;
  available: boolean;
  engine: string;
  message: string;
  device?: string;
  lastCheckedAt?: string;
  lastHardwareUseAt?: string;
  lastFallbackAt?: string;
  lastError?: string;
};
export type LessonClass = {
  id: string;
  name: string;
  description: string;
  controllerSlug: string;
  controllerColor: string;
  controllerHostname?: string;
  lessonCount: number;
  screenCount: number;
};
export type TemporaryControllerSession = {
  token: string;
  classId: string;
  lessonId?: string;
  expiresAt?: string;
  createdAt?: string;
  path: string;
  permanent?: boolean;
};
export type RecycleItem = {
  kind: "class" | "lesson" | "media";
  id: string;
  title: string;
  detail: string;
  deletedAt: string;
  deletedBy?: string;
};
export type MediaTranscode = {
  id: string;
  profile: "h264-720" | "h264-480";
  status: "pending" | "converting" | "ready" | "failed";
  sizeBytes: number;
  width?: number;
  height?: number;
  videoBitrateKbps: number;
  sourceVersion: number;
  error?: string;
  transcodeEngine?: string;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
};
export type Media = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationMs?: number;
  downloadUrl: string;
  playbackUrl?: string;
  thumbnailUrl?: string;
  filmstripUrl?: string;
  waveformUrl?: string;
  processingStatus: string;
  processingError?: string;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  compatibilityStatus: string;
  compatibilityError?: string;
  compatibilityTranscodedAt?: string;
  compatibilitySizeBytes?: number;
  compatibilityTranscodeEngine?: string;
  transcodes: MediaTranscode[];
  sourceKind: string;
  sourceUrl?: string;
  linkKind?: string;
  offlineEligible: boolean;
  storagePolicy: "lesson" | "persistent";
  originLessonId?: string;
  deleteAfter?: string;
  retentionDateIsManual: boolean;
  folder: string;
  tagsCsv: string;
  version: number;
  replacedAt?: string;
  conversionStatus: string;
  conversionError?: string;
  convertedSlidesJson: string;
  convertedAt?: string;
};
export type MediaVersion = {
  id: string;
  versionNumber: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationMs?: number;
  sha256?: string;
  archivedAt: string;
  archivedBy: string;
  downloadUrl: string;
};
export type MediaImpact = {
  id: string;
  fileName: string;
  folder: string;
  tagsCsv: string;
  version: number;
  replacedAt?: string;
  lessons: { id: string; title: string; date: string; itemCount: number }[];
  templates: { id: string; name: string; itemCount: number }[];
  signage: { id: string; name: string; mode: string; enabled: boolean }[];
  versions: MediaVersion[];
};
export type CuePoint = { name: string; positionMs: number };
export type PlaylistItem = {
  id: string;
  title: string;
  type: string;
  role: "lesson" | "preRoll" | "countdown" | "postLesson";
  position: number;
  mediaAssetId?: string;
  mediaFileName?: string;
  durationMs?: number;
  mediaDurationMs?: number;
  volumePercent: number;
  endBehavior: string;
  allowSkip: boolean;
  startMs: number;
  endMs?: number;
  notes: string;
  fadeInMs: number;
  fadeOutMs: number;
  normalizeAudio: boolean;
  cuePointsJson: string;
  fitMode: "fit" | "fill" | "letterbox";
  rotationDegrees: number;
  cropLeftPercent: number;
  cropTopPercent: number;
  cropRightPercent: number;
  cropBottomPercent: number;
  muted: boolean;
  playbackRatePercent: number;
  repeatCount: number;
  imageDurationSeconds?: number;
  estimatedDurationSeconds?: number;
  backgroundColor: string;
  transitionStyle: "cut" | "fade-black";
  transitionDurationMs: number;
  flexibleTime: boolean;
  activityDefinitionId?: string;
};
export type Lesson = {
  id: string;
  classId: string;
  className: string;
  date: string;
  title: string;
  designatedStartAt?: string;
  preRollStartsAt?: string;
  preRollEnabled: boolean;
  countdownItemId?: string;
  version: number;
  archived: boolean;
  keepOffline: boolean;
  downloadDaysBefore: number;
  volumePercent: number;
  muted: boolean;
  substituteNotes: string;
  preRollMonitorUrl?: string;
  generatedByScheduleId?: string;
  items: PlaylistItem[];
};
export type LessonTemplate = {
  id: string;
  name: string;
  description: string;
  defaultTitle: string;
  defaultStartMinutes?: number;
  substituteNotes: string;
  preRollLeadMinutes?: number;
  availableLeadMinutes?: number;
  expiresAfterMinutes?: number;
  preRollEnabled: boolean;
  keepOffline: boolean;
  downloadDaysBefore: number;
  volumePercent: number;
  muted: boolean;
  scheduleCount: number;
  createdAt: string;
  updatedAt: string;
  items: PlaylistItem[];
};
export type RecurringSchedule = {
  id: string;
  templateId: string;
  templateName: string;
  classId: string;
  className: string;
  name: string;
  frequency: "weekly" | "monthly" | "custom";
  interval: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
  startMinutes?: number;
  titlePattern: string;
  customDatesJson: string;
  excludedDatesJson: string;
  enabled: boolean;
  generateDaysAhead: number;
  lastGeneratedAt?: string;
  generatedCount: number;
};
export type Screen = {
  id: string;
  name: string;
  platform: string;
  assignedClassId?: string;
  assignedClassName?: string;
  volunteerMode: boolean;
  lastSeenAt?: string;
  online: boolean;
  freeBytes: number;
  failedDownloads: number;
  revoked: boolean;
  appVersion: string;
  manifestVersion: number;
  tagsCsv: string;
  site: string;
  lastIpAddress?: string;
  controlVersion: number;
  controlAction: string;
  controlLessonId?: string;
  controlItemId?: string;
  controlPositionMs?: number;
  controlIssuedAt?: string;
  acknowledgedControlVersion: number;
  playbackState: string;
  playbackLessonId?: string;
  playbackItemId?: string;
  playbackPositionMs: number;
  playbackDurationMs?: number;
  playbackVolumePercent: number;
  playbackUpdatedAt?: string;
  playbackError?: string;
  cachedItems: number;
  totalItems: number;
  deviceModel?: string;
  osVersion?: string;
  cacheInventoryJson: string;
  downloadQueueJson: string;
  codecCapabilitiesJson: string;
  recentErrorsJson: string;
  clockOffsetMs?: number;
  networkLatencyMs?: number;
  networkQuality: string;
  diagnosticsUpdatedAt?: string;
  allowDiagnosticScreenshots: boolean;
  screenshotRequestId?: string;
  screenshotRequestedAt?: string;
  screenshotExpiresAt?: string;
  signageOnly?: boolean;
  permanentPairing?: boolean;
  assignedSignageId?: string;
  assignedSignageName?: string;
  screenshotStatus: string;
  screenshotCapturedAt?: string;
  screenshotAvailable: boolean;
  signageOrientation: "auto" | "landscape" | "portrait";
  signageWidth?: number;
  signageHeight?: number;
};
export type DisplayCompatibilityIssue = {
  code: string;
  severity: string;
  contentKind: string;
  contentId: string;
  title: string;
  message: string;
  fallback: string;
};
export type DisplayCapabilityContract = {
  platform: string;
  displayName: string;
  contractVersion: number;
  minimumClientVersion: string;
  capabilities: {
    id: string;
    label: string;
    supported: boolean;
    fallback: string;
    notes?: string;
  }[];
  limitations: string[];
};
export type CacheDiagnostic = {
  itemId?: string;
  title?: string;
  state?: string;
  sizeBytes?: number;
  expectedBytes?: number;
  error?: string;
};
export type DownloadDiagnostic = {
  itemId?: string;
  title?: string;
  state?: string;
  bytesDownloaded?: number;
  expectedBytes?: number;
  error?: string;
};
export type CodecDiagnostic = {
  kind?: string;
  codec?: string;
  supported?: boolean;
  detail?: string;
};
export type ErrorDiagnostic = {
  timestamp?: string;
  area?: string;
  message?: string;
  itemId?: string;
};
export type User = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  emailVerified: boolean;
  role: string;
  disabled: boolean;
  pendingApproval: boolean;
  pendingSetup: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt?: string;
  permissions: Permission[];
  customPermissions?: Permission[] | null;
};
export type AccountProfile = {
  username: string;
  displayName: string;
  email?: string;
  emailVerified: boolean;
  role: string;
};
export type MfaStatus = {
  enabled: boolean;
  configured: boolean;
  totpEnabledAt?: string;
};
export type MfaSetup = {
  secret: string;
  provisioningUri: string;
};
export type RegistrationSettings = {
  mode: "closed" | "approval" | "open" | "code";
  publicBaseUrl: string;
  emailFromAddress: string;
  emailFromName: string;
  emailProvider: "none" | "resend" | "brevo";
  emailConfigured: boolean;
};
export type RegistrationCode = {
  id: string;
  hint: string;
  label: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  uses: number;
  maxUses?: number;
  active: boolean;
};
export type Signage = {
  id: string;
  name: string;
  mode: "scheduled" | "idle" | "emergency" | "sign";
  enabled: boolean;
  priority: number;
  startsAt?: string;
  endsAt?: string;
  message: string;
  backgroundColor: string;
  textColor: string;
  mediaAssetId?: string;
  mediaFileName?: string;
  targetTagsCsv: string;
  recurrence: "once" | "daily" | "weekly";
  scheduleStartDate?: string;
  scheduleEndDate?: string;
  startMinutes?: number;
  endMinutes?: number;
  daysOfWeek: number[];
  excludedDates: string[];
  targetScreenIds: string[];
  targetScreenNames: string[];
  activeNow: boolean;
  nextChangeAt?: string;
  readiness: "ready" | "preparing" | "failed" | "missing";
  ready: boolean;
  createdAt: string;
  updatedAt: string;
  targetScreenCount: number;
  cachedScreenCount: number;
  failedScreenCount: number;
  layoutPreset: SignageLayoutPreset;
  zones: SignageZone[];
  widgetCache: SignageWidgetCache[];
  widgetCacheUpdatedAt?: string;
  widgetCacheError?: string;
  layoutId?: string;
  contentPlaylistId?: string;
  volumePercent: number;
  displayPower: "unchanged" | "on" | "off";
  version: number;
  publishedVersion: number;
  publishState: "draft" | "changes" | "published";
  publishedAt?: string;
  lastPushedAt?: string;
  kioskEnabled: boolean;
  kioskInteractionUrl?: string;
  kioskTimeoutSeconds: number;
  kioskShowCloseButton: boolean;
  kioskShowTouchIndicator: boolean;
  kioskVirtualKeyboard: boolean;
};
export type SignageLayoutPreset =
  | "single"
  | "sidebar"
  | "split"
  | "header-grid"
  | "dashboard";
export type SignageZoneType =
  | "media"
  | "stream"
  | "text"
  | "clock"
  | "calendar"
  | "weather"
  | "menu"
  | "rss"
  | "data"
  | "shape"
  | "icon"
  | "qr"
  | "ticker"
  | "counter"
  | "webpage"
  | "dashboard"
  | "social"
  | "traffic"
  | "wifi"
  | "customHtml"
  | "slides";
export type SignageZone = {
  id: string;
  type: SignageZoneType;
  title?: string;
  content?: string;
  mediaAssetId?: string;
  mediaFileName?: string;
  sourceUrl?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  refreshMinutes: number;
  rotation: number;
  zIndex: number;
  opacity: number;
  fit: "cover" | "contain" | "fill";
  locked: boolean;
  hidden: boolean;
  flipX: boolean;
  flipY: boolean;
  groupId?: string;
  lockMode?: "none" | "position" | "content" | "full";
  richTextJson?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  underline?: boolean;
  lineHeightPercent?: number;
  textAlign?: "left" | "center" | "right" | "justify";
  shape?: "rectangle" | "circle" | "triangle" | "line";
  strokeColor?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  iconName?: string;
  qrValue?: string;
  tickerSpeed?: number;
  counterTargetAt?: string;
  weatherProvider?: "open-meteo" | "nws" | "custom";
  weatherLocation?: string;
  weatherLatitude?: number;
  weatherLongitude?: number;
  weatherUnits?: "fahrenheit" | "celsius";
  weatherFields?: string;
};
export type SignageWidgetCache = {
  zoneId: string;
  title: string;
  text: string;
  items: string[];
  refreshedAt: string;
  source?: string;
};
export type Backup = {
  id: string;
  fileName: string;
  kind: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
};
export type BackupPreview = {
  restoreId: string;
  fileName: string;
  kind: string;
  compressedBytes: number;
  uncompressedBytes: number;
  fileCount: number;
  organization: string;
  users: number;
  classes: number;
  lessons: number;
  mediaRecords: number;
  mediaFiles: number;
  includesMedia: boolean;
  encrypted: boolean;
  secretHandling: "exclude" | "include" | "legacy-combined";
  sourceVersion?: string;
  compatibility: "compatible" | "unknown";
  warnings: string[];
  expiresAt: string;
};
export type BackupRestoreResult = {
  safetyBackupId: string;
  safetyBackupFileName: string;
  kind: string;
  organization: string;
  mediaRestored: boolean;
  preservedServerSettings: string[];
};
export type BackupPolicyStatus = {
  enabled: boolean;
  frequency: "daily" | "weekly";
  hourLocal: number;
  weeklyDay?: number;
  includeMedia: boolean;
  retentionCount: number;
  retentionDays: number;
  secretHandling: "exclude" | "include";
  backupPasswordConfigured: boolean;
  remoteWebDavUrl?: string;
  remoteAuthentication: "none" | "basic" | "bearer";
  remoteUsername?: string;
  remoteSecretConfigured: boolean;
  lastAttemptAt?: string;
  lastSucceededAt?: string;
  lastVerifiedAt?: string;
  lastBackupFileName?: string;
  lastError?: string;
  nextRunAt?: string;
  overdue: boolean;
  running: boolean;
  destinations?: BackupDestinationStatus[];
};
export type BackupDestinationProvider = "nextcloud" | "owncloud" | "webdav";
export type BackupDestinationInput = {
  provider: BackupDestinationProvider;
  webDavUrl: string | null;
  authentication: "none" | "basic" | "bearer";
  username: string | null;
  secret: string | null;
  retentionCount: number;
  retentionDays: number;
};
export type BackupDestinationStatus = {
  provider: BackupDestinationProvider;
  enabled: boolean;
  webDavUrl?: string;
  authentication: "none" | "basic" | "bearer";
  username?: string;
  secretConfigured: boolean;
  retentionCount: number;
  retentionDays: number;
  lastUploadedAt?: string;
  lastUploadedFileName?: string;
  remoteBackupCount?: number;
  lastError?: string;
};
export type MigrationTransferGrant = {
  token: string;
  fileName: string;
  expiresAt: string;
  endpoint: string;
};
export type Audit = {
  id: number;
  timestamp: string;
  actor: string;
  action: string;
  object: string;
  result: string;
  summary?: string;
};
export type TroubleshootingEntry = {
  timestamp: string;
  level: string;
  category: string;
  event: string;
  message: string;
  exception?: string;
  exceptionType?: string;
  details?: string;
  isFailure: boolean;
};
export type TroubleshootingLog = {
  generatedAt: string;
  runtime: TroubleshootingEntry[];
  audit: Audit[];
  retention: { runtimeEntries: number; failureRetentionDays: number; file: string };
};
export type View =
  | "dashboard"
  | "controller"
  | "classes"
  | "templates"
  | "activities"
  | "calendar"
  | "media"
  | "screens"
  | "signage"
  | "audience"
  | "users"
  | "settings";

export interface JoinAddressOption {
  id: string;
  label: string;
  url: string | null;
  available: boolean;
  detail: string | null;
}

export interface JoinAddressStatus {
  mode: string;
  url: string | null;
  resolvedFrom: string;
  options: JoinAddressOption[];
}

export type ShortenerState =
  | "NotInstalled" | "Installing" | "Configured" | "Running"
  | "Degraded" | "Stopped" | "ConfigurationError";

export type ShortenerSettings = {
  state: ShortenerState;
  enabled: boolean;
  domain: string;
  adminHost: string;
  suggestedAdminHost: string;
  upstream: string;
  rootRedirectMode: "notfound" | "lessoncue" | "organization" | "custom";
  rootRedirectUrl: string;
  publicUrl: string;
  adminUrl: string;
  lessonCuePublicUrl: string;
  poolVersion: number;
  poolTotal: number;
  poolPresent: number;
  activeCodes: number;
  detail: string | null;
  conflicts: string[];
  integrationKeyConfigured: boolean;
};

export type ShortenerTunnelRoute = { hostname: string; service: string; purpose: string };
export type ShortenerTunnelPlan = {
  canApplyAutomatically: boolean;
  explanation: string;
  instructions: string[];
  routes: ShortenerTunnelRoute[];
};

export type ShortenerReport = {
  total: number;
  alreadyCorrect: number;
  created: number;
  repaired: number;
  present: number;
  degraded: boolean;
  conflicts: string[];
  failures: string[];
};

export type ShortenerCheck = { name: string; passed: boolean; detail: string };
export type ShortenerTestResult = { passed: boolean; checks: ShortenerCheck[] };
