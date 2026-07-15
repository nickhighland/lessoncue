"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MediaKind = "video" | "image" | "audio";
type SaveState = "Saved" | "Saving…" | "Offline, changes pending";

type PlaylistItem = {
  id: string;
  title: string;
  kind: MediaKind;
  duration: string;
  thumb: string;
  status: "Offline ready" | "Internet required";
  volume: number;
  behavior: "Advance automatically" | "Pause at end" | "Loop continuously" | "Return to menu" | "Stop playlist";
  imageSeconds?: number;
  start: string;
  end: string;
  note?: string;
};

const initialItems: PlaylistItem[] = [
  { id: "welcome", title: "Welcome Countdown", kind: "video", duration: "05:00", thumb: "countdown", status: "Offline ready", volume: 90, behavior: "Advance automatically", start: "00:00", end: "05:00" },
  { id: "title", title: "The Good Samaritan", kind: "image", duration: "00:10", thumb: "title", status: "Offline ready", volume: 100, behavior: "Advance automatically", imageSeconds: 10, start: "00:00", end: "00:10", note: "Welcome children and introduce today’s big idea." },
  { id: "worship", title: "Love Your Neighbor", kind: "video", duration: "03:42", thumb: "worship", status: "Offline ready", volume: 95, behavior: "Advance automatically", start: "00:00", end: "03:42" },
  { id: "story", title: "Bible Story: Luke 10", kind: "video", duration: "07:18", thumb: "story", status: "Offline ready", volume: 100, behavior: "Pause at end", start: "00:12", end: "07:08", note: "Pause here for the discussion questions." },
  { id: "closing", title: "Kindness Challenge", kind: "image", duration: "00:10", thumb: "closing", status: "Offline ready", volume: 100, behavior: "Advance automatically", imageSeconds: 10, start: "00:00", end: "00:10" },
];

const navItems = ["Dashboard", "Classes", "Calendar", "Media Library", "Screens", "Signage"];

const library = [
  { title: "Books of the Bible", meta: "Video · 02:48", kind: "video" as const, thumb: "worship" },
  { title: "Quiet Prayer Loop", meta: "Audio · 04:12", kind: "audio" as const, thumb: "audio" },
  { title: "Memory Verse · Luke 10:27", meta: "Image · 16:9", kind: "image" as const, thumb: "verse" },
  { title: "Offering Bumper", meta: "Video · 00:30", kind: "video" as const, thumb: "countdown" },
];

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

function EmptyView({ title }: { title: string }) {
  return (
    <main className="simple-view">
      <div className="view-kicker">LessonCue</div>
      <h1>{title}</h1>
      <p>This area is ready for your organization’s {title.toLowerCase()}.</p>
      <button className="primary-btn">Create {title === "Calendar" ? "event" : title.slice(0, -1).toLowerCase()}</button>
    </main>
  );
}

