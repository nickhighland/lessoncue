import { FormEvent, ReactNode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Session = { setupRequired: boolean; authenticated: boolean; username?: string };
type Bootstrap = {
  serverId: string; serverName: string; organization: string; timeZone: string; pairingPin: string;
  counts: { classes: number; lessons: number; media: number; screens: number };
};
type LessonClass = { id: string; name: string; description: string; lessonCount: number; screenCount: number };
type Media = { id: string; fileName: string; contentType: string; sizeBytes: number; durationMs?: number; downloadUrl: string };
type PlaylistItem = {
  id: string; title: string; type: string; role: "lesson" | "preRoll" | "countdown"; position: number;
  mediaAssetId?: string; mediaFileName?: string; durationMs?: number; mediaDurationMs?: number;
  volumePercent: number; endBehavior: string; allowSkip: boolean;
};
type Lesson = {
  id: string; classId: string; className: string; date: string; title: string; designatedStartAt?: string;
  preRollEnabled: boolean; countdownItemId?: string; version: number; items: PlaylistItem[];
};
type Screen = {
  id: string; name: string; platform: string; assignedClassId?: string; assignedClassName?: string;
  volunteerMode: boolean; lastSeenAt?: string; online: boolean; freeBytes: number; failedDownloads: number; revoked: boolean;
};
type View = "dashboard" | "classes" | "media" | "screens" | "settings";

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

function App() {
  const [session, setSession] = useState<Session>();
  const [view, setView] = useState<View>("dashboard");
  const [notice, setNotice] = useState("");

  useEffect(() => { api<Session>("/api/v1/auth/session").then(setSession).catch(() => setSession({ setupRequired: false, authenticated: false })); }, []);
  if (!session) return <Splash />;
  if (!session.authenticated) return <Auth session={session} onAuthenticated={() => api<Session>("/api/v1/auth/session").then(setSession)} />;
  return <Shell view={view} setView={setView} username={session.username || "admin"} notice={notice} setNotice={setNotice}
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
        {session.setupRequired && <Field label="Organization name"><input name="organizationName" required defaultValue="My Organization" /></Field>}
        <Field label="Username"><input name="username" required minLength={3} autoComplete="username" autoFocus={!session.setupRequired} /></Field>
        <Field label="Password" hint={session.setupRequired ? "10+ characters with uppercase, lowercase, and a number" : undefined}>
          <div className="password-field"><input name="password" type={showPassword ? "text" : "password"} required minLength={session.setupRequired ? 10 : undefined} autoComplete={session.setupRequired ? "new-password" : "current-password"} /><button type="button" className="text-button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div>
        </Field>
        {error && <div className="alert error">{error}</div>}
        <button className="button primary wide" disabled={busy}>{busy ? "Please wait…" : session.setupRequired ? "Finish setup" : "Sign in"}</button>
      </form>
      <div className="local-note"><span className="status-dot" /> Local server · {location.host}</div>
    </section>
  </main>;
}

function Shell({ view, setView, username, onLogout, notice, setNotice }: {
  view: View; setView: (view: View) => void; username: string; onLogout: () => void; notice: string; setNotice: (v: string) => void;
}) {
  const [dataVersion, setDataVersion] = useState(0);
  const [bootstrap, setBootstrap] = useState<Bootstrap>();
  const [classes, setClasses] = useState<LessonClass[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = () => setDataVersion(v => v + 1);
  useEffect(() => {
    Promise.all([
      api<Bootstrap>("/api/v1/admin/bootstrap"), api<LessonClass[]>("/api/v1/classes"),
      api<Lesson[]>("/api/v1/lessons"), api<Media[]>("/api/v1/media"), api<Screen[]>("/api/v1/screens"),
    ]).then(([b, c, l, m, s]) => { setBootstrap(b); setClasses(c); setLessons(l); setMedia(m); setScreens(s); })
      .catch(e => setNotice(e.message === "SESSION_EXPIRED" ? "Your session expired. Refresh the page to sign in again." : e.message))
      .finally(() => setLoading(false));
  }, [dataVersion, setNotice]);

  const nav: [View, string, string][] = [["dashboard", "⌂", "Dashboard"], ["classes", "▤", "Classes"], ["media", "▶", "Media library"], ["screens", "▣", "Screens"], ["settings", "⚙", "Settings"]];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup inverse"><div className="brand-mark">LC</div><div><strong>LessonCue</strong><span>{bootstrap?.organization || "Local server"}</span></div></div>
      <nav>{nav.map(([key, icon, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><span>{icon}</span>{label}</button>)}</nav>
      <div className="sidebar-foot"><div className="server-online"><span className="status-dot" /><div><strong>Server online</strong><small>{location.host}</small></div></div><button className="account-button" onClick={onLogout}>{username}<span>Sign out</span></button></div>
    </aside>
    <main className="content">
      {notice && <div className="toast" onClick={() => setNotice("")}>{notice}<span>×</span></div>}
      {loading && !bootstrap ? <div className="loading">Loading local data…</div> : <>
        {view === "dashboard" && bootstrap && <Dashboard bootstrap={bootstrap} lessons={lessons} screens={screens} onNavigate={setView} />}
        {view === "classes" && <ClassesView classes={classes} lessons={lessons} media={media} refresh={refresh} notify={setNotice} />}
        {view === "media" && <MediaView media={media} refresh={refresh} notify={setNotice} />}
        {view === "screens" && bootstrap && <ScreensView screens={screens} classes={classes} pin={bootstrap.pairingPin} refresh={refresh} notify={setNotice} />}
        {view === "settings" && bootstrap && <Settings bootstrap={bootstrap} />}
      </>}
    </main>
  </div>;
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

function ClassesView({ classes, lessons, media, refresh, notify }: { classes: LessonClass[]; lessons: Lesson[]; media: Media[]; refresh: () => void; notify: (s: string) => void }) {
  const [selected, setSelected] = useState(classes[0]?.id || "");
  const [editing, setEditing] = useState<string>();
  const [showClassForm, setShowClassForm] = useState(false);
  const current = classes.find(c => c.id === selected) || classes[0];
  const classLessons = lessons.filter(l => l.classId === current?.id);
  const lesson = lessons.find(l => l.id === editing);
  if (lesson) return <LessonEditor lesson={lesson} media={media} onBack={() => setEditing(undefined)} refresh={refresh} notify={notify} />;

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

function LessonEditor({ lesson, media, onBack, refresh, notify }: { lesson: Lesson; media: Media[]; onBack: () => void; refresh: () => void; notify: (s: string) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const items = [...lesson.items].sort((a, b) => a.position - b.position);
  const countdown = items.find(i => i.role === "countdown");
  async function updateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await api(`/api/v1/lessons/${lesson.id}`, { method: "PUT", body: JSON.stringify({ title: values.title, date: values.date, designatedStartAt: values.designatedStartAt ? new Date(String(values.designatedStartAt)).toISOString() : null, clearDesignatedStartAt: !values.designatedStartAt, preRollEnabled: values.preRollEnabled === "on", clearCountdown: false }) }); notify("Lesson schedule saved."); refresh(); }
    catch (e) { notify(errorText(e)); }
  }
  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const asset = media.find(m => m.id === values.mediaId);
    if (!asset) return;
    const type = asset.contentType.startsWith("video") ? "video" : asset.contentType.startsWith("audio") ? "audio" : "image";
    try { await api(`/api/v1/lessons/${lesson.id}/items`, { method: "POST", body: JSON.stringify({ title: values.title || asset.fileName, type, role: values.role, position: (items.length + 1) * 1000, mediaId: asset.id, durationMs: asset.durationMs, startMs: 0, endMs: null, volumePercent: 100, imageDurationSeconds: type === "image" ? 10 : null, endBehavior: values.role === "preRoll" ? "loop" : "advance", allowSkip: true }) }); setShowAdd(false); refresh(); }
    catch (e) { notify(errorText(e)); }
  }
  async function changeItem(item: PlaylistItem, changes: Partial<PlaylistItem>) { try { await api(`/api/v1/playlist-items/${item.id}`, { method: "PATCH", body: JSON.stringify(changes) }); refresh(); } catch (e) { notify(errorText(e)); } }
  async function removeItem(id: string) { if (!confirm("Remove this item from the playlist? The media file will remain in your library.")) return; await api(`/api/v1/playlist-items/${id}`, { method: "DELETE" }); refresh(); }
  async function move(index: number, delta: number) { const reordered = [...items]; const target = index + delta; if (target < 0 || target >= items.length) return; [reordered[index], reordered[target]] = [reordered[target], reordered[index]]; await api(`/api/v1/lessons/${lesson.id}/reorder`, { method: "POST", body: JSON.stringify({ itemIds: reordered.map(i => i.id) }) }); refresh(); }
  return <>
    <button className="back-button" onClick={onBack}>← Back to {lesson.className}</button>
    <PageHead eyebrow="LESSON BUILDER" title={lesson.title} detail={`${formatDate(lesson.date)} · Manifest version ${lesson.version}`} action={<button className="button primary" onClick={() => setShowAdd(true)}>Add media</button>} />
    {showAdd && <Modal title="Add media to the lesson" onClose={() => setShowAdd(false)}>{media.length ? <form className="stack" onSubmit={addItem}><Field label="Media file"><select name="mediaId" required>{media.map(m => <option key={m.id} value={m.id}>{m.fileName}</option>)}</select></Field><Field label="Playlist role"><select name="role"><option value="lesson">Main lesson</option><option value="preRoll">Pre-roll loop</option><option value="countdown">Countdown video</option></select></Field><Field label="Display title"><input name="title" placeholder="Use media filename" /></Field><button className="button primary">Add to playlist</button></form> : <Empty title="Your media library is empty" body="Upload files from Media library first." />}</Modal>}
    <div className="editor-grid">
      <section className="panel schedule-panel"><h2>Timing</h2><form className="stack" onSubmit={updateLesson}><Field label="Lesson title"><input name="title" defaultValue={lesson.title} required /></Field><Field label="Lesson date"><input name="date" type="date" defaultValue={lesson.date} required /></Field><Field label="Designated start time" hint="The countdown video begins its own duration before this time."><input name="designatedStartAt" type="datetime-local" defaultValue={toLocalInput(lesson.designatedStartAt)} /></Field><label className="switch-row"><input type="checkbox" name="preRollEnabled" defaultChecked={lesson.preRollEnabled} /><span /><div><strong>Enable pre-roll</strong><small>Loop all pre-roll items until the countdown or class begins.</small></div></label><button className="button primary">Save timing</button></form>
        <div className="timing-explain"><span>◷</span><div><strong>{countdown && lesson.designatedStartAt ? `Countdown begins ${formatDuration(countdown.durationMs || countdown.mediaDurationMs)} before class` : "Countdown is optional"}</strong><p>Assign one video as the countdown. Its full duration determines when it starts automatically.</p></div></div>
      </section>
      <section className="panel playlist-panel"><div className="panel-heading"><div><h2>Playback sequence</h2><p>Pre-roll loops, countdown runs once, then lesson media plays in order.</p></div><span className="pill">{items.length} items</span></div>
        {items.length ? <div className="playlist">{items.map((item, index) => <article key={item.id} className={`playlist-item ${item.role}`}><div className="order-controls"><button disabled={!index} onClick={() => move(index, -1)}>↑</button><span>{index + 1}</span><button disabled={index === items.length - 1} onClick={() => move(index, 1)}>↓</button></div><div className="media-thumb">{item.type === "video" ? "▶" : item.type === "audio" ? "♫" : "▧"}</div><div className="item-main"><div><span className={`role ${item.role}`}>{roleName(item.role)}</span><strong>{item.title}</strong></div><small>{item.mediaFileName || item.type} · {formatDuration(item.durationMs || item.mediaDurationMs)}</small><div className="item-options"><select aria-label="Role" value={item.role} onChange={e => changeItem(item, { role: e.target.value as PlaylistItem["role"] })}><option value="preRoll">Pre-roll</option><option value="countdown">Countdown</option><option value="lesson">Main lesson</option></select><select aria-label="End behavior" value={item.endBehavior} onChange={e => changeItem(item, { endBehavior: e.target.value })}><option value="advance">Advance</option><option value="loop">Loop</option><option value="hold">Hold</option></select><label>Volume <input type="number" min="0" max="150" value={item.volumePercent} onChange={e => changeItem(item, { volumePercent: Number(e.target.value) })} />%</label></div></div><button className="delete-button" onClick={() => removeItem(item.id)} title="Remove item">×</button></article>)}</div> : <Empty title="This playlist is empty" body="Add videos, audio, or images from your local media library." action={<button className="button primary" onClick={() => setShowAdd(true)}>Add media</button>} />}
      </section>
    </div>
  </>;
}

function MediaView({ media, refresh, notify }: { media: Media[]; refresh: () => void; notify: (s: string) => void }) {
  const [uploading, setUploading] = useState(false);
  async function upload(files: FileList | null) {
    if (!files?.length) return; setUploading(true);
    try { for (const file of [...files]) { const data = new FormData(); data.append("file", file); const duration = await detectDuration(file); if (duration) data.append("durationMs", String(duration)); await api("/api/v1/media", { method: "POST", body: data }); } notify(`${files.length} file${files.length === 1 ? "" : "s"} stored on the local server.`); refresh(); }
    catch (e) { notify(errorText(e)); } finally { setUploading(false); }
  }
  return <><PageHead eyebrow="LOCAL STORAGE" title="Media library" detail="Files are uploaded directly to this LessonCue server and cached by paired screens." action={<label className="button primary file-button">{uploading ? "Uploading…" : "Upload media"}<input type="file" multiple accept="video/*,audio/*,image/*,.pdf,.pptx" disabled={uploading} onChange={e => upload(e.target.files)} /></label>} />
    <section className="panel"><div className="media-table table-head"><span>File</span><span>Type</span><span>Duration</span><span>Size</span><span>Availability</span></div>{media.length ? media.map(m => <div className="media-table" key={m.id}><span className="media-name"><b>{m.contentType.startsWith("video") ? "▶" : m.contentType.startsWith("audio") ? "♫" : "▧"}</b><span><strong>{m.fileName}</strong><small>{m.id.slice(0, 8)}</small></span></span><span>{friendlyType(m.contentType)}</span><span>{formatDuration(m.durationMs)}</span><span>{formatBytes(m.sizeBytes)}</span><span><i className="available-dot" /> Local</span></div>) : <Empty title="No media uploaded" body="Upload MP4, MOV, audio, image, PDF, or PowerPoint files." />}</section>
  </>;
}

function ScreensView({ screens, classes, pin, refresh, notify }: { screens: Screen[]; classes: LessonClass[]; pin: string; refresh: () => void; notify: (s: string) => void }) {
  const active = screens.filter(s => !s.revoked);
  async function change(screen: Screen, changes: object) { try { await api(`/api/v1/screens/${screen.id}`, { method: "PATCH", body: JSON.stringify(changes) }); refresh(); } catch (e) { notify(errorText(e)); } }
  async function revoke(screen: Screen) { if (!confirm(`Revoke ${screen.name}? It will need to be paired again.`)) return; await api(`/api/v1/screens/${screen.id}`, { method: "DELETE" }); refresh(); }
  return <><PageHead eyebrow="PLAYBACK DEVICES" title="Screens" detail="Pair TVs, assign a class, and check whether each player is ready." action={<div className="pin-card"><span>PAIRING PIN</span><strong>{pin}</strong></div>} />
    <section className="panel"><div className="screen-grid">{active.length ? active.map(s => <article className="screen-card" key={s.id}><div className="screen-card-top"><span className={`screen-icon large ${isOnline(s) ? "online" : ""}`}>▣</span><Status online={isOnline(s)} /></div><input className="screen-name-input" defaultValue={s.name} onBlur={e => e.target.value !== s.name && change(s, { name: e.target.value })} /><small>{s.platform} · {s.lastSeenAt ? `Last seen ${timeAgo(s.lastSeenAt)}` : "Waiting for first check-in"}</small><Field label="Assigned class"><select value={s.assignedClassId || ""} onChange={e => change(s, e.target.value ? { assignedClassId: e.target.value } : { clearAssignment: true })}><option value="">Not assigned</option>{classes.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></Field><label className="switch-row compact"><input type="checkbox" checked={s.volunteerMode} onChange={e => change(s, { volunteerMode: e.target.checked })} /><span /><div><strong>Volunteer mode</strong></div></label><div className="screen-meta"><span>{formatBytes(s.freeBytes)} free</span><span>{s.failedDownloads} failed downloads</span></div><button className="text-danger" onClick={() => revoke(s)}>Revoke pairing</button></article>) : <Empty title="No screens paired" body={`Install LessonCue TV, choose Pair, and enter ${pin}.`} />}</div></section>
  </>;
}

function Settings({ bootstrap }: { bootstrap: Bootstrap }) {
  return <><PageHead eyebrow="SERVER" title="Local server settings" detail="Connection details and operational information for this installation." />
    <div className="settings-grid"><section className="panel"><h2>Connection</h2><Definition label="Browser address" value={`${location.protocol}//${location.host}`} /><Definition label="Server name" value={bootstrap.serverName} /><Definition label="Server ID" value={bootstrap.serverId} mono /><Definition label="Pairing PIN" value={bootstrap.pairingPin} mono /></section><section className="panel"><h2>Privacy & storage</h2><div className="privacy-callout"><span>⌂</span><div><strong>Fully local</strong><p>The admin interface, database, accounts, schedules, and media live on this server. The application does not require the hosted prototype.</p></div></div><p className="settings-copy">Back up <code>/var/lib/lessoncue</code> to preserve your database, media, pairing identity, and screen assignments.</p></section><section className="panel"><h2>Server commands</h2><pre>sudo systemctl status lessoncue{`\n`}sudo journalctl -u lessoncue -f{`\n`}sudo systemctl restart lessoncue</pre></section></div>
  </>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Stat({ label, value, sub, mono }: { label: string; value: string | number; sub: string; mono?: boolean }) { return <div className="stat-card"><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong><small>{sub}</small></div>; }
function PanelTitle({ title, action, onClick }: { title: string; action: string; onClick: () => void }) { return <div className="panel-title"><h2>{title}</h2><button onClick={onClick}>{action} →</button></div>; }
function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) { return <div className="empty"><div>◇</div><strong>{title}</strong><p>{body}</p>{action}</div>; }
function DateBadge({ date }: { date: string }) { const d = new Date(`${date}T12:00:00`); return <span className="date-badge"><b>{d.toLocaleDateString(undefined, { month: "short" })}</b><strong>{d.getDate()}</strong></span>; }
function Status({ online }: { online: boolean }) { return <span className={`status ${online ? "online" : "offline"}`}><i />{online ? "Online" : "Offline"}</span>; }
function RoleSummary({ items }: { items: PlaylistItem[] }) { const pre = items.filter(i => i.role === "preRoll").length; const countdown = items.some(i => i.role === "countdown"); return <span className="role-summary">{pre > 0 && <i>Pre-roll ×{pre}</i>}{countdown && <i>Countdown</i>}</span>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" onMouseDown={e => e.currentTarget === e.target && onClose()}><div className="modal"><div className="modal-title"><h2>{title}</h2><button onClick={onClose}>×</button></div>{children}</div></div>; }
function Definition({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div className="definition"><span>{label}</span><strong className={mono ? "mono small" : ""}>{value}</strong></div>; }

function dayPart() { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; }
function formatDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }
function formatDuration(ms?: number) { if (!ms) return "Duration unknown"; const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function formatBytes(bytes: number) { if (!bytes) return "—"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`; }
function friendlyType(type: string) { if (type.startsWith("video")) return "Video"; if (type.startsWith("audio")) return "Audio"; if (type.startsWith("image")) return "Image"; if (type.includes("pdf")) return "PDF"; return "Document"; }
function isOnline(screen: Screen) { return screen.online; }
function timeAgo(value: string) { const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return `${seconds}s ago`; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function roleName(role: PlaylistItem["role"]) { return role === "preRoll" ? "PRE-ROLL" : role === "countdown" ? "COUNTDOWN" : "LESSON"; }
function toLocalInput(value?: string) { if (!value) return ""; const d = new Date(value); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
function errorText(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }
function detectDuration(file: File): Promise<number | undefined> { if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) return Promise.resolve(undefined); return new Promise(resolve => { const element = document.createElement(file.type.startsWith("video/") ? "video" : "audio"); const url = URL.createObjectURL(file); element.preload = "metadata"; element.onloadedmetadata = () => { const result = Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : undefined; URL.revokeObjectURL(url); resolve(result); }; element.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); }; element.src = url; }); }

createRoot(document.getElementById("root")!).render(<App />);
