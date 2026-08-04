import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { confirmAction, requestText } from "./AccessibleDialogs";
import "./simple-signage.css";
import {
  SignageLayout as ScreenSignageLayout,
  type CueItem,
  type Signage,
  type SignageContentPlaylist,
  type SignageWidgetCache,
  type SignageZone,
} from "./WebPlayer";

type Media = {
  id: string;
  fileName: string;
  contentType: string;
  durationMs?: number;
  thumbnailUrl?: string;
  downloadUrl: string;
  processingStatus?: string;
};

type Screen = {
  id: string;
  name: string;
  site: string;
  revoked: boolean;
  online: boolean;
  assignedSignageId?: string;
};

type Zone = {
  id: string;
  type: string;
  title?: string;
  content?: string;
  mediaAssetId?: string;
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
  fit: string;
  locked: boolean;
  hidden: boolean;
  flipX: boolean;
  flipY: boolean;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  underline?: boolean;
  lineHeightPercent?: number;
  textAlign?: string;
  cornerRadius?: number;
  qrValue?: string;
  qrLabelTop?: string;
  qrLabelBottom?: string;
  qrLabelLeft?: string;
  qrLabelRight?: string;
  qrPlacement?: string;
  qrSizePercent?: number;
  clockDisplay?: string;
  clockTimeFormat?: string;
  clockDateFormat?: string;
  clockOrder?: string;
  clockTimeFontSize?: number;
  clockDateFontSize?: number;
  weatherProvider?: string;
  weatherLocation?: string;
  weatherPostalCode?: string;
  weatherUnits?: string;
  weatherFields?: string;
  contentPlaylistId?: string;
  contentPadding?: number;
  contentScale?: number;
  verticalAlign?: string;
  richTextJson?: string;
  mediaScale?: number;
  mediaOffsetX?: number;
  mediaOffsetY?: number;
  mediaAllowOverflow?: boolean;
  wifiNetworkName?: string;
  wifiPassword?: string;
  wifiSecurity?: string;
  wifiHidden?: boolean;
  weatherIconStyle?: string;
  weatherLayout?: string;
  weatherIconSize?: number;
  weatherTitleSize?: number;
  weatherTemperatureSize?: number;
  weatherDetailsSize?: number;
  weatherLatitude?: number;
  weatherLongitude?: number;
  clockShowPeriod?: boolean;
  clockShowWeekday?: boolean;
  clockShowYear?: boolean;
  calendarMaxItems?: number;
  calendarFields?: string;
  audienceSessionId?: string;
  audienceCode?: string;
  audienceShowResults?: boolean;
  audienceResultDelaySeconds?: number;
  streamOverrideWhenLive?: boolean;
  streamOverrideStartsAt?: string;
  streamOverrideEndsAt?: string;
};

type Layout = {
  id: string;
  name: string;
  description: string;
  isStarter: boolean;
  templateKey?: string;
  backgroundColor: string;
  canvasWidth: number;
  canvasHeight: number;
  safeAreaPercent: number;
  zones: Zone[];
  version: number;
};

type PlaylistItem = {
  id: string;
  kind: string;
  title?: string;
  mediaAssetId?: string;
  sourceUrl?: string;
  durationSeconds: number;
  transition: string;
  volumePercent: number;
  muted: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  fit: string;
  notes?: string;
};

type Playlist = {
  id: string;
  name: string;
  items: PlaylistItem[];
  version: number;
};

type Sign = {
  id: string;
  name: string;
  layoutId: string;
  layoutName: string;
  playlistAssignments: Record<string, string>;
  screenIds: string[];
  screenNames: string[];
  version: number;
};

type AudienceSession = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "open" | "closed";
  showLiveResults: boolean;
  participantCount: number;
};

type Tab = "layouts" | "playlists" | "signs";

type CompatibilityIssue = {
  title: string;
  message: string;
  fallback: string;
};

class SignageRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly issues: CompatibilityIssue[] = [],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/signage-studio${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new SignageRequestError(
      problem.error || `Request failed (${response.status})`,
      problem.code,
      problem.issues || [],
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

async function audienceSessions(): Promise<AudienceSession[]> {
  const response = await fetch("/api/v1/audience/admin/sessions", { credentials: "same-origin" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Unable to load audience polls (${response.status}).`);
  return body as AudienceSession[];
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function signageDurationLabel(seconds: number) {
  const value = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function localDateTimeValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function asIsoDateTime(value: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
}

function audienceDisplaySettings(sourceUrl?: string) {
  if (!sourceUrl?.startsWith("/audience-display/")) return null;
  const url = new URL(sourceUrl, location.origin);
  return {
    code: url.pathname.split("/").filter(Boolean).at(-1) || "",
    mode:
      url.searchParams.get("results") === "0"
        ? "off"
        : String(Math.max(0, Number(url.searchParams.get("delay") || 0) || 0)),
  };
}

function audienceDisplaySource(code: string, mode: string) {
  const showResults = mode !== "off";
  return `/audience-display/${code}?results=${showResults ? 1 : 0}&delay=${showResults ? Math.max(0, Number(mode) || 0) : 0}`;
}

function localDatePart(value?: string) {
  return localDateTimeValue(value).slice(0, 10);
}

function localTimePart(value?: string) {
  return localDateTimeValue(value).slice(11, 16);
}

function withLocalDateTimePart(value: string | undefined, part: "date" | "time", next: string) {
  if (!next) return undefined;
  const existingDate = localDatePart(value) || localDateTimeValue(new Date().toISOString()).slice(0, 10);
  const existingTime = localTimePart(value) || "00:00";
  return asIsoDateTime(part === "date" ? `${next}T${existingTime}` : `${existingDate}T${next}`);
}

function zone(type: string, zoneId = id("element")): Zone {
  const common: Zone = {
    id: zoneId,
    type,
    title: elementName(type),
    content: type === "text" ? "Add your message" : "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: "#063b27",
    textColor: "#ffffff",
    accentColor: "#df941f",
    refreshMinutes: 15,
    rotation: 0,
    zIndex: 1,
    opacity: 100,
    fit: "contain",
    locked: true,
    hidden: false,
    flipX: false,
    flipY: false,
    fontFamily: "system-ui",
    fontSize: 34,
    fontWeight: 600,
    lineHeightPercent: 120,
    textAlign: "left",
    cornerRadius: 0,
    contentPadding: 6,
    contentScale: 100,
    verticalAlign: "middle",
    mediaScale: 100,
    mediaOffsetX: 0,
    mediaOffsetY: 0,
    mediaAllowOverflow: false,
  };
  if (type === "presentation") common.content = "Choose a playlist";
  if (type === "weather") {
    common.weatherProvider = "open-meteo";
    common.weatherLocation = "Your location";
    common.weatherUnits = "fahrenheit";
    common.weatherFields =
      "icon,conditions,temperature,forecast,high,low,humidity,wind,precipitation,sunrise,sunset";
    common.weatherIconStyle = "color";
    common.weatherLayout = "icon-top";
    common.weatherIconSize = 84;
    common.weatherTitleSize = 28;
    common.weatherTemperatureSize = 58;
    common.weatherDetailsSize = 22;
    common.textAlign = "center";
  }
  if (type === "clock") {
    common.clockDisplay = "both";
    common.clockTimeFormat = "12h";
    common.clockDateFormat = "long";
    common.clockOrder = "time-date";
    common.clockTimeFontSize = 54;
    common.clockDateFontSize = 25;
    common.clockShowPeriod = true;
    common.clockShowWeekday = true;
    common.clockShowYear = true;
    common.textAlign = "center";
  }
  if (type === "qr" || type === "wifi") {
    common.qrPlacement = "left";
    common.qrSizePercent = 42;
    common.qrLabelRight = type === "wifi" ? "Scan to join Wi-Fi" : "Scan for details";
    common.wifiNetworkName = type === "wifi" ? "Guest" : undefined;
    common.wifiPassword = type === "wifi" ? "password" : undefined;
    common.wifiSecurity = type === "wifi" ? "WPA" : undefined;
    common.qrValue =
      type === "wifi"
        ? "WIFI:T:WPA;S:Guest;P:password;;"
        : "https://lessoncue.local";
  }
  if (type === "audience") {
    common.title = "";
    common.content = "Scan the QR code to vote.";
    common.qrPlacement = "left";
    common.qrSizePercent = 42;
    common.audienceShowResults = true;
    common.audienceResultDelaySeconds = 0;
  }
  if (type === "calendar") {
    common.calendarMaxItems = 0;
    common.calendarFields = "date,time,title";
  }
  return common;
}

function escapeWifi(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll(":", "\\:");
}

function wifiQrValue(item: Zone) {
  const security = item.wifiSecurity === "none" ? "nopass" : item.wifiSecurity || "WPA";
  return `WIFI:T:${security};S:${escapeWifi(item.wifiNetworkName || "")};P:${escapeWifi(item.wifiPassword || "")};H:${item.wifiHidden ? "true" : "false"};;`;
}

function elementName(type: string) {
  return (
    {
      presentation: "Playlist",
      text: "Text message",
      weather: "Weather",
      clock: "Time & date",
      qr: "QR code",
      wifi: "Wi-Fi QR",
      media: "Image or logo",
      calendar: "Calendar feed",
      audience: "Audience poll",
      webpage: "Web page",
    }[type] || "Empty"
  );
}

function informationFrame(
  bottomCount: number,
  sideCount: number,
  primary: string,
  secondary: string,
  existing: Zone[] = [],
) {
  const previous = new Map(existing.map((item) => [item.id, item]));
  const place = (
    zoneId: string,
    type: string,
    x: number,
    y: number,
    width: number,
    height: number,
    backgroundColor: string,
  ) => ({
    ...(previous.get(zoneId) || zone(type, zoneId)),
    id: zoneId,
    x,
    y,
    width,
    height,
    backgroundColor,
    locked: true,
  });
  const result: Zone[] = [
    place("main-playlist", "presentation", 0, 0, 80, 80, "#303331"),
  ];
  for (let index = 0; index < sideCount; index++) {
    const top = Math.round((80 * index) / sideCount);
    const bottom = Math.round((80 * (index + 1)) / sideCount);
    result.push(
      place(
        `side-${index + 1}`,
        index === 0 ? "text" : "clock",
        80,
        top,
        20,
        bottom - top,
        index % 2 ? secondary : primary,
      ),
    );
  }
  for (let index = 0; index < bottomCount; index++) {
    const left = Math.round((100 * index) / bottomCount);
    const right = Math.round((100 * (index + 1)) / bottomCount);
    const fallback = ["weather", "wifi", "text", "text", "qr"][index] || "text";
    let color = index % 2 ? primary : secondary;
    if (index === bottomCount - 1) {
      const sideBottom = (sideCount - 1) % 2 ? secondary : primary;
      color = sideBottom === primary ? secondary : primary;
    }
    result.push(
      place(
        `bottom-${index + 1}`,
        fallback,
        left,
        80,
        right - left,
        20,
        color,
      ),
    );
  }
  return result;
}

function blankLayout(kind: "information" | "fullscreen" | "welcome"): Layout {
  if (kind === "information")
    return {
      id: "",
      name: "New information sign",
      description: "A 16:9 presentation with a persistent information frame.",
      isStarter: false,
      templateKey: "information-frame",
      backgroundColor: "#26302d",
      canvasWidth: 1920,
      canvasHeight: 1080,
      safeAreaPercent: 0,
      zones: informationFrame(5, 2, "#063b27", "#052c1e"),
      version: 0,
    };
  if (kind === "fullscreen")
    return {
      id: "",
      name: "New full-screen sign",
      description: "One playlist fills the entire display.",
      isStarter: false,
      templateKey: "fullscreen",
      backgroundColor: "#111816",
      canvasWidth: 1920,
      canvasHeight: 1080,
      safeAreaPercent: 0,
      zones: [zone("presentation", "main-playlist")],
      version: 0,
    };
  const playlist = zone("presentation", "welcome-playlist");
  Object.assign(playlist, { x: 8, y: 48, width: 60, height: 42 });
  const welcome = zone("text", "welcome-title");
  Object.assign(welcome, {
    x: 8,
    y: 10,
    width: 84,
    height: 28,
    title: "Welcome",
    content: "Welcome",
    fontSize: 88,
    textAlign: "center",
  });
  const clock = zone("clock", "welcome-clock");
  Object.assign(clock, { x: 72, y: 48, width: 20, height: 42 });
  return {
    id: "",
    name: "New welcome sign",
    description: "A welcoming message, media playlist, and clock.",
    isStarter: false,
    templateKey: "welcome",
    backgroundColor: "#25302d",
    canvasWidth: 1920,
    canvasHeight: 1080,
    safeAreaPercent: 0,
    zones: [welcome, playlist, clock],
    version: 0,
  };
}

export function SimpleSignage({
  media,
  screens,
  navigation,
  onNavigate,
  refresh,
  notify,
}: {
  media: Media[];
  screens: Screen[];
  navigation: { key: string; icon: string; label: string }[];
  onNavigate: (key: string) => void;
  refresh: () => void;
  notify: (message: string) => void;
}) {
  const navigationMenu = useRef<HTMLDetailsElement>(null);
  const [tab, setTab] = useState<Tab>("layouts");
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [signs, setSigns] = useState<Sign[]>([]);
  const [audiencePolls, setAudiencePolls] = useState<AudienceSession[]>([]);
  const [layoutDraft, setLayoutDraft] = useState<Layout>();
  const [playlistDraft, setPlaylistDraft] = useState<Playlist>();
  const [signDraft, setSignDraft] = useState<Sign>();
  const [selectedZoneId, setSelectedZoneId] = useState<string>();
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("All changes saved");
  const [draggedMediaId, setDraggedMediaId] = useState<string>();
  const draggedMediaIdRef = useRef<string | undefined>(undefined);
  const [mediaDropIndex, setMediaDropIndex] = useState<number>();
  const pointerMediaDrag = useRef<{
    mediaId: string;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | undefined>(undefined);
  const suppressMediaClickUntil = useRef(0);

  async function load(prefer?: {
    layoutId?: string;
    playlistId?: string;
    signId?: string;
  }) {
    try {
      const [nextLayouts, nextPlaylists, nextSigns, nextAudiencePolls] = await Promise.all([
        request<Layout[]>("/layouts"),
        request<Playlist[]>("/playlists"),
        request<Sign[]>("/signs"),
        audienceSessions(),
      ]);
      setLayouts(nextLayouts);
      setPlaylists(nextPlaylists);
      setSigns(nextSigns);
      setAudiencePolls(nextAudiencePolls);
      const layout =
        nextLayouts.find((item) => item.id === prefer?.layoutId) ||
        nextLayouts.find((item) => !item.isStarter) ||
        nextLayouts[0];
      const playlist =
        nextPlaylists.find((item) => item.id === prefer?.playlistId) ||
        nextPlaylists[0];
      const sign =
        nextSigns.find((item) => item.id === prefer?.signId) || nextSigns[0];
      if (!layoutDraft || prefer?.layoutId) setLayoutDraft(layout);
      if (!playlistDraft || prefer?.playlistId) setPlaylistDraft(playlist);
      if (!signDraft || prefer?.signId) setSignDraft(sign);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to load Signage.");
    }
  }

  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void audienceSessions().then(setAudiencePolls).catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeLayout =
    tab === "signs"
      ? layouts.find((item) => item.id === signDraft?.layoutId)
      : layoutDraft;
  const activeAssignments =
    tab === "signs" ? signDraft?.playlistAssignments || {} : {};
  const readyMedia = media.filter(
    (item) => !item.processingStatus || item.processingStatus === "ready",
  );
  const readyMediaRef = useRef(readyMedia);
  useEffect(() => {
    readyMediaRef.current = readyMedia;
  }, [readyMedia]);

  function markChanged() {
    setSaved("Unsaved changes");
  }

  function chooseLayout(item: Layout) {
    setLayoutDraft(structuredClone(item));
    setSelectedZoneId(item.zones[0]?.id);
  }

  async function saveLayout() {
    if (!layoutDraft) return;
    setBusy(true);
    try {
      const savedLayout = await request<Layout>("/layouts/save-publish", {
        method: "POST",
        body: JSON.stringify({
          id: layoutDraft.id || null,
          pushToScreens: true,
          layout: {
            name: layoutDraft.name,
            folder: "",
            description: layoutDraft.description,
            isTemplate: false,
            backgroundColor: layoutDraft.backgroundColor,
            canvasWidth: layoutDraft.canvasWidth,
            canvasHeight: layoutDraft.canvasHeight,
            safeAreaPercent: layoutDraft.safeAreaPercent,
            zones: layoutDraft.zones,
          },
        }),
      });
      await load({ layoutId: savedLayout.id });
      setSaved("Saved just now");
      notify("Layout saved and updated on assigned screens.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save layout.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLayout(item: Layout) {
    if (!await confirmAction(`Delete ${item.name}?`, { destructive: true }))
      return;
    try {
      await request(`/layouts/${item.id}`, { method: "DELETE" });
      setLayoutDraft(undefined);
      await load();
      notify("Layout deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete layout.");
    }
  }

  function createPlaylist() {
    setPlaylistDraft({
      id: "",
      name: "New looping playlist",
      version: 0,
      items: [],
    });
    setSelectedItemId(undefined);
    setTab("playlists");
    markChanged();
  }

  async function savePlaylist() {
    if (!playlistDraft) return;
    setBusy(true);
    try {
      const savedPlaylist = await request<Playlist>("/playlists/save", {
        method: "POST",
        body: JSON.stringify({
          id: playlistDraft.id || null,
          playlist: {
            name: playlistDraft.name,
            folder: "",
            playbackMode: "ordered",
            synchronization: "screen",
            items: playlistDraft.items,
          },
        }),
      });
      await load({ playlistId: savedPlaylist.id });
      setSaved("Saved just now");
      notify("Playlist saved. It will loop continuously.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save playlist.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePlaylist(item: Playlist) {
    if (!await confirmAction(`Delete ${item.name}?`, { destructive: true }))
      return;
    try {
      await request(`/playlists/${item.id}`, { method: "DELETE" });
      setPlaylistDraft(undefined);
      await load();
      notify("Playlist deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete playlist.");
    }
  }

  function addMedia(item: Media, requestedIndex?: number) {
    const entry: PlaylistItem = {
      id: id("slide"),
      kind: "media",
      title: item.fileName,
      mediaAssetId: item.id,
      durationSeconds:
        item.contentType.startsWith("video/") && item.durationMs
          ? Math.max(1, Math.round(item.durationMs / 1000))
          : item.contentType.startsWith("video/")
            ? 30
            : 10,
      transition: "fade",
      volumePercent: 100,
      muted: false,
      fadeInMs: 500,
      fadeOutMs: 500,
      fit: "contain",
    };
    setPlaylistDraft((current) => {
      if (!current) return current;
      const next = [...current.items];
      const index = Math.max(
        0,
        Math.min(requestedIndex ?? next.length, next.length),
      );
      next.splice(index, 0, entry);
      return { ...current, items: next };
    });
    setSelectedItemId(entry.id);
    markChanged();
  }

  const addMediaRef = useRef(addMedia);
  useEffect(() => {
    addMediaRef.current = addMedia;
  });

  function beginMediaPointerDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    item: Media,
  ) {
    if (event.pointerType === "mouse" || !event.isPrimary) return;
    pointerMediaDrag.current = {
      mediaId: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    draggedMediaIdRef.current = item.id;
    setDraggedMediaId(item.id);
    setMediaDropIndex(playlistDraft?.items.length || 0);
  }

  useEffect(() => {
    if (!draggedMediaId || !pointerMediaDrag.current) return;
    const dropIndexAtPoint = (clientX: number, clientY: number) => {
      const target = document.elementFromPoint(clientX, clientY);
      const timeline = target?.closest<HTMLElement>(".playlist-timeline");
      if (!timeline) return undefined;
      const card = target?.closest<HTMLElement>(".signage-timeline-card");
      if (!card) return playlistDraft?.items.length || 0;
      const index = Number(card.dataset.signageIndex);
      if (!Number.isInteger(index)) return undefined;
      const bounds = card.getBoundingClientRect();
      return clientX < bounds.left + bounds.width / 2 ? index : index + 1;
    };
    const finish = (event: PointerEvent, cancelled = false) => {
      const drag = pointerMediaDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const index = dropIndexAtPoint(event.clientX, event.clientY);
      const item = readyMediaRef.current.find(
        (candidate) => candidate.id === drag.mediaId,
      );
      pointerMediaDrag.current = undefined;
      draggedMediaIdRef.current = undefined;
      setDraggedMediaId(undefined);
      setMediaDropIndex(undefined);
      if (!cancelled && drag.moved && item && index != null) {
        suppressMediaClickUntil.current = Date.now() + 500;
        addMediaRef.current(item, index);
      }
    };
    const move = (event: PointerEvent) => {
      const drag = pointerMediaDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (
        !drag.moved &&
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6
      )
        return;
      drag.moved = true;
      event.preventDefault();
      const index = dropIndexAtPoint(event.clientX, event.clientY);
      if (index != null) setMediaDropIndex(index);
    };
    const up = (event: PointerEvent) => finish(event);
    const cancel = (event: PointerEvent) => finish(event, true);
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
    };
  }, [draggedMediaId, playlistDraft?.items.length]);

  function beginMediaDrag(
    event: ReactDragEvent<HTMLButtonElement>,
    item: Media,
  ) {
    pointerMediaDrag.current = undefined;
    draggedMediaIdRef.current = item.id;
    setDraggedMediaId(item.id);
    setMediaDropIndex(playlistDraft?.items.length || 0);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-lessoncue-signage-media-id", item.id);
    event.dataTransfer.setData("text/plain", item.id);
  }

  function mediaDragOver(event: ReactDragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setMediaDropIndex(index);
  }

  function dropMedia(event: ReactDragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    const mediaId =
      event.dataTransfer.getData("application/x-lessoncue-signage-media-id") ||
      event.dataTransfer.getData("text/plain") ||
      draggedMediaIdRef.current ||
      draggedMediaId;
    const item = readyMedia.find((candidate) => candidate.id === mediaId);
    draggedMediaIdRef.current = undefined;
    setDraggedMediaId(undefined);
    setMediaDropIndex(undefined);
    if (item) {
      suppressMediaClickUntil.current = Date.now() + 500;
      addMedia(item, index);
    }
  }

  function finishMediaDrag() {
    pointerMediaDrag.current = undefined;
    draggedMediaIdRef.current = undefined;
    setDraggedMediaId(undefined);
    setMediaDropIndex(undefined);
  }

  async function addWebPage() {
    const sourceUrl = await requestText({
      title: "Add a web page",
      label: "Web page address",
      defaultValue: "https://",
      inputType: "url",
      confirmLabel: "Add web page",
    });
    if (!sourceUrl) return;
    const entry: PlaylistItem = {
      id: id("slide"),
      kind: "web",
      title: "Web page",
      sourceUrl,
      durationSeconds: 15,
      transition: "fade",
      volumePercent: 100,
      muted: true,
      fadeInMs: 500,
      fadeOutMs: 500,
      fit: "contain",
    };
    setPlaylistDraft((current) =>
      current ? { ...current, items: [...current.items, entry] } : current,
    );
    setSelectedItemId(entry.id);
    markChanged();
  }

  function addAudiencePollToPlaylist(
    poll: AudienceSession,
    showResults: boolean,
    resultDelaySeconds: number,
  ) {
    const entry: PlaylistItem = {
      id: id("slide"),
      kind: "web",
      title: poll.title,
      sourceUrl: audienceDisplaySource(
        poll.code,
        showResults ? String(resultDelaySeconds) : "off",
      ),
      durationSeconds: 60,
      transition: "fade",
      volumePercent: 100,
      muted: true,
      fadeInMs: 500,
      fadeOutMs: 500,
      fit: "contain",
    };
    setPlaylistDraft((current) =>
      current ? { ...current, items: [...current.items, entry] } : current,
    );
    setSelectedItemId(entry.id);
    markChanged();
  }

  function createSign() {
    const firstLayout = layouts[0];
    if (!firstLayout) {
      notify("Create a layout before creating a sign.");
      setTab("layouts");
      return;
    }
    setSignDraft({
      id: "",
      name: "New sign",
      layoutId: firstLayout.id,
      layoutName: firstLayout.name,
      playlistAssignments: {},
      screenIds: [],
      screenNames: [],
      version: 0,
    });
    setTab("signs");
    markChanged();
  }

  async function saveSign() {
    if (!signDraft) return;
    setBusy(true);
    try {
      const submit = (allowUnsupportedContent: boolean) =>
        request<{ id: string }>(
          signDraft.id ? `/signs/${signDraft.id}` : "/signs",
          {
            method: signDraft.id ? "PUT" : "POST",
            body: JSON.stringify({
              name: signDraft.name,
              layoutId: signDraft.layoutId,
              playlistAssignments: signDraft.playlistAssignments,
              screenIds: signDraft.screenIds,
              allowUnsupportedContent,
            }),
          },
        );
      let result: { id: string };
      try {
        result = await submit(false);
      } catch (error) {
        if (
          !(error instanceof SignageRequestError) ||
          error.code !== "display_capability_warning" ||
          !await confirmAction(
            `${error.message}\n\n${error.issues
              .slice(0, 8)
              .map((issue) => `• ${issue.message}`)
              .join("\n")}${error.issues.length > 8 ? `\n• …and ${error.issues.length - 8} more` : ""}\n\nAssign these screens anyway?`,
          )
        )
          throw error;
        result = await submit(true);
      }
      await load({ signId: result.id });
      refresh();
      setSaved("Saved just now");
      notify("Sign saved and assigned screens updated.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save sign.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSign(item: Sign) {
    if (!await confirmAction(
      `Delete ${item.name}? Its screens will become unassigned.`,
      { destructive: true },
    ))
      return;
    try {
      await request(`/signs/${item.id}`, { method: "DELETE" });
      setSignDraft(undefined);
      await load();
      refresh();
      notify("Sign deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete sign.");
    }
  }

  return (
    <div className="simple-signage">
      <header className="simple-signage-header">
        <div className="simple-signage-brand">
          <span className="signage-monitor-icon">▶</span>
          <strong>LessonCue</strong>
          <span>Signage</span>
        </div>
        <details className="simple-signage-navigation" ref={navigationMenu}>
          <summary aria-label="Open LessonCue navigation">
            <span className="simple-signage-menu-icon" aria-hidden="true">
              ☰
            </span>
            <span>Menu</span>
          </summary>
          <nav aria-label="LessonCue navigation">
            {navigation.map((item) => (
              <button
                className={item.key === "signage" ? "active" : ""}
                key={item.key}
                onClick={() => {
                  navigationMenu.current?.removeAttribute("open");
                  onNavigate(item.key);
                }}
                type="button"
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </details>
      </header>

      <nav className="simple-signage-steps" aria-label="Signage setup">
        {(
          [
            ["layouts", "1", "Layouts", "Build the persistent frame"],
            ["playlists", "2", "Playlists", "Choose looping content"],
            ["signs", "3", "Signs & screens", "Combine and assign"],
          ] as const
        ).map(([value, number, label, detail]) => (
          <button
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
            key={value}
          >
            <b>{number}</b>
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </button>
        ))}
      </nav>

      <div className="simple-signage-workspace">
        <aside className="simple-signage-rail">
          {tab === "layouts" && (
            <>
              <RailHeading
                title="My layouts"
                action="New layout"
                onAction={() => chooseLayout(blankLayout("information"))}
              />
              <div className="new-layout-presets">
                <button onClick={() => chooseLayout(blankLayout("information"))}>
                  ▦ Information frame
                </button>
                <button onClick={() => chooseLayout(blankLayout("fullscreen"))}>
                  ▭ Full screen
                </button>
                <button onClick={() => chooseLayout(blankLayout("welcome"))}>
                  ◫ Welcome
                </button>
              </div>
              {layouts.map((item) => (
                <ResourceButton
                  key={item.id}
                  active={layoutDraft?.id === item.id}
                  title={item.name}
                  detail={`${item.zones.length} elements${item.isStarter ? " · starter" : ""}`}
                  onClick={() => chooseLayout(item)}
                />
              ))}
            </>
          )}
          {tab === "playlists" && (
            <>
              <RailHeading
                title="My playlists"
                action="New playlist"
                onAction={createPlaylist}
              />
              {playlists.map((item) => (
                <ResourceButton
                  key={item.id}
                  active={playlistDraft?.id === item.id}
                  title={item.name}
                  detail={`${item.items.length} item${item.items.length === 1 ? "" : "s"} · loops`}
                  onClick={() => {
                    setPlaylistDraft(structuredClone(item));
                    setSelectedItemId(item.items[0]?.id);
                  }}
                />
              ))}
              {!playlists.length && (
                <p className="simple-empty">Create your first playlist.</p>
              )}
            </>
          )}
          {tab === "signs" && (
            <>
              <RailHeading
                title="My signs"
                action="Create sign"
                onAction={createSign}
              />
              {signs.map((item) => (
                <ResourceButton
                  key={item.id}
                  active={signDraft?.id === item.id}
                  title={item.name}
                  detail={
                    item.screenNames.length
                      ? item.screenNames.join(", ")
                      : "No screens assigned"
                  }
                  onClick={() => setSignDraft(structuredClone(item))}
                />
              ))}
              {!signs.length && (
                <p className="simple-empty">
                  Combine a layout and playlists into a sign.
                </p>
              )}
            </>
          )}
        </aside>

        <main className="simple-signage-stage">
          <div className="stage-heading">
            <div>
              <small>LIVE PREVIEW · 16:9</small>
              <h1>
                {tab === "layouts"
                  ? layoutDraft?.name || "Choose a layout"
                  : tab === "playlists"
                    ? playlistDraft?.name || "Choose a playlist"
                    : signDraft?.name || "Create a sign"}
              </h1>
            </div>
            <span className="always-on">↻ Loops continuously</span>
          </div>
          {tab === "playlists" ? (
            <PlaylistTimeline
              playlist={playlistDraft}
              media={media}
              selectedItemId={selectedItemId}
              draggedMediaId={draggedMediaId}
              mediaDropIndex={mediaDropIndex}
              onSelect={setSelectedItemId}
              onMediaDragOver={mediaDragOver}
              onMediaDrop={dropMedia}
              onChange={(items) => {
                setPlaylistDraft((current) =>
                  current ? { ...current, items } : current,
                );
                markChanged();
              }}
            />
          ) : activeLayout ? (
            <LayoutPreview
              layout={activeLayout}
              media={media}
              playlists={playlists}
              assignments={activeAssignments}
              selectedZoneId={tab === "layouts" ? selectedZoneId : undefined}
              onSelect={tab === "layouts" ? setSelectedZoneId : undefined}
              onZoneChange={tab === "layouts" ? (zoneId, patch) => {
                setLayoutDraft((current) => current ? {
                  ...current,
                  zones: current.zones.map(item => item.id === zoneId ? { ...item, ...patch } : item),
                } : current);
                markChanged();
              } : undefined}
            />
          ) : (
            <div className="simple-preview-empty">
              <span>▭</span>
              <h2>Nothing selected</h2>
              <p>Choose an item from the left to begin.</p>
            </div>
          )}
          {tab === "playlists" && (
            <MediaTray
              media={readyMedia}
              audiencePolls={audiencePolls}
              draggedMediaId={draggedMediaId}
              onAdd={(item) => {
                if (Date.now() < suppressMediaClickUntil.current) return;
                addMedia(item);
              }}
              onPointerDown={beginMediaPointerDrag}
              onDragStart={beginMediaDrag}
              onDragEnd={finishMediaDrag}
              onAddWeb={addWebPage}
              onAddAudience={addAudiencePollToPlaylist}
            />
          )}
          {tab === "signs" && signDraft && (
            <div className="sign-summary">
              <div>
                <strong>{activeLayout?.name || "No layout"}</strong>
                <span>Persistent layout</span>
              </div>
              <b>+</b>
              <div>
                <strong>
                  {
                    Object.values(signDraft.playlistAssignments).filter(Boolean)
                      .length
                  }{" "}
                  playlists
                </strong>
                <span>Looping content</span>
              </div>
              <b>→</b>
              <div>
                <strong>{signDraft.screenIds.length} screens</strong>
                <span>One active sign each</span>
              </div>
            </div>
          )}
        </main>

        <aside className="simple-signage-inspector">
          {tab === "layouts" && layoutDraft && (
            <LayoutInspector
              layout={layoutDraft}
              media={media}
              playlists={playlists}
              audiencePolls={audiencePolls}
              selectedZoneId={selectedZoneId}
              onSelect={setSelectedZoneId}
              onChange={(next) => {
                setLayoutDraft(next);
                markChanged();
              }}
              onDelete={() => layoutDraft.id && deleteLayout(layoutDraft)}
            />
          )}
          {tab === "playlists" && playlistDraft && (
            <PlaylistInspector
              playlist={playlistDraft}
              selectedItemId={selectedItemId}
              onChange={(next) => {
                setPlaylistDraft(next);
                markChanged();
              }}
              onDelete={() =>
                playlistDraft.id && deletePlaylist(playlistDraft)
              }
            />
          )}
          {tab === "signs" && signDraft && (
            <SignInspector
              sign={signDraft}
              layouts={layouts}
              playlists={playlists}
              screens={screens.filter((item) => !item.revoked)}
              onChange={(next) => {
                setSignDraft(next);
                markChanged();
              }}
              onDelete={() => signDraft.id && deleteSign(signDraft)}
            />
          )}
          {((tab === "layouts" && !layoutDraft) ||
            (tab === "playlists" && !playlistDraft) ||
            (tab === "signs" && !signDraft)) && (
            <div className="simple-inspector-empty">
              <span>☝</span>
              <h3>Select something to edit</h3>
              <p>All options will appear here in one focused panel.</p>
            </div>
          )}
        </aside>
      </div>

      <footer className="simple-signage-savebar">
        <span className={saved === "Unsaved changes" ? "dirty" : ""}>
          {saved === "Unsaved changes" ? "●" : "✓"} {saved}
        </span>
        <div>
          <small>
            {tab === "layouts"
              ? "Layout changes apply to every Sign using it."
              : tab === "playlists"
                ? "The last item returns to the first automatically."
                : "Saving immediately updates assigned screens."}
          </small>
          <button
            className="simple-primary"
            disabled={
              busy ||
              (tab === "layouts" && !layoutDraft) ||
              (tab === "playlists" && !playlistDraft) ||
              (tab === "signs" && !signDraft)
            }
            onClick={
              tab === "layouts"
                ? saveLayout
                : tab === "playlists"
                  ? savePlaylist
                  : saveSign
            }
          >
            {busy ? "Saving…" : tab === "signs" ? "Save & update screens" : "Save changes"}{" "}
            →
          </button>
        </div>
      </footer>
    </div>
  );
}

function RailHeading({
  title,
  action,
  onAction,
}: {
  title: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="rail-heading">
      <h2>{title}</h2>
      <button onClick={onAction}>＋ {action}</button>
    </div>
  );
}

function ResourceButton({
  active,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`simple-resource ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <i>▭</i>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <b>›</b>
    </button>
  );
}

function LayoutPreview({
  layout,
  media,
  playlists,
  assignments,
  selectedZoneId,
  onSelect,
  onZoneChange,
}: {
  layout: Layout;
  media: Media[];
  playlists: Playlist[];
  assignments: Record<string, string>;
  selectedZoneId?: string;
  onSelect?: (id: string) => void;
  onZoneChange?: (id: string, patch: Partial<Zone>) => void;
}) {
  const [widgetCache, setWidgetCache] = useState<Record<string, SignageWidgetCache>>({});
  const [widgetErrors, setWidgetErrors] = useState<Record<string, string>>({});
  const widgetSignature = JSON.stringify(layout.zones.filter(item => item.type === "weather" || item.type === "calendar").map(item => ({
    id: item.id, type: item.type, title: item.title, sourceUrl: item.sourceUrl, weatherProvider: item.weatherProvider,
    weatherLocation: item.weatherLocation, weatherPostalCode: item.weatherPostalCode, weatherUnits: item.weatherUnits,
    weatherFields: item.weatherFields, weatherLatitude: item.weatherLatitude, weatherLongitude: item.weatherLongitude,
  })));
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      layout.zones.filter(item => item.type === "weather" || (item.type === "calendar" && item.sourceUrl)).forEach(item => {
        void request<SignageWidgetCache>("/elements/preview", {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify(item),
        }).then(cache => {
          setWidgetCache(current => ({ ...current, [item.id]: cache }));
          setWidgetErrors(current => {
            const next = { ...current };
            delete next[item.id];
            return next;
          });
        }).catch(error => setWidgetErrors(current => ({
          ...current,
          [item.id]: error instanceof Error ? error.message : "Unable to load live data.",
        })));
      });
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
    // The serialized data is the deliberate debounce boundary for remote preview calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetSignature]);

  const display: Signage = {
    id: layout.id,
    name: layout.name,
    mode: "layout",
    priority: 0,
    message: "",
    backgroundColor: layout.backgroundColor,
    textColor: "#ffffff",
    layoutPreset: layout.templateKey,
    zones: layout.zones.map(item => {
      const asset = media.find(value => value.id === item.mediaAssetId);
      const playlist = playlists.find(value => value.id === (assignments[item.id] || item.contentPlaylistId));
      return {
        ...item,
        streamUrl: item.sourceUrl,
        cached: widgetCache[item.id],
        media: asset ? mediaCue(asset) : undefined,
        contentPlaylist: playlist ? signagePlaylist(playlist, media) : undefined,
      } as unknown as SignageZone;
    }),
  };
  return (
    <>
      <div className="simple-display-frame">
        <div className="simple-layout-canvas">
          <ScreenSignageLayout signage={display} editor={{
            selectedZoneId,
            onSelect,
            onMediaTransform: onZoneChange ? (zoneId, patch) => onZoneChange(zoneId, patch) : undefined,
          }} />
        </div>
      </div>
      {Object.keys(widgetErrors).length > 0 && <div className="simple-widget-errors" role="status">
        {Object.entries(widgetErrors).map(([zoneId, message]) => <p key={zoneId}>{layout.zones.find(zone => zone.id === zoneId)?.title || "Live data"}: {message}</p>)}
      </div>}
    </>
  );
}

function mediaCue(asset: Media): CueItem {
  return {
    itemId: asset.id, mediaId: asset.id, type: asset.contentType.startsWith("video/") ? "video" : "image",
    title: asset.fileName, downloadUrl: asset.thumbnailUrl || asset.downloadUrl, contentType: asset.contentType,
    startMs: 0, volumePercent: 100, endBehavior: "advance", allowSkip: true, fadeInMs: 0, fadeOutMs: 0, cuePoints: [],
  };
}

function signagePlaylist(playlist: Playlist, media: Media[]): SignageContentPlaylist {
  return {
    id: playlist.id, name: playlist.name, playbackMode: "loop", synchronization: "independent", version: playlist.version,
    items: playlist.items.map(item => {
      const asset = media.find(value => value.id === item.mediaAssetId);
      return {
        id: item.id, kind: item.kind, title: item.title, durationSeconds: item.durationSeconds, transition: item.transition,
        sourceUrl: item.sourceUrl, volumePercent: item.volumePercent, muted: item.muted, fadeInMs: item.fadeInMs,
        fadeOutMs: item.fadeOutMs, fit: item.fit as "contain" | "cover" | "fill", media: asset ? mediaCue(asset) : undefined,
      };
    }),
  };
}

function LayoutInspector({
  layout,
  media,
  playlists,
  audiencePolls,
  selectedZoneId,
  onSelect,
  onChange,
  onDelete,
}: {
  layout: Layout;
  media: Media[];
  playlists: Playlist[];
  audiencePolls: AudienceSession[];
  selectedZoneId?: string;
  onSelect: (id: string) => void;
  onChange: (layout: Layout) => void;
  onDelete: () => void;
}) {
  const selected =
    layout.zones.find((item) => item.id === selectedZoneId) || layout.zones[0];
  const information =
    layout.templateKey === "information-frame" ||
    layout.zones.some((item) => item.id.startsWith("bottom-"));
  const bottomCount = layout.zones.filter((item) =>
    item.id.startsWith("bottom-"),
  ).length;
  const sideCount = layout.zones.filter((item) =>
    item.id.startsWith("side-"),
  ).length;
  const primary =
    layout.zones.find((item) => item.id === "side-1")?.backgroundColor ||
    "#063b27";
  const secondary =
    layout.zones.find((item) => item.id === "bottom-1")?.backgroundColor ||
    "#052c1e";

  function updateZone(patch: Partial<Zone>) {
    if (!selected) return;
    onChange({
      ...layout,
      zones: layout.zones.map((item) =>
        item.id === selected.id ? { ...item, ...patch } : item,
      ),
    });
  }

  function resizeFrame(nextBottom: number, nextSide: number, a = primary, b = secondary) {
    onChange({
      ...layout,
      templateKey: "information-frame",
      zones: informationFrame(nextBottom, nextSide, a, b, layout.zones),
    });
  }

  return (
    <div className="simple-inspector">
      <div className="inspector-tabs">
        <button className="active">Design</button>
      </div>
      <label>
        Layout name
        <input
          value={layout.name}
          onChange={(event) => onChange({ ...layout, name: event.target.value })}
        />
      </label>
      {information && (
        <section className="inspector-section">
          <h3>Information frame</h3>
          <p>
            The presentation stays 16:9 while the bottom and right frames remain
            visible.
          </p>
          <div className="two-control">
            <label>
              Bottom boxes
              <select
                value={bottomCount}
                onChange={(event) =>
                  resizeFrame(Number(event.target.value), sideCount)
                }
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Side boxes
              <select
                value={sideCount}
                onChange={(event) =>
                  resizeFrame(bottomCount, Number(event.target.value))
                }
              >
                {[1, 2, 3].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="two-control">
            <label>
              Frame color
              <input
                type="color"
                value={primary}
                onChange={(event) =>
                  resizeFrame(bottomCount, sideCount, event.target.value, secondary)
                }
              />
            </label>
            <label>
              Alternate color
              <input
                type="color"
                value={secondary}
                onChange={(event) =>
                  resizeFrame(bottomCount, sideCount, primary, event.target.value)
                }
              />
            </label>
          </div>
        </section>
      )}
      <section className="inspector-section">
        <h3>Elements</h3>
        <div className="element-list">
          {layout.zones.map((item) => (
            <button
              className={selected?.id === item.id ? "active" : ""}
              onClick={() => onSelect(item.id)}
              key={item.id}
            >
              <i>{item.type === "presentation" ? "▶" : "□"}</i>
              <span>
                <strong>{item.title || elementName(item.type)}</strong>
                <small>{elementName(item.type)}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
      {selected && (
        <section className="inspector-section element-editor">
          <h3>Edit selected element</h3>
          <label>
            Content type
            <select
              value={selected.type}
              onChange={(event) => {
                const fresh = zone(event.target.value, selected.id);
                updateZone({
                  ...fresh,
                  x: selected.x,
                  y: selected.y,
                  width: selected.width,
                  height: selected.height,
                  backgroundColor: selected.backgroundColor,
                });
              }}
            >
              <option value="presentation">Playlist area</option>
              <option value="text">Text message</option>
              <option value="media">Image or logo</option>
              <option value="qr">QR code</option>
              <option value="wifi">Wi-Fi QR code</option>
              <option value="weather">Weather</option>
              <option value="clock">Time & date</option>
              <option value="calendar">Calendar feed</option>
              <option value="audience">Audience poll</option>
              <option value="webpage">Web page</option>
            </select>
          </label>
          {!["presentation", "media", "weather", "audience"].includes(selected.type) && (
            <label>
              Title
              <input
                value={selected.title || ""}
                onChange={(event) => updateZone({ title: event.target.value })}
              />
            </label>
          )}
          {selected.type === "text" && (
            <RichTextEditor zone={selected} onChange={updateZone} />
          )}
          {selected.type === "presentation" && (
            <section className="stream-override-controls">
              <label>
                Playlist
                <select
                  value={selected.contentPlaylistId || ""}
                  onChange={(event) => updateZone({ contentPlaylistId: event.target.value || undefined })}
                >
                  <option value="">Choose a playlist</option>
                  {playlists.map((playlist) => (
                    <option value={playlist.id} key={playlist.id}>{playlist.name}</option>
                  ))}
                </select>
              </label>
              {!playlists.length && <p className="field-help">Create a playlist in step 2, then return here to select it.</p>}
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={Boolean(selected.streamOverrideWhenLive)}
                  onChange={(event) =>
                    updateZone({ streamOverrideWhenLive: event.target.checked })
                  }
                />
                <span>
                  <strong>RTMP override</strong>
                  <small>Play a live stream instead of this playlist while it is live.</small>
                </span>
              </label>
              {selected.streamOverrideWhenLive && (
                <div className="stream-override-fields">
                  <label>
                    RTMP stream address
                    <input
                      type="url"
                      value={selected.sourceUrl || ""}
                      placeholder="rtmp://example.org/live/stream-key"
                      onChange={(event) => updateZone({ sourceUrl: event.target.value })}
                    />
                  </label>
                  <fieldset className="date-time-boundary">
                    <legend>Start boundary</legend>
                    <label>
                      Date
                      <input
                        type="date"
                        value={localDatePart(selected.streamOverrideStartsAt)}
                        onChange={(event) =>
                          updateZone({
                            streamOverrideStartsAt: withLocalDateTimePart(selected.streamOverrideStartsAt, "date", event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Time
                      <input
                        type="time"
                        value={localTimePart(selected.streamOverrideStartsAt)}
                        onChange={(event) =>
                          updateZone({
                            streamOverrideStartsAt: withLocalDateTimePart(selected.streamOverrideStartsAt, "time", event.target.value),
                          })
                        }
                      />
                    </label>
                  </fieldset>
                  <fieldset className="date-time-boundary">
                    <legend>End boundary</legend>
                    <label>
                      Date
                      <input
                        type="date"
                        value={localDatePart(selected.streamOverrideEndsAt)}
                        onChange={(event) =>
                          updateZone({
                            streamOverrideEndsAt: withLocalDateTimePart(selected.streamOverrideEndsAt, "date", event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Time
                      <input
                        type="time"
                        value={localTimePart(selected.streamOverrideEndsAt)}
                        onChange={(event) =>
                          updateZone({
                            streamOverrideEndsAt: withLocalDateTimePart(selected.streamOverrideEndsAt, "time", event.target.value),
                          })
                        }
                      />
                    </label>
                  </fieldset>
                  <p className="field-help">
                    The playlist remains visible until the start time. The stream takes over only while it is playable, then the playlist returns when it drops or the end time arrives. Leave either time blank for no boundary.
                  </p>
                </div>
              )}
            </section>
          )}
          {selected.type === "media" && (
            <div className="element-specific-controls">
              <label>
                Image or logo
                <select
                  value={selected.mediaAssetId || ""}
                  onChange={(event) => updateZone({ mediaAssetId: event.target.value || undefined, content: "" })}
                >
                  <option value="">Choose media</option>
                  {media.filter((item) => item.contentType.startsWith("image/")).map((item) => (
                    <option value={item.id} key={item.id}>{item.fileName}</option>
                  ))}
                </select>
              </label>
              <label>Image size
                <div className="range-value"><input type="range" min="25" max="400" value={selected.mediaScale || 100} onChange={event => updateZone({ mediaScale: Number(event.target.value) })}/><span>{selected.mediaScale || 100}%</span></div>
              </label>
              <div className="two-control">
                <label>Horizontal position<input type="number" min="-150" max="150" value={Math.round(selected.mediaOffsetX || 0)} onChange={event => updateZone({ mediaOffsetX: Number(event.target.value) })}/></label>
                <label>Vertical position<input type="number" min="-150" max="150" value={Math.round(selected.mediaOffsetY || 0)} onChange={event => updateZone({ mediaOffsetY: Number(event.target.value) })}/></label>
              </div>
              <label className="check-line"><input type="checkbox" checked={Boolean(selected.mediaAllowOverflow)} onChange={event => updateZone({ mediaAllowOverflow: event.target.checked })}/> Allow the image to extend beyond its frame</label>
              <button type="button" className="secondary-button" onClick={() => updateZone({ mediaOffsetX: 0, mediaOffsetY: 0 })}>Recenter image</button>
              <p className="field-help">Drag the image directly in the live preview to position it.</p>
            </div>
          )}
          {selected.type === "qr" && (
            <>
              <label>
                Web address or QR content
                <input
                  value={selected.qrValue || ""}
                  onChange={(event) => updateZone({ qrValue: event.target.value })}
                />
              </label>
              <label>
                QR alignment
                <select
                  value={selected.qrPlacement || "left"}
                  onChange={(event) =>
                    updateZone({ qrPlacement: event.target.value })
                  }
                >
                  <option value="left">Left — text on right</option>
                  <option value="center">Centered</option>
                  <option value="right">Right — text on left</option>
                </select>
              </label>
              <label>QR size
                <div className="range-value"><input aria-label="QR size" type="range" min="20" max="90" value={selected.qrSizePercent || 42} onChange={event => updateZone({ qrSizePercent: Number(event.target.value) })}/><span>{selected.qrSizePercent || 42}%</span></div>
              </label>
              <QrLabelControls selected={selected} updateZone={updateZone} />
            </>
          )}
          {selected.type === "wifi" && (
            <div className="element-specific-controls">
              <label>Network name (SSID)<input value={selected.wifiNetworkName || ""} onChange={event => { const patch = { wifiNetworkName: event.target.value }; updateZone({ ...patch, qrValue: wifiQrValue({ ...selected, ...patch }) }); }}/></label>
              <label>Password<input type="password" value={selected.wifiPassword || ""} onChange={event => { const patch = { wifiPassword: event.target.value }; updateZone({ ...patch, qrValue: wifiQrValue({ ...selected, ...patch }) }); }}/></label>
              <div className="two-control">
                <label>Security<select value={selected.wifiSecurity || "WPA"} onChange={event => { const patch = { wifiSecurity: event.target.value }; updateZone({ ...patch, qrValue: wifiQrValue({ ...selected, ...patch }) }); }}><option value="WPA">WPA/WPA2/WPA3</option><option value="WEP">WEP</option><option value="none">No password</option></select></label>
                <label className="check-line"><input type="checkbox" checked={Boolean(selected.wifiHidden)} onChange={event => { const patch = { wifiHidden: event.target.checked }; updateZone({ ...patch, qrValue: wifiQrValue({ ...selected, ...patch }) }); }}/> Hidden network</label>
              </div>
              <label>QR alignment<select value={selected.qrPlacement || "left"} onChange={event => updateZone({ qrPlacement: event.target.value })}><option value="left">Left — text on right</option><option value="center">Centered</option><option value="right">Right — text on left</option></select></label>
              <label>QR size<div className="range-value"><input aria-label="Wi-Fi QR size" type="range" min="20" max="90" value={selected.qrSizePercent || 42} onChange={event => updateZone({ qrSizePercent: Number(event.target.value) })}/><span>{selected.qrSizePercent || 42}%</span></div></label>
              <QrLabelControls selected={selected} updateZone={updateZone} />
              <p className="field-help">The QR code updates instantly. Scanning it opens the device’s Wi-Fi connection prompt.</p>
            </div>
          )}
          {selected.type === "audience" && (
            <div className="element-specific-controls audience-poll-controls">
              <label>
                Audience poll
                <select
                  value={selected.audienceSessionId || ""}
                  onChange={(event) => {
                    const poll = audiencePolls.find(item => item.id === event.target.value);
                    updateZone({
                      audienceSessionId: poll?.id,
                      audienceCode: poll?.code,
                      title: "",
                    });
                  }}
                >
                  <option value="">Choose an audience poll</option>
                  {audiencePolls.map(poll => (
                    <option value={poll.id} key={poll.id}>
                      {poll.title} · {poll.status} · {poll.code}
                    </option>
                  ))}
                </select>
              </label>
              {!audiencePolls.length && <p className="field-help">Create a poll in Audience, then return here to add it to the sign.</p>}
              <label>
                Custom heading (optional)
                <input value={selected.title || ""} placeholder="Uses the poll title" onChange={event => updateZone({ title: event.target.value })}/>
              </label>
              <label>
                Voting instructions
                <textarea rows={2} value={selected.content || ""} onChange={event => updateZone({ content: event.target.value })}/>
              </label>
              <div className="two-control">
                <label>QR alignment<select value={selected.qrPlacement || "left"} onChange={event => updateZone({ qrPlacement: event.target.value })}><option value="left">Left — poll on right</option><option value="center">Centered above poll</option><option value="right">Right — poll on left</option></select></label>
                <label>QR size<div className="range-value"><input aria-label="Audience poll QR size" type="range" min="20" max="90" value={selected.qrSizePercent || 42} onChange={event => updateZone({ qrSizePercent: Number(event.target.value) })}/><span>{selected.qrSizePercent || 42}%</span></div></label>
              </div>
              <label className="check-line"><input type="checkbox" checked={selected.audienceShowResults !== false} onChange={event => updateZone({ audienceShowResults: event.target.checked })}/> Show live results when the poll permits them</label>
              {selected.audienceShowResults !== false && (
                <label>
                  Result timing
                  <select
                    aria-label="Audience result timing"
                    value={selected.audienceResultDelaySeconds || 0}
                    onChange={event => updateZone({ audienceResultDelaySeconds: Number(event.target.value) })}
                  >
                    <option value="0">Real time</option>
                    <option value="15">15-second delay</option>
                    <option value="30">30-second delay</option>
                    <option value="60">1-minute delay</option>
                    <option value="120">2-minute delay</option>
                    <option value="300">5-minute delay</option>
                  </select>
                </label>
              )}
              {selected.audienceSessionId && (() => {
                const poll = audiencePolls.find(item => item.id === selected.audienceSessionId);
                return poll ? <p className={`audience-poll-summary ${poll.status}`}><strong>{poll.status === "open" ? "Voting open" : poll.status === "closed" ? "Voting closed" : "Draft — not open"}</strong><span>{poll.participantCount} response{poll.participantCount === 1 ? "" : "s"} · code {poll.code}</span></p> : null;
              })()}
              <p className="field-help">The QR opens the real anonymous response page. Open, close, reset, and edit the poll from Audience.</p>
            </div>
          )}
          {selected.type === "weather" && (
            <div className="element-specific-controls">
              <label>Weather source<select value={selected.weatherProvider || "open-meteo"} onChange={event => updateZone({ weatherProvider: event.target.value, sourceUrl: event.target.value === "custom" ? selected.sourceUrl : undefined })}><option value="open-meteo">Open-Meteo — worldwide, no key</option><option value="nws">National Weather Service — United States</option><option value="custom">Custom JSON source</option></select></label>
              {selected.weatherProvider === "custom" && <label>Custom weather JSON address<input type="url" value={selected.sourceUrl || ""} placeholder="https://weather.example.org/current.json" onChange={event => updateZone({ sourceUrl: event.target.value })}/></label>}
              <label>
                Display title
                <input value={selected.title || ""} placeholder="Rochester, NY" onChange={event => updateZone({ title: event.target.value })}/>
              </label>
              <label>
                ZIP/postal code
                <input
                  value={selected.weatherPostalCode || ""}
                  placeholder="98225"
                  onChange={(event) =>
                    updateZone({ weatherPostalCode: event.target.value })
                  }
                />
              </label>
              <div className="two-control">
                <label>Units<select value={selected.weatherUnits || "fahrenheit"} onChange={event => updateZone({ weatherUnits: event.target.value })}><option value="fahrenheit">Fahrenheit</option><option value="celsius">Celsius</option></select></label>
                <label>Icon style<select value={selected.weatherIconStyle || "color"} onChange={event => updateZone({ weatherIconStyle: event.target.value })}><option value="color">Color icons</option><option value="white">White icons</option></select></label>
              </div>
              <label>Layout<select value={selected.weatherLayout || "icon-top"} onChange={event => updateZone({ weatherLayout: event.target.value })}><option value="icon-top">Icon above reading</option><option value="icon-left">Large icon on left</option><option value="icon-right">Large icon on right</option><option value="compact">Compact horizontal</option></select></label>
              <div className="two-control">
                <label>Icon size<input type="number" min="16" max="220" value={selected.weatherIconSize || 84} onChange={event => updateZone({ weatherIconSize: Number(event.target.value) })}/></label>
                <label>Title size<input type="number" min="8" max="120" value={selected.weatherTitleSize || 28} onChange={event => updateZone({ weatherTitleSize: Number(event.target.value) })}/></label>
              </div>
              <div className="two-control">
                <label>Temperature size<input type="number" min="12" max="220" value={selected.weatherTemperatureSize || 58} onChange={event => updateZone({ weatherTemperatureSize: Number(event.target.value) })}/></label>
                <label>Details size<input type="number" min="8" max="100" value={selected.weatherDetailsSize || 22} onChange={event => updateZone({ weatherDetailsSize: Number(event.target.value) })}/></label>
              </div>
              <fieldset className="field-check-grid"><legend>Weather details</legend>
                {["icon","conditions","temperature","forecast","high","low","humidity","wind","precipitation","sunrise","sunset"].map(field => {
                  const active = new Set((selected.weatherFields || "").split(","));
                  return <label key={field}><input type="checkbox" checked={active.has(field)} onChange={event => { if (event.target.checked) active.add(field); else active.delete(field); updateZone({ weatherFields: [...active].join(",") }); }}/>{field[0].toUpperCase() + field.slice(1)}</label>;
                })}
              </fieldset>
              <p className="field-help">Open-Meteo requires no key. NWS is available for U.S. locations. Custom JSON sources must be approved in Settings. The preview refreshes after changes.</p>
            </div>
          )}
          {selected.type === "clock" && (
            <div className="element-specific-controls">
              <div className="two-control">
                <label>Show<select value={selected.clockDisplay || "both"} onChange={event => updateZone({ clockDisplay: event.target.value })}><option value="both">Time and date</option><option value="time">Time only</option><option value="date">Date only</option></select></label>
                <label>Order<select value={selected.clockOrder || "time-date"} onChange={event => updateZone({ clockOrder: event.target.value })}><option value="time-date">Time above date</option><option value="date-time">Date above time</option><option value="inline">Same line</option></select></label>
              </div>
              <div className="two-control">
                <label>Time format<select value={selected.clockTimeFormat || "12h"} onChange={event => updateZone({ clockTimeFormat: event.target.value })}><option value="12h">12-hour</option><option value="12h-seconds">12-hour with seconds</option><option value="24h">24-hour</option><option value="24h-seconds">24-hour with seconds</option></select></label>
                <label>Date format<select value={selected.clockDateFormat || "long"} onChange={event => updateZone({ clockDateFormat: event.target.value })}><option value="long">Long</option><option value="medium">Medium</option><option value="short">Short</option><option value="numeric">Numeric</option></select></label>
              </div>
              <div className="field-check-grid">
                <label><input type="checkbox" checked={selected.clockShowPeriod !== false} onChange={event => updateZone({ clockShowPeriod: event.target.checked })}/> AM/PM</label>
                <label><input type="checkbox" checked={selected.clockShowWeekday !== false} onChange={event => updateZone({ clockShowWeekday: event.target.checked })}/> Day of week</label>
                <label><input type="checkbox" checked={selected.clockShowYear !== false} onChange={event => updateZone({ clockShowYear: event.target.checked })}/> Year</label>
              </div>
              <div className="two-control">
                <label>Time size<input type="number" min="8" max="200" value={selected.clockTimeFontSize || 54} onChange={event => updateZone({ clockTimeFontSize: Number(event.target.value) })}/></label>
                <label>Date size<input type="number" min="8" max="200" value={selected.clockDateFontSize || 25} onChange={event => updateZone({ clockDateFontSize: Number(event.target.value) })}/></label>
              </div>
            </div>
          )}
          {selected.type === "calendar" && (
            <div className="element-specific-controls">
              <label>ICS calendar address<input type="url" value={selected.sourceUrl || ""} placeholder="https://example.org/calendar.ics" onChange={event => updateZone({ sourceUrl: event.target.value })}/></label>
              <label>Upcoming events<select value={selected.calendarMaxItems || 0} onChange={event => updateZone({ calendarMaxItems: Number(event.target.value) })}><option value="0">Fill the available space</option>{[1,2,3,4,5,6,8,10,12,15,20].map(value => <option value={value} key={value}>{value} events</option>)}</select></label>
              <fieldset className="field-check-grid"><legend>Show for each event</legend>
                {["date","time","title","description","location"].map(field => {
                  const active = new Set((selected.calendarFields || "date,time,title").split(","));
                  return <label key={field}><input type="checkbox" checked={active.has(field)} onChange={event => { if (event.target.checked) active.add(field); else active.delete(field); updateZone({ calendarFields: [...active].join(",") }); }}/>{field[0].toUpperCase() + field.slice(1)}</label>;
                })}
              </fieldset>
              <p className="field-help">The editor loads the feed into this live preview. External sources must be approved in Settings → Signage sources.</p>
            </div>
          )}
          {selected.type === "webpage" && (
            <label>
              Web page address
              <input
                value={selected.sourceUrl || ""}
                placeholder="https://"
                onChange={(event) => updateZone({ sourceUrl: event.target.value })}
              />
            </label>
          )}
          <div className="two-control">
            <label>
              Background
              <input
                type="color"
                value={selected.backgroundColor}
                onChange={(event) =>
                  updateZone({ backgroundColor: event.target.value })
                }
              />
            </label>
            <label>
              Text
              <input
                type="color"
                value={selected.textColor}
                onChange={(event) =>
                  updateZone({ textColor: event.target.value })
                }
              />
            </label>
          </div>
          <div className="two-control">
            <label>
              Font size
              <input
                type="number"
                min="12"
                max="160"
                value={selected.fontSize || 34}
                onChange={(event) =>
                  updateZone({ fontSize: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Alignment
              <select
                value={selected.textAlign || "left"}
                onChange={(event) =>
                  updateZone({ textAlign: event.target.value })
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
          <div className="two-control">
            <label>
              Inner padding
              <div className="range-value">
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={selected.contentPadding ?? 6}
                  onChange={(event) =>
                    updateZone({ contentPadding: Number(event.target.value) })
                  }
                />
                <span>{selected.contentPadding ?? 6}%</span>
              </div>
            </label>
            <label>
              Content size
              <div className="range-value">
                <input
                  type="range"
                  min="25"
                  max="100"
                  step="5"
                  value={selected.contentScale ?? 100}
                  onChange={(event) =>
                    updateZone({ contentScale: Number(event.target.value) })
                  }
                />
                <span>{selected.contentScale ?? 100}%</span>
              </div>
            </label>
          </div>
          <div className="two-control">
            <label>
              Vertical position
              <select
                value={selected.verticalAlign || "middle"}
                onChange={(event) =>
                  updateZone({ verticalAlign: event.target.value })
                }
              >
                <option value="top">Top</option>
                <option value="middle">Middle</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
            <label>
              Line spacing
              <select
                value={selected.lineHeightPercent || 120}
                onChange={(event) =>
                  updateZone({ lineHeightPercent: Number(event.target.value) })
                }
              >
                <option value="90">Tight</option>
                <option value="110">Compact</option>
                <option value="120">Normal</option>
                <option value="150">Relaxed</option>
              </select>
            </label>
          </div>
          <div className="two-control">
            <label>
              Text weight
              <select
                value={selected.fontWeight || 600}
                onChange={(event) =>
                  updateZone({ fontWeight: Number(event.target.value) })
                }
              >
                <option value="400">Regular</option>
                <option value="600">Semibold</option>
                <option value="700">Bold</option>
                <option value="800">Extra bold</option>
              </select>
            </label>
            <label>
              Corner rounding
              <input
                type="number"
                min="0"
                max="50"
                value={selected.cornerRadius || 0}
                onChange={(event) =>
                  updateZone({ cornerRadius: Number(event.target.value) })
                }
              />
            </label>
          </div>
          {(selected.type === "media" ||
            selected.type === "presentation") && (
            <label>
              Media fit
              <select
                value={selected.fit || "contain"}
                onChange={(event) => updateZone({ fit: event.target.value })}
              >
                <option value="contain">Fit inside — show everything</option>
                <option value="cover">Fill box — crop edges</option>
                <option value="fill">Stretch to box</option>
              </select>
            </label>
          )}
        </section>
      )}
      {layout.id && !layout.isStarter && (
        <button className="simple-danger" onClick={onDelete}>
          Delete layout
        </button>
      )}
    </div>
  );
}

type RichRun = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; fontFamily?: string; fontSize?: number };

function readRichRuns(item: Zone): RichRun[] {
  try {
    const parsed = JSON.parse(item.richTextJson || "");
    if (Array.isArray(parsed)) return parsed.filter(run => typeof run?.text === "string").slice(0, 200);
  } catch { /* Plain content is converted to runs below. */ }
  return (item.content || "").split(/(\s+)/).filter(Boolean).map(text => ({ text }));
}

function RichTextEditor({ zone: item, onChange }: { zone: Zone; onChange: (patch: Partial<Zone>) => void }) {
  const [selectedRun, setSelectedRun] = useState(0);
  const runs = readRichRuns(item);
  const selected = runs[selectedRun] || runs[0] || { text: "" };
  function save(next: RichRun[]) {
    onChange({ content: next.map(run => run.text).join(""), richTextJson: JSON.stringify(next) });
  }
  function format(patch: Partial<RichRun>) {
    const next = runs.length ? runs.map(run => ({ ...run })) : [{ text: item.content || "Message" }];
    next[Math.min(selectedRun, next.length - 1)] = { ...next[Math.min(selectedRun, next.length - 1)], ...patch };
    save(next);
  }
  return <div className="rich-text-editor">
    <label>Message<textarea rows={4} value={item.content || ""} onChange={event => {
      const next = event.target.value.split(/(\s+)/).filter(Boolean).map((text, index) => ({ ...(runs[index] || {}), text }));
      save(next);
    }}/></label>
    <p className="field-help">Select a word, then style it. The live preview shows the finished text.</p>
    <div className="rich-run-picker">
      {runs.map((run, index) => /\s/.test(run.text) ? <span key={index}> </span> : <button type="button" className={selectedRun === index ? "active" : ""} onClick={() => setSelectedRun(index)} key={index}>{run.text}</button>)}
    </div>
    <div className="rich-toolbar">
      <button type="button" className={selected.bold ? "active" : ""} onClick={() => format({ bold: !selected.bold })}><b>B</b></button>
      <button type="button" className={selected.italic ? "active" : ""} onClick={() => format({ italic: !selected.italic })}><i>I</i></button>
      <button type="button" className={selected.underline ? "active" : ""} onClick={() => format({ underline: !selected.underline })}><u>U</u></button>
      <input aria-label="Selected word color" type="color" value={selected.color || item.textColor || "#ffffff"} onChange={event => format({ color: event.target.value })}/>
      <select aria-label="Selected word font" value={selected.fontFamily || item.fontFamily || "system-ui"} onChange={event => format({ fontFamily: event.target.value })}>
        <option value="system-ui">Sans serif</option><option value="Georgia, serif">Serif</option><option value="'Arial Black', sans-serif">Heavy</option><option value="'Courier New', monospace">Monospace</option>
      </select>
      <input aria-label="Selected word size" type="number" min="8" max="200" value={selected.fontSize || item.fontSize || 34} onChange={event => format({ fontSize: Number(event.target.value) })}/>
    </div>
  </div>;
}

function QrLabelControls({ selected, updateZone }: { selected: Zone; updateZone: (patch: Partial<Zone>) => void }) {
  return <fieldset className="qr-label-controls"><legend>Optional labels</legend>
    <label>Above<textarea rows={2} value={selected.qrLabelTop || ""} onChange={event => updateZone({ qrLabelTop: event.target.value })}/></label>
    <label>Below<textarea rows={2} value={selected.qrLabelBottom || ""} onChange={event => updateZone({ qrLabelBottom: event.target.value })}/></label>
    <label>Left<textarea rows={2} value={selected.qrLabelLeft || ""} onChange={event => updateZone({ qrLabelLeft: event.target.value })}/></label>
    <label>Right<textarea rows={2} value={selected.qrLabelRight || ""} onChange={event => updateZone({ qrLabelRight: event.target.value })}/></label>
    <p className="field-help">Press Enter to control line breaks. Resize the QR to give side text more or less room.</p>
  </fieldset>;
}

type SignageCueIconName = "notes" | "options" | "close";

function SignageCueIcon({ name }: { name: SignageCueIconName }) {
  const paths: Record<SignageCueIconName, ReactNode> = {
    notes: (
      <>
        <path d="M5 5.5h14v10H9l-4 3v-13Z" />
        <path d="M8.5 9h7M8.5 12h5" />
      </>
    ),
    options: (
      <>
        <path d="M4 7h10M17 7h3M4 17h3M10 17h10M14 4v6M7 14v6" />
      </>
    ),
    close: <path d="m7 7 10 10M17 7 7 17" />,
  };
  return (
    <svg className="signage-cue-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function SignageTimelineCard({
  item,
  asset,
  index,
  total,
  selected,
  dropEdge,
  onSelect,
  onMove,
  onUpdate,
  onRemove,
  onMediaDragOver,
  onMediaDrop,
}: {
  item: PlaylistItem;
  asset?: Media;
  index: number;
  total: number;
  selected: boolean;
  dropEdge?: "before" | "after";
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onUpdate: (patch: Partial<PlaylistItem>) => void;
  onRemove: () => void;
  onMediaDragOver: (event: ReactDragEvent<HTMLElement>, index: number) => void;
  onMediaDrop: (event: ReactDragEvent<HTMLElement>, index: number) => void;
}) {
  const title = item.title || asset?.fileName || "Untitled";
  const [openPanel, setOpenPanel] = useState<"notes" | "settings">();
  const [panelPosition, setPanelPosition] = useState({ top: 16, left: 16 });
  const panelRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openPanel) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || footerRef.current?.contains(target))
        return;
      setOpenPanel(undefined);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpenPanel(undefined);
    };
    const resize = () => setOpenPanel(undefined);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", resize);
    };
  }, [openPanel]);

  function togglePanel(
    panel: "notes" | "settings",
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    event.stopPropagation();
    onSelect();
    if (openPanel === panel) {
      setOpenPanel(undefined);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const width = Math.min(panel === "settings" ? 430 : 340, window.innerWidth - 24);
    const height = panel === "settings" ? Math.min(560, window.innerHeight * 0.72) : 250;
    const below = bounds.bottom + 8;
    setPanelPosition({
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
      top:
        below + height <= window.innerHeight - 12
          ? below
          : Math.max(12, bounds.top - height - 8),
    });
    setOpenPanel(panel);
  }

  function dropIndex(event: ReactDragEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left + bounds.width / 2 ? index : index + 1;
  }

  return (
    <article
      className={`signage-timeline-card ${selected ? "selected" : ""} ${dropEdge ? `drop-${dropEdge}` : ""}`}
      data-signage-index={index}
      role="listitem"
      aria-current={selected ? "true" : undefined}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onDragOver={(event) => onMediaDragOver(event, dropIndex(event))}
      onDrop={(event) => onMediaDrop(event, dropIndex(event))}
    >
      <div className="signage-card-overlay">
        <button
          type="button"
          disabled={!index}
          aria-label={`Move ${title} earlier`}
          onClick={(event) => {
            event.stopPropagation();
            onMove(-1);
          }}
        >
          ←
        </button>
        <span>{index + 1}</span>
        <button
          type="button"
          disabled={index === total - 1}
          aria-label={`Move ${title} later`}
          onClick={(event) => {
            event.stopPropagation();
            onMove(1);
          }}
        >
          →
        </button>
      </div>
      <button
        type="button"
        className="signage-card-remove"
        aria-label={`Remove ${title}`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
      <div className="timeline-thumb signage-card-thumb">
        {asset?.thumbnailUrl ? (
          <img src={asset.thumbnailUrl} alt="" />
        ) : (
          <span>{item.kind === "web" ? "⌘" : asset?.contentType.startsWith("audio/") ? "♫" : "▶"}</span>
        )}
      </div>
      <strong className="signage-card-title" title={title}>{title}</strong>
      <div className="signage-card-footer" ref={footerRef} role="group" aria-label={`Options for ${title}`}>
        <button
          type="button"
          className={openPanel === "notes" ? "active" : ""}
          aria-label={`Notes for ${title}`}
          aria-expanded={openPanel === "notes"}
          title="Production notes"
          onClick={(event) => togglePanel("notes", event)}
        >
          <SignageCueIcon name="notes" />
          {item.notes && <i aria-hidden="true" />}
        </button>
        <span aria-label={`Duration ${signageDurationLabel(item.durationSeconds)}`}>
          {signageDurationLabel(item.durationSeconds)}
        </span>
        <button
          type="button"
          className={openPanel === "settings" ? "active" : ""}
          aria-label={`Settings for ${title}`}
          aria-expanded={openPanel === "settings"}
          title="Item settings"
          onClick={(event) => togglePanel("settings", event)}
        >
          <SignageCueIcon name="options" />
        </button>
      </div>
      {openPanel === "notes" && (
        <section
          className="signage-cue-popover signage-notes-popover"
          ref={panelRef}
          style={panelPosition}
          role="dialog"
          aria-label={`Notes for ${title}`}
          onClick={(event) => event.stopPropagation()}
        >
          <header>
            <span><SignageCueIcon name="notes" /><strong>Production notes</strong></span>
            <button type="button" aria-label="Close notes" onClick={() => setOpenPanel(undefined)}><SignageCueIcon name="close" /></button>
          </header>
          <label>
            Notes for staff
            <textarea
              rows={5}
              maxLength={2000}
              defaultValue={item.notes || ""}
              placeholder="Setup, messaging, or handoff details"
              onBlur={(event) => onUpdate({ notes: event.target.value })}
            />
          </label>
          <small>Saved with the playlist; never displayed on the sign.</small>
        </section>
      )}
      {openPanel === "settings" && (
        <section
          className="signage-cue-popover signage-settings-popover"
          ref={panelRef}
          style={panelPosition}
          role="dialog"
          aria-label={`Settings for ${title}`}
          onClick={(event) => event.stopPropagation()}
        >
          <header>
            <span><SignageCueIcon name="options" /><strong>Item settings</strong></span>
            <button type="button" aria-label="Close settings" onClick={() => setOpenPanel(undefined)}><SignageCueIcon name="close" /></button>
          </header>
          <label>
            Title
            <input value={item.title || ""} onChange={(event) => onUpdate({ title: event.target.value })} />
          </label>
          <div className="signage-settings-grid">
            <label>
              Time on screen
              <span className="suffix-input">
                <input
                  type="number"
                  min="1"
                  max="86400"
                  value={item.durationSeconds}
                  onChange={(event) => onUpdate({ durationSeconds: Math.max(1, Number(event.target.value) || 1) })}
                />
                <span>sec</span>
              </span>
            </label>
            <label>
              Transition
              <select value={item.transition} onChange={(event) => onUpdate({ transition: event.target.value })}>
                <option value="cut">Cut</option>
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="zoom">Zoom</option>
              </select>
            </label>
            <label>
              Fade in
              <span className="suffix-input">
                <input type="number" min="0" max="30" step=".1" value={item.fadeInMs / 1000}
                  onChange={(event) => onUpdate({ fadeInMs: Math.round(Math.max(0, Number(event.target.value)) * 1000) })} />
                <span>sec</span>
              </span>
            </label>
            <label>
              Fade out
              <span className="suffix-input">
                <input type="number" min="0" max="30" step=".1" value={item.fadeOutMs / 1000}
                  onChange={(event) => onUpdate({ fadeOutMs: Math.round(Math.max(0, Number(event.target.value)) * 1000) })} />
                <span>sec</span>
              </span>
            </label>
            <label>
              Volume
              <span className="suffix-input">
                <input type="number" min="0" max="100" value={item.muted ? 0 : item.volumePercent}
                  onChange={(event) => {
                    const volume = Math.max(0, Math.min(100, Number(event.target.value) || 0));
                    onUpdate({ volumePercent: volume, muted: volume === 0 });
                  }} />
                <span>%</span>
              </span>
            </label>
            <label>
              Picture fit
              <select value={item.fit} onChange={(event) => onUpdate({ fit: event.target.value })}>
                <option value="contain">Fit entire item</option>
                <option value="cover">Fill area and crop</option>
                <option value="fill">Stretch to fill</option>
              </select>
            </label>
          </div>
        </section>
      )}
    </article>
  );
}

function PlaylistTimeline({
  playlist,
  media,
  selectedItemId,
  draggedMediaId,
  mediaDropIndex,
  onSelect,
  onChange,
  onMediaDragOver,
  onMediaDrop,
}: {
  playlist?: Playlist;
  media: Media[];
  selectedItemId?: string;
  draggedMediaId?: string;
  mediaDropIndex?: number;
  onSelect: (id: string) => void;
  onChange: (items: PlaylistItem[]) => void;
  onMediaDragOver: (event: ReactDragEvent<HTMLElement>, index: number) => void;
  onMediaDrop: (event: ReactDragEvent<HTMLElement>, index: number) => void;
}) {
  if (!playlist)
    return (
      <div className="simple-preview-empty">
        <span>↻</span>
        <h2>Choose a playlist</h2>
      </div>
    );
  const patchItem = (itemId: string, patch: Partial<PlaylistItem>) =>
    onChange(
      playlist.items.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    );
  return (
    <section
      className={`playlist-timeline ${!playlist.items.length ? "is-empty" : ""} ${draggedMediaId ? "is-library-dragging" : ""}`}
      aria-label="Horizontal signage playlist"
      onDragOver={(event) => {
        if (!(event.target as HTMLElement).closest(".signage-timeline-card"))
          onMediaDragOver(event, playlist.items.length);
      }}
      onDrop={(event) => onMediaDrop(event, mediaDropIndex ?? playlist.items.length)}
    >
      <div className="timeline-loop-arrow">LOOPS BACK TO START ↻</div>
      {playlist.items.length ? (
        <div className="playlist-timeline-track" role="list" aria-label="Signage playlist items">
          {playlist.items.map((item, index) => {
            const asset = media.find((value) => value.id === item.mediaAssetId);
            const moveItem = (direction: -1 | 1) => {
              const nextIndex = index + direction;
              if (nextIndex < 0 || nextIndex >= playlist.items.length) return;
              const next = [...playlist.items];
              [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
              onChange(next);
            };
            return (
              <SignageTimelineCard
                key={item.id}
                item={item}
                asset={asset}
                index={index}
                total={playlist.items.length}
                selected={selectedItemId === item.id}
                dropEdge={
                  mediaDropIndex === index
                    ? "before"
                    : index === playlist.items.length - 1 && mediaDropIndex === index + 1
                      ? "after"
                      : undefined
                }
                onSelect={() => onSelect(item.id)}
                onMove={moveItem}
                onUpdate={(patch) => patchItem(item.id, patch)}
                onRemove={() => onChange(playlist.items.filter((entry) => entry.id !== item.id))}
                onMediaDragOver={onMediaDragOver}
                onMediaDrop={onMediaDrop}
              />
            );
          })}
        </div>
      ) : (
        <div
          className={`playlist-empty-drop-target ${draggedMediaId ? "is-library-dragging" : ""} ${mediaDropIndex === 0 ? "is-drop-ready" : ""}`}
          onDragOver={(event) => onMediaDragOver(event, 0)}
          onDrop={(event) => onMediaDrop(event, 0)}
        >
          <div className="playlist-empty-slots" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => <i key={index} />)}
          </div>
          <span>＋</span>
          <h2>Drop ready media into this loop</h2>
          <p>Or click an image, video, presentation, audio file, or webpage below.</p>
        </div>
      )}
    </section>
  );
}

function MediaTray({
  media,
  audiencePolls,
  draggedMediaId,
  onAdd,
  onPointerDown,
  onDragStart,
  onDragEnd,
  onAddWeb,
  onAddAudience,
}: {
  media: Media[];
  audiencePolls: AudienceSession[];
  draggedMediaId?: string;
  onAdd: (media: Media) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, media: Media) => void;
  onDragStart: (event: ReactDragEvent<HTMLButtonElement>, media: Media) => void;
  onDragEnd: () => void;
  onAddWeb: () => void;
  onAddAudience: (
    poll: AudienceSession,
    showResults: boolean,
    resultDelaySeconds: number,
  ) => void;
}) {
  const [audienceResultMode, setAudienceResultMode] = useState("0");
  const showAudienceResults = audienceResultMode !== "off";
  const audienceResultDelaySeconds = showAudienceResults
    ? Number(audienceResultMode)
    : 0;
  return (
    <section className="signage-media-tray">
      <header>
        <div>
          <strong>Ready media</strong>
          <small>Drag a file onto any timeline position, or click it to append.</small>
        </div>
        <div className="signage-media-tray-actions">
          <select
            aria-label="Audience poll to add"
            defaultValue=""
            disabled={!audiencePolls.length}
            title={
              audiencePolls.length
                ? "Add an existing Audience poll"
                : "Create a poll in Audience first"
            }
            onChange={(event) => {
              const poll = audiencePolls.find(
                (item) => item.id === event.currentTarget.value,
              );
              if (poll)
                onAddAudience(
                  poll,
                  showAudienceResults,
                  audienceResultDelaySeconds,
                );
              event.currentTarget.value = "";
            }}
          >
            <option value="">
              {audiencePolls.length
                ? "＋ Audience poll"
                : "No audience polls yet"}
            </option>
            {audiencePolls.map((poll) => (
              <option key={poll.id} value={poll.id}>
                {poll.title} · {poll.status}
              </option>
            ))}
          </select>
          <select
            aria-label="Playlist audience result timing"
            value={audienceResultMode}
            onChange={(event) => setAudienceResultMode(event.target.value)}
          >
            <option value="off">Hide results</option>
            <option value="0">Results: real time</option>
            <option value="15">Results: 15s delay</option>
            <option value="30">Results: 30s delay</option>
            <option value="60">Results: 1m delay</option>
            <option value="120">Results: 2m delay</option>
            <option value="300">Results: 5m delay</option>
          </select>
          <button onClick={onAddWeb}>＋ Web page</button>
        </div>
      </header>
      <div>
        {media.slice(0, 20).map((item) => (
          <button
            className={draggedMediaId === item.id ? "is-dragging" : ""}
            onClick={() => onAdd(item)}
            onPointerDown={(event) => onPointerDown(event, item)}
            onDragStart={(event) => onDragStart(event, item)}
            onDragEnd={onDragEnd}
            draggable
            aria-label={`Add or drag ${item.fileName} to the signage playlist`}
            key={item.id}
          >
            <span className="signage-library-thumb">
              {item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt="" />
              ) : (
                <b>{item.contentType.startsWith("audio/") ? "♫" : "▶"}</b>
              )}
            </span>
            <strong>{item.fileName}</strong>
            <small>{item.contentType.split("/")[0]}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function PlaylistInspector({
  playlist,
  selectedItemId,
  onChange,
  onDelete,
}: {
  playlist: Playlist;
  selectedItemId?: string;
  onChange: (playlist: Playlist) => void;
  onDelete: () => void;
}) {
  const selected = playlist.items.find((item) => item.id === selectedItemId);
  const selectedAudience = audienceDisplaySettings(selected?.sourceUrl);
  function updateItem(patch: Partial<PlaylistItem>) {
    if (!selected) return;
    onChange({
      ...playlist,
      items: playlist.items.map((item) =>
        item.id === selected.id ? { ...item, ...patch } : item,
      ),
    });
  }
  return (
    <div className="simple-inspector">
      <div className="inspector-tabs">
        <button className="active">Playlist</button>
        <button>Selected item</button>
      </div>
      <label>
        Playlist name
        <input
          value={playlist.name}
          onChange={(event) =>
            onChange({ ...playlist, name: event.target.value })
          }
        />
      </label>
      <div className="loop-callout">
        <span>↻</span>
        <div>
          <strong>Continuous loop</strong>
          <small>The last item always returns to the first.</small>
        </div>
      </div>
      {selected ? (
        <section className="inspector-section element-editor">
          <h3>Selected item</h3>
          <label>
            Title
            <input
              value={selected.title || ""}
              onChange={(event) => updateItem({ title: event.target.value })}
            />
          </label>
          <label>
            Production notes
            <textarea
              rows={3}
              maxLength={2000}
              value={selected.notes || ""}
              placeholder="Setup, messaging, or handoff details"
              onChange={(event) => updateItem({ notes: event.target.value })}
            />
          </label>
          <div className="two-control">
            <label>
              Time on screen
              <div className="suffix-input">
                <input
                  type="number"
                  min="1"
                  max="86400"
                  value={selected.durationSeconds}
                  onChange={(event) =>
                    updateItem({ durationSeconds: Number(event.target.value) })
                  }
                />
                <span>sec</span>
              </div>
            </label>
            <label>
              Transition
              <select
                value={selected.transition}
                onChange={(event) =>
                  updateItem({ transition: event.target.value })
                }
              >
                <option value="cut">Cut</option>
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="zoom">Zoom</option>
              </select>
            </label>
          </div>
          {selectedAudience && (
            <label>
              Audience result timing
              <select
                value={selectedAudience.mode}
                onChange={(event) =>
                  updateItem({
                    sourceUrl: audienceDisplaySource(
                      selectedAudience.code,
                      event.target.value,
                    ),
                  })
                }
              >
                <option value="off">Hide results</option>
                <option value="0">Real time</option>
                <option value="15">15-second delay</option>
                <option value="30">30-second delay</option>
                <option value="60">1-minute delay</option>
                <option value="120">2-minute delay</option>
                <option value="300">5-minute delay</option>
              </select>
            </label>
          )}
          <div className="two-control">
            <label>
              Fade in
              <div className="suffix-input">
                <input
                  type="number"
                  min="0"
                  max="30"
                  step=".1"
                  value={selected.fadeInMs / 1000}
                  onChange={(event) =>
                    updateItem({
                      fadeInMs: Math.round(Number(event.target.value) * 1000),
                    })
                  }
                />
                <span>sec</span>
              </div>
            </label>
            <label>
              Fade out
              <div className="suffix-input">
                <input
                  type="number"
                  min="0"
                  max="30"
                  step=".1"
                  value={selected.fadeOutMs / 1000}
                  onChange={(event) =>
                    updateItem({
                      fadeOutMs: Math.round(Number(event.target.value) * 1000),
                    })
                  }
                />
                <span>sec</span>
              </div>
            </label>
          </div>
          <label>
            Volume
            <div className="range-control">
              <input
                type="range"
                min="0"
                max="100"
                value={selected.muted ? 0 : selected.volumePercent}
                onChange={(event) =>
                  updateItem({
                    volumePercent: Number(event.target.value),
                    muted: Number(event.target.value) === 0,
                  })
                }
              />
              <b>{selected.muted ? 0 : selected.volumePercent}%</b>
            </div>
          </label>
          <label>
            Picture fit
            <select
              value={selected.fit}
              onChange={(event) => updateItem({ fit: event.target.value })}
            >
              <option value="contain">Fit entire item</option>
              <option value="cover">Fill area and crop</option>
              <option value="fill">Stretch to fill</option>
            </select>
          </label>
        </section>
      ) : (
        <p className="inspector-hint">
          Select an item in the timeline to adjust its duration, fades, volume,
          and fit.
        </p>
      )}
      {playlist.id && (
        <button className="simple-danger" onClick={onDelete}>
          Delete playlist
        </button>
      )}
    </div>
  );
}

function SignInspector({
  sign,
  layouts,
  playlists,
  screens,
  onChange,
  onDelete,
}: {
  sign: Sign;
  layouts: Layout[];
  playlists: Playlist[];
  screens: Screen[];
  onChange: (sign: Sign) => void;
  onDelete: () => void;
}) {
  const layout = layouts.find((item) => item.id === sign.layoutId);
  const playlistZones =
    layout?.zones.filter((item) => item.type === "presentation") || [];
  return (
    <div className="simple-inspector">
      <div className="inspector-tabs">
        <button className="active">Sign setup</button>
        <button>Screens</button>
      </div>
      <label>
        Sign name
        <input
          value={sign.name}
          onChange={(event) => onChange({ ...sign, name: event.target.value })}
        />
      </label>
      <section className="inspector-section">
        <h3>1. Persistent layout</h3>
        <p>This frame remains in place while its playlists loop.</p>
        <select
          value={sign.layoutId}
          onChange={(event) => {
            const next = layouts.find((item) => item.id === event.target.value);
            onChange({
              ...sign,
              layoutId: event.target.value,
              layoutName: next?.name || "",
              playlistAssignments: {},
            });
          }}
        >
          {layouts.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </section>
      <section className="inspector-section">
        <h3>2. Playlist elements</h3>
        {playlistZones.length ? (
          playlistZones.map((item) => (
            <label key={item.id}>
              {item.title || "Playlist area"}
              <select
                value={sign.playlistAssignments[item.id] || ""}
                onChange={(event) =>
                  onChange({
                    ...sign,
                    playlistAssignments: {
                      ...sign.playlistAssignments,
                      [item.id]: event.target.value,
                    },
                  })
                }
              >
                <option value="">No playlist</option>
                {playlists.map((playlist) => (
                  <option value={playlist.id} key={playlist.id}>
                    {playlist.name} · {playlist.items.length} items
                  </option>
                ))}
              </select>
            </label>
          ))
        ) : (
          <p className="inspector-hint">
            This layout has no playlist element. Edit the layout to add one.
          </p>
        )}
      </section>
      <section className="inspector-section">
        <h3>3. Screen assignment</h3>
        <p>Each screen can show one active Sign.</p>
        <div className="screen-assignment-list">
          {screens.map((screen) => {
            const other = screen.assignedSignageId &&
              screen.assignedSignageId !== sign.id
              ? "Currently assigned to another Sign"
              : undefined;
            return (
              <label key={screen.id}>
                <input
                  type="checkbox"
                  checked={sign.screenIds.includes(screen.id)}
                  onChange={(event) =>
                    onChange({
                      ...sign,
                      screenIds: event.target.checked
                        ? [...sign.screenIds, screen.id]
                        : sign.screenIds.filter((id) => id !== screen.id),
                    })
                  }
                />
                <span>
                  <strong>{screen.name}</strong>
                  <small>
                    {screen.site} · {screen.online ? "Online" : "Offline"}
                    {other ? ` · ${other}` : ""}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
      </section>
      {sign.id && (
        <button className="simple-danger" onClick={onDelete}>
          Delete sign
        </button>
      )}
    </div>
  );
}