export default function LessonCue() {
  const [activeNav, setActiveNav] = useState("Classes");
  const [items, setItems] = useState(initialItems);
  const [selectedId, setSelectedId] = useState("story");
  const [saveState, setSaveState] = useState<SaveState>("Saved");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [volunteerMode, setVolunteerMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [assigned, setAssigned] = useState(["Elementary Main"]);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const totalDuration = useMemo(() => items.reduce((total, item) => {
    const [m, s] = item.duration.split(":").map(Number);
    return total + m * 60 + s;
  }, 0), [items]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  function announceSave(message?: string) {
    setSaveState("Saving…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveState("Saved");
      if (message) {
        setToast(message);
        setTimeout(() => setToast(""), 2600);
      }
    }, 650);
  }

  function moveItem(id: string, direction: -1 | 1) {
    setItems((current) => {
      const from = current.findIndex((item) => item.id === id);
      const to = from + direction;
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    announceSave("Playlist order updated");
  }

  function dropOn(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setItems((current) => {
      const next = [...current];
      const from = next.findIndex((item) => item.id === draggedId);
      const to = next.findIndex((item) => item.id === targetId);
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedId(null);
    announceSave("Playlist order updated");
  }

  function updateSelected(patch: Partial<PlaylistItem>) {
    setItems((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
    announceSave();
  }

  function duplicateItem(id: string) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const clone = { ...current[index], id: `${id}-${Date.now()}`, title: `${current[index].title} copy` };
      const next = [...current];
      next.splice(index + 1, 0, clone);
      return next;
    });
    announceSave("Item duplicated");
  }

  function deleteItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    if (selectedId === id) setSelectedId(items.find((item) => item.id !== id)?.id ?? "");
    announceSave("Item removed");
  }

  function addLibraryItem(item: typeof library[number]) {
    const newItem: PlaylistItem = {
      id: `${item.kind}-${Date.now()}`,
      title: item.title,
      kind: item.kind,
      duration: item.kind === "image" ? "00:10" : item.meta.split(" · ")[1],
      thumb: item.thumb,
      status: "Offline ready",
      volume: 100,
      behavior: "Advance automatically",
      imageSeconds: item.kind === "image" ? 10 : undefined,
      start: "00:00",
      end: item.kind === "image" ? "00:10" : item.meta.split(" · ")[1],
    };
    setItems((current) => [...current, newItem]);
    setSelectedId(newItem.id);
    setLibraryOpen(false);
    announceSave(`${item.title} added`);
  }

  function onUpload(files: FileList | null) {
    if (!files?.length) return;
    const additions = Array.from(files).map((file, index): PlaylistItem => {
      const kind: MediaKind = file.type.startsWith("image") ? "image" : file.type.startsWith("audio") ? "audio" : "video";
      return {
        id: `upload-${Date.now()}-${index}`,
        title: file.name.replace(/\.[^.]+$/, ""),
        kind,
        duration: kind === "image" ? "00:10" : "00:00",
        thumb: kind === "image" ? "verse" : kind === "audio" ? "audio" : "story",
        status: "Offline ready",
        volume: 100,
        behavior: "Advance automatically",
        imageSeconds: kind === "image" ? 10 : undefined,
        start: "00:00",
        end: kind === "image" ? "00:10" : "00:00",
      };
    });
    setItems((current) => [...current, ...additions]);
    setSelectedId(additions[0].id);
    announceSave(`${additions.length} media ${additions.length === 1 ? "item" : "items"} added`);
  }

  function toggleScreen(name: string) {
    setAssigned((current) => current.includes(name) ? current.filter((screen) => screen !== name) : [...current, name]);
    announceSave("Screen assignment updated");
  }

  function startPlayer(volunteer = false) {
    setVolunteerMode(volunteer);
    setCurrentIndex(0);
    setPlaying(false);
    setPlayerOpen(true);
  }

  const currentItem = items[currentIndex] ?? items[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" onClick={() => setActiveNav("Classes")}>
          <div className="brand-mark"><span></span><span></span><span></span></div>
          <div><strong>LessonCue</strong><small>CityHope Church</small></div>
        </div>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button key={item} className={activeNav === item ? "active" : ""} onClick={() => setActiveNav(item)}>
              <Icon>{item === "Dashboard" ? "⌂" : item === "Classes" ? "▤" : item === "Calendar" ? "□" : item === "Media Library" ? "▶" : item === "Screens" ? "▣" : "◫"}</Icon>
              {item}
              {item === "Screens" && <span className="nav-badge">4</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button><Icon>⚙</Icon> Settings</button>
          <button className="profile"><span className="avatar">NH</span><span><strong>Nick Highland</strong><small>Administrator</small></span><span className="chev">⌄</span></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumbs"><button onClick={() => setActiveNav("Classes")}>Classes</button><span>/</span><button>Children’s Sunday School</button><span>/</span><strong>Jul 19</strong></div>
          <div className="top-actions">
            <span className={`save-state ${saveState === "Saving…" ? "saving" : ""}`}><i></i>{saveState}</span>
            <button className="icon-btn" aria-label="Notifications">♧<b></b></button>
            <button className="quiet-btn" onClick={() => startPlayer(true)}>Volunteer view</button>
          </div>
        </header>

        {activeNav === "Classes" && (
          <main className="lesson-view">
            <section className="lesson-head">
              <div>
                <div className="eyebrow"><span className="class-dot"></span> CHILDREN’S SUNDAY SCHOOL</div>
                <h1>The Good Samaritan</h1>
                <div className="lesson-meta">
                  <span><Icon>□</Icon> Sunday, July 19, 2026</span>
                  <span><Icon>◷</Icon> 9:00 AM</span>
                  <span><Icon>◉</Icon> Available Jul 17–20</span>
                </div>
              </div>
              <div className="lesson-actions">
                <button className="quiet-btn" onClick={() => { setCurrentIndex(0); setVolunteerMode(false); setPlayerOpen(true); }}><Icon>▷</Icon> Preview</button>
                <div className="assign-wrap">
                  <button className="primary-btn" onClick={() => setAssignmentOpen(!assignmentOpen)}><Icon>▣</Icon> {assigned.length ? `Assigned to ${assigned.length} screen${assigned.length > 1 ? "s" : ""}` : "Assign screens"} <span>⌄</span></button>
                  {assignmentOpen && <div className="assign-popover">
                    <strong>Lesson screens</strong><small>Select where this lesson will appear.</small>
                    {["Elementary Main", "Preschool Room 1", "Nursery Main", "Fellowship Hall"].map((screen) => <label key={screen}><input type="checkbox" checked={assigned.includes(screen)} onChange={() => toggleScreen(screen)} /><span>{screen}</span><i>{screen === "Elementary Main" ? "Ready" : "Online"}</i></label>)}
                    <button onClick={() => setAssignmentOpen(false)}>Done</button>
                  </div>}
                </div>
                <button className="icon-btn" aria-label="More lesson actions">•••</button>
              </div>
            </section>

            <section className="readiness-bar">
              <div className="readiness-score"><span>✓</span><div><strong>Offline ready</strong><small>All media is downloaded to Elementary Main</small></div></div>
              <div className="readiness-stat"><small>PLAYLIST</small><strong>{items.length} items · {Math.floor(totalDuration / 60)}:{String(totalDuration % 60).padStart(2, "0")}</strong></div>
              <div className="readiness-stat"><small>LAST SYNCED</small><strong>Today, 2:31 PM</strong></div>
              <button onClick={() => setActiveNav("Screens")}>View screen status <span>→</span></button>
            </section>

            <div className="editor-grid">
              <section className="timeline-panel">
                <div className="panel-head">
                  <div><h2>Lesson playlist</h2><p>Drag media into the order volunteers will play it.</p></div>
                  <div className="add-actions">
                    <input ref={uploadRef} type="file" hidden multiple accept="video/*,audio/*,image/*,.pdf,.pptx" onChange={(event) => onUpload(event.target.files)} />
                    <button className="quiet-btn" onClick={() => uploadRef.current?.click()}><Icon>↑</Icon> Upload</button>
                    <button className="dark-btn" onClick={() => setLibraryOpen(true)}><span>＋</span> Add media</button>
                  </div>
                </div>

                <div className="timeline" role="list" aria-label="Lesson playlist">
                  {items.map((item, index) => (
                    <article
                      key={item.id}
                      role="listitem"
                      draggable
                      onDragStart={() => setDraggedId(item.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => dropOn(item.id)}
                      className={`playlist-card ${selectedId === item.id ? "selected" : ""} ${draggedId === item.id ? "dragging" : ""}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="sequence"><span className="drag-handle" title="Drag to reorder">⠿</span><b>{String(index + 1).padStart(2, "0")}</b></div>
                      <div className={`thumbnail ${item.thumb}`}>
                        {item.thumb === "countdown" && <><em>05:00</em><small>GET READY</small></>}
                        {item.thumb === "title" && <><em>THE GOOD</em><strong>SAMARITAN</strong></>}
                        {item.thumb === "worship" && <><span>LOVE YOUR</span><strong>NEIGHBOR</strong></>}
                        {item.thumb === "story" && <><span>THE</span><strong>GOOD SAMARITAN</strong><small>LUKE 10</small></>}
                        {item.thumb === "closing" && <><span>KINDNESS</span><strong>CHALLENGE</strong></>}
                        {item.thumb === "verse" && <><span>LOVE THE LORD</span><strong>LUKE 10:27</strong></>}
                        {item.thumb === "audio" && <><b>♪</b><span>AUDIO</span></>}
                        {item.kind !== "image" && <i className="play-dot">▶</i>}
                      </div>
                      <div className="item-info">
                        <div className="item-title"><strong>{item.title}</strong>{item.behavior === "Pause at end" && <span className="pause-badge">Ⅱ Pause at end</span>}</div>
                        <div className="item-meta"><span>{item.kind}</span><i></i><span>{item.duration}</span><i></i><span className="offline">✓ {item.status}</span></div>
                        {item.note && <div className="volunteer-note"><span>✎</span>{item.note}</div>}
                      </div>
                      <div className="item-controls" onClick={(event) => event.stopPropagation()}>
                        <div className="move-controls"><button aria-label={`Move ${item.title} up`} disabled={index === 0} onClick={() => moveItem(item.id, -1)}>↑</button><button aria-label={`Move ${item.title} down`} disabled={index === items.length - 1} onClick={() => moveItem(item.id, 1)}>↓</button></div>
                        <button title="Preview" onClick={() => { setCurrentIndex(index); setVolunteerMode(false); setPlayerOpen(true); }}>▷</button>
                        <button title="Duplicate" onClick={() => duplicateItem(item.id)}>▱</button>
                        <button title="Delete" onClick={() => deleteItem(item.id)}>×</button>
                      </div>
                    </article>
                  ))}
                  <button className="timeline-add" onClick={() => setLibraryOpen(true)}><span>＋</span><strong>Add another item</strong><small>Upload files or choose from your media library</small></button>
                </div>
              </section>

              {selected && <aside className="settings-panel">
                <div className="settings-head"><div><small>ITEM {items.findIndex((item) => item.id === selected.id) + 1} SETTINGS</small><h3>{selected.title}</h3></div><button aria-label="Close settings" onClick={() => setSelectedId("")}>×</button></div>
                <div className={`settings-preview ${selected.thumb}`}>
                  {selected.thumb === "story" ? <><span>THE</span><strong>GOOD SAMARITAN</strong><small>LUKE 10</small></> : <><strong>{selected.title}</strong><small>{selected.kind.toUpperCase()}</small></>}
                  {selected.kind !== "image" && <button onClick={() => { setCurrentIndex(items.findIndex((item) => item.id === selected.id)); setPlayerOpen(true); }}>▶</button>}
                </div>
                <label className="field"><span>Title</span><input value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} /></label>
                <div className="section-label">PLAYBACK</div>
                <label className="field"><span>End behavior</span><select value={selected.behavior} onChange={(event) => updateSelected({ behavior: event.target.value as PlaylistItem["behavior"] })}><option>Advance automatically</option><option>Pause at end</option><option>Loop continuously</option><option>Return to menu</option><option>Stop playlist</option></select></label>
                {selected.kind === "image" && <label className="field"><span>Image duration</span><div className="unit-input"><input type="number" min="1" value={selected.imageSeconds ?? 10} onChange={(event) => updateSelected({ imageSeconds: Number(event.target.value), duration: `00:${String(Number(event.target.value)).padStart(2, "0")}` })} /><b>seconds</b></div></label>}
                {selected.kind !== "image" && <>
                  <div className="field"><span>Trim</span><div className="time-row"><label>START<input value={selected.start} onChange={(event) => updateSelected({ start: event.target.value })} /></label><span>→</span><label>END<input value={selected.end} onChange={(event) => updateSelected({ end: event.target.value })} /></label></div><div className="trim-line"><i style={{ left: "8%", right: "12%" }}></i><b style={{ left: "8%" }}></b><b style={{ right: "12%" }}></b></div><button className="text-btn" onClick={() => updateSelected({ start: "00:00", end: selected.duration })}>Reset trim</button></div>
                  <div className="field"><div className="slider-label"><span>Volume</span><strong>{selected.volume}%</strong></div><input className="range" type="range" min="0" max="150" value={selected.volume} onChange={(event) => updateSelected({ volume: Number(event.target.value) })} /><div className="range-scale"><span>0%</span><span>100%</span><span>150%</span></div></div>
                </>}
                <label className="switch-row"><span><strong>Allow skipping</strong><small>Volunteers can skip this item</small></span><input type="checkbox" defaultChecked /><i></i></label>
                <label className="field"><span>Volunteer note</span><textarea placeholder="Add an instruction for volunteers…" value={selected.note ?? ""} onChange={(event) => updateSelected({ note: event.target.value })} /></label>
              </aside>}
            </div>
          </main>
        )}

        {activeNav === "Dashboard" && <Dashboard onOpenLesson={() => setActiveNav("Classes")} onVolunteer={() => startPlayer(true)} />}
        {activeNav === "Media Library" && <MediaLibraryView onAdd={addLibraryItem} onUpload={() => uploadRef.current?.click()} />}
        {activeNav === "Screens" && <ScreensView />}
        {!["Dashboard", "Classes", "Media Library", "Screens"].includes(activeNav) && <EmptyView title={activeNav} />}
      </section>

      {libraryOpen && <div className="modal-backdrop" onMouseDown={() => setLibraryOpen(false)}><section className="library-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><small>MEDIA LIBRARY</small><h2>Add to lesson</h2><p>Choose approved media that is ready for offline playback.</p></div><button onClick={() => setLibraryOpen(false)}>×</button></header><div className="modal-search">⌕ <input autoFocus placeholder="Search media library" /></div><div className="library-grid">{library.map((item) => <button key={item.title} onClick={() => addLibraryItem(item)}><div className={`library-thumb ${item.thumb}`}>{item.thumb === "audio" ? "♪" : "▶"}</div><strong>{item.title}</strong><small>{item.meta}</small><span>＋ Add</span></button>)}</div></section></div>}

      {playerOpen && currentItem && <PlayerModal item={currentItem} index={currentIndex} total={items.length} playing={playing} volunteer={volunteerMode} onPlay={() => setPlaying(!playing)} onClose={() => { setPlayerOpen(false); setPlaying(false); }} onNext={() => setCurrentIndex((value) => Math.min(items.length - 1, value + 1))} onPrev={() => setCurrentIndex((value) => Math.max(0, value - 1))} />}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}

function Dashboard({ onOpenLesson, onVolunteer }: { onOpenLesson: () => void; onVolunteer: () => void }) {
  return <main className="dashboard-view"><div className="dash-head"><div><div className="view-kicker">WEDNESDAY, JULY 15</div><h1>Good afternoon, Nick</h1><p>Everything is ready for Sunday morning.</p></div><button className="primary-btn" onClick={onOpenLesson}>＋ Create lesson</button></div><div className="dash-grid"><button className="next-lesson" onClick={onOpenLesson}><span className="date-tile"><b>JUL</b><strong>19</strong></span><span><small>NEXT LESSON · 9:00 AM</small><strong>The Good Samaritan</strong><em>Children’s Sunday School · 5 items</em></span><i>Offline ready →</i></button><div className="health-card"><small>SCREEN HEALTH</small><strong>4 of 4 online</strong><div><span style={{ width: "100%" }}></span></div><em>All assigned media is downloaded</em></div></div><div className="dash-section-head"><div><h2>Sunday at a glance</h2><p>July 19, 2026</p></div><button>View calendar →</button></div><div className="schedule-list">{[["9:00 AM", "The Good Samaritan", "Children’s Sunday School", "Elementary Main"], ["9:30 AM", "God Made Everything", "Preschool", "Preschool Room 1"], ["10:45 AM", "Faith in Action", "Middle School", "Fellowship Hall"]].map((row) => <div key={row[1]}><b>{row[0]}</b><span><strong>{row[1]}</strong><small>{row[2]}</small></span><em>✓ Ready</em><i>{row[3]}</i></div>)}</div><button className="volunteer-launch" onClick={onVolunteer}><span>▶</span><div><small>VOLUNTEER MODE</small><strong>Launch Today’s Lesson</strong><em>Simple, distraction-free controls for the classroom TV</em></div><b>Open →</b></button></main>;
}

function MediaLibraryView({ onAdd, onUpload }: { onAdd: (item: typeof library[number]) => void; onUpload: () => void }) {
  return <main className="content-view"><div className="content-head"><div><div className="view-kicker">ORGANIZATION MEDIA</div><h1>Media Library</h1><p>Approved files available to every lesson.</p></div><button className="primary-btn" onClick={onUpload}>↑ Upload media</button></div><div className="filter-row"><div>⌕ <input placeholder="Search 48 media items" /></div><button>All media⌄</button><button>Ready offline⌄</button></div><div className="media-page-grid">{[...library, ...library].map((item, index) => <article key={`${item.title}-${index}`}><div className={`media-page-thumb ${item.thumb}`}><span>{item.kind === "audio" ? "♪" : "▶"}</span><i>✓ Offline ready</i></div><strong>{index > 3 ? `${item.title} · Alt` : item.title}</strong><small>{item.meta} · Added Jul {15 - index}</small><button onClick={() => onAdd(item)}>＋ Add to lesson</button></article>)}</div></main>;
}

function ScreensView() {
  const screens = [["Elementary Main", "Online", "100% ready", "18.4 GB free", "2 min ago"], ["Preschool Room 1", "Online", "100% ready", "12.8 GB free", "1 min ago"], ["Nursery Main", "Online", "100% ready", "22.1 GB free", "4 min ago"], ["Fellowship Hall", "Online", "86% ready", "8.2 GB free", "Just now"]];
  return <main className="content-view"><div className="content-head"><div><div className="view-kicker">4 PAIRED DEVICES</div><h1>Screens</h1><p>Monitor downloads, storage, and connection health.</p></div><button className="primary-btn">＋ Pair a screen</button></div><div className="screen-summary"><div><span>●</span><strong>4</strong><small>Online</small></div><div><span>✓</span><strong>3</strong><small>Fully ready</small></div><div><span>↓</span><strong>1</strong><small>Downloading</small></div><div><span>!</span><strong>0</strong><small>Needs attention</small></div></div><div className="screen-table"><div className="screen-row table-head"><span>SCREEN</span><span>STATUS</span><span>DOWNLOADS</span><span>STORAGE</span><span>LAST SEEN</span><span></span></div>{screens.map((screen, index) => <div className="screen-row" key={screen[0]}><span><i className="tv-icon">▣</i><strong>{screen[0]}</strong><small>{index === 0 ? "children · main-building" : index === 3 ? "main-building · hall" : "children · first-floor"}</small></span><span><b className="online-dot"></b>{screen[1]}</span><span><div className="mini-progress"><i style={{ width: index === 3 ? "86%" : "100%" }}></i></div><small>{screen[2]}</small></span><span>{screen[3]}</span><span>{screen[4]}</span><button>•••</button></div>)}</div></main>;
}

function PlayerModal({ item, index, total, playing, volunteer, onPlay, onClose, onNext, onPrev }: { item: PlaylistItem; index: number; total: number; playing: boolean; volunteer: boolean; onPlay: () => void; onClose: () => void; onNext: () => void; onPrev: () => void }) {
  return <div className="player-backdrop"><section className={`player ${volunteer ? "volunteer" : ""}`}><header><div className="player-brand"><div className="brand-mark"><span></span><span></span><span></span></div><span><small>{volunteer ? "TODAY’S LESSON" : "LESSON PREVIEW"}</small><strong>The Good Samaritan</strong></span></div><div><span className="connection-pill">✓ Offline</span><button onClick={onClose}>×</button></div></header><div className={`player-stage ${item.thumb}`}><div className="stage-art"><small>{item.kind.toUpperCase()}</small><strong>{item.title}</strong>{item.note && <p>{item.note}</p>}</div>{!playing && <button className="big-play" onClick={onPlay}>▶</button>}</div><footer><div className="now-playing"><small>NOW PLAYING · {index + 1} OF {total}</small><strong>{item.title}</strong></div><div className="play-controls"><button onClick={onPrev} disabled={index === 0}>Ⅰ◀</button><button className="main-play" onClick={onPlay}>{playing ? "Ⅱ" : "▶"}</button><button onClick={onNext} disabled={index === total - 1}>▶Ⅰ</button></div><div className="progress-wrap"><span>0:00</span><div><i style={{ width: playing ? "28%" : "2%" }}></i></div><span>{item.duration}</span></div><div className="next-up"><small>NEXT</small><strong>{index === total - 1 ? "End of lesson" : `${index + 2}. Up next`}</strong></div></footer>{volunteer && <div className="remote-hint"><span>← → Navigate</span><span>SELECT Play / Pause</span><span>BACK Lesson menu</span></div>}</section></div>;
}
