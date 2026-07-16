import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import "./styles.css";

type Session = { setupRequired: boolean; authenticated: boolean; username?: string; displayName?: string; role?: string };
type Bootstrap = {
  serverId: string; serverName: string; organization: string; timeZone: string; pairingPin: string;
  pairingExpiresAt: string; pairingFixed: boolean; settings: Organization;
  storage: StorageStatus; update: UpdateStatus; localAddress: LocalAddressStatus; httpPort: HttpPortStatus;
  counts: { classes: number; lessons: number; media: number; screens: number };
};
type Organization = { id: string; name: string; siteName: string; timeZone: string; weekStartsOn: string; defaultLessonDurationMinutes: number; defaultRetentionDays: number; primaryColor: string; accentColor: string; navigationTextColor: string; selectedTabColor: string; welcomeMessage: string; storageLimitBytes: number };
type StorageStatus = { usedBytes: number; diskAvailableBytes: number; maximumAllocationBytes: number; allocationBytes: number; remainingBytes: number; automaticAllocation: boolean };
type UpdateStatus = { currentVersion: string; latestVersion?: string; updateAvailable: boolean; lastCheckedAt?: string; releaseUrl?: string; error?: string; automaticInstallSupported: boolean; installing: boolean };
type LocalAddressStatus = { hostname: string; address: string; supported: boolean; pending: boolean; appliedAt?: string; error?: string };
type HttpPortStatus = { port: number; address: string; configurable: boolean; supported: boolean; pending: boolean; appliedAt?: string; error?: string };
type LessonClass = { id: string; name: string; description: string; lessonCount: number; screenCount: number };
type Media = { id: string; fileName: string; contentType: string; sizeBytes: number; durationMs?: number; downloadUrl: string; thumbnailUrl?: string; filmstripUrl?: string; waveformUrl?: string; processingStatus: string; processingError?: string; videoCodec?: string; audioCodec?: string; width?: number; height?: number; sourceKind: string; sourceUrl?: string; linkKind?: string; offlineEligible: boolean; storagePolicy: "lesson" | "persistent"; originLessonId?: string; deleteAfter?: string; retentionDateIsManual: boolean; folder: string; tagsCsv: string; version: number; replacedAt?: string; conversionStatus: string; conversionError?: string; convertedSlidesJson: string; convertedAt?: string };
type MediaVersion = { id: string; versionNumber: number; fileName: string; contentType: string; sizeBytes: number; durationMs?: number; sha256?: string; archivedAt: string; archivedBy: string; downloadUrl: string };
type MediaImpact = { id: string; fileName: string; folder: string; tagsCsv: string; version: number; replacedAt?: string; lessons: { id: string; title: string; date: string; itemCount: number }[]; signage: { id: string; name: string; mode: string; enabled: boolean }[]; versions: MediaVersion[] };
type CuePoint = { name: string; positionMs: number };
type PlaylistItem = {
  id: string; title: string; type: string; role: "lesson" | "preRoll" | "countdown"; position: number;
  mediaAssetId?: string; mediaFileName?: string; durationMs?: number; mediaDurationMs?: number;
  volumePercent: number; endBehavior: string; allowSkip: boolean; startMs: number; endMs?: number;
  notes: string; fadeInMs: number; fadeOutMs: number; normalizeAudio: boolean; cuePointsJson: string;
};
type Lesson = {
  id: string; classId: string; className: string; date: string; title: string; designatedStartAt?: string; preRollStartsAt?: string;
  preRollEnabled: boolean; countdownItemId?: string; version: number; archived: boolean; keepOffline: boolean; downloadDaysBefore: number; items: PlaylistItem[];
};
type Screen = {
  id: string; name: string; platform: string; assignedClassId?: string; assignedClassName?: string;
  volunteerMode: boolean; lastSeenAt?: string; online: boolean; freeBytes: number; failedDownloads: number; revoked: boolean; appVersion: string; manifestVersion: number; tagsCsv: string; site: string;
  lastIpAddress?: string; controlVersion: number; controlAction: string; controlLessonId?: string; controlItemId?: string; controlPositionMs?: number; controlIssuedAt?: string;
  acknowledgedControlVersion: number; playbackState: string; playbackLessonId?: string; playbackItemId?: string; playbackPositionMs: number; playbackDurationMs?: number;
  playbackVolumePercent: number; playbackUpdatedAt?: string; playbackError?: string; cachedItems: number; totalItems: number; deviceModel?: string; osVersion?: string;
};
type User = { id: string; username: string; displayName: string; email?: string; role: string; disabled: boolean; createdAt: string; lastLoginAt?: string };
type Signage = { id: string; name: string; mode: string; enabled: boolean; priority: number; startsAt?: string; endsAt?: string; message: string; backgroundColor: string; textColor: string; mediaAssetId?: string; mediaFileName?: string; targetTagsCsv: string };
type Backup = { id: string; fileName: string; kind: string; sizeBytes: number; createdAt: string; createdBy: string };
type BackupPreview = { restoreId: string; fileName: string; kind: string; compressedBytes: number; uncompressedBytes: number; fileCount: number; organization: string; users: number; classes: number; lessons: number; mediaRecords: number; mediaFiles: number; includesMedia: boolean; warnings: string[]; expiresAt: string };
type BackupRestoreResult = { safetyBackupId: string; safetyBackupFileName: string; kind: string; organization: string; mediaRestored: boolean; preservedServerSettings: string[] };
type Audit = { id: number; timestamp: string; actor: string; action: string; object: string; result: string; summary?: string };
type View = "dashboard" | "controller" | "classes" | "calendar" | "media" | "screens" | "signage" | "users" | "settings";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.error || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

