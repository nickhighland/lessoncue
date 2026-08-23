import { CSSProperties, Dispatch, SetStateAction, useState } from "react";
import { ActivityController } from "../../activities/ActivityController";
import { Lesson, LessonClass, PlaylistItem, Screen } from "../models";
import { Field } from "../ui";
import {
  cuePoints,
  formatDate,
  formatDuration,
  formatFriendlyDuration,
  roleName,
  youtubeEmbedUrl,
} from "../utils";

type RemoteTabId = "tab1" | "tab2" | "tab3";

const remoteTabs: Array<{ id: RemoteTabId; label: string }> = [
  { id: "tab1", label: "Lesson" },
  { id: "tab2", label: "Playlist" },
  { id: "tab3", label: "Activity" },
];

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
  const [activeTab, setActiveTab] = useState<RemoteTabId>("tab1");
  const controllerStyle = room
    ? ({ "--room-color": room.controllerColor } as CSSProperties)
    : undefined;
  const isPaused = selectedScreen?.playbackState === "paused";
  const failedDownloads = selectedScreen?.failedDownloads || 0;

  function openSetup() {
    setActiveTab("tab2");
    setShowOnTheFlySetup(true);
  }

  return (
    <div className={`controller-page remote-shell ${room ? "room-themed" : ""}`} style={controllerStyle}>
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
                className="transport-main"
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
            <span className="remote-lock-glyph" aria-hidden="true" />
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

      <nav className="remote-tabs" aria-label="Remote control tabs">
        {remoteTabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            aria-selected={activeTab === tab.id}
            role="tab"
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.id === "tab3" && liveActivityItem && <b aria-label="Active activity">●</b>}
          </button>
        ))}
      </nav>

      <fieldset className="remote-tab-commands" disabled={controlsLocked}>
        <div className="remote-tab-content">
          <section
            className="remote-tab-panel"
            aria-label="Lesson controls"
            role="tabpanel"
            hidden={activeTab !== "tab1"}
          >
            <div className="remote-tab-heading remote-lesson-heading">
              <div>
                <span className="remote-kicker">LESSON</span>
                <strong>{lesson?.title || "Choose a lesson"}</strong>
                <small>{availableLessons.length} lesson{availableLessons.length === 1 ? "" : "s"} available</small>
              </div>
              <label className="remote-screen-picker">
                <span>SCREEN</span>
                <select
                  aria-label="Control this screen"
                  value={screenId}
                  onChange={(event) => onScreenChange(event.target.value)}
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

            <div className="remote-lesson-list" aria-label="Available lessons">
              {availableLessons.length ? (
                availableLessons.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={lesson?.id === item.id ? "selected" : ""}
                    onClick={() => {
                      setLessonId(item.id);
                      setSelectedItemId("");
                      setShowOnTheFlySetup(false);
                      setMonitorOpen(false);
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
          </section>

          <section
            className="remote-tab-panel"
            aria-label="Playlist controls"
            role="tabpanel"
            hidden={activeTab !== "tab2"}
          >
            <div className="remote-tab-heading">
              <div>
                <span className="remote-kicker">PLAYLIST</span>
                <strong>{lesson?.title || "Choose a lesson"}</strong>
                <small>{orderedItems.length} cues available</small>
              </div>
              <button
                type="button"
                className="button remote-setup-button"
                onClick={() => setShowOnTheFlySetup((current) => !current)}
                aria-expanded={showOnTheFlySetup}
              >
                {showOnTheFlySetup ? "Close setup" : "Open setup"}
              </button>
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
                      ? estimatedFinish.toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })
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
            {reportedItem?.notes && (
              <aside className="controller-note remote-current-note">
                <strong>Current cue notes</strong>
                <p>{reportedItem.notes}</p>
              </aside>
            )}

            {!showOnTheFlySetup && (
              <div className="remote-cue-list" aria-label="Lesson cues">
                {orderedItems.length ? (
                  orderedItems.map((item, index) => (
                    <button
                      type="button"
                      key={item.id}
                      className={selectedItemId === item.id ? "selected" : ""}
                      disabled={!selectedScreenOnline}
                      onClick={() => {
                        setSelectedItemId(item.id);
                        play(item.id);
                      }}
                    >
                      <b>{index + 1}</b>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{roleName(item.role)} · {formatDuration(cuePlannedDuration(item))}</small>
                      </span>
                      <i aria-hidden="true">▶</i>
                    </button>
                  ))
                ) : (
                  <div className="remote-empty-state compact">
                    <strong>No lesson cues available</strong>
                    <small>Open setup to choose a lesson for this screen.</small>
                  </div>
                )}
              </div>
            )}

            {showOnTheFlySetup && (
              <section id="controller-setup-panel" className="remote-setup-panel">
                <Field label="Lesson">
                  <select
                    value={lesson?.id || lessonId}
                    onChange={(event) => {
                      setLessonId(event.target.value);
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
                <div className="remote-setup-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => play()}
                    disabled={!selectedScreenOnline || !lesson}
                  >
                    ▶ Play lesson
                  </button>
                  <button
                    type="button"
                    className={`button ${focusMode ? "primary" : ""}`}
                    aria-pressed={focusMode}
                    onClick={() => {
                      setFocusMode((current) => !current);
                      setActiveTab("tab3");
                    }}
                  >
                    {focusMode ? "Exit focus" : "Display focus"}
                  </button>
                </div>
                {lesson?.substituteNotes && (
                  <aside className="controller-note substitute">
                    <strong>Teacher notes</strong>
                    <p>{lesson.substituteNotes}</p>
                  </aside>
                )}
                <div className="controller-list remote-setup-list">
                  <span>SELECT CUE</span>
                  {orderedItems.map((item, index) => (
                    <button
                      type="button"
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
                        <strong>{item.title}{item.flexibleTime ? " · Flexible" : ""}</strong>
                        <small>{roleName(item.role)} · {formatDuration(cuePlannedDuration(item))}</small>
                        {item.notes && <em>{item.notes}</em>}
                      </span>
                      <i aria-hidden="true">▶</i>
                    </button>
                  ))}
                </div>
                {selectedItem && (
                  <div className="controller-seek remote-setup-seek">
                    <label>
                      <span>Seek within {selectedItem.title}</span>
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
                    {cuePoints(selectedItem).length > 0 && (
                      <div className="controller-markers" aria-label="Jump to named cue">
                        <span>JUMP TO CUE</span>
                        {cuePoints(selectedItem).map((marker, index) => {
                          const relativeMs = Math.max(0, marker.positionMs - selectedItem.startMs);
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
            )}
          </section>

          <section
            className="remote-tab-panel remote-activity-panel"
            aria-label="Activity controls"
            role="tabpanel"
            hidden={activeTab !== "tab3"}
          >
            {focusMode && (
              <section className="remote-focus-panel" aria-label="Display focus mode">
                <div>
                  <span className="remote-kicker">DISPLAY FOCUS</span>
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
                <button type="button" className="button" onClick={() => setFocusMode(false)}>
                  Exit focus
                </button>
              </section>
            )}
            {liveActivityItem?.activityDefinitionId ? (
              <ActivityController
                definitionId={liveActivityItem.activityDefinitionId}
                lessonId={timingLesson?.id}
                lessonItemId={liveActivityItem.id}
                showSessionSetup={showOnTheFlySetup}
              />
            ) : setupActivityItem?.activityDefinitionId && showOnTheFlySetup ? (
              <ActivityController
                definitionId={setupActivityItem.activityDefinitionId}
                lessonId={lesson?.id}
                lessonItemId={setupActivityItem.id}
                showSessionSetup
              />
            ) : (
              <div className="remote-empty-state">
                <span className="remote-empty-icon" aria-hidden="true">⌁</span>
                <strong>No active activity</strong>
                <small>Start a configured activity from setup, then return here for live controls.</small>
                <button type="button" className="button primary" onClick={openSetup}>
                  Open activity setup
                </button>
              </div>
            )}
          </section>
        </div>
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
