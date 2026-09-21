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
 * The cue list stays in the same downward flow until a teacher chooses a cue.
 * The chosen cue then becomes the working surface, so game and media controls
 * start at the top of the scroll area instead of below the whole lesson. A
 * single back button restores the lesson and cue list.
 */
export function CompactRemoteShell({
  room,
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
  const flowRef = useRef<HTMLFieldSetElement>(null);
  const controllerStyle = room
    ? ({ "--room-color": room.controllerColor } as CSSProperties)
    : undefined;
  const isPaused = selectedScreen?.playbackState === "paused";
  const failedDownloads = selectedScreen?.failedDownloads || 0;

  const lessonChosen = Boolean(lesson);
  const showLessonList = !lessonChosen || changingLesson;
  // The cue being controlled: what the teacher picked, or failing that whatever
  // the screen reports it is playing, so the controls are never empty during a
  // lesson somebody else started.
  const controlledItem = selectedItem || reportedItem;
  const activityItem = liveActivityItem
    || (setupActivityItem?.id === controlledItem?.id ? setupActivityItem : undefined);

  useEffect(() => {
    if (!controlsExpanded) return;
    const frame = requestAnimationFrame(() => flowRef.current?.scrollTo({ top: 0 }));
    return () => cancelAnimationFrame(frame);
  }, [controlsExpanded, controlledItem?.id]);

  useEffect(() => {
    if (!controlledItem) setControlsExpanded(false);
  }, [controlledItem]);

  return (
    <div className={`controller-page remote-shell ${controlsExpanded ? "controls-expanded" : ""} ${room ? "room-themed" : ""}`} style={controllerStyle}>
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

      <fieldset
        ref={flowRef}
        className={`remote-flow ${controlsExpanded ? "controls-expanded" : ""}`}
        disabled={controlsLocked}
      >
        <section className="remote-step" aria-label="Lesson" data-state={lessonChosen ? "done" : "current"}>
          <div className="remote-step-head">
            <span className="remote-step-mark" aria-hidden="true">1</span>
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
            <span className="remote-step-mark" aria-hidden="true">2</span>
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
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`${selectedItemId === item.id ? "selected" : ""} ${isPlaying ? "playing" : ""}`}
                      disabled={!selectedScreenOnline}
                      aria-current={isPlaying ? "true" : undefined}
                      aria-expanded={selectedItemId === item.id ? controlsExpanded : false}
                      aria-controls={selectedItemId === item.id ? "remote-cue-controls" : undefined}
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
                      <i aria-hidden="true">{isPlaying ? "▮▮" : "▶"}</i>
                    </button>
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
        </section>

        <section
          id="remote-cue-controls"
          className="remote-step remote-step-controls"
          aria-label="Cue controls"
          data-state={controlledItem ? "current" : "waiting"}
        >
          {controlsExpanded && (
            <button
              type="button"
              className="button remote-controls-back"
              onClick={() => setControlsExpanded(false)}
            >
              <span aria-hidden="true">←</span> All lesson cues
            </button>
          )}
          <div className="remote-step-head">
            <span className="remote-step-mark" aria-hidden="true">3</span>
            <div className="remote-step-title">
              <span className="remote-kicker">CONTROLS</span>
              <strong>{controlledItem ? controlledItem.title : "Choose a cue"}</strong>
              <small>
                {controlledItem
                  ? `${roleName(controlledItem.role)} · ${nextCueTitle(orderedItems, reportedItem)
                      ? `next: ${nextCueTitle(orderedItems, reportedItem)}`
                      : "last in the lesson"}`
                  : "Controls for a cue appear here once you pick one."}
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

          {!controlledItem && !focusMode && (
            <div className="remote-empty-state compact">
              <strong>Nothing selected</strong>
              <small>Pick a cue above and its controls appear here.</small>
            </div>
          )}

          {reportedItem?.notes && (
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
                lessonItemId={activityItem.id}
                showSessionSetup={showOnTheFlySetup || !liveActivityItem}
              />
            </div>
          ) : controlledItem?.activityDefinitionId ? (
            <div className="remote-empty-state compact">
              <strong>Activity not started</strong>
              <small>Play this cue to open its live controls.</small>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setSelectedItemId(controlledItem.id);
                  setShowOnTheFlySetup(true);
                  setControlsExpanded(true);
                  play(controlledItem.id);
                }}
                disabled={!selectedScreenOnline}
              >
                Start activity
              </button>
            </div>
          ) : null}

          {controlledItem && !controlledItem.activityDefinitionId && (
            <div className="controller-seek remote-setup-seek">
              <label>
                <span>Seek within {controlledItem.title}</span>
                <strong>{formatDuration(seekSeconds * 1000)}</strong>
              </label>
              <input
                type="range"
                min="0"
                max={durationSeconds}
                value={seekSeconds}
                onChange={(event) => setSeekSeconds(Number(event.target.value))}
                disabled={!selectedScreenOnline}
              />
              {cuePoints(controlledItem).length > 0 && (
                <div className="controller-markers" aria-label="Jump to named cue">
                  <span>JUMP TO CUE</span>
                  {cuePoints(controlledItem).map((marker, index) => {
                    const relativeMs = Math.max(0, marker.positionMs - controlledItem.startMs);
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
