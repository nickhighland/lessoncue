import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { DownloadDiagnostic, Lesson, LessonClass, Screen, TemporaryControllerSession } from "../models";
import { BrandMark, Empty, Field, PageHead } from "../ui";
import { classControllerUrl, controllerRouteSlug, controllerSessionToken, controllerSlug, cuePlannedDurationMs, cuePoints, errorText, formatDate, formatDuration, formatFriendlyDuration, friendlyPlaybackState, isOnline, lessonPlannedDurationMs, parseDiagnosticJson, roleName, youtubeEmbedUrl } from "../utils";

export function ControllerView({
  screens,
  lessons,
  classes,
  controllerPinConfigured,
  requireLocalRoomControllers,
  localAddress,
  userRole,
  refresh,
  notify,
}: {
  screens: Screen[];
  lessons: Lesson[];
  classes: LessonClass[];
  controllerPinConfigured: boolean;
  requireLocalRoomControllers: boolean;
  localAddress: string;
  userRole: string;
  refresh: () => void;
  notify: (s: string) => void;
}) {
  const routeSlug = controllerRouteSlug(location.pathname);
  const sessionToken = controllerSessionToken(location.pathname);
  const [temporarySession, setTemporarySession] =
    useState<TemporaryControllerSession | null>();
  useEffect(() => {
    if (!sessionToken) return;
    api<Omit<TemporaryControllerSession, "token" | "path">>(
      `/api/v1/controller/sessions/${sessionToken}`,
    )
      .then((session) =>
        setTemporarySession({
          ...session,
          token: sessionToken,
          path: `/session/${sessionToken}`,
        }),
      )
      .catch(() => setTemporarySession(null));
  }, [sessionToken]);
  const room = classes.find((item) =>
    temporarySession
      ? item.id === temporarySession.classId
      : controllerSlug(item) === routeSlug ||
        (!!item.controllerHostname &&
          item.controllerHostname === location.hostname),
  );
  const liveScreens = screens.filter(
    (screen) =>
      !screen.revoked &&
      !screen.signageOnly &&
      (!room || screen.assignedClassId === room.id),
  );
  const [screenId, setScreenId] = useState(
    liveScreens.find((screen) => screen.online)?.id || liveScreens[0]?.id || "",
  );
  useEffect(() => {
    if (!liveScreens.some((screen) => screen.id === screenId))
      setScreenId(
        liveScreens.find((screen) => screen.online)?.id ||
          liveScreens[0]?.id ||
          "",
      );
  }, [liveScreens, screenId]);
  const selectedScreen = liveScreens.find((screen) => screen.id === screenId);
  const availableLessons = lessons.filter(
    (lesson) =>
      !lesson.archived &&
      (room
        ? lesson.classId === room.id &&
          (!temporarySession?.lessonId ||
            lesson.id === temporarySession.lessonId)
        : !selectedScreen?.assignedClassId ||
          lesson.classId === selectedScreen.assignedClassId),
  );
  const requestedLessonId =
    new URLSearchParams(location.search).get("lesson") || "";
  const [lessonId, setLessonId] = useState(
    availableLessons.some((item) => item.id === requestedLessonId)
      ? requestedLessonId
      : availableLessons[0]?.id || "",
  );
  const lesson =
    availableLessons.find((item) => item.id === lessonId) ||
    availableLessons[0];
  const orderedItems = [...(lesson?.items || [])].sort(
    (a, b) => a.position - b.position,
  );
  const [selectedItemId, setSelectedItemId] = useState("");
  const selectedItem = orderedItems.find((item) => item.id === selectedItemId);
  const [seekSeconds, setSeekSeconds] = useState(0);
  const [universalPin, setUniversalPin] = useState("");
  const [universalGrant, setUniversalGrant] = useState(
    () => sessionStorage.getItem("lessoncue.universalGrant") || "",
  );
  const [universalUnlocked, setUniversalUnlocked] = useState(
    () => !!sessionStorage.getItem("lessoncue.universalGrant"),
  );
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [controlsLocked, setControlsLocked] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [commandReceipt, setCommandReceipt] = useState<{
    version?: number;
    action: string;
    error?: string;
  }>();
  async function unlockUniversal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUnlocking(true);
    setUnlockError("");
    try {
      const result = await api<{ grant: string }>("/api/v1/controller/unlock", {
        method: "POST",
        body: JSON.stringify({ pin: universalPin }),
      });
      sessionStorage.setItem("lessoncue.universalGrant", result.grant);
      setUniversalGrant(result.grant);
      setUniversalPin("");
      setUniversalUnlocked(true);
    } catch (error) {
      setUnlockError(errorText(error));
    } finally {
      setUnlocking(false);
    }
  }
  // The focus listener must capture the latest screen/session closure; the effect
  // below intentionally re-registers it when this command implementation changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  async function command(action: string, extras: Record<string, unknown> = {}) {
    if (!screenId) return notify("Choose a paired screen first.");
    if (controlsLocked)
      return notify("Unlock the controller before sending a command.");
    if (!selectedScreen || !isOnline(selectedScreen)) {
      const message = `${selectedScreen?.name || "This screen"} is offline. No command was sent.`;
      setCommandReceipt({ action, error: message });
      return notify(message);
    }
    setCommandReceipt({ action });
    try {
      const controllerHeaders: Record<string, string> = sessionToken
        ? { "X-LessonCue-Controller": `session:${sessionToken}` }
        : room
          ? { "X-LessonCue-Controller": `room:${room.id}` }
          : {
              "X-LessonCue-Controller": "universal",
              "X-LessonCue-Controller-Grant": universalGrant,
            };
      const result = await api<{ version: number }>(
        `/api/v1/screens/${screenId}/control`,
        {
          method: "POST",
          headers: controllerHeaders,
          body: JSON.stringify({ action, ...extras }),
        },
      );
      setCommandReceipt({ version: result.version, action });
      notify(
        `Sending ${action} to ${selectedScreen?.name || "screen"}; waiting for its receipt.`,
      );
      refresh();
    } catch (e) {
      const message = errorText(e);
      if (!room && !sessionToken && message.includes("controller PIN")) {
        sessionStorage.removeItem("lessoncue.universalGrant");
        setUniversalGrant("");
        setUniversalUnlocked(false);
      }
      setCommandReceipt({ action, error: message });
      notify(message);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const play = (itemId?: string) =>
    lesson && command("play", { lessonId: lesson.id, itemId: itemId || null });
  const durationSeconds = Math.max(
    1,
    Math.round(
      ((selectedItem?.endMs
        ? selectedItem.endMs - selectedItem.startMs
        : selectedItem?.durationMs || selectedItem?.mediaDurationMs) ||
        600_000) / 1000,
    ),
  );
  const reportedLesson = lessons.find(
    (item) => item.id === selectedScreen?.playbackLessonId,
  );
  const reportedItem = reportedLesson?.items.find(
    (item) => item.id === selectedScreen?.playbackItemId,
  );
  const timingLesson = reportedLesson || lesson;
  const timingItems = [...(timingLesson?.items || [])]
    .filter((item) => item.role === "lesson")
    .sort((a, b) => a.position - b.position);
  const reportedIndex = reportedItem
    ? timingItems.findIndex((item) => item.id === reportedItem.id)
    : -1;
  const currentRemainingMs =
    reportedIndex >= 0
      ? Math.max(
          0,
          cuePlannedDurationMs(timingItems[reportedIndex]) -
            (selectedScreen?.playbackPositionMs || 0),
        ) +
        timingItems
          .slice(reportedIndex + 1)
          .reduce((sum, item) => sum + cuePlannedDurationMs(item), 0)
      : timingItems.reduce((sum, item) => sum + cuePlannedDurationMs(item), 0);
  const estimatedFinish =
    timingLesson && currentRemainingMs
      ? new Date(Date.now() + currentRemainingMs)
      : undefined;
  const scheduledFinish = timingLesson?.designatedStartAt
    ? new Date(
        new Date(timingLesson.designatedStartAt).getTime() +
          lessonPlannedDurationMs(timingLesson),
      )
    : undefined;
  const isOverrun =
    !!estimatedFinish &&
    !!scheduledFinish &&
    estimatedFinish.getTime() > scheduledFinish.getTime() + 60_000;
  const preRollNow =
    !!timingLesson?.preRollStartsAt &&
    !!timingLesson?.designatedStartAt &&
    Date.now() >= new Date(timingLesson.preRollStartsAt).getTime() &&
    Date.now() < new Date(timingLesson.designatedStartAt).getTime();
  const showMonitor =
    !!timingLesson?.preRollMonitorUrl &&
    (monitorOpen || preRollNow || reportedItem?.role === "preRoll");
  const selectedScreenOnline = !!selectedScreen && isOnline(selectedScreen);
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, button")) return;
      if (["ArrowLeft", "ArrowRight", "Enter", "Escape", "Backspace"].includes(event.key))
        event.preventDefault();
      if (event.key === "ArrowLeft") void command("previous");
      else if (event.key === "ArrowRight") void command("next");
      else if (event.key === "Enter") void play(selectedItemId || undefined);
      else if (event.key === "Escape" || event.key === "Backspace") void command("stop");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusMode, selectedItemId, selectedScreenOnline, controlsLocked, screenId, lesson?.id, command, play]);
  const commandPending =
    !!selectedScreen &&
    selectedScreenOnline &&
    !!commandReceipt?.version &&
    selectedScreen.acknowledgedControlVersion < commandReceipt.version;
  useEffect(() => {
    if (!commandPending || !commandReceipt?.version) return;
    const version = commandReceipt.version;
    const timer = window.setTimeout(() => {
      setCommandReceipt((current) =>
        current?.version === version
          ? {
              action: current.action,
              error: `No receipt arrived from ${selectedScreen?.name || "the screen"} within 15 seconds. Check its connection before retrying.`,
            }
          : current,
      );
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [commandPending, commandReceipt?.version, selectedScreen?.name]);
  const downloads = parseDiagnosticJson<DownloadDiagnostic>(
    selectedScreen?.downloadQueueJson,
  );
  const downloading = downloads.some((item) =>
    ["queued", "pending", "downloading", "running"].includes(
      (item.state || "").toLowerCase(),
    ),
  );
  const recentlySeen = selectedScreen?.lastSeenAt
    ? Date.now() - new Date(selectedScreen.lastSeenAt).getTime() < 120_000
    : false;
  const controllerState = !selectedScreenOnline
    ? recentlySeen
      ? "reconnecting"
      : "offline"
    : selectedScreen.playbackError || selectedScreen.failedDownloads > 0
      ? "error"
      : downloading
        ? "downloading"
        : "ready";
  const controllerStateLabel =
    controllerState === "ready"
      ? "Ready"
      : controllerState === "downloading"
        ? "Downloading media"
        : controllerState === "reconnecting"
          ? "Reconnecting"
          : controllerState === "error"
            ? "Needs attention"
            : "Offline";
  const isAdministrator =
    userRole === "Service Admin" ||
    userRole === "App Admin" ||
    userRole === "Owner" ||
    userRole === "Administrator";
  const localRestrictionBlocked =
    !!room &&
    requireLocalRoomControllers &&
    !isAdministrator &&
    !location.hostname.toLowerCase().endsWith(".local");
  const progress = selectedScreen?.playbackDurationMs
    ? Math.min(
        100,
        (selectedScreen.playbackPositionMs /
          selectedScreen.playbackDurationMs) *
          100,
      )
    : 0;
  if (sessionToken && temporarySession === undefined)
    return (
      <div className="controller-page">
        <div className="loading">Validating controller link…</div>
      </div>
    );
  if (
    (sessionToken && temporarySession === null) ||
    ((routeSlug || sessionToken) && !room)
  )
    return (
      <div className="controller-page">
        <PageHead
          eyebrow="CONTROLLER LINK"
          title="Controller unavailable"
          detail="This controller link is invalid, expired, or no longer assigned. Ask an administrator for a current QR code."
        />
      </div>
    );
  if (localRestrictionBlocked)
    return (
      <div className="controller-page controller-lock">
        <section className="panel">
          <BrandMark large />
          <span className="eyebrow">CAMPUS NETWORK REQUIRED</span>
          <h1>Open this controller locally</h1>
          <p>
            An administrator requires non-administrator room remotes to use the
            server's .local address. Connect this phone to the campus network,
            then open the local controller.
          </p>
          <a
            className="button primary wide"
            href={`${localAddress}/room/${controllerSlug(room!)}${location.search}`}
          >
            Open on {new URL(localAddress).host}
          </a>
        </section>
      </div>
    );
  if (!room && !sessionToken && !universalUnlocked)
    return (
      <div className="controller-page controller-lock">
        <section className="panel">
          <BrandMark large />
          <span className="eyebrow">UNIVERSAL REMOTE</span>
          <h1>
            {controllerPinConfigured
              ? "Enter controller PIN"
              : "Controller PIN required"}
          </h1>
          <p>
            {controllerPinConfigured
              ? "This additional local PIN protects the controller that can operate every classroom."
              : "An administrator must set the six-digit universal controller PIN in Settings before this remote can be used."}
          </p>
          {controllerPinConfigured && (
            <form className="stack" onSubmit={unlockUniversal}>
              <Field label="Six-digit controller PIN">
                <input
                  value={universalPin}
                  onChange={(event) =>
                    setUniversalPin(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  autoComplete="off"
                  required
                  autoFocus
                />
              </Field>
              {unlockError && <div className="alert error" role="alert">{unlockError}</div>}
              <button className="button primary wide" disabled={unlocking}>
                {unlocking ? "Checking…" : "Open universal remote"}
              </button>
            </form>
          )}
        </section>
      </div>
    );
  const controllerStyle = room
    ? ({ "--room-color": room.controllerColor } as CSSProperties)
    : undefined;
  const commandAcknowledgement = !selectedScreenOnline
    ? `${selectedScreen?.name || "Screen"} is offline. Commands are disabled and are not queued.`
    : commandReceipt?.error
    ? `Command failed: ${commandReceipt.error}`
    : commandPending
      ? `Sending ${commandReceipt?.action} to ${selectedScreen?.name || "screen"}…`
      : commandReceipt?.version
        ? `✓ ${commandReceipt.action} received by ${selectedScreen?.name || "screen"}`
        : selectedScreen?.controlVersion
          ? `✓ Command ${selectedScreen.acknowledgedControlVersion} received`
          : "Ready for a command";
  return (
    <div
      className={`controller-page ${room ? "room-themed" : ""}`}
      style={controllerStyle}
    >
      <PageHead
        eyebrow={
          temporarySession?.permanent
            ? "PERMANENT CLASSROOM CONTROL"
            : temporarySession
              ? "TEMPORARY CONTROL"
            : room
              ? "CLASSROOM CONTROL"
              : "LIVE CONTROL"
        }
        title={room ? room.name : "Universal controller"}
        detail={
          temporarySession?.permanent
            ? "This revocable controller remains active until an administrator refreshes or revokes its QR code."
            : temporarySession?.expiresAt
              ? `Restricted link · expires ${new Date(temporarySession.expiresAt).toLocaleString()}`
            : room
              ? `This controller is restricted to ${room.name} screens and lessons.`
              : "Choose any paired screen, then run its assigned lesson from this phone."
        }
        action={
          <div className="controller-head-actions">
            <span className={`controller-connection ${controllerState}`}>
              <i />
              {controllerStateLabel}
            </span>
            <button
              className={`button controller-lock-toggle ${controlsLocked ? "locked" : ""}`}
              aria-pressed={controlsLocked}
              onClick={() => setControlsLocked((value) => !value)}
            >
              {controlsLocked
                ? "🔒 Controls locked — unlock"
                : "🔓 Lock controls"}
            </button>
            <button
              className={`button ${focusMode ? "primary" : ""}`}
              aria-pressed={focusMode}
              onClick={() => setFocusMode((value) => !value)}
            >
              {focusMode ? "Exit display focus" : "Display focus mode"}
            </button>
          </div>
        }
      />
      {controlsLocked && (
        <div className="controller-locked-banner" role="status">
          Controls are locked. Nothing on this remote can change the screen
          until you unlock it.
        </div>
      )}
      {focusMode && (
        <section className="panel controller-focus-mode" aria-label="Display focus mode">
          <div>
            <span className="section-label">DISPLAY FOCUS</span>
            <strong>{selectedScreen?.name || "Choose a screen"}</strong>
            <small>{selectedScreenOnline ? "Connected and ready for commands" : "Offline — commands are disabled"}</small>
          </div>
          <div className="controller-focus-now">
            <span>NOW</span><strong>{reportedItem?.title || "Nothing playing"}</strong>
          </div>
          <div className="controller-focus-next">
            <span>NEXT</span><strong>{reportedIndex >= 0 ? timingItems[reportedIndex + 1]?.title || "End of sequence" : orderedItems[0]?.title || "Choose a lesson"}</strong>
          </div>
          <div className="controller-shortcuts" aria-label="Keyboard shortcuts">
            <kbd>←</kbd><span>Previous</span><kbd>→</kbd><span>Next</span><kbd>Enter</kbd><span>Play selected</span><kbd>Esc</kbd><span>Stop / Back</span>
          </div>
        </section>
      )}
      <fieldset
        className="controller-controls"
        disabled={controlsLocked}
        aria-label="Room playback controls"
      >
        <div className="controller-grid">
          <section className="panel controller-target">
            <Field label="Control this screen">
              <select
                value={screenId}
                onChange={(e) => {
                  setScreenId(e.target.value);
                  setLessonId("");
                  setSelectedItemId("");
                  setCommandReceipt(undefined);
                }}
              >
                {liveScreens.map((screen) => (
                  <option value={screen.id} key={screen.id}>
                    {screen.name} · {isOnline(screen) ? "online" : "offline"}
                  </option>
                ))}
              </select>
            </Field>
            <div className="now-playing">
              <span>ACTUAL SCREEN STATE</span>
              <strong>
                {selectedScreenOnline
                  ? friendlyPlaybackState(selectedScreen?.playbackState)
                  : `Last reported ${friendlyPlaybackState(selectedScreen?.playbackState).toLowerCase()}`}
              </strong>
              <small>
                {reportedItem?.title ||
                  reportedLesson?.title ||
                  (selectedScreen?.playbackState === "idle"
                    ? "Nothing playing"
                    : "Waiting for item details")}
              </small>
              {selectedScreenOnline && selectedScreen?.playbackDurationMs ? (
                <>
                  <div className="playback-progress">
                    <i style={{ width: `${progress}%` }} />
                  </div>
                  <small>
                    {formatDuration(selectedScreen.playbackPositionMs)} /{" "}
                    {formatDuration(selectedScreen.playbackDurationMs)}
                  </small>
                </>
              ) : null}
              <span
                className={`command-ack ${commandPending ? "pending" : commandReceipt?.error ? "error" : commandReceipt?.version ? "received" : ""}`}
                role="status"
                aria-live="polite"
              >
                {commandAcknowledgement}
              </span>
              {selectedScreen?.playbackError && (
                <div className="playback-error">
                  {selectedScreen.playbackError}
                </div>
              )}
            </div>
            {!selectedScreenOnline && (
              <div className="alert warning controller-offline-warning" role="status">
                Reconnect this screen before starting, stopping, seeking, or changing cues. LessonCue will not silently queue live commands.
              </div>
            )}
            {selectedScreenOnline && timingLesson && (
              <div
                className={`controller-run-summary ${isOverrun ? "overrun" : ""}`}
              >
                <div>
                  <span>REMAINING</span>
                  <strong>{formatFriendlyDuration(currentRemainingMs)}</strong>
                </div>
                <div>
                  <span>EST. FINISH</span>
                  <strong>
                    {estimatedFinish
                      ? estimatedFinish.toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "—"}
                  </strong>
                </div>
                {isOverrun && (
                  <p role="alert">
                    Running past the planned finish. Flexible cues can be
                    shortened if appropriate.
                  </p>
                )}
              </div>
            )}
            {reportedItem?.notes && (
              <aside className="controller-note">
                <strong>Current cue notes</strong>
                <p>{reportedItem.notes}</p>
              </aside>
            )}
            <div className="transport" aria-label="Playback controls">
              <button
                onClick={() => command("previous")}
                aria-label="Previous media"
                disabled={!selectedScreenOnline}
              >
                ‹‹
              </button>
              <button
                className="transport-main"
                onClick={() =>
                  command(
                    selectedScreen?.playbackState === "paused"
                      ? "resume"
                      : "pause",
                  )
                }
                aria-label={
                  selectedScreen?.playbackState === "paused"
                    ? "Resume"
                    : "Pause"
                }
                disabled={!selectedScreenOnline}
              >
                {selectedScreen?.playbackState === "paused" ? "▶" : "Ⅱ"}
              </button>
              <button onClick={() => command("next")} aria-label="Next media" disabled={!selectedScreenOnline}>
                ››
              </button>
            </div>
            <button
              className="button stop-button"
              onClick={() => command("stop")}
              disabled={!selectedScreenOnline}
            >
              ■ Stop playback
            </button>
          </section>
          <section className="panel controller-media">
            <Field label="Lesson">
              <select
                value={lesson?.id || ""}
                onChange={(e) => {
                  setLessonId(e.target.value);
                  setSelectedItemId("");
                  setMonitorOpen(false);
                }}
              >
                <option value="">Choose a lesson</option>
                {availableLessons.map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatDate(item.date)} — {item.title}
                  </option>
                ))}
              </select>
            </Field>
            {lesson ? (
              <>
                {lesson.substituteNotes && (
                  <aside className="controller-note substitute">
                    <strong>Substitute / teacher instructions</strong>
                    <p>{lesson.substituteNotes}</p>
                  </aside>
                )}
                <button
                  className="button primary wide controller-play-all"
                  onClick={() => play()}
                  disabled={!selectedScreenOnline}
                >
                  ▶ Play lesson from the beginning
                </button>
                <div className="controller-list">
                  <span>SELECT MEDIA</span>
                  {orderedItems.map((item, index) => (
                    <button
                      key={item.id}
                      className={selectedItemId === item.id ? "selected" : ""}
                      disabled={!selectedScreenOnline}
                      onClick={() => {
                        setSelectedItemId(item.id);
                        setSeekSeconds(0);
                        play(item.id);
                      }}
                    >
                      <b>{index + 1}</b>
                      <span>
                        <strong>
                          {item.title}
                          {item.flexibleTime ? " · Flexible" : ""}
                        </strong>
                        <small>
                          {roleName(item.role)} ·{" "}
                          {formatDuration(cuePlannedDurationMs(item))}
                        </small>
                        {item.notes && <em>{item.notes}</em>}
                      </span>
                      <i>▶</i>
                    </button>
                  ))}
                </div>
                {selectedItem && (
                  <div className="controller-seek">
                    <label>
                      <span>Seek within {selectedItem.title}</span>
                      <strong>{formatDuration(seekSeconds * 1000)}</strong>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max={durationSeconds}
                      value={seekSeconds}
                      onChange={(e) => setSeekSeconds(Number(e.target.value))}
                      disabled={!selectedScreenOnline}
                    />
                    {cuePoints(selectedItem).length > 0 && (
                      <div
                        className="controller-markers"
                        aria-label="Jump to named cue"
                      >
                        <span>JUMP TO CUE</span>
                        {cuePoints(selectedItem).map((marker, index) => {
                          const relativeMs = Math.max(
                            0,
                            marker.positionMs - selectedItem.startMs,
                          );
                          return (
                            <button
                              type="button"
                              key={`${marker.positionMs}-${index}`}
                              disabled={!selectedScreenOnline}
                              onClick={() => {
                                setSeekSeconds(Math.round(relativeMs / 1000));
                                void command("seek", {
                                  positionMs: relativeMs,
                                });
                              }}
                            >
                              <strong>{marker.name}</strong>
                              <small>{formatDuration(relativeMs)}</small>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <button
                      className="button"
                      onClick={() =>
                        command("seek", { positionMs: seekSeconds * 1000 })
                      }
                      disabled={!selectedScreenOnline}
                    >
                      Go to position
                    </button>
                  </div>
                )}
                {lesson.preRollMonitorUrl && (
                  <section className="pre-roll-monitor">
                    <div>
                      <span>PRIVATE PRE-ROLL MONITOR</span>
                      <button
                        type="button"
                        className="button"
                        onClick={() => setMonitorOpen((value) => !value)}
                      >
                        {showMonitor ? "Hide monitor" : "Open monitor"}
                      </button>
                    </div>
                    {showMonitor && (
                      <>
                        <iframe
                          title="Pre-roll livestream monitor"
                          src={
                            youtubeEmbedUrl(lesson.preRollMonitorUrl) ||
                            lesson.preRollMonitorUrl
                          }
                          allow="autoplay; encrypted-media; picture-in-picture"
                          referrerPolicy="no-referrer"
                        />
                        <a
                          href={lesson.preRollMonitorUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open monitor in a new tab ↗
                        </a>
                      </>
                    )}
                  </section>
                )}
              </>
            ) : (
              <Empty
                title="No lesson selected"
                body="Assign a class to this screen or choose a lesson to begin."
              />
            )}
          </section>
        </div>
      </fieldset>
      <section className="controller-install">
        <BrandMark />
        <div>
          <strong>Save this controller as an app</strong>
          <p>
            On iPhone or iPad, use Share → Add to Home Screen. On Android, open
            the browser menu and choose Install app or Add to Home screen.
          </p>
          <small>
            {temporarySession
              ? `${requireLocalRoomControllers ? localAddress : location.origin}/session/${sessionToken}`
              : room
                ? classControllerUrl(
                    room,
                    "",
                    requireLocalRoomControllers
                      ? localAddress
                      : location.origin,
                  )
                : `${location.origin}/universalremote`}
          </small>
        </div>
      </section>
    </div>
  );
}
