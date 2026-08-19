import { CuePoint, Lesson, LessonClass, Media, PlaylistItem, RecurringSchedule, Screen, Signage, SignageLayoutPreset, SignageZone, SignageZoneType } from "./models";

export function isWebPlayerPath(path: string) {
  return path === "/player" || path === "/display";
}

export function isActivityDisplayPath(path: string) {
  return path === "/activity-display";
}

export function isAudiencePath(path: string) {
  return path === "/respond" || path.startsWith("/respond/");
}

export function isActivityParticipantPath(path: string) {
  return path.startsWith("/play/");
}

export function isAudienceDisplayPath(path: string) {
  return path.startsWith("/audience-display/");
}

export function isAccountLinkPath(path: string) {
  return (
    path === "/verify" ||
    path === "/verify-email" ||
    path === "/reset-password" ||
    path === "/setup-account" ||
    path === "/register" ||
    path === "/forgot-password"
  );
}

export function isControllerPath(path: string) {
  return (
    path === "/controller" ||
    path === "/universalremote" ||
    path.startsWith("/room/") ||
    path.startsWith("/session/")
  );
}

export function controllerRouteSlug(path: string) {
  if (!path.startsWith("/room/")) return "";
  try {
    return decodeURIComponent(path.slice(6).split("/")[0]).toLowerCase();
  } catch {
    return "";
  }
}

export function controllerSessionToken(path: string) {
  return path.startsWith("/session/")
    ? path.slice(9).split("/")[0].toLowerCase()
    : "";
}

export function controllerSlug(item: LessonClass) {
  return item.controllerSlug || `class-${item.id.slice(0, 8)}`;
}

export function classControllerUrl(
  item: LessonClass,
  lessonId = "",
  preferredOrigin = location.origin,
) {
  const origin = item.controllerHostname
    ? `https://${item.controllerHostname}`
    : preferredOrigin;
  return `${origin}/room/${controllerSlug(item)}${lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : ""}`;
}

