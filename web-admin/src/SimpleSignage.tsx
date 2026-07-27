import { useEffect, useMemo, useState } from "react";
import "./simple-signage.css";

type Media = {
  id: string;
  fileName: string;
  contentType: string;
  thumbnailUrl?: string;
  downloadUrl: string;
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

type Tab = "layouts" | "playlists" | "signs";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/signage-studio${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.error || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
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
  };
  if (type === "presentation") common.content = "Choose a playlist";
  if (type === "weather") {
    common.weatherProvider = "open-meteo";
    common.weatherLocation = "Your location";
    common.weatherUnits = "fahrenheit";
    common.weatherFields =
      "icon,conditions,temperature,high,low,precipitation";
    common.textAlign = "center";
  }
  if (type === "clock") {
    common.clockDisplay = "both";
    common.clockTimeFormat = "12h";
    common.clockDateFormat = "long";
    common.clockOrder = "time-date";
    common.clockTimeFontSize = 54;
    common.clockDateFontSize = 25;
    common.textAlign = "center";
  }
  if (type === "qr" || type === "wifi") {
    common.qrPlacement = "left";
    common.qrValue =
      type === "wifi"
        ? "WIFI:T:WPA;S:Guest;P:password;;"
        : "https://lessoncue.local";
  }
  return common;
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
  refresh,
  notify,
}: {
  media: Media[];
  screens: Screen[];
  refresh: () => void;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("layouts");
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [signs, setSigns] = useState<Sign[]>([]);
  const [layoutDraft, setLayoutDraft] = useState<Layout>();
  const [playlistDraft, setPlaylistDraft] = useState<Playlist>();
  const [signDraft, setSignDraft] = useState<Sign>();
  const [selectedZoneId, setSelectedZoneId] = useState<string>();
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("All changes saved");

  async function load(prefer?: {
    layoutId?: string;
    playlistId?: string;
    signId?: string;
  }) {
    try {
      const [nextLayouts, nextPlaylists, nextSigns] = await Promise.all([
        request<Layout[]>("/layouts"),
        request<Playlist[]>("/playlists"),
        request<Sign[]>("/signs"),
      ]);
      setLayouts(nextLayouts);
      setPlaylists(nextPlaylists);
      setSigns(nextSigns);
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

  const activeLayout =
    tab === "signs"
      ? layouts.find((item) => item.id === signDraft?.layoutId)
      : layoutDraft;
  const activeAssignments =
    tab === "signs" ? signDraft?.playlistAssignments || {} : {};

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
    if (!confirm(`Delete ${item.name}?`)) return;
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
    if (!confirm(`Delete ${item.name}?`)) return;
    try {
      await request(`/playlists/${item.id}`, { method: "DELETE" });
      setPlaylistDraft(undefined);
      await load();
      notify("Playlist deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete playlist.");
    }
  }

  function addMedia(item: Media) {
    const entry: PlaylistItem = {
      id: id("slide"),
      kind: "media",
      title: item.fileName,
      mediaAssetId: item.id,
      durationSeconds: item.contentType.startsWith("video/") ? 30 : 10,
      transition: "fade",
      volumePercent: 100,
      muted: false,
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

  function addWebPage() {
    const sourceUrl = prompt("Web page address", "https://");
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
      const result = await request<{ id: string }>(
        signDraft.id ? `/signs/${signDraft.id}` : "/signs",
        {
          method: signDraft.id ? "PUT" : "POST",
          body: JSON.stringify({
            name: signDraft.name,
            layoutId: signDraft.layoutId,
            playlistAssignments: signDraft.playlistAssignments,
            screenIds: signDraft.screenIds,
          }),
        },
      );
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
    if (!confirm(`Delete ${item.name}? Its screens will become unassigned.`))
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
        <div className="simple-signage-local">⌂ Self-hosted</div>
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
              onSelect={setSelectedItemId}
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
            />
          ) : (
            <div className="simple-preview-empty">
              <span>▭</span>
              <h2>Nothing selected</h2>
              <p>Choose an item from the left to begin.</p>
            </div>
          )}
          {tab === "playlists" && (
            <MediaTray media={media} onAdd={addMedia} onAddWeb={addWebPage} />
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
}: {
  layout: Layout;
  media: Media[];
  playlists: Playlist[];
  assignments: Record<string, string>;
  selectedZoneId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="simple-display-frame">
      <div
        className="simple-layout-canvas"
        style={{ backgroundColor: layout.backgroundColor }}
      >
        {layout.zones
          .filter((item) => !item.hidden)
          .map((item) => {
            const asset = media.find((value) => value.id === item.mediaAssetId);
            const playlist = playlists.find(
              (value) =>
                value.id ===
                (assignments[item.id] || item.contentPlaylistId),
            );
            return (
              <button
                key={item.id}
                className={`simple-layout-zone ${item.type} ${selectedZoneId === item.id ? "selected" : ""}`}
                style={{
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  width: `${item.width}%`,
                  height: `${item.height}%`,
                  backgroundColor: item.backgroundColor,
                  color: item.textColor,
                  textAlign: (item.textAlign || "left") as
                    | "left"
                    | "center"
                    | "right",
                }}
                onClick={() => onSelect?.(item.id)}
              >
                {asset?.thumbnailUrl && (
                  <img src={asset.thumbnailUrl} alt="" />
                )}
                {item.type === "presentation" ? (
                  <div className="preview-presentation">
                    <span>▶</span>
                    <strong>{playlist?.name || "Choose a playlist"}</strong>
                    <small>
                      {playlist
                        ? `${playlist.items.length} items · continuous loop`
                        : "Playlist area"}
                    </small>
                  </div>
                ) : item.type === "weather" ? (
                  <div className="preview-weather">
                    <span>☀</span>
                    <strong>72°</strong>
                    <small>
                      {item.weatherLocation || item.weatherPostalCode || "Local weather"}
                    </small>
                  </div>
                ) : item.type === "clock" ? (
                  <div className="preview-clock">
                    <strong>9:41</strong>
                    <small>Monday, July 27</small>
                  </div>
                ) : item.type === "qr" || item.type === "wifi" ? (
                  <div className={`preview-qr align-${item.qrPlacement || "left"}`}>
                    <i>▦</i>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.type === "wifi" ? "Scan to join Wi-Fi" : "Scan for details"}</small>
                    </span>
                  </div>
                ) : (
                  <div className="preview-copy">
                    <small>{item.title || elementName(item.type)}</small>
                    <strong>{item.content || elementName(item.type)}</strong>
                  </div>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}

function LayoutInspector({
  layout,
  media,
  selectedZoneId,
  onSelect,
  onChange,
  onDelete,
}: {
  layout: Layout;
  media: Media[];
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
        <button>Element</button>
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
              <option value="webpage">Web page</option>
            </select>
          </label>
          {selected.type !== "presentation" && (
            <label>
              Title
              <input
                value={selected.title || ""}
                onChange={(event) => updateZone({ title: event.target.value })}
              />
            </label>
          )}
          {selected.type === "text" && (
            <label>
              Message
              <textarea
                rows={4}
                value={selected.content || ""}
                onChange={(event) => updateZone({ content: event.target.value })}
              />
            </label>
          )}
          {selected.type === "media" && (
            <label>
              Image or logo
              <select
                value={selected.mediaAssetId || ""}
                onChange={(event) =>
                  updateZone({ mediaAssetId: event.target.value || undefined })
                }
              >
                <option value="">Choose media</option>
                {media
                  .filter((item) => item.contentType.startsWith("image/"))
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.fileName}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {(selected.type === "qr" || selected.type === "wifi") && (
            <>
              <label>
                {selected.type === "wifi" ? "Wi-Fi QR content" : "Web address"}
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
            </>
          )}
          {selected.type === "weather" && (
            <>
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
              <label>
                Display
                <select
                  value={selected.weatherFields || ""}
                  onChange={(event) =>
                    updateZone({ weatherFields: event.target.value })
                  }
                >
                  <option value="icon,conditions,temperature,high,low,precipitation">
                    Full forecast
                  </option>
                  <option value="icon,temperature,conditions">
                    Current conditions
                  </option>
                  <option value="temperature,high,low">Temperature only</option>
                </select>
              </label>
            </>
          )}
          {selected.type === "clock" && (
            <label>
              Show
              <select
                value={selected.clockDisplay || "both"}
                onChange={(event) =>
                  updateZone({ clockDisplay: event.target.value })
                }
              >
                <option value="both">Time and date</option>
                <option value="time">Time only</option>
                <option value="date">Date only</option>
              </select>
            </label>
          )}
          {(selected.type === "calendar" || selected.type === "webpage") && (
            <label>
              {selected.type === "calendar" ? "ICS calendar address" : "Web page address"}
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

function PlaylistTimeline({
  playlist,
  media,
  selectedItemId,
  onSelect,
  onChange,
}: {
  playlist?: Playlist;
  media: Media[];
  selectedItemId?: string;
  onSelect: (id: string) => void;
  onChange: (items: PlaylistItem[]) => void;
}) {
  if (!playlist)
    return (
      <div className="simple-preview-empty">
        <span>↻</span>
        <h2>Choose a playlist</h2>
      </div>
    );
  if (!playlist.items.length)
    return (
      <div className="playlist-empty">
        <span>＋</span>
        <h2>Add media to this loop</h2>
        <p>Choose an image, video, presentation, or web page below.</p>
      </div>
    );
  return (
    <div className="playlist-timeline">
      <div className="timeline-loop-arrow">LOOPS BACK TO START ↻</div>
      {playlist.items.map((item, index) => {
        const asset = media.find((value) => value.id === item.mediaAssetId);
        return (
          <button
            className={`timeline-item ${selectedItemId === item.id ? "selected" : ""}`}
            onClick={() => onSelect(item.id)}
            key={item.id}
          >
            <div className="timeline-thumb">
              {asset?.thumbnailUrl ? (
                <img src={asset.thumbnailUrl} alt="" />
              ) : (
                <span>{item.kind === "web" ? "⌘" : "▶"}</span>
              )}
              <b>{index + 1}</b>
            </div>
            <span>
              <strong>{item.title || asset?.fileName || "Untitled"}</strong>
              <small>
                {item.durationSeconds}s · {item.transition} ·{" "}
                {item.muted ? "muted" : `${item.volumePercent}%`}
              </small>
            </span>
            <div className="timeline-actions">
              <i
                onClick={(event) => {
                  event.stopPropagation();
                  if (index === 0) return;
                  const next = [...playlist.items];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  onChange(next);
                }}
              >
                ↑
              </i>
              <i
                onClick={(event) => {
                  event.stopPropagation();
                  if (index === playlist.items.length - 1) return;
                  const next = [...playlist.items];
                  [next[index], next[index + 1]] = [next[index + 1], next[index]];
                  onChange(next);
                }}
              >
                ↓
              </i>
              <i
                className="remove"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(playlist.items.filter((entry) => entry.id !== item.id));
                }}
              >
                ×
              </i>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MediaTray({
  media,
  onAdd,
  onAddWeb,
}: {
  media: Media[];
  onAdd: (media: Media) => void;
  onAddWeb: () => void;
}) {
  return (
    <section className="signage-media-tray">
      <header>
        <div>
          <strong>Add content</strong>
          <small>Click an item to add it to the end of the loop.</small>
        </div>
        <button onClick={onAddWeb}>＋ Web page</button>
      </header>
      <div>
        {media.slice(0, 20).map((item) => (
          <button onClick={() => onAdd(item)} key={item.id}>
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" />
            ) : (
              <span>▶</span>
            )}
            <small>{item.fileName}</small>
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
