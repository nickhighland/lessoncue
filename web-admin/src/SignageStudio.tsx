import { CSSProperties, FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { confirmAction, useDialogFocus } from "./AccessibleDialogs";
import "./signage-studio.css";

export type SignageStudioSection = "layouts" | "playlists" | "schedule" | "publishing" | "operations" | "emergencies";
type StudioMedia = { id: string; fileName: string; contentType: string; thumbnailUrl?: string; downloadUrl: string; sourceKind: string };
type StudioScreen = { id: string; name: string; site: string; tagsCsv: string; revoked: boolean; allowDiagnosticScreenshots: boolean;
  signageOrientation?: "auto" | "landscape" | "portrait"; signageWidth?: number; signageHeight?: number;
  cachedItems?: number; totalItems?: number; manifestVersion?: number; playbackState?: string; lastSeenAt?: string };
type StudioSchedule = {
  id: string; name: string; mode: string; enabled: boolean; activeNow: boolean; priority: number; message: string;
  targetScreenIds: string[]; targetTagsCsv: string; recurrence: string; startsAt?: string; endsAt?: string;
  scheduleStartDate?: string; scheduleEndDate?: string; startMinutes?: number; endMinutes?: number;
  daysOfWeek?: number[]; excludedDates?: string[];
  version: number; publishedVersion: number; publishState: string; publishedAt?: string; lastPushedAt?: string;
  layoutId?: string; contentPlaylistId?: string; volumePercent: number; displayPower: string;
};
type Zone = {
  id: string; type: string; title?: string; content?: string; mediaAssetId?: string; sourceUrl?: string;
  x: number; y: number; width: number; height: number; backgroundColor: string; textColor: string; accentColor: string;
  refreshMinutes: number; rotation: number; zIndex: number; opacity: number; fit: string; locked: boolean; hidden: boolean;
  flipX: boolean; flipY: boolean; groupId?: string; lockMode?: "none" | "position" | "content" | "full";
  fontFamily?: string; fontSize?: number; fontScalePercent?: number; fontWeight?: number; italic?: boolean; underline?: boolean;
  lineHeightPercent?: number; textAlign?: string; shape?: string; strokeColor?: string; strokeWidth?: number;
  cornerRadius?: number; iconName?: string; qrValue?: string; tickerSpeed?: number; counterTargetAt?: string;
  qrLabelTop?: string; qrLabelBottom?: string; qrLabelLeft?: string; qrLabelRight?: string;
  qrPlacement?: "left" | "center" | "right";
  counterRepeatWeekly?: boolean; credentialKey?: string;
  clockDisplay?: "time" | "date" | "both"; clockTimeFormat?: "12h" | "12h-seconds" | "24h" | "24h-seconds";
  clockDateFormat?: "long" | "medium" | "short" | "numeric"; clockOrder?: "time-date" | "date-time" | "inline";
  clockTimeFontSize?: number; clockDateFontSize?: number;
  weatherProvider?: "open-meteo" | "nws" | "custom";
  weatherLocation?: string; weatherLatitude?: number; weatherLongitude?: number;
  weatherPostalCode?: string; weatherUnits?: "fahrenheit" | "celsius"; weatherFields?: string;
  weatherIconStyle?: "color" | "white"; weatherLayout?: "icon-top" | "icon-left" | "icon-right" | "compact";
  calendarMaxItems?: number; calendarFields?: string;
  contentPlaylistId?: string; streamOverrideWhenLive?: boolean;
  richTextJson?: string;
};
type Layout = {
  id: string; name: string; folder: string; description: string; isTemplate: boolean; isStarter: boolean;
  backgroundColor: string; canvasWidth: number; canvasHeight: number; orientation: string; safeAreaPercent: number;
  zones: Zone[]; publishedZones: Zone[]; backgroundAudioAssetId?: string; version: number; publishedVersion: number;
  publishState: string; publishedAt?: string; thumbnailDataUrl?: string; updatedAt: string;
};
type PlaylistEntry = {
  id: string; kind: "layout" | "media" | "app" | "web" | "nested" | "tag" | "cloud" | "csv"; title?: string;
  layoutId?: string; mediaAssetId?: string; nestedPlaylistId?: string; appType?: string; sourceUrl?: string;
  durationSeconds: number; transition: "cut" | "fade" | "slide" | "zoom"; hidden: boolean; transparent: boolean; tagsCsv?: string;
  notes?: string;
};
type StudioPlaylist = {
  id: string; name: string; folder: string; playbackMode: "ordered" | "random" | "tag" | "interactive";
  synchronization: "screen" | "region" | "global"; items: PlaylistEntry[]; publishedItems: PlaylistEntry[];
  version: number; publishedVersion: number; publishState: string; publishedAt?: string; updatedAt: string;
};
type Emergency = {
  id: string; name: string; severity: string; message: string; backgroundColor: string; textColor: string;
  mediaAssetId?: string; targetTagsCsv: string; defaultDurationMinutes: number; activeSignageId?: string;
  activatedAt?: string; expiresAt?: string;
};
type Operations = {
  generatedAt: string;
  screens: { id: string; name: string; site: string; tagsCsv: string; online: boolean; lastSeenAt?: string; appVersion: string;
    manifestVersion: number; playbackState: string; playbackError?: string; networkQuality: string; networkLatencyMs?: number;
    cachedItems: number; totalItems: number; screenshotStatus: string; proofCount: number; lastProofAt?: string }[];
  schedules: { id: string; name: string; enabled: boolean; mode: string; version: number; publishedVersion: number;
    publishState: string; publishedAt?: string; lastPushedAt?: string; targets: number; widgetCacheError?: string }[];
  streams: { signageId: string; zoneId: string; running: boolean; startedAt?: string; lastAccess: string; lastSegmentAt?: string;
    segmentLatencyMs?: number; playlistReady: boolean; restartCount: number; error?: string }[];
  alerts: { id: string; name: string; severity: string; message: string }[];
};

type Props = {
  section: SignageStudioSection; media: StudioMedia[]; screens: StudioScreen[]; signage: StudioSchedule[];
  timeZone: string; sourceAllowlist: string[]; refresh: () => void; notify: (message: string) => void;
};

const ZONE_TYPES = [
  ["text", "Text / message"], ["media", "Photo, video, or logo"], ["stream", "Live stream"],
  ["presentation", "Presentation area"], ["qr", "QR code"], ["wifi", "Wi-Fi QR code"],
  ["ticker", "Scrolling ticker"], ["counter", "Countdown"], ["clock", "Time and date"],
  ["weather", "Weather"], ["calendar", "Calendar / events"], ["rss", "RSS / news"],
  ["webpage", "Webpage"], ["customHtml", "Custom HTML"]
] as const;

const WEATHER_FIELDS = [
  ["icon", "Condition icon"], ["conditions", "Conditions"], ["temperature", "Current temperature"],
  ["feelsLike", "Feels like"], ["high", "Daily high"], ["low", "Daily low"],
  ["precipitation", "Precipitation chance"], ["humidity", "Humidity"], ["wind", "Wind"]
] as const;

const CALENDAR_FIELDS = [
  ["title", "Event title"], ["date", "Date"], ["time", "Time"],
  ["description", "Description"], ["location", "Location"]
] as const;

const weatherFieldSet = (zone: Zone) =>
  new Set((zone.weatherFields || "icon,conditions,temperature,high,low,precipitation").split(",").filter(Boolean));
const calendarFieldSet = (zone: Zone) =>
  new Set((zone.calendarFields || "date,time,title").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
const relativeElementFontSize = (zone: Pick<Zone, "fontScalePercent">) => {
  const scale = Math.max(1, Math.min(40, zone.fontScalePercent ?? 10));
  return `min(${scale}cqw, ${scale}cqh)`;
};

function parseWifiQr(value?: string) {
  const pick = (key: string) => value?.match(new RegExp(`${key}:((?:\\\\.|[^;])*)`))?.[1]
    ?.replace(/\\([\\;,:"])/g, "$1") || "";
  return { security: pick("T") || "WPA", ssid: pick("S"), password: pick("P") };
}

function makeWifiQr(security: string, ssid: string, password: string) {
  const escape = (value: string) => value.replace(/([\\;,:"])/g, "\\$1");
  return `WIFI:T:${escape(security)};S:${escape(ssid)};P:${escape(password)};;`;
}

async function studioApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/signage-studio${path}`, {
    credentials: "same-origin", ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.error || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";
const timeAgo = (value?: string) => {
  if (!value) return "never";
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

export function SignageStudioPanel(props: Props) {
  if (props.section === "layouts") return <LayoutsPanel {...props} />;
  if (props.section === "playlists") return <PlaylistsPanel {...props} />;
  if (props.section === "publishing") return <PublishingPanel {...props} />;
  if (props.section === "operations") return <OperationsPanel {...props} />;
  if (props.section === "emergencies") return <EmergencyPanel {...props} />;
  return null;
}

export function SignageCalendarBoard({ signage, timeZone, onEdit }: {
  signage: StudioSchedule[]; timeZone: string; onEdit: (id: string, occurrenceDate: string) => void;
}) {
  const [focus, setFocus] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const first = new Date(focus.getFullYear(), focus.getMonth(), 1, 12);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const occurs = (item: StudioSchedule, date: Date) => {
    const dateKey = key(date);
    if (item.mode === "idle" && !item.startsAt && !item.scheduleStartDate) return false;
    if (item.recurrence === "once") return item.startsAt?.slice(0,10) === dateKey;
    if (item.scheduleStartDate && dateKey < item.scheduleStartDate) return false;
    if (item.scheduleEndDate && dateKey > item.scheduleEndDate) return false;
    if (item.recurrence === "weekly") {
      if (!item.daysOfWeek?.includes(date.getDay())) return false;
      if (item.excludedDates?.includes(dateKey)) return false;
    }
    return true;
  };
  return <section className="panel signage-calendar-board"><header><div><h2>{focus.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</h2><small>Signage calendar · {timeZone}</small></div><div><button onClick={()=>setFocus(new Date(focus.getFullYear(),focus.getMonth()-1,1,12))}>‹</button><button onClick={()=>setFocus(new Date(new Date().getFullYear(),new Date().getMonth(),1,12))}>Today</button><button onClick={()=>setFocus(new Date(focus.getFullYear(),focus.getMonth()+1,1,12))}>›</button></div></header><div className="signage-calendar-weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><b key={day}>{day}</b>)}</div><div className="signage-calendar-grid">{days.map(date=><div className={`${date.getMonth()!==focus.getMonth()?"outside":""} ${key(date)===key(new Date())?"today":""}`} key={key(date)}><span>{date.getDate()}</span>{signage.filter(item=>item.enabled&&occurs(item,date)).slice(0,4).map(item=><button key={item.id} className={item.mode} onClick={()=>onEdit(item.id,key(date))} title={`${item.name} · click to edit this occurrence or its series`}><i/>{item.name}<small>{item.startMinutes!=null?`${String(Math.floor(item.startMinutes/60)).padStart(2,"0")}:${String(item.startMinutes%60).padStart(2,"0")}`:item.startsAt?new Date(item.startsAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"all day"}</small></button>)}</div>)}</div><footer><span><i className="scheduled"/>Scheduled content</span><span><i className="emergency"/>Emergency priority</span><span><i className="idle"/>Filler / idle</span><small>Recurring items can be changed for one occurrence, this and future occurrences, or the entire series.</small></footer></section>;
}

function LayoutsPanel({ media, notify }: Props) {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [playlists, setPlaylists] = useState<StudioPlaylist[]>([]);
  const [editing, setEditing] = useState<Layout | "new">();
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState(false);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const load = () => Promise.all([studioApi<Layout[]>("/layouts"), studioApi<StudioPlaylist[]>("/playlists")])
    .then(([nextLayouts, nextPlaylists]) => { setLayouts(nextLayouts); setPlaylists(nextPlaylists); })
    .catch(error => notify(errorText(error)));
  useEffect(() => { void load(); }, []);
  const folders = [...new Set(layouts.map(item => item.folder).filter(Boolean))].sort();
  const shown = layouts.filter(item => (!folder || item.folder === folder) &&
    `${item.name} ${item.folder} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  async function duplicate(item: Layout) {
    try { await studioApi(`/layouts/${item.id}/duplicate`, { method: "POST", body: "{}" }); load(); notify("Layout duplicated as an editable draft."); }
    catch (error) { notify(errorText(error)); }
  }
  async function remove(item: Layout) {
    const starterNote = item.isStarter ? " This removes the built-in starter from this server." : "";
    if (!await confirmAction(
      `Permanently delete ${item.name}?${starterNote} Layouts used by schedules or playlists remain protected.`,
      { destructive: true },
    )) return;
    try { await studioApi(`/layouts/${item.id}`, { method: "DELETE" }); load(); notify("Layout deleted."); }
    catch (error) { notify(errorText(error)); }
  }
  return <section className="studio-panel">
    <div className="studio-toolbar panel"><div><strong>Reusable layouts</strong><small>Build once, then assign the same branded layout to schedules and playlists.</small></div>
      <input type="search" placeholder="Search layouts" value={query} onChange={event => setQuery(event.target.value)} />
      <select value={folder} onChange={event => setFolder(event.target.value)}><option value="">All folders</option>{folders.map(value => <option key={value}>{value}</option>)}</select>
      <button className="button" onClick={() => setCredentials(true)}>Source credentials</button><button className="button primary" onClick={() => setCreating(true)}>Create sign</button></div>
    <div className="studio-card-grid">{shown.map(item => <article className="studio-resource-card" key={item.id}>
      <LayoutThumbnail item={item} />
      <div className="studio-resource-body"><div><span className={`studio-state ${item.publishState}`}>{item.publishState}</span>{item.isStarter && <span className="pill">Starter</span>}{item.isTemplate && !item.isStarter && <span className="pill">Template</span>}</div>
        <h3>{item.name}</h3><p>{item.folder || "Unfiled"} · {item.canvasWidth}×{item.canvasHeight} · {item.zones.length} elements</p>
        <small>Draft v{item.version}{item.publishedVersion ? ` · published v${item.publishedVersion}` : " · not published"}</small>
        <div className="studio-card-actions"><button onClick={() => item.isStarter ? duplicate(item) : setEditing(item)}>{item.isStarter ? "Use template" : "Edit"}</button><button onClick={() => duplicate(item)}>Duplicate</button><button className="danger" onClick={() => remove(item)}>Delete</button></div>
      </div></article>)}</div>
    {!shown.length && <div className="panel studio-empty"><h3>No matching layouts</h3><p>Create a blank layout or clear the search filters.</p></div>}
    {editing && <LayoutEditor layout={editing === "new" ? undefined : editing} templates={layouts.filter(item => item.isTemplate)} layouts={layouts}
      media={media} playlists={playlists} onClose={() => setEditing(undefined)} onOpenLayout={item => setEditing(item)} onCreate={() => setEditing("new")} notify={notify}
      onSaved={() => { setEditing(undefined); load(); }} />}
    {credentials && <CredentialsDialog notify={notify} onClose={() => setCredentials(false)} />}
    {creating && <CreateSignDialog templates={layouts.filter(item => item.isTemplate || item.isStarter)} onClose={() => setCreating(false)} onCreate={() => { setCreating(false); setEditing("new"); }} />}
  </section>;
}

function CreateSignDialog({ templates, onClose, onCreate }: { templates: Layout[]; onClose: () => void; onCreate: () => void }) {
  void templates;
  const [step, setStep] = useState(1);
  const [starter, setStarter] = useState("information");
  const [extras, setExtras] = useState<string[]>(["weather", "calendar"]);
  const toggle = (value: string) => setExtras(all => all.includes(value) ? all.filter(item => item !== value) : [...all, value]);
  return <StudioDialog title="Create a sign" wide onClose={onClose}><div className="create-sign-wizard">
    <header><h1>Create a sign</h1><p>A simple three-step setup. You can refine every detail later.</p></header>
    <div className="wizard-steps" aria-label="Create sign steps">{([[1,"Choose a starting point"],[2,"Add content"],[3,"Choose displays & schedule"]] as const).map(([number,label]) => <button key={number} className={step === number ? "active" : step > number ? "done" : ""} onClick={() => setStep(number)}><b>{number}</b><span>{label}</span></button>)}</div>
    {step === 1 && <section className="wizard-card"><h2>Choose a starting point</h2><p>Start with a simple layout designed for announcements and information.</p><div className="wizard-choice-grid">{[["welcome","Welcome screen","A clear welcome message"],["information","Information frame","Presentation with helpful side panels"],["announcement","Full-screen announcement","One important message"]].map(([value,label,detail]) => <button key={value} className={starter === value ? "selected" : ""} onClick={() => setStarter(value)}><i>{value === "announcement" ? "⌁" : value === "information" ? "▦" : "▧"}</i><strong>{label}</strong><small>{detail}</small></button>)}</div></section>}
    {step === 2 && <section className="wizard-card"><h2>Add content</h2><p>Select the information panels you would like available. You can add or remove panels later.</p><div className="wizard-choice-grid compact">{[["media","Media rotation"],["weather","Weather & time"],["calendar","Calendar"],["qr","QR code"]].map(([value,label]) => <button key={value} className={extras.includes(value) ? "selected" : ""} onClick={() => toggle(value)}><i>{zoneTypeIcon(value)}</i><strong>{label}</strong><small>{extras.includes(value) ? "Included" : "Add panel"}</small></button>)}</div></section>}
    {step === 3 && <section className="wizard-card"><h2>Choose displays & schedule</h2><p>Save this as a draft first. You will choose exact screens and a schedule when you publish.</p><div className="wizard-confirmation"><span>▭</span><div><strong>{starter === "information" ? "Information frame" : starter === "welcome" ? "Welcome screen" : "Full-screen announcement"}</strong><small>{extras.length ? `${extras.length} optional information panels selected` : "A simple, focused sign"}</small></div></div></section>}
    <footer><button onClick={onClose}>Cancel</button><span className="toolbar-spacer" />{step > 1 && <button onClick={() => setStep(step - 1)}>Back</button>}{step < 3 ? <button className="button primary" onClick={() => setStep(step + 1)}>Continue</button> : <button className="button primary" onClick={onCreate}>Create draft sign →</button>}</footer>
  </div></StudioDialog>;
}

function LayoutThumbnail({ item }: { item: Layout }) {
  return <div className={`studio-layout-thumbnail ${item.orientation}`} style={{ background: item.backgroundColor }}>
    {item.thumbnailDataUrl ? <img src={item.thumbnailDataUrl} alt="" /> : item.zones.slice().sort((a, b) => a.zIndex - b.zIndex).map(zone =>
      <i key={zone.id} style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%`,
        background: zone.backgroundColor, borderColor: zone.accentColor, opacity: zone.opacity / 100,
        transform: `rotate(${zone.rotation}deg)`, borderRadius: `${zone.cornerRadius || 0}%` }} />)}
  </div>;
}

function freshZone(type = "text"): Zone {
  const zone: Zone = {
    id: id(), type, title: type === "text" ? "Text" : type, content: type === "text" ? "New message" : "",
    x: 10, y: 10, width: 40, height: 30, backgroundColor: "#17201e", textColor: "#ffffff", accentColor: "#d89127",
    refreshMinutes: 15, rotation: 0, zIndex: 1, opacity: 100, fit: "cover", locked: false, hidden: false,
    flipX: false, flipY: false, lockMode: "none", fontFamily: "system-ui", fontScalePercent: 10, fontWeight: 600,
    lineHeightPercent: 120, textAlign: "left", shape: "rectangle", strokeColor: "#ffffff", strokeWidth: 0,
    cornerRadius: 0, tickerSpeed: 60
  };
  if (type === "weather") Object.assign(zone, {
    title: "Local weather", weatherProvider: "open-meteo", weatherLocation: "Your location",
    weatherUnits: "fahrenheit", weatherFields: "icon,conditions,temperature,high,low,humidity,wind",
    weatherIconStyle: "color", weatherLayout: "icon-left"
  });
  if (type === "calendar") Object.assign(zone, {
    title: "Upcoming events", calendarMaxItems: 4, calendarFields: "date,time,title"
  });
  if (type === "clock") Object.assign(zone, {
    title: "Time and date", clockDisplay: "both", clockTimeFormat: "12h", clockDateFormat: "long",
    clockOrder: "time-date"
  });
  if (type === "presentation") Object.assign(zone, {
    title: "Presentation area", content: "Select a signage playlist"
  });
  return zone;
}

function LayoutEditor({ layout, templates, layouts, media, playlists, onClose, onOpenLayout, onCreate, onSaved, notify }: {
  layout?: Layout; templates: Layout[]; layouts: Layout[]; media: StudioMedia[]; playlists: StudioPlaylist[];
  onClose: () => void; onOpenLayout: (layout: Layout) => void; onCreate: () => void; onSaved: () => void; notify: (message: string) => void;
}) {
  const [name, setName] = useState(layout?.name || "Untitled layout");
  const [folder, setFolder] = useState(layout?.folder || "");
  const [description, setDescription] = useState(layout?.description || "");
  const [background, setBackground] = useState(layout?.backgroundColor || "#25302d");
  const [width, setWidth] = useState(layout?.canvasWidth || 1920);
  const [height, setHeight] = useState(layout?.canvasHeight || 1080);
  const [safeArea, setSafeArea] = useState(layout?.safeAreaPercent ?? 5);
  const [isTemplate, setIsTemplate] = useState(layout?.isTemplate || false);
  const [audioId, setAudioId] = useState(layout?.backgroundAudioAssetId || "");
  const [zones, setZones] = useState<Zone[]>(() => (layout?.zones || []).map(zone => {
    const normalizedType = ZONE_TYPES.some(([type]) => type === zone.type) ? zone.type : "text";
    return {
      ...zone,
      type: normalizedType,
      fontScalePercent: zone.fontScalePercent ?? 10,
      calendarMaxItems: normalizedType === "calendar" && !zone.calendarMaxItems ? 4 : zone.calendarMaxItems,
      calendarFields: normalizedType === "calendar" ? zone.calendarFields || "date,time,title" : zone.calendarFields,
    };
  }));
  const [selected, setSelected] = useState<string[]>([]);
  const [history, setHistory] = useState<Zone[][]>([]);
  const [future, setFuture] = useState<Zone[][]>([]);
  const [zoom, setZoom] = useState(75);
  const [grid, setGrid] = useState(2);
  const [snap, setSnap] = useState(true);
  const [hand, setHand] = useState(false);
  const [showSafe, setShowSafe] = useState(true);
  const [showFrameBuilder, setShowFrameBuilder] = useState(false);
  const [bottomSlots, setBottomSlots] = useState(5);
  const [sidebarSlots, setSidebarSlots] = useState(1);
  const [framePercent, setFramePercent] = useState(20);
  const [frameColor, setFrameColor] = useState("#063d2b");
  const [frameAltColor, setFrameAltColor] = useState("#032719");
  const [showBrowserPreview, setShowBrowserPreview] = useState(false);
  const [guides, setGuides] = useState<{ vertical?: number; horizontal?: number }>({});
  const [elementType, setElementType] = useState("text");
  const [inspectorTab, setInspectorTab] = useState<"content" | "style" | "layers" | "schedule">("content");
  const [saving, setSaving] = useState<"draft" | "publish" | undefined>();
  const canvas = useRef<HTMLDivElement>(null);
  const current = zones.find(zone => zone.id === selected[0]);
  const commit = (next: Zone[]) => { setHistory(all => [...all.slice(-49), zones]); setZones(next); setFuture([]); };
  const patch = (zoneId: string, values: Partial<Zone>, record = true) => {
    const next = zones.map(zone => zone.id === zoneId ? { ...zone, ...values } : zone);
    if (record) commit(next); else setZones(next);
  };
  const undo = () => setHistory(all => {
    const previous = all.at(-1); if (!previous) return all;
    setFuture(next => [zones, ...next]); setZones(previous); return all.slice(0, -1);
  });
  const redo = () => setFuture(all => {
    const next = all[0]; if (!next) return all;
    setHistory(previous => [...previous, zones]); setZones(next); return all.slice(1);
  });
  function addElement(type = elementType) {
    const zone = { ...freshZone(type), x: Math.min(60, 6 + zones.length * 2), y: Math.min(60, 6 + zones.length * 2), zIndex: zones.length + 1 };
    commit([...zones, zone]); setSelected([zone.id]);
    setElementType(type);
    setInspectorTab("content");
  }
  function buildInformationFrame(persist: boolean) {
    const mainPercent = 100 - framePercent;
    const framed: Zone[] = [];
    const zoneId = (name: string) => persist ? id() : `information-frame-preview-${name}`;
    const main = { ...freshZone("presentation"), id: zoneId("presentation"), title: "Presentation area",
      content: "Select a signage playlist; an optional live stream can override it", x: 0, y: 0, width: mainPercent,
      height: mainPercent, backgroundColor: "#171c1b", accentColor: frameColor, fontScalePercent: 10, zIndex: 1 };
    framed.push(main);
    const farRightBottomColor = (bottomSlots - 1) % 2 ? frameColor : frameAltColor;
    const bottomSidebarColor = farRightBottomColor === frameColor ? frameAltColor : frameColor;
    for (let index = 0; index < sidebarSlots; index++) {
      const distanceFromBottom = sidebarSlots - 1 - index;
      const sidebarColor = distanceFromBottom % 2 ? (bottomSidebarColor === frameColor ? frameAltColor : frameColor) : bottomSidebarColor;
      framed.push({ ...freshZone(index === 0 ? "calendar" : index === 1 ? "clock" : "text"),
        id: zoneId(`sidebar-${index}`), title: index === 0 ? "Upcoming events" : index === 1 ? "Time and date" : "Sidebar message",
        content: index === 0 ? "Connect a calendar or enter event information" : index === 1 ? "" : "Add a message",
        x: mainPercent, y: index * mainPercent / sidebarSlots, width: framePercent,
        height: mainPercent / sidebarSlots, backgroundColor: sidebarColor, accentColor: "#d89127",
        fontScalePercent: 10, zIndex: index + 2 });
    }
    const suggestions = ["weather", "wifi", "rss", "text", "qr"];
    for (let index = 0; index < bottomSlots; index++) {
      const type = suggestions[index] || "text";
      const zone = freshZone(type);
      framed.push({ ...zone, id: zoneId(`bottom-${index}`),
        title: type === "weather" ? "Local weather" : type === "wifi" ? "Guest Wi-Fi" :
          type === "rss" ? "News" : type === "qr" ? "Learn more" : "Message",
        content: type === "rss" ? "Connect a news source" : type === "text" ? "Add a message" : zone.content,
        x: index * 100 / bottomSlots, y: mainPercent, width: 100 / bottomSlots, height: framePercent,
        backgroundColor: index % 2 ? frameColor : frameAltColor, accentColor: "#d89127",
        fontScalePercent: 10, zIndex: sidebarSlots + index + 2 });
    }
    return framed;
  }
  async function applyInformationFrame() {
    if (zones.length && !await confirmAction(
      "Replace the current draft elements with this information frame? You can undo this change.",
    )) return;
    const framed = buildInformationFrame(true);
    const main = framed[0];
    setWidth(1920); setHeight(1080); setBackground(frameColor);
    commit(framed); setSelected([main.id]); setShowFrameBuilder(false);
  }
  function selectionFor(zone: Zone, event: ReactPointerEvent) {
    const groupedIds = zone.groupId ? zones.filter(value => value.groupId === zone.groupId).map(value => value.id) : [zone.id];
    if (event.metaKey || event.ctrlKey || event.shiftKey)
      setSelected(all => all.includes(zone.id) ? all.filter(value => !groupedIds.includes(value)) : [...new Set([...all, ...groupedIds])]);
    else if (!selected.includes(zone.id)) setSelected(groupedIds);
  }
  function gesture(event: ReactPointerEvent, zone: Zone, mode: "move" | "resize" | "rotate") {
    event.preventDefault(); event.stopPropagation(); selectionFor(zone, event);
    if (hand || zone.lockMode === "full" || zone.lockMode === "position" || zone.locked || !canvas.current) return;
    const box = canvas.current.getBoundingClientRect();
    const groupedIds = zone.groupId ? zones.filter(value => value.groupId === zone.groupId).map(value => value.id) : [zone.id];
    const ids = selected.includes(zone.id) ? selected : groupedIds;
    const starts = new Map(zones.filter(value => ids.includes(value.id)).map(value => [value.id, { ...value }]));
    const original = zones;
    const centerX = box.left + (zone.x + zone.width / 2) * box.width / 100;
    const centerY = box.top + (zone.y + zone.height / 2) * box.height / 100;
    const startX = event.clientX, startY = event.clientY;
    const startAngle = Math.atan2(startY - centerY, startX - centerX) * 180 / Math.PI;
    const quantize = (value: number, shift: boolean) => snap && !shift ? Math.round(value / grid) * grid : Math.round(value * 10) / 10;
    const guideCandidates = (axis: "x" | "y") => [
      0, 50, 100,
      ...original.filter(value => !ids.includes(value.id)).flatMap(value => axis === "x"
        ? [value.x, value.x + value.width / 2, value.x + value.width]
        : [value.y, value.y + value.height / 2, value.y + value.height])
    ];
    const alignToGuide = (position: number, size: number, candidates: number[], enabled: boolean) => {
      if (!enabled) return { position, guide: undefined as number | undefined };
      const anchors = [position, position + size / 2, position + size];
      let best: { distance: number; position: number; guide: number } | undefined;
      for (const candidate of candidates) for (let anchorIndex = 0; anchorIndex < anchors.length; anchorIndex++) {
        const distance = Math.abs(anchors[anchorIndex] - candidate);
        if (distance <= 0.8 && (!best || distance < best.distance))
          best = { distance, position: candidate - (anchorIndex === 0 ? 0 : anchorIndex === 1 ? size / 2 : size), guide: candidate };
      }
      return best ? { position: best.position, guide: best.guide } : { position, guide: undefined };
    };
    const move = (pointer: PointerEvent) => {
      const dx = (pointer.clientX - startX) / box.width * 100, dy = (pointer.clientY - startY) / box.height * 100;
      const nextX = quantize(zone.x + dx, pointer.shiftKey), nextY = quantize(zone.y + dy, pointer.shiftKey);
      const alignedX = alignToGuide(nextX, zone.width, guideCandidates("x"), snap && !pointer.shiftKey);
      const alignedY = alignToGuide(nextY, zone.height, guideCandidates("y"), snap && !pointer.shiftKey);
      if (mode === "move") setGuides({ vertical: alignedX.guide, horizontal: alignedY.guide });
      setZones(original.map(value => {
        const start = starts.get(value.id); if (!start) return value;
        if (mode === "move") return { ...value,
          x: Math.max(0, Math.min(100 - value.width, start.x + alignedX.position - zone.x)),
          y: Math.max(0, Math.min(100 - value.height, start.y + alignedY.position - zone.y)) };
        if (mode === "resize" && value.id === zone.id) return { ...value, width: Math.max(2, Math.min(100 - start.x, quantize(start.width + dx, pointer.shiftKey))),
          height: Math.max(2, Math.min(100 - start.y, quantize(start.height + dy, pointer.shiftKey))) };
        if (mode === "rotate" && value.id === zone.id) {
          const angle = Math.atan2(pointer.clientY - centerY, pointer.clientX - centerX) * 180 / Math.PI;
          return { ...value, rotation: Math.round(quantize(start.rotation + angle - startAngle, pointer.shiftKey)) };
        }
        return value;
      }));
    };
    const finish = () => {
      setHistory(all => [...all.slice(-49), original]); setFuture([]);
      setGuides({});
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", finish);
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", finish, { once: true });
  }
  function keyboardGesture(event: ReactKeyboardEvent<HTMLDivElement>, zone: Zone) {
    if (showFrameBuilder || hand) return;
    const groupedIds = zone.groupId
      ? zones.filter(value => value.groupId === zone.groupId).map(value => value.id)
      : [zone.id];
    const ids = selected.includes(zone.id) ? selected : groupedIds;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(groupedIds);
      return;
    }
    if ((event.metaKey || event.ctrlKey) &&
        ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      setSelected(groupedIds);
      reorder(zone.id, event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : -1);
      return;
    }
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      const direction = event.key === "]" ? 1 : -1;
      const next = zones.map(value =>
        ids.includes(value.id) &&
        value.lockMode !== "position" &&
        value.lockMode !== "full" &&
        !value.locked
          ? { ...value, rotation: Math.max(-180, Math.min(180, value.rotation + direction * (event.shiftKey ? 15 : 1))) }
          : value,
      );
      if (next.some((value, index) => value !== zones[index])) commit(next);
      setSelected(ids);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? Math.max(5, grid) : snap ? grid : 0.5;
    const horizontal = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const vertical = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    const next = zones.map(value => {
      if (!ids.includes(value.id) || value.lockMode === "position" ||
          value.lockMode === "full" || value.locked) return value;
      if (event.altKey) {
        return {
          ...value,
          width: Math.max(2, Math.min(100 - value.x, value.width + horizontal)),
          height: Math.max(2, Math.min(100 - value.y, value.height + vertical)),
        };
      }
      return {
        ...value,
        x: Math.max(0, Math.min(100 - value.width, value.x + horizontal)),
        y: Math.max(0, Math.min(100 - value.height, value.y + vertical)),
      };
    });
    if (next.some((value, index) => value !== zones[index])) commit(next);
    setSelected(ids);
  }
  function beginCanvasGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!hand) { setSelected([]); return; }
    event.preventDefault();
    const scroll = canvas.current?.parentElement;
    if (!scroll) return;
    const startX = event.clientX, startY = event.clientY;
    const left = scroll.scrollLeft, top = scroll.scrollTop;
    const move = (pointer: PointerEvent) => {
      scroll.scrollLeft = left - (pointer.clientX - startX);
      scroll.scrollTop = top - (pointer.clientY - startY);
    };
    const finish = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish, { once: true });
  }
  function align(kind: string) {
    const picked = zones.filter(zone => selected.includes(zone.id)); if (picked.length < 2) return;
    const left = Math.min(...picked.map(zone => zone.x)), right = Math.max(...picked.map(zone => zone.x + zone.width));
    const top = Math.min(...picked.map(zone => zone.y)), bottom = Math.max(...picked.map(zone => zone.y + zone.height));
    const sorted = [...picked].sort((a, b) => kind === "distribute-v" ? a.y - b.y : a.x - b.x);
    const next = zones.map(zone => {
      if (!selected.includes(zone.id) || zone.lockMode === "position" || zone.lockMode === "full") return zone;
      if (kind === "left") return { ...zone, x: left };
      if (kind === "right") return { ...zone, x: right - zone.width };
      if (kind === "center") return { ...zone, x: (left + right - zone.width) / 2 };
      if (kind === "top") return { ...zone, y: top };
      if (kind === "bottom") return { ...zone, y: bottom - zone.height };
      if (kind === "middle") return { ...zone, y: (top + bottom - zone.height) / 2 };
      const index = sorted.findIndex(value => value.id === zone.id);
      if (kind === "distribute-h" && sorted.length > 2) return { ...zone, x: left + index * (right - left - zone.width) / (sorted.length - 1) };
      if (kind === "distribute-v" && sorted.length > 2) return { ...zone, y: top + index * (bottom - top - zone.height) / (sorted.length - 1) };
      return zone;
    });
    commit(next);
  }
  function reorder(zoneId: string, delta: number) {
    const ordered = [...zones].sort((a, b) => a.zIndex - b.zIndex);
    const index = ordered.findIndex(zone => zone.id === zoneId); const other = ordered[index + delta];
    if (!other) return;
    const target = ordered[index];
    if (target.lockMode === "position" || target.lockMode === "full" || target.locked ||
        other.lockMode === "position" || other.lockMode === "full" || other.locked) return;
    commit(zones.map(zone => zone.id === target.id ? { ...zone, zIndex: other.zIndex } : zone.id === other.id ? { ...zone, zIndex: target.zIndex } : zone));
  }
  function group() {
    if (selected.length < 2) return;
    const groupId = id(); commit(zones.map(zone => selected.includes(zone.id) ? { ...zone, groupId } : zone));
  }
  function ungroup() { commit(zones.map(zone => selected.includes(zone.id) ? { ...zone, groupId: undefined } : zone)); }
  async function save(publish = false) {
    if (!name.trim()) return notify("Enter a layout name.");
    setSaving(publish ? "publish" : "draft");
    try {
      const payload = { name, folder, description, isTemplate, backgroundColor: background, canvasWidth: width,
        canvasHeight: height, safeAreaPercent: safeArea, zones, backgroundAudioAssetId: audioId || null, thumbnailDataUrl: null };
      const saved = publish
        ? await studioApi<Layout>("/layouts/save-publish", {
          method: "POST", body: JSON.stringify({ id: layout?.id || null, layout: payload, pushToScreens: true })
        })
        : await studioApi<Layout>(layout ? `/layouts/${layout.id}` : "/layouts", {
          method: layout ? "PUT" : "POST", body: JSON.stringify(payload)
        });
      if (publish && (saved.version !== saved.publishedVersion || saved.publishedZones.length !== saved.zones.length))
        throw new Error("The server did not confirm the complete draft as published.");
      notify(publish ? "Layout published and screens notified." : "Layout draft saved."); onSaved();
    } catch (error) { notify(`Could not ${publish ? "publish" : "save"} layout: ${errorText(error)}`); }
    finally { setSaving(undefined); }
  }
  async function replaceFrom(templateId: string) {
    if (!layout || !templateId || !await confirmAction(
      "Replace the current draft with this template? The published version remains live until you publish again.",
    )) return;
    try { await studioApi(`/layouts/${layout.id}/replace-from-template/${templateId}`, { method: "POST", body: "{}" }); notify("Draft replaced safely; the live version was not changed."); onSaved(); }
    catch (error) { notify(errorText(error)); }
  }
  const aspect = `${width} / ${height}`;
  const displayZones = showFrameBuilder ? buildInformationFrame(false) : zones;
  return <StudioDialog title={layout ? `Layout · ${layout.name}` : "New reusable layout"} wide workspace onClose={onClose}>
    <nav className="signage-workflow" aria-label="Sign creation progress"><span className="active"><b>1</b> Content</span><i/><span><b>2</b> Design</span><i/><span><b>3</b> Publish</span></nav>
    <div className="layout-editor-statusbar">
      <div><span className={`studio-state ${layout?.publishState || "draft"}`}>{layout?.publishState || "New draft"}</span>
        <small>{layout ? `Saved ${layout.updatedAt ? timeAgo(layout.updatedAt) : "just now"}${layout.publishedVersion ? ` · live v${layout.publishedVersion}` : " · not published"}` : "Not saved yet"}</small></div>
      <span className="toolbar-spacer" />
      <button className="button" onClick={() => setShowBrowserPreview(true)}>Preview on screen</button>
    </div>
    <details className="layout-advanced-controls">
      <summary>Advanced layout controls</summary>
      <div className="layout-editor-meta">
      <input aria-label="Layout name" value={name} onChange={event => setName(event.target.value)} placeholder="Layout name" />
      <input aria-label="Folder" value={folder} onChange={event => setFolder(event.target.value)} placeholder="Folder" />
      <select aria-label="Resolution" value={`${width}x${height}`} onChange={event => {
        const [nextWidth, nextHeight] = event.target.value.split("x").map(Number); setWidth(nextWidth); setHeight(nextHeight);
      }}><option value="1920x1080">Full HD · 1920×1080</option><option value="1080x1920">Portrait · 1080×1920</option><option value="3840x2160">4K · 3840×2160</option><option value="2160x3840">4K portrait · 2160×3840</option><option value="2560x1080">Ultrawide · 2560×1080</option><option value="1080x1080">Square · 1080×1080</option><option value={`${width}x${height}`}>Custom · {width}×{height}</option></select>
      <label>W <input type="number" min="240" max="7680" value={width} onChange={event => setWidth(Number(event.target.value))} /></label>
      <label>H <input type="number" min="240" max="7680" value={height} onChange={event => setHeight(Number(event.target.value))} /></label>
      <label>Safe <input type="number" min="0" max="20" value={safeArea} onChange={event => setSafeArea(Number(event.target.value))} />%</label>
      <label>Canvas <input aria-label="Canvas background" type="color" value={background} onChange={event => setBackground(event.target.value)} /></label>
      </div>
      <div className="layout-editor-toolbar">
      <button onClick={undo} disabled={!history.length}>↶ Undo</button><button onClick={redo} disabled={!future.length}>↷ Redo</button>
      <button className={hand ? "active" : ""} onClick={() => setHand(value => !value)}>✋ Hand</button>
      <button onClick={() => setZoom(value => Math.max(25, value - 10))}>−</button><span>{zoom}%</span><button onClick={() => setZoom(value => Math.min(200, value + 10))}>+</button>
      <label><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} /> Snap</label>
      <label>Grid <input type="number" min="1" max="20" value={grid} onChange={event => setGrid(Number(event.target.value))} />%</label>
      <label><input type="checkbox" checked={showSafe} onChange={event => setShowSafe(event.target.checked)} /> Safe area</label>
      <select aria-label="Quick element type" value={elementType} onChange={event => setElementType(event.target.value)}>{ZONE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button onClick={() => addElement()}>+ Element</button>
      <span className="toolbar-spacer" />
      <button onClick={() => align("left")} disabled={selected.length < 2}>Left</button><button onClick={() => align("center")} disabled={selected.length < 2}>Center</button><button onClick={() => align("right")} disabled={selected.length < 2}>Right</button>
      <button onClick={() => align("top")} disabled={selected.length < 2}>Top</button><button onClick={() => align("middle")} disabled={selected.length < 2}>Middle</button><button onClick={() => align("bottom")} disabled={selected.length < 2}>Bottom</button>
      <button onClick={() => align("distribute-h")} disabled={selected.length < 3}>Distribute ↔</button><button onClick={() => align("distribute-v")} disabled={selected.length < 3}>Distribute ↕</button>
      <button onClick={group} disabled={selected.length < 2}>Group</button><button onClick={ungroup} disabled={!selected.some(zoneId => zones.find(zone => zone.id === zoneId)?.groupId)}>Ungroup</button>
      </div>
    </details>
    {showFrameBuilder && <section className="information-frame-builder" aria-label="Information frame builder">
      <div><strong>Information frame</strong><small>Build a 16:9 presentation area with evenly divided information slots along the bottom and right side.</small></div>
      <label>Bottom boxes <select value={bottomSlots} onChange={event => setBottomSlots(Number(event.target.value))}>{[1,2,3,4,5].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Sidebar boxes <select value={sidebarSlots} onChange={event => setSidebarSlots(Number(event.target.value))}>{[1,2,3].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Frame size <input type="range" min="12" max="28" value={framePercent} onChange={event => setFramePercent(Number(event.target.value))} /><b>{framePercent}%</b></label>
      <label>Primary shade <input aria-label="Primary frame shade" type="color" value={frameColor} onChange={event => setFrameColor(event.target.value)} /></label>
      <label>Alternating shade <input aria-label="Alternating frame shade" type="color" value={frameAltColor} onChange={event => setFrameAltColor(event.target.value)} /></label>
      <span className="frame-live-label">Live preview</span>
      <button className="button primary" onClick={applyInformationFrame}>Apply frame</button>
    </section>}
    <div className="layout-editor-workspace">
      <aside className="layout-sign-list" aria-label="My signs">
        <header><strong>My signs</strong><small>Choose a sign to edit.</small></header>
        <button className="create-sign-button" onClick={onCreate}>＋ Create sign</button>
        <div className="sign-list-items">{layouts.filter(item => !item.isStarter).map(item => <button key={item.id}
          className={item.id === layout?.id ? "active" : ""} onClick={() => onOpenLayout(item)}>
          <i aria-hidden="true">▭</i><span><strong>{item.name}</strong><small>{item.folder || "All displays"}</small></span><b className={item.publishState}>{item.publishedVersion ? "Active" : "Draft"}</b>
        </button>)}</div>
        <button className="manage-signs-button" onClick={onClose}>‹ Back to layouts</button>
      </aside>
      <div className="layout-canvas-scroll">
        <div className="layout-canvas-heading"><div><strong>Live canvas</strong><small>{width} × {height} · {zones.length} element{zones.length === 1 ? "" : "s"}</small></div>
          <span>{showFrameBuilder ? "FRAME PREVIEW" : selected.length ? `${selected.length} SELECTED` : "CLICK AN ELEMENT TO EDIT"}</span></div>
        <p id="layout-canvas-keyboard-help" className="sr-only">
          Select an element with Enter or Space. Arrow keys move it; hold Shift for larger steps.
          Alt plus an arrow resizes it. Left and right brackets rotate it. Control or Command
          plus an arrow changes its layer order. Exact values are also available in the inspector.
        </p>
        <div ref={canvas} className={`layout-canvas ${snap ? "show-grid" : ""} ${hand ? "hand" : ""}`}
          style={{ width: `${zoom}%`, aspectRatio: aspect, background: showFrameBuilder ? frameColor : background, "--grid": `${grid}%` } as CSSProperties}
          onPointerDown={beginCanvasGesture}>
          {showSafe && safeArea > 0 && <i className="layout-safe-area" style={{ inset: `${safeArea}%` }} />}
          {guides.vertical != null && <i className="layout-guide vertical" style={{ left: `${guides.vertical}%` }} />}
          {guides.horizontal != null && <i className="layout-guide horizontal" style={{ top: `${guides.horizontal}%` }} />}
          {displayZones.slice().sort((a, b) => a.zIndex - b.zIndex).map(zone => <div key={zone.id}
            role={showFrameBuilder ? undefined : "button"}
            tabIndex={showFrameBuilder ? -1 : 0}
            aria-label={showFrameBuilder ? undefined : `${zone.title || zone.type} element`}
            aria-pressed={showFrameBuilder ? undefined : selected.includes(zone.id)}
            aria-describedby={showFrameBuilder ? undefined : "layout-canvas-keyboard-help"}
            className={`layout-zone ${zone.type} ${!showFrameBuilder && selected.includes(zone.id) ? "selected" : ""} ${zone.hidden ? "hidden" : ""} ${zone.lockMode !== "none" || zone.locked ? "locked" : ""}`}
            onPointerDown={event => { if (!showFrameBuilder) gesture(event, zone, "move"); }}
            onKeyDown={event => keyboardGesture(event, zone)}
            style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%`,
              background: zone.backgroundColor, color: zone.textColor, borderColor: zone.accentColor, opacity: zone.opacity / 100,
              zIndex: zone.zIndex, transform: `rotate(${zone.rotation}deg) scaleX(${zone.flipX ? -1 : 1}) scaleY(${zone.flipY ? -1 : 1})`,
              borderRadius: `${zone.cornerRadius || 0}%`, fontFamily: zone.fontFamily,
              ["--signage-accent" as string]: zone.accentColor,
              ["--signage-line-height" as string]: `${Math.max(80, Math.min(300, zone.lineHeightPercent || 120)) / 100}`,
              fontWeight: zone.fontWeight, fontStyle: zone.italic ? "italic" : undefined, textDecoration: zone.underline ? "underline" : undefined,
              textAlign: zone.textAlign as CSSProperties["textAlign"] }}>
            <div className="layout-zone-content" style={{ fontSize: relativeElementFontSize(zone) }}>
              <ZoneVisual zone={zone} media={media} playlists={playlists} />
            </div>
            {!showFrameBuilder && selected.includes(zone.id) && zone.lockMode !== "position" && zone.lockMode !== "full" && !zone.locked && <>
              <i className="layout-resize" onPointerDown={event => gesture(event, zone, "resize")} />
              <i className="layout-rotate" onPointerDown={event => gesture(event, zone, "rotate")} />
            </>}
          </div>)}
        </div>
      </div>
      <aside className="layout-inspector">
        <div className="layout-inspector-tabs" role="tablist">
          <button role="tab" aria-selected={inspectorTab === "content"} className={inspectorTab === "content" ? "active" : ""}
            onClick={() => setInspectorTab("content")}>Content</button>
          <button role="tab" aria-selected={inspectorTab === "style"} className={inspectorTab === "style" ? "active" : ""}
            onClick={() => setInspectorTab("style")}>Style</button>
          <button role="tab" aria-selected={inspectorTab === "schedule"} className={inspectorTab === "schedule" ? "active" : ""}
            onClick={() => setInspectorTab("schedule")}>Schedule</button>
          <button role="tab" aria-selected={inspectorTab === "layers"} className={inspectorTab === "layers" ? "active" : ""}
            onClick={() => setInspectorTab("layers")}>Layers <span>{zones.length}</span></button>
        </div>
        {inspectorTab === "layers" && <><div className="layout-layer-heading"><strong>Canvas layers</strong><span>{selected.length} selected</span></div>
          <div className="layout-layers">{[...zones].sort((a,b) => b.zIndex-a.zIndex).map(zone => <div className={selected.includes(zone.id) ? "selected" : ""} key={zone.id}>
            <button aria-label={`Select ${zone.title || zone.type} layer`} onClick={event => {
              setSelected(event.metaKey || event.ctrlKey ? [...new Set([...selected, zone.id])] : [zone.id]);
              setInspectorTab("content");
            }}><i>{zone.hidden ? "○" : "●"}</i><span>{zone.title || zone.type}<small>{zone.type} · layer {zone.zIndex}{zone.groupId ? " · grouped" : ""}</small></span></button>
            <button title="Move layer up" onClick={() => reorder(zone.id, 1)}>↑</button><button title="Move layer down" onClick={() => reorder(zone.id, -1)}>↓</button>
          </div>)}</div></>}
        {inspectorTab === "content" && (current ? <ZoneInspector zone={current} media={media} playlists={playlists} onPatch={values => patch(current.id, values)}
          onDelete={() => { commit(zones.filter(zone => !selected.includes(zone.id))); setSelected([]); }}
          onDuplicate={() => { const copy = { ...current, id: id(), title: `${current.title || current.type} copy`, x: Math.min(95, current.x + 2), y: Math.min(95, current.y + 2), zIndex: zones.length + 1 }; commit([...zones, copy]); setSelected([copy.id]); }} /> :
          <div className="layout-element-list inspector-content-list">{ZONE_TYPES.map(([value, label]) => <button key={value} onClick={() => addElement(value)}><i aria-hidden="true">{zoneTypeIcon(value)}</i><span>{label}<small>{zoneTypeDescription(value)}</small></span><b>+</b></button>)}</div>)}
        {inspectorTab === "style" && <div className="studio-help inspector-empty"><i>✦</i><strong>{current ? "Style controls" : "Select an element"}</strong><p>{current ? "Use Content to edit its text and source, or Advanced layout controls for exact geometry, fonts, and colors." : "Select a panel on the sign to change its appearance."}</p></div>}
        {inspectorTab === "schedule" && <div className="studio-help inspector-empty"><i>◷</i><strong>Ready to schedule</strong><p>Save this sign, then use the Signage calendar to choose its displays, dates, and recurring schedule.</p></div>}
      </aside>
    </div>
    <div className="layout-editor-footer signage-publish-bar">
      <textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Layout description" />
      <label><input type="checkbox" checked={isTemplate} onChange={event => setIsTemplate(event.target.checked)} /> Save as reusable template</label>
      <label>Background audio <select value={audioId} onChange={event => setAudioId(event.target.value)}><option value="">None</option>{media.filter(item => item.contentType.startsWith("audio/")).map(item => <option value={item.id} key={item.id}>{item.fileName}</option>)}</select></label>
      {layout && <label>Safely replace draft <select defaultValue="" onChange={event => void replaceFrom(event.target.value)}><option value="">Choose template…</option>{templates.filter(item => item.id !== layout.id).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
      <span className="toolbar-spacer" /><button className="button" onClick={() => setShowBrowserPreview(true)}>Browser preview</button>
      <a className="button" href="/display" target="_blank" rel="noreferrer">Open permanent browser display</a>
      <button className="button" disabled={!!saving} onClick={() => void save(false)}>{saving === "draft" ? "Saving…" : "Save draft"}</button><button className="button primary" disabled={!!saving} onClick={() => void save(true)}>{saving === "publish" ? "Publishing…" : "Publish changes"}</button>
    </div>
    {showBrowserPreview && <StudioDialog title={`Browser preview · ${name}`} wide onClose={() => setShowBrowserPreview(false)}>
      <div className="browser-signage-preview" style={{ aspectRatio: aspect, background }}>
        {zones.filter(zone => !zone.hidden).sort((a, b) => a.zIndex - b.zIndex).map(zone => <div key={zone.id}
          className={`layout-zone ${zone.type}`} style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`,
            height: `${zone.height}%`, background: zone.backgroundColor, color: zone.textColor, borderColor: zone.accentColor,
            opacity: zone.opacity / 100, zIndex: zone.zIndex, transform: `rotate(${zone.rotation}deg)`,
            borderRadius: `${zone.cornerRadius || 0}%`, fontFamily: zone.fontFamily, fontWeight: zone.fontWeight,
            ["--signage-accent" as string]: zone.accentColor,
            ["--signage-line-height" as string]: `${Math.max(80, Math.min(300, zone.lineHeightPercent || 120)) / 100}`,
            textAlign: zone.textAlign as CSSProperties["textAlign"] }}>
          <div className="layout-zone-content" style={{ fontSize: relativeElementFontSize(zone) }}>
            <ZoneVisual zone={zone} media={media} playlists={playlists} />
          </div>
        </div>)}
      </div>
      <div className="layout-editor-footer"><span>This preview uses the current unsaved draft.</span><span className="toolbar-spacer" />
        <a className="button primary" href="/display" target="_blank" rel="noreferrer">Pair a permanent browser display</a></div>
    </StudioDialog>}
  </StudioDialog>;
}

function zoneTypeIcon(type: string) {
  return ({ text: "T", media: "▧", stream: "●", presentation: "▶", qr: "⌗", wifi: "⌁",
    ticker: "↔", counter: "◷", clock: "◴", weather: "☀", calendar: "▦", rss: "≋",
    webpage: "◎", customHtml: "</>" } as Record<string, string>)[type] || "+";
}

function zoneTypeDescription(type: string) {
  return ({ text: "Headings, notices, and messages", media: "Images, logos, audio, and video",
    stream: "HLS, RTMP, RTSP, or web streams", presentation: "A rotating signage playlist",
    qr: "A scannable web destination", wifi: "Guest network access",
    ticker: "A continuously scrolling message", counter: "One-time or weekly countdown",
    clock: "Flexible time and date display", weather: "Local conditions and forecast",
    calendar: "Upcoming events from an ICS feed", rss: "Headlines from an RSS feed",
    webpage: "A live approved webpage", customHtml: "Sandboxed custom web content" } as Record<string, string>)[type] || "";
}

function ZoneVisual({ zone, media, playlists }: { zone: Zone; media: StudioMedia[]; playlists: StudioPlaylist[] }) {
  const asset = media.find(item => item.id === zone.mediaAssetId);
  if (zone.type === "media" && asset) return asset.contentType.startsWith("image/") ? <img src={asset.thumbnailUrl || asset.downloadUrl} alt="" style={{ objectFit: zone.fit as CSSProperties["objectFit"] }} /> : <span>▶ {asset.fileName}</span>;
  if (zone.type === "clock") return <StudioClock zone={zone} />;
  if (zone.type === "weather") {
    const fields = weatherFieldSet(zone);
    const unit = zone.weatherUnits === "celsius" ? "°C" : "°F";
    return <div className={`zone-weather-preview layout-${zone.weatherLayout || "icon-left"}`}>
      <strong className="zone-weather-title">{zone.weatherLocation || zone.title || "Local weather"}</strong>
      <div className="zone-weather-main">
        {fields.has("icon") && <i aria-hidden="true">☀️</i>}
        <span><b>{fields.has("temperature") ? `70${unit}` : "Weather"}</b>
          {fields.has("conditions") && <em>Sunny</em>}</span>
      </div>
      {(fields.has("high") || fields.has("low") || fields.has("humidity") || fields.has("wind")) &&
        <ul className="zone-weather-details">
          {(fields.has("high") || fields.has("low")) && <li>H75° / L59°</li>}
          {fields.has("humidity") && <li>Humidity 50%</li>}
          {fields.has("wind") && <li>5 mph NW</li>}
        </ul>}
    </div>;
  }
  if (zone.type === "calendar") {
    const fields = calendarFieldSet(zone);
    const count = Math.max(1, Math.min(20, zone.calendarMaxItems || 4));
    return <div className="zone-calendar-preview">
      <strong className="zone-calendar-heading">{zone.title || "Upcoming events"}</strong>
      {Array.from({ length: count }, (_, index) => <article key={index}>
        {fields.has("title") && <b>Event Title</b>}
        {(fields.has("date") || fields.has("time")) && <time>
          {fields.has("date") && <span>August 1</span>}
          {fields.has("time") && <span>7:00pm–10:00pm</span>}
        </time>}
        {fields.has("description") && <p>Event details appear here.</p>}
        {fields.has("location") && <small>Room or location</small>}
      </article>)}
    </div>;
  }
  if (zone.type === "qr" || zone.type === "wifi") return <StudioQr zone={zone} />;
  if (zone.type === "counter") return <StudioCounter target={zone.counterTargetAt}
    repeatWeekly={zone.counterRepeatWeekly || false} template={zone.content || "[countdown]"} />;
  if (zone.type === "ticker") return <span className="zone-ticker" style={{ animationDuration: `${Math.max(5, 300 / Math.max(10, zone.tickerSpeed || 60))}s` }}>{zone.content || "Ticker message"}</span>;
  if (zone.type === "stream") return <span>● LIVE · {zone.sourceUrl ? new URL(zone.sourceUrl).protocol.replace(":", "").toUpperCase() : "stream"}</span>;
  if (zone.type === "presentation") {
    const playlist = playlists.find(item => item.id === zone.contentPlaylistId);
    return <span className="zone-presentation-preview"><small>PRESENTATION AREA</small>
      <strong>{playlist?.name || "Choose a signage playlist"}</strong>
      <em>{zone.streamOverrideWhenLive && zone.sourceUrl ? "Live stream overrides while available" : "Playlist playback"}</em></span>;
  }
  if (zone.type === "webpage") return zone.sourceUrl
    ? <iframe src={zone.sourceUrl} title={zone.title || "Webpage preview"} sandbox="allow-forms allow-same-origin allow-scripts" />
    : <><small>{zone.title || "Webpage"}</small><strong>Enter a webpage address</strong></>;
  if (zone.type === "customHtml") return zone.content
    ? <iframe srcDoc={zone.content} title={zone.title || "Custom HTML preview"}
      sandbox="allow-forms allow-modals allow-popups allow-scripts" />
    : <><small>{zone.title || "Custom HTML"}</small><strong>Enter HTML content</strong></>;
  if (zone.type === "text" && zone.richTextJson) return <><small>{zone.title || zone.type}</small><RichTextPreview value={zone.richTextJson} fallback={zone.content || ""} /></>;
  return <><small>{zone.title || zone.type}</small><strong>{zone.content || zone.type}</strong></>;
}

function StudioQr({ zone }: { zone: Zone }) {
  return <span className={`zone-qr-layout placement-${zone.qrPlacement || "center"}`}>
    {zone.qrLabelTop && <small className="qr-label top">{zone.qrLabelTop}</small>}
    {zone.qrLabelLeft && <small className="qr-label left">{zone.qrLabelLeft}</small>}
    <span className="zone-qr">{zone.qrValue ? <GeneratedStudioQr value={zone.qrValue} /> : <small>Enter a QR destination</small>}</span>
    {zone.qrLabelRight && <small className="qr-label right">{zone.qrLabelRight}</small>}
    {zone.qrLabelBottom && <small className="qr-label bottom">{zone.qrLabelBottom}</small>}
  </span>;
}

function GeneratedStudioQr({ value }: { value: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let current = true;
    void QRCode.toDataURL(value, { width: 360, margin: 1, errorCorrectionLevel: "M" })
      .then(url => { if (current) setSource(url); });
    return () => { current = false; };
  }, [value]);
  return source ? <img src={source} alt="QR preview" /> : null;
}

function StudioCounter({ target, repeatWeekly, template }: { target?: string; repeatWeekly: boolean; template: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = window.requestAnimationFrame(() => setNow(Date.now()));
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.cancelAnimationFrame(first); window.clearInterval(timer); };
  }, []);
  if (!target || now == null) return <strong>{template.replace("[countdown]", "Countdown")}</strong>;
  const total = Math.max(0, Math.floor((nextCounterTarget(target, repeatWeekly, now) - now) / 1_000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor(total % 86_400 / 3_600);
  const minutes = Math.floor(total % 3_600 / 60);
  const seconds = total % 60;
  const clock = [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
  const countdown = days ? `${days} days  ${clock}` : clock;
  return <strong>{template.includes("[countdown]") ? template.replaceAll("[countdown]", countdown) : `${template} ${countdown}`}</strong>;
}

function nextCounterTarget(target: string, repeatWeekly: boolean, now = Date.now()) {
  const parsed = new Date(target);
  if (!repeatWeekly || Number.isNaN(parsed.getTime())) return parsed.getTime();
  const current = new Date(now);
  const next = new Date(current);
  next.setHours(parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), 0);
  const days = (parsed.getDay() - current.getDay() + 7) % 7;
  next.setDate(current.getDate() + days);
  if (next.getTime() <= now) next.setDate(next.getDate() + 7);
  return next.getTime();
}

function StudioClock({ zone }: { zone: Zone }) {
  const now = new Date();
  const twentyFour = zone.clockTimeFormat?.startsWith("24h");
  const seconds = zone.clockTimeFormat?.endsWith("seconds");
  const time = now.toLocaleTimeString([], {
    hour: "numeric", minute: "2-digit", second: seconds ? "2-digit" : undefined, hour12: !twentyFour
  });
  const dateOptions: Intl.DateTimeFormatOptions = zone.clockDateFormat === "numeric"
    ? { year: "numeric", month: "2-digit", day: "2-digit" }
    : zone.clockDateFormat === "short" ? { month: "short", day: "numeric" }
      : zone.clockDateFormat === "medium" ? { weekday: "short", month: "short", day: "numeric" }
        : { weekday: "long", month: "long", day: "numeric", year: "numeric" };
  const date = now.toLocaleDateString([], dateOptions);
  const parts = [];
  if (zone.clockDisplay !== "date") parts.push(<b className="clock-time" key="time">{time}</b>);
  if (zone.clockDisplay !== "time") parts.push(<span className="clock-date" key="date">{date}</span>);
  if (zone.clockOrder === "date-time") parts.reverse();
  return <span className={`zone-clock ${zone.clockOrder === "inline" ? "inline" : ""}`}>{parts}</span>;
}

function RichTextPreview({ value, fallback }: { value: string; fallback: string }) {
  let runs: { text?: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string }[] = [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) runs = parsed;
  } catch { /* The plain text fallback remains visible for malformed draft data. */ }
  if (!runs.length) return <strong>{fallback}</strong>;
  return <strong>{runs.slice(0, 50).map((run, index) => <span key={index} style={{
    color: run.color, fontWeight: run.bold ? 800 : undefined, fontStyle: run.italic ? "italic" : undefined,
    textDecoration: run.underline ? "underline" : undefined
  }}>{run.text || ""}</span>)}</strong>;
}

function ZoneInspector({ zone, media, playlists, onPatch, onDelete, onDuplicate }: {
  zone: Zone; media: StudioMedia[]; playlists: StudioPlaylist[];
  onPatch: (patch: Partial<Zone>) => void; onDelete: () => void; onDuplicate: () => void;
}) {
  const online = ["stream","weather","calendar","rss","webpage"].includes(zone.type);
  const contentLocked = zone.lockMode === "content" || zone.lockMode === "full";
  const positionLocked = zone.lockMode === "position" || zone.lockMode === "full" || zone.locked;
  const fullyLocked = zone.lockMode === "full";
  const wifi = parseWifiQr(zone.qrValue);
  const weatherFields = weatherFieldSet(zone);
  const patchWeatherField = (field: string, checked: boolean) => {
    const next = new Set(weatherFields);
    if (checked) next.add(field); else next.delete(field);
    onPatch({ weatherFields: [...next].join(",") });
  };
  return <div className="zone-inspector">
    <label>Type <select disabled={contentLocked} value={zone.type} onChange={event => onPatch({ type: event.target.value })}>{ZONE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Title <input disabled={contentLocked} value={zone.title || ""} onChange={event => onPatch({ title: event.target.value })} /></label>
    {zone.type === "media" && <label>Media <select disabled={contentLocked} value={zone.mediaAssetId || ""} onChange={event => onPatch({ mediaAssetId: event.target.value || undefined })}><option value="">Choose media…</option>{media.filter(item => item.contentType.startsWith("image/") || item.contentType.startsWith("video/")).map(item => <option value={item.id} key={item.id}>{item.fileName}</option>)}</select></label>}
    {!["media","stream","presentation","qr","wifi","clock","weather","counter"].includes(zone.type) && <label>{zone.type === "customHtml" ? "HTML" : "Content"}
      <textarea disabled={contentLocked} value={zone.content || ""}
        placeholder={zone.type === "counter" ? "Example: Services start in [countdown]" : zone.type === "customHtml" ? "<main>Custom sign content</main>" : undefined}
        onChange={event => onPatch({ content: event.target.value })} /></label>}
    {!['media','presentation','stream','webpage','customHtml'].includes(zone.type) && !contentLocked && <RichTextRunsEditor value={zone.richTextJson} onChange={richTextJson => onPatch({ richTextJson })} />}
    {zone.type === "weather" && <fieldset className="weather-settings"><legend>Weather source and display</legend>
      <label>Provider <select disabled={contentLocked} value={zone.weatherProvider || "open-meteo"} onChange={event => onPatch({ weatherProvider: event.target.value as Zone["weatherProvider"] })}>
        <option value="open-meteo">Open-Meteo · global, no key</option>
        <option value="nws">National Weather Service · US, no key</option>
        <option value="custom">Custom approved weather API</option>
      </select></label>
      <label>Location label <input disabled={contentLocked} value={zone.weatherLocation || ""} onChange={event => onPatch({ weatherLocation: event.target.value })} placeholder="Bellingham, WA" /></label>
      {zone.weatherProvider !== "custom" && <label>Postal code <input disabled={contentLocked}
        value={zone.weatherPostalCode || ""} onChange={event => onPatch({ weatherPostalCode: event.target.value })}
        placeholder="98225" /><small>Enter a postal code, or use exact coordinates below.</small></label>}
      <div className="inspector-grid"><label>Latitude<input disabled={contentLocked} type="number" min="-90" max="90" step="0.0001" value={zone.weatherLatitude ?? ""} onChange={event => onPatch({ weatherLatitude: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="48.7519" /></label><label>Longitude<input disabled={contentLocked} type="number" min="-180" max="180" step="0.0001" value={zone.weatherLongitude ?? ""} onChange={event => onPatch({ weatherLongitude: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="-122.4787" /></label></div>
      <label>Units <select disabled={contentLocked} value={zone.weatherUnits || "fahrenheit"} onChange={event => onPatch({ weatherUnits: event.target.value as Zone["weatherUnits"] })}><option value="fahrenheit">Fahrenheit</option><option value="celsius">Celsius</option></select></label>
      <label>Layout <select disabled={contentLocked} value={zone.weatherLayout || "icon-left"} onChange={event => onPatch({ weatherLayout: event.target.value as Zone["weatherLayout"] })}><option value="icon-left">Icon left · horizontal</option><option value="icon-top">Icon above · stacked</option><option value="icon-right">Icon right · horizontal</option><option value="compact">Compact</option></select></label>
      <label>Icon style <select disabled={contentLocked} value={zone.weatherIconStyle || "color"} onChange={event => onPatch({ weatherIconStyle: event.target.value as Zone["weatherIconStyle"] })}><option value="color">Color</option><option value="white">White</option></select></label>
      <div className="weather-field-grid">{WEATHER_FIELDS.map(([value, label]) => <label key={value}><input disabled={contentLocked} type="checkbox" checked={weatherFields.has(value)} onChange={event => patchWeatherField(value, event.target.checked)} /> {label}</label>)}</div>
      <small>Weather is fetched by the local LessonCue server and cached for displays. No browser or display receives an API credential.</small>
    </fieldset>}
    {zone.type === "presentation" && <fieldset className="weather-settings"><legend>Presentation playback</legend>
      <label>Default signage playlist<select disabled={contentLocked} value={zone.contentPlaylistId || ""}
        onChange={event => onPatch({ contentPlaylistId: event.target.value || undefined })}><option value="">Choose a published playlist…</option>
        {playlists.filter(item => item.publishedVersion > 0).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className="check-row"><input disabled={contentLocked} type="checkbox"
        checked={zone.streamOverrideWhenLive || false}
        onChange={event => onPatch({ streamOverrideWhenLive: event.target.checked })} /> Override the playlist while a live stream is available</label>
      {zone.streamOverrideWhenLive && <label>Live stream address<input disabled={contentLocked} type="text"
        value={zone.sourceUrl || ""} onChange={event => onPatch({ sourceUrl: event.target.value })}
        placeholder="rtmp://…, rtsp://…, or https://…m3u8" /></label>}
      <small>The playlist returns automatically whenever the live feed ends or becomes unavailable.</small>
    </fieldset>}
    {online && (zone.type !== "weather" || zone.weatherProvider === "custom") && <label>Source URL <input disabled={contentLocked}
      type={zone.type === "stream" ? "text" : "url"} value={zone.sourceUrl || ""}
      onChange={event => onPatch({ sourceUrl: event.target.value })}
      placeholder={zone.type === "stream" ? "rtmp://…, rtsp://…, or https://…" : zone.type === "calendar" ? "https://calendar.example.org/events.ics" : "https://…"} />
      {zone.type === "calendar" && <small>Paste an approved iCalendar (.ics) feed. LessonCue refreshes upcoming event summaries locally for every display.</small>}</label>}
    {zone.type === "calendar" && <fieldset className="weather-settings"><legend>Calendar display</legend>
      <label>Maximum events <input disabled={contentLocked} type="number" min="1" max="20" value={zone.calendarMaxItems || 4} onChange={event => onPatch({ calendarMaxItems: Math.max(1, Math.min(20, Number(event.target.value) || 4)) })} /></label>
      <div className="weather-field-grid">{CALENDAR_FIELDS.map(([value, label]) => <label key={value}><input disabled={contentLocked} type="checkbox" checked={calendarFieldSet(zone).has(value)} onChange={event => {
        const next = calendarFieldSet(zone); if (event.target.checked) next.add(value); else next.delete(value);
        onPatch({ calendarFields: [...next].join(",") });
      }} /> {label}</label>)}</div>
      <small>Descriptions are optional and stay hidden by default to keep the event list compact.</small>
    </fieldset>}
    {online && zone.type !== "stream" && (zone.type !== "weather" || zone.weatherProvider === "custom") && <label>Server credential key <input disabled={contentLocked} value={zone.credentialKey || ""} onChange={event => onPatch({ credentialKey: event.target.value || undefined })} placeholder="Optional saved key" /></label>}
    {zone.type === "qr" && <label>QR destination<input disabled={contentLocked} value={zone.qrValue || ""} onChange={event => onPatch({ qrValue: event.target.value })} placeholder="https://…" /></label>}
    {zone.type === "wifi" && <fieldset className="weather-settings"><legend>Wi-Fi QR code</legend>
      <label>Network name (SSID)<input disabled={contentLocked} value={wifi.ssid} onChange={event => onPatch({ qrValue: makeWifiQr(wifi.security, event.target.value, wifi.password) })} /></label>
      <label>Security<select disabled={contentLocked} value={wifi.security} onChange={event => onPatch({ qrValue: makeWifiQr(event.target.value, wifi.ssid, wifi.password) })}><option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">No password</option></select></label>
      {wifi.security !== "nopass" && <label>Password<input disabled={contentLocked} type="password" value={wifi.password} onChange={event => onPatch({ qrValue: makeWifiQr(wifi.security, wifi.ssid, event.target.value) })} autoComplete="new-password" /></label>}
      <small>The password is encoded in the QR code and therefore visible to anyone who scans it. Use a guest network.</small>
    </fieldset>}
    {(zone.type === "qr" || zone.type === "wifi") && <fieldset className="weather-settings"><legend>Optional QR labels</legend>
      <label>QR placement <select disabled={contentLocked} value={zone.qrPlacement || "center"} onChange={event => onPatch({ qrPlacement: event.target.value as Zone["qrPlacement"] })}><option value="center">Centered</option><option value="left">Left aligned</option><option value="right">Right aligned</option></select><small>Left or right placement leaves a normal horizontal label area on the opposite side.</small></label>
      <label>Above<input disabled={contentLocked} value={zone.qrLabelTop || ""} onChange={event => onPatch({ qrLabelTop: event.target.value })} /></label>
      <label>Below<input disabled={contentLocked} value={zone.qrLabelBottom || ""} onChange={event => onPatch({ qrLabelBottom: event.target.value })} /></label>
      <label>Left<input disabled={contentLocked} value={zone.qrLabelLeft || ""} onChange={event => onPatch({ qrLabelLeft: event.target.value })} /></label>
      <label>Right<input disabled={contentLocked} value={zone.qrLabelRight || ""} onChange={event => onPatch({ qrLabelRight: event.target.value })} /></label>
      <small>Use any combination. LessonCue keeps the labels and QR code inside this element’s boundary.</small>
    </fieldset>}
    {zone.type === "counter" && <fieldset className="weather-settings"><legend>Countdown schedule</legend>
      <label>Target time <input disabled={contentLocked} type="datetime-local" value={zone.counterTargetAt?.slice(0,16) || ""} onChange={event => onPatch({ counterTargetAt: event.target.value ? new Date(event.target.value).toISOString() : undefined })} /></label>
      <label className="check-row"><input disabled={contentLocked} type="checkbox" checked={zone.counterRepeatWeekly || false}
        onChange={event => onPatch({ counterRepeatWeekly: event.target.checked })} /> Repeat every week on this weekday and time</label>
      <label>Displayed sentence<textarea disabled={contentLocked} value={zone.content || ""}
        onChange={event => onPatch({ content: event.target.value })} placeholder="Services start in [countdown]" /></label>
      <small>Use [countdown] wherever the live timer should appear.</small>
    </fieldset>}
    {zone.type === "clock" && <fieldset className="weather-settings"><legend>Time and date</legend>
      <label>Show<select disabled={contentLocked} value={zone.clockDisplay || "both"} onChange={event => onPatch({ clockDisplay: event.target.value as Zone["clockDisplay"] })}><option value="time">Time only</option><option value="date">Date only</option><option value="both">Time and date</option></select></label>
      <label>Time format<select disabled={contentLocked} value={zone.clockTimeFormat || "12h"} onChange={event => onPatch({ clockTimeFormat: event.target.value as Zone["clockTimeFormat"] })}><option value="12h">12-hour</option><option value="12h-seconds">12-hour with seconds</option><option value="24h">24-hour</option><option value="24h-seconds">24-hour with seconds</option></select></label>
      <label>Date format<select disabled={contentLocked} value={zone.clockDateFormat || "long"} onChange={event => onPatch({ clockDateFormat: event.target.value as Zone["clockDateFormat"] })}><option value="long">Long · Saturday, July 25, 2026</option><option value="medium">Medium · Sat, Jul 25</option><option value="short">Short · Jul 25</option><option value="numeric">Numeric · 07/25/2026</option></select></label>
      <label>Order<select disabled={contentLocked} value={zone.clockOrder || "time-date"} onChange={event => onPatch({ clockOrder: event.target.value as Zone["clockOrder"] })}><option value="time-date">Time above date</option><option value="date-time">Date above time</option><option value="inline">Time and date side by side</option></select></label>
      <small>Time and date scale automatically with this panel. Resize the panel to change their visual size.</small>
    </fieldset>}
    {zone.type === "customHtml" && <small className="credential-note">Custom HTML runs in an isolated frame with scripts, forms, and network requests enabled. Remote requests still follow the destination server’s CORS policy.</small>}
    {zone.type === "ticker" && <label>Speed <input disabled={contentLocked} type="range" min="10" max="300" value={zone.tickerSpeed || 60} onChange={event => onPatch({ tickerSpeed: Number(event.target.value) })} /></label>}
    <div className="inspector-grid"><label>X (%)<input disabled={positionLocked} type="number" value={zone.x} onChange={event => onPatch({ x: Number(event.target.value) })} /></label><label>Y (%)<input disabled={positionLocked} type="number" value={zone.y} onChange={event => onPatch({ y: Number(event.target.value) })} /></label><label>W (%)<input disabled={positionLocked} type="number" value={zone.width} onChange={event => onPatch({ width: Number(event.target.value) })} /></label><label>H (%)<input disabled={positionLocked} type="number" value={zone.height} onChange={event => onPatch({ height: Number(event.target.value) })} /></label><label>°<input disabled={positionLocked} type="number" min="-180" max="180" value={zone.rotation} onChange={event => onPatch({ rotation: Number(event.target.value) })} /></label><label>Opacity<input disabled={fullyLocked} type="number" min="0" max="100" value={zone.opacity} onChange={event => onPatch({ opacity: Number(event.target.value) })} /></label></div>
    <div className="inspector-grid"><label>Background<input disabled={fullyLocked} type="color" value={zone.backgroundColor} onChange={event => onPatch({ backgroundColor: event.target.value })} /></label><label>Text<input disabled={fullyLocked} type="color" value={zone.textColor} onChange={event => onPatch({ textColor: event.target.value })} /></label><label>Border<input disabled={fullyLocked} type="color" value={zone.accentColor || "#d89127"} onChange={event => onPatch({ accentColor: event.target.value })} /></label><label>Radius<input disabled={fullyLocked} type="number" min="0" max="100" value={zone.cornerRadius || 0} onChange={event => onPatch({ cornerRadius: Number(event.target.value) })} /></label></div>
    {!['media','presentation','stream','webpage','customHtml'].includes(zone.type) && <><label>Font <select value={zone.fontFamily || "system-ui"} onChange={event => onPatch({ fontFamily: event.target.value })}><option value="system-ui">System</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="monospace">Monospace</option></select></label><div className="inspector-grid"><label>Text scale (%)<input type="number" min="1" max="40" step="0.5" value={zone.fontScalePercent || 10} onChange={event => onPatch({ fontScalePercent: Math.max(1, Math.min(40, Number(event.target.value) || 10)) })} /></label><label>Weight<input type="number" min="100" max="900" step="100" value={zone.fontWeight || 600} onChange={event => onPatch({ fontWeight: Number(event.target.value) })} /></label><label>Align<select value={zone.textAlign || "left"} onChange={event => onPatch({ textAlign: event.target.value })}><option>left</option><option>center</option><option>right</option><option>justify</option></select></label><label>Line %<input type="number" min="80" max="300" value={zone.lineHeightPercent || 120} onChange={event => onPatch({ lineHeightPercent: Number(event.target.value) })} /></label></div><small>Text uses this percentage of the panel’s smaller dimension, so it stays proportional when the panel is resized.</small><div className="inline-checks"><label><input type="checkbox" checked={zone.italic || false} onChange={event => onPatch({ italic: event.target.checked })} /> Italic</label><label><input type="checkbox" checked={zone.underline || false} onChange={event => onPatch({ underline: event.target.checked })} /> Underline</label></div></>}
    <label>Lock <select value={zone.lockMode || (zone.locked ? "position" : "none")} onChange={event => onPatch({ lockMode: event.target.value as Zone["lockMode"], locked: false })}><option value="none">Unlocked</option><option value="position">Position and size</option><option value="content">Content</option><option value="full">Everything</option></select></label>
    <div className="inline-checks"><label><input disabled={fullyLocked} type="checkbox" checked={zone.hidden} onChange={event => onPatch({ hidden: event.target.checked })} /> Hidden</label><label><input disabled={positionLocked} type="checkbox" checked={zone.flipX} onChange={event => onPatch({ flipX: event.target.checked })} /> Flip X</label><label><input disabled={positionLocked} type="checkbox" checked={zone.flipY} onChange={event => onPatch({ flipY: event.target.checked })} /> Flip Y</label></div>
    <div className="studio-card-actions"><button disabled={fullyLocked} onClick={onDuplicate}>Duplicate</button><button disabled={fullyLocked} className="danger" onClick={onDelete}>Delete selected</button></div>
  </div>;
}

function RichTextRunsEditor({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string };
  let parsed: Run[] = [];
  try { const candidate = JSON.parse(value || "[]"); if (Array.isArray(candidate)) parsed = candidate; } catch { parsed = []; }
  const runs = parsed;
  const update = (next: Run[]) => onChange(JSON.stringify(next.slice(0, 50)));
  return <details className="rich-text-runs"><summary>Mixed text formatting</summary><p>Optional runs override the plain fallback content above.</p>{runs.map((run,index)=><div key={index}><input value={run.text} placeholder="Text run" onChange={event=>update(runs.map((item,itemIndex)=>itemIndex===index?{...item,text:event.target.value}:item))}/><input type="color" value={run.color||"#ffffff"} onChange={event=>update(runs.map((item,itemIndex)=>itemIndex===index?{...item,color:event.target.value}:item))}/><button className={run.bold?"active":""} onClick={()=>update(runs.map((item,itemIndex)=>itemIndex===index?{...item,bold:!item.bold}:item))}>B</button><button className={run.italic?"active":""} onClick={()=>update(runs.map((item,itemIndex)=>itemIndex===index?{...item,italic:!item.italic}:item))}>I</button><button className={run.underline?"active":""} onClick={()=>update(runs.map((item,itemIndex)=>itemIndex===index?{...item,underline:!item.underline}:item))}>U</button><button onClick={()=>update(runs.filter((_,itemIndex)=>itemIndex!==index))}>×</button></div>)}<button onClick={()=>update([...runs,{text:"New text",color:"#ffffff"}])}>+ Formatted run</button></details>;
}

function CredentialsDialog({ notify, onClose }: { notify: (message: string) => void; onClose: () => void }) {
  const [items, setItems] = useState<{ key: string; kind: string; username?: string; headerName?: string; updatedAt: string }[]>([]);
  const load = () => studioApi<typeof items>("/credentials").then(setItems).catch(error => notify(errorText(error)));
  useEffect(() => { void load(); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await studioApi(`/credentials/${encodeURIComponent(String(values.key))}`, { method: "PUT", body: JSON.stringify(values) }); (event.currentTarget).reset(); load(); notify("Source credential encrypted and saved only on this server."); }
    catch (error) { notify(errorText(error)); }
  }
  async function remove(key: string) { if (!await confirmAction(`Delete server credential ${key}? Widgets using it will retain cached data but cannot refresh.`, { destructive: true })) return; try { await studioApi(`/credentials/${encodeURIComponent(key)}`, { method: "DELETE" }); load(); } catch(error) { notify(errorText(error)); } }
  return <StudioDialog title="Server-side source credentials" onClose={onClose}><div className="credential-note">Secrets are encrypted with this LessonCue server’s local data-protection keys. They never appear in display manifests, browser storage, GitHub, backups, or API responses.</div><form className="studio-form credential-form" onSubmit={save}><label>Key<input name="key" required pattern="[a-z0-9_-]{2,120}" placeholder="weather_api" /></label><label>Authentication<select name="kind"><option value="bearer">Bearer token</option><option value="basic">Basic username/password</option><option value="custom">Custom header</option></select></label><label>Username (Basic only)<input name="username" /></label><label>Header name (Custom only)<input name="headerName" placeholder="X-API-Key" /></label><label>Secret<input name="secret" type="password" required autoComplete="new-password" /></label><button className="button primary">Encrypt and save locally</button></form><div className="credential-list">{items.map(item=><div key={item.key}><span><strong>{item.key}</strong><small>{item.kind}{item.username?` · ${item.username}`:""}{item.headerName?` · ${item.headerName}`:""} · updated {timeAgo(item.updatedAt)}</small></span><button className="danger" onClick={()=>remove(item.key)}>Delete</button></div>)}</div></StudioDialog>;
}

function PlaylistsPanel({ media, notify }: Props) {
  const [playlists, setPlaylists] = useState<StudioPlaylist[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [editing, setEditing] = useState<StudioPlaylist | "new">();
  const [query, setQuery] = useState("");
  const load = () => Promise.all([studioApi<StudioPlaylist[]>("/playlists"), studioApi<Layout[]>("/layouts")])
    .then(([nextPlaylists, nextLayouts]) => { setPlaylists(nextPlaylists); setLayouts(nextLayouts); }).catch(error => notify(errorText(error)));
  useEffect(() => { void load(); }, []);
  async function duplicate(item: StudioPlaylist) { try { await studioApi(`/playlists/${item.id}/duplicate`, { method: "POST", body: "{}" }); load(); notify("Playlist duplicated."); } catch (error) { notify(errorText(error)); } }
  async function remove(item: StudioPlaylist) { if (!await confirmAction(`Delete ${item.name}?`, { destructive: true })) return; try { await studioApi(`/playlists/${item.id}`, { method: "DELETE" }); load(); notify("Playlist deleted."); } catch(error) { notify(errorText(error)); } }
  return <section className="studio-panel"><div className="studio-toolbar panel"><div><strong>Independent signage playlists</strong><small>Mix layouts, media, apps, webpages, nested lists, tags, CSV, and cloud sources.</small></div><input type="search" placeholder="Search playlists" value={query} onChange={event => setQuery(event.target.value)} /><button className="button primary" onClick={() => setEditing("new")}>New playlist</button></div>
    <div className="studio-card-grid">{playlists.filter(item => `${item.name} ${item.folder}`.toLowerCase().includes(query.toLowerCase())).map(item => <article className="studio-resource-card playlist-card" key={item.id}><div className="playlist-preview">{item.items.slice(0,5).map((entry,index) => <i key={entry.id} style={{ zIndex: 5-index }}>{entry.kind.slice(0,1).toUpperCase()}</i>)}</div><div className="studio-resource-body"><span className={`studio-state ${item.publishState}`}>{item.publishState}</span><h3>{item.name}</h3><p>{item.folder || "Unfiled"} · {item.items.length} entries · {item.playbackMode} · {item.synchronization} sync</p><small>Draft v{item.version}{item.publishedVersion ? ` · published v${item.publishedVersion}` : ""}</small><div className="studio-card-actions"><button onClick={() => setEditing(item)}>Edit</button><button onClick={() => duplicate(item)}>Duplicate</button><button className="danger" onClick={() => remove(item)}>Delete</button></div></div></article>)}</div>
    {editing && <PlaylistEditor playlist={editing === "new" ? undefined : editing} playlists={playlists} layouts={layouts} media={media} notify={notify} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); load(); }} />}
  </section>;
}

function PlaylistEditor({ playlist, playlists, layouts, media, notify, onClose, onSaved }: {
  playlist?: StudioPlaylist; playlists: StudioPlaylist[]; layouts: Layout[]; media: StudioMedia[]; notify: (message:string)=>void; onClose:()=>void; onSaved:()=>void;
}) {
  const [name, setName] = useState(playlist?.name || "Untitled playlist");
  const [folder, setFolder] = useState(playlist?.folder || "");
  const [mode, setMode] = useState(playlist?.playbackMode || "ordered");
  const [sync, setSync] = useState(playlist?.synchronization || "screen");
  const [items, setItems] = useState<PlaylistEntry[]>(playlist?.items || []);
  const [preview, setPreview] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [saving, setSaving] = useState<"draft" | "publish" | undefined>();
  const add = (kind: PlaylistEntry["kind"]) => setItems(all => [...all, { id: id(), kind, title: `New ${kind}`, durationSeconds: 10, transition: "cut", hidden: false, transparent: false }]);
  const patch = (entryId:string, values:Partial<PlaylistEntry>) => setItems(all => all.map(item => item.id === entryId ? { ...item, ...values } : item));
  const move = (index:number, delta:number) => setItems(all => { const next=[...all]; const target=index+delta; if(target<0||target>=next.length)return all; [next[index],next[target]]=[next[target],next[index]]; return next; });
  async function save(publish=false) {
    if (!name.trim()) return notify("Enter a playlist name.");
    setSaving(publish ? "publish" : "draft");
    try {
      const payload={name,folder,playbackMode:mode,synchronization:sync,items};
      const saved=await studioApi<StudioPlaylist>(playlist?`/playlists/${playlist.id}`:"/playlists",{method:playlist?"PUT":"POST",body:JSON.stringify(payload)});
      if(publish) await studioApi(`/playlists/${saved.id}/publish`,{method:"POST",body:JSON.stringify({pushToScreens:true})});
      notify(publish?"Playlist published and screens notified.":"Playlist draft saved."); onSaved();
    } catch(error){notify(`Could not ${publish ? "publish" : "save"} playlist: ${errorText(error)}`);}
    finally { setSaving(undefined); }
  }
  function importCsv(file?:File) {
    if(!file)return; file.text().then(text => {
      const rows=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean); const imported=rows.slice(1).map(line=>line.split(",")).filter(parts=>parts.length).map(parts=>({id:id(),kind:(parts[0]||"web") as PlaylistEntry["kind"],title:parts[1]||"Imported entry",sourceUrl:parts[2]||undefined,durationSeconds:Number(parts[3]||10),transition:"cut" as const,hidden:false,transparent:false}));
      setItems(all=>[...all,...imported]); notify(`Imported ${imported.length} CSV entries.`);
    });
  }
  const activeItems=items.filter(item=>!item.hidden);
  const active=activeItems[preview % Math.max(1,activeItems.length)];
  useEffect(() => {
    if (!previewPlaying || !active) return;
    const timer = window.setTimeout(() => setPreview(value => value + 1), Math.max(1, Math.min(60, active.durationSeconds)) * 1000);
    return () => window.clearTimeout(timer);
  }, [previewPlaying, preview, active?.id, active?.durationSeconds]);
  return <StudioDialog title={playlist?`Playlist · ${playlist.name}`:"New signage playlist"} wide onClose={onClose}>
    <div className="playlist-editor-head"><input value={name} onChange={event=>setName(event.target.value)} placeholder="Playlist name"/><input value={folder} onChange={event=>setFolder(event.target.value)} placeholder="Folder"/><label>Playback<select value={mode} onChange={event=>setMode(event.target.value as typeof mode)}><option value="ordered">Ordered</option><option value="random">Random</option><option value="tag">Dynamic tags</option><option value="interactive">Interactive</option></select></label><label>Sync<select value={sync} onChange={event=>setSync(event.target.value as typeof sync)}><option value="screen">Per screen</option><option value="region">Region synchronized</option><option value="global">All screens synchronized</option></select></label></div>
    <div className="playlist-addbar">{(["layout","media","app","web","nested","tag","cloud","csv"] as PlaylistEntry["kind"][]).map(kind=><button key={kind} onClick={()=>add(kind)}>+ {kind}</button>)}<label className="button">Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={event=>importCsv(event.target.files?.[0])}/></label></div>
    <div className="playlist-editor-grid"><div className="playlist-items">{items.map((entry,index)=><article className={entry.hidden?"hidden":""} key={entry.id}><b>{index+1}</b><div><input value={entry.title||""} onChange={event=>patch(entry.id,{title:event.target.value})}/><small>{entry.kind}</small></div>
      {entry.kind==="layout"&&<select value={entry.layoutId||""} onChange={event=>patch(entry.id,{layoutId:event.target.value||undefined})}><option value="">Choose layout…</option>{layouts.filter(item=>item.publishedVersion>0).map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select>}
      {entry.kind==="media"&&<select value={entry.mediaAssetId||""} onChange={event=>patch(entry.id,{mediaAssetId:event.target.value||undefined})}><option value="">Choose media…</option>{media.map(item=><option value={item.id} key={item.id}>{item.fileName}</option>)}</select>}
      {entry.kind==="nested"&&<select value={entry.nestedPlaylistId||""} onChange={event=>patch(entry.id,{nestedPlaylistId:event.target.value||undefined})}><option value="">Choose playlist…</option>{playlists.filter(item=>item.id!==playlist?.id&&item.publishedVersion>0).map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select>}
      {entry.kind==="app"&&<select value={entry.appType||"clock"} onChange={event=>patch(entry.id,{appType:event.target.value})}><option>clock</option><option>weather</option><option>calendar</option><option>rss</option><option>wifi</option></select>}
      {["web","cloud","csv"].includes(entry.kind)&&<input type="url" value={entry.sourceUrl||""} placeholder="https://…" onChange={event=>patch(entry.id,{sourceUrl:event.target.value})}/>}
      {entry.kind==="tag"&&<input value={entry.tagsCsv||""} placeholder="media tags" onChange={event=>patch(entry.id,{tagsCsv:event.target.value})}/>}
      <label>Seconds<input type="number" min="1" max="86400" value={entry.durationSeconds} onChange={event=>patch(entry.id,{durationSeconds:Number(event.target.value)})}/></label><select value={entry.transition} onChange={event=>patch(entry.id,{transition:event.target.value as PlaylistEntry["transition"]})}><option>cut</option><option>fade</option><option>slide</option><option>zoom</option></select>
      <label><input type="checkbox" checked={entry.transparent} onChange={event=>patch(entry.id,{transparent:event.target.checked})}/> Transparent</label><label><input type="checkbox" checked={entry.hidden} onChange={event=>patch(entry.id,{hidden:event.target.checked})}/> Hidden</label>
      <button onClick={()=>move(index,-1)}>↑</button><button onClick={()=>move(index,1)}>↓</button><button className="danger" onClick={()=>setItems(all=>all.filter(item=>item.id!==entry.id))}>×</button>
    </article>)}</div><aside className="playlist-sequence-preview"><strong>Playback preview</strong>{active?<><PlaylistEntryPreview entry={active} layouts={layouts} media={media}/><div><span>{active.kind}</span><h3>{active.title}</h3><p>{active.durationSeconds}s · {active.transition}</p></div><div className="preview-controls"><button onClick={()=>setPreview(value=>Math.max(0,value-1))}>Previous</button><button className={previewPlaying?"active":""} onClick={()=>setPreviewPlaying(value=>!value)}>{previewPlaying?"Pause":"Play sequence"}</button><button onClick={()=>setPreview(value=>value+1)}>Next</button></div><small>{preview+1} of {activeItems.length} active entries · hidden intervals are skipped</small></>:<p>Add entries to preview playback.</p>}</aside></div>
    <div className="layout-editor-footer"><span>{items.filter(item=>!item.hidden).length} active · {items.reduce((total,item)=>total+(item.hidden?0:item.durationSeconds),0)} seconds per cycle</span><span className="toolbar-spacer"/><button className="button" disabled={!!saving} onClick={()=>void save(false)}>{saving === "draft" ? "Saving…" : "Save draft"}</button><button className="button primary" disabled={!!saving} onClick={()=>void save(true)}>{saving === "publish" ? "Publishing & pushing…" : "Publish & push"}</button></div>
  </StudioDialog>;
}

function PlaylistEntryPreview({ entry, layouts, media }: { entry: PlaylistEntry; layouts: Layout[]; media: StudioMedia[] }) {
  const layout = layouts.find(item => item.id === entry.layoutId);
  const asset = media.find(item => item.id === entry.mediaAssetId);
  if (entry.kind === "layout" && layout) return <div className={`entry-preview ${entry.transition}`}><LayoutThumbnail item={layout}/></div>;
  if (entry.kind === "media" && asset) return <div className={`entry-preview ${entry.transition}`}>{asset.contentType.startsWith("image/")
    ? <img src={asset.thumbnailUrl || asset.downloadUrl} alt={entry.title || asset.fileName}/>
    : asset.contentType.startsWith("audio/") ? <audio src={asset.downloadUrl} controls/>
    : <video key={entry.id} src={asset.downloadUrl} controls muted playsInline/>}</div>;
  if (entry.kind === "web" && entry.sourceUrl) return <div className={`entry-preview ${entry.transition}`}><iframe src={entry.sourceUrl} title={entry.title || "Web playlist preview"} sandbox="allow-forms allow-same-origin allow-scripts"/></div>;
  return <div className={`entry-preview placeholder ${entry.transition}`}><b>{entry.kind.toUpperCase()}</b><span>{entry.title || entry.sourceUrl || "Configure this entry"}</span></div>;
}

function PublishingPanel({ signage, screens, notify, refresh }: Props) {
  const [chosenSchedules,setChosenSchedules]=useState<string[]>([]);
  const [chosenScreens,setChosenScreens]=useState<string[]>([]);
  const [tags,setTags]=useState("");
  const [preview,setPreview]=useState<unknown>();
  const [working,setWorking]=useState<string>();
  async function publish(item:StudioSchedule){
    setWorking(`publish:${item.id}`);
    try{await studioApi(`/schedules/${item.id}/publish`,{method:"POST",body:JSON.stringify({pushToScreens:true})});refresh();notify(`${item.name} published and pushed.`);}
    catch(error){notify(`Could not publish and push ${item.name}: ${errorText(error)}`);}
    finally{setWorking(undefined);}
  }
  async function assign(){
    setWorking("assign");
    try{await studioApi("/assignments/bulk",{method:"POST",body:JSON.stringify({signageIds:chosenSchedules,screenIds:chosenScreens,targetTagsCsv:tags,publish:true})});refresh();notify("Bulk assignment published and pushed.");}
    catch(error){notify(`Could not assign, publish, and push: ${errorText(error)}`);}
    finally{setWorking(undefined);}
  }
  async function previewScreen(screenId:string){if(!screenId)return;try{setPreview(await studioApi(`/preview/${screenId}`));}catch(error){notify(errorText(error));}}
  return <section className="studio-panel publishing-grid"><div className="panel"><h2>Draft, publish, and push</h2><p>Published versions remain stable while editors continue working on drafts. Push invalidates manifests immediately; each display reports its applied manifest and cache progress.</p><div className="publish-table"><div><b>Schedule</b><b>Version</b><b>Last push</b><b/></div>{signage.map(item=>{const publishing=working===`publish:${item.id}`;return <div key={item.id}><span><input type="checkbox" checked={chosenSchedules.includes(item.id)} disabled={!!working} onChange={event=>setChosenSchedules(all=>event.target.checked?[...all,item.id]:all.filter(id=>id!==item.id))}/><strong>{item.name}</strong><small>{item.mode} · {item.enabled?"enabled":"paused"}</small></span><span><i className={`studio-state ${item.publishState}`}>{publishing?"publishing":item.publishState}</i><small>draft {item.version} · live {item.publishedVersion}</small></span><span>{timeAgo(item.lastPushedAt)}</span><button disabled={!!working} onClick={()=>void publish(item)}>{publishing?"Publishing & pushing…":"Publish & push"}</button></div>})}</div></div>
    <div className="panel"><h2>Bulk assignment</h2><p>Assign selected schedules to exact screens and/or matching screen tags.</p><div className="screen-check-grid">{screens.filter(screen=>!screen.revoked).map(screen=><label key={screen.id}><input type="checkbox" checked={chosenScreens.includes(screen.id)} disabled={!!working} onChange={event=>setChosenScreens(all=>event.target.checked?[...all,screen.id]:all.filter(id=>id!==screen.id))}/><span><strong>{screen.name}</strong><small>{screen.site} · {screen.tagsCsv||"no tags"}</small></span></label>)}</div><label>Additional target tags<input value={tags} disabled={!!working} onChange={event=>setTags(event.target.value)} placeholder="lobby, campus-a"/></label><button className="button primary" disabled={!chosenSchedules.length||!!working} onClick={()=>void assign()}>{working==="assign"?"Assigning, publishing & pushing…":"Assign, publish, and push"}</button></div>
    <div className="panel"><h2>Screen delivery progress</h2><p>Displays report the manifest version they applied and how much assigned content is available offline.</p><div className="delivery-progress">{screens.filter(screen=>!screen.revoked).map(screen=>{const total=screen.totalItems||0,cached=screen.cachedItems||0,percent=total?Math.round(cached/total*100):100;return <div key={screen.id}><span><strong>{screen.name}</strong><small>manifest {screen.manifestVersion||0} · {screen.playbackState||"idle"} · {timeAgo(screen.lastSeenAt)}</small></span><progress max="100" value={percent}/><b>{cached}/{total}</b></div>})}</div></div>
    <div className="panel"><h2>Preview as a screen</h2><p>Generate the exact manifest a selected display would receive, including schedule targeting, versions, layouts, playlists, and kiosk settings.</p><select defaultValue="" onChange={event=>previewScreen(event.target.value)}><option value="">Choose screen…</option>{screens.filter(screen=>!screen.revoked).map(screen=><option value={screen.id} key={screen.id}>{screen.name}</option>)}</select>{preview !== undefined && <pre className="manifest-preview">{JSON.stringify(preview,null,2)}</pre>}</div>
  </section>;
}

function OperationsPanel({ notify, screens }: Props) {
  const [data,setData]=useState<Operations>();
  const load=()=>studioApi<Operations>("/operations").then(setData).catch(error=>notify(errorText(error)));
  useEffect(()=>{load();const timer=window.setInterval(load,30000);return()=>window.clearInterval(timer);},[]);
  async function restart(signageId:string,zoneId:string){try{await studioApi(`/streams/${signageId}/${encodeURIComponent(zoneId)}/restart`,{method:"POST",body:"{}"});load();notify("Stream relay restarted.");}catch(error){notify(errorText(error));}}
  async function setFormat(screen: StudioScreen, value: string) {
    const [orientation, size] = value.split(":"); const [width, height] = size ? size.split("x").map(Number) : [null, null];
    try { await studioApi(`/screens/${screen.id}/format`, { method: "PUT", body: JSON.stringify({ orientation, width, height }) }); notify(`${screen.name} signage format updated.`); }
    catch (error) { notify(errorText(error)); }
  }
  if(!data)return <div className="panel studio-empty"><p>Loading signage operations…</p></div>;
  return <section className="studio-panel operations-stack">
    {!!data.alerts.length&&<div className="panel operations-alerts"><h2>Needs attention</h2>{data.alerts.map((alert,index)=><div key={`${alert.id}-${index}`} className={alert.severity}><strong>{alert.name}</strong><span>{alert.message}</span><i>{alert.severity}</i></div>)}</div>}
    <div className="panel"><div className="panel-title"><h2>Screen and content status</h2><a className="button" href="/api/v1/signage-studio/proof.csv" download>Export proof CSV</a></div><div className="operations-table"><div><b>Screen</b><b>Connection</b><b>Playback</b><b>Content</b><b>Proof</b></div>{data.screens.map(screen=><div key={screen.id}><span><strong>{screen.name}</strong><small>{screen.site} · {screen.appVersion}</small></span><span className={screen.online?"ok":"bad"}>{screen.online?"Online":`Offline · ${timeAgo(screen.lastSeenAt)}`}<small>{screen.networkQuality}{screen.networkLatencyMs!=null?` · ${screen.networkLatencyMs} ms`:""}</small></span><span>{screen.playbackState}<small>{screen.playbackError||"No reported errors"}</small></span><span>{screen.cachedItems}/{screen.totalItems} cached<small>manifest {screen.manifestVersion}</small></span><span>{screen.proofCount} events<small>{timeAgo(screen.lastProofAt)}</small></span></div>)}</div></div>
    <div className="panel"><h2>Live stream health</h2>{data.streams.length?<div className="operations-table stream-table"><div><b>Stream</b><b>Status</b><b>Latency</b><b>Error</b><b/></div>{data.streams.map(stream=><div key={`${stream.signageId}-${stream.zoneId}`}><span>{stream.zoneId}<small>{stream.signageId.slice(0,8)}</small></span><span className={stream.running&&stream.playlistReady?"ok":"bad"}>{stream.running?"Running":"Stopped"}<small>{stream.playlistReady?"HLS ready":"Waiting for HLS"}</small></span><span>{stream.segmentLatencyMs==null?"—":`${stream.segmentLatencyMs} ms`}<small>accessed {timeAgo(stream.lastAccess)}</small></span><span>{stream.error||"No relay error"}</span><button onClick={()=>restart(stream.signageId,stream.zoneId)}>Restart</button></div>)}</div>:<p>No live-stream relays are active. They start on demand when a display requests a stream zone.</p>}</div>
    <div className="panel"><h2>Per-screen format mapping</h2><p>Map portrait, landscape, ultrawide, square, or custom layouts to each physical display. Auto uses the player’s reported orientation.</p><div className="screen-format-grid">{screens.filter(screen=>!screen.revoked).map(screen=><label key={screen.id}><span><strong>{screen.name}</strong><small>{screen.site}</small></span><select defaultValue={`${screen.signageOrientation||"auto"}${screen.signageWidth&&screen.signageHeight?`:${screen.signageWidth}x${screen.signageHeight}`:""}`} onChange={event=>setFormat(screen,event.target.value)}><option value="auto">Auto</option><option value="landscape:1920x1080">Landscape · 1920×1080</option><option value="portrait:1080x1920">Portrait · 1080×1920</option><option value="landscape:2560x1080">Ultrawide · 2560×1080</option><option value="auto:1080x1080">Square · 1080×1080</option>{screen.signageWidth&&screen.signageHeight&&<option value={`${screen.signageOrientation}:${screen.signageWidth}x${screen.signageHeight}`}>Custom · {screen.signageWidth}×{screen.signageHeight}</option>}</select></label>)}</div></div>
    <div className="panel"><h2>Privacy and screenshots</h2><p>Diagnostic screenshots remain opt-in per screen, require an explicit one-time request from the Screens page, and expire automatically. Signage Studio shows status but never captures a screen silently.</p></div>
  </section>;
}

function EmergencyPanel({media,notify,screens}:Props){
  const [items,setItems]=useState<Emergency[]>([]);const [editing,setEditing]=useState<Emergency|"new">();const [activating,setActivating]=useState<Emergency>();
  const load=()=>studioApi<Emergency[]>("/emergencies").then(setItems).catch(error=>notify(errorText(error)));useEffect(()=>{void load();},[]);
  async function activate(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!activating)return;const form=new FormData(event.currentTarget);try{await studioApi(`/emergencies/${activating.id}/activate`,{method:"POST",body:JSON.stringify({durationMinutes:Number(form.get("duration")),screenIds:form.getAll("screenId").map(String),targetTagsCsv:String(form.get("targetTagsCsv")||"")})});setActivating(undefined);load();notify("Emergency alert broadcast immediately.");}catch(error){notify(errorText(error));}}
  async function cancel(item:Emergency){if(!await confirmAction(`Cancel ${item.name} on all targeted screens now?`, { destructive: true, confirmLabel: "Cancel broadcast" }))return;try{await studioApi(`/emergencies/${item.id}/cancel`,{method:"POST",body:"{}"});load();notify("Emergency alert cancelled.");}catch(error){notify(errorText(error));}}
  async function remove(item:Emergency){if(!await confirmAction(`Delete alert type ${item.name}?`, { destructive: true }))return;try{await studioApi(`/emergencies/${item.id}`,{method:"DELETE"});load();notify("Alert type deleted.");}catch(error){notify(errorText(error));}}
  return <section className="studio-panel"><div className="studio-toolbar panel"><div><strong>Emergency alert types</strong><small>Prepare alerts in advance, then broadcast or cancel them immediately. Cached media remains usable when the internet is down.</small></div><button className="button primary" onClick={()=>setEditing("new")}>New alert type</button></div><div className="studio-card-grid">{items.map(item=><article className="emergency-card" key={item.id} style={{background:item.backgroundColor,color:item.textColor}}><span>{item.severity.toUpperCase()}</span><h2>{item.name}</h2><p>{item.message}</p><small>{item.targetTagsCsv?`Tags: ${item.targetTagsCsv}`:"All screens"} · {item.defaultDurationMinutes} min default{item.mediaAssetId?" · offline media":""}</small>{item.activeSignageId&&<b>LIVE until {item.expiresAt?new Date(item.expiresAt).toLocaleTimeString():"cancelled"}</b>}<div>{item.activeSignageId?<button onClick={()=>cancel(item)}>Cancel broadcast</button>:<button onClick={()=>setActivating(item)}>Broadcast now</button>}<button onClick={()=>setEditing(item)}>Edit</button><button onClick={()=>remove(item)}>Delete</button></div></article>)}</div>{editing&&<EmergencyEditor item={editing==="new"?undefined:editing} media={media} notify={notify} onClose={()=>setEditing(undefined)} onSaved={()=>{setEditing(undefined);load();}}/>}{activating&&<StudioDialog title="Review immediate broadcast" onClose={()=>setActivating(undefined)}><form className="studio-form" onSubmit={activate}><article className="emergency-card" style={{background:activating.backgroundColor,color:activating.textColor}}><span>{activating.severity.toUpperCase()}</span><h2>{activating.name}</h2><p>{activating.message}</p></article><label>Duration (minutes)<input name="duration" type="number" min="1" max="1440" defaultValue={activating.defaultDurationMinutes}/></label><label>Screen-tag groups<input name="targetTagsCsv" defaultValue={activating.targetTagsCsv} placeholder="Leave blank with no screen choices for every screen"/></label><fieldset className="screen-check-grid"><legend>Exact screens (optional)</legend>{screens.filter(screen=>!screen.revoked).map(screen=><label key={screen.id}><input type="checkbox" name="screenId" value={screen.id}/><span><strong>{screen.name}</strong><small>{screen.site} · {screen.tagsCsv||"no tags"}</small></span></label>)}</fieldset><div className="credential-note">Emergency playback overrides lessons, signage, and kiosk interaction immediately. Confirm the audience and duration before broadcasting.</div><div className="layout-editor-footer"><button type="button" onClick={()=>setActivating(undefined)}>Cancel</button><button className="button primary">Confirm broadcast now</button></div></form></StudioDialog>}</section>;
}

function EmergencyEditor({item,media,notify,onClose,onSaved}:{item?:Emergency;media:StudioMedia[];notify:(message:string)=>void;onClose:()=>void;onSaved:()=>void}){
  type Draft = { name:string; severity:string; message:string; backgroundColor:string; textColor:string; mediaAssetId:string|null; targetTagsCsv:string; defaultDurationMinutes:number };
  const [review,setReview]=useState<Draft>();
  function prepare(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);setReview({name:String(form.get("name")||""),severity:String(form.get("severity")||"urgent"),message:String(form.get("message")||""),backgroundColor:String(form.get("backgroundColor")||"#9b1c1c"),textColor:String(form.get("textColor")||"#ffffff"),mediaAssetId:String(form.get("mediaAssetId")||"")||null,targetTagsCsv:String(form.get("targetTagsCsv")||""),defaultDurationMinutes:Number(form.get("duration"))});}
  async function save(){if(!review)return;try{await studioApi(item?`/emergencies/${item.id}`:"/emergencies",{method:item?"PUT":"POST",body:JSON.stringify(review)});notify("Emergency alert type saved.");onSaved();}catch(error){notify(errorText(error));}}
  if(review)return <StudioDialog title="Review emergency alert" onClose={()=>setReview(undefined)}><div className="emergency-review"><p>Confirm the message, audience, offline media, and default duration before making this alert type available to operators.</p><article style={{background:review.backgroundColor,color:review.textColor}}><span>{review.severity.toUpperCase()}</span><h2>{review.name}</h2><p>{review.message||"No message"}</p><small>{review.targetTagsCsv?`Screen tags: ${review.targetTagsCsv}`:"All screens"} · {review.defaultDurationMinutes} minutes · {review.mediaAssetId?media.find(value=>value.id===review.mediaAssetId)?.fileName||"offline media":"text only"}</small></article><div className="layout-editor-footer"><button onClick={()=>setReview(undefined)}>Back to edit</button><button className="button primary" onClick={()=>void save()}>Confirm and save</button></div></div></StudioDialog>;
  return <StudioDialog title={item?`Edit ${item.name}`:"New emergency alert type"} onClose={onClose}><form className="studio-form" onSubmit={prepare}><label>Name<input name="name" required defaultValue={item?.name}/></label><label>Severity<select name="severity" defaultValue={item?.severity||"urgent"}><option>info</option><option>warning</option><option>urgent</option><option>critical</option></select></label><label>Message<textarea name="message" maxLength={2000} defaultValue={item?.message}/></label><div className="two-fields"><label>Background<input name="backgroundColor" type="color" defaultValue={item?.backgroundColor||"#9b1c1c"}/></label><label>Text<input name="textColor" type="color" defaultValue={item?.textColor||"#ffffff"}/></label></div><label>Offline alert media<select name="mediaAssetId" defaultValue={item?.mediaAssetId||""}><option value="">Text only</option>{media.filter(value=>value.sourceKind!=="link").map(value=><option value={value.id} key={value.id}>{value.fileName}</option>)}</select></label><label>Screen-tag groups<input name="targetTagsCsv" defaultValue={item?.targetTagsCsv} placeholder="campus-a, lobby"/></label><label>Default duration (minutes)<input name="duration" type="number" min="1" max="1440" defaultValue={item?.defaultDurationMinutes||30}/></label><div className="layout-editor-footer"><button type="button" onClick={onClose}>Cancel</button><button className="button primary">Review alert</button></div></form></StudioDialog>;
}

function StudioDialog({title,children,onClose,wide=false,workspace=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean;workspace?:boolean}){
  const { dialogRef, onDialogKeyDown } = useDialogFocus<HTMLElement>(onClose);
  return <div className={`studio-dialog-backdrop ${workspace ? "workspace" : ""}`} role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section ref={dialogRef} className={`studio-dialog ${wide?"wide":""} ${workspace ? "studio-workspace" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={onDialogKeyDown}><header><div><span>{workspace ? "SIGNAGE STUDIO" : "LESSONCUE"}</span><h2>{title}</h2></div><button onClick={onClose} aria-label="Close">×</button></header>{children}</section></div>;
}
