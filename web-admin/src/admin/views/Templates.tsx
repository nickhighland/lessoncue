import { confirmAction } from "../../AccessibleDialogs";
import { FormEvent, useState } from "react";
import { api } from "../api";
import { Lesson, LessonClass, LessonTemplate, RecurringSchedule } from "../models";
import { Empty, Field, Modal, PageHead } from "../ui";
import { dateInputValue, errorText, formatShortDate, minutesFromTime, parseDateList, parseStoredDates, schedulePayload, scheduleSummary, timeAgo, timeFromMinutes } from "../utils";

export function TemplatesView({
  templates,
  schedules,
  lessons,
  classes,
  refresh,
  notify,
}: {
  templates: LessonTemplate[];
  schedules: RecurringSchedule[];
  lessons: Lesson[];
  classes: LessonClass[];
  refresh: () => void;
  notify: (value: string) => void;
}) {
  const [showTemplate, setShowTemplate] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<LessonTemplate>();
  const [instantiateTemplate, setInstantiateTemplate] =
    useState<LessonTemplate>();
  const [frequency, setFrequency] =
    useState<RecurringSchedule["frequency"]>("weekly");
  const [busy, setBusy] = useState(false);
  const [exceptionDates, setExceptionDates] = useState<Record<string, string>>(
    {},
  );

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    try {
      await api("/api/v1/lesson-templates/from-lesson", {
        method: "POST",
        body: JSON.stringify({
          lessonId: values.lessonId,
          name: values.name,
          description: values.description,
        }),
      });
      setShowTemplate(false);
      refresh();
      notify("Reusable lesson template created.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function updateTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTemplate) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    try {
      await api(`/api/v1/lesson-templates/${editingTemplate.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: values.name,
          description: values.description,
          defaultTitle: values.defaultTitle,
          defaultStartMinutes: minutesFromTime(
            String(values.defaultStartTime || ""),
          ),
          preRollLeadMinutes:
            values.preRollLeadMinutes === ""
              ? null
              : Number(values.preRollLeadMinutes),
          preRollEnabled: values.preRollEnabled === "on",
          keepOffline: values.keepOffline === "on",
          downloadDaysBefore: Number(values.downloadDaysBefore),
          volumePercent: Number(values.volumePercent),
          muted: values.muted === "on",
        }),
      });
      setEditingTemplate(undefined);
      refresh();
      notify("Template defaults saved.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function replaceTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTemplate) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (
      !await confirmAction(
        "Replace this template's playlist and timing defaults from the selected lesson? Existing generated lessons will not change.",
      )
    )
      return;
    setBusy(true);
    try {
      await api(
        `/api/v1/lesson-templates/${editingTemplate.id}/replace-from-lesson`,
        { method: "POST", body: JSON.stringify({ lessonId: values.lessonId }) },
      );
      setEditingTemplate(undefined);
      refresh();
      notify(
        "Template structure refreshed. Referenced media will now be kept permanently.",
      );
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function instantiate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!instantiateTemplate) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    try {
      await api(
        `/api/v1/lesson-templates/${instantiateTemplate.id}/instantiate`,
        {
          method: "POST",
          body: JSON.stringify({
            classId: values.classId,
            date: values.date,
            title: values.title || null,
            startMinutes: minutesFromTime(String(values.startTime || "")),
          }),
        },
      );
      setInstantiateTemplate(undefined);
      refresh();
      notify("Lesson created from the template.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    try {
      await api("/api/v1/recurring-schedules", {
        method: "POST",
        body: JSON.stringify({
          templateId: values.templateId,
          classId: values.classId,
          name: values.name,
          frequency,
          interval: Number(values.interval || 1),
          dayOfWeek: frequency === "weekly" ? Number(values.dayOfWeek) : null,
          dayOfMonth:
            frequency === "monthly" ? Number(values.dayOfMonth) : null,
          startDate: values.startDate,
          endDate: values.endDate || null,
          startMinutes: minutesFromTime(String(values.startTime || "")),
          titlePattern: values.titlePattern,
          customDates:
            frequency === "custom"
              ? parseDateList(String(values.customDates || ""))
              : [],
          excludedDates: [],
          enabled: true,
          generateDaysAhead: Number(values.generateDaysAhead || 90),
        }),
      });
      setShowSchedule(false);
      refresh();
      notify("Recurring schedule saved and upcoming lessons generated.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function generate(schedule: RecurringSchedule) {
    setBusy(true);
    try {
      const result = await api<{ generated: number }>(
        `/api/v1/recurring-schedules/${schedule.id}/generate`,
        { method: "POST", body: "{}" },
      );
      refresh();
      notify(
        result.generated
          ? `${result.generated} new lesson${result.generated === 1 ? "" : "s"} generated.`
          : "Schedule is already up to date.",
      );
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function setEnabled(schedule: RecurringSchedule, enabled: boolean) {
    try {
      await api(`/api/v1/recurring-schedules/${schedule.id}`, {
        method: "PUT",
        body: JSON.stringify(schedulePayload(schedule, enabled)),
      });
      refresh();
      notify(
        enabled
          ? "Schedule resumed."
          : "Schedule paused. Existing lessons were kept.",
      );
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function setException(
    schedule: RecurringSchedule,
    date: string,
    excluded: boolean,
  ) {
    if (!date) return;
    try {
      await api(`/api/v1/recurring-schedules/${schedule.id}/exception`, {
        method: "POST",
        body: JSON.stringify({ date, excluded }),
      });
      setExceptionDates((current) => ({ ...current, [schedule.id]: "" }));
      refresh();
      notify(
        excluded
          ? "Date skipped and its generated lesson removed."
          : "Date restored to the schedule.",
      );
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function removeTemplate(template: LessonTemplate) {
    if (
      !await confirmAction(
        `Delete ${template.name}? Its ${template.scheduleCount} recurring schedule${template.scheduleCount === 1 ? "" : "s"} will also be removed. Existing lessons stay intact.`,
        { destructive: true },
      )
    )
      return;
    try {
      await api(`/api/v1/lesson-templates/${template.id}`, {
        method: "DELETE",
      });
      refresh();
      notify("Template deleted; existing lessons were preserved.");
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function removeSchedule(schedule: RecurringSchedule) {
    if (
      !await confirmAction(
        `Delete ${schedule.name}? Existing generated lessons will stay in their classes.`,
        { destructive: true },
      )
    )
      return;
    try {
      await api(`/api/v1/recurring-schedules/${schedule.id}`, {
        method: "DELETE",
      });
      refresh();
      notify("Schedule deleted; existing lessons were preserved.");
    } catch (error) {
      notify(errorText(error));
    }
  }

  return (
    <>
      <PageHead
        eyebrow="REUSABLE PLANNING"
        title="Templates & recurring schedules"
        detail="Capture a proven lesson structure once, then generate dated lessons automatically with explicit holiday exceptions."
        action={
          <div className="page-actions">
            <button
              className="button"
              onClick={() => setShowTemplate(true)}
              disabled={!lessons.length}
            >
              New template
            </button>
            <button
              className="button primary"
              onClick={() => setShowSchedule(true)}
              disabled={!templates.length || !classes.length}
            >
              New schedule
            </button>
          </div>
        }
      />
      {showTemplate && (
        <Modal
          title="Create template from a lesson"
          onClose={() => !busy && setShowTemplate(false)}
        >
          <form className="stack" onSubmit={createTemplate}>
            <Field
              label="Source lesson"
              hint="Playlist order, media, trims, fades, pre-roll, countdown, timing, and offline defaults are copied. Referenced media is kept permanently for safe reuse."
            >
              <select name="lessonId" required>
                {[...lessons]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {formatShortDate(lesson.date)} — {lesson.title} (
                      {lesson.className})
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Template name">
              <input
                name="name"
                required
                autoFocus
                placeholder="Standard weekly lesson"
              />
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                rows={3}
                placeholder="When this structure should be used"
              />
            </Field>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Create reusable template"}
            </button>
          </form>
        </Modal>
      )}
      {editingTemplate && (
        <Modal
          title="Edit template defaults"
          onClose={() => !busy && setEditingTemplate(undefined)}
        >
          <form className="stack" onSubmit={updateTemplate}>
            <div className="two-fields">
              <Field label="Template name">
                <input
                  name="name"
                  required
                  defaultValue={editingTemplate.name}
                />
              </Field>
              <Field label="Default lesson title">
                <input
                  name="defaultTitle"
                  required
                  defaultValue={editingTemplate.defaultTitle}
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                name="description"
                rows={3}
                defaultValue={editingTemplate.description}
              />
            </Field>
            <div className="two-fields">
              <Field label="Default start time">
                <input
                  name="defaultStartTime"
                  type="time"
                  defaultValue={timeFromMinutes(
                    editingTemplate.defaultStartMinutes,
                  )}
                />
              </Field>
              <Field label="Pre-roll lead (minutes)">
                <input
                  name="preRollLeadMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  defaultValue={editingTemplate.preRollLeadMinutes ?? ""}
                />
              </Field>
            </div>
            <div className="two-fields">
              <Field label="Download days before">
                <input
                  name="downloadDaysBefore"
                  type="number"
                  min="0"
                  max="365"
                  defaultValue={editingTemplate.downloadDaysBefore}
                />
              </Field>
              <Field label="Whole-lesson volume">
                <div className="unit-input">
                  <input
                    name="volumePercent"
                    type="number"
                    min="0"
                    max="150"
                    defaultValue={editingTemplate.volumePercent ?? 100}
                  />
                  <span>%</span>
                </div>
              </Field>
            </div>
            <div className="template-switches">
              <label className="check-line">
                <input
                  name="preRollEnabled"
                  type="checkbox"
                  defaultChecked={editingTemplate.preRollEnabled}
                />{" "}
                Enable pre-roll
              </label>
              <label className="check-line">
                <input
                  name="keepOffline"
                  type="checkbox"
                  defaultChecked={editingTemplate.keepOffline}
                />{" "}
                Keep lesson offline
              </label>
              <label className="check-line">
                <input
                  name="muted"
                  type="checkbox"
                  defaultChecked={editingTemplate.muted}
                />{" "}
                Mute generated lessons
              </label>
            </div>
            <button className="button primary" disabled={busy}>
              Save defaults
            </button>
          </form>
          <form className="template-replace stack" onSubmit={replaceTemplate}>
            <div>
              <strong>Refresh the complete structure</strong>
              <p>
                Replace playlist order, media, trims, fades, cue markers, role
                assignments, volume, and timing defaults from a newer lesson.
                Referenced media is kept permanently for safe reuse.
              </p>
            </div>
            <Field label="New source lesson">
              <select name="lessonId" required>
                {[...lessons]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {formatShortDate(lesson.date)} — {lesson.title}
                    </option>
                  ))}
              </select>
            </Field>
            <button className="button" disabled={busy}>
              Replace from selected lesson
            </button>
          </form>
        </Modal>
      )}
      {instantiateTemplate && (
        <Modal
          title="Create one lesson from template"
          onClose={() => !busy && setInstantiateTemplate(undefined)}
        >
          <form className="stack" onSubmit={instantiate}>
            <div className="template-source">
              <span>TEMPLATE</span>
              <strong>{instantiateTemplate.name}</strong>
              <small>{instantiateTemplate.items.length} playlist items</small>
            </div>
            <div className="two-fields">
              <Field label="Class">
                <select name="classId" required>
                  {classes.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Lesson date">
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={dateInputValue(undefined, 7)}
                />
              </Field>
            </div>
            <div className="two-fields">
              <Field label="Lesson title">
                <input
                  name="title"
                  defaultValue={instantiateTemplate.defaultTitle}
                />
              </Field>
              <Field label="Start time">
                <input
                  name="startTime"
                  type="time"
                  defaultValue={timeFromMinutes(
                    instantiateTemplate.defaultStartMinutes,
                  )}
                />
              </Field>
            </div>
            <button className="button primary" disabled={busy}>
              Create lesson
            </button>
          </form>
        </Modal>
      )}
      {showSchedule && (
        <Modal
          title="Create recurring schedule"
          onClose={() => !busy && setShowSchedule(false)}
        >
          <form className="stack schedule-form" onSubmit={createSchedule}>
            <div className="two-fields">
              <Field label="Schedule name">
                <input
                  name="name"
                  required
                  autoFocus
                  placeholder="Fall weekly sessions"
                />
              </Field>
              <Field label="Template">
                <select name="templateId" required>
                  {templates.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="two-fields">
              <Field label="Class">
                <select name="classId" required>
                  {classes.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Recurrence">
                <select
                  value={frequency}
                  onChange={(event) =>
                    setFrequency(
                      event.target.value as RecurringSchedule["frequency"],
                    )
                  }
                >
                  <option value="weekly">Weekly / biweekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Term or custom dates</option>
                </select>
              </Field>
            </div>
            <div className="three-fields">
              <Field label="Every">
                <select name="interval" defaultValue="1">
                  <option value="1">1 period</option>
                  <option value="2">2 periods</option>
                  <option value="3">3 periods</option>
                  <option value="4">4 periods</option>
                </select>
              </Field>
              {frequency === "weekly" && (
                <Field label="Weekday">
                  <select name="dayOfWeek" defaultValue="0">
                    {[
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ].map((day, index) => (
                      <option value={index} key={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {frequency === "monthly" && (
                <Field label="Day of month">
                  <input
                    name="dayOfMonth"
                    type="number"
                    min="1"
                    max="31"
                    required
                    defaultValue="1"
                  />
                </Field>
              )}
              <Field label="Start time">
                <input name="startTime" type="time" />
              </Field>
            </div>
            {frequency === "custom" && (
              <Field
                label="Term or custom dates"
                hint="Enter dates separated by commas or new lines (YYYY-MM-DD)."
              >
                <textarea
                  name="customDates"
                  required
                  rows={4}
                  placeholder={dateInputValue(undefined, 7)}
                />
              </Field>
            )}
            <div className="two-fields">
              <Field label="Begins">
                <input
                  name="startDate"
                  type="date"
                  required
                  defaultValue={dateInputValue(undefined, 7)}
                />
              </Field>
              <Field label="Ends (optional)">
                <input name="endDate" type="date" />
              </Field>
            </div>
            <Field
              label="Lesson title pattern"
              hint="Use {template}, {class}, and {date}."
            >
              <input
                name="titlePattern"
                defaultValue="{template} — {date}"
                required
              />
            </Field>
            <div className="two-fields">
              <Field label="Generate ahead">
                <select name="generateDaysAhead" defaultValue="90">
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">1 year</option>
                  <option value="730">2 years</option>
                </select>
              </Field>
              <div className="schedule-help">
                <strong>Safe to rerun</strong>
                <small>
                  LessonCue recognizes generated dates and never duplicates
                  them.
                </small>
              </div>
            </div>
            <button className="button primary" disabled={busy}>
              {busy ? "Generating…" : "Save and generate lessons"}
            </button>
          </form>
        </Modal>
      )}
      <section className="planning-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">STRUCTURES</span>
            <h2>Lesson templates</h2>
          </div>
          <span className="pill">{templates.length}</span>
        </div>
        {templates.length ? (
          <div className="template-grid">
            {templates.map((template) => (
              <article className="template-card panel" key={template.id}>
                <div className="template-card-head">
                  <div>
                    <span>REUSABLE TEMPLATE</span>
                    <h3>{template.name}</h3>
                    <p>{template.description || "No description"}</p>
                  </div>
                  <strong>{template.items.length}</strong>
                </div>
                <div className="template-meta">
                  <span>
                    {timeFromMinutes(template.defaultStartMinutes) ||
                      "No default time"}
                  </span>
                  <span>
                    {template.preRollEnabled
                      ? `Pre-roll${template.preRollLeadMinutes != null ? ` ${template.preRollLeadMinutes}m early` : ""}`
                      : "No pre-roll"}
                  </span>
                  <span>
                    {template.scheduleCount} schedule
                    {template.scheduleCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="template-sequence">
                  {template.items.slice(0, 6).map((item, index) => (
                    <span className={item.role} key={item.id}>
                      <b>{index + 1}</b>
                      {item.title}
                    </span>
                  ))}
                  {template.items.length > 6 && (
                    <i>+{template.items.length - 6} more</i>
                  )}
                </div>
                <div className="card-actions">
                  <button
                    className="button primary"
                    onClick={() => setInstantiateTemplate(template)}
                  >
                    Create lesson
                  </button>
                  <button
                    className="button"
                    onClick={() => setEditingTemplate(template)}
                  >
                    Edit defaults
                  </button>
                  <button
                    className="text-danger"
                    onClick={() => removeTemplate(template)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <section className="panel">
            <Empty
              title="No reusable templates yet"
              body="Open a proven lesson, then capture its full media and timing structure as a template."
              action={
                lessons.length ? (
                  <button
                    className="button primary"
                    onClick={() => setShowTemplate(true)}
                  >
                    Create first template
                  </button>
                ) : undefined
              }
            />
          </section>
        )}
      </section>
      <section className="planning-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">AUTOMATION</span>
            <h2>Recurring schedules</h2>
          </div>
          <span className="pill">{schedules.length}</span>
        </div>
        {schedules.length ? (
          <div className="schedule-list">
            {schedules.map((schedule) => {
              const excluded = parseStoredDates(schedule.excludedDatesJson);
              return (
                <article
                  className={`schedule-card panel ${schedule.enabled ? "" : "paused"}`}
                  key={schedule.id}
                >
                  <div className="schedule-card-main">
                    <div className="schedule-status">
                      <i />
                      <span>{schedule.enabled ? "ACTIVE" : "PAUSED"}</span>
                    </div>
                    <div>
                      <h3>{schedule.name}</h3>
                      <p>
                        {schedule.templateName} → {schedule.className}
                      </p>
                      <strong>{scheduleSummary(schedule)}</strong>
                    </div>
                    <div className="schedule-count">
                      <strong>{schedule.generatedCount}</strong>
                      <span>lessons</span>
                    </div>
                  </div>
                  <div className="schedule-details">
                    <span>
                      From {formatShortDate(schedule.startDate)}
                      {schedule.endDate
                        ? ` to ${formatShortDate(schedule.endDate)}`
                        : " · no end date"}
                    </span>
                    <span>
                      {schedule.startMinutes != null
                        ? `Starts ${timeFromMinutes(schedule.startMinutes)}`
                        : "Uses template start time"}
                    </span>
                    <span>
                      Generates {schedule.generateDaysAhead} days ahead
                    </span>
                    <span>
                      {schedule.lastGeneratedAt
                        ? `Checked ${timeAgo(schedule.lastGeneratedAt)}`
                        : "Not generated yet"}
                    </span>
                  </div>
                  <div className="exception-editor">
                    <div>
                      <strong>Holiday / skipped dates</strong>
                      <small>
                        Adding a date removes only the lesson generated by this
                        schedule.
                      </small>
                    </div>
                    <div className="exception-add">
                      <input
                        aria-label={`Skip date for ${schedule.name}`}
                        type="date"
                        value={exceptionDates[schedule.id] || ""}
                        onChange={(event) =>
                          setExceptionDates((current) => ({
                            ...current,
                            [schedule.id]: event.target.value,
                          }))
                        }
                      />
                      <button
                        className="button"
                        onClick={() =>
                          setException(
                            schedule,
                            exceptionDates[schedule.id],
                            true,
                          )
                        }
                      >
                        Skip date
                      </button>
                    </div>
                    {excluded.length > 0 && (
                      <div className="exception-chips">
                        {excluded.map((date) => (
                          <button
                            key={date}
                            title="Restore this date"
                            onClick={() => setException(schedule, date, false)}
                          >
                            {formatShortDate(date)} ×
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="card-actions">
                    <button
                      className="button primary"
                      onClick={() => generate(schedule)}
                      disabled={busy || !schedule.enabled}
                    >
                      Generate now
                    </button>
                    <label className="switch-row compact">
                      <input
                        type="checkbox"
                        checked={schedule.enabled}
                        onChange={(event) =>
                          setEnabled(schedule, event.target.checked)
                        }
                      />
                      <span />
                      <div>
                        <strong>
                          {schedule.enabled ? "Enabled" : "Paused"}
                        </strong>
                      </div>
                    </label>
                    <button
                      className="text-danger"
                      onClick={() => removeSchedule(schedule)}
                    >
                      Delete schedule
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="panel">
            <Empty
              title="No recurring schedules"
              body="Create a template first, then generate weekly, monthly, term-based, or custom dated lessons."
              action={
                templates.length ? (
                  <button
                    className="button primary"
                    onClick={() => setShowSchedule(true)}
                  >
                    Create schedule
                  </button>
                ) : undefined
              }
            />
          </section>
        )}
      </section>
    </>
  );
}
