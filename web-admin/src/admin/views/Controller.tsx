import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { DownloadDiagnostic, Lesson, LessonClass, Screen, TemporaryControllerSession } from "../models";
import { BrandMark, Field, PageHead } from "../ui";
import {
  classControllerUrl,
  controllerRouteSlug,
  controllerSessionToken,
  controllerSlug,
  cuePlannedDurationMs,
  errorText,
  isOnline,
  lessonPlannedDurationMs,
  parseDiagnosticJson,
} from "../utils";
import { CompactRemoteShell } from "./CompactRemoteShell";

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
  // The remote is control-first. Selecting lessons, cues, lobby details, and
  // team setup stays available, but only after the host explicitly opens it.
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
    : selectedScreen?.playbackError || selectedScreen?.failedDownloads > 0
      ? "error"
    : downloading
      ? "downloading"
      : "ready";
  const controllerStateLabel =
    controllerState === "offline"
      ? "Offline"
    : controllerState === "downloading"
      ? "Downloading media"
      : controllerState === "reconnecting"
        ? "Reconnecting"
        : controllerState === "error"
          ? "Needs attention"
          : selectedScreen?.playbackState === "playing"
            ? "Playing"
            : "Ready";
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
  const playbackTitle = reportedItem?.title || "Nothing Playing";
  const playbackDurationMs = selectedScreen?.playbackDurationMs || 0;
  const playbackPositionMs = Math.min(
    Math.max(selectedScreen?.playbackPositionMs || 0, 0),
    playbackDurationMs || Number.MAX_SAFE_INTEGER,
  );
  const commandStatus = !selectedScreenOnline
    ? "Offline · commands disabled"
    : commandReceipt?.error
      ? "Command failed · retry"
      : commandPending
        ? "Sending…"
        : commandReceipt?.version
          ? "Received"
          : "";
  const controllerUrl = temporarySession
    ? `${requireLocalRoomControllers ? localAddress : location.origin}/session/${sessionToken}`
    : room
      ? classControllerUrl(
          room,
          "",
          requireLocalRoomControllers ? localAddress : location.origin,
        )
      : `${location.origin}/universalremote`;
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
      liveScreens={liveScreens}
      screenId={screenId}
      onScreenChange={(value) => {
        setScreenId(value);
        setLessonId("");
        setSelectedItemId("");
        setCommandReceipt(undefined);
      }}
      selectedScreen={selectedScreen}
      selectedScreenOnline={selectedScreenOnline}
      controllerState={controllerState}
      controllerStateLabel={controllerStateLabel}
      playbackTitle={playbackTitle}
      playbackDurationMs={playbackDurationMs}
      playbackPositionMs={playbackPositionMs}
      progress={progress}
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
      controllerUrl={controllerUrl}
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