async function uploadMediaFile(file: File, options: { persistent: boolean; lessonId?: string; folder?: string; tagsCsv?: string; onProgress?: (percent: number) => void }): Promise<Media> {
  const duration = await detectDuration(file);
  let result: Media | { duplicate: true; media: Media };
  if (file.size > 16 * 1024 * 1024) {
    const session = await api<{ uploadId: string; chunkSize: number }>(`/api/v1/uploads?fileName=${encodeURIComponent(file.name)}&totalBytes=${file.size}`, { method: "POST", body: "{}" });
    const totalChunks = Math.ceil(file.size / session.chunkSize);
    for (let index = 0; index < totalChunks; index++) {
      const chunk = file.slice(index * session.chunkSize, Math.min(file.size, (index + 1) * session.chunkSize));
      await api(`/api/v1/uploads/${session.uploadId}/chunks/${index}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: chunk });
      options.onProgress?.(Math.round(((index + 1) / totalChunks) * 100));
    }
    result = await api(`/api/v1/uploads/${session.uploadId}/complete`, { method: "POST", body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream", totalChunks, durationMs: duration || null, persistent: options.persistent, lessonId: options.lessonId || null, folder: options.folder || "", tagsCsv: options.tagsCsv || "" }) });
  } else {
    const data = new FormData();
    data.append("file", file);
    data.append("persistent", String(options.persistent));
    if (options.lessonId) data.append("lessonId", options.lessonId);
    if (options.folder) data.append("folder", options.folder);
    if (options.tagsCsv) data.append("tagsCsv", options.tagsCsv);
    if (duration) data.append("durationMs", String(duration));
    result = await api("/api/v1/media", { method: "POST", body: data });
    options.onProgress?.(100);
  }
  return "media" in result ? result.media : result;
}

function App() {
  const [session, setSession] = useState<Session>();
  const [view, setView] = useState<View>(location.pathname.startsWith("/controller") ? "controller" : "dashboard");
  const [notice, setNotice] = useState("");

  useEffect(() => { api<Session>("/api/v1/auth/session").then(setSession).catch(() => setSession({ setupRequired: false, authenticated: false })); }, []);
  if (!session) return <Splash />;
  if (!session.authenticated) return <Auth session={session} onAuthenticated={() => api<Session>("/api/v1/auth/session").then(setSession)} />;
  return <Shell view={view} setView={setView} username={session.displayName || session.username || "admin"} currentUsername={session.username || ""} role={session.role || "Viewer"} notice={notice} setNotice={setNotice}
    onLogout={async () => { await api<void>("/api/v1/auth/logout", { method: "POST", body: "{}" }); setSession({ ...session, authenticated: false, setupRequired: false }); }} />;
}

function Splash() {
  return <main className="auth-page"><div className="brand-mark large">LC</div><p className="muted">Opening your local LessonCue server…</p></main>;
}

function Auth({ session, onAuthenticated }: { session: Session; onAuthenticated: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(session.setupRequired ? "/api/v1/auth/setup" : "/api/v1/auth/login", { method: "POST", body: JSON.stringify(values) });
      onAuthenticated();
    } catch (e) { setError(e instanceof Error && e.message !== "SESSION_EXPIRED" ? e.message : "The username or password was not accepted."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-card">
      <div className="brand-lockup"><div className="brand-mark">LC</div><div><strong>LessonCue</strong><span>Local classroom media control</span></div></div>
      <div className="auth-copy">
        <span className="eyebrow">{session.setupRequired ? "FIRST-RUN SETUP" : "WELCOME BACK"}</span>
        <h1>{session.setupRequired ? "Create your local administrator" : "Sign in to LessonCue"}</h1>
        <p>{session.setupRequired ? "This account stays on this server. Nothing is sent to a hosted service." : "Manage classes, playlists, and screens on your local network."}</p>
      </div>
      <form onSubmit={submit} className="stack">
        {session.setupRequired && <><div className="two-fields"><Field label="Organization name"><input name="organizationName" required defaultValue="My Organization" /></Field><Field label="Site or campus"><input name="siteName" required defaultValue="Main Campus" /></Field></div><div className="two-fields"><Field label="Your name"><input name="displayName" required autoComplete="name" /></Field><Field label="Email (optional)"><input name="email" type="email" autoComplete="email" /></Field></div><div className="two-fields"><Field label="Time zone"><select name="timeZone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}><option>{Intl.DateTimeFormat().resolvedOptions().timeZone}</option><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>UTC</option></select></Field><Field label="Week starts"><select name="weekStartsOn"><option>Sunday</option><option>Monday</option></select></Field></div></>}
        <Field label="Username"><input name="username" required minLength={3} autoComplete="username" autoFocus={!session.setupRequired} /></Field>
        <Field label="Password" hint={session.setupRequired ? "10+ characters with uppercase, lowercase, and a number" : undefined}>
          <div className="password-field"><input name="password" type={showPassword ? "text" : "password"} required minLength={session.setupRequired ? 10 : undefined} autoComplete={session.setupRequired ? "new-password" : "current-password"} /><button type="button" className="text-button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div>
        </Field>
        {error && <div className="alert error">{error}</div>}
        <button className="button primary wide" disabled={busy}>{busy ? "Please wait…" : session.setupRequired ? "Finish setup" : "Sign in"}</button>
      </form>
      {!session.setupRequired && <a className="recovery-link" href="https://github.com/nickhighland/lessoncue/blob/main/docs/installation.md#reset-a-forgotten-administrator-password" target="_blank" rel="noreferrer">Forgot your password? View local recovery instructions ↗</a>}
      <div className="local-note"><span className="status-dot" /> Local server · {location.host}</div>
    </section>
  </main>;
}

function Shell({ view, setView, username, currentUsername, role, onLogout, notice, setNotice }: {
  view: View; setView: (view: View) => void; username: string; currentUsername: string; role: string; onLogout: () => void; notice: string; setNotice: (v: string) => void;
}) {
  const [dataVersion, setDataVersion] = useState(0);
  const [bootstrap, setBootstrap] = useState<Bootstrap>();
  const [classes, setClasses] = useState<LessonClass[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [signage, setSignage] = useState<Signage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = () => setDataVersion(v => v + 1);
  useEffect(() => {
    Promise.all([
      api<Bootstrap>("/api/v1/admin/bootstrap"), api<LessonClass[]>("/api/v1/classes"),
      api<Lesson[]>("/api/v1/lessons"), api<Media[]>("/api/v1/media"), api<Screen[]>("/api/v1/screens"),
      api<Signage[]>("/api/v1/signage"), api<User[]>("/api/v1/users"), api<Backup[]>("/api/v1/backups"), api<Audit[]>("/api/v1/audit"),
    ]).then(([b, c, l, m, s, g, u, backupData, auditData]) => { setBootstrap(b); setClasses(c); setLessons(l); setMedia(m); setScreens(s); setSignage(g); setUsers(u); setBackups(backupData); setAudit(auditData); })
      .catch(e => setNotice(e.message === "SESSION_EXPIRED" ? "Your session expired. Refresh the page to sign in again." : e.message))
      .finally(() => setLoading(false));
  }, [dataVersion, setNotice]);
  useEffect(() => {
    if (!bootstrap) return;
    document.documentElement.style.setProperty("--deep", bootstrap.settings.primaryColor);
    document.documentElement.style.setProperty("--gold", bootstrap.settings.accentColor);
    document.documentElement.style.setProperty("--nav-text", bootstrap.settings.navigationTextColor);
    document.documentElement.style.setProperty("--nav-selected", bootstrap.settings.selectedTabColor);
  }, [bootstrap]);
  useEffect(() => {
    const poll = () => api<UpdateStatus>("/api/v1/updates").then(update =>
      setBootstrap(current => current ? { ...current, update } : current)).catch(() => undefined);
    const initial = window.setTimeout(poll, 20_000);
    const interval = window.setInterval(poll, 60 * 60 * 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);
  useEffect(() => {
    const connection = new HubConnectionBuilder().withUrl("/hubs/sync")
      .withAutomaticReconnect([0, 1_000, 3_000, 10_000]).configureLogging(LogLevel.Warning).build();
    const refreshScreens = () => api<Screen[]>("/api/v1/screens").then(setScreens).catch(() => undefined);
    connection.on("ScreenStatusChanged", refreshScreens);
    connection.start().then(() => connection.invoke("JoinAdmins")).catch(() => undefined);
    return () => { connection.off("ScreenStatusChanged", refreshScreens); void connection.stop(); };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => api<Screen[]>("/api/v1/screens").then(setScreens).catch(() => undefined), 2_500);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const path = view === "controller" ? "/controller" : "/";
    if (location.pathname !== path) history.replaceState(null, "", path);
  }, [view]);

  const canUpload = role !== "Viewer";
  const nav: [View, string, string][] = [["dashboard", "⌂", "Dashboard"], ["controller", "⌁", "Controller"], ["classes", "▤", "Classes"], ["calendar", "□", "Calendar"], ["media", "▶", "Media Library"], ["screens", "▣", "Screens"], ["signage", "◇", "Signage"], ["users", "♙", "Users"], ["settings", "⚙", "Settings"]];
  return <><a className="skip-link" href="#main-content">Skip to main content</a><div className={`app-shell ${view === "controller" ? "controller-mode" : ""}`}>
    <aside className="sidebar">
      <div className="brand-lockup inverse"><div className="brand-mark">LC</div><div><strong>LessonCue</strong><span>{bootstrap?.organization || "Local server"}</span></div></div>
      <nav>{nav.map(([key, icon, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><span>{icon}</span>{label}</button>)}</nav>
      <div className="sidebar-foot">{canUpload && bootstrap && <div className="storage-mini"><span>Upload space</span><strong>{formatBytes(bootstrap.storage.remainingBytes)} free</strong><StorageMeter storage={bootstrap.storage} /></div>}<div className="server-online"><span className="status-dot" /><div><strong>Server online</strong><small>{location.host}</small></div></div><button className="account-button" onClick={onLogout}>{username}<span>{role} · Sign out</span></button></div>
    </aside>
    <main className="content" id="main-content" tabIndex={-1}>
      {notice && <div className="toast" onClick={() => setNotice("")}>{notice}<span>×</span></div>}
      {loading && !bootstrap ? <div className="loading">Loading local data…</div> : <>
        {bootstrap?.update.updateAvailable && <div className="update-banner" role="status"><div><strong>LessonCue {bootstrap.update.latestVersion} is available</strong><span>Your server can be updated from Settings.</span></div><button className="button" onClick={() => setView("settings")}>Review update</button></div>}
        {view === "dashboard" && bootstrap && <Dashboard bootstrap={bootstrap} lessons={lessons} screens={screens} onNavigate={setView} />}
        {view === "controller" && bootstrap && <ControllerView screens={screens} lessons={lessons} refresh={refresh} notify={setNotice} />}
        {view === "classes" && <ClassesView classes={classes} lessons={lessons} media={media} refresh={refresh} notify={setNotice} canUpload={canUpload} storage={bootstrap?.storage} />}
        {view === "calendar" && <CalendarView lessons={lessons} />}
        {view === "media" && <MediaView media={media} lessons={lessons} refresh={refresh} notify={setNotice} canUpload={canUpload} storage={bootstrap?.storage} />}
        {view === "screens" && bootstrap && <ScreensView screens={screens} classes={classes} pin={bootstrap.pairingPin} refresh={refresh} notify={setNotice} />}
        {view === "signage" && <SignageView signage={signage} media={media} refresh={refresh} notify={setNotice} />}
        {view === "users" && <UsersView users={users} currentUsername={currentUsername} refresh={refresh} notify={setNotice} canManage={role === "Owner" || role === "Administrator"} />}
        {view === "settings" && bootstrap && <Settings bootstrap={bootstrap} backups={backups} audit={audit} refresh={refresh} notify={setNotice} canManage={role === "Owner" || role === "Administrator"} />}
      </>}
    </main>
  </div></>;
}

function PageHead({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <header className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div>{action}</header>;
}

function Dashboard({ bootstrap, lessons, screens, onNavigate }: { bootstrap: Bootstrap; lessons: Lesson[]; screens: Screen[]; onNavigate: (v: View) => void }) {
  const upcoming = [...lessons].filter(l => new Date(`${l.date}T23:59:59`) >= new Date()).slice(0, 5);
  const online = screens.filter(s => s.online).length;
  return <>
    <PageHead eyebrow="OVERVIEW" title={`Good ${dayPart()}.`} detail={`${bootstrap.organization} is running entirely on this local server.`} action={<button className="button primary" onClick={() => onNavigate("classes")}>Build a lesson</button>} />
    <div className="stats-grid">
      <Stat label="Classes" value={bootstrap.counts.classes} sub={`${bootstrap.counts.lessons} lessons`} />
      <Stat label="Media files" value={bootstrap.counts.media} sub="stored locally" />
      <Stat label="Paired screens" value={bootstrap.counts.screens} sub={`${online} online now`} />
      <Stat label="Pairing PIN" value={bootstrap.pairingPin} sub="enter on a new screen" mono />
    </div>
    <div className="dashboard-grid">
      <section className="panel"><PanelTitle title="Upcoming lessons" action="Manage classes" onClick={() => onNavigate("classes")} />
        {upcoming.length ? <div className="rows">{upcoming.map(l => <div className="row" key={l.id}><DateBadge date={l.date} /><div className="grow"><strong>{l.title}</strong><small>{l.className} · {l.items.length} playlist items</small></div><RoleSummary items={l.items} /></div>)}</div> : <Empty title="No upcoming lessons" body="Create a lesson inside one of your classes." />}
      </section>
      <section className="panel"><PanelTitle title="Screen health" action="View screens" onClick={() => onNavigate("screens")} />
        {screens.filter(s => !s.revoked).length ? <div className="rows">{screens.filter(s => !s.revoked).slice(0, 5).map(s => <div className="row" key={s.id}><span className={`screen-icon ${isOnline(s) ? "online" : ""}`}>▣</span><div className="grow"><strong>{s.name}</strong><small>{s.assignedClassName || "Not assigned"}</small></div><Status online={isOnline(s)} /></div>)}</div> : <Empty title="No paired screens" body={`Open LessonCue TV and enter PIN ${bootstrap.pairingPin}.`} />}
      </section>
    </div>
  </>;
}

function ClassesView({ classes, lessons, media, refresh, notify, canUpload, storage }: { classes: LessonClass[]; lessons: Lesson[]; media: Media[]; refresh: () => void; notify: (s: string) => void; canUpload: boolean; storage?: StorageStatus }) {
  const [selected, setSelected] = useState(classes[0]?.id || "");
  const [editing, setEditing] = useState<string>();
  const [showClassForm, setShowClassForm] = useState(false);
  const current = classes.find(c => c.id === selected) || classes[0];
  const classLessons = lessons.filter(l => l.classId === current?.id);
  const lesson = lessons.find(l => l.id === editing);
  if (lesson) return <LessonEditor lesson={lesson} media={media} onBack={() => setEditing(undefined)} refresh={refresh} notify={notify} canUpload={canUpload} storage={storage} />;

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try { const item = await api<LessonClass>("/api/v1/classes", { method: "POST", body: JSON.stringify(values) }); setSelected(item.id); setShowClassForm(false); refresh(); }
    catch (e) { notify(errorText(e)); }
  }
  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!current) return; const values = Object.fromEntries(new FormData(event.currentTarget));
    try { const item = await api<Lesson>("/api/v1/lessons", { method: "POST", body: JSON.stringify({ ...values, classId: current.id, preRollEnabled: false, countdownItemId: null, availableFrom: null, expiresAt: null, designatedStartAt: null }) }); refresh(); setEditing(item.id); }
    catch (e) { notify(errorText(e)); }
  }
  return <>
    <PageHead eyebrow="PROGRAMMING" title="Classes & lessons" detail="Schedule lessons and compose exactly what your screens will play." action={<button className="button primary" onClick={() => setShowClassForm(true)}>New class</button>} />
    {showClassForm && <Modal title="Create a class" onClose={() => setShowClassForm(false)}><form onSubmit={createClass} className="stack"><Field label="Class name"><input name="name" required autoFocus /></Field><Field label="Description"><textarea name="description" rows={3} /></Field><button className="button primary">Create class</button></form></Modal>}
    {!classes.length ? <section className="panel"><Empty title="Create your first class" body="Classes organize lessons and determine which screens receive them." action={<button className="button primary" onClick={() => setShowClassForm(true)}>Create class</button>} /></section> : <div className="classes-layout">
      <aside className="class-list panel"><h3>Your classes</h3>{classes.map(c => <button key={c.id} className={current?.id === c.id ? "active" : ""} onClick={() => setSelected(c.id)}><span className="class-glyph">{c.name[0]}</span><span><strong>{c.name}</strong><small>{c.lessonCount} lessons · {c.screenCount} screens</small></span></button>)}</aside>
      <section className="panel class-detail"><div className="class-title"><div><span className="eyebrow">CLASS</span><h2>{current?.name}</h2><p>{current?.description || "No class description yet."}</p></div></div>
        <form className="quick-create" onSubmit={createLesson}><input name="title" placeholder="New lesson title" required /><input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /><button className="button primary">Create lesson</button></form>
        {classLessons.length ? <div className="lesson-cards">{classLessons.map(l => <button key={l.id} onClick={() => setEditing(l.id)}><DateBadge date={l.date} /><span className="grow"><strong>{l.title}</strong><small>{l.items.length} items · Version {l.version}</small></span><RoleSummary items={l.items} /><b>›</b></button>)}</div> : <Empty title="No lessons in this class" body="Add the first lesson with the form above." />}
      </section>
    </div>}
  </>;
}

function LessonEditor({ lesson, media, onBack, refresh, notify, canUpload, storage }: { lesson: Lesson; media: Media[]; onBack: () => void; refresh: () => void; notify: (s: string) => void; canUpload: boolean; storage?: StorageStatus }) {
  const [showAdd, setShowAdd] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [onlineMode, setOnlineMode] = useState<"online" | "download">("online");
  const [previewItem, setPreviewItem] = useState<PlaylistItem>();
  const items = [...lesson.items].sort((a, b) => a.position - b.position);
  const countdown = items.find(i => i.role === "countdown");
  const playableMedia = media.filter(item => (/^(video|audio|image)\//.test(item.contentType) || item.sourceKind === "link") && item.processingStatus === "ready");
  async function updateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await api(`/api/v1/lessons/${lesson.id}`, { method: "PUT", body: JSON.stringify({ title: values.title, date: values.date, designatedStartAt: values.designatedStartAt ? new Date(String(values.designatedStartAt)).toISOString() : null, clearDesignatedStartAt: !values.designatedStartAt, preRollStartsAt: values.preRollStartsAt ? new Date(String(values.preRollStartsAt)).toISOString() : null, clearPreRollStartsAt: !values.preRollStartsAt, preRollEnabled: values.preRollEnabled === "on", clearCountdown: false }) }); notify("Lesson schedule saved."); refresh(); }
    catch (e) { notify(errorText(e)); }
  }
  async function addAssetToLesson(asset: Media, role: string, title?: FormDataEntryValue | null) {
    const type = asset.linkKind === "webpage" ? "external" : asset.linkKind === "youtube" || asset.linkKind === "embedded" ? "web" : asset.contentType.startsWith("video") ? "video" : asset.contentType.startsWith("audio") ? "audio" : "image";
    await api(`/api/v1/lessons/${lesson.id}/items`, { method: "POST", body: JSON.stringify({ title: title || asset.fileName, type, role, position: (items.length + 1) * 1000, mediaId: asset.id, durationMs: asset.durationMs, startMs: 0, endMs: null, volumePercent: 100, imageDurationSeconds: type === "image" ? 10 : null, endBehavior: role === "preRoll" ? "loop" : "advance", allowSkip: true }) });
  }
  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const asset = playableMedia.find(m => m.id === values.mediaId);
    if (!asset) return;
    try { await addAssetToLesson(asset, String(values.role), values.title); setShowAdd(false); refresh(); notify("Media added to the lesson."); }
    catch (e) { notify(errorText(e)); }
  }
  async function uploadAndAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return;
    setUploading(true); setUploadProgress(0);
    try {
      const persistent = form.get("storagePolicy") === "persistent";
      const asset = await uploadMediaFile(file, { persistent, lessonId: persistent ? undefined : lesson.id, onProgress: setUploadProgress });
      await addAssetToLesson(asset, String(form.get("role") || "lesson"), form.get("title"));
      setShowAdd(false); refresh();
      notify(persistent ? "Media uploaded permanently and added to the lesson." : `Media added. It will be deleted four weeks after ${formatDate(lesson.date)}.`);
    } catch (e) { notify(errorText(e)); }
    finally { setUploading(false); setUploadProgress(0); }
  }
  async function addOnline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const download = onlineMode === "download";
    setUploading(true);
    try {
      const persistent = !download || form.get("storagePolicy") === "persistent";
      const asset = await api<Media>("/api/v1/media/link", { method: "POST", body: JSON.stringify({ url: form.get("url"), title: form.get("title") || null, download, persistent, lessonId: persistent ? null : lesson.id }) });
      await addAssetToLesson(asset, download ? String(form.get("role") || "lesson") : "lesson", form.get("title"));
      setShowAdd(false); refresh();
      notify(download ? "YouTube download queued. It will become offline-ready after processing." : "Online media added to the lesson.");
    } catch (e) { notify(errorText(e)); } finally { setUploading(false); }
  }
  async function changeItem(item: PlaylistItem, changes: Record<string, unknown>) { try { await api(`/api/v1/playlist-items/${item.id}`, { method: "PATCH", body: JSON.stringify(changes) }); refresh(); notify("Playlist saved."); } catch (e) { notify(errorText(e)); } }
  async function removeItem(id: string) { if (!confirm("Remove this item from the playlist? The media file will remain in your library.")) return; await api(`/api/v1/playlist-items/${id}`, { method: "DELETE" }); refresh(); }
  async function move(index: number, delta: number) { const reordered = [...items]; const target = index + delta; if (target < 0 || target >= items.length) return; [reordered[index], reordered[target]] = [reordered[target], reordered[index]]; await api(`/api/v1/lessons/${lesson.id}/reorder`, { method: "POST", body: JSON.stringify({ itemIds: reordered.map(i => i.id) }) }); refresh(); }
  return <>
    <button className="back-button" onClick={onBack}>← Back to {lesson.className}</button>
    <PageHead eyebrow="LESSON BUILDER" title={lesson.title} detail={`${formatDate(lesson.date)} · Manifest version ${lesson.version}`} action={canUpload ? <button className="button primary" onClick={() => setShowAdd(true)}>Add media</button> : undefined} />
    {showAdd && canUpload && <Modal title="Add media to the lesson" onClose={() => !uploading && setShowAdd(false)}><div className="add-media-options">
      <section><h3>Upload from this computer</h3><p>Upload and place a new file without leaving this lesson. {storage && `${formatBytes(storage.remainingBytes)} remains available.`}</p><form className="stack" onSubmit={uploadAndAdd}><Field label="Media file"><input name="file" type="file" accept="video/*,audio/*,image/*" required disabled={uploading} /></Field><RetentionChoices lessonDate={lesson.date} /><div className="two-fields"><Field label="Playlist role"><select name="role"><option value="lesson">Main lesson</option><option value="preRoll">Pre-roll loop</option><option value="countdown">Countdown video</option></select></Field><Field label="Display title"><input name="title" placeholder="Use filename" /></Field></div><button className="button primary" disabled={uploading}>{uploading ? `Uploading ${uploadProgress}%` : "Upload and add"}</button></form></section>
      <section className="online-choice"><h3>Add online media</h3><p>Show a webpage or play a YouTube video. A local YouTube copy can play without internet after downloading.</p><form className="stack" onSubmit={addOnline}><Field label="Webpage or YouTube URL"><input name="url" type="url" required placeholder="https://…" disabled={uploading} /></Field><fieldset className="retention-options"><legend>How should LessonCue use it?</legend><label><input type="radio" checked={onlineMode === "online"} onChange={() => setOnlineMode("online")} /><span><strong>Play online</strong><small>YouTube uses an embedded player; other URLs display as webpages.</small></span></label><label><input type="radio" checked={onlineMode === "download"} onChange={() => setOnlineMode("download")} /><span><strong>Download YouTube locally</strong><small>Use only for video you are authorized to copy. Processing continues in the background.</small></span></label></fieldset>{onlineMode === "download" && <RetentionChoices lessonDate={lesson.date} />}<div className="two-fields">{onlineMode === "download" && <Field label="Playlist role"><select name="role"><option value="lesson">Main lesson</option><option value="preRoll">Pre-roll loop</option><option value="countdown">Countdown video</option></select></Field>}<Field label="Display title"><input name="title" placeholder={onlineMode === "download" ? "YouTube video" : "Use website name"} /></Field></div><button className="button primary" disabled={uploading}>{uploading ? "Adding…" : onlineMode === "download" ? "Queue download and add" : "Add online media"}</button></form></section>
      {playableMedia.length > 0 && <section className="library-choice"><h3>Choose existing media</h3><form className="stack" onSubmit={addItem}><Field label="Ready media"><select name="mediaId" required>{playableMedia.map(m => <option key={m.id} value={m.id}>{m.fileName}</option>)}</select></Field><div className="two-fields"><Field label="Playlist role"><select name="role"><option value="lesson">Main lesson</option><option value="preRoll">Pre-roll loop</option><option value="countdown">Countdown video</option></select></Field><Field label="Display title"><input name="title" placeholder="Use media filename" /></Field></div><button className="button">Add existing media</button></form></section>}
    </div></Modal>}
    {previewItem && <Modal title={`Timeline: ${previewItem.title}`} onClose={() => setPreviewItem(undefined)}><TimelineEditor item={previewItem} media={media.find(asset => asset.id === previewItem.mediaAssetId)} onSave={changes => changeItem(previewItem, changes)} /></Modal>}
    <div className="editor-grid">
      <section className="panel schedule-panel"><h2>Timing</h2><form className="stack" onSubmit={updateLesson}><Field label="Lesson title"><input name="title" defaultValue={lesson.title} required /></Field><Field label="Lesson date"><input name="date" type="date" defaultValue={lesson.date} required /></Field><Field label="Pre-roll begins" hint="Paired screens automatically start looping pre-roll at this time."><input name="preRollStartsAt" type="datetime-local" defaultValue={toLocalInput(lesson.preRollStartsAt)} /></Field><Field label="Designated class start" hint="The countdown begins exactly one countdown-video duration before this time."><input name="designatedStartAt" type="datetime-local" defaultValue={toLocalInput(lesson.designatedStartAt)} /></Field><label className="switch-row"><input type="checkbox" name="preRollEnabled" defaultChecked={lesson.preRollEnabled} /><span /><div><strong>Enable pre-roll</strong><small>Loop all pre-roll items until the countdown or class begins.</small></div></label><button className="button primary">Save timing</button></form>
        <div className="timing-explain"><span>◷</span><div><strong>{countdown && lesson.designatedStartAt ? `Countdown begins ${formatDuration(countdown.durationMs || countdown.mediaDurationMs)} before class` : "Countdown is optional"}</strong><p>Assign one video as the countdown. Its full duration determines when it starts automatically.</p></div></div>
      </section>
      <section className="panel playlist-panel"><div className="panel-heading"><div><h2>Playback sequence</h2><p>Pre-roll loops, countdown runs once, then lesson media plays in order.</p></div><span className="pill">{items.length} items</span></div>
        {items.length > 0 && <div className="preview-strip"><span>PREVIEW WITH TRIMS & FADES</span>{items.map(item => <button key={item.id} onClick={() => setPreviewItem(item)}>▶ {item.title}</button>)}</div>}
        {items.length ? <div className="playlist">{items.map((item, index) => <article key={item.id} className={`playlist-item ${item.role}`}><div className="order-controls"><button aria-label={`Move ${item.title} up`} disabled={!index} onClick={() => move(index, -1)}>↑</button><span>{index + 1}</span><button aria-label={`Move ${item.title} down`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>↓</button></div><div className="media-thumb">{item.type === "video" ? "▶" : item.type === "audio" ? "♫" : "▧"}</div><div className="item-main"><div><span className={`role ${item.role}`}>{roleName(item.role)}</span><strong>{item.title}</strong></div><small>{item.mediaFileName || item.type} · {formatDuration(item.durationMs || item.mediaDurationMs)}</small><div className="item-options"><select aria-label="Role" value={item.role} onChange={e => changeItem(item, { role: e.target.value })}><option value="preRoll">Pre-roll</option><option value="countdown">Countdown</option><option value="lesson">Main lesson</option></select><select aria-label="End behavior" value={item.endBehavior} onChange={e => changeItem(item, { endBehavior: e.target.value })}><option value="advance">Advance</option><option value="loop">Loop</option><option value="pause">Pause on final frame</option></select><label>Volume <input type="number" min="0" max="150" defaultValue={item.volumePercent} onBlur={e => changeItem(item, { volumePercent: Number(e.target.value) })} />%</label></div><details className="item-advanced"><summary>Trim, fades & volunteer notes</summary><div className="advanced-grid"><Field label="Display title"><input defaultValue={item.title} onBlur={e => e.target.value !== item.title && changeItem(item, { title: e.target.value })} /></Field><Field label="Start at (seconds)"><input type="number" min="0" step="0.1" defaultValue={item.startMs / 1000} onBlur={e => changeItem(item, { startMs: Math.round(Number(e.target.value) * 1000) })} /></Field><Field label="End at (seconds)"><input type="number" min="0" step="0.1" defaultValue={item.endMs ? item.endMs / 1000 : ""} onBlur={e => changeItem(item, e.target.value ? { endMs: Math.round(Number(e.target.value) * 1000) } : { clearEndMs: true })} /></Field><Field label="Fade in (seconds)"><input type="number" min="0" max="30" step="0.1" defaultValue={(item.fadeInMs || 0) / 1000} onBlur={e => changeItem(item, { fadeInMs: Math.round(Number(e.target.value) * 1000) })} /></Field><Field label="Fade out (seconds)"><input type="number" min="0" max="30" step="0.1" defaultValue={(item.fadeOutMs || 0) / 1000} onBlur={e => changeItem(item, { fadeOutMs: Math.round(Number(e.target.value) * 1000) })} /></Field><Field label="Volunteer notes"><input defaultValue={item.notes || ""} placeholder="Shown during playback" onBlur={e => changeItem(item, { notes: e.target.value })} /></Field></div><label className="check-line"><input type="checkbox" defaultChecked={item.normalizeAudio} onChange={e => changeItem(item, { normalizeAudio: e.target.checked })} /> Normalize audio when a processed derivative is available</label></details></div><button className="delete-button" onClick={() => removeItem(item.id)} title="Remove item">×</button></article>)}</div> : <Empty title="This playlist is empty" body="Add videos, audio, or images from your local media library." action={<button className="button primary" onClick={() => setShowAdd(true)}>Add media</button>} />}
      </section>
    </div>
  </>;
}

function MediaView({ media, lessons, refresh, notify, canUpload, storage }: { media: Media[]; lessons: Lesson[]; refresh: () => void; notify: (s: string) => void; canUpload: boolean; storage?: StorageStatus }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showLink, setShowLink] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<Media>();
  const availableLessons = [...lessons].filter(l => !l.archived).sort((a, b) => a.date.localeCompare(b.date));
  const firstUpcoming = availableLessons.find(l => new Date(`${l.date}T23:59:59`) >= new Date()) || availableLessons.at(-1);
  const [showUpload, setShowUpload] = useState(false);
  const [storagePolicy, setStoragePolicy] = useState<"lesson" | "persistent">(availableLessons.length ? "lesson" : "persistent");
  const [linkMode, setLinkMode] = useState<"online" | "download">("online");
  const [linkStoragePolicy, setLinkStoragePolicy] = useState<"lesson" | "persistent">(availableLessons.length ? "lesson" : "persistent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [retentionTargets, setRetentionTargets] = useState<Media[]>([]);
  const [retentionMode, setRetentionMode] = useState<"expire" | "keep">("expire");
  const [retentionDate, setRetentionDate] = useState(dateInputValue(undefined, 28));
  const [bulkBusy, setBulkBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [organizeTargets, setOrganizeTargets] = useState<Media[]>([]);
  const [manageMedia, setManageMedia] = useState<Media>();
  const [mediaImpact, setMediaImpact] = useState<MediaImpact>();
  const [manageBusy, setManageBusy] = useState(false);
  const [conversionLessonId, setConversionLessonId] = useState(firstUpcoming?.id || "");
  const [slideSeconds, setSlideSeconds] = useState(10);
  useEffect(() => { if (!media.some(item => ["downloading", "pending", "processing"].includes(item.processingStatus) || ["pending", "converting"].includes(item.conversionStatus))) return; const timer = window.setTimeout(refresh, 4000); return () => window.clearTimeout(timer); }, [media, refresh]);
  const managedMediaId = manageMedia?.id;
  useEffect(() => { if (!managedMediaId) return; const updated = media.find(item => item.id === managedMediaId); if (updated) setManageMedia(updated); }, [media, managedMediaId]);
  useEffect(() => { setSelectedIds(current => { const next = new Set([...current].filter(id => media.some(item => item.id === id))); return next.size === current.size ? current : next; }); }, [media]);
  const folders = [...new Set(media.map(item => item.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const normalizedSearch = search.trim().toLowerCase();
  const filteredMedia = media.filter(item => (!folderFilter || item.folder === folderFilter) && (!normalizedSearch || `${item.fileName} ${item.folder} ${item.tagsCsv}`.toLowerCase().includes(normalizedSearch)));
  const selectedMedia = media.filter(item => selectedIds.has(item.id));
  const allSelected = filteredMedia.length > 0 && filteredMedia.every(item => selectedIds.has(item.id));
  function toggleSelection(id: string) { setSelectedIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleAll() { setSelectedIds(current => { const next = new Set(current); for (const item of filteredMedia) { if (allSelected) next.delete(item.id); else next.add(item.id); } return next; }); }
  function openRetention(items: Media[], forceExpire = false) {
    if (!items.length) return;
    setRetentionTargets(items);
    setRetentionMode(forceExpire || items.some(item => item.storagePolicy === "lesson") ? "expire" : "keep");
    setRetentionDate(dateInputValue(items.length === 1 ? items[0].deleteAfter : undefined, 28));
  }
  async function runBulk(action: "delete" | "expire" | "keep", items: Media[], deleteOn?: string) {
    if (!items.length) return;
    setBulkBusy(true);
    try {
      await api<{ updated: number }>("/api/v1/media/bulk", { method: "POST", body: JSON.stringify({ mediaIds: items.map(item => item.id), action, deleteOn: action === "expire" ? deleteOn : null }) });
      setSelectedIds(new Set()); setRetentionTargets([]); refresh();
      notify(action === "delete" ? `${items.length} media item${items.length === 1 ? "" : "s"} deleted.` : action === "keep" ? `${items.length} media item${items.length === 1 ? "" : "s"} will be kept permanently.` : `${items.length} media item${items.length === 1 ? "" : "s"} will be deleted after ${formatDate(deleteOn!)}.`);
    } catch (e) { notify(errorText(e)); }
    finally { setBulkBusy(false); }
  }
  async function deleteSelected() {
    if (!selectedMedia.length || !confirm(`Delete ${selectedMedia.length} selected media item${selectedMedia.length === 1 ? "" : "s"}? They will be removed from lessons and signage, and their local files cannot be recovered.`)) return;
    await runBulk("delete", selectedMedia);
  }
  async function saveRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runBulk(retentionMode, retentionTargets, retentionMode === "expire" ? retentionDate : undefined);
  }
  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!organizeTargets.length) return;
    const values = Object.fromEntries(new FormData(event.currentTarget)); setBulkBusy(true);
    try {
      if (organizeTargets.length === 1) await api(`/api/v1/media/${organizeTargets[0].id}/organize`, { method: "PATCH", body: JSON.stringify({ fileName: values.fileName, folder: values.folder, tagsCsv: values.tagsCsv }) });
      else await api("/api/v1/media/bulk", { method: "POST", body: JSON.stringify({ mediaIds: organizeTargets.map(item => item.id), action: "organize", folder: values.folder, tagsCsv: values.tagsCsv }) });
      setOrganizeTargets([]); setSelectedIds(new Set()); refresh(); notify(`${organizeTargets.length} media item${organizeTargets.length === 1 ? "" : "s"} organized.`);
    } catch (e) { notify(errorText(e)); } finally { setBulkBusy(false); }
  }
  async function loadImpact(item: Media) { setManageMedia(item); setMediaImpact(undefined); try { setMediaImpact(await api<MediaImpact>(`/api/v1/media/${item.id}/impact`)); } catch (e) { notify(errorText(e)); } }
  async function reprocessMedia() { if (!manageMedia) return; setManageBusy(true); try { await api(`/api/v1/media/${manageMedia.id}/reprocess`, { method: "POST", body: "{}" }); notify(`${manageMedia.fileName} queued for reprocessing.`); setManageMedia(undefined); refresh(); } catch (e) { notify(errorText(e)); } finally { setManageBusy(false); } }
  async function replaceMedia(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!manageMedia || !confirm(`Replace ${manageMedia.fileName}? Every lesson and sign using it will receive the new version.`)) return; setManageBusy(true); try { await api(`/api/v1/media/${manageMedia.id}/replace`, { method: "POST", body: new FormData(event.currentTarget) }); notify(`${manageMedia.fileName} replaced; its previous version remains available.`); setManageMedia(undefined); refresh(); } catch (e) { notify(errorText(e)); } finally { setManageBusy(false); } }
  async function restoreMediaVersion(version: MediaVersion) { if (!manageMedia || !confirm(`Restore version ${version.versionNumber} of ${version.fileName} as the new current version?`)) return; setManageBusy(true); try { await api(`/api/v1/media/${manageMedia.id}/versions/${version.id}/restore`, { method: "POST", body: "{}" }); notify(`Version ${version.versionNumber} restored as a new current version.`); setManageMedia(undefined); refresh(); } catch (e) { notify(errorText(e)); } finally { setManageBusy(false); } }
  async function convertPresentation() { if (!manageMedia) return; setManageBusy(true); try { await api(`/api/v1/media/${manageMedia.id}/convert`, { method: "POST", body: "{}" }); notify(`${manageMedia.fileName} queued for fully local slide conversion.`); setManageMedia(undefined); refresh(); } catch (e) { notify(errorText(e)); } finally { setManageBusy(false); } }
  async function addConvertedSlides() { if (!manageMedia || !conversionLessonId) return; setManageBusy(true); try { const result = await api<{ added: number }>(`/api/v1/media/${manageMedia.id}/conversion/add-to-lesson`, { method: "POST", body: JSON.stringify({ lessonId: conversionLessonId, imageDurationSeconds: slideSeconds }) }); notify(`${result.added} converted slides added to the lesson.`); setManageMedia(undefined); refresh(); } catch (e) { notify(errorText(e)); } finally { setManageBusy(false); } }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (!files.length) return;
    const persistent = storagePolicy === "persistent";
    const lessonId = persistent ? undefined : String(form.get("lessonId") || "");
    setUploading(true); setUploadProgress(0);
    try {
      let completed = 0;
      for (const file of files) {
        await uploadMediaFile(file, { persistent, lessonId, folder: String(form.get("folder") || ""), tagsCsv: String(form.get("tagsCsv") || ""), onProgress: percent => setUploadProgress(Math.round(((completed + percent / 100) / files.length) * 100)) });
        completed++; setUploadProgress(Math.round(completed / files.length * 100));
      }
      notify(persistent ? `${files.length} reusable file${files.length === 1 ? "" : "s"} stored permanently.` : `${files.length} file${files.length === 1 ? "" : "s"} stored until four weeks after the selected lesson.`);
      setShowUpload(false); refresh();
    }
    catch (e) { notify(errorText(e)); } finally { setUploading(false); setUploadProgress(0); }
  }
  async function addLink(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const download = linkMode === "download"; const persistent = !download || linkStoragePolicy === "persistent"; try { await api("/api/v1/media/link", { method: "POST", body: JSON.stringify({ url: form.get("url"), title: form.get("title") || null, download, persistent, lessonId: persistent ? null : form.get("lessonId"), folder: form.get("folder"), tagsCsv: form.get("tagsCsv") }) }); setShowLink(false); refresh(); notify(download ? "YouTube download queued for local processing." : "Online media added to the library."); } catch (e) { notify(errorText(e)); } }
  return <><PageHead eyebrow="LOCAL STORAGE" title="Media library" detail="Files stay on this server. Lesson media expires automatically; reusable media can be kept permanently." action={canUpload ? <div className="head-actions"><button className="button" onClick={() => setShowLink(true)}>Add link</button><button className="button primary" onClick={() => setShowUpload(true)}>Upload media</button></div> : undefined} />
    {canUpload && storage && <section className="storage-overview" aria-label="LessonCue storage"><div><span>Available for uploads</span><strong>{formatBytes(storage.remainingBytes)}</strong></div><StorageMeter storage={storage} /><small>{formatBytes(storage.usedBytes)} used of {formatBytes(storage.allocationBytes)} allocated</small></section>}
    {previewMedia && <Modal title={`Preview: ${previewMedia.fileName}`} onClose={() => setPreviewMedia(undefined)}><MediaPreview media={previewMedia} /></Modal>}
    {retentionTargets.length > 0 && <Modal title={retentionTargets.length === 1 ? `Retention: ${retentionTargets[0].fileName}` : `Retention for ${retentionTargets.length} items`} onClose={() => !bulkBusy && setRetentionTargets([])}><form className="stack" onSubmit={saveRetention}><fieldset className="retention-options"><legend>How long should LessonCue keep {retentionTargets.length === 1 ? "this media" : "these items"}?</legend><label><input type="radio" checked={retentionMode === "expire"} onChange={() => setRetentionMode("expire")} /><span><strong>Delete on a selected date</strong><small>The media remains available through the end of that date.</small></span></label><label><input type="radio" checked={retentionMode === "keep"} onChange={() => setRetentionMode("keep")} /><span><strong>Keep permanently</strong><small>Retain it until someone explicitly deletes it.</small></span></label></fieldset>{retentionMode === "expire" && <Field label="Delete after"><input type="date" value={retentionDate} min={dateInputValue()} onChange={e => setRetentionDate(e.target.value)} required autoFocus /></Field>}<button className="button primary" disabled={bulkBusy}>{bulkBusy ? "Saving…" : "Save retention"}</button></form></Modal>}
    {organizeTargets.length > 0 && <Modal title={organizeTargets.length === 1 ? `Organize: ${organizeTargets[0].fileName}` : `Organize ${organizeTargets.length} items`} onClose={() => !bulkBusy && setOrganizeTargets([])}><form className="stack" onSubmit={saveOrganization}>{organizeTargets.length === 1 && <Field label="Display name"><input name="fileName" defaultValue={organizeTargets[0].fileName} maxLength={255} required /></Field>}<Field label="Folder" hint="Use / to create a simple hierarchy, such as Science/Experiments."><input name="folder" defaultValue={organizeTargets.length === 1 ? organizeTargets[0].folder : ""} maxLength={120} placeholder="Unfiled" /></Field><Field label="Tags" hint="Separate up to 20 tags with commas."><input name="tagsCsv" defaultValue={organizeTargets.length === 1 ? organizeTargets[0].tagsCsv : ""} maxLength={500} placeholder="intro, grade 6, reusable" /></Field>{organizeTargets.length > 1 && <div className="alert">Folder and tags will replace the current values on all selected items.</div>}<button className="button primary" disabled={bulkBusy}>{bulkBusy ? "Saving…" : "Save organization"}</button></form></Modal>}
    {manageMedia && <MediaManagerModal media={manageMedia} impact={mediaImpact} lessons={availableLessons} busy={manageBusy} conversionLessonId={conversionLessonId} slideSeconds={slideSeconds} onClose={() => !manageBusy && setManageMedia(undefined)} onOrganize={() => { setOrganizeTargets([manageMedia]); setManageMedia(undefined); }} onReprocess={reprocessMedia} onReplace={replaceMedia} onRestoreVersion={restoreMediaVersion} onConvert={convertPresentation} onAddSlides={addConvertedSlides} onConversionLesson={setConversionLessonId} onSlideSeconds={setSlideSeconds} />}
    {showUpload && <Modal title="Upload media" onClose={() => !uploading && setShowUpload(false)}><form className="stack" onSubmit={upload}><Field label="Files"><input name="files" type="file" multiple accept="video/*,audio/*,image/*,.pdf,.pptx,.odp,.docx" required disabled={uploading} /></Field><div className="two-fields"><Field label="Folder"><input name="folder" maxLength={120} placeholder="Unfiled" /></Field><Field label="Tags"><input name="tagsCsv" maxLength={500} placeholder="intro, reusable" /></Field></div><fieldset className="retention-options"><legend>How long should LessonCue keep these files?</legend>{availableLessons.length > 0 && <label><input type="radio" name="storagePolicy" value="lesson" checked={storagePolicy === "lesson"} onChange={() => setStoragePolicy("lesson")} /><span><strong>For a lesson (default)</strong><small>Delete automatically four weeks after the lesson date.</small></span></label>}<label><input type="radio" name="storagePolicy" value="persistent" checked={storagePolicy === "persistent"} onChange={() => setStoragePolicy("persistent")} /><span><strong>Keep permanently</strong><small>Store in the reusable media library until someone deletes it.</small></span></label></fieldset>{storagePolicy === "lesson" && <Field label="Lesson" hint="Reusing the file in a later lesson automatically extends its deletion date."><select name="lessonId" defaultValue={firstUpcoming?.id} required>{availableLessons.map(l => <option value={l.id} key={l.id}>{formatDate(l.date)} — {l.title}</option>)}</select></Field>}{!availableLessons.length && <div className="alert">Create a lesson before uploading temporary lesson media. This upload will be kept permanently.</div>}<button className="button primary" disabled={uploading}>{uploading ? `Uploading ${uploadProgress}%` : "Upload to local server"}</button></form></Modal>}
    {showLink && <Modal title="Add online media" onClose={() => setShowLink(false)}><form className="stack" onSubmit={addLink}><Field label="Webpage or YouTube URL" hint="Online entries require internet. YouTube videos can instead be copied into local storage."><input name="url" type="url" required autoFocus placeholder="https://…" /></Field><fieldset className="retention-options"><legend>How should LessonCue use it?</legend><label><input type="radio" checked={linkMode === "online"} onChange={() => setLinkMode("online")} /><span><strong>Use online</strong><small>Display a webpage or embedded YouTube player.</small></span></label><label><input type="radio" checked={linkMode === "download"} onChange={() => setLinkMode("download")} /><span><strong>Download YouTube locally</strong><small>Use only for video you are authorized to copy.</small></span></label></fieldset>{linkMode === "download" && <fieldset className="retention-options"><legend>How long should LessonCue keep the copy?</legend>{availableLessons.length > 0 && <label><input type="radio" checked={linkStoragePolicy === "lesson"} onChange={() => setLinkStoragePolicy("lesson")} /><span><strong>For a lesson (default)</strong><small>Delete automatically four weeks after its lesson.</small></span></label>}<label><input type="radio" checked={linkStoragePolicy === "persistent"} onChange={() => setLinkStoragePolicy("persistent")} /><span><strong>Keep permanently</strong><small>Store until someone deletes it.</small></span></label></fieldset>}{linkMode === "download" && linkStoragePolicy === "lesson" && <Field label="Lesson"><select name="lessonId" defaultValue={firstUpcoming?.id} required>{availableLessons.map(l => <option value={l.id} key={l.id}>{formatDate(l.date)} — {l.title}</option>)}</select></Field>}<Field label="Display title"><input name="title" /></Field><div className="two-fields"><Field label="Folder"><input name="folder" maxLength={120} placeholder="Unfiled" /></Field><Field label="Tags"><input name="tagsCsv" maxLength={500} placeholder="online, reference" /></Field></div><button className="button primary">{linkMode === "download" ? "Queue local download" : "Add online media"}</button></form></Modal>}
    {media.length > 0 && <section className="media-filters"><Field label="Search media"><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, folder, or tag" /></Field><Field label="Folder"><select value={folderFilter} onChange={e => setFolderFilter(e.target.value)}><option value="">All folders</option>{folders.map(folder => <option value={folder} key={folder}>{folder}</option>)}</select></Field><span>{filteredMedia.length} of {media.length} items</span></section>}
    {filteredMedia.length > 0 && <section className="media-preview-grid" aria-label="Media previews">{filteredMedia.map(item => <button key={item.id} onClick={() => setPreviewMedia(item)} disabled={item.processingStatus !== "ready"}><span>{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : item.contentType.startsWith("audio") ? "♫" : item.sourceKind === "link" ? "↗" : "▶"}</span><strong>{item.fileName}</strong><small>{item.folder || item.tagsCsv || (item.processingStatus === "ready" ? "Preview" : item.processingStatus)}</small></button>)}</section>}
    {canUpload && selectedMedia.length > 0 && <section className="bulk-actions" aria-label="Bulk media actions"><strong>{selectedMedia.length} selected</strong><span>Organize, change retention, or permanently delete the selected media.</span><div><button className="button" onClick={() => setOrganizeTargets(selectedMedia)} disabled={bulkBusy}>Folder & tags</button><button className="button" onClick={() => openRetention(selectedMedia, true)} disabled={bulkBusy}>Set expiration</button><button className="button" onClick={() => runBulk("keep", selectedMedia)} disabled={bulkBusy}>Keep permanently</button><button className="button danger" onClick={deleteSelected} disabled={bulkBusy}>Delete</button></div></section>}
    <section className="panel"><div className="media-table table-head"><label className="media-select"><input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!canUpload || !filteredMedia.length} aria-label="Select all visible media" /></label><span>File</span><span>Type</span><span>Duration</span><span>Size</span><span>Retention</span><span>Status</span></div>{filteredMedia.length ? filteredMedia.map(m => <div className={`media-table ${selectedIds.has(m.id) ? "selected" : ""}`} key={m.id}><label className="media-select"><input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleSelection(m.id)} disabled={!canUpload} aria-label={`Select ${m.fileName}`} /></label><span className="media-name">{m.thumbnailUrl ? <img src={m.thumbnailUrl} alt="" /> : <b>{m.contentType.startsWith("video") ? "▶" : m.contentType.startsWith("audio") ? "♫" : m.sourceKind === "link" ? "↗" : "▧"}</b>}<span><strong>{m.fileName}</strong><small>{[m.folder || "Unfiled", m.tagsCsv, `v${m.version}`].filter(Boolean).join(" · ")}</small>{canUpload && <button className="media-manage" onClick={() => loadImpact(m)}>Manage versions & impact</button>}</span></span><span>{m.sourceKind === "link" ? `${m.linkKind} link` : friendlyType(m.contentType)}</span><span>{formatDuration(m.durationMs)}</span><span>{formatBytes(m.sizeBytes)}</span><button type="button" className={`retention-badge ${m.storagePolicy === "lesson" ? "temporary" : ""}`} onClick={() => openRetention([m])} disabled={!canUpload}>{m.storagePolicy === "lesson" && m.deleteAfter ? `Deletes ${formatShortDate(m.deleteAfter)}` : "Keep permanently"}<small>{m.retentionDateIsManual ? "Selected date" : m.storagePolicy === "lesson" ? "Based on lesson" : ""}</small></button><span className={`availability ${m.offlineEligible ? "" : "internet"}`}><i className="available-dot" /> {m.processingStatus === "pending" || m.processingStatus === "processing" ? "Processing" : m.processingStatus === "failed" ? "Processing failed" : m.offlineEligible ? "Offline ready" : "Internet required"}</span></div>) : <Empty title={media.length ? "No media matches these filters" : "No media uploaded"} body={media.length ? "Clear the search or choose All folders." : "Upload MP4, MOV, audio, image, PDF, or PowerPoint files."} />}</section>
  </>;
}

function MediaManagerModal({ media, impact, lessons, busy, conversionLessonId, slideSeconds, onClose,
  onOrganize, onReprocess, onReplace, onRestoreVersion, onConvert, onAddSlides, onConversionLesson, onSlideSeconds }:
  { media: Media; impact?: MediaImpact; lessons: Lesson[]; busy: boolean; conversionLessonId: string; slideSeconds: number;
    onClose: () => void; onOrganize: () => void; onReprocess: () => void; onReplace: (event: FormEvent<HTMLFormElement>) => void;
    onRestoreVersion: (version: MediaVersion) => void; onConvert: () => void; onAddSlides: () => void;
    onConversionLesson: (id: string) => void; onSlideSeconds: (seconds: number) => void }) {
  const converting = media.conversionStatus === "pending" || media.conversionStatus === "converting";
  return <Modal title={`Manage: ${media.fileName}`} onClose={onClose}><div className="media-manager">
    <div className="media-manager-summary"><div><span>CURRENT VERSION</span><strong>v{media.version}</strong></div><div><span>LESSON USES</span><strong>{impact?.lessons.reduce((sum, lesson) => sum + lesson.itemCount, 0) ?? "…"}</strong></div><div><span>SIGNAGE USES</span><strong>{impact?.signage.length ?? "…"}</strong></div></div>
    <div className="head-actions"><button className="button" onClick={onOrganize}>Rename, folder & tags</button>{media.sourceKind !== "link" && <button className="button" onClick={onReprocess} disabled={busy}>Reprocess metadata</button>}</div>
    {isConvertibleDocument(media) && <section className={`conversion-card ${media.conversionStatus}`}><div><span>LOCAL SLIDE CONVERSION</span><h3>{media.conversionStatus === "ready" ? `${convertedSlideCount(media)} screen-ready slides` : media.conversionStatus === "failed" ? "Conversion needs attention" : converting ? "Conversion in progress…" : "Turn this document into slides"}</h3><p>{media.conversionError || "LessonCue uses LibreOffice and Poppler on this server; the document is never uploaded to a cloud service."}</p></div>{media.conversionStatus === "ready" ? <div className="conversion-add"><Field label="Add slides to lesson"><select value={conversionLessonId} onChange={event => onConversionLesson(event.target.value)}>{lessons.map(lesson => <option value={lesson.id} key={lesson.id}>{formatDate(lesson.date)} — {lesson.title}</option>)}</select></Field><Field label="Seconds per slide"><input type="number" min="1" max="3600" value={slideSeconds} onChange={event => onSlideSeconds(Number(event.target.value))} /></Field><button className="button primary" onClick={onAddSlides} disabled={busy || !conversionLessonId}>Add slide sequence</button><button className="button" onClick={onConvert} disabled={busy}>Convert again</button></div> : <button className="button primary" onClick={onConvert} disabled={busy || converting}>{media.conversionStatus === "failed" ? "Try conversion again" : converting ? "Converting…" : "Convert to slides"}</button>}</section>}
    {media.sourceKind !== "link" && <form className="replace-media" onSubmit={onReplace}><Field label="Replace current file" hint="Every lesson and sign keeps using this media ID. The current file is archived as a restorable version."><input name="file" type="file" accept="video/*,audio/*,image/*,.pdf,.pptx,.odp,.docx" required disabled={busy} /></Field><button className="button primary" disabled={busy}>{busy ? "Working…" : "Preview impact and replace"}</button></form>}
    <section className="impact-list"><h3>Current impact</h3>{impact?.lessons.map(lesson => <div key={lesson.id}><span>{formatDate(lesson.date)} · {lesson.title}</span><strong>{lesson.itemCount} cue{lesson.itemCount === 1 ? "" : "s"}</strong></div>)}{impact?.signage.map(sign => <div key={sign.id}><span>{sign.name}</span><strong>{sign.enabled ? "Active sign" : "Inactive sign"}</strong></div>)}{impact && !impact.lessons.length && !impact.signage.length && <p className="settings-copy">This media is not currently used by a lesson or sign.</p>}</section>
    <section className="version-list"><h3>Previous versions</h3>{impact?.versions.map(version => <div key={version.id}><span><strong>v{version.versionNumber} · {version.fileName}</strong><small>{formatBytes(version.sizeBytes)} · archived {new Date(version.archivedAt).toLocaleString()} by {version.archivedBy}</small></span><div><a className="button" href={version.downloadUrl}>Download</a><button className="button" onClick={() => onRestoreVersion(version)} disabled={busy}>Restore</button></div></div>)}{impact && !impact.versions.length && <p className="settings-copy">No previous versions yet. The first replacement will archive the current file here.</p>}</section>
  </div></Modal>;
}

function ControllerView({ screens, lessons, refresh, notify }: { screens: Screen[]; lessons: Lesson[]; refresh: () => void; notify: (s: string) => void }) {
  const liveScreens = screens.filter(screen => !screen.revoked);
  const [screenId, setScreenId] = useState(screens.find(screen => screen.online && !screen.revoked)?.id || screens.find(screen => !screen.revoked)?.id || "");
  const selectedScreen = liveScreens.find(screen => screen.id === screenId);
  const availableLessons = lessons.filter(lesson => !lesson.archived && (!selectedScreen?.assignedClassId || lesson.classId === selectedScreen.assignedClassId));
  const [lessonId, setLessonId] = useState(availableLessons[0]?.id || "");
  const lesson = availableLessons.find(item => item.id === lessonId) || availableLessons[0];
  const orderedItems = [...(lesson?.items || [])].sort((a, b) => a.position - b.position);
  const [selectedItemId, setSelectedItemId] = useState("");
  const selectedItem = orderedItems.find(item => item.id === selectedItemId);
  const [seekSeconds, setSeekSeconds] = useState(0);
  async function command(action: string, extras: Record<string, unknown> = {}) {
    if (!screenId) return notify("Choose a paired screen first.");
    try {
      await api(`/api/v1/screens/${screenId}/control`, { method: "POST", body: JSON.stringify({ action, ...extras }) });
      notify(`${action[0].toUpperCase()}${action.slice(1)} sent to ${selectedScreen?.name || "screen"}.`); refresh();
    } catch (e) { notify(errorText(e)); }
  }
  const play = (itemId?: string) => lesson && command("play", { lessonId: lesson.id, itemId: itemId || null });
  const durationSeconds = Math.max(1, Math.round(((selectedItem?.endMs ? selectedItem.endMs - selectedItem.startMs : selectedItem?.durationMs || selectedItem?.mediaDurationMs) || 600_000) / 1000));
  const reportedLesson = lessons.find(item => item.id === selectedScreen?.playbackLessonId);
  const reportedItem = reportedLesson?.items.find(item => item.id === selectedScreen?.playbackItemId);
  const commandPending = !!selectedScreen && selectedScreen.controlVersion > selectedScreen.acknowledgedControlVersion;
  const progress = selectedScreen?.playbackDurationMs ? Math.min(100, (selectedScreen.playbackPositionMs / selectedScreen.playbackDurationMs) * 100) : 0;
  return <div className="controller-page"><PageHead eyebrow="LIVE CONTROL" title="Cellphone controller" detail="Choose a paired screen, then run the lesson from any phone on this local network." action={<span className={`controller-connection ${selectedScreen?.online ? "online" : ""}`}><i />{selectedScreen?.online ? "Screen online" : "Screen offline"}</span>} />
    <div className="controller-grid"><section className="panel controller-target"><Field label="Control this screen"><select value={screenId} onChange={e => { setScreenId(e.target.value); setLessonId(""); setSelectedItemId(""); }}>{liveScreens.map(screen => <option value={screen.id} key={screen.id}>{screen.name} · {screen.online ? "online" : "offline"}</option>)}</select></Field><div className="now-playing"><span>ACTUAL SCREEN STATE</span><strong>{friendlyPlaybackState(selectedScreen?.playbackState)}</strong><small>{reportedItem?.title || reportedLesson?.title || (selectedScreen?.playbackState === "idle" ? "Nothing playing" : "Waiting for item details")}</small>{selectedScreen?.playbackDurationMs ? <><div className="playback-progress"><i style={{ width: `${progress}%` }} /></div><small>{formatDuration(selectedScreen.playbackPositionMs)} / {formatDuration(selectedScreen.playbackDurationMs)}</small></> : null}<span className={`command-ack ${commandPending ? "pending" : ""}`}>{commandPending ? `Sending ${selectedScreen?.controlAction}…` : selectedScreen?.controlVersion ? `Command ${selectedScreen.acknowledgedControlVersion} received` : "Ready for a command"}</span>{selectedScreen?.playbackError && <div className="playback-error">{selectedScreen.playbackError}</div>}</div><div className="transport" aria-label="Playback controls"><button onClick={() => command("previous")} aria-label="Previous media">‹‹</button><button className="transport-main" onClick={() => command(selectedScreen?.playbackState === "paused" ? "resume" : "pause")} aria-label={selectedScreen?.playbackState === "paused" ? "Resume" : "Pause"}>{selectedScreen?.playbackState === "paused" ? "▶" : "Ⅱ"}</button><button onClick={() => command("next")} aria-label="Next media">››</button></div><button className="button stop-button" onClick={() => command("stop")}>■ Stop playback</button></section>
      <section className="panel controller-media"><Field label="Lesson"><select value={lesson?.id || ""} onChange={e => { setLessonId(e.target.value); setSelectedItemId(""); }}><option value="">Choose a lesson</option>{availableLessons.map(item => <option key={item.id} value={item.id}>{formatDate(item.date)} — {item.title}</option>)}</select></Field>{lesson ? <><button className="button primary wide controller-play-all" onClick={() => play()}>▶ Play lesson from the beginning</button><div className="controller-list"><span>SELECT MEDIA</span>{orderedItems.map((item, index) => <button key={item.id} className={selectedItemId === item.id ? "selected" : ""} onClick={() => { setSelectedItemId(item.id); setSeekSeconds(0); play(item.id); }}><b>{index + 1}</b><span><strong>{item.title}</strong><small>{roleName(item.role)} · {formatDuration(item.durationMs || item.mediaDurationMs)}</small></span><i>▶</i></button>)}</div>{selectedItem && <div className="controller-seek"><label><span>Seek within {selectedItem.title}</span><strong>{formatDuration(seekSeconds * 1000)}</strong></label><input type="range" min="0" max={durationSeconds} value={seekSeconds} onChange={e => setSeekSeconds(Number(e.target.value))} />{cuePoints(selectedItem).length > 0 && <div className="controller-markers" aria-label="Jump to named cue"><span>JUMP TO CUE</span>{cuePoints(selectedItem).map((marker, index) => { const relativeMs = Math.max(0, marker.positionMs - selectedItem.startMs); return <button type="button" key={`${marker.positionMs}-${index}`} onClick={() => { setSeekSeconds(Math.round(relativeMs / 1000)); void command("seek", { positionMs: relativeMs }); }}><strong>{marker.name}</strong><small>{formatDuration(relativeMs)}</small></button>; })}</div>}<button className="button" onClick={() => command("seek", { positionMs: seekSeconds * 1000 })}>Go to position</button></div>}</> : <Empty title="No lesson selected" body="Assign a class to this screen or choose a lesson to begin." />}</section>
    </div><section className="controller-install"><div className="brand-mark">LC</div><div><strong>Save this controller as an app</strong><p>On iPhone or iPad, use Share → Add to Home Screen. On Android, open the browser menu and choose Install app or Add to Home screen.</p><small>{location.origin}/controller</small></div></section>
  </div>;
}

function ScreensView({ screens, classes, pin, refresh, notify }: { screens: Screen[]; classes: LessonClass[]; pin: string; refresh: () => void; notify: (s: string) => void }) {
  const active = screens.filter(s => !s.revoked);
  async function change(screen: Screen, changes: object) { try { await api(`/api/v1/screens/${screen.id}`, { method: "PATCH", body: JSON.stringify(changes) }); refresh(); } catch (e) { notify(errorText(e)); } }
  async function revoke(screen: Screen) { if (!confirm(`Revoke ${screen.name}? It will need to be paired again.`)) return; await api(`/api/v1/screens/${screen.id}`, { method: "DELETE" }); refresh(); }
  return <><PageHead eyebrow="PLAYBACK DEVICES" title="Screens" detail="Pair TVs, assign a class, and check whether each player is ready." action={<div className="pin-card"><span>PAIRING PIN</span><strong>{pin}</strong></div>} />
    <section className="panel"><div className="screen-grid">{active.length ? active.map(s => <article className="screen-card" key={s.id}><div className="screen-card-top"><span className={`screen-icon large ${isOnline(s) ? "online" : ""}`}>▣</span><Status online={isOnline(s)} /></div><input aria-label="Screen name" className="screen-name-input" defaultValue={s.name} onBlur={e => e.target.value !== s.name && change(s, { name: e.target.value })} /><small>{s.deviceModel || s.platform} · {s.osVersion || s.appVersion} · {s.lastSeenAt ? `Last seen ${timeAgo(s.lastSeenAt)}` : "Waiting for first check-in"}</small><div className="screen-diagnostics"><span><b>{friendlyPlaybackState(s.playbackState)}</b> playback</span><span><b>{s.acknowledgedControlVersion}/{s.controlVersion}</b> command</span><span><b>{s.cachedItems}/{s.totalItems}</b> cached</span><span><b>{s.failedDownloads}</b> errors</span></div>{s.playbackError && <div className="playback-error">{s.playbackError}</div>}<Field label="Assigned class"><select value={s.assignedClassId || ""} onChange={e => change(s, e.target.value ? { assignedClassId: e.target.value } : { clearAssignment: true })}><option value="">Not assigned</option>{classes.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></Field><div className="two-fields"><Field label="Site"><input defaultValue={s.site} onBlur={e => change(s, { site: e.target.value })} /></Field><Field label="Tags"><input defaultValue={s.tagsCsv} placeholder="lobby, elementary" onBlur={e => change(s, { tagsCsv: e.target.value })} /></Field></div><label className="switch-row compact"><input type="checkbox" checked={s.volunteerMode} onChange={e => change(s, { volunteerMode: e.target.checked })} /><span /><div><strong>Volunteer mode</strong></div></label><div className="screen-meta"><span>{formatBytes(s.freeBytes)} device free</span><span>Manifest {s.manifestVersion} · {s.lastIpAddress || "IP pending"}</span></div><button className="text-danger" onClick={() => revoke(s)}>Revoke pairing</button></article>) : <Empty title="No screens paired" body={`Install LessonCue TV, choose Pair, and enter ${pin}.`} />}</div></section>
  </>;
}

function CalendarView({ lessons }: { lessons: Lesson[] }) {
  const visible = [...lessons].filter(l => !l.archived).sort((a, b) => a.date.localeCompare(b.date));
  const grouped = visible.reduce<Record<string, Lesson[]>>((all, lesson) => { const key = lesson.date.slice(0, 7); (all[key] ||= []).push(lesson); return all; }, {});
  return <><PageHead eyebrow="SCHEDULE" title="Calendar" detail="Every dated lesson and its pre-class timing in one place." />
    <div className="calendar-stack">{Object.entries(grouped).length ? Object.entries(grouped).map(([month, entries]) => <section className="panel" key={month}><div className="panel-title"><h2>{new Date(`${month}-15T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><span className="pill">{entries.length} lessons</span></div><div className="calendar-grid">{entries.map(l => <article key={l.id}><DateBadge date={l.date} /><div><strong>{l.title}</strong><small>{l.className}</small><div className="calendar-meta"><span>{l.designatedStartAt ? new Date(l.designatedStartAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Start time not set"}</span><RoleSummary items={l.items} /></div></div></article>)}</div></section>) : <section className="panel"><Empty title="No lessons scheduled" body="Create a dated lesson from Classes and it will appear here." /></section>}</div>
  </>;
}

function SignageView({ signage, media, refresh, notify }: { signage: Signage[]; media: Media[]; refresh: () => void; notify: (s: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await api("/api/v1/signage", { method: "POST", body: JSON.stringify({ ...values, enabled: values.enabled === "on", priority: Number(values.priority), startsAt: values.startsAt ? new Date(String(values.startsAt)).toISOString() : null, endsAt: values.endsAt ? new Date(String(values.endsAt)).toISOString() : null, mediaAssetId: values.mediaAssetId || null }) }); setShowForm(false); refresh(); notify("Signage published to matching screens."); } catch (e) { notify(errorText(e)); } }
  async function remove(item: Signage) { if (!confirm(`Delete ${item.name}?`)) return; await api(`/api/v1/signage/${item.id}`, { method: "DELETE" }); refresh(); }
  return <><PageHead eyebrow="AMBIENT PLAYBACK" title="Signage" detail="Schedule welcome screens, idle displays, and high-priority emergency messages." action={<button className="button primary" onClick={() => setShowForm(true)}>New signage</button>} />
    {showForm && <Modal title="Create signage" onClose={() => setShowForm(false)}><form className="stack" onSubmit={create}><Field label="Name"><input name="name" required autoFocus /></Field><div className="two-fields"><Field label="Mode"><select name="mode"><option value="scheduled">Scheduled</option><option value="idle">Idle screen</option><option value="emergency">Emergency override</option></select></Field><Field label="Priority"><input name="priority" type="number" min="0" max="100" defaultValue="10" /></Field></div><Field label="Message"><textarea name="message" rows={3} /></Field><Field label="Optional media"><select name="mediaAssetId"><option value="">Text only</option>{media.filter(m => m.sourceKind !== "link").map(m => <option key={m.id} value={m.id}>{m.fileName}</option>)}</select></Field><div className="two-fields"><Field label="Starts"><input name="startsAt" type="datetime-local" /></Field><Field label="Ends"><input name="endsAt" type="datetime-local" /></Field></div><Field label="Target screen tags" hint="Comma-separated. Leave blank for every screen."><input name="targetTagsCsv" placeholder="lobby, campus-a" /></Field><input type="hidden" name="backgroundColor" value="#25302d" /><input type="hidden" name="textColor" value="#ffffff" /><label className="check-row"><input type="checkbox" name="enabled" defaultChecked /> Publish immediately</label><button className="button primary">Create signage</button></form></Modal>}
    <div className="signage-grid">{signage.length ? signage.map(item => <article className={`signage-card ${item.mode}`} key={item.id} style={{ background: item.backgroundColor, color: item.textColor }}><div className="signage-top"><span>{item.mode.toUpperCase()}</span><span>{item.enabled ? "ACTIVE" : "PAUSED"}</span></div><h2>{item.message || item.name}</h2><p>{item.name}{item.mediaFileName ? ` · ${item.mediaFileName}` : ""}</p><div className="signage-foot"><span>Priority {item.priority}{item.targetTagsCsv ? ` · ${item.targetTagsCsv}` : " · all screens"}</span><button onClick={() => remove(item)}>Delete</button></div></article>) : <section className="panel"><Empty title="No signage yet" body="Create an idle welcome screen or a scheduled announcement." /></section>}</div>
  </>;
}

function UsersView({ users, currentUsername, refresh, notify, canManage }: { users: User[]; currentUsername: string; refresh: () => void; notify: (s: string) => void; canManage: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User>();
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await api("/api/v1/users", { method: "POST", body: JSON.stringify({ ...values, disabled: false }) }); setShowForm(false); refresh(); notify("Local user created."); } catch (e) { notify(errorText(e)); } }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingUser) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/v1/users/${editingUser.id}`, { method: "PUT", body: JSON.stringify({ ...values, password: values.password || null, disabled: editingUser.disabled }) });
      setEditingUser(undefined); notify("User details saved.");
      if (editingUser.username === currentUsername) location.reload(); else refresh();
    } catch (e) { notify(errorText(e)); }
  }
  async function togglePaused(user: User) {
    try {
      await api(`/api/v1/users/${user.id}`, { method: "PUT", body: JSON.stringify({ username: user.username, displayName: user.displayName, email: user.email || null, role: user.role, password: null, disabled: !user.disabled }) });
      refresh(); notify(user.disabled ? `${user.displayName} can sign in again.` : `${user.displayName} is paused and has been signed out.`);
    } catch (e) { notify(errorText(e)); }
  }
  async function remove(user: User) {
    if (!confirm(`Delete ${user.displayName}? This permanently removes the local account and cannot be undone.`)) return;
    try { await api(`/api/v1/users/${user.id}`, { method: "DELETE" }); refresh(); notify(`${user.displayName} was deleted.`); }
    catch (e) { notify(errorText(e)); }
  }
  return <><PageHead eyebrow="ACCESS CONTROL" title="Users" detail="Give staff only the access they need. All accounts remain on this server." action={canManage ? <button className="button primary" onClick={() => setShowForm(true)}>Add user</button> : undefined} />
    {showForm && <Modal title="Add a local user" onClose={() => setShowForm(false)}><form className="stack" onSubmit={create}><Field label="Name"><input name="displayName" required autoFocus /></Field><div className="two-fields"><Field label="Username"><input name="username" required minLength={3} /></Field><Field label="Email (optional)"><input name="email" type="email" /></Field></div><Field label="Role"><select name="role"><option>Editor</option><option>Viewer</option><option>Administrator</option><option>Owner</option></select></Field><Field label="Temporary password" hint="10+ characters with uppercase, lowercase, and a number"><input name="password" type="password" required minLength={10} /></Field><button className="button primary">Create user</button></form></Modal>}
    {editingUser && <Modal title={`Edit ${editingUser.displayName}`} onClose={() => setEditingUser(undefined)}><form className="stack" onSubmit={update}><Field label="Name"><input name="displayName" required autoFocus defaultValue={editingUser.displayName} /></Field><div className="two-fields"><Field label="Username"><input name="username" required minLength={3} maxLength={80} defaultValue={editingUser.username} /></Field><Field label="Email (optional)"><input name="email" type="email" defaultValue={editingUser.email || ""} /></Field></div><Field label="Role"><select name="role" defaultValue={editingUser.role}><option>Editor</option><option>Viewer</option><option>Administrator</option><option>Owner</option></select></Field><Field label="New password (optional)" hint="Leave blank to keep the current password. A new password needs 10+ characters with uppercase, lowercase, and a number."><input name="password" type="password" minLength={10} autoComplete="new-password" /></Field><button className="button primary">Save user</button></form></Modal>}
    <section className="panel user-table"><div className="user-row user-head"><span>User</span><span>Role</span><span>Status</span><span>Last sign-in</span><span>Actions</span></div>{users.map(user => { const self = user.username === currentUsername; return <div className={`user-row ${user.disabled ? "paused" : ""}`} key={user.id}><span className="user-name"><b>{initials(user.displayName)}</b><span><strong>{user.displayName}{self ? " (you)" : ""}</strong><small>@{user.username}{user.email ? ` · ${user.email}` : ""}</small></span></span><span><i className="pill">{user.role}</i></span><span className={`user-status ${user.disabled ? "paused" : ""}`}><i />{user.disabled ? "Paused" : "Active"}</span><span>{user.lastLoginAt ? timeAgo(user.lastLoginAt) : "Never"}</span><span className="user-actions">{canManage && <><button onClick={() => setEditingUser(user)}>Edit</button><button onClick={() => togglePaused(user)} disabled={self} title={self ? "You cannot pause your own account." : undefined}>{user.disabled ? "Reactivate" : "Pause"}</button><button className="danger" onClick={() => remove(user)} disabled={self} title={self ? "You cannot delete your own account." : undefined}>Delete</button></>}</span></div>; })}</section>
  </>;
}

function Settings({ bootstrap, backups, audit, refresh, notify, canManage }: { bootstrap: Bootstrap; backups: Backup[]; audit: Audit[]; refresh: () => void; notify: (s: string) => void; canManage: boolean }) {
  const [automaticStorage, setAutomaticStorage] = useState(bootstrap.storage.automaticAllocation);
  const [allocationGb, setAllocationGb] = useState((bootstrap.storage.allocationBytes / 1024 ** 3).toFixed(1));
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [fixedPairing, setFixedPairing] = useState(bootstrap.pairingFixed);
  const [pairingPin, setPairingPin] = useState(bootstrap.pairingPin);
  const [localHostname, setLocalHostname] = useState(bootstrap.localAddress.hostname);
  const [httpPort, setHttpPort] = useState(String(bootstrap.httpPort.port));
  const [restorePreview, setRestorePreview] = useState<BackupPreview>();
  const [restoreResult, setRestoreResult] = useState<BackupRestoreResult>();
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  async function saveOrganization(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await api("/api/v1/organization", { method: "PUT", body: JSON.stringify({ ...values, defaultLessonDurationMinutes: Number(values.defaultLessonDurationMinutes), defaultRetentionDays: Number(values.defaultRetentionDays) }) }); refresh(); notify("Organization settings saved."); } catch (e) { notify(errorText(e)); } }
  async function saveNavigationColors(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await api("/api/v1/organization", { method: "PUT", body: JSON.stringify({ ...o, ...values }) }); refresh(); notify("Navigation colors saved."); } catch (e) { notify(errorText(e)); } }
  async function backup(full: boolean) { try { await api(`/api/v1/backups?full=${full}`, { method: "POST", body: "{}" }); refresh(); notify(full ? "Full backup created." : "Configuration backup created."); } catch (e) { notify(errorText(e)); } }
  async function previewBackupRestore(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setRestoreBusy(true); try { const preview = await api<BackupPreview>("/api/v1/backups/restore/preview", { method: "POST", body: form }); setRestorePreview(preview); setRestoreResult(undefined); setRestoreConfirmation(""); } catch (e) { notify(errorText(e)); } finally { setRestoreBusy(false); } }
  async function restoreBackup() { if (!restorePreview || restoreConfirmation !== "RESTORE") return; setRestoreBusy(true); try { const result = await api<BackupRestoreResult>("/api/v1/backups/restore", { method: "POST", body: JSON.stringify({ restoreId: restorePreview.restoreId, confirmation: restoreConfirmation }) }); setRestoreResult(result); notify("Backup restored. Review the safety-backup details, then reload LessonCue."); } catch (e) { notify(errorText(e)); } finally { setRestoreBusy(false); } }
  async function saveStorage(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { const limitBytes = automaticStorage ? 0 : Math.round(Number(allocationGb) * 1024 ** 3); await api<StorageStatus>("/api/v1/storage", { method: "PUT", body: JSON.stringify({ limitBytes }) }); refresh(); notify(automaticStorage ? "Storage allocation will adjust automatically." : "Storage allocation saved."); } catch (e) { notify(errorText(e)); } }
  async function checkUpdates() { setChecking(true); try { const status = await api<UpdateStatus>("/api/v1/updates/check", { method: "POST", body: "{}" }); refresh(); notify(status.updateAvailable ? `LessonCue ${status.latestVersion} is available.` : "LessonCue is up to date."); } catch (e) { notify(errorText(e)); } finally { setChecking(false); } }
  async function installUpdate() { if (!confirm(`Install LessonCue ${bootstrap.update.latestVersion}? The local interface will be unavailable briefly while the server restarts.`)) return; setInstalling(true); try { await api("/api/v1/updates/install", { method: "POST", body: "{}" }); notify("Installing the update. LessonCue will reconnect automatically."); await waitForVersion(bootstrap.update.latestVersion); location.reload(); } catch (e) { notify(errorText(e)); setInstalling(false); } }
  async function savePairingPin(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { await api("/api/v1/pairing/pin", { method: "PUT", body: JSON.stringify({ automatic: !fixedPairing, pin: fixedPairing ? pairingPin : null }) }); refresh(); notify(fixedPairing ? "The fixed pairing PIN is active." : "Automatic PIN rotation is active."); } catch (e) { notify(errorText(e)); } }
  async function saveLocalAddress(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { const status = await api<LocalAddressStatus>("/api/v1/local-address", { method: "PUT", body: JSON.stringify({ hostname: localHostname }) }); setLocalHostname(status.hostname); refresh(); notify(status.pending ? `Setting up ${status.address}…` : `${status.address} is active.`); } catch (e) { notify(errorText(e)); } }
  async function saveHttpPort(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const port = Number(httpPort); if (!confirm(`Change LessonCue's browser port to ${port}? The interface will restart. Saved browser links and screens using the old address must be updated.`)) return; try { const status = await api<HttpPortStatus>("/api/v1/http-port", { method: "PUT", body: JSON.stringify({ port }) }); setHttpPort(String(status.port)); if (status.supported) { notify(`Restarting LessonCue at ${status.address}…`); const destination = new URL(location.href); destination.port = status.port === 80 ? "" : String(status.port); for (let attempt = 0; attempt < 45; attempt++) { await new Promise(resolve => window.setTimeout(resolve, 1000)); try { await fetch(`${destination.origin}/health`, { mode: "no-cors", cache: "no-store" }); location.assign(destination.origin); return; } catch { /* Wait for the protected restart or rollback. */ } } notify("The new port did not respond. Returning to the previous address."); location.reload(); } else { refresh(); notify(status.error || "Port saved. Restart the server to apply it."); } } catch (e) { notify(errorText(e)); } }
  const o = bootstrap.settings;
  return <><PageHead eyebrow="SERVER" title="Settings" detail="Branding, defaults, backups, and local server operations." />
    {restorePreview && <Modal title={restoreResult ? "Restore complete" : "Review backup restore"} onClose={() => !restoreBusy && setRestorePreview(undefined)}>{restoreResult ? <div className="restore-complete"><div className="success-mark">✓</div><h3>{restoreResult.organization} was restored</h3><p>A full safety backup was created first and remains available on this server.</p><Definition label="Safety backup" value={restoreResult.safetyBackupFileName} /><Definition label="Media" value={restoreResult.mediaRestored ? "Restored from the archive" : "Existing server media preserved"} /><p className="settings-copy">This server kept its {restoreResult.preservedServerSettings.join(", ")}.</p><button className="button primary wide" onClick={() => location.reload()}>Reload restored LessonCue</button></div> : <div className="restore-review"><div className="restore-heading"><div><span>{restorePreview.kind.toUpperCase()} BACKUP</span><h3>{restorePreview.organization}</h3><p>{restorePreview.fileName}</p></div><strong>{formatBytes(restorePreview.compressedBytes)}</strong></div><div className="restore-counts"><Definition label="Users" value={String(restorePreview.users)} /><Definition label="Classes" value={String(restorePreview.classes)} /><Definition label="Lessons" value={String(restorePreview.lessons)} /><Definition label="Media records" value={String(restorePreview.mediaRecords)} /></div>{restorePreview.warnings.map(warning => <div className="alert" key={warning}>{warning}</div>)}<div className="danger-callout"><strong>This replaces current LessonCue data.</strong><p>LessonCue creates a full safety backup before changing anything. The receiving server's identity, keys, network address, port, and pairing secrets remain unchanged.</p></div><Field label="Type RESTORE to continue"><input value={restoreConfirmation} onChange={e => setRestoreConfirmation(e.target.value)} autoComplete="off" /></Field><button className="button danger wide" onClick={restoreBackup} disabled={restoreBusy || restoreConfirmation !== "RESTORE"}>{restoreBusy ? "Restoring…" : "Create safety backup and restore"}</button></div>}</Modal>}
    <div className="settings-grid"><section className="panel wide-settings"><h2>Organization & branding</h2><form className="stack" onSubmit={saveOrganization}><div className="two-fields"><Field label="Organization"><input name="name" defaultValue={o.name} disabled={!canManage} required /></Field><Field label="Site"><input name="siteName" defaultValue={o.siteName} disabled={!canManage} required /></Field></div><div className="two-fields"><Field label="Time zone"><input name="timeZone" defaultValue={o.timeZone} disabled={!canManage} required /></Field><Field label="Week starts"><select name="weekStartsOn" defaultValue={o.weekStartsOn} disabled={!canManage}><option>Sunday</option><option>Monday</option></select></Field></div><Field label="Welcome message"><input name="welcomeMessage" defaultValue={o.welcomeMessage} disabled={!canManage} /></Field><div className="two-fields"><Field label="Default lesson minutes"><input name="defaultLessonDurationMinutes" type="number" min="5" max="480" defaultValue={o.defaultLessonDurationMinutes} disabled={!canManage} /></Field><Field label="Archive retention days"><input name="defaultRetentionDays" type="number" min="1" max="3650" defaultValue={o.defaultRetentionDays} disabled={!canManage} /></Field></div><div className="two-fields"><Field label="Navigation background"><input name="primaryColor" type="color" defaultValue={o.primaryColor} disabled={!canManage} /></Field><Field label="Accent color"><input name="accentColor" type="color" defaultValue={o.accentColor} disabled={!canManage} /></Field></div>{canManage && <button className="button primary">Save settings</button>}</form></section>
      <section className="panel"><h2>Navigation appearance</h2><p className="settings-copy">Choose navigation text and selected-tab colors independently from the background and accent colors.</p><form className="stack" onSubmit={saveNavigationColors}><div className="two-fields"><Field label="Navigation text"><input name="navigationTextColor" type="color" defaultValue={o.navigationTextColor} disabled={!canManage} /></Field><Field label="Selected navigation tab"><input name="selectedTabColor" type="color" defaultValue={o.selectedTabColor} disabled={!canManage} /></Field></div>{canManage && <button className="button primary">Save navigation colors</button>}</form></section>
      <section className="panel"><h2>Storage allocation</h2><div className="storage-facts"><Definition label="LessonCue is using" value={formatBytes(bootstrap.storage.usedBytes)} /><Definition label="Available on computer" value={formatBytes(bootstrap.storage.diskAvailableBytes)} /><Definition label="Available for uploads" value={formatBytes(bootstrap.storage.remainingBytes)} /></div><StorageMeter storage={bootstrap.storage} />{canManage ? <form className="stack storage-form" onSubmit={saveStorage}><label className="check-row"><input type="checkbox" checked={automaticStorage} onChange={e => setAutomaticStorage(e.target.checked)} /> Adjust allocation automatically</label><Field label="Maximum LessonCue storage" hint={`Must be between ${formatBytes(bootstrap.storage.usedBytes)} and ${formatBytes(bootstrap.storage.maximumAllocationBytes)}. LessonCue keeps 512 MB free for the operating system.`}><div className="number-suffix"><input type="number" min={Math.max(.1, bootstrap.storage.usedBytes / 1024 ** 3)} max={bootstrap.storage.maximumAllocationBytes / 1024 ** 3} step="0.1" value={allocationGb} onChange={e => setAllocationGb(e.target.value)} disabled={automaticStorage} required={!automaticStorage} /><span>GB</span></div></Field><button className="button primary">Save storage limit</button></form> : <p className="settings-copy">An administrator controls the upload allocation.</p>}</section>
      <section className="panel"><h2>Software updates</h2><Definition label="Installed version" value={bootstrap.update.currentVersion} /><Definition label="Latest version" value={bootstrap.update.latestVersion || "Not checked yet"} /><Definition label="Last checked" value={bootstrap.update.lastCheckedAt ? timeAgo(bootstrap.update.lastCheckedAt) : "Not checked yet"} /><p className="settings-copy">LessonCue checks once each day and shows an alert when a newer release is available.</p>{bootstrap.update.error && <div className="alert error">{bootstrap.update.error}</div>}<div className="head-actions"><button className="button" onClick={checkUpdates} disabled={checking}>{checking ? "Checking…" : "Check now"}</button>{canManage && bootstrap.update.updateAvailable && bootstrap.update.automaticInstallSupported && <button className="button primary" onClick={installUpdate} disabled={installing}>{installing ? "Installing…" : `Install ${bootstrap.update.latestVersion}`}</button>}{bootstrap.update.releaseUrl && <a className="button" href={bootstrap.update.releaseUrl} target="_blank" rel="noreferrer">Release notes</a>}</div>{!bootstrap.update.automaticInstallSupported && <p className="settings-copy">Run the current release installer once from SSH to enable automatic updates on this server.</p>}</section>
      <section className="panel"><h2>Connection & pairing</h2><Definition label="Browser address" value={`${location.protocol}//${location.host}`} /><Definition label="Preferred local address" value={bootstrap.httpPort.address} /><Definition label="HTTP port" value={String(bootstrap.httpPort.port)} /><Definition label="Server name" value={bootstrap.serverName} /><Definition label="Server ID" value={bootstrap.serverId} mono />{(bootstrap.localAddress.pending || bootstrap.httpPort.pending) && <div className="alert">The new connection setting is being applied. The previous address may remain available briefly.</div>}{bootstrap.localAddress.error && <p className="settings-copy">{bootstrap.localAddress.error}</p>}{bootstrap.httpPort.error && <p className="settings-copy">{bootstrap.httpPort.error}</p>}{canManage && bootstrap.httpPort.configurable && <form className="stack pairing-form" onSubmit={saveHttpPort}><Field label="Browser port" hint="Port 80 is the default and does not need to be typed in the browser address."><input type="number" min="1" max="65535" step="1" value={httpPort} onChange={e => setHttpPort(e.target.value)} inputMode="numeric" required /></Field><button className="button primary">Save browser port</button></form>}{canManage && bootstrap.localAddress.supported && <form className="stack pairing-form" onSubmit={saveLocalAddress}><Field label="Local browser name" hint="Use letters, numbers, or hyphens. Devices on this network will open this name with .local appended."><div className="number-suffix domain-suffix"><input value={localHostname} onChange={e => setLocalHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 63))} pattern="[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?" minLength={1} maxLength={63} required autoComplete="off" /><span>.local</span></div></Field><button className="button primary">Save local address</button></form>}<Definition label="Current pairing PIN" value={bootstrap.pairingPin} mono />{canManage ? <form className="stack pairing-form" onSubmit={savePairingPin}><label className="check-row"><input type="checkbox" checked={fixedPairing} onChange={e => setFixedPairing(e.target.checked)} /> Use a fixed local PIN</label><Field label="Six-digit pairing PIN" hint={fixedPairing ? "This PIN remains active until an administrator changes it." : "Automatic mode creates a new PIN every ten minutes."}><input value={pairingPin} onChange={e => setPairingPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} disabled={!fixedPairing} required={fixedPairing} autoComplete="off" /></Field><button className="button primary">Save pairing mode</button></form> : <p className="settings-copy">{bootstrap.pairingFixed ? "An administrator has configured a fixed local PIN." : "The pairing PIN rotates automatically every ten minutes."}</p>}</section><section className="panel"><h2>Privacy & backups</h2><div className="privacy-callout"><span>⌂</span><div><strong>Fully local</strong><p>The interface, database, accounts, schedules, and media live on this server. No hosted service is required.</p></div></div>{canManage && <><div className="backup-actions"><button className="button" onClick={() => backup(false)}>Back up settings</button><button className="button primary" onClick={() => backup(true)}>Full backup</button></div><form className="backup-restore-upload" onSubmit={previewBackupRestore}><label><span>Restore a LessonCue backup</span><input name="file" type="file" accept=".zip,application/zip" required disabled={restoreBusy} /></label><button className="button" disabled={restoreBusy}>{restoreBusy ? "Validating…" : "Validate and preview"}</button></form></>}{backups.slice(0, 4).map(item => <a className="backup-row" href={`/api/v1/backups/${item.id}/file`} key={item.id}><span>{item.kind} · {formatBytes(item.sizeBytes)}</span><small>{new Date(item.createdAt).toLocaleString()}</small></a>)}</section><section className="panel"><h2>Recent activity</h2><div className="audit-list">{audit.slice(0, 8).map(item => <div key={item.id}><span>{item.action.replaceAll(".", " ")}</span><small>{item.actor} · {timeAgo(item.timestamp)}</small></div>)}</div></section><section className="panel"><h2>Server commands</h2><pre>sudo systemctl status lessoncue{`\n`}sudo journalctl -u lessoncue -f{`\n`}sudo systemctl restart lessoncue</pre></section></div>
  </>;
}

function TimelineEditor({ media, item, onSave }: { media?: Media; item: PlaylistItem; onSave: (changes: Record<string, unknown>) => void | Promise<void> }) {
  const duration = Math.max(.04, (media?.durationMs || item.mediaDurationMs || item.durationMs || 1_000) / 1000);
  const [start, setStart] = useState(Math.min(duration, item.startMs / 1000));
  const [end, setEnd] = useState(Math.min(duration, (item.endMs || media?.durationMs || item.mediaDurationMs || item.durationMs || 1_000) / 1000));
  const [fadeIn, setFadeIn] = useState((item.fadeInMs || 0) / 1000);
  const [fadeOut, setFadeOut] = useState((item.fadeOutMs || 0) / 1000);
  const [markers, setMarkers] = useState<CuePoint[]>(() => cuePoints(item));
  const [markerName, setMarkerName] = useState("");
  const [cursor, setCursor] = useState(Math.min(duration, item.startMs / 1000));
  const player = useRef<HTMLMediaElement>(null);
  const source = media?.downloadUrl;
  const startPercent = start / duration * 100;
  const endPercent = end / duration * 100;
  function seek(value: number, edge: "start" | "end") {
    const next = Math.round(value * 25) / 25;
    if (edge === "start") setStart(Math.min(next, end - .04)); else setEnd(Math.max(next, start + .04));
    const previewPosition = edge === "start" ? Math.min(next, end - .04) : start;
    setCursor(previewPosition);
    if (player.current) player.current.currentTime = previewPosition;
  }
  function updatePreview(element: HTMLMediaElement) {
    const position = element.currentTime;
    setCursor(position);
    if (position >= end) { element.pause(); element.currentTime = start; return; }
    const intoSelection = position - start;
    const remaining = end - position;
    const fade = Math.min(fadeIn ? intoSelection / fadeIn : 1, fadeOut ? remaining / fadeOut : 1, 1);
    element.volume = Math.max(0, Math.min(1, item.volumePercent / 100 * fade));
  }
  function jumpToMarker(marker: CuePoint) {
    const position = Math.max(start, Math.min(end, marker.positionMs / 1000));
    setCursor(position);
    if (player.current) player.current.currentTime = position;
  }
  function addMarker() {
    const name = markerName.trim() || `Marker ${markers.length + 1}`;
    const positionMs = Math.round(Math.max(start, Math.min(end, cursor)) * 1000);
    setMarkers(current => [...current, { name, positionMs }].sort((a, b) => a.positionMs - b.positionMs));
    setMarkerName("");
  }
  if (!media || !source || (!media.contentType.startsWith("video/") && !media.contentType.startsWith("audio/"))) return <MediaPreview media={media} item={item} />;
  return <section className="timeline-editor">
    <div className="timeline-player">{media.contentType.startsWith("video/") ? <video ref={player as React.RefObject<HTMLVideoElement>} src={source} controls playsInline onLoadedMetadata={e => { e.currentTarget.currentTime = start; }} onTimeUpdate={e => updatePreview(e.currentTarget)} /> : <audio ref={player as React.RefObject<HTMLAudioElement>} src={source} controls onLoadedMetadata={e => { e.currentTarget.currentTime = start; }} onTimeUpdate={e => updatePreview(e.currentTarget)} />}</div>
    <div className="timeline-art" aria-label="Media filmstrip, waveform, and cue markers">{media.filmstripUrl && <img src={media.filmstripUrl} alt="Video filmstrip" />}{media.waveformUrl && <img className="waveform" src={media.waveformUrl} alt="Audio waveform" />}<i className="trim-before" style={{ width: `${startPercent}%` }} /><i className="trim-after" style={{ left: `${endPercent}%` }} /><span className="selection" style={{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }} />{markers.map((marker, index) => <button type="button" className="timeline-marker" style={{ left: `${Math.min(100, marker.positionMs / 1000 / duration * 100)}%` }} title={`${marker.name} · ${formatPreciseTime(marker.positionMs / 1000)}`} aria-label={`Jump preview to ${marker.name}`} onClick={() => jumpToMarker(marker)} key={`${marker.positionMs}-${index}`}><span /></button>)}</div>
    <div className="timeline-rulers"><label>In <strong>{formatPreciseTime(start)}</strong><input type="range" min="0" max={duration} step="0.04" value={start} onChange={e => seek(Number(e.target.value), "start")} /></label><label>Out <strong>{formatPreciseTime(end)}</strong><input type="range" min="0.04" max={duration} step="0.04" value={end} onChange={e => seek(Number(e.target.value), "end")} /></label></div>
    <div className="timeline-fades"><Field label={`Fade in · ${fadeIn.toFixed(1)}s`}><input type="range" min="0" max={Math.min(30, end - start)} step="0.1" value={fadeIn} onChange={e => setFadeIn(Number(e.target.value))} /></Field><Field label={`Fade out · ${fadeOut.toFixed(1)}s`}><input type="range" min="0" max={Math.min(30, end - start)} step="0.1" value={fadeOut} onChange={e => setFadeOut(Number(e.target.value))} /></Field></div>
    <section className="marker-editor"><div><Field label={`New marker at ${formatPreciseTime(cursor)}`}><input value={markerName} maxLength={80} placeholder={`Marker ${markers.length + 1}`} onChange={e => setMarkerName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addMarker(); } }} /></Field><button type="button" className="button" onClick={addMarker} disabled={markers.length >= 50}>＋ Add at playhead</button></div>{markers.length ? <div className="marker-list" aria-label="Named cue markers">{markers.map((marker, index) => <div key={`${marker.positionMs}-${index}`}><button type="button" className="marker-time" onClick={() => jumpToMarker(marker)} aria-label={`Preview ${marker.name}`}>{formatPreciseTime(marker.positionMs / 1000)}</button><input value={marker.name} maxLength={80} aria-label={`Name for marker at ${formatPreciseTime(marker.positionMs / 1000)}`} onChange={e => setMarkers(current => current.map((value, position) => position === index ? { ...value, name: e.target.value } : value))} /><button type="button" className="marker-delete" aria-label={`Delete ${marker.name || "marker"}`} onClick={() => setMarkers(current => current.filter((_, position) => position !== index))}>×</button></div>)}</div> : <small>No named markers yet. Play or scrub to a useful moment, then add one.</small>}</section>
    <div className="timeline-actions"><button className="button" onClick={() => { if (player.current) { player.current.currentTime = start; setCursor(start); void player.current.play(); } }}>▶ Preview selection</button><button className="button primary" onClick={() => onSave({ startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), fadeInMs: Math.round(fadeIn * 1000), fadeOutMs: Math.round(fadeOut * 1000), cuePoints: markers.map(marker => ({ name: marker.name.trim(), positionMs: marker.positionMs })).filter(marker => marker.name) })}>Save timeline and markers</button></div>
    <small>Arrow keys nudge a focused trim handle by one 0.04-second frame step. The shaded area will not play.</small>
  </section>;
}

function MediaPreview({ media, item }: { media?: Media; item?: PlaylistItem }) {
  const player = useRef<HTMLMediaElement>(null);
  const [positionMs, setPositionMs] = useState(item?.startMs || 0);
  const startMs = item?.startMs || 0;
  const requestedEnd = item?.endMs;
  const fadeInMs = item?.fadeInMs || 0;
  const fadeOutMs = item?.fadeOutMs || 0;
  const targetVolume = Math.min(1, (item?.volumePercent ?? 100) / 100);
  const source = media?.sourceKind === "link" ? media.sourceUrl : media?.downloadUrl;
  const online = media?.linkKind === "youtube" || media?.linkKind === "embedded" || media?.linkKind === "webpage";
  const frameSource = media?.linkKind === "youtube" ? youtubeEmbedUrl(source) || source : source;
  useEffect(() => {
    const element = player.current; if (!element) return;
    const timer = window.setInterval(() => {
      const current = Math.max(0, element.currentTime * 1000); setPositionMs(current);
      const actualEnd = requestedEnd || (Number.isFinite(element.duration) ? element.duration * 1000 : undefined);
      const fadeIn = fadeInMs ? Math.min(1, Math.max(0, (current - startMs) / fadeInMs)) : 1;
      const fadeOut = fadeOutMs && actualEnd ? Math.min(1, Math.max(0, (actualEnd - current) / fadeOutMs)) : 1;
      element.volume = targetVolume * Math.min(fadeIn, fadeOut);
      if (requestedEnd && current >= requestedEnd) {
        if (item?.endBehavior === "loop") { element.currentTime = startMs / 1000; void element.play(); }
        else element.pause();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [fadeInMs, fadeOutMs, item?.endBehavior, requestedEnd, startMs, targetVolume]);
  if (!media) return <div className="preview-unavailable"><strong>Media unavailable</strong><p>This playlist entry no longer has a media file attached.</p></div>;
  if (media.processingStatus !== "ready") return <div className="preview-unavailable"><strong>{media.processingStatus === "failed" ? "Preview failed" : "Media is still processing"}</strong><p>{media.processingError || "Preview will be available when processing finishes."}</p></div>;
  if (!source) return <div className="preview-unavailable"><strong>No preview source</strong><p>The file is not currently available from this server.</p></div>;
  const mediaElement = media.contentType.startsWith("video") ? <video ref={player as React.RefObject<HTMLVideoElement>} src={source} controls autoPlay playsInline onLoadedMetadata={event => { event.currentTarget.currentTime = startMs / 1000; }} />
    : media.contentType.startsWith("audio") ? <div className="audio-preview"><div>♫</div><audio ref={player as React.RefObject<HTMLAudioElement>} src={source} controls autoPlay onLoadedMetadata={event => { event.currentTarget.currentTime = startMs / 1000; }} /></div>
    : media.contentType.startsWith("image") ? <img src={source} alt={media.fileName} />
    : media.contentType.includes("pdf") ? <object data={source} type="application/pdf"><a href={source} target="_blank" rel="noreferrer">Open PDF preview</a></object>
    : media.contentType.includes("presentation") || /\.(pptx|odp|docx)$/i.test(media.fileName) ? <div className="document-preview"><span>▤</span><strong>{media.fileName}</strong><p>Convertible document · {formatBytes(media.sizeBytes)}</p><a className="button" href={source} target="_blank" rel="noreferrer">Open document</a></div>
    : online ? <iframe src={frameSource} title={media.fileName} allow="autoplay; fullscreen" />
    : <iframe src={source} title={media.fileName} />;
  return <div className="media-preview"><div className="preview-stage">{mediaElement}{item?.notes && <div className="preview-notes">{item.notes}</div>}</div>{item && <div className="preview-readout"><span>Position <strong>{formatDuration(positionMs)}</strong></span><span>Trim <strong>{formatDuration(startMs)} → {requestedEnd ? formatDuration(requestedEnd) : "media end"}</strong></span><span>Fades <strong>{(fadeInMs / 1000).toFixed(1)}s in · {(fadeOutMs / 1000).toFixed(1)}s out</strong></span><span>Volume <strong>{item.volumePercent}%</strong></span></div>}{online && <a className="preview-open" href={source} target="_blank" rel="noreferrer">Open original page ↗</a>}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function RetentionChoices({ lessonDate }: { lessonDate: string }) { return <fieldset className="retention-options"><legend>How long should LessonCue keep this file?</legend><label><input type="radio" name="storagePolicy" value="lesson" defaultChecked /><span><strong>For this lesson (default)</strong><small>Delete automatically on {formatDateAfterDays(lessonDate, 28)}.</small></span></label><label><input type="radio" name="storagePolicy" value="persistent" /><span><strong>Keep permanently</strong><small>Make it reusable for future lessons.</small></span></label></fieldset>; }
function Stat({ label, value, sub, mono }: { label: string; value: string | number; sub: string; mono?: boolean }) { return <div className="stat-card"><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong><small>{sub}</small></div>; }
function PanelTitle({ title, action, onClick }: { title: string; action: string; onClick: () => void }) { return <div className="panel-title"><h2>{title}</h2><button onClick={onClick}>{action} →</button></div>; }
function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) { return <div className="empty"><div>◇</div><strong>{title}</strong><p>{body}</p>{action}</div>; }
function DateBadge({ date }: { date: string }) { const d = new Date(`${date}T12:00:00`); return <span className="date-badge"><b>{d.toLocaleDateString(undefined, { month: "short" })}</b><strong>{d.getDate()}</strong></span>; }
function Status({ online }: { online: boolean }) { return <span className={`status ${online ? "online" : "offline"}`}><i />{online ? "Online" : "Offline"}</span>; }
function RoleSummary({ items }: { items: PlaylistItem[] }) { const pre = items.filter(i => i.role === "preRoll").length; const countdown = items.some(i => i.role === "countdown"); return <span className="role-summary">{pre > 0 && <i>Pre-roll ×{pre}</i>}{countdown && <i>Countdown</i>}</span>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { const heading = `dialog-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`; return <div className="modal-backdrop" onMouseDown={e => e.currentTarget === e.target && onClose()} onKeyDown={e => e.key === "Escape" && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-labelledby={heading}><div className="modal-title"><h2 id={heading}>{title}</h2><button onClick={onClose} aria-label="Close dialog">×</button></div>{children}</div></div>; }
function Definition({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div className="definition"><span>{label}</span><strong className={mono ? "mono small" : ""}>{value}</strong></div>; }
function StorageMeter({ storage }: { storage: StorageStatus }) { const percent = storage.allocationBytes > 0 ? Math.min(100, storage.usedBytes / storage.allocationBytes * 100) : 0; return <div className="storage-meter" role="progressbar" aria-label="LessonCue storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div>; }

function dayPart() { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; }
function formatDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }
function formatDateAfterDays(date: string, days: number) { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); }
function formatShortDate(value: string) { return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function dateInputValue(value?: string, addDays = 0) { if (value) return value.slice(0, 10); const date = new Date(); if (addDays) date.setDate(date.getDate() + addDays); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function formatDuration(ms?: number) { if (ms === undefined || ms === null) return "Duration unknown"; const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function formatPreciseTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.${String(Math.round(seconds % 1 * 100)).padStart(2, "0")}`; }
function formatBytes(bytes: number) { if (bytes === 0) return "0 B"; if (!Number.isFinite(bytes) || bytes < 0) return "—"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`; }
function cuePoints(item?: PlaylistItem): CuePoint[] {
  if (!item?.cuePointsJson) return [];
  try {
    const values = JSON.parse(item.cuePointsJson) as Array<Partial<CuePoint> & { Name?: string; PositionMs?: number }>;
    return values.map(value => ({ name: String(value.name ?? value.Name ?? "").trim(), positionMs: Number(value.positionMs ?? value.PositionMs) })).filter(value => value.name && Number.isFinite(value.positionMs) && value.positionMs >= 0).sort((a, b) => a.positionMs - b.positionMs);
  } catch { return []; }
}
function friendlyType(type: string) { if (type.startsWith("video")) return "Video"; if (type.startsWith("audio")) return "Audio"; if (type.startsWith("image")) return "Image"; if (type.includes("pdf")) return "PDF"; return "Document"; }
function isConvertibleDocument(media: Media) { return /\.(pdf|pptx|odp|docx)$/i.test(media.fileName) || /pdf|presentation|wordprocessingml|opendocument/.test(media.contentType); }
function convertedSlideCount(media: Media) { try { const value = JSON.parse(media.convertedSlidesJson); return Array.isArray(value) ? value.length : 0; } catch { return 0; } }
function friendlyPlaybackState(state?: string) { return ({ idle: "Ready", loading: "Loading", buffering: "Buffering", playing: "Playing", paused: "Paused", completed: "Completed", error: "Error" } as Record<string, string>)[state || "idle"] || "Unknown"; }
function youtubeEmbedUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split("/").filter(Boolean)[1] || "";
    }
    return /^[A-Za-z0-9_-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : undefined;
  } catch { return undefined; }
}
function isOnline(screen: Screen) { return screen.online; }
function timeAgo(value: string) { const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return `${seconds}s ago`; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function roleName(role: PlaylistItem["role"]) { return role === "preRoll" ? "PRE-ROLL" : role === "countdown" ? "COUNTDOWN" : "LESSON"; }
function toLocalInput(value?: string) { if (!value) return ""; const d = new Date(value); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
function errorText(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "LC"; }
async function waitForVersion(version?: string) { await new Promise(resolve => setTimeout(resolve, 4000)); for (let attempt = 0; attempt < 60; attempt++) { try { const status = await api<UpdateStatus>("/api/v1/updates"); if (!version || status.currentVersion === version) return; } catch { /* The server is restarting. */ } await new Promise(resolve => setTimeout(resolve, 2000)); } throw new Error("The update is taking longer than expected. Refresh this page in a minute."); }
function detectDuration(file: File): Promise<number | undefined> { if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) return Promise.resolve(undefined); return new Promise(resolve => { const element = document.createElement(file.type.startsWith("video/") ? "video" : "audio"); const url = URL.createObjectURL(file); element.preload = "metadata"; element.onloadedmetadata = () => { const result = Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : undefined; URL.revokeObjectURL(url); resolve(result); }; element.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); }; element.src = url; }); }

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}
