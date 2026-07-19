import { FormEvent, useEffect, useRef, useState } from "react";

const APP_VERSION = "0.31.0";
const IDENTITY_KEY = "lessoncue.web-player.identity.v1";

type Identity = { screenId: string; token: string; deviceName: string };
type ConnectionState = "connecting" | "online" | "reconnecting" | "offline" | "error";
type CuePoint = { name: string; positionMs: number };
type CueItem = {
  itemId: string;
  mediaId?: string;
  type: string;
  title: string;
  downloadUrl?: string;
  playbackUrl?: string;
  contentType?: string;
  fileExtension?: string;
  durationMs?: number;
  startMs: number;
  endMs?: number;
  volumePercent: number;
  imageDurationSeconds?: number;
  endBehavior: string;
  allowSkip: boolean;
  sourceKind?: string;
  linkKind?: string;
  notes?: string;
  fadeInMs: number;
  fadeOutMs: number;
  cuePoints: CuePoint[];
  sizeBytes?: number;
  sha256?: string;
  offlineEligible?: boolean;
};
type Playlist = {
  playlistId: string;
  title: string;
  lessonDate: string;
  designatedStartAt?: string;
  preRollStartsAt?: string;
  countdown?: { enabled: boolean; itemId: string; durationMs: number; startAt?: string; item: CueItem };
  preRoll?: { enabled: boolean; loop: boolean; items: CueItem[] };
  items: CueItem[];
};
type Signage = {
  id: string;
  name: string;
  mode: string;
  priority: number;
  message: string;
  backgroundColor: string;
  textColor: string;
  mediaUrl?: string;
  media?: CueItem;
};
type Manifest = {
  manifestVersion: number;
  screen: { id: string; name: string; volunteerMode: boolean; site: string };
  signage: Signage[];
  signageSchedule?: Signage[];
  playlists: Playlist[];
};
type Command = {
  changed: boolean;
  version: number;
  action: string;
  lessonId?: string;
  itemId?: string;
  positionMs?: number;
};
type ActivePlayback = {
  playlist: Playlist;
  items: CueItem[];
  index: number;
  seekMs: number;
  mode: "lesson" | "preroll" | "countdown";
};
type PlaybackStatus = {
  state: string;
  lessonId?: string;
  itemId?: string;
  positionMs: number;
  durationMs?: number;
  volumePercent: number;
  error?: string;
};

const idleStatus: PlaybackStatus = { state: "idle", positionMs: 0, volumePercent: 100 };

