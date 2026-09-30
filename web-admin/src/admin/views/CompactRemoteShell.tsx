import { CSSProperties, Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { ActivityController } from "../../activities/ActivityController";
import { Lesson, LessonClass, PlaylistItem, Screen } from "../models";
import {
  cuePoints,
  formatDate,
  formatDuration,
  formatFriendlyDuration,
  roleName,
  youtubeEmbedUrl,
} from "../utils";

type CompactRemoteShellProps = {
  room?: LessonClass;
  universalRooms?: LessonClass[];
  universalRoomId?: string;
  setUniversalRoomId?: Dispatch<SetStateAction<string>>;
  universalRemote?: boolean;
  liveScreens: Screen[];
  screenId: string;
  onScreenChange: (value: string) => void;
  selectedScreen?: Screen;
  selectedScreenOnline: boolean;
  reportedItem?: PlaylistItem;
  timingLesson?: Lesson;
  currentRemainingMs: number;
  estimatedFinish?: Date;
  isOverrun: boolean;
  lesson?: Lesson;
  availableLessons: Lesson[];
  lessonId: string;
  setLessonId: Dispatch<SetStateAction<string>>;
  orderedItems: PlaylistItem[];
  selectedItemId: string;
  setSelectedItemId: Dispatch<SetStateAction<string>>;
  selectedItem?: PlaylistItem;
  seekSeconds: number;
  setSeekSeconds: Dispatch<SetStateAction<number>>;
  durationSeconds: number;
  play: (itemId?: string) => void;
  command: (action: string, extras?: Record<string, unknown>) => void | Promise<void>;
  commandStatus: string;
  controlsLocked: boolean;
  setControlsLocked: Dispatch<SetStateAction<boolean>>;
  focusMode: boolean;
  setFocusMode: Dispatch<SetStateAction<boolean>>;
  showOnTheFlySetup: boolean;
  setShowOnTheFlySetup: Dispatch<SetStateAction<boolean>>;
  liveActivityItem?: PlaylistItem;
  setupActivityItem?: PlaylistItem;
  setMonitorOpen: Dispatch<SetStateAction<boolean>>;
  showMonitor: boolean;
};

/**
 * The remote, as one downward flow rather than three tabs.
 *
 * Tabs asked the teacher to know which of three panels held the thing they
 * wanted, and nothing about them said that having picked a lesson you should
 * now go and look in the next one. The work is a sequence — choose the lesson,
 * choose the cue, control the cue — so it reads as one now, with each step
 * opening as the one before it is answered.
 *
 * The cue list stays in the same downward flow while the chosen cue becomes
 * its own working surface. Expanding a cue puts game and media controls right
 * below that cue, so the teacher can see what they are controlling without
 * losing the surrounding lesson sequence.
 */
export function CompactRemoteShell({
  room,
  universalRooms = [],
  universalRoomId = "",
  setUniversalRoomId,
  universalRemote = false,
  liveScreens,
  screenId,
  onScreenChange,
  selectedScreen,
  selectedScreenOnline,
  reportedItem,
  timingLesson,
  currentRemainingMs,
  estimatedFinish,
  isOverrun,
  lesson,
  availableLessons,
  lessonId,
  setLessonId,
  orderedItems,
  selectedItemId,
  setSelectedItemId,
  selectedItem,
  seekSeconds,
  setSeekSeconds,
  durationSeconds,
  play,
  command,
  commandStatus,
  controlsLocked,
  setControlsLocked,
  focusMode,
  setFocusMode,
  showOnTheFlySetup,
  setShowOnTheFlySetup,
  liveActivityItem,
  setupActivityItem,
  setMonitorOpen,
  showMonitor,
}: CompactRemoteShellProps) {
  // Opened by hand when swapping lessons mid-session. Without a lesson the list
  // is open regardless, because that is the only thing left to do.
  const [changingLesson, setChangingLesson] = useState(false);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const expandedCueRef = useRef<HTMLElement>(null);
  const isUniversalRemote = universalRemote && !room;
  const roomChosen = Boolean(universalRoomId);
  const activeThemeRoom = room || (isUniversalRemote
    ? universalRooms.find((item) => item.id === universalRoomId)
    : undefined);
  const controllerStyle = activeThemeRoom
    ? ({ "--room-color": activeThemeRoom.controllerColor } as CSSProperties)
    : undefined;
  const isPaused = selectedScreen?.playbackState === "paused";
  const failedDownloads = selectedScreen?.failedDownloads || 0;

  const lessonChosen = Boolean(lesson);
  const showLessonList = !lessonChosen || changingLesson;
  // The cue being controlled: what the teacher picked, or failing that whatever
  // the screen reports it is playing, so the controls are never empty during a
  // lesson somebody else started.
  const controlledItem = selectedItem || reportedItem;
  const previousReportedItemId = useRef(reportedItem?.id);

  useEffect(() => {
    if (!controlsExpanded) return;
    const frame = requestAnimationFrame(() =>
      expandedCueRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [controlsExpanded, lesson?.id, reportedItem?.id, selectedItemId]);

  useEffect(() => {
    if (!controlledItem) setControlsExpanded(false);
  }, [controlledItem]);

  // A screen that is already playing has an implicit selection. Keep its live
  // game controls available on arrival, while still letting an explicit cue
  // choice take over without reopening the previous item. The selection stays
  // implicit so the panel follows a screen when it advances to another cue.
  useEffect(() => {
    if (selectedItemId || controlsExpanded || !reportedItem) return;
    if (!orderedItems.some((item) => item.id === reportedItem.id)) return;
    setControlsExpanded(true);
  }, [controlsExpanded, orderedItems, reportedItem, selectedItemId, setSelectedItemId]);

  // If the screen moves on from the cue the remote was implicitly following,
  // follow the new live activity instead of leaving the old game's controls
  // mounted. This also updates the visible lesson when the screen starts a
  // different lesson, but preserves a deliberately selected cue.
  useEffect(() => {
    const previousId = previousReportedItemId.current;
    previousReportedItemId.current = reportedItem?.id;
    if (!reportedItem?.id || !previousId || previousId === reportedItem.id) return;
    if (selectedItemId && selectedItemId !== previousId) return;
    setSelectedItemId("");
    setControlsExpanded(true);
    if (timingLesson?.id && timingLesson.id !== lesson?.id) {
      setLessonId(timingLesson.id);
    }
  }, [lesson?.id, reportedItem?.id, selectedItemId, setLessonId, setSelectedItemId, timingLesson?.id]);

  const renderCueControls = (item: PlaylistItem) => {
    const activityItem = liveActivityItem?.id === item.id
      ? liveActivityItem
      : setupActivityItem?.id === item.id
        ? setupActivityItem
        : undefined;
    const nextTitle = nextCueTitle(orderedItems, item);
    const itemDurationSeconds = item.id === selectedItem?.id
      ? durationSeconds
      : Math.max(1, Math.round(cuePlannedDuration(item) / 1000));

    return (
      <>
        <div className="remote-cue-controls-head">
          <div className="remote-step-title">
            <span className="remote-kicker">CONTROLS</span>
            <strong>Cue controls</strong>
            <small>
              {roleName(item.role)} · {nextTitle ? `next: ${nextTitle}` : "last in the lesson"}
            </small>
          </div>
          <button
            type="button"
            className={`button ${focusMode ? "primary" : ""}`}
            aria-pressed={focusMode}
            onClick={() => setFocusMode((current) => !current)}
          >
            {focusMode ? "Exit focus" : "Display focus"}
          </button>
        </div>

        {focusMode && (
          <section className="remote-focus-panel" aria-label="Display focus mode">
            <div>
              <span className="remote-kicker">DISPLAY</span>
              <strong>{selectedScreen?.name || "Choose a screen"}</strong>
              <small>{selectedScreenOnline ? "Connected" : "Offline · commands disabled"}</small>
            </div>
            <div>
              <span className="remote-kicker">NOW</span>
              <strong>{reportedItem?.title || "Nothing playing"}</strong>
            </div>
            <div>
              <span className="remote-kicker">NEXT</span>
              <strong>{nextCueTitle(orderedItems, reportedItem) || "End of sequence"}</strong>
            </div>
          </section>
        )}

        {reportedItem?.id === item.id && reportedItem.notes && (
          <aside className="controller-note remote-current-note">
            <strong>Current cue notes</strong>
            <p>{reportedItem.notes}</p>
          </aside>
        )}

        {activityItem?.activityDefinitionId ? (
          <div className="remote-activity-panel">
            <ActivityController
              definitionId={activityItem.activityDefinitionId}
              lessonId={timingLesson?.id || lesson?.id}
              lessonItemId={item.id}
              showSessionSetup={showOnTheFlySetup || activityItem.id !== liveActivityItem?.id}
            />
          </div>
        ) : item.activityDefinitionId ? (
          <div className="remote-empty-state compact">
            <strong>Activity not started</strong>
            <small>Play this cue to open its live controls.</small>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setSelectedItemId(item.id);
                setShowOnTheFlySetup(true);
                setControlsExpanded(true);
                play(item.id);
              }}
              disabled={!selectedScreenOnline}
            >
              Start activity
            </button>
          </div>
        ) : (
          <div className="controller-seek remote-setup-seek">
            <label>
              <span>Seek within {item.title}</span>
              <strong>{formatDuration(seekSeconds * 1000)}</strong>
            </label>
            <input
              type="range"
              min="0"
              max={itemDurationSeconds}
              value={seekSeconds}
              onChange={(event) => setSeekSeconds(Number(event.target.value))}
              disabled={!selectedScreenOnline}
            />
            {cuePoints(item).length > 0 && (
              <div className="controller-markers" aria-label="Jump to named cue">
                <span>JUMP TO CUE</span>
                {cuePoints(item).map((marker, index) => {
                  const relativeMs = Math.max(0, marker.positionMs - item.startMs);
                  return (
                    <button
                      type="button"
                      key={`${marker.positionMs}-${index}`}
                      disabled={!selectedScreenOnline}
                      onClick={() => {
                        setSeekSeconds(Math.round(relativeMs / 1000));
                        void command("seek", { positionMs: relativeMs });
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
              type="button"
              className="button"
              onClick={() => void command("seek", { positionMs: seekSeconds * 1000 })}
              disabled={!selectedScreenOnline}
            >
              Go to position
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <div className={`controller-page remote-shell ${activeThemeRoom ? "room-themed" : ""}`} style={controllerStyle}>
      <section className="remote-playback" aria-label="Playback controller">
        <div className="remote-control-row">
          <fieldset className="remote-playback-fieldset" disabled={controlsLocked}>
            <div className="transport remote-transport" aria-label="Playback controls">
              <button
                type="button"
                onClick={() => void command("previous")}
                aria-label="Previous cue"
                disabled={!selectedScreenOnline}
              >
                <span aria-hidden="true">‹‹</span>
              </button>
              <button
                type="button"
                className="remote-transport-main"
                onClick={() => void command(isPaused ? "resume" : "pause")}
                aria-label={isPaused ? "Resume playback" : "Pause playback"}
                disabled={!selectedScreenOnline}
              >
                <span aria-hidden="true">{isPaused ? "▶" : "Ⅱ"}</span>
              </button>
              <button
                type="button"
                className="stop-transport"
                onClick={() => void command("stop")}
                aria-label="Stop playback"
                disabled={!selectedScreenOnline}
              >
                <span aria-hidden="true">■</span>
              </button>
              <button
                type="button"
                onClick={() => void command("next")}
                aria-label="Next cue"
                disabled={!selectedScreenOnline}
              >
                <span aria-hidden="true">››</span>
              </button>
            </div>
          </fieldset>
          <button
            type="button"
            className={`remote-lock-button ${controlsLocked ? "locked" : ""}`}
            aria-pressed={controlsLocked}
            aria-label={controlsLocked ? "Unlock controls" : "Lock controls"}
            title={controlsLocked ? "Unlock controls" : "Lock controls"}
            onClick={() => setControlsLocked((current) => !current)}
          >
            <svg className="remote-lock-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              {controlsLocked ? (
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              ) : (
                <path d="M8 10V7a4 4 0 0 1 7.6-1.7" />
              )}
              <circle cx="12" cy="14.5" r="1.2" />
              <path d="M12 15.7v1.7" />
            </svg>
          </button>
        </div>
        <div className="remote-command-status sr-only" role="status" aria-live="polite">
          {commandStatus}
        </div>
        {selectedScreen?.playbackError && (
          <div className="remote-playback-error" role="alert">
            {selectedScreen.playbackError}
          </div>
        )}
        {!selectedScreen?.playbackError && failedDownloads > 0 && (
          <div className="remote-playback-error" role="alert">
            {failedDownloads} media download{failedDownloads === 1 ? "" : "s"} failed. Open screen diagnostics before retrying.
          </div>
        )}
        {!selectedScreenOnline && (
          <div className="remote-offline-warning" role="status">
            Reconnect this screen before sending a live command. LessonCue will not silently queue it.
          </div>
        )}
      </section>

      <fieldset className="remote-flow" disabled={controlsLocked}>
        {isUniversalRemote && (
          <section className="remote-step remote-room-step" aria-label="Room" data-state={roomChosen ? "done" : "current"}>
            <div className="remote-step-head">
              <span className="remote-step-mark" aria-hidden="true">1</span>
              <div className="remote-step-title">
                <span className="remote-kicker">ROOM</span>
                <strong>{roomChosen ? universalRooms.find((item) => item.id === universalRoomId)?.name : "Choose a room"}</strong>
                <small>{roomChosen ? "Universal remote scope" : "Choose a classroom before choosing a lesson"}</small>
              </div>
              <label className="remote-screen-picker remote-room-picker">
                <span>ROOM</span>
                <select
                  aria-label="Choose a room"
                  value={universalRoomId}
                  onChange={(event) => {
                    setUniversalRoomId?.(event.target.value);
                    setSelectedItemId("");
                    setShowOnTheFlySetup(false);
                    setMonitorOpen(false);
                    setControlsExpanded(false);
                  }}
                >
                  <option value="">Choose a room</option>
                  {universalRooms.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        )}
        <section
          className="remote-step"
          aria-label="Lesson"
          data-state={lessonChosen ? "done" : isUniversalRemote && !roomChosen ? "waiting" : "current"}
        >
          <div className="remote-step-head">
            <span className="remote-step-mark" aria-hidden="true">{isUniversalRemote ? "2" : "1"}</span>
            <div className="remote-step-title">
              <span className="remote-kicker">LESSON</span>
              <strong>{lesson?.title || "Choose a lesson"}</strong>
              <small>
                {lessonChosen
                  ? `${formatDate(lesson!.date)} · ${orderedItems.length} cue${orderedItems.length === 1 ? "" : "s"}`
                  : `${availableLessons.length} lesson${availableLessons.length === 1 ? "" : "s"} available`}
              </small>
            </div>
            <label className="remote-screen-picker">
              <span>SCREEN</span>
              <select
                aria-label="Control this screen"
                value={screenId}
                onChange={(event) => {
                  setControlsExpanded(false);
                  onScreenChange(event.target.value);
                }}
              >
                {liveScreens.length ? (
                  liveScreens.map((screen) => (
                    <option value={screen.id} key={screen.id}>
                      {screen.name} · {screen.online ? "online" : "offline"}
                    </option>
                  ))
                ) : (
                  <option value="">No paired screen</option>
                )}
              </select>
            </label>
          </div>

          {lessonChosen && (
            <button
              type="button"
              className="button remote-step-change"
              aria-expanded={changingLesson}
              onClick={() => setChangingLesson((current) => !current)}
            >
              {changingLesson ? "Keep this lesson" : "Change lesson"}
            </button>
          )}

          {showLessonList && (
            <div className="remote-lesson-list" aria-label="Available lessons">
              {availableLessons.length ? (
                availableLessons.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={(lesson?.id || lessonId) === item.id ? "selected" : ""}
                    onClick={() => {
                      setLessonId(item.id);
                      setSelectedItemId("");
                      setShowOnTheFlySetup(false);
                      setMonitorOpen(false);
                      setChangingLesson(false);
                      setControlsExpanded(false);
                    }}
                  >
                    <span>
                      <strong>{item.title}</strong>
                      <small>{formatDate(item.date)} · {item.items.length} cues</small>
                    </span>
                    <i aria-hidden="true">›</i>
                  </button>
                ))
              ) : (
                <div className="remote-empty-state compact">
                  <strong>No lessons available</strong>
                  <small>Pair a screen with a class to choose its weekly lesson.</small>
                </div>
              )}
            </div>
          )}
        </section>

        <section
          className="remote-step"
          aria-label="Cues"
          data-state={!lessonChosen ? "waiting" : controlledItem ? "done" : "current"}
        >
          <div className="remote-step-head">
            <span className="remote-step-mark" aria-hidden="true">{isUniversalRemote ? "3" : "2"}</span>
            <div className="remote-step-title">
              <span className="remote-kicker">CUE</span>
              <strong>{controlledItem?.title || (lessonChosen ? "Choose a cue" : "Choose a lesson first")}</strong>
              <small>
                {lessonChosen
                  ? `${orderedItems.length} cue${orderedItems.length === 1 ? "" : "s"} in this lesson`
                  : "The cues appear once a lesson is chosen."}
              </small>
            </div>
            {lessonChosen && (
              <button
                type="button"
                className="button remote-play-lesson"
                onClick={() => play()}
                disabled={!selectedScreenOnline}
              >
                ▶ Play lesson
              </button>
            )}
          </div>

          {timingLesson && (
            <div className={`remote-run-summary remote-run-summary-light ${isOverrun ? "overrun" : ""}`}>
              <div>
                <span>REMAINING</span>
                <strong>{formatFriendlyDuration(currentRemainingMs)}</strong>
              </div>
              <div>
                <span>EST. FINISH</span>
                <strong>
                  {estimatedFinish
                    ? estimatedFinish.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                    : "—"}
                </strong>
              </div>
              {isOverrun && (
                <p role="alert">
                  Running past the planned finish. Flexible cues can be shortened if appropriate.
                </p>
              )}
            </div>
          )}

          {lesson?.substituteNotes && (
            <aside className="controller-note substitute">
              <strong>Teacher notes</strong>
              <p>{lesson.substituteNotes}</p>
            </aside>
          )}

          {/*
            Always on screen once there is a lesson. This is the thing a teacher
            reaches for most during a session, and it used to be a tab away.
          */}
          {lessonChosen && (
            <div className="remote-cue-list controller-list" aria-label="Lesson cues">
              {orderedItems.length ? (
                orderedItems.map((item, index) => {
                  const isPlaying = reportedItem?.id === item.id;
                  const isSelected = selectedItemId === item.id
                    || (!selectedItemId && isPlaying);
                  const isExpanded = isSelected && controlsExpanded;
                  const controlsId = `remote-cue-controls-${item.id}`;
                  return (
                    <article
                      key={item.id}
                      ref={isExpanded ? expandedCueRef : undefined}
                      className={`remote-cue ${isSelected ? "selected" : ""} ${isPlaying ? "playing" : ""}`}
                      data-cue-id={item.id}
                    >
                      <div className="remote-cue-row">
                        <button
                          type="button"
                          className="remote-cue-select"
                          disabled={!selectedScreenOnline}
                          aria-current={isPlaying ? "true" : undefined}
                          aria-expanded={isExpanded}
                          aria-controls={isExpanded ? controlsId : undefined}
                          onClick={() => {
                            setSelectedItemId(item.id);
                            setSeekSeconds(0);
                            setControlsExpanded(true);
                            play(item.id);
                          }}
                        >
                          <b>{index + 1}</b>
                          <span>
                            <strong>{item.title}{item.flexibleTime ? " · Flexible" : ""}</strong>
                            <small>{roleName(item.role)} · {formatDuration(cuePlannedDuration(item))}</small>
                            {item.notes && <em>{item.notes}</em>}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="remote-cue-toggle"
                          disabled={!selectedScreenOnline}
                          aria-expanded={isExpanded}
                          aria-controls={isExpanded ? controlsId : undefined}
                          aria-label={`${isExpanded ? "Collapse" : "Expand"} controls for ${item.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isExpanded) {
                              setControlsExpanded(false);
                              return;
                            }
                            setSelectedItemId(item.id);
                            setSeekSeconds(0);
                            setControlsExpanded(true);
                            play(item.id);
                          }}
                        >
                          <span aria-hidden="true">{isExpanded ? "⌃" : "⌄"}</span>
                        </button>
                      </div>
                      {isExpanded && (
                        <div
                          id={controlsId}
                          className="remote-cue-controls"
                          role="region"
                          aria-label="Cue controls"
                        >
                          {renderCueControls(item)}
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <div className="remote-empty-state compact">
                  <strong>No cues in this lesson</strong>
                  <small>Add cues to this lesson from the Lessons page.</small>
                </div>
              )}
            </div>
          )}
          {lesson?.preRollMonitorUrl && (
            <section className="pre-roll-monitor">
              <div>
                <span>PRIVATE PRE-ROLL MONITOR</span>
                <button
                  type="button"
                  className="button"
                  onClick={() => setMonitorOpen((current) => !current)}
                >
                  {showMonitor ? "Hide monitor" : "Open monitor"}
                </button>
              </div>
              {showMonitor && (
                <>
                  <iframe
                    title="Pre-roll livestream monitor"
                    src={youtubeEmbedUrl(lesson.preRollMonitorUrl) || lesson.preRollMonitorUrl}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    referrerPolicy="no-referrer"
                  />
                  <a href={lesson.preRollMonitorUrl} target="_blank" rel="noreferrer">
                    Open monitor in a new tab ↗
                  </a>
                </>
              )}
            </section>
          )}
        </section>
      </fieldset>
    </div>
  );
}

function cuePlannedDuration(item: PlaylistItem) {
  return Math.max(0, item.endMs ? item.endMs - item.startMs : item.durationMs || item.mediaDurationMs || 0);
}

function nextCueTitle(items: PlaylistItem[], current?: PlaylistItem) {
  const index = current ? items.findIndex((item) => item.id === current.id) : -1;
  return items[index + 1]?.title;
}