export function dayPart() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
export function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
export function formatDateAfterDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
export function formatShortDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" },
  );
}
export function dateInputValue(value?: string, addDays = 0) {
  if (value) return value.slice(0, 10);
  const date = new Date();
  if (addDays) date.setDate(date.getDate() + addDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function minutesFromTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
export function timeFromMinutes(value?: number) {
  if (value == null || value < 0 || value > 1439) return "";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function parseDateList(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)),
    ),
  ];
}
export function parseStoredDates(value: string) {
  try {
    const dates = JSON.parse(value);
    return Array.isArray(dates)
      ? dates
          .filter(
            (item) =>
              typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item),
          )
          .sort()
      : [];
  } catch {
    return [];
  }
}
export function schedulePayload(
  schedule: RecurringSchedule,
  enabled = schedule.enabled,
) {
  return {
    templateId: schedule.templateId,
    classId: schedule.classId,
    name: schedule.name,
    frequency: schedule.frequency,
    interval: schedule.interval,
    dayOfWeek: schedule.dayOfWeek ?? null,
    dayOfMonth: schedule.dayOfMonth ?? null,
    startDate: schedule.startDate,
    endDate: schedule.endDate || null,
    startMinutes: schedule.startMinutes ?? null,
    titlePattern: schedule.titlePattern,
    customDates: parseStoredDates(schedule.customDatesJson),
    excludedDates: parseStoredDates(schedule.excludedDatesJson),
    enabled,
    generateDaysAhead: schedule.generateDaysAhead,
  };
}
export function scheduleSummary(schedule: RecurringSchedule) {
  if (schedule.frequency === "custom")
    return `${parseStoredDates(schedule.customDatesJson).length} term or custom dates`;
  if (schedule.frequency === "monthly")
    return `Every ${schedule.interval === 1 ? "month" : `${schedule.interval} months`} on day ${schedule.dayOfMonth}`;
  const day = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][schedule.dayOfWeek ?? 0];
  return schedule.interval === 1
    ? `Every ${day}`
    : `Every ${schedule.interval} weeks on ${day}`;
}
export function signageFormPayload(form: FormData) {
  const recurrence = String(
    form.get("recurrence") || "once",
  ) as Signage["recurrence"];
  const startValue = String(form.get("startsAt") || "");
  const endValue = String(form.get("endsAt") || "");
  const endTime = String(form.get("endTime") || "");
  let zones: SignageZone[];
  try {
    zones = JSON.parse(String(form.get("zonesJson") || "[]"));
  } catch {
    zones = [];
  }
  return {
    name: String(form.get("name") || ""),
    mode: String(form.get("mode") || "scheduled"),
    enabled: form.get("enabled") === "on",
    priority: Number(form.get("priority") || 0),
    message: String(form.get("message") || ""),
    mediaAssetId: String(form.get("mediaAssetId") || "") || null,
    backgroundColor: String(form.get("backgroundColor") || "#25302d"),
    textColor: String(form.get("textColor") || "#ffffff"),
    targetTagsCsv: String(form.get("targetTagsCsv") || ""),
    targetScreenIds: form.getAll("targetScreenId").map(String),
    recurrence,
    startsAt:
      recurrence === "once" && startValue
        ? new Date(startValue).toISOString()
        : null,
    endsAt:
      recurrence === "once" && endValue
        ? new Date(endValue).toISOString()
        : null,
    scheduleStartDate:
      recurrence === "once"
        ? null
        : String(form.get("scheduleStartDate") || "") || null,
    scheduleEndDate:
      recurrence === "once"
        ? null
        : String(form.get("scheduleEndDate") || "") || null,
    startMinutes:
      recurrence === "once"
        ? null
        : minutesFromTime(String(form.get("startTime") || "")),
    endMinutes:
      recurrence === "once"
        ? null
        : endTime === "00:00"
          ? 1440
          : minutesFromTime(endTime),
    daysOfWeek:
      recurrence === "weekly" ? form.getAll("dayOfWeek").map(Number) : [],
    excludedDates:
      recurrence === "once"
        ? []
        : parseDateList(String(form.get("excludedDates") || "")),
    layoutPreset: String(form.get("layoutPreset") || "single"),
    zones,
    layoutId: String(form.get("layoutId") || "") || null,
    contentPlaylistId: String(form.get("contentPlaylistId") || "") || null,
    volumePercent: Number(form.get("volumePercent") || 100),
    displayPower: String(form.get("displayPower") || "unchanged"),
    kioskEnabled: form.get("kioskEnabled") === "on",
    kioskInteractionUrl: String(form.get("kioskInteractionUrl") || "") || null,
    kioskTimeoutSeconds: Number(form.get("kioskTimeoutSeconds") || 60),
    kioskShowCloseButton: form.get("kioskShowCloseButton") === "on",
    kioskShowTouchIndicator: form.get("kioskShowTouchIndicator") === "on",
    kioskVirtualKeyboard: form.get("kioskVirtualKeyboard") === "on",
  };
}
export function signagePayload(item: Signage, enabled = item.enabled) {
  return {
    name: item.name,
    mode: item.mode,
    enabled,
    priority: item.priority,
    startsAt: item.startsAt || null,
    endsAt: item.endsAt || null,
    message: item.message,
    backgroundColor: item.backgroundColor,
    textColor: item.textColor,
    mediaAssetId: item.mediaAssetId || null,
    targetTagsCsv: item.targetTagsCsv,
    recurrence: item.recurrence,
    scheduleStartDate: item.scheduleStartDate || null,
    scheduleEndDate: item.scheduleEndDate || null,
    startMinutes: item.startMinutes ?? null,
    endMinutes: item.endMinutes ?? null,
    daysOfWeek: item.daysOfWeek,
    excludedDates: item.excludedDates,
    targetScreenIds: item.targetScreenIds,
    layoutPreset: item.layoutPreset,
    zones: item.zones,
    layoutId: item.layoutId || null,
    contentPlaylistId: item.contentPlaylistId || null,
    volumePercent: item.volumePercent ?? 100,
    displayPower: item.displayPower || "unchanged",
    kioskEnabled: item.kioskEnabled || false,
    kioskInteractionUrl: item.kioskInteractionUrl || null,
    kioskTimeoutSeconds: item.kioskTimeoutSeconds || 60,
    kioskShowCloseButton: item.kioskShowCloseButton ?? true,
    kioskShowTouchIndicator: item.kioskShowTouchIndicator ?? true,
    kioskVirtualKeyboard: item.kioskVirtualKeyboard || false,
  };
}
export function parseStringArray(value?: string) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
export function localId() {
  const values = new Uint32Array(4);
  if (globalThis.crypto?.getRandomValues)
    globalThis.crypto.getRandomValues(values);
  else
    for (let index = 0; index < values.length; index++)
      values[index] = Math.floor(Math.random() * 0x100000000);
  return `${Date.now().toString(36)}${Array.from(values, (value) => value.toString(36).padStart(7, "0")).join("")}`;
}
export function newSignageZone(type: SignageZoneType, content = ""): SignageZone {
  return {
    id: localId(),
    type,
    title: type === "text" ? "Message" : undefined,
    content,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: "#17201e",
    textColor: "#ffffff",
    accentColor: "#d89127",
    refreshMinutes: 15,
    rotation: 0,
    zIndex: 0,
    opacity: 100,
    fit: "cover",
    locked: false,
    hidden: false,
    flipX: false,
    flipY: false,
  };
}
export function applySignagePreset(
  preset: SignageLayoutPreset,
  existing: SignageZone[],
): SignageZone[] {
  const geometry: Record<
    SignageLayoutPreset,
    [number, number, number, number][]
  > = {
    single: [[0, 0, 100, 100]],
    sidebar: [
      [0, 0, 68, 100],
      [69, 0, 31, 100],
    ],
    split: [
      [0, 0, 50, 100],
      [51, 0, 49, 100],
    ],
    "header-grid": [
      [0, 0, 100, 28],
      [0, 29, 50, 71],
      [51, 29, 49, 71],
    ],
    dashboard: [
      [0, 0, 50, 50],
      [51, 0, 49, 50],
      [0, 51, 50, 49],
      [51, 51, 49, 49],
    ],
  };
  const slots = geometry[preset];
  const target = Math.max(existing.length, slots.length);
  return Array.from({ length: Math.min(8, target) }, (_, index) => {
    const zone =
      existing[index] ||
      newSignageZone(
        index === 0 ? "text" : index === 1 ? "clock" : "text",
        index === 0 ? "Welcome" : "",
      );
    const [x, y, width, height] = slots[index] || [
      5 + (index % 3) * 31,
      62 + Math.floor(index / 3) * 18,
      29,
      16,
    ];
    return { ...zone, x, y, width, height };
  });
}
export function signageTime(value?: number, fallback = "") {
  return value === 1440 ? "00:00" : timeFromMinutes(value) || fallback;
}
export function signageScheduleSummary(item: Signage) {
  if (item.recurrence === "once") {
    if (!item.startsAt && !item.endsAt) return "Always available";
    const start = item.startsAt
      ? new Date(item.startsAt).toLocaleString()
      : "Now";
    const end = item.endsAt
      ? new Date(item.endsAt).toLocaleString()
      : "until paused";
    return `${start} – ${end}`;
  }
  const weekdays =
    item.recurrence === "weekly"
      ? item.daysOfWeek
          .map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day])
          .join(", ")
      : "Every day";
  const dates = item.scheduleEndDate
    ? `${item.scheduleStartDate || "now"} – ${item.scheduleEndDate}`
    : `from ${item.scheduleStartDate || "now"}`;
  return `${weekdays} · ${signageTime(item.startMinutes, "00:00")}–${signageTime(item.endMinutes, "00:00")} · ${dates}${item.excludedDates.length ? ` · ${item.excludedDates.length} excluded` : ""}`;
}
export function signageTargets(item: Signage) {
  const targets = [...item.targetScreenNames];
  if (item.targetTagsCsv) targets.push(`tags: ${item.targetTagsCsv}`);
  return targets.length ? targets.join(" · ") : "All screens";
}
export function formatDuration(ms?: number) {
  if (ms === undefined || ms === null) return "0:00";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function cuePlannedDurationMs(item: PlaylistItem) {
  const base =
    item.type === "image"
      ? Math.max(0, (item.imageDurationSeconds ?? item.estimatedDurationSeconds ?? 0) * 1000)
      : Math.max(
          0,
          (item.endMs ?? item.mediaDurationMs ?? item.durationMs ?? 0) -
            (item.startMs || 0),
        );
  return Math.round(
    (base * Math.max(1, item.repeatCount || 1) * 100) /
      Math.max(25, item.playbackRatePercent || 100),
  );
}
export function lessonPlannedDurationMs(lesson: Lesson) {
  return lesson.items
    .filter((item) => item.role === "lesson")
    .reduce((sum, item) => sum + cuePlannedDurationMs(item), 0);
}
export function formatFriendlyDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return (
    [
      hours ? `${hours}h` : "",
      minutes ? `${minutes}m` : "",
      !hours && remainder ? `${remainder}s` : "",
    ]
      .filter(Boolean)
      .join(" ") || "0m"
  );
}
export function intervalsOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && startB < endA;
}
export function calendarDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function calendarConflictIds(lessons: Lesson[]) {
  const ids = new Set<string>();
  const scheduled = lessons.filter(
    (lesson) => lesson.designatedStartAt && lessonPlannedDurationMs(lesson) > 0,
  );
  for (let index = 0; index < scheduled.length; index++)
    for (
      let otherIndex = index + 1;
      otherIndex < scheduled.length;
      otherIndex++
    ) {
      const first = scheduled[index],
        second = scheduled[otherIndex];
      if (first.classId !== second.classId) continue;
      const firstStart = new Date(first.designatedStartAt!);
      const secondStart = new Date(second.designatedStartAt!);
      if (
        intervalsOverlap(
          firstStart,
          new Date(firstStart.getTime() + lessonPlannedDurationMs(first)),
          secondStart,
          new Date(secondStart.getTime() + lessonPlannedDurationMs(second)),
        )
      ) {
        ids.add(first.id);
        ids.add(second.id);
      }
    }
  return ids;
}
export function formatPreciseTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.${String(Math.round((seconds % 1) * 100)).padStart(2, "0")}`;
}
export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}
export function parseDiagnosticJson<T>(value?: string): T[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
export function formatClockOffset(value?: number) {
  if (value == null) return "pending";
  const absolute = Math.abs(value);
  if (absolute < 1_000) return `${absolute} ms`;
  const direction = value > 0 ? "fast" : "slow";
  return `${(absolute / 1_000).toFixed(1)}s ${direction}`;
}
export function cuePoints(item?: PlaylistItem): CuePoint[] {
  if (!item?.cuePointsJson) return [];
  try {
    const values = JSON.parse(item.cuePointsJson) as Array<
      Partial<CuePoint> & { Name?: string; PositionMs?: number }
    >;
    return values
      .map((value) => ({
        name: String(value.name ?? value.Name ?? "").trim(),
        positionMs: Number(value.positionMs ?? value.PositionMs),
      }))
      .filter(
        (value) =>
          value.name &&
          Number.isFinite(value.positionMs) &&
          value.positionMs >= 0,
      )
      .sort((a, b) => a.positionMs - b.positionMs);
  } catch {
    return [];
  }
}
export function friendlyType(type: string) {
  if (type.startsWith("video")) return "Video";
  if (type.startsWith("audio")) return "Audio";
  if (type.startsWith("image")) return "Image";
  if (type.includes("pdf")) return "PDF";
  return "Document";
}
export function mediaCategory(item: Media) {
  const fileName = item.fileName.toLowerCase();
  const contentType = item.contentType.toLowerCase();
  if (item.sourceKind === "link" && item.linkKind === "webpage") return "website";
  if (item.sourceKind === "link" && item.linkKind === "youtube") return "video";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("audio/")) return "audio";
  if (fileName.endsWith(".pdf") || contentType === "application/pdf") return "pdf";
  if (isPresentationFileName(item.fileName) || /presentation|powerpoint|keynote|pages|numbers|wordprocessingml|msword|excel|spreadsheet|opendocument|richtext|text\/plain|text\/csv|tab-separated/.test(contentType)) return "presentation";
  if (item.sourceKind === "link") return "website";
  return "other";
}
export function mediaNameStem(fileName: string) {
  const extension = mediaFileExtension(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}
export function mediaFileExtension(fileName: string) {
  const base = fileName.split(/[\\/]/).pop() || fileName;
  const index = base.lastIndexOf(".");
  return index > 0 ? base.slice(index) : "";
}
export function isPresentationFileName(fileName: string) {
  return /\.(pdf|ppt|pptx|pps|ppsx|pot|potx|pptm|ppsm|potm|odp|otp|odt|ott|ods|ots|fodp|fodt|fods|key|pages|numbers|doc|docx|docm|dot|dotx|dotm|xls|xlt|xla|xlsx|xlsm|xltx|xltm|xlam|rtf|txt|md|csv|tsv)$/i.test(fileName);
}
export function isConvertibleDocument(media: Media) {
  return (
    /\.(pdf|ppt|pptx|pps|ppsx|pot|potx|pptm|ppsm|potm|odp|otp|odt|ott|ods|ots|fodp|fodt|fods|key|pages|numbers|doc|docx|docm|dot|dotx|dotm|xls|xlt|xla|xlsx|xlsm|xltx|xltm|xlam|rtf|txt|md|csv|tsv)$/i.test(
      media.fileName,
    ) ||
    /pdf|presentation|powerpoint|keynote|pages|numbers|msword|wordprocessingml|excel|spreadsheet|opendocument|richtext|text\/plain|text\/csv|tab-separated/.test(
      media.contentType,
    )
  );
}
export function convertedSlideCount(media: Media) {
  try {
    const value = JSON.parse(media.convertedSlidesJson);
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}
export function friendlyPlaybackState(state?: string) {
  return (
    (
      {
        idle: "Ready",
        loading: "Loading",
        buffering: "Buffering",
        playing: "Playing",
        paused: "Paused",
        completed: "Completed",
        error: "Error",
      } as Record<string, string>
    )[state || "idle"] || "Unknown"
  );
}
export function youtubeEmbedUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be")
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      else if (/^\/(embed|shorts|live)\//.test(url.pathname))
        id = url.pathname.split("/").filter(Boolean)[1] || "";
    }
    return /^[A-Za-z0-9_-]{6,}$/.test(id)
      ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`
      : undefined;
  } catch {
    return undefined;
  }
}
export function isOnline(screen: Screen) {
  return screen.online;
}
export function timeAgo(value: string) {
  const seconds = Math.max(
    1,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
export function roleName(role: PlaylistItem["role"]) {
  return role === "preRoll"
    ? "PRE-ROLL"
    : role === "countdown"
      ? "COUNTDOWN"
      : role === "postLesson"
        ? "POST-LESSON"
        : "LESSON";
}
export function defaultEndBehaviorForRole(role: string) {
  return role === "preRoll" || role === "postLesson" ? "loop" : "pause";
}
export function cueDurationLabel(item: PlaylistItem) {
  if (item.type === "image") {
    if (item.imageDurationSeconds != null) return formatDuration(item.imageDurationSeconds * 1000);
    if (item.estimatedDurationSeconds != null) return `~${formatDuration(item.estimatedDurationSeconds * 1000)}`;
    return formatDuration();
  }
  return formatDuration(item.durationMs || item.mediaDurationMs);
}
export function toLocalInput(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
export function localDateTimeValue(value?: string) {
  return toLocalInput(value);
}
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
export function quotaLimitsToText(values?: Record<string, number>) {
  return Object.entries(values || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, bytes]) =>
        `${key} = ${Number((bytes / 1024 ** 3).toFixed(3))}`,
    )
    .join("\n");
}
export function quotaLimitsFromText(value: string) {
  const result: Record<string, number> = {};
  for (const source of value.split("\n")) {
    const line = source.trim();
    if (!line) continue;
    const separator = line.lastIndexOf("=");
    const key = line.slice(0, separator).trim();
    const gigabytes = Number(line.slice(separator + 1).trim());
    if (separator < 1 || !key || !Number.isFinite(gigabytes) || gigabytes <= 0)
      throw new Error(
        `Invalid upload limit “${line}”. Use one entry per line in the form name = GB.`,
      );
    result[key] = Math.round(gigabytes * 1024 ** 3);
  }
  return result;
}
export function isServiceAdminRole(role: string) {
  return role === "Service Admin" || role === "Owner";
}
export function cleanReleaseNotes(value: string) {
  return value
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .trim();
}
export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "LC"
  );
}