export function WebPlayerApp() {
  const [identity, setIdentity] = useState<Identity | null>(() => readIdentity());
  const [manifest, setManifest] = useState<Manifest>();
  const [connection, setConnection] = useState<ConnectionState>(identity ? "connecting" : "offline");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [active, setActive] = useState<ActivePlayback>();
  const [paused, setPaused] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [interactionUnlocked, setInteractionUnlocked] = useState(false);
  const [unlockNonce, setUnlockNonce] = useState(0);
  const [acknowledgedVersion, setAcknowledgedVersion] = useState(0);
  const [status, setStatus] = useState<PlaybackStatus>(idleStatus);
  const [controlsVisible, setControlsVisible] = useState(true);
  const statusRef = useRef(status);
  const activeRef = useRef(active);
  const manifestRef = useRef(manifest);
  const lastInteractionRef = useRef(Date.now());
  const networkLatencyRef = useRef<number | undefined>(undefined);
  const errorsRef = useRef<{ timestamp: string; area: string; message: string; itemId?: string }[]>([]);
  const signageCacheRef = useRef<{ itemId: string; title: string; state: string; sizeBytes: number; expectedBytes?: number; error?: string }[]>([]);
  const interruptedRef = useRef<{ playback: ActivePlayback; paused: boolean } | undefined>(undefined);
  useDurableSignageCache(manifest?.signageSchedule, identity, signageCacheRef, errorsRef);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { manifestRef.current = manifest; }, [manifest]);

  function forgetPairing(message = "") {
    localStorage.removeItem(IDENTITY_KEY);
    setIdentity(null);
    setManifest(undefined);
    setActive(undefined);
    setStatus(idleStatus);
    setConnection("offline");
    setConnectionMessage(message);
  }

  async function loadManifest(current: Identity, signal?: AbortSignal) {
    const started = performance.now();
    const response = await fetch(`/api/v1/screens/${current.screenId}/manifest`, {
      headers: { Authorization: `Bearer ${current.token}` },
      cache: "no-store",
      signal,
    });
    networkLatencyRef.current = Math.round(performance.now() - started);
    if (response.status === 401 || response.status === 404) throw new PairingExpiredError();
    if (!response.ok) throw new Error(`Manifest request failed (${response.status}).`);
    const next = await response.json() as Manifest;
    setManifest(next);
    setConnection("online");
    setConnectionMessage("");
    return next;
  }

  function startPlayback(playlist: Playlist, items: CueItem[], index = 0, seekMs = 0, mode: ActivePlayback["mode"] = "lesson") {
    if (!items.length) return;
    const playback = { playlist, items, index: Math.max(0, Math.min(index, items.length - 1)), seekMs: Math.max(0, seekMs), mode };
    if (manifestRef.current?.signage.some(sign => sign.mode === "emergency")) {
      interruptedRef.current = { playback, paused: false };
      setActive(undefined);
      setStatus(idleStatus);
      return;
    }
    setPaused(false);
    setAutoplayBlocked(false);
    setActive(playback);
  }

  function applyCommand(command: Command, sourceManifest = manifestRef.current) {
    const current = activeRef.current;
    switch (command.action) {
      case "play": {
        const playlist = sourceManifest?.playlists.find(item => item.playlistId === command.lessonId);
        if (!playlist) throw new Error("The requested lesson is not available to this screen.");
        const allItems = [...(playlist.preRoll?.items || []), ...(playlist.countdown ? [playlist.countdown.item] : []), ...playlist.items];
        const selected = command.itemId ? allItems.findIndex(item => item.itemId === command.itemId) : -1;
        startPlayback(playlist, selected >= 0 ? allItems : playlist.items, selected >= 0 ? selected : 0, command.positionMs || 0);
        break;
      }
      case "stop":
        interruptedRef.current = undefined;
        setActive(undefined);
        setPaused(false);
        setStatus(idleStatus);
        break;
      case "next":
        if (current) moveTo(current.index + 1);
        break;
      case "previous":
        if (current) moveTo(Math.max(0, current.index - 1));
        break;
      case "seek":
        if (current) setActive({ ...current, seekMs: Math.max(0, command.positionMs || 0) });
        break;
      case "pause":
        setPaused(true);
        break;
      case "resume":
        setPaused(false);
        setUnlockNonce(value => value + 1);
        break;
    }
  }

  function moveTo(index: number) {
    const current = activeRef.current;
    if (!current) return;
    if (index < 0 || index >= current.items.length) {
      setActive(undefined);
      setStatus(idleStatus);
      return;
    }
    setPaused(false);
    setAutoplayBlocked(false);
    setActive({ ...current, index, seekMs: 0 });
  }

  function finishItem() {
    const current = activeRef.current;
    if (!current) return;
    const item = current.items[current.index];
    if (item.endBehavior === "loop") {
      setActive({ ...current, seekMs: 0 });
      setUnlockNonce(value => value + 1);
    } else if (item.endBehavior === "playlistLoop" || current.mode === "preroll" && current.index === current.items.length - 1) {
      setActive({ ...current, index: 0, seekMs: 0 });
    } else if (item.endBehavior === "advance" && current.index + 1 < current.items.length) {
      moveTo(current.index + 1);
    } else {
      setActive(undefined);
      setStatus(idleStatus);
    }
  }

  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController();
    let stopped = false;
    let retryMs = 1_000;
    let timer = 0;
    async function refresh() {
      try {
        await loadManifest(identity!, controller.signal);
        retryMs = 1_000;
        timer = window.setTimeout(refresh, 30_000);
      } catch (error) {
        if (stopped || controller.signal.aborted) return;
        if (error instanceof PairingExpiredError) return forgetPairing("This browser was unpaired. Pair it again to continue.");
        setConnection(navigator.onLine ? "reconnecting" : "offline");
        setConnectionMessage(errorText(error));
        timer = window.setTimeout(refresh, retryMs);
        retryMs = Math.min(retryMs * 2, 15_000);
      }
    }
    void refresh();
    return () => { stopped = true; controller.abort(); window.clearTimeout(timer); };
  }, [identity]);

  useEffect(() => {
    const emergency = manifest?.signage.some(sign => sign.mode === "emergency") ?? false;
    const current = activeRef.current;
    if (emergency && current && !interruptedRef.current) {
      interruptedRef.current = {
        playback: { ...current, seekMs: Math.max(current.seekMs, statusRef.current.positionMs) },
        paused,
      };
      setActive(undefined);
      setStatus(idleStatus);
      return;
    }
    if (!emergency && interruptedRef.current) {
      const interrupted = interruptedRef.current;
      interruptedRef.current = undefined;
      setPaused(interrupted.paused);
      setActive(interrupted.playback);
    }
  }, [manifest?.manifestVersion, manifest?.signage, paused]);

  useEffect(() => {
    if (!identity) return;
    let stopped = false;
    let version: number | undefined;
    let timer = 0;
    async function poll() {
      let delay = 750;
      try {
        const query = version == null ? "" : `?after=${version}`;
        const response = await fetch(`/api/v1/screens/${identity!.screenId}/control${query}`, {
          headers: { Authorization: `Bearer ${identity!.token}` },
          cache: "no-store",
        });
        if (response.status === 401 || response.status === 404) throw new PairingExpiredError();
        if (!response.ok) throw new Error(`Controller request failed (${response.status}).`);
        const command = await response.json() as Command;
        if (version == null) {
          version = command.version;
        } else if (command.changed) {
          let freshManifest = manifestRef.current;
          if (command.action === "play") freshManifest = await loadManifest(identity!);
          applyCommand(command, freshManifest);
          version = command.version;
          setAcknowledgedVersion(command.version);
        } else {
          version = Math.max(version, command.version);
        }
        setConnection("online");
      } catch (error) {
        if (stopped) return;
        if (error instanceof PairingExpiredError) return forgetPairing("This browser was unpaired. Pair it again to continue.");
        setConnection(navigator.onLine ? "reconnecting" : "offline");
        setConnectionMessage(errorText(error));
        delay = 2_500;
      }
      timer = window.setTimeout(poll, delay);
    }
    void poll();
    return () => { stopped = true; window.clearTimeout(timer); };
    // Command application intentionally reads the latest manifest/playback refs without restarting the long-poll loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  useEffect(() => {
    if (!identity) return;
    let stopped = false;
    let timer = 0;
    async function heartbeat() {
      const current = statusRef.current;
      try {
        const storage = await navigator.storage?.estimate?.().catch(() => undefined);
        const response = await fetch("/api/v1/tv/status", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${identity!.token}` },
          body: JSON.stringify({
            screenId: identity!.screenId,
            appVersion: APP_VERSION,
            online: navigator.onLine,
            freeBytes: Math.max(0, (storage?.quota || 0) - (storage?.usage || 0)),
            manifestVersion: manifestRef.current?.manifestVersion || 0,
            failedDownloads: errorsRef.current.length,
            acknowledgedControlVersion: acknowledgedVersion,
            playbackState: current.state,
            lessonId: current.lessonId,
            itemId: current.itemId,
            positionMs: current.positionMs,
            durationMs: current.durationMs,
            volumePercent: current.volumePercent,
            playbackError: current.error,
            cachedItems: signageCacheRef.current.filter(item => item.state === "ready").length,
            totalItems: manifestItemCount(manifestRef.current),
            deviceModel: browserName(),
            osVersion: navigator.userAgent.slice(0, 80),
            clientTimeUnixMs: Date.now(),
            networkLatencyMs: networkLatencyRef.current,
            networkQuality: networkQuality(networkLatencyRef.current, navigator.onLine),
            codecCapabilities: codecCapabilities(),
            cacheInventory: signageCacheRef.current,
            recentErrors: errorsRef.current,
          }),
        });
        if (response.status === 401 || response.status === 404) throw new PairingExpiredError();
        if (!response.ok) throw new Error(`Heartbeat failed (${response.status}).`);
        setConnection("online");
      } catch (error) {
        if (stopped) return;
        if (error instanceof PairingExpiredError) return forgetPairing("This browser was unpaired. Pair it again to continue.");
        setConnection(navigator.onLine ? "reconnecting" : "offline");
      }
      timer = window.setTimeout(heartbeat, activeRef.current ? 2_000 : 10_000);
    }
    void heartbeat();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [identity, acknowledgedVersion]);

  useEffect(() => {
    const update = () => {
      if (!navigator.onLine) {
        setConnection("offline");
        setConnectionMessage("The browser is offline. Playback already loaded by the browser may continue.");
      } else if (identity) {
        setConnection("reconnecting");
        setConnectionMessage("Reconnecting to the local LessonCue server…");
      }
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [identity]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentManifest = manifestRef.current;
      const current = activeRef.current;
      if (!currentManifest) return;
      if (!current) {
        const scheduled = currentManifest.playlists.map(playlist => ({ playlist, phase: schedulePhase(playlist) }))
          .find(item => item.phase.kind === "countdown" || item.phase.kind === "preroll");
        if (scheduled?.phase.kind === "countdown" && scheduled.playlist.countdown)
          startPlayback(scheduled.playlist, [scheduled.playlist.countdown.item], 0, scheduled.phase.seekMs, "countdown");
        else if (scheduled?.phase.kind === "preroll" && scheduled.playlist.preRoll)
          startPlayback(scheduled.playlist, scheduled.playlist.preRoll.items, 0, 0, "preroll");
        return;
      }
      if (current.mode === "lesson") return;
      const phase = schedulePhase(current.playlist);
      if (current.mode === "preroll" && phase.kind === "countdown" && current.playlist.countdown)
        startPlayback(current.playlist, [current.playlist.countdown.item], 0, phase.seekMs, "countdown");
      else if ((current.mode === "preroll" || current.mode === "countdown") && phase.kind === "ready")
        startPlayback(current.playlist, current.playlist.items, 0, 0, "lesson");
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function interact() {
      lastInteractionRef.current = Date.now();
      setControlsVisible(true);
    }
    function keyboard(event: KeyboardEvent) {
      if (!identity || event.target instanceof HTMLInputElement) return;
      interact();
      if ([" ", "ArrowRight", "ArrowLeft", "PageDown", "PageUp", "Home", "Escape", "f", "F", "MediaPlayPause", "MediaTrackNext", "MediaTrackPrevious"].includes(event.key))
        event.preventDefault();
      const current = activeRef.current;
      if (event.key === " " || event.key === "MediaPlayPause") {
        setInteractionUnlocked(true);
        setPaused(value => !value);
        setAutoplayBlocked(false);
        setUnlockNonce(value => value + 1);
      } else if (event.key === "Enter" && activeRef.current) {
        setInteractionUnlocked(true);
        setAutoplayBlocked(false);
        setPaused(false);
        setUnlockNonce(value => value + 1);
      } else if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === "MediaTrackNext") {
        if (current) moveTo(current.index + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp" || event.key === "MediaTrackPrevious") {
        if (current) moveTo(Math.max(0, current.index - 1));
      } else if (event.key === "Home" && current) {
        setActive({ ...current, seekMs: 0 });
      } else if (event.key === "Escape") {
        setActive(undefined);
        setStatus(idleStatus);
      } else if (event.key.toLowerCase() === "f") {
        void document.documentElement.requestFullscreen?.().catch(() => undefined);
      }
    }
    const hideTimer = window.setInterval(() => {
      if (activeRef.current && Date.now() - lastInteractionRef.current > 4_000) setControlsVisible(false);
    }, 1_000);
    window.addEventListener("mousemove", interact);
    window.addEventListener("pointerdown", interact);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.clearInterval(hideTimer);
      window.removeEventListener("mousemove", interact);
      window.removeEventListener("pointerdown", interact);
      window.removeEventListener("keydown", keyboard);
    };
  }, [identity]);

  const currentItem = active?.items[active.index];
  const nextItem = active && active.items[active.index + 1];
  usePreload(nextItem);

  function report(next: PlaybackStatus) {
    setStatus(next);
    if (next.error) {
      errorsRef.current = [{ timestamp: new Date().toISOString(), area: "playback", message: next.error, itemId: next.itemId }, ...errorsRef.current].slice(0, 20);
    }
  }

  if (!identity) return <PairingScreen message={connectionMessage} onPaired={next => {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
    setIdentity(next);
    setConnection("connecting");
    setConnectionMessage("");
  }} />;

  return <main className={`web-player ${active ? "playing" : ""} ${new URLSearchParams(location.search).has("kiosk") ? "kiosk" : ""}`}>
    {active && currentItem ? <PlaybackStage
      key={`${currentItem.itemId}-${active.seekMs}-${unlockNonce}`}
      playlist={active.playlist}
      item={currentItem}
      paused={paused}
      seekMs={active.seekMs}
      unlockNonce={unlockNonce}
      onStatus={report}
      onEnded={finishItem}
      onBlocked={() => setAutoplayBlocked(true)}
    /> : <PlayerLibrary manifest={manifest} connection={connection} onPlay={playlist => startPlayback(playlist, playlist.items)} />}

    {active && controlsVisible && <div className="web-player-overlay">
      <div><span>{active.mode === "preroll" ? "PRE-ROLL" : active.mode === "countdown" ? "COUNTDOWN" : "NOW PLAYING"}</span><strong>{currentItem?.title}</strong><small>{active.playlist.title} · {active.index + 1} of {active.items.length}</small></div>
      <div className="web-player-transport">
        <button aria-label="Previous media" onClick={() => moveTo(Math.max(0, active.index - 1))}>‹‹</button>
        <button aria-label={paused ? "Resume" : "Pause"} onClick={() => { setPaused(value => !value); setUnlockNonce(value => value + 1); }}>{paused ? "▶" : "Ⅱ"}</button>
        <button aria-label="Next media" onClick={() => moveTo(active.index + 1)}>››</button>
        <button aria-label="Stop playback" onClick={() => { setActive(undefined); setStatus(idleStatus); }}>■</button>
      </div>
    </div>}

    {(autoplayBlocked || Boolean(active && currentItem && needsPlaybackGesture(currentItem) && !interactionUnlocked)) && <button className="autoplay-unlock" onClick={() => {
      setInteractionUnlocked(true);
      setAutoplayBlocked(false);
      setPaused(false);
      setUnlockNonce(value => value + 1);
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    }}><span>▶</span><strong>Start browser playback</strong><small>Your browser requires one click or Enter press before it can play sound. This only needs to be done after opening the player.</small></button>}

    <div className={`web-player-connection ${connection}`}>
      <i /> <span>{connectionLabel(connection)}</span>
      {connection !== "online" && connectionMessage && <small>{connectionMessage}</small>}
    </div>
    {!active && <div className="web-player-actions">
      <button onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>Enter full screen</button>
      <button onClick={() => forgetPairing()}>Unpair this browser</button>
    </div>}
  </main>;
}

function PairingScreen({ message, onPaired }: { message: string; onPaired: (identity: Identity) => void }) {
  const [requestId, setRequestId] = useState("");
  const [deviceName, setDeviceName] = useState(() => `Browser display · ${browserName()}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(message);

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/pairing/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName, platform: "web-player", appVersion: APP_VERSION }),
      });
      if (!response.ok) throw new Error(`Pairing request failed (${response.status}).`);
      const result = await response.json() as { requestId: string };
      setRequestId(result.requestId);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function confirmPairing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/pairing/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, pin: values.get("pin") }),
      });
      const result = await response.json() as { screenId?: string; deviceToken?: string; error?: string };
      if (!response.ok || !result.screenId || !result.deviceToken) throw new Error(result.error || `Pairing failed (${response.status}).`);
      onPaired({ screenId: result.screenId, token: result.deviceToken, deviceName });
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  return <main className="web-player pairing">
    <section className="web-player-card">
      <div className="web-player-brand"><b>LC</b><span><strong>LessonCue</strong><small>Browser playback client</small></span></div>
      {!requestId ? <form onSubmit={begin}>
        <span className="web-player-eyebrow">LOCAL DISPLAY SETUP</span>
        <h1>Pair this computer or projector</h1>
        <p>This browser becomes a secure LessonCue screen. It stays connected to this local server and can be controlled from the existing phone remote.</p>
        <label><span>Display name</span><input aria-label="Display name" value={deviceName} onChange={event => setDeviceName(event.target.value)} required maxLength={120} autoFocus /></label>
        {error && <div className="web-player-error">{error}</div>}
        <button disabled={busy}>{busy ? "Starting…" : "Start pairing"}</button>
      </form> : <form onSubmit={confirmPairing}>
        <span className="web-player-eyebrow">PAIRING REQUESTED</span>
        <h1>Enter the server PIN</h1>
        <p>Find the six-digit pairing PIN on LessonCue’s Screens page, then enter it here.</p>
        <label><span>Six-digit pairing PIN</span><input name="pin" aria-label="Six-digit pairing PIN" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus /></label>
        {error && <div className="web-player-error">{error}</div>}
        <button disabled={busy}>{busy ? "Pairing…" : "Pair this display"}</button>
        <button className="secondary" type="button" onClick={() => { setRequestId(""); setError(""); }}>Start over</button>
      </form>}
      <footer>Self-hosted at {location.host} · No hosted interface required</footer>
    </section>
  </main>;
}

