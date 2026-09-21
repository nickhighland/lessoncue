import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Lesson, LessonClass, Screen, TemporaryControllerSession } from "../models";
import { BrandMark, Field, PageHead } from "../ui";
import {
  controllerRouteSlug,
  controllerSessionToken,
  controllerSlug,
  cuePlannedDurationMs,
  errorText,
  isOnline,
  lessonPlannedDurationMs,
} from "../utils";
import { CompactRemoteShell } from "./CompactRemoteShell";
import { createRefreshLoop } from "../../activities/refreshLoop";
import { setActivityControllerHeaders } from "../../activities/api";

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
  onUniversalUnlocked,
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
  onUniversalUnlocked?: () => void;
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
  const allLiveScreens = screens.filter(
    (screen) =>
      !screen.revoked &&
      !screen.signageOnly &&
      (!room || screen.assignedClassId === room.id),
  );
  const universalRemote = !room && !sessionToken;
  const [universalRoomId, setUniversalRoomId] = useState(() =>
    universalRemote
      ? allLiveScreens.find((screen) => screen.online)?.assignedClassId ||
        allLiveScreens[0]?.assignedClassId ||
        classes[0]?.id ||
        ""
      : "",
  );
  const selectedUniversalRoom = universalRemote
    ? classes.find((item) => item.id === universalRoomId)
    : undefined;
  const selectedClassId = room?.id || (universalRemote ? universalRoomId : undefined);
  const liveScreens = allLiveScreens.filter(
    (screen) => !universalRemote && !selectedClassId
      ? true
      : !!selectedClassId && screen.assignedClassId === selectedClassId,
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
        : selectedUniversalRoom
          ? lesson.classId === selectedUniversalRoom.id
          : universalRemote
            ? false
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
  const requestedLessonApplied = useRef(false);
  useEffect(() => {
    // The public bootstrap can arrive in live-only mode first. Apply a lesson
    // deep link once the full lesson library has caught up instead of leaving
    // the remote on the first lesson that happened to be in the initial cache.
    if (requestedLessonApplied.current) return;
    if (!requestedLessonId) {
      requestedLessonApplied.current = true;
      return;
    }
    if (!availableLessons.some((item) => item.id === requestedLessonId)) return;
    requestedLessonApplied.current = true;
    setLessonId(current => current === requestedLessonId ? current : requestedLessonId);
  }, [availableLessons, requestedLessonId]);
  const lesson =
    availableLessons.find((item) => item.id === lessonId) ||
    availableLessons[0];
  const orderedItems = [...(lesson?.items || [])].sort(
    (a, b) => a.position - b.position,
  );
  const [selectedItemId, setSelectedItemId] = useState("");
  const selectedItem = orderedItems.find((item) => item.id === selectedItemId);
  const previousUniversalRoomId = useRef(universalRoomId);
  useEffect(() => {
    if (!universalRemote || previousUniversalRoomId.current === universalRoomId) return;
    previousUniversalRoomId.current = universalRoomId;
    const nextLesson = availableLessons.find((item) => item.id === requestedLessonId) || availableLessons[0];
    setLessonId(nextLesson?.id || "");
    setSelectedItemId("");
  }, [availableLessons, requestedLessonId, setLessonId, universalRemote, universalRoomId]);
  const [seekSeconds, setSeekSeconds] = useState(0);
  const [universalPin, setUniversalPin] = useState("");
  const [universalGrant, setUniversalGrant] = useState(
    () => sessionStorage.getItem("lessoncue.universalGrant") || "",
  );
  const commandQueue = useRef(Promise.resolve());
  const controllerRoomId = room?.id;
  useEffect(() => setActivityControllerHeaders(sessionToken
    ? { "X-LessonCue-Controller": `session:${sessionToken}` }
    : controllerRoomId
      ? { "X-LessonCue-Controller": `room:${controllerRoomId}` }
      : { "X-LessonCue-Controller": "universal", "X-LessonCue-Controller-Grant": universalGrant }),
  [sessionToken, controllerRoomId, universalGrant]);
  const [universalUnlocked, setUniversalUnlocked] = useState(
    () => !!sessionStorage.getItem("lessoncue.universalGrant"),
  );
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [controlsLocked, setControlsLocked] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  // The remote keeps the weekly lesson choice immediate; cue-level setup,
  // notes, and activity configuration stay behind the Playlist tab.
  const [showOnTheFlySetup, setShowOnTheFlySetup] = useState(false);
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
      onUniversalUnlocked?.();
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
    const send = async () => {
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
    };
    commandQueue.current = commandQueue.current.then(send, send);
    await commandQueue.current;
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
  const liveActivityItem =
    reportedItem?.type === "activity" || reportedItem?.activityDefinitionId
      ? reportedItem
      : undefined;
  const setupActivityItem =
    selectedItem?.type === "activity" || selectedItem?.activityDefinitionId
      ? selectedItem
      : undefined;
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
  const commandStatus = !selectedScreenOnline
    ? "Offline · commands disabled"
    : commandReceipt?.error
      ? "Command failed · retry"
      : commandPending
        ? "Sending…"
        : commandReceipt?.version
          ? "Received"
          : "";
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
  return (
    <CompactRemoteShell
      room={room || undefined}
      universalRooms={universalRemote ? classes : undefined}
      universalRoomId={universalRemote ? universalRoomId : undefined}
      setUniversalRoomId={universalRemote ? setUniversalRoomId : undefined}
      universalRemote={universalRemote}
      liveScreens={liveScreens}
      screenId={screenId}
      onScreenChange={(value) => {
        setScreenId(value);
        // Preserve an explicit lesson deep link while switching screens. The
        // controller bootstrap already filtered it to the selected screen's
        // class; clearing it here makes a linked game jump to whichever lesson
        // happens to sort first before its controls can be opened.
        setLessonId(requestedLessonId || "");
        setSelectedItemId("");
        setCommandReceipt(undefined);
      }}
      selectedScreen={selectedScreen}
      selectedScreenOnline={selectedScreenOnline}
      reportedItem={reportedItem}
      timingLesson={timingLesson}
      currentRemainingMs={currentRemainingMs}
      estimatedFinish={estimatedFinish}
      isOverrun={isOverrun}
      lesson={lesson}
      availableLessons={availableLessons}
      lessonId={lessonId}
      setLessonId={setLessonId}
      orderedItems={orderedItems}
      selectedItemId={selectedItemId}
      setSelectedItemId={setSelectedItemId}
      selectedItem={selectedItem}
      seekSeconds={seekSeconds}
      setSeekSeconds={setSeekSeconds}
      durationSeconds={durationSeconds}
      play={play}
      command={command}
      commandStatus={commandStatus}
      controlsLocked={controlsLocked}
      setControlsLocked={setControlsLocked}
      focusMode={focusMode}
      setFocusMode={setFocusMode}
      showOnTheFlySetup={showOnTheFlySetup}
      setShowOnTheFlySetup={setShowOnTheFlySetup}
      liveActivityItem={liveActivityItem}
      setupActivityItem={setupActivityItem}
      setMonitorOpen={setMonitorOpen}
      showMonitor={showMonitor}
    />
  );
}

