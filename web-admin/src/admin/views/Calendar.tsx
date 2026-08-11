import { useState } from "react";
import { Lesson } from "../models";
import { DateBadge, Empty, PageHead, RoleSummary } from "../ui";
import { calendarConflictIds, calendarDate, dateInputValue, formatFriendlyDuration, lessonPlannedDurationMs } from "../utils";

export function CalendarView({ lessons }: { lessons: Lesson[] }) {
  const visible = [...lessons]
    .filter((l) => !l.archived)
    .sort((a, b) => a.date.localeCompare(b.date));
  const [view, setView] = useState<
    "agenda" | "day" | "week" | "month" | "room"
  >("agenda");
  const [focusDate, setFocusDate] = useState(dateInputValue());
  const conflicts = calendarConflictIds(visible);
  const grouped = visible.reduce<Record<string, Lesson[]>>((all, lesson) => {
    const key = lesson.date.slice(0, 7);
    (all[key] ||= []).push(lesson);
    return all;
  }, {});
  const focus = new Date(`${focusDate}T12:00:00`);
  const weekStart = new Date(focus);
  weekStart.setDate(focus.getDate() - focus.getDay());
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    calendarDate(
      new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + index,
      ),
    ),
  );
  const monthStart = new Date(focus.getFullYear(), focus.getMonth(), 1, 12);
  const gridStart = new Date(monthStart);
  gridStart.setDate(1 - monthStart.getDay());
  const monthDates = Array.from({ length: 42 }, (_, index) =>
    calendarDate(
      new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + index,
      ),
    ),
  );
  const rooms = visible.reduce<Record<string, Lesson[]>>((all, lesson) => {
    (all[lesson.className] ||= []).push(lesson);
    return all;
  }, {});
  function moveFocus(direction: number) {
    const next = new Date(focus);
    if (view === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * (view === "week" ? 7 : 1));
    setFocusDate(calendarDate(next));
  }
  const event = (lesson: Lesson, compact = false) => (
    <CalendarLesson
      key={lesson.id}
      lesson={lesson}
      conflict={conflicts.has(lesson.id)}
      compact={compact}
    />
  );
  return (
    <>
      <PageHead
        eyebrow="SCHEDULE"
        title="Calendar"
        detail="Day, week, month, agenda, and room views with estimated run times and overlap warnings."
      />
      <section className="calendar-toolbar panel">
        <div
          className="calendar-view-tabs"
          role="group"
          aria-label="Calendar view"
        >
          {(["agenda", "day", "week", "month", "room"] as const).map(
            (option) => (
              <button
                key={option}
                className={view === option ? "active" : ""}
                onClick={() => setView(option)}
              >
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ),
          )}
        </div>
        {view !== "agenda" && view !== "room" && (
          <div className="calendar-navigation">
            <button onClick={() => moveFocus(-1)} aria-label="Previous period">
              ‹
            </button>
            <button onClick={() => setFocusDate(dateInputValue())}>
              Today
            </button>
            <input
              type="date"
              value={focusDate}
              onChange={(event) => setFocusDate(event.target.value)}
              aria-label="Calendar date"
            />
            <button onClick={() => moveFocus(1)} aria-label="Next period">
              ›
            </button>
          </div>
        )}
      </section>
      {!visible.length && (
        <section className="panel">
          <Empty
            title="No lessons scheduled"
            body="Create a dated lesson from Classes and it will appear here."
          />
        </section>
      )}
      {visible.length > 0 && view === "agenda" && (
        <div className="calendar-stack">
          {Object.entries(grouped).map(([month, entries]) => (
            <section className="panel" key={month}>
              <div className="panel-title">
                <h2>
                  {new Date(`${month}-15T12:00:00`).toLocaleDateString(
                    undefined,
                    { month: "long", year: "numeric" },
                  )}
                </h2>
                <span className="pill">{entries.length} lessons</span>
              </div>
              <div className="calendar-grid">
                {entries.map((lesson) => event(lesson))}
              </div>
            </section>
          ))}
        </div>
      )}
      {visible.length > 0 && view === "day" && (
        <section className="panel calendar-period">
          <div className="panel-title">
            <h2>
              {focus.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h2>
            <span className="pill">
              {visible.filter((item) => item.date === focusDate).length} lessons
            </span>
          </div>
          <div className="calendar-grid">
            {visible
              .filter((item) => item.date === focusDate)
              .map((lesson) => event(lesson))}
            {!visible.some((item) => item.date === focusDate) && (
              <Empty
                title="No lessons this day"
                body="Choose another date or create a lesson."
              />
            )}
          </div>
        </section>
      )}
      {visible.length > 0 && view === "week" && (
        <section className="calendar-week panel">
          {weekDates.map((date) => (
            <div
              className={date === dateInputValue() ? "today" : ""}
              key={date}
            >
              <header>
                <strong>
                  {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                  })}
                </strong>
                <span>{new Date(`${date}T12:00:00`).getDate()}</span>
              </header>
              {visible
                .filter((item) => item.date === date)
                .map((lesson) => event(lesson, true))}
            </div>
          ))}
        </section>
      )}
      {visible.length > 0 && view === "month" && (
        <section className="calendar-month panel">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <strong className="calendar-weekday" key={day}>
              {day}
            </strong>
          ))}
          {monthDates.map((date) => (
            <div
              className={`${date.slice(0, 7) !== focusDate.slice(0, 7) ? "outside" : ""} ${date === dateInputValue() ? "today" : ""}`}
              key={date}
            >
              <span>{new Date(`${date}T12:00:00`).getDate()}</span>
              {visible
                .filter((item) => item.date === date)
                .map((lesson) => event(lesson, true))}
            </div>
          ))}
        </section>
      )}
      {visible.length > 0 && view === "room" && (
        <div className="calendar-rooms">
          {Object.entries(rooms)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([room, entries]) => (
              <section className="panel" key={room}>
                <div className="panel-title">
                  <h2>{room}</h2>
                  <span className="pill">{entries.length} lessons</span>
                </div>
                <div className="calendar-grid">
                  {entries.map((lesson) => event(lesson))}
                </div>
              </section>
            ))}
        </div>
      )}
    </>
  );
}

export function CalendarLesson({
  lesson,
  conflict,
  compact,
}: {
  lesson: Lesson;
  conflict: boolean;
  compact?: boolean;
}) {
  const duration = lessonPlannedDurationMs(lesson);
  const finish = lesson.designatedStartAt
    ? new Date(new Date(lesson.designatedStartAt).getTime() + duration)
    : undefined;
  return (
    <article
      className={`calendar-lesson ${conflict ? "conflict" : ""} ${compact ? "compact" : ""}`}
    >
      {!compact && <DateBadge date={lesson.date} />}
      <div>
        <strong>{lesson.title}</strong>
        <small>
          {lesson.className}
          {lesson.generatedByScheduleId ? " · Recurring" : ""}
        </small>
        <div className="calendar-meta">
          <span>
            {lesson.designatedStartAt
              ? `${new Date(lesson.designatedStartAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${finish ? `–${finish.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`
              : "Start time not set"}
          </span>
          {duration > 0 && <span>{formatFriendlyDuration(duration)}</span>}
          {conflict && (
            <b title="This estimated time overlaps another scheduled lesson">
              ⚠ Conflict
            </b>
          )}
          {!compact && <RoleSummary items={lesson.items} />}
        </div>
      </div>
    </article>
  );
}
