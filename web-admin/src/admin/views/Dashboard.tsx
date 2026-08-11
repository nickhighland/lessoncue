import { Bootstrap, Lesson, Screen, View } from "../models";
import { DateBadge, Empty, PageHead, PanelTitle, RoleSummary, Stat, Status } from "../ui";
import { dayPart, formatDate, isOnline } from "../utils";

export function Dashboard({
  bootstrap,
  lessons,
  screens,
  onNavigate,
}: {
  bootstrap: Bootstrap;
  lessons: Lesson[];
  screens: Screen[];
  onNavigate: (v: View) => void;
}) {
  const upcoming = [...lessons]
    .filter((l) => new Date(`${l.date}T23:59:59`) >= new Date())
    .slice(0, 5);
  const online = screens.filter((s) => s.online).length;
  const recentLessons = [...lessons]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  return (
    <>
      <PageHead
        eyebrow="OVERVIEW"
        title={`Good ${dayPart()}.`}
        detail={`${bootstrap.organization} runs entirely on this local server.`}
      />
      <div className="dashboard-quick-actions">
        <button className="dashboard-action-card" onClick={() => onNavigate("classes")}>
          <div className="action-icon">▤</div>
          <div>
            <strong>Lessons</strong>
            <small>Plan lessons &amp; playlists</small>
          </div>
        </button>
        <button className="dashboard-action-card" onClick={() => onNavigate("media")}>
          <div className="action-icon">↥</div>
          <div>
            <strong>Upload Media</strong>
            <small>Add videos, audio, slides</small>
          </div>
        </button>
        <button className="dashboard-action-card" onClick={() => onNavigate("screens")}>
          <div className="action-icon">▣</div>
          <div>
            <strong>Screens</strong>
            <small>{online} of {bootstrap.counts.screens} online</small>
          </div>
        </button>
        <button className="dashboard-action-card" onClick={() => onNavigate("controller")}>
          <div className="action-icon">⌁</div>
          <div>
            <strong>Controller</strong>
            <small>Playback &amp; remote control</small>
          </div>
        </button>
      </div>
      <div className="stats-grid">
        <Stat
          label="Classes"
          value={bootstrap.counts.classes}
          sub={`${bootstrap.counts.lessons} lessons`}
        />
        <Stat
          label="Media files"
          value={bootstrap.counts.media}
          sub="stored locally"
        />
        <Stat
          label="Paired screens"
          value={bootstrap.counts.screens}
          sub={`${online} online now`}
        />
        <Stat
          label="Pairing PIN"
          value={bootstrap.pairingPin || "Restricted"}
          sub={
            bootstrap.pairingPin
              ? "enter on a new screen"
              : "screen administrators only"
          }
          mono
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <PanelTitle
            title="Upcoming lessons"
            action="View all"
            onClick={() => onNavigate("classes")}
          />
          {upcoming.length ? (
            <div className="rows">
              {upcoming.map((l) => (
                <div className="row" key={l.id}>
                  <DateBadge date={l.date} />
                  <div className="grow">
                    <strong>{l.title}</strong>
                    <small>
                      {l.className} · {l.items.length} playlist items
                    </small>
                  </div>
                  <RoleSummary items={l.items} />
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No upcoming lessons"
              body="Create a lesson inside one of your classes."
              action={
                <button className="button primary" onClick={() => onNavigate("classes")}>
                  Create first class
                </button>
              }
            />
          )}
        </section>
        <section className="panel">
          <PanelTitle
            title="Screen health"
            action="View all"
            onClick={() => onNavigate("screens")}
          />
          {screens.filter((s) => !s.revoked).length ? (
            <div className="rows">
              {screens
                .filter((s) => !s.revoked)
                .slice(0, 5)
                .map((s) => (
                  <div className="row" key={s.id}>
                    <span
                      className={`screen-icon ${isOnline(s) ? "online" : ""}`}
                    >
                      ▣
                    </span>
                    <div className="grow">
                      <strong>{s.name}</strong>
                      <small>{s.assignedClassName || "Not assigned"}</small>
                    </div>
                    <Status online={isOnline(s)} />
                  </div>
                ))}
            </div>
          ) : (
            <Empty
              title="No paired screens"
              body={
                bootstrap.pairingPin
                  ? `Open LessonCue TV and enter PIN ${bootstrap.pairingPin}.`
                  : "Ask a screen administrator to pair a television."
              }
            />
          )}
        </section>
      </div>
      {recentLessons.length > 0 && (
        <section className="panel" style={{marginTop: 20}}>
          <div className="panel-title">
            <h2>Recent activity</h2>
          </div>
          <div className="activity-timeline">
            {recentLessons.map((l) => (
              <div className="activity-item" key={l.id}>
                <div className="activity-dot" />
                <div>
                  <strong>{l.title}</strong>
                  <small>{l.className} · {formatDate(l.date)} · {l.items.length} items</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