type PublicControllerBootstrap = {
  libraryIncluded?: boolean;
  screens: Screen[];
  lessons: Lesson[];
  classes: LessonClass[];
  controllerPinConfigured: boolean;
  requireLocalRoomControllers: boolean;
  localAddress: string;
};

/** Public controller entry point. Room and universal remotes are intentionally
 * usable without an administrator cookie; the command endpoint still applies
 * the room/session/universal authorization represented by their headers. */
export function PublicControllerApp() {
  const [bootstrap, setBootstrap] = useState<PublicControllerBootstrap>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const grant = sessionStorage.getItem("lessoncue.universalGrant") || "";
    const headers = grant
      ? { "X-LessonCue-Controller-Grant": grant }
      : undefined;
    let libraryRefreshedAt = 0;
    const loop = createRefreshLoop(async signal => {
      try {
        const liveOnly = Date.now() - libraryRefreshedAt < 60000;
        const value = await api<PublicControllerBootstrap>(
          `/api/v1/controller/bootstrap?path=${encodeURIComponent(location.pathname)}&liveOnly=${liveOnly}`,
          { headers, signal },
        );
        if (!signal.aborted) {
          if (value.libraryIncluded !== false) libraryRefreshedAt = Date.now();
          setBootstrap(previous => value.libraryIncluded === false && previous
            ? { ...value, classes: previous.classes, lessons: previous.lessons }
            : value);
          setError("");
        }
      } catch (cause) {
        if (!signal.aborted) {
          setError(errorText(cause));
        }
      }
    }, () => document.hidden ? 15000 : 2000);
    void loop.refresh();
    const wake = () => { if (!document.hidden) void loop.refresh(); };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      loop.stop();
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [reload]);

  if (error && !bootstrap)
    return (
      <div className="controller-page">
        <PageHead eyebrow="CONTROLLER" title="Controller unavailable" detail={error} />
      </div>
    );
  if (!bootstrap)
    return (
      <div className="controller-page">
        <div className="loading">Opening controller…</div>
      </div>
    );
  return (
    <>
      <ControllerView
        {...bootstrap}
        userRole=""
        refresh={() => setReload((value) => value + 1)}
        notify={setNotice}
        onUniversalUnlocked={() => setReload((value) => value + 1)}
      />
      {error && <div className="remote-command-notice" role="status">Connection interrupted. Retrying…</div>}
      {notice && (
        <div className="remote-command-notice" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