function PlayerLibrary({ manifest, connection, onPlay }: { manifest?: Manifest; connection: ConnectionState; onPlay: (playlist: Playlist) => void }) {
  const signage = manifest?.signage[0];
  const emergency = signage?.mode === "emergency";
  usePreload(signage?.media);
  useSignagePreload(manifest?.signageSchedule);
  const signageMedia = signage?.media;
  const signageImage = signageMedia?.type === "image" || signageMedia?.contentType?.startsWith("image/");
  return <div className="web-player-library" style={signage ? { backgroundColor: signage.backgroundColor, color: signage.textColor } : undefined}>
    <header><div className="web-player-brand"><b>LC</b><span><strong>{manifest?.screen.name || "LessonCue"}</strong><small>{manifest?.screen.site || "Browser display"}</small></span></div><span className="web-player-eyebrow">READY FOR PLAYBACK</span></header>
    {signage ? <section className="web-player-signage">
      {signageMedia?.downloadUrl && (signageImage
        ? <img src={signageMedia.downloadUrl} alt="" />
        : signageMedia.type === "video" || signageMedia.contentType?.startsWith("video/")
          ? <video src={signageMedia.downloadUrl} autoPlay muted loop playsInline preload="auto" aria-label={signageMedia.title} />
          : null)}
      {!signageMedia && signage.mediaUrl && <img src={signage.mediaUrl} alt="" />}
      <div><small>{signage.name}</small><h1>{signage.message}</h1></div>
    </section> : <section className="web-player-ready">
      <span>✓</span><h1>{connection === "online" ? "Ready for a lesson" : "Connecting to LessonCue…"}</h1>
      <p>Use the phone controller, select a lesson below, or wait for scheduled pre-roll and countdown media.</p>
    </section>}
    <section className="web-player-lessons" aria-label="Available lessons">
      {emergency ? <p className="web-player-empty">Emergency signage is active. Lesson controls return automatically when the override ends.</p> : manifest?.playlists.map(playlist => <button key={playlist.playlistId} onClick={() => onPlay(playlist)} disabled={!playlist.items.length}>
        <time>{formatLessonDate(playlist.lessonDate)}</time>
        <span><strong>{playlist.title}</strong><small>{playlist.items.length} lesson item{playlist.items.length === 1 ? "" : "s"}{playlist.designatedStartAt ? ` · starts ${new Date(playlist.designatedStartAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</small></span>
        <b>{playlist.items.length ? "▶" : "—"}</b>
      </button>)}
      {manifest && !manifest.playlists.length && <p className="web-player-empty">No lessons are currently assigned to this screen.</p>}
    </section>
    <footer>Keyboard: Space play/pause · ←/→ previous/next · Esc stop · F full screen</footer>
  </div>;
}

function PlaybackStage({ playlist, item, paused, seekMs, unlockNonce, onStatus, onEnded, onBlocked }: {
  playlist: Playlist;
  item: CueItem;
  paused: boolean;
  seekMs: number;
  unlockNonce: number;
  onStatus: (status: PlaybackStatus) => void;
  onEnded: () => void;
  onBlocked: () => void;
}) {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [opacity, setOpacity] = useState(item.fadeInMs > 0 ? 0 : 1);
  const [imagePosition, setImagePosition] = useState(seekMs);
  const online = Boolean(item.playbackUrl);
  const image = item.type === "image" || item.contentType?.startsWith("image/");
  const audio = item.type === "audio" || item.contentType?.startsWith("audio/");
  const duration = effectiveDuration(item);

  useEffect(() => {
    if (!image) return;
    let position = Math.max(0, seekMs);
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (!paused) position += now - previous;
      previous = now;
      setImagePosition(position);
      setOpacity(fadeOpacity(item, position, duration));
      onStatus({ state: paused ? "paused" : "playing", lessonId: playlist.playlistId, itemId: item.itemId, positionMs: Math.round(position), durationMs: duration, volumePercent: item.volumePercent });
      if (position >= duration) {
        window.clearInterval(timer);
        onEnded();
      }
    }, 50);
    return () => window.clearInterval(timer);
    // This timing loop is recreated only for media identity, pause, or seek changes; live callbacks must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.itemId, image, paused, seekMs]);

  useEffect(() => {
    if (!online) return;
    const command = paused ? "pauseVideo" : "playVideo";
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: command, args: [] }), "*");
    onStatus({ state: paused ? "paused" : "playing", lessonId: playlist.playlistId, itemId: item.itemId, positionMs: 0, durationMs: item.durationMs, volumePercent: item.volumePercent });
    // Online telemetry changes only with the selected item or requested playback state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.itemId, online, paused]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const play = () => media.play().catch(error => {
      if (error?.name === "NotAllowedError") onBlocked();
      onStatus({ state: "paused", lessonId: playlist.playlistId, itemId: item.itemId, positionMs: Math.max(0, (media.currentTime * 1_000) - item.startMs), durationMs: duration, volumePercent: item.volumePercent });
    });
    if (paused) media.pause(); else void play();
    // The media element owns progress telemetry; this effect only responds to transport intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, unlockNonce, item.itemId]);

  function ready() {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = Math.max(0, item.startMs + seekMs) / 1_000;
    if (!paused) void media.play().catch(error => {
      if (error?.name === "NotAllowedError") onBlocked();
    });
  }

  function progress() {
    const media = mediaRef.current;
    if (!media) return;
    const position = Math.max(0, (media.currentTime * 1_000) - item.startMs);
    const resolvedDuration = duration || Math.max(0, media.duration * 1_000 - item.startMs);
    const fade = fadeOpacity(item, position, resolvedDuration);
    setOpacity(fade);
    media.volume = Math.min(1, Math.max(0, item.volumePercent / 100) * fade);
    onStatus({ state: media.paused ? "paused" : "playing", lessonId: playlist.playlistId, itemId: item.itemId, positionMs: Math.round(position), durationMs: Math.round(resolvedDuration), volumePercent: item.volumePercent });
    if (item.endMs && media.currentTime * 1_000 >= item.endMs) {
      media.pause();
      onEnded();
    }
  }

  function failed() {
    const message = mediaRef.current?.error ? `Browser media error ${mediaRef.current.error.code}: ${mediaRef.current.error.message || "Unable to play this format."}` : "The browser could not play this media.";
    onStatus({ state: "error", lessonId: playlist.playlistId, itemId: item.itemId, positionMs: 0, durationMs: duration, volumePercent: item.volumePercent, error: message });
  }

  if (online) return <div className="web-player-stage online">
    <iframe ref={frameRef} title={item.title} src={youtubeApiUrl(item.playbackUrl!)} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />
    <div className="web-player-black" style={{ opacity: paused ? .2 : 0 }} />
  </div>;

  if (image) return <div className="web-player-stage">
    <img src={item.downloadUrl} alt={item.title} style={{ opacity }} onError={() => onStatus({ state: "error", lessonId: playlist.playlistId, itemId: item.itemId, positionMs: imagePosition, durationMs: duration, volumePercent: item.volumePercent, error: "The browser could not load this image." })} />
  </div>;

  const common = {
    ref: (node: HTMLMediaElement | null) => { mediaRef.current = node; },
    src: item.downloadUrl,
    preload: "auto",
    onLoadedMetadata: ready,
    onTimeUpdate: progress,
    onWaiting: () => onStatus({ state: "buffering", lessonId: playlist.playlistId, itemId: item.itemId, positionMs: statusPosition(mediaRef.current, item), durationMs: duration, volumePercent: item.volumePercent }),
    onPlaying: progress,
    onEnded,
    onError: failed,
    style: { opacity },
  };
  return <div className={`web-player-stage ${audio ? "audio" : ""}`}>
    {audio ? <><div className="audio-art">♫</div><audio {...common} /></> : <video {...common} playsInline />}
  </div>;
}

function usePreload(item?: CueItem) {
  useEffect(() => {
    if (!item?.downloadUrl) return;
    if (item.type === "image" || item.contentType?.startsWith("image/")) {
      const image = new Image();
      image.src = item.downloadUrl;
      return () => { image.src = ""; };
    }
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = item.downloadUrl;
    link.as = item.type === "audio" ? "audio" : "video";
    document.head.appendChild(link);
    return () => link.remove();
    // Preloading is keyed to the resolved next item URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.itemId, item?.downloadUrl]);
}

function useSignagePreload(signage?: Signage[]) {
  const signature = signage?.map(item => `${item.id}:${item.media?.downloadUrl || ""}`).join("|") || "";
  useEffect(() => {
    const elements: Array<HTMLImageElement | HTMLLinkElement> = [];
    for (const sign of signage || []) {
      const media = sign.media;
      if (!media?.downloadUrl) continue;
      if (media.type === "image" || media.contentType?.startsWith("image/")) {
        const image = new Image();
        image.src = media.downloadUrl;
        elements.push(image);
      } else {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = media.downloadUrl;
        link.as = media.type === "audio" ? "audio" : "video";
        document.head.appendChild(link);
        elements.push(link);
      }
    }
    return () => elements.forEach(element => element instanceof HTMLLinkElement ? element.remove() : element.src = "");
    // The signature restarts prefetch only when schedule media URLs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}

function useDurableSignageCache(
  signage: Signage[] | undefined,
  identity: Identity | null,
  inventoryRef: { current: { itemId: string; title: string; state: string; sizeBytes: number; expectedBytes?: number; error?: string }[] },
  errorsRef: { current: { timestamp: string; area: string; message: string; itemId?: string }[] },
) {
  const signature = signage?.map(item => `${item.id}:${item.media?.itemId || ""}:${item.media?.downloadUrl || ""}:${item.media?.sha256 || ""}`).join("|") || "";
  useEffect(() => {
    if (!identity || !("caches" in window)) {
      inventoryRef.current = [];
      return;
    }
    let cancelled = false;
    void (async () => {
      const cache = await caches.open("lessoncue-signage-v1");
      const media = [...new Map(
        (signage || [])
          .map(sign => sign.media)
          .filter((item): item is CueItem => Boolean(item?.downloadUrl))
          .map(item => [item.itemId, item]),
      ).values()];
      const desired = new Set(media.map(item => new URL(item.downloadUrl!, location.origin).toString()));
      for (const request of await cache.keys()) {
        if (!desired.has(request.url)) await cache.delete(request);
      }
      const inventory: typeof inventoryRef.current = [];
      for (const item of media) {
        const url = new URL(item.downloadUrl!, location.origin).toString();
        try {
          let response = await cache.match(url);
          if (!response) {
            inventory.push({ itemId: item.itemId, title: item.title, state: "downloading", sizeBytes: 0, expectedBytes: item.sizeBytes });
            if (!cancelled) inventoryRef.current = [...inventory];
            const downloaded = await fetch(url, { headers: { Authorization: `Bearer ${identity.token}` }, cache: "no-store" });
            if (!downloaded.ok) throw new Error(`Signage cache request failed (${downloaded.status}).`);
            await cache.put(url, downloaded.clone());
            response = downloaded;
          }
          const bytes = Number(response.headers.get("content-length")) || item.sizeBytes || 0;
          inventory.push({ itemId: item.itemId, title: item.title, state: "ready", sizeBytes: bytes, expectedBytes: item.sizeBytes });
        } catch (cause) {
          const message = errorText(cause);
          inventory.push({ itemId: item.itemId, title: item.title, state: "failed", sizeBytes: 0, expectedBytes: item.sizeBytes, error: message });
          errorsRef.current = [{ timestamp: new Date().toISOString(), area: "signage-cache", message, itemId: item.itemId }, ...errorsRef.current].slice(0, 20);
        }
        if (!cancelled) inventoryRef.current = [...inventory];
      }
    })();
    return () => { cancelled = true; };
    // Cache population is keyed to the full future-sign media signature and paired screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.screenId, signature]);
}

function readIdentity(): Identity | null {
  try {
    const value = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null") as Partial<Identity> | null;
    return value?.screenId && value.token ? { screenId: value.screenId, token: value.token, deviceName: value.deviceName || "Browser display" } : null;
  } catch { return null; }
}

function schedulePhase(playlist: Playlist): { kind: "idle" | "preroll" | "countdown" | "ready"; seekMs: number } {
  if (!playlist.designatedStartAt) return { kind: "ready", seekMs: 0 };
  const now = Date.now();
  const designated = Date.parse(playlist.designatedStartAt);
  if (now >= designated) return { kind: "ready", seekMs: 0 };
  if (playlist.countdown) {
    const start = playlist.countdown.startAt ? Date.parse(playlist.countdown.startAt) : designated - playlist.countdown.durationMs;
    if (now >= start) return { kind: "countdown", seekMs: Math.max(0, now - start) };
  }
  const preRollStart = playlist.preRollStartsAt ? Date.parse(playlist.preRollStartsAt) : designated - 30 * 60_000;
  return playlist.preRoll?.items.length && now >= preRollStart ? { kind: "preroll", seekMs: 0 } : { kind: "idle", seekMs: 0 };
}

function effectiveDuration(item: CueItem) {
  if (item.endMs != null) return Math.max(0, item.endMs - item.startMs);
  if (item.durationMs != null) return Math.max(0, item.durationMs - item.startMs);
  return Math.max(1, item.imageDurationSeconds || 10) * 1_000;
}

function fadeOpacity(item: CueItem, position: number, duration: number) {
  const fadeIn = item.fadeInMs > 0 ? Math.min(1, Math.max(0, position / item.fadeInMs)) : 1;
  const fadeOut = item.fadeOutMs > 0 ? Math.min(1, Math.max(0, (duration - position) / item.fadeOutMs)) : 1;
  return Math.min(fadeIn, fadeOut);
}

function statusPosition(media: HTMLMediaElement | null, item: CueItem) {
  return media ? Math.max(0, Math.round(media.currentTime * 1_000 - item.startMs)) : 0;
}

function manifestItemCount(manifest?: Manifest) {
  const lessonItems = manifest?.playlists.flatMap(playlist => [
    ...playlist.items,
    ...(playlist.preRoll?.items || []),
    ...(playlist.countdown ? [playlist.countdown.item] : []),
  ]) || [];
  const signageItems = manifest?.signageSchedule?.flatMap(sign => sign.media ? [sign.media] : []) || [];
  return new Set([...lessonItems, ...signageItems].map(item => item.itemId)).size;
}

function browserName() {
  const agent = navigator.userAgent;
  if (agent.includes("Edg/")) return "Microsoft Edge";
  if (agent.includes("Firefox/")) return "Mozilla Firefox";
  if (agent.includes("Chrome/")) return "Google Chrome";
  if (agent.includes("Safari/")) return "Apple Safari";
  return "Web browser";
}

function codecCapabilities() {
  const video = document.createElement("video");
  const audio = document.createElement("audio");
  return [
    { kind: "video", codec: "H.264 / AVC", supported: Boolean(video.canPlayType('video/mp4; codecs="avc1.42E01E"')), detail: "video/mp4" },
    { kind: "video", codec: "WebM / VP9", supported: Boolean(video.canPlayType('video/webm; codecs="vp9"')), detail: "video/webm" },
    { kind: "audio", codec: "AAC", supported: Boolean(audio.canPlayType('audio/mp4; codecs="mp4a.40.2"')), detail: "audio/mp4" },
    { kind: "audio", codec: "MP3", supported: Boolean(audio.canPlayType("audio/mpeg")), detail: "audio/mpeg" },
  ];
}

function networkQuality(latency?: number, online = true) {
  if (!online) return "offline";
  if (latency == null) return "unknown";
  if (latency < 100) return "excellent";
  if (latency < 250) return "good";
  if (latency < 500) return "fair";
  return "poor";
}

function needsPlaybackGesture(item: CueItem) {
  if (item.playbackUrl) return true;
  if (item.volumePercent <= 0) return false;
  return item.type === "video" || item.type === "audio" ||
    Boolean(item.contentType?.startsWith("video/") || item.contentType?.startsWith("audio/"));
}

function youtubeApiUrl(value: string) {
  try {
    const url = new URL(value, location.origin);
    if (url.hostname.includes("youtube") || url.hostname.includes("youtu.be")) {
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("enablejsapi", "1");
      url.searchParams.set("playsinline", "1");
    }
    return url.toString();
  } catch { return value; }
}

function connectionLabel(connection: ConnectionState) {
  if (connection === "online") return "Connected";
  if (connection === "connecting") return "Connecting";
  if (connection === "reconnecting") return "Reconnecting";
  if (connection === "offline") return "Offline";
  return "Connection error";
}

function formatLessonDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

class PairingExpiredError extends Error {}
