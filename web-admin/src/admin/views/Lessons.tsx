import { confirmAction } from "../../AccessibleDialogs";
import { CSSProperties, FormEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, ReactNode, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { api, uploadMediaFile } from "../api";
import { TimelineEditor } from "../media-editor";
import { Lesson, LessonClass, Media, MediaFormats, MediaTaxonomy, MediaUploadControl, PlaylistItem, Screen, StorageStatus, TemporaryControllerSession } from "../models";
import { DateBadge, Empty, Field, Modal, PageHead, QrCode, RetentionChoices, RoleSummary, TaxonomyFields, formTags } from "../ui";
import { classControllerUrl, controllerSlug, cueDurationLabel, cuePlannedDurationMs, defaultEndBehaviorForRole, errorText, formatBytes, formatDate, formatDuration, formatFriendlyDuration, intervalsOverlap, isConvertibleDocument, isPresentationFileName, lessonPlannedDurationMs, roleName, toLocalInput } from "../utils";
import { ActivityApi } from "../../activities/api";
import type { ActivityDefinition } from "../../activities/types";

export function ClassesView({
  classes,
  lessons,
  media,
  taxonomy,
  refresh,
  notify,
  canUpload,
  storage,
  localControllerOrigin,
  mediaFormats,
  screens = [],
  onNavigateScreens,
  onPresentNow,
}: {
  classes: LessonClass[];
  lessons: Lesson[];
  media: Media[];
  taxonomy: MediaTaxonomy;
  refresh: () => void;
  notify: (s: string) => void;
  canUpload: boolean;
  storage?: StorageStatus;
  localControllerOrigin?: string;
  mediaFormats?: MediaFormats;
  screens?: Screen[];
  onNavigateScreens?: () => void;
  onPresentNow?: (lesson: Lesson) => void;
}) {
  const [selected, setSelected] = useState(classes[0]?.id || "");
  const [editing, setEditing] = useState<string>();
  const [showClassForm, setShowClassForm] = useState(false);
  const [showControllerSettings, setShowControllerSettings] = useState(false);
  const [showEditClass, setShowEditClass] = useState(false);
  const [controllerLessonId, setControllerLessonId] = useState("");
  const [temporaryController, setTemporaryController] =
    useState<TemporaryControllerSession>();
  const [permanentController, setPermanentController] =
    useState<TemporaryControllerSession | null>();
  const [controllerLinkMode, setControllerLinkMode] = useState<
    "signed-in" | "temporary" | "permanent"
  >("signed-in");
  const [temporaryMinutes, setTemporaryMinutes] = useState("60");
  const [controllerColor, setControllerColor] = useState("#2d6a4f");
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(
    new Set(),
  );
  const [lessonBulkAction, setLessonBulkAction] = useState("archive");
  const [showLessonBulk, setShowLessonBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const current = classes.find((c) => c.id === selected) || classes[0];
  const currentClassId = current?.id;
  const currentControllerColor = current?.controllerColor;
  useEffect(() => {
    setControllerColor(currentControllerColor || "#2d6a4f");
    setTemporaryController(undefined);
    setControllerLinkMode("signed-in");
    if (!showControllerSettings || !currentClassId) {
      setPermanentController(undefined);
      return;
    }
    let active = true;
    setPermanentController(undefined);
    api<
      | (TemporaryControllerSession & { active: true })
      | { active: false }
    >(`/api/v1/controller/permanent/${currentClassId}`)
      .then((result) => {
        if (!active) return;
        if (result.active) {
          setPermanentController(result);
          setControllerLinkMode("permanent");
        } else {
          setPermanentController(null);
        }
      })
      .catch(() => {
        if (active) setPermanentController(null);
      });
    return () => {
      active = false;
    };
  }, [currentClassId, currentControllerColor, showControllerSettings]);
  const classLessons = lessons
    .filter((l) => l.classId === current?.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const selectedLessons = classLessons.filter((l) =>
    selectedLessonIds.has(l.id),
  );
  const allLessonsSelected =
    classLessons.length > 0 && selectedLessons.length === classLessons.length;
  const lesson = lessons.find((l) => l.id === editing);
  if (lesson)
    return (
      <LessonEditor
        lesson={lesson}
        classes={classes}
        allLessons={lessons}
        media={media}
        taxonomy={taxonomy}
        onBack={() => setEditing(undefined)}
        refresh={refresh}
        notify={notify}
        canUpload={canUpload}
        storage={storage}
        mediaFormats={mediaFormats}
        screens={screens}
        onNavigateScreens={onNavigateScreens}
        onPresentNow={onPresentNow}
      />
    );

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const body = {
        ...values,
        controllerColor: String(values.controllerColor || "#2d6a4f"),
      };
      const item = await api<LessonClass>("/api/v1/classes", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSelected(item.id);
      setShowClassForm(false);
      refresh();
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const item = await api<Lesson>("/api/v1/lessons", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          classId: current.id,
          preRollEnabled: false,
          countdownItemId: null,
          availableFrom: null,
          expiresAt: null,
          designatedStartAt: null,
        }),
      });
      refresh();
      setEditing(item.id);
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function updateController(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/v1/classes/${current.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: current.name,
          description: current.description,
          controllerSlug: values.controllerSlug,
          controllerColor: values.controllerColor,
          controllerHostname: values.controllerHostname || null,
        }),
      });
      setShowControllerSettings(false);
      refresh();
      notify("Class controller address and theme saved.");
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function updateClassDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/v1/classes/${current.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...values,
          controllerSlug: current.controllerSlug || controllerSlug(current),
          controllerColor: String(values.controllerColor || current.controllerColor),
          controllerHostname: current.controllerHostname || null,
        }),
      });
      setShowEditClass(false);
      refresh();
      notify("Class details saved.");
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function deleteClass() {
    if (
      !current ||
      !await confirmAction(
        `Move ${current.name} and all of its lessons to the recycling bin? They can be restored for 30 days.`,
        { destructive: true, confirmLabel: "Move to recycling bin" },
      )
    )
      return;
    try {
      await api(`/api/v1/classes/${current.id}`, { method: "DELETE" });
      setShowEditClass(false);
      setShowControllerSettings(false);
      setSelected("");
      refresh();
      notify("Class and lessons moved to the recycling bin.");
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function createTemporaryController() {
    if (!current) return;
    try {
      const session = await api<TemporaryControllerSession>(
        "/api/v1/controller/sessions",
        {
          method: "POST",
          body: JSON.stringify({
            classId: current.id,
            lessonId: controllerLessonId || null,
            expiresInMinutes: Number(temporaryMinutes),
          }),
        },
      );
      setTemporaryController(session);
      setControllerLinkMode("temporary");
      notify("Temporary restricted controller link created.");
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function rotatePermanentController() {
    if (!current) return;
    if (
      permanentController &&
      !await confirmAction(
        "Refresh this permanent controller QR? The current QR will stop working immediately.",
      )
    )
      return;
    try {
      const session = await api<TemporaryControllerSession>(
        "/api/v1/controller/permanent",
        {
          method: "POST",
          body: JSON.stringify({
            classId: current.id,
            lessonId: controllerLessonId || null,
          }),
        },
      );
      setPermanentController(session);
      setControllerLinkMode("permanent");
      notify(
        permanentController
          ? "Permanent controller QR refreshed. The previous QR is revoked."
          : "Permanent revocable controller QR created.",
      );
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function revokePermanentController() {
    if (
      !current ||
      !permanentController ||
      !await confirmAction(
        "Revoke this permanent controller QR? Phones using it will lose access immediately.",
        { destructive: true, confirmLabel: "Revoke QR" },
      )
    )
      return;
    try {
      await api(`/api/v1/controller/permanent/${current.id}`, {
        method: "DELETE",
      });
      setPermanentController(null);
      setControllerLinkMode("signed-in");
      notify("Permanent controller QR revoked.");
    } catch (error) {
      notify(errorText(error));
    }
  }
  function toggleLesson(id: string) {
    setSelectedLessonIds((value) => {
      const next = new Set(value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllLessons() {
    setSelectedLessonIds(
      allLessonsSelected
        ? new Set()
        : new Set(classLessons.map((item) => item.id)),
    );
  }
  async function applyLessonBulk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLessons.length) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (
      lessonBulkAction === "delete" &&
      !await confirmAction(
        `Move ${selectedLessons.length} selected lesson${selectedLessons.length === 1 ? "" : "s"} to the recycling bin? They can be restored for 30 days.`,
        { destructive: true, confirmLabel: "Move to recycling bin" },
      )
    )
      return;
    setBulkBusy(true);
    try {
      await api("/api/v1/lessons/bulk", {
        method: "POST",
        body: JSON.stringify({
          lessonIds: selectedLessons.map((item) => item.id),
          action: lessonBulkAction,
          classId: lessonBulkAction === "move" ? values.classId : null,
          shiftDays:
            lessonBulkAction === "shift" ? Number(values.shiftDays) : null,
          titlePrefix:
            lessonBulkAction === "prefix-title" ? values.titlePrefix : null,
        }),
      });
      setSelectedLessonIds(new Set());
      setShowLessonBulk(false);
      refresh();
      notify(
        `${selectedLessons.length} lesson${selectedLessons.length === 1 ? "" : "s"} updated.`,
      );
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBulkBusy(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="PROGRAMMING"
        title="Lessons"
        detail="Schedule lessons and compose exactly what your screens will play."
        action={
          <button
            className="button primary"
            onClick={() => setShowClassForm(true)}
          >
            New class
          </button>
        }
      />
      {showClassForm && (
        <Modal title="Create a class" onClose={() => setShowClassForm(false)}>
          <form onSubmit={createClass} className="stack">
            <Field label="Class name">
              <input name="name" required autoFocus />
            </Field>
            <Field label="Description">
              <textarea name="description" rows={3} />
            </Field>
            <Field label="Theme color">
              <div className="controller-color-picker">
                <input name="controllerColor" type="color" defaultValue="#2d6a4f" aria-label="Class theme color" />
                <output>#2D6A4F</output>
              </div>
            </Field>
            <button className="button primary">Create class</button>
          </form>
        </Modal>
      )}
      {!classes.length ? (
        <section className="panel">
          <Empty
            title="Create your first class"
            body="Classes organize lessons and determine which screens receive them."
            action={
              <button
                className="button primary"
                onClick={() => setShowClassForm(true)}
              >
                Create class
              </button>
            }
          />
        </section>
      ) : (
        <div className="classes-layout">
          <aside className="class-list panel">
            <h3>Your classes</h3>
            {classes.map((c) => (
              <button
                key={c.id}
                className={current?.id === c.id ? "active" : ""}
                onClick={() => {
                  setSelected(c.id);
                  setSelectedLessonIds(new Set());
                }}
              >
                <span className="class-glyph" style={{ backgroundColor: c.controllerColor || undefined }}>{c.name[0]}</span>
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {c.lessonCount} lessons · {c.screenCount} screens
                  </small>
                </span>
              </button>
            ))}
          </aside>
          <section className="panel class-detail">
            <div className="class-title">
              <div>
                <span className="eyebrow">CLASS</span>
                <h2>{current?.name}</h2>
                <p>{current?.description || "No class description yet."}</p>
              </div>
              {current && (
                <div className="head-actions">
                  <button
                    className="button"
                    onClick={() => setShowEditClass(true)}
                  >
                    Edit class
                  </button>
                  <button
                    className="button"
                    onClick={() => setShowControllerSettings(true)}
                  >
                    Controller link
                  </button>
                </div>
              )}
            </div>
            {showEditClass && current && (
              <Modal
                title={`Edit ${current.name}`}
                onClose={() => setShowEditClass(false)}
              >
                <form className="stack" onSubmit={updateClassDetails}>
                  <Field label="Class name">
                    <input
                      name="name"
                      defaultValue={current.name}
                      required
                      autoFocus
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      name="description"
                      defaultValue={current.description}
                      rows={3}
                    />
                  </Field>
                  <Field label="Theme color">
                    <div className="controller-color-picker">
                      <input name="controllerColor" type="color" defaultValue={current.controllerColor || "#2d6a4f"} aria-label="Class theme color" />
                      <output>{(current.controllerColor || "#2d6a4f").toUpperCase()}</output>
                    </div>
                  </Field>
                  <button className="button primary">Save class</button>
                  <button
                    type="button"
                    className="button danger"
                    onClick={deleteClass}
                  >
                    Move class to recycling bin
                  </button>
                </form>
              </Modal>
            )}
            {showControllerSettings &&
              current &&
              (() => {
                const controllerOrigin =
                  localControllerOrigin || location.origin;
                const activeController =
                  controllerLinkMode === "temporary"
                    ? temporaryController
                    : controllerLinkMode === "permanent"
                      ? permanentController
                      : undefined;
                const controllerUrl = activeController
                  ? `${controllerOrigin}${activeController.path}`
                  : classControllerUrl(
                      current,
                      controllerLessonId,
                      controllerOrigin,
                    );
                return (
                  <Modal
                    title={`${current.name} controller`}
                    onClose={() => setShowControllerSettings(false)}
                  >
                    <form className="stack" onSubmit={updateController}>
                      <div
                        className="controller-share-preview"
                        style={
                          {
                            "--room-color": controllerColor,
                          } as CSSProperties
                        }
                      >
                        <QrCode value={controllerUrl} />
                        <div>
                          <span>
                            {activeController?.permanent
                              ? "PERMANENT REVOCABLE CONTROLLER"
                              : activeController
                              ? "TEMPORARY RESTRICTED CONTROLLER"
                              : "TEACHER CONTROLLER"}
                          </span>
                          <strong>{controllerUrl}</strong>
                          <p>
                            {activeController?.permanent
                              ? "This QR remains valid across server restarts until an administrator refreshes or revokes it."
                              : activeController
                                ? `This link expires ${new Date(activeController.expiresAt!).toLocaleString()} and cannot control another class or lesson.`
                              : `This signed-in page only displays screens and lessons assigned to ${current.name}. Print or scan the QR code, then save the page to the phone's Home Screen.`}
                          </p>
                          {localControllerOrigin && (
                            <p>
                              Campus-only control is on, so this QR always uses
                              the local .local address.
                            </p>
                          )}
                        </div>
                      </div>
                      <Field
                        label="QR code opens"
                        hint="A lesson-specific QR still lets the teacher choose another lesson in this class."
                      >
                        <select
                          value={controllerLessonId}
                          onChange={(event) => {
                            setControllerLessonId(event.target.value);
                            setTemporaryController(undefined);
                            setControllerLinkMode("signed-in");
                          }}
                        >
                          <option value="">The classroom</option>
                          {classLessons
                            .filter((item) => !item.archived)
                            .map((item) => (
                              <option value={item.id} key={item.id}>
                                {formatDate(item.date)} — {item.title}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <div className="temporary-controller-row">
                        <Field label="Temporary link duration">
                          <select
                            value={temporaryMinutes}
                            onChange={(event) => {
                              setTemporaryMinutes(event.target.value);
                              setTemporaryController(undefined);
                              setControllerLinkMode("signed-in");
                            }}
                          >
                            <option value="15">15 minutes</option>
                            <option value="60">1 hour</option>
                            <option value="240">4 hours</option>
                            <option value="1440">1 day</option>
                            <option value="10080">7 days</option>
                          </select>
                        </Field>
                        <button
                          type="button"
                          className="button"
                          onClick={createTemporaryController}
                        >
                          Create restricted temporary QR
                        </button>
                      </div>
                      <section className="permanent-controller-card">
                        <div>
                          <strong>Permanent revocable QR</strong>
                          <small>
                            {permanentController
                              ? `Active since ${new Date(permanentController.createdAt || Date.now()).toLocaleString()}. It remains valid until refreshed or revoked.`
                              : permanentController === undefined
                                ? "Checking for an existing permanent QR…"
                                : "Create one for a printed sign or a teacher phone that should keep working without an expiration date."}
                          </small>
                        </div>
                        <div>
                          {permanentController && (
                            <button
                              type="button"
                              className="button"
                              onClick={() =>
                                setControllerLinkMode("permanent")
                              }
                            >
                              Show permanent QR
                            </button>
                          )}
                          <button
                            type="button"
                            className="button"
                            onClick={rotatePermanentController}
                            disabled={permanentController === undefined}
                          >
                            {permanentController
                              ? "Refresh permanent QR"
                              : "Create permanent QR"}
                          </button>
                          {permanentController && (
                            <button
                              type="button"
                              className="button danger"
                              onClick={revokePermanentController}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </section>
                      <div className="two-fields">
                        <Field
                          label="Path"
                          hint="Lowercase letters, numbers, and hyphens"
                        >
                          <div className="path-input">
                            <span>/room/</span>
                            <input
                              name="controllerSlug"
                              required
                              pattern="[a-z0-9-]+"
                              maxLength={63}
                              defaultValue={controllerSlug(current)}
                            />
                          </div>
                        </Field>
                        <Field label="Theme color">
                          <div className="controller-color-picker">
                            <input
                              name="controllerColor"
                              type="color"
                              value={controllerColor}
                              aria-label="Controller theme color"
                              style={{ backgroundColor: controllerColor }}
                              onChange={(event) =>
                                setControllerColor(event.target.value)
                              }
                            />
                            <output>{controllerColor.toUpperCase()}</output>
                          </div>
                        </Field>
                      </div>
                      <Field
                        label="Optional public hostname"
                        hint="For example classroom1.example.org. Configure this hostname in Cloudflare to use the same LessonCue origin."
                      >
                        <input
                          name="controllerHostname"
                          defaultValue={current.controllerHostname || ""}
                          placeholder="classroom1.example.org"
                        />
                      </Field>
                      <button className="button primary">
                        Save controller
                      </button>
                    </form>
                  </Modal>
                );
              })()}
            <form className="quick-create" onSubmit={createLesson}>
              <input name="title" placeholder="New lesson title" required />
              <label className="sr-only" htmlFor="quick-create-date">Lesson date</label>
              <input
                id="quick-create-date"
                name="date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
              <button className="button primary">Create lesson</button>
            </form>
            {showLessonBulk && (
              <Modal
                title={`Bulk edit ${selectedLessons.length} lesson${selectedLessons.length === 1 ? "" : "s"}`}
                onClose={() => !bulkBusy && setShowLessonBulk(false)}
              >
                <form className="stack" onSubmit={applyLessonBulk}>
                  <Field label="Action">
                    <select
                      value={lessonBulkAction}
                      onChange={(event) =>
                        setLessonBulkAction(event.target.value)
                      }
                    >
                      <option value="archive">Archive</option>
                      <option value="restore">Restore from archive</option>
                      <option value="move">Move to another class</option>
                      <option value="shift">
                        Shift dates and scheduled times
                      </option>
                      <option value="prefix-title">Add a title prefix</option>
                      <option value="delete">Move to recycling bin</option>
                    </select>
                  </Field>
                  {lessonBulkAction === "move" && (
                    <Field label="Destination class">
                      <select name="classId" required>
                        {classes
                          .filter((item) => item.id !== current?.id)
                          .map((item) => (
                            <option value={item.id} key={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  )}
                  {lessonBulkAction === "shift" && (
                    <Field
                      label="Days to shift"
                      hint="Use a negative number to move earlier."
                    >
                      <input
                        name="shiftDays"
                        type="number"
                        min="-3650"
                        max="3650"
                        required
                        defaultValue="7"
                      />
                    </Field>
                  )}
                  {lessonBulkAction === "prefix-title" && (
                    <Field label="Prefix">
                      <input
                        name="titlePrefix"
                        maxLength={80}
                        required
                        placeholder="Fall term —"
                      />
                    </Field>
                  )}
                  {lessonBulkAction === "delete" && (
                    <div className="danger-callout">
                      <strong>
                        The selected lessons will be recoverable for 30 days.
                      </strong>
                      <p>
                        The media files remain in the library according to their
                        retention settings.
                      </p>
                    </div>
                  )}
                  <button
                    className={`button ${lessonBulkAction === "delete" ? "danger" : "primary"}`}
                    disabled={
                      bulkBusy ||
                      (lessonBulkAction === "move" && classes.length < 2)
                    }
                  >
                    {bulkBusy ? "Applying…" : "Apply to selected lessons"}
                  </button>
                </form>
              </Modal>
            )}
            {selectedLessons.length > 0 && (
              <section className="bulk-actions lesson-bulk-actions">
                <strong>{selectedLessons.length} selected</strong>
                <span>
                  Archive, move, shift, rename, restore, or delete these lessons
                  together.
                </span>
                <div>
                  <button
                    className="button primary"
                    onClick={() => setShowLessonBulk(true)}
                  >
                    Bulk edit
                  </button>
                  <button
                    className="button"
                    onClick={() => setSelectedLessonIds(new Set())}
                  >
                    Clear
                  </button>
                </div>
              </section>
            )}
            {classLessons.length ? (
              <div className="lesson-cards">
                <div className="lesson-select-all">
                  <label>
                    <input
                      type="checkbox"
                      checked={allLessonsSelected}
                      onChange={toggleAllLessons}
                    />{" "}
                    Select all lessons
                  </label>
                  <span>
                    {classLessons.filter((item) => item.archived).length}{" "}
                    archived
                  </span>
                </div>
                {classLessons.map((l) => (
                  <article
                    className={`lesson-card-row ${selectedLessonIds.has(l.id) ? "selected" : ""} ${l.archived ? "archived" : ""}`}
                    key={l.id}
                  >
                    <label className="media-select">
                      <input
                        type="checkbox"
                        checked={selectedLessonIds.has(l.id)}
                        onChange={() => toggleLesson(l.id)}
                        aria-label={`Select lesson ${l.title}`}
                      />
                    </label>
                    <button onClick={() => setEditing(l.id)}>
                      <DateBadge date={l.date} />
                      <span className="grow">
                        <strong>{l.title}</strong>
                        <small>
                          {l.items.length} items · Version {l.version}
                          {l.archived ? " · Archived" : ""}
                        </small>
                      </span>
                      <RoleSummary items={l.items} />
                      <b>›</b>
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="No lessons in this class"
                body="Add the first lesson with the form above."
              />
            )}
          </section>
        </div>
      )}
    </>
  );
}

export type AudiencePollOption = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "open" | "closed";
};

export function LessonEditor({
  lesson,
  classes,
  allLessons,
  media,
  taxonomy,
  onBack,
  refresh,
  notify,
  canUpload,
  storage,
  mediaFormats,
  screens = [],
  onNavigateScreens,
  onPresentNow,
}: {
  lesson: Lesson;
  classes: LessonClass[];
  allLessons: Lesson[];
  media: Media[];
  taxonomy: MediaTaxonomy;
  onBack: () => void;
  refresh: () => void;
  notify: (s: string) => void;
  canUpload: boolean;
  storage?: StorageStatus;
  mediaFormats?: MediaFormats;
  screens?: Screen[];
  onNavigateScreens?: () => void;
  onPresentNow?: (lesson: Lesson) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<"chooser" | "upload" | "poll" | "online" | "existing" | "activity">("chooser");
  const [availableActivities, setAvailableActivities] = useState<ActivityDefinition[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadControl, setUploadControl] = useState<MediaUploadControl>();
  const [uploadPaused, setUploadPaused] = useState(false);
  const [onlineMode, setOnlineMode] = useState<
    "online" | "download" | "slides"
  >("online");
  const [audiencePolls, setAudiencePolls] = useState<AudiencePollOption[]>([]);
  const [previewItem, setPreviewItem] = useState<PlaylistItem>();
  const [selectedCueIds, setSelectedCueIds] = useState<Set<string>>(new Set());
  const [cueBulkAction, setCueBulkAction] = useState("role");
  const [cueBulkBusy, setCueBulkBusy] = useState(false);
  const [showRunSheet, setShowRunSheet] = useState(false);
  const [showRelocate, setShowRelocate] = useState(false);
  const [relocateAction, setRelocateAction] = useState<"copy" | "move">("copy");
  const [draggedLibraryMediaId, setDraggedLibraryMediaId] = useState<string>();
  const [libraryDropIndex, setLibraryDropIndex] = useState<number>();
  const [activeSequenceSection, setActiveSequenceSection] = useState<"total" | PlaylistItem["role"]>("total");
  const [newCueId, setNewCueId] = useState<string>();
  const [showSchedule, setShowSchedule] = useState(false);
  const draftKey = `lessoncue.lesson-draft.${lesson.id}`;
  const [draftStatus, setDraftStatus] = useState<"saved" | "dirty" | "">("");
  const [localDraftAvailable, setLocalDraftAvailable] = useState(() => {
    try { return !!localStorage.getItem(draftKey); } catch { return false; }
  });
  const draftTimer = useRef<number | undefined>(undefined);
  const lessonSettingsRef = useRef<HTMLFormElement>(null);
  const items = [...lesson.items].sort((a, b) => a.position - b.position);
  const assignedScreens = screens.filter(
    (screen) => !screen.revoked && screen.assignedClassId === lesson.classId,
  );
  const libraryDropIndexRef = useRef<number | undefined>(undefined);
  const libraryDropRoleRef = useRef<PlaylistItem["role"] | undefined>(undefined);
  const libraryPointerDragRef = useRef<{
    mediaId: string;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | undefined>(undefined);
  const libraryDropHandledRef = useRef(false);
  const suppressLibraryClickUntilRef = useRef(0);
  useEffect(() => {
    if (!showAdd) return;
    void api<AudiencePollOption[]>("/api/v1/audience/admin/sessions")
      .then(setAudiencePolls)
      .catch(() => setAudiencePolls([]));
  }, [showAdd]);
  useEffect(() => {
    if (!newCueId || !lesson.items.some((item) => item.id === newCueId)) return;
    const frame = window.requestAnimationFrame(() => {
      const cue = document.getElementById(`lesson-cue-${newCueId}`);
      cue?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      cue?.focus({ preventScroll: true });
    });
    const timer = window.setTimeout(() => setNewCueId(undefined), 3500);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [lesson.items, newCueId]);
  const countdown = items.find((i) => i.role === "countdown");
  const lessonItems = items.filter((item) => item.role === "lesson");
  const sequenceSections: { role: PlaylistItem["role"]; label: string; loop?: boolean }[] = [
    { role: "preRoll", label: "Pre-Roll", loop: true },
    { role: "countdown", label: "Countdown" },
    { role: "lesson", label: "Main Lesson" },
    { role: "postLesson", label: "Post Lesson", loop: true },
  ];
  const sequenceGroups = sequenceSections.map((section) => ({
    ...section,
    items: items
      .map((item, globalIndex) => ({ item, globalIndex }))
      .filter(({ item }) => item.role === section.role),
  }));
  const activeSequenceItems = activeSequenceSection === "total"
    ? sequenceGroups.flatMap((group) => group.items)
    : sequenceGroups.find((group) => group.role === activeSequenceSection)?.items || [];
  const visibleSequenceItems = activeSequenceItems;
  const activeSectionRole: PlaylistItem["role"] = activeSequenceSection === "total" ? "lesson" : activeSequenceSection;
  const plannedDurationMs = lessonItems.reduce(
    (total, item) => total + cuePlannedDurationMs(item),
    0,
  );
  const flexibleDurationMs = lessonItems
    .filter((item) => item.flexibleTime)
    .reduce((total, item) => total + cuePlannedDurationMs(item), 0);
  const plannedEnd = lesson.designatedStartAt
    ? new Date(new Date(lesson.designatedStartAt).getTime() + plannedDurationMs)
    : undefined;
  const conflicts = lesson.designatedStartAt
    ? allLessons.filter(
        (other) =>
          other.id !== lesson.id &&
          other.classId === lesson.classId &&
          !other.archived &&
          other.designatedStartAt &&
          intervalsOverlap(
            new Date(lesson.designatedStartAt!),
            plannedEnd || new Date(lesson.designatedStartAt!),
            new Date(other.designatedStartAt),
            new Date(
              new Date(other.designatedStartAt).getTime() +
                lessonPlannedDurationMs(other),
            ),
          ),
      )
    : [];
  const playableMedia = media.filter(
    (item) =>
      (/^(video|audio|image)\//.test(item.contentType) ||
        item.sourceKind === "link") &&
      item.processingStatus === "ready",
  );
  function markDraftDirty() {
    setDraftStatus("dirty");
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      const form = lessonSettingsRef.current;
      if (!form) return;
      const values = Object.fromEntries(new FormData(form));
      try {
        localStorage.setItem(draftKey, JSON.stringify(values));
        setDraftStatus("saved");
        setLocalDraftAvailable(true);
      } catch { /* local storage is optional */ }
    }, 700);
  }
  useEffect(() => () => window.clearTimeout(draftTimer.current), []);
  function restoreLocalDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw || !lessonSettingsRef.current) return;
      const values = JSON.parse(raw) as Record<string, string>;
      for (const [name, value] of Object.entries(values)) {
        const field = lessonSettingsRef.current.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
        if (field && "value" in field) field.value = value;
      }
      setDraftStatus("saved");
      notify("Local lesson draft restored. Save draft to send it to the server.");
    } catch { notify("The local draft could not be restored."); }
  }
  const playableMediaRef = useRef(playableMedia);
  useEffect(() => {
    playableMediaRef.current = playableMedia;
  }, [playableMedia]);
  async function updateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/v1/lessons/${lesson.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title,
          date: values.date,
          designatedStartAt: values.designatedStartAt
            ? new Date(String(values.designatedStartAt)).toISOString()
            : null,
          clearDesignatedStartAt: !values.designatedStartAt,
          preRollStartsAt: values.preRollStartsAt
            ? new Date(String(values.preRollStartsAt)).toISOString()
            : null,
          clearPreRollStartsAt: !values.preRollStartsAt,
          preRollEnabled: values.preRollEnabled === "on",
          volumePercent: Number(values.volumePercent),
          muted: values.muted === "on",
          substituteNotes: values.substituteNotes,
          preRollMonitorUrl: values.preRollMonitorUrl,
          clearPreRollMonitorUrl: !values.preRollMonitorUrl,
          clearCountdown: false,
        }),
      });
      notify("Lesson schedule saved.");
      try { localStorage.removeItem(draftKey); } catch { /* optional */ }
      setLocalDraftAvailable(false);
      setDraftStatus("saved");
      refresh();
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function scheduleLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/v1/lessons/${lesson.id}`, {
        method: "PUT",
        body: JSON.stringify({
          designatedStartAt: values.designatedStartAt ? new Date(String(values.designatedStartAt)).toISOString() : null,
          clearDesignatedStartAt: !values.designatedStartAt,
          preRollStartsAt: values.preRollStartsAt ? new Date(String(values.preRollStartsAt)).toISOString() : null,
          clearPreRollStartsAt: !values.preRollStartsAt,
        }),
      });
      setShowSchedule(false);
      refresh();
      notify(values.designatedStartAt ? "Lesson scheduled." : "Lesson returned to draft timing.");
    } catch (error) { notify(errorText(error)); }
  }
  async function duplicateLesson() {
    try {
      const result = await api<{ id: string }>(`/api/v1/lessons/${lesson.id}/duplicate`, { method: "POST", body: "{}" });
      refresh();
      notify("Lesson duplicated as a new draft one week later.");
      onBack();
      void result;
    } catch (error) { notify(errorText(error)); }
  }
  async function toggleArchiveLesson() {
    try {
      await api(`/api/v1/lessons/${lesson.id}/archive`, { method: "POST", body: "{}" });
      notify(lesson.archived ? "Lesson restored from archive." : "Lesson archived.");
      refresh();
      onBack();
    } catch (error) { notify(errorText(error)); }
  }
  async function deleteLesson() {
    if (!await confirmAction("Move this lesson to the recycling bin? It can be restored for 30 days.", { destructive: true, confirmLabel: "Move to recycling bin" })) return;
    try {
      await api(`/api/v1/lessons/${lesson.id}`, { method: "DELETE" });
      notify("Lesson moved to the recycling bin.");
      refresh();
      onBack();
    } catch (error) { notify(errorText(error)); }
  }
  const selectedCues = items.filter((item) => selectedCueIds.has(item.id));
  const allCuesSelected =
    items.length > 0 && selectedCues.length === items.length;
  async function addAssetToLesson(
    asset: Media,
    role: string,
    title?: FormDataEntryValue | null,
    position?: number,
    typeOverride?: string,
    durationMs?: number,
  ) {
    const type =
      typeOverride ||
      (asset.linkKind === "webpage"
        ? "external"
        : asset.linkKind === "youtube" || asset.linkKind === "embedded"
          ? "web"
          : asset.contentType.startsWith("video")
            ? "video"
            : asset.contentType.startsWith("audio")
              ? "audio"
              : "image");
    const created = await api<{ id: string }>(`/api/v1/lessons/${lesson.id}/items`, {
      method: "POST",
      body: JSON.stringify({
        title: title || asset.fileName,
        type,
        role,
        position: position ?? (items.length + 1) * 1000,
        mediaId: asset.id,
        durationMs: durationMs ?? asset.durationMs,
        startMs: 0,
        endMs: null,
        volumePercent: 100,
        imageDurationSeconds: null,
        estimatedDurationSeconds: null,
        endBehavior: defaultEndBehaviorForRole(role),
        allowSkip: true,
      }),
    });
    setNewCueId(created.id);
    setActiveSequenceSection(role as PlaylistItem["role"]);
    return created;
  }
  async function addActivityToLesson(
    activity: ActivityDefinition,
    role = "lesson",
    position?: number
  ) {
    const created = await api<{ id: string }>(`/api/v1/lessons/${lesson.id}/items`, {
      method: "POST",
      body: JSON.stringify({
        title: activity.name,
        type: "activity",
        role,
        position: position ?? (items.length + 1) * 1000,
        activityDefinitionId: activity.id,
        durationMs: null,
        startMs: 0,
        endMs: null,
        volumePercent: 100,
        imageDurationSeconds: null,
        estimatedDurationSeconds: null,
        endBehavior: defaultEndBehaviorForRole(role),
        allowSkip: true,
      }),
    });
    setNewCueId(created.id);
    setActiveSequenceSection(role as PlaylistItem["role"]);
    setShowAdd(false);
    refresh();
    notify("Activity added to lesson playlist.");
    return created;
  }
  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const asset = playableMedia.find((m) => m.id === values.mediaId);
    if (!asset) return;
    try {
      await addAssetToLesson(asset, String(values.role), values.title);
      setShowAdd(false);
      refresh();
      notify("Media added to the lesson.");
    } catch (e) {
      notify(errorText(e));
    }
  }
  function positionForLibraryDrop(index: number, role?: PlaylistItem["role"]) {
    if (role) {
      const roleItems = items.filter((item) => item.role === role);
      if (roleItems.length) {
        if (index <= 0) return roleItems[0].position - 1000;
        if (index >= roleItems.length) return roleItems[roleItems.length - 1].position + 1000;
        return (roleItems[index - 1].position + roleItems[index].position) / 2;
      }
      const roleIndex = sequenceSections.findIndex((section) => section.role === role);
      const previousItems = sequenceSections
        .slice(0, roleIndex)
        .flatMap((section) => items.filter((item) => item.role === section.role));
      const nextItems = sequenceSections
        .slice(roleIndex + 1)
        .flatMap((section) => items.filter((item) => item.role === section.role));
      const previousPosition = previousItems.length
        ? Math.max(...previousItems.map((item) => item.position))
        : undefined;
      const nextPosition = nextItems.length
        ? Math.min(...nextItems.map((item) => item.position))
        : undefined;
      if (previousPosition != null && nextPosition != null && nextPosition > previousPosition) {
        return (previousPosition + nextPosition) / 2;
      }
      if (previousPosition != null) return previousPosition + 1000;
      if (nextPosition != null) return nextPosition - 1000;
    }
    if (!items.length) return 1000;
    if (index <= 0) return items[0].position - 1000;
    if (index >= items.length) return items[items.length - 1].position + 1000;
    return (items[index - 1].position + items[index].position) / 2;
  }
  async function moveVisible(index: number, delta: number, sequence = visibleSequenceItems) {
    const targetIndex = index + delta;
    if (index < 0 || targetIndex < 0 || targetIndex >= sequence.length) return;
    const reordered = [...items];
    const sourceGlobalIndex = sequence[index].globalIndex;
    const targetGlobalIndex = sequence[targetIndex].globalIndex;
    [reordered[sourceGlobalIndex], reordered[targetGlobalIndex]] = [
      reordered[targetGlobalIndex],
      reordered[sourceGlobalIndex],
    ];
    await api(`/api/v1/lessons/${lesson.id}/reorder`, {
      method: "POST",
      body: JSON.stringify({ itemIds: reordered.map((item) => item.id) }),
    });
    refresh();
  }
  async function addLibraryMedia(asset: Media, index = items.length, roleOverride?: PlaylistItem["role"]) {
    try {
      const role = roleOverride || (activeSequenceSection === "total" ? "lesson" : activeSequenceSection);
      await addAssetToLesson(
        asset,
        role,
        undefined,
        positionForLibraryDrop(index, role),
      );
      refresh();
      notify(
        index < items.length
          ? `${asset.fileName} inserted at position ${index + 1}.`
          : `${asset.fileName} added to the lesson.`,
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  const addLibraryMediaRef = useRef(addLibraryMedia);
  useEffect(() => {
    addLibraryMediaRef.current = addLibraryMedia;
  });
  function libraryDropIndexAtPoint(clientX: number, clientY: number) {
    const target = document.elementFromPoint(clientX, clientY);
    const card = target?.closest<HTMLElement>(".playlist-item");
    const dropZone = target?.closest<HTMLElement>("[data-sequence-role]");
    const role = card?.dataset.sequenceRole || dropZone?.dataset.sequenceRole;
    if (role) libraryDropRoleRef.current = role as PlaylistItem["role"];
    if (!card) return undefined;
    const cardIndex = Number(card.dataset.sequenceIndex);
    if (!Number.isInteger(cardIndex)) return undefined;
    const bounds = card.getBoundingClientRect();
    return clientX < bounds.left + bounds.width / 2 ? cardIndex : cardIndex + 1;
  }
  function beginLibraryPointerDrag(event: ReactPointerEvent<HTMLButtonElement>, asset: Media) {
    if ((event.pointerType === "mouse" && event.button !== 0) || !event.isPrimary) return;
    libraryDropHandledRef.current = false;
    libraryPointerDragRef.current = {
      mediaId: asset.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.draggable = false;
    libraryDropIndexRef.current = items.length;
    libraryDropRoleRef.current = activeSequenceSection === "total" ? undefined : activeSequenceSection;
    setDraggedLibraryMediaId(asset.id);
    setLibraryDropIndex(items.length);
  }
  useEffect(() => {
    if (!draggedLibraryMediaId) return;
    const finishPointerDrag = (event: PointerEvent, cancelled = false) => {
      const drag = libraryPointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const index = libraryDropIndexAtPoint(event.clientX, event.clientY) ?? libraryDropIndexRef.current;
      const asset = playableMediaRef.current.find((item) => item.id === drag.mediaId);
      const shouldDrop = drag.moved && !cancelled && !libraryDropHandledRef.current && asset && index != null;
      const role = libraryDropRoleRef.current;
      libraryPointerDragRef.current = undefined;
      setDraggedLibraryMediaId(undefined);
      libraryDropIndexRef.current = undefined;
      libraryDropRoleRef.current = undefined;
      setLibraryDropIndex(undefined);
      if (shouldDrop) {
        libraryDropHandledRef.current = true;
        suppressLibraryClickUntilRef.current = Date.now() + 500;
        void addLibraryMediaRef.current?.(asset, index, role);
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      const drag = libraryPointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      drag.moved = true;
      event.preventDefault();
      const index = libraryDropIndexAtPoint(event.clientX, event.clientY);
      if (index == null) return;
      libraryDropIndexRef.current = index;
      setLibraryDropIndex(index);
    };
    const handlePointerUp = (event: PointerEvent) => finishPointerDrag(event);
    const handlePointerCancel = (event: PointerEvent) => finishPointerDrag(event, true);
    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [draggedLibraryMediaId]);
  function libraryDragStart(event: ReactDragEvent<HTMLButtonElement>, asset: Media) {
    libraryPointerDragRef.current = undefined;
    libraryDropHandledRef.current = false;
    setDraggedLibraryMediaId(asset.id);
    libraryDropIndexRef.current = items.length;
    libraryDropRoleRef.current = activeSequenceSection === "total" ? undefined : activeSequenceSection;
    setLibraryDropIndex(items.length);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-lessoncue-media-id", asset.id);
    event.dataTransfer.setData("text/plain", asset.id);
  }
  function libraryDragOver(event: ReactDragEvent<HTMLElement>, index: number, roleOverride?: PlaylistItem["role"]) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const card = (event.target as HTMLElement).closest<HTMLElement>(".playlist-item");
    const role = roleOverride || card?.dataset.sequenceRole || (activeSequenceSection === "total" ? undefined : activeSequenceSection);
    if (role) libraryDropRoleRef.current = role as PlaylistItem["role"];
    if (!card) {
      const nextIndex = items.length ? index : 0;
      libraryDropIndexRef.current = nextIndex;
      setLibraryDropIndex(nextIndex);
      return;
    }
    const bounds = card.getBoundingClientRect();
    const nextIndex = event.clientX < bounds.left + bounds.width / 2 ? index : index + 1;
    libraryDropIndexRef.current = nextIndex;
    setLibraryDropIndex(nextIndex);
  }
  async function libraryDrop(event: ReactDragEvent<HTMLElement>, roleOverride?: PlaylistItem["role"]) {
    event.preventDefault();
    if (libraryDropHandledRef.current) return;
    const mediaId =
      event.dataTransfer.getData("application/x-lessoncue-media-id") ||
      event.dataTransfer.getData("text/plain") ||
      draggedLibraryMediaId;
    const asset = playableMedia.find((item) => item.id === mediaId);
    const card = (event.target as HTMLElement).closest<HTMLElement>(".playlist-item");
    const role = roleOverride || card?.dataset.sequenceRole || libraryDropRoleRef.current || (activeSequenceSection === "total" ? undefined : activeSequenceSection);
    let index = libraryDropIndexRef.current ?? libraryDropIndex;
    if (card) {
      const cardIndex = Number(card.dataset.sequenceIndex);
      if (Number.isInteger(cardIndex)) {
        const bounds = card.getBoundingClientRect();
        index = event.clientX < bounds.left + bounds.width / 2 ? cardIndex : cardIndex + 1;
      }
    }
    index ??= items.length;
    libraryDropHandledRef.current = true;
    suppressLibraryClickUntilRef.current = Date.now() + 500;
    libraryPointerDragRef.current = undefined;
    setDraggedLibraryMediaId(undefined);
    libraryDropIndexRef.current = undefined;
    libraryDropRoleRef.current = undefined;
    setLibraryDropIndex(undefined);
    if (asset) await addLibraryMedia(asset, index, role as PlaylistItem["role"] | undefined);
  }
  function libraryDragEnd() {
    libraryPointerDragRef.current = undefined;
    setDraggedLibraryMediaId(undefined);
    libraryDropIndexRef.current = undefined;
    libraryDropRoleRef.current = undefined;
    setLibraryDropIndex(undefined);
  }
  async function uploadAndAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const files = form
      .getAll("files")
      .filter((item): item is File => item instanceof File && item.size > 0);
    if (!files.length) return;
    const role = String(form.get("role") || "lesson");
    const slideDurationValue = form.get("slideSeconds");
    const slideDuration =
      typeof slideDurationValue === "string" && slideDurationValue.trim()
        ? Number(slideDurationValue)
        : null;
    if (role === "countdown" && files.length > 1) {
      notify(
        "Choose one file when adding a countdown; a lesson can have only one countdown.",
      );
      return;
    }
    const presentationFiles = files.filter((file) =>
      isPresentationFileName(file.name),
    );
    if (presentationFiles.length && role !== "lesson") {
      notify(
        "Imported presentation slides are added as main lesson cues. Choose Main lesson and try again.",
      );
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const persistent = form.get("storagePolicy") === "persistent";
      const tagsCsv = formTags(form);
      let completed = 0;
      for (const file of files) {
        const asset = await uploadMediaFile(file, {
          persistent,
          lessonId: persistent ? undefined : lesson.id,
          folder: String(form.get("folder") || ""),
          tagsCsv,
          onProgress: (percent) =>
            setUploadProgress(
              Math.round(((completed + percent / 100) / files.length) * 100),
            ),
          onControlReady: (control) => {
            setUploadControl(control);
            if (!control) setUploadPaused(false);
          },
        });
        if (isConvertibleDocument(asset)) {
          await api(`/api/v1/media/${asset.id}/convert-and-add-to-lesson`, {
            method: "POST",
            body: JSON.stringify({
              lessonId: lesson.id,
              imageDurationSeconds: Number.isFinite(slideDuration) ? slideDuration : null,
            }),
          });
        } else {
          const customTitle = files.length === 1 ? form.get("title") : null;
          await addAssetToLesson(
            asset,
            role,
            customTitle,
            (items.length + completed + 1) * 1000,
          );
        }
        completed++;
        setUploadProgress(Math.round((completed / files.length) * 100));
      }
      setShowAdd(false);
      refresh();
      notify(
        presentationFiles.length
          ? `${presentationFiles.length} presentation${presentationFiles.length === 1 ? "" : "s"} queued for local slide conversion; the slides will appear in this lesson automatically.`
          : persistent
            ? `${files.length} file${files.length === 1 ? "" : "s"} uploaded permanently and added to the lesson.`
            : `${files.length} file${files.length === 1 ? "" : "s"} added. ${files.length === 1 ? "It" : "They"} will be deleted four weeks after ${formatDate(lesson.date)}.`,
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }
  async function addOnline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const doNotDownload = form.get("doNotDownload") === "on";
    const download = onlineMode === "download" && !doNotDownload;
    const importPresentation = onlineMode === "slides";
    const slideDurationValue = form.get("slideSeconds");
    const slideDuration =
      typeof slideDurationValue === "string" && slideDurationValue.trim()
        ? Number(slideDurationValue)
        : null;
    setUploading(true);
    try {
      const persistent =
        onlineMode === "online" || form.get("storagePolicy") === "persistent";
      const asset = await api<Media>("/api/v1/media/link", {
        method: "POST",
        body: JSON.stringify({
          url: form.get("url"),
          title: form.get("title") || null,
          download,
          importPresentation,
          persistent,
          lessonId: persistent ? null : lesson.id,
          folder: form.get("folder"),
          tagsCsv: formTags(form),
        }),
      });
      if (importPresentation)
        await api(`/api/v1/media/${asset.id}/convert-and-add-to-lesson`, {
          method: "POST",
          body: JSON.stringify({
            lessonId: lesson.id,
            imageDurationSeconds: Number.isFinite(slideDuration) ? slideDuration : null,
          }),
        });
      else
        await addAssetToLesson(
          asset,
          download ? String(form.get("role") || "lesson") : "lesson",
          form.get("title"),
        );
      setShowAdd(false);
      refresh();
      notify(
        download
          ? "YouTube download queued. It will become offline-ready after processing."
          : importPresentation
            ? "Google Slides imported; converted slides will appear in this lesson automatically."
            : "Online media added to the lesson.",
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setUploading(false);
    }
  }

  async function addAudiencePoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sessionId = String(form.get("audienceSessionId") || "");
    if (!sessionId) return;
    const showResults = form.get("showResults") === "on";
    const resultDelaySeconds = showResults
      ? Number(form.get("resultDelaySeconds") || 0)
      : 0;
    setUploading(true);
    try {
      const asset = await api<Media>(`/api/v1/audience/admin/sessions/${sessionId}/display-media`, {
        method: "POST",
        body: JSON.stringify({ showResults, resultDelaySeconds }),
      });
      await addAssetToLesson(
        asset,
        "lesson",
        form.get("title") || asset.fileName,
        undefined,
        "audience",
        Number(form.get("durationSeconds") || 60) * 1000,
      );
      setShowAdd(false);
      refresh();
      notify("Audience poll added to the lesson.");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setUploading(false);
    }
  }
  async function changeItem(
    item: PlaylistItem,
    changes: Record<string, unknown>,
  ) {
    try {
      await api(`/api/v1/playlist-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      refresh();
      notify("Playlist saved.");
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function removeItem(id: string) {
    if (
      !await confirmAction(
        "Remove this item from the playlist? The media file will remain in your library.",
        { destructive: true, confirmLabel: "Remove from playlist" },
      )
    )
      return;
    await api(`/api/v1/playlist-items/${id}`, { method: "DELETE" });
    refresh();
  }
  function toggleCue(id: string) {
    setSelectedCueIds((value) => {
      const next = new Set(value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllCues() {
    setSelectedCueIds(
      allCuesSelected ? new Set() : new Set(items.map((item) => item.id)),
    );
  }
  async function applyCueBulk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCues.length) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (
      cueBulkAction === "delete" &&
      !await confirmAction(
        `Remove ${selectedCues.length} selected cue${selectedCues.length === 1 ? "" : "s"} from this lesson? Media files remain in the library.`,
        { destructive: true, confirmLabel: "Remove cues" },
      )
    )
      return;
    setCueBulkBusy(true);
    try {
      await api("/api/v1/playlist-items/bulk", {
        method: "POST",
        body: JSON.stringify({
          itemIds: selectedCues.map((item) => item.id),
          action: cueBulkAction,
          role: cueBulkAction === "role" ? values.role : null,
          volumePercent:
            cueBulkAction === "volume" ? Number(values.volumePercent) : null,
          endBehavior:
            cueBulkAction === "end-behavior" ? values.endBehavior : null,
          allowSkip:
            cueBulkAction === "allow-skip" ? values.allowSkip === "true" : null,
          titlePrefix:
            cueBulkAction === "prefix-title" ? values.titlePrefix : null,
        }),
      });
      setSelectedCueIds(new Set());
      refresh();
      notify(
        `${selectedCues.length} playlist cue${selectedCues.length === 1 ? "" : "s"} updated.`,
      );
    } catch (error) {
      notify(errorText(error));
    } finally {
      setCueBulkBusy(false);
    }
  }
  async function relocateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api<{ id: string }>(`/api/v1/lessons/${lesson.id}/relocate`, {
        method: "POST",
        body: JSON.stringify({
          action: relocateAction,
          classId: values.classId,
          date: values.date,
          title: values.title,
        }),
      });
      setShowRelocate(false);
      refresh();
      notify(
        relocateAction === "copy"
          ? "Lesson copied with its complete run of show."
          : "Lesson moved to the selected class and date.",
      );
      if (relocateAction === "move") onBack();
    } catch (error) {
      notify(errorText(error));
    }
  }
  function renderSequenceItems(entries: typeof visibleSequenceItems, role: PlaylistItem["role"]) {
    return entries.map(({ item }, index) => (
      <PlaylistCueRow
        key={item.id}
        item={item}
        media={media.find((asset) => asset.id === item.mediaAssetId)}
        index={index}
        sequenceIndex={index}
        total={entries.length}
        dropEdge={
          libraryDropIndex === index
            ? "before"
            : index === entries.length - 1 && libraryDropIndex === index + 1
              ? "after"
              : undefined
        }
        selected={selectedCueIds.has(item.id)}
        highlighted={newCueId === item.id}
        onSelected={() => toggleCue(item.id)}
        onMove={(rowIndex, delta) => moveVisible(rowIndex, delta, entries)}
        onChange={changeItem}
        onTimeline={() => setPreviewItem(item)}
        onRemove={removeItem}
        onLibraryDragOver={(event) => libraryDragOver(event, index, role)}
        onLibraryDrop={(event) => libraryDrop(event, role)}
      />
    ));
  }
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {newCueId
          ? `${lesson.items.find((item) => item.id === newCueId)?.title || "Media"} added to the ${roleName(lesson.items.find((item) => item.id === newCueId)?.role || "lesson")} section.`
          : ""}
      </p>
      <button className="back-button" onClick={onBack}>
        ← Back to {lesson.className}
      </button>
      <PageHead
        eyebrow="LESSON BUILDER"
        title={lesson.title}
        detail={`${formatDate(lesson.date)} · Manifest version ${lesson.version}`}
        action={
          <div className="page-actions">
            <button className="button primary" onClick={() => onPresentNow?.(lesson)} disabled={!onPresentNow}>
              ▶ Present now
            </button>
            <button className="button" onClick={() => setShowSchedule(true)}>
              Schedule
            </button>
            <button className="button" onClick={() => setShowRunSheet(true)}>
              Print run sheet
            </button>
            <button className="button" onClick={() => void duplicateLesson()}>
              Duplicate
            </button>
            <button className="button" aria-label="Copy or move" onClick={() => setShowRelocate(true)}>
              Move / copy to room
            </button>
            <button className="button" onClick={toggleArchiveLesson}>
              {lesson.archived ? "Restore" : "Archive"}
            </button>
            <button className="button danger" onClick={() => void deleteLesson()}>
              Delete
            </button>
            {canUpload && (
              <button
                className="button primary"
                onClick={() => {
                  setAddMode("chooser");
                  setShowAdd(true);
                }}
              >
                Add media
              </button>
            )}
          </div>
        }
      />
      <section className="panel plays-where-summary" aria-label="Plays where">
        <div>
          <span className="section-label">PLAYS WHERE</span>
          <strong>{lesson.className}</strong>
          <small>
            {assignedScreens.length
              ? assignedScreens.map((screen) => screen.name).join(", ")
              : "No screen is currently assigned to this class."}
          </small>
        </div>
        {onNavigateScreens && (
          <button className="button" type="button" onClick={onNavigateScreens}>
            Review screen assignments
          </button>
        )}
      </section>
      {showAdd && canUpload && (
        <Modal
          title={addMode === "chooser" ? "Add media to the lesson" : addMode === "upload" ? "Upload new media" : addMode === "poll" ? "Add an audience poll" : addMode === "activity" ? "Add an interactive activity or game" : addMode === "online" ? "Add online media or slides" : "Choose existing media"}
          onClose={() => { if (!uploading) { setShowAdd(false); setAddMode("chooser"); } }}
        >
          {addMode === "chooser" ? (
            <div className="add-media-chooser">
              <button className="add-media-choice" onClick={() => setAddMode("upload")}>
                <strong>Upload new media</strong>
                <span>Select files from this computer. Presentations are converted locally.</span>
              </button>
              <button className="add-media-choice" onClick={async () => {
                try {
                  const list = await ActivityApi.listActivities();
                  setAvailableActivities(list);
                  if (list.length > 0) setSelectedActivityId(list[0].id);
                  setAddMode("activity");
                } catch (err) {
                  notify(errorText(err));
                }
              }}>
                <strong>🎪 Interactive Activity or Game</strong>
                <span>Add a spin wheel, scoreboard, random picker, prize grid, or trivia quiz.</span>
              </button>
              <button className="add-media-choice" onClick={() => setAddMode("poll")}>
                <strong>Add an audience poll</strong>
                <span>Show a voting QR code and live poll state as a lesson cue.</span>
              </button>
              <button className="add-media-choice" onClick={() => setAddMode("online")}>
                <strong>Add online media or slides</strong>
                <span>Play or download YouTube, show a webpage, or import Google Slides.</span>
              </button>
              {playableMedia.length > 0 && (
                <button className="add-media-choice" onClick={() => setAddMode("existing")}>
                  <strong>Choose existing media</strong>
                  <span>Add media already in your library to this lesson.</span>
                </button>
              )}
            </div>
          ) : (
            <div className="add-media-options">
              <button className="add-media-back" onClick={() => setAddMode("chooser")} disabled={uploading}>
                ← Back to media choices
              </button>
              {addMode === "upload" && (
                <section>
                  <h3>Upload from this computer</h3>
                  <p>
                    Select one file or add a complete group in order without leaving
                    this lesson. Presentations are converted locally and their
                    slides appear automatically.{" "}
                    {storage &&
                      `${formatBytes(storage.remainingBytes)} remains available.`}
                  </p>
                  <form className="stack" onSubmit={uploadAndAdd}>
                    <Field
                      label="Media files"
                      hint="Supports video, audio, images, PDF, PowerPoint, OpenDocument, Keynote, and Word."
                    >
                      <input
                        name="files"
                        type="file"
                        multiple
                        accept={mediaFormats?.accept}
                        required
                        disabled={uploading}
                      />
                    </Field>
                    <RetentionChoices lessonDate={lesson.date} />
                    <TaxonomyFields taxonomy={taxonomy} />
                    <div className="two-fields">
                      <Field label="Playlist role">
                        <select name="role">
                          <option value="lesson">Main lesson</option>
                          <option value="preRoll">Pre-roll loop</option>
                          <option value="countdown">Countdown video (one file)</option>
                          <option value="postLesson">Post-lesson loop</option>
                        </select>
                      </Field>
                      <Field label="Display title" hint="Used only when one non-presentation file is selected.">
                        <input name="title" placeholder="Use filename" />
                      </Field>
                    </div>
                    <Field label="Time each imported slide" hint="Optional. Leave blank to keep each slide untimed until the remote queues the next cue.">
                      <input name="slideSeconds" type="number" min="1" max="3600" placeholder="Untimed" />
                    </Field>
                    <button type="submit" className="button primary" disabled={uploading}>
                      {uploading ? `Uploading ${uploadProgress}%` : "Upload and add"}
                    </button>
                    {uploading && uploadControl && (
                      <div className="button-row upload-controls">
                        <button type="button" className="button" onClick={async () => {
                          if (uploadPaused) { await uploadControl.resume(); setUploadPaused(false); }
                          else { await uploadControl.pause(); setUploadPaused(true); }
                        }}>{uploadPaused ? "Resume upload" : "Pause upload"}</button>
                        <button type="button" className="button danger" onClick={() => void uploadControl.cancel()}>Cancel upload</button>
                      </div>
                    )}
                    {uploadPaused && (
                      <div className="alert">Upload paused. Received chunks and reserved storage are kept for 24 hours.</div>
                    )}
                  </form>
                </section>
              )}
              {addMode === "poll" && (
                <section>
                  <h3>Add an audience poll</h3>
                  <p>Show a voting QR code and live poll state as a cue in this lesson. Open and manage responses from Audience.</p>
                  {audiencePolls.length ? (
                    <form className="stack" onSubmit={addAudiencePoll}>
                      <Field label="Audience poll">
                        <select name="audienceSessionId" required>
                          {audiencePolls.map((poll) => (
                            <option key={poll.id} value={poll.id}>{poll.title} · {poll.status} · {poll.code}</option>
                          ))}
                        </select>
                      </Field>
                      <div className="two-fields">
                        <Field label="Display title"><input name="title" placeholder="Use poll title" /></Field>
                        <Field label="Planned duration" hint="The cue can still be advanced manually.">
                          <input name="durationSeconds" type="number" min="5" max="3600" defaultValue="60" />
                        </Field>
                      </div>
                      <div className="two-fields">
                        <Field label="Results on screen">
                          <label className="check-line"><input name="showResults" type="checkbox" defaultChecked />Show results when the poll permits them</label>
                        </Field>
                        <Field label="Result timing" hint="The delay is not identified on the displayed poll.">
                          <select name="resultDelaySeconds" defaultValue="0">
                            <option value="0">Real time</option>
                            <option value="15">15-second delay</option>
                            <option value="30">30-second delay</option>
                            <option value="60">1-minute delay</option>
                            <option value="120">2-minute delay</option>
                            <option value="300">5-minute delay</option>
                          </select>
                        </Field>
                      </div>
                      <button className="button primary" disabled={uploading}>
                        {uploading ? "Adding…" : "Add audience poll"}
                      </button>
                    </form>
                  ) : (
                    <p className="field-help">Create an audience poll first, then return here to add it.</p>
                  )}
                </section>
              )}
              {addMode === "online" && (
                <section>
                  <h3>Add online media or slides</h3>
                  <p>Show a webpage, play or download YouTube, or import a shared Google Slides deck as local slide images.</p>
                  <form className="stack" onSubmit={addOnline}>
                    <Field label={onlineMode === "slides" ? "Google Slides share URL" : "Webpage or YouTube URL"}
                      hint={onlineMode === "slides" ? "Share the deck so anyone with the link can view it." : undefined}>
                      <input name="url" type="url" required placeholder="https://…" disabled={uploading} />
                    </Field>
                    <fieldset className="retention-options">
                      <legend>How should LessonCue use it?</legend>
                      <label><input type="radio" checked={onlineMode === "online"} onChange={() => setOnlineMode("online")} />
                        <span><strong>Play online</strong><small>YouTube uses an embedded player; other URLs display as webpages.</small></span></label>
                      <label><input type="radio" checked={onlineMode === "download"} onChange={() => setOnlineMode("download")} />
                        <span><strong>Download YouTube locally</strong><small>Use only for video you are authorized to copy. Processing continues in the background.</small></span></label>
                      <label><input type="radio" checked={onlineMode === "slides"} onChange={() => setOnlineMode("slides")} />
                        <span><strong>Import Google Slides</strong><small>Download a PDF copy and add converted slides automatically.</small></span></label>
                    </fieldset>
                    {onlineMode !== "online" && <RetentionChoices lessonDate={lesson.date} />}
                    {onlineMode !== "slides" && (
                      <label><input type="checkbox" name="doNotDownload" />
                        <span><strong>Do not download locally</strong><small>Keep this entry online-only (metadata only).</small></span></label>
                    )}
                    <TaxonomyFields taxonomy={taxonomy} />
                    <div className="two-fields">
                      {onlineMode === "download" && (
                        <Field label="Playlist role">
                          <select name="role"><option value="lesson">Main lesson</option><option value="preRoll">Pre-roll loop</option><option value="countdown">Countdown video</option><option value="postLesson">Post-lesson loop</option></select>
                        </Field>
                      )}
                      <Field label="Display title">
                        <input name="title" maxLength={240} placeholder={onlineMode === "download" ? "YouTube video" : onlineMode === "slides" ? "Presentation title" : "Use website name"} />
                      </Field>
                      {onlineMode === "slides" && <Field label="Time each slide" hint="Optional; blank keeps imported slides untimed."><input name="slideSeconds" type="number" min="1" max="3600" placeholder="Untimed" /></Field>}
                    </div>
                    <button className="button primary" disabled={uploading}>
                      {uploading ? "Adding…" : onlineMode === "download" ? "Queue download and add" : onlineMode === "slides" ? "Import slides and add" : "Add online media"}
                    </button>
                  </form>
                </section>
              )}
              {addMode === "activity" && (
                <section>
                  <h3>Add interactive activity or game</h3>
                  <p>Choose an activity from your Activities Studio library to add as a cue in this lesson.</p>
                  {availableActivities.length === 0 ? (
                    <div style={{ padding: "1.5rem", background: "var(--mint)", borderRadius: "12px", textAlign: "center", border: "1px solid var(--line)" }}>
                      <p style={{ margin: "0 0 1rem", color: "var(--muted)" }}>
                        No activities created yet in the Activities Studio.
                      </p>
                      <button
                        type="button"
                        className="button primary"
                        onClick={async () => {
                          try {
                            const created = await ActivityApi.createActivity({
                              name: "Spin the Wheel",
                              type: "wheel",
                              description: "Customizable spin wheel game",
                              config: {
                                title: "Spin Wheel",
                                items: [
                                  { id: "1", label: "Prize 1", weight: 1 },
                                  { id: "2", label: "Prize 2", weight: 1 },
                                  { id: "3", label: "Prize 3", weight: 1 },
                                  { id: "4", label: "Prize 4", weight: 1 }
                                ],
                                removeWinner: true
                              }
                            });
                            await addActivityToLesson(created);
                          } catch (err) {
                            notify(errorText(err));
                          }
                        }}
                      >
                        ✨ Create Default Spin Wheel & Add
                      </button>
                    </div>
                  ) : (
                    <form
                      className="stack"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const target = availableActivities.find((a) => a.id === selectedActivityId) || availableActivities[0];
                        if (target) {
                          const formData = new FormData(e.currentTarget);
                          const role = String(formData.get("role") || "lesson");
                          await addActivityToLesson(target, role);
                        }
                      }}
                    >
                      <Field label="Choose activity">
                        <select
                          value={selectedActivityId}
                          onChange={(e) => setSelectedActivityId(e.target.value)}
                          required
                        >
                          {availableActivities.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.type})
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Playlist role">
                        <select name="role">
                          <option value="lesson">Main lesson</option>
                          <option value="preRoll">Pre-roll loop</option>
                          <option value="countdown">Countdown video</option>
                          <option value="postLesson">Post-lesson loop</option>
                        </select>
                      </Field>
                      <button type="submit" className="button primary">
                        Add activity to lesson
                      </button>
                    </form>
                  )}
                </section>
              )}
              {addMode === "existing" && playableMedia.length > 0 && (
                <section>
                  <h3>Choose existing media</h3>
                  <form className="stack" onSubmit={addItem}>
                    <Field label="Ready media">
                      <select name="mediaId" required>
                        {playableMedia.map((m) => (<option key={m.id} value={m.id}>{m.fileName}</option>))}
                      </select>
                    </Field>
                    <div className="two-fields">
                      <Field label="Playlist role">
                        <select name="role"><option value="lesson">Main lesson</option><option value="preRoll">Pre-roll loop</option><option value="countdown">Countdown video</option><option value="postLesson">Post-lesson loop</option></select>
                      </Field>
                      <Field label="Display title"><input name="title" placeholder="Use media filename" /></Field>
                    </div>
                    <button className="button">Add existing media</button>
                  </form>
                </section>
              )}
          </div>
          )}
        </Modal>
      )}
      {previewItem && (
        <Modal
          title={`Visual timeline & fades: ${previewItem.title}`}
          onClose={() => setPreviewItem(undefined)}
        >
          <TimelineEditor
            item={previewItem}
            media={media.find((asset) => asset.id === previewItem.mediaAssetId)}
            onSave={(changes) => changeItem(previewItem, changes)}
          />
        </Modal>
      )}
      {showRunSheet && (
        <Modal
          title={`Run sheet: ${lesson.title}`}
          onClose={() => setShowRunSheet(false)}
        >
          <LessonRunSheet lesson={lesson} />
          <div className="modal-actions no-print">
            <button className="button" onClick={() => setShowRunSheet(false)}>
              Close
            </button>
            <button className="button primary" onClick={() => window.print()}>
              Print run sheet
            </button>
          </div>
        </Modal>
      )}
      {showRelocate && (
        <Modal
          title="Copy or move lesson"
          onClose={() => setShowRelocate(false)}
        >
          <form className="stack" onSubmit={relocateLesson}>
            <fieldset className="retention-options">
              <legend>What should happen?</legend>
              <label>
                <input
                  type="radio"
                  checked={relocateAction === "copy"}
                  onChange={() => setRelocateAction("copy")}
                />
                <span>
                  <strong>Copy lesson</strong>
                  <small>
                    Keep the original and duplicate its complete playlist,
                    notes, and timing.
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  checked={relocateAction === "move"}
                  onChange={() => setRelocateAction("move")}
                />
                <span>
                  <strong>Move lesson</strong>
                  <small>
                    Move this lesson and shift its scheduled times to the new
                    date.
                  </small>
                </span>
              </label>
            </fieldset>
            <div className="two-fields">
              <Field label="Destination class">
                <select name="classId" defaultValue={lesson.classId} required>
                  {classes.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Destination date">
                <input
                  name="date"
                  type="date"
                  defaultValue={lesson.date}
                  required
                />
              </Field>
            </div>
            <Field label="Lesson title">
              <input
                name="title"
                defaultValue={
                  relocateAction === "copy"
                    ? `${lesson.title} copy`
                    : lesson.title
                }
                maxLength={160}
                required
                key={relocateAction}
              />
            </Field>
            <button className="button primary">
              {relocateAction === "copy" ? "Create copy" : "Move lesson"}
            </button>
          </form>
        </Modal>
      )}
      {showSchedule && (
        <Modal title="Schedule this lesson" onClose={() => setShowSchedule(false)}>
          <form className="stack" onSubmit={scheduleLesson}>
            <p className="settings-copy">Choose when the room should begin this lesson. Leave the start blank to keep it as a draft.</p>
            <Field label="Class start">
              <input name="designatedStartAt" type="datetime-local" defaultValue={toLocalInput(lesson.designatedStartAt)} autoFocus />
            </Field>
            <Field label="Pre-roll begins" hint="Optional. Screens loop pre-roll until the countdown or class start.">
              <input name="preRollStartsAt" type="datetime-local" defaultValue={toLocalInput(lesson.preRollStartsAt)} />
            </Field>
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setShowSchedule(false)}>Cancel</button>
              <button className="button primary">Save schedule</button>
            </div>
          </form>
        </Modal>
      )}
      <section className="panel schedule-panel lesson-settings-top">
        <div className="lesson-settings-heading">
          <div>
            <span className="section-label">LESSON DETAILS</span>
            <h2>Lesson settings</h2>
            <p>Set the schedule and handoff details while you build the run of show below.</p>
          </div>
          <span className="lesson-settings-status">
            {items.length} cue{items.length !== 1 ? "s" : ""} · {formatFriendlyDuration(plannedDurationMs)}
          </span>
        </div>
        {localDraftAvailable && (
          <div className="lesson-draft-banner" role="status">
            <span>↻ A local draft is available for this lesson.</span>
            <button type="button" className="text-button" onClick={restoreLocalDraft}>Restore local draft</button>
          </div>
        )}
        <div className="lesson-autosave-state" role="status" aria-live="polite">
          {draftStatus === "dirty" ? "Unsaved changes — saving a local draft…" : draftStatus === "saved" ? "✓ Local draft saved" : "Autosave protects changes made on this device"}
        </div>
        <form ref={lessonSettingsRef} className="stack lesson-settings-form" onInput={markDraftDirty} onSubmit={updateLesson}>
          <div className="lesson-settings-fields lesson-settings-primary">
            <Field label="Lesson title">
              <input name="title" defaultValue={lesson.title} required autoFocus />
            </Field>
            <Field label="Lesson date">
              <input name="date" type="date" defaultValue={lesson.date} required />
            </Field>
            <Field
              label="Designated class start"
              hint="Countdown begins one countdown-video duration before this time."
            >
              <input
                name="designatedStartAt"
                type="datetime-local"
                defaultValue={toLocalInput(lesson.designatedStartAt)}
              />
            </Field>
          </div>
          <details className="lesson-option-disclosure">
            <summary>
              <span>
                <strong>Transition Options</strong>
                <small>Pre-roll, countdown, and handoff timing</small>
              </span>
              <b aria-hidden="true">⌄</b>
            </summary>
            <div className="lesson-option-body">
              <Field
                label="Pre-roll begins"
                hint="Screens auto-start looping pre-roll at this time."
              >
                <input
                  name="preRollStartsAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(lesson.preRollStartsAt)}
                />
              </Field>
              <div className="run-timing-summary">
                <div>
                  <span>ESTIMATED RUN TIME</span>
                  <strong>{formatFriendlyDuration(plannedDurationMs)}</strong>
                  <small>{flexibleDurationMs ? `${formatFriendlyDuration(flexibleDurationMs)} marked flexible` : "No flexible-time cues"}</small>
                </div>
                <div>
                  <span>PLANNED FINISH</span>
                  <strong>{plannedEnd ? plannedEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Set a start time"}</strong>
                  <small>{lessonItems.some((item) => cuePlannedDurationMs(item) === 0) ? "Unknown-duration cues not included" : `${lessonItems.length} main cues`}</small>
                </div>
              </div>
              {plannedEnd && plannedEnd.getTime() < Date.now() && (
                <div className="alert warning">This lesson's planned finish has passed.</div>
              )}
              {conflicts.length > 0 && (
                <div className="alert error"><strong>Schedule conflict:</strong> {conflicts.map((item) => `${item.className} — ${item.title}`).join(", ")} overlaps this lesson's estimated window.</div>
              )}
              <div className="timing-explain">
                <span>◷</span>
                <div>
                  <strong>{countdown && lesson.designatedStartAt ? `Countdown begins ${formatDuration(countdown.durationMs || countdown.mediaDurationMs)} before class` : "Countdown is optional"}</strong>
                  <p>Assign one video as the countdown. Its duration determines when it starts automatically.</p>
                </div>
              </div>
            </div>
          </details>
          <details className="lesson-option-disclosure">
            <summary>
              <span>
                <strong>Playback Options</strong>
                <small>Audio, pre-roll monitoring, and teacher handoff</small>
              </span>
              <b aria-hidden="true">⌄</b>
            </summary>
            <div className="lesson-option-body">
              <div className="lesson-settings-fields lesson-playback-fields">
                <Field label="Optional pre-roll livestream monitor" hint="Phone-controller camera or stream page during pre-roll.">
                  <input name="preRollMonitorUrl" type="url" maxLength={2000} defaultValue={lesson.preRollMonitorUrl || ""} placeholder="https://camera.example.org/view" />
                </Field>
                <div className="lesson-settings-controls">
                  <Field label="Whole-lesson volume">
                    <div className="unit-input">
                      <input name="volumePercent" type="number" min="0" max="150" defaultValue={lesson.volumePercent ?? 100} />
                      <span>%</span>
                    </div>
                  </Field>
                  <label className="check-card">
                    <input type="checkbox" name="muted" defaultChecked={lesson.muted} />
                    <span><strong>Mute</strong><small>All cues silent</small></span>
                  </label>
                  <label className="switch-row">
                    <input type="checkbox" name="preRollEnabled" defaultChecked={lesson.preRollEnabled} />
                    <span />
                    <div>
                      <strong>Enable pre-roll</strong>
                      <small>Loop until countdown or class begins.</small>
                    </div>
                  </label>
                </div>
              </div>
              <div className="lesson-settings-notes">
                <Field
                  label="Substitute or teacher instructions"
                  hint="Shown on the phone controller and printed run sheet."
                >
                  <textarea name="substituteNotes" rows={3} maxLength={8000} defaultValue={lesson.substituteNotes} placeholder="Room setup, handoff details, or what a substitute should know" />
                </Field>
              </div>
            </div>
          </details>
          <div className="lesson-settings-actions">
            <button className="button primary" aria-label="Save lesson settings" title="Save draft">Save draft</button>
          </div>
        </form>
      </section>
      <section className="panel lesson-compact-timeline" aria-label="Compact lesson timeline">
        <div className="panel-heading">
          <div><span className="section-label">AT A GLANCE</span><h2>Lesson timeline</h2><p>Check the room's order and timing before presenting.</p></div>
          <strong>{formatFriendlyDuration(plannedDurationMs)}</strong>
        </div>
        <div className="lesson-timeline-track">
          {items.map((item) => {
            const duration = Math.max(1, cuePlannedDurationMs(item));
            const width = Math.max(5, Math.round((duration / Math.max(1, plannedDurationMs)) * 100));
            return <button type="button" key={item.id} className={`lesson-timeline-segment ${item.role}`} style={{ flex: `${width} 1 0%` }} onClick={() => { setActiveSequenceSection(item.role); setNewCueId(item.id); }} title={`${item.title} · ${cueDurationLabel(item)}`}><span>{item.title}</span></button>;
          })}
        </div>
      </section>
      <section className="panel playlist-panel playlist-panel-wide lesson-playlist-workspace">
        <div className="panel-heading">
          <div>
            <span className="section-label">PLAYLIST BUILDER</span>
            <h2>Playback sequence</h2>
            <p>Arrange pre-roll, countdown, main lesson, and post-lesson media in the order the room will see it.</p>
          </div>
          <div className="playlist-heading-actions">
            <span className="pill">{items.length} items</span>
            <button className="button primary" onClick={() => { setAddMode("chooser"); setShowAdd(true); }}>
              ＋ Add media
            </button>
          </div>
        </div>
        {selectedCues.length > 0 && (
          <form className="cue-bulk-actions" onSubmit={applyCueBulk}>
            <strong>{selectedCues.length} selected</strong>
            <select aria-label="Bulk cue action" value={cueBulkAction} onChange={(event) => setCueBulkAction(event.target.value)}>
              <option value="role">Set role</option>
              <option value="volume">Set volume</option>
              <option value="end-behavior">Set end behavior</option>
              <option value="allow-skip">Set skipping</option>
              <option value="prefix-title">Add title prefix</option>
              <option value="delete">Remove cues</option>
            </select>
            {cueBulkAction === "role" && (
              <select name="role" aria-label="Role for selected cues">
                <option value="lesson">Main lesson</option>
                <option value="preRoll">Pre-roll</option>
                {selectedCues.length === 1 && <option value="countdown">Countdown</option>}
                <option value="postLesson">Post-lesson loop</option>
              </select>
            )}
            {cueBulkAction === "volume" && <label>Volume <input name="volumePercent" type="number" min="0" max="150" required defaultValue="100" />%</label>}
            {cueBulkAction === "end-behavior" && <select name="endBehavior" aria-label="End behavior"><option value="pause">Pause at last frame</option><option value="advance">Play next cue</option><option value="loop">Loop continuously</option><option value="stop">Stop playback</option></select>}
            {cueBulkAction === "allow-skip" && <select name="allowSkip" aria-label="Skipping"><option value="true">Allow skip</option><option value="false">Do not allow skip</option></select>}
            {cueBulkAction === "prefix-title" && <input name="titlePrefix" maxLength={80} required placeholder="Title prefix" aria-label="Prefix for cue titles" />}
            <button className={`button ${cueBulkAction === "delete" ? "danger" : "primary"}`} disabled={cueBulkBusy}>{cueBulkBusy ? "Applying…" : "Apply"}</button>
            <button className="button" type="button" onClick={() => setSelectedCueIds(new Set())}>Clear</button>
          </form>
        )}
        <>
          <div className="lesson-sequence-tabs" role="tablist" aria-label="Playback sections">
            {sequenceSections.map((section) => {
              const count = items.filter((item) => item.role === section.role).length;
              return (
                <button
                  type="button"
                  key={section.role}
                  role="tab"
                  aria-selected={activeSequenceSection === section.role}
                  className={`sequence-tab section-${section.role} ${activeSequenceSection === section.role ? "active" : ""}`}
                  onClick={() => setActiveSequenceSection(section.role)}
                >
                  {section.label} ({count}){section.loop ? " (loop)" : ""}
                </button>
              );
            })}
            <button
              type="button"
              role="tab"
              aria-selected={activeSequenceSection === "total"}
              className={`sequence-tab section-total ${activeSequenceSection === "total" ? "active" : ""}`}
              onClick={() => setActiveSequenceSection("total")}
            >
              Total ({items.length})
            </button>
          </div>
          <label className="playlist-select-all">
            <input type="checkbox" checked={allCuesSelected} onChange={toggleAllCues} /> Select all cues
          </label>
          {activeSequenceSection === "total" ? (
            <div
              className={`lesson-total-sequence ${draggedLibraryMediaId ? "is-library-dragging" : ""}`}
              aria-label="Total playback sequence grouped by section"
            >
              {sequenceGroups.map((group) => (
                <section
                  key={group.role}
                  className={`lesson-sequence-group section-${group.role} ${group.items.length ? "has-items" : "is-empty"}`}
                  data-sequence-role={group.role}
                  aria-label={`${group.label} playback section`}
                >
                  {group.items.length ? (
                    <div
                      className={`playlist lesson-playlist-track section-${group.role} ${draggedLibraryMediaId ? "is-library-dragging" : ""}`}
                      aria-label={`${group.label} playback sequence`}
                      onDragOver={(event) => {
                        if (!(event.target as HTMLElement).closest(".playlist-item")) {
                          libraryDragOver(event, group.items.length, group.role);
                        }
                      }}
                      onDrop={(event) => libraryDrop(event, group.role)}
                    >
                      {renderSequenceItems(group.items, group.role)}
                    </div>
                  ) : (
                    <section
                      className={`lesson-empty-drop-target ${draggedLibraryMediaId ? "is-library-dragging" : ""} ${libraryDropIndex === 0 ? "is-drop-ready" : ""}`}
                      data-sequence-role={group.role}
                      aria-label={`Drop media into empty ${group.label} section`}
                      title={`Drop media into ${group.label}`}
                      onDragOver={(event) => libraryDragOver(event, 0, group.role)}
                      onDrop={(event) => libraryDrop(event, group.role)}
                    />
                  )}
                </section>
              ))}
            </div>
          ) : visibleSequenceItems.length ? (
            <section
              className={`playlist lesson-playlist-track section-${activeSectionRole} ${draggedLibraryMediaId ? "is-library-dragging" : ""}`}
              data-sequence-role={activeSectionRole}
              aria-label={`${roleName(activeSectionRole)} playback sequence`}
              onDragOver={(event) => {
                if (!(event.target as HTMLElement).closest(".playlist-item")) {
                  libraryDragOver(event, visibleSequenceItems.length, activeSectionRole);
                }
              }}
              onDrop={(event) => libraryDrop(event, activeSectionRole)}
            >
              {renderSequenceItems(visibleSequenceItems, activeSectionRole)}
            </section>
          ) : (
            <section
              className={`lesson-empty-drop-target ${draggedLibraryMediaId ? "is-library-dragging" : ""} ${libraryDropIndex === 0 ? "is-drop-ready" : ""}`}
              data-sequence-role={activeSectionRole}
              aria-label={`Drop media into empty ${roleName(activeSectionRole)} section`}
              onDragOver={(event) => libraryDragOver(event, 0, activeSectionRole)}
              onDrop={(event) => libraryDrop(event, activeSectionRole)}
            >
              <Empty
                title={`No ${roleName(activeSectionRole).toLowerCase()} cues yet`}
                body="Drag ready media here, or click a library item to add it to the lesson."
                action={
                  <button className="button primary" onClick={() => { setAddMode("chooser"); setShowAdd(true); }}>
                    Add media
                  </button>
                }
              />
            </section>
          )}
        </>
        <section className="lesson-library" aria-label="Lesson media library">
          <div className="lesson-library-heading">
            <div>
              <span className="section-label">LIBRARY</span>
              <h3>Ready media</h3>
              <small>Drag a file onto any timeline position, or click it to append.</small>
            </div>
            <button className="button" onClick={() => { setAddMode("chooser"); setShowAdd(true); }}>
              ＋ Upload or choose
            </button>
          </div>
          <div className="lesson-library-track">
            <button className="lesson-library-add" onClick={() => { setAddMode("chooser"); setShowAdd(true); }}>
              <span>＋</span>
              <strong>Add from library or upload</strong>
              <small>Images, video, audio, slides, and links</small>
            </button>
            {playableMedia.map((asset) => (
              <button
                className={`lesson-library-card ${draggedLibraryMediaId === asset.id ? "is-dragging" : ""}`}
                key={asset.id}
                draggable={draggedLibraryMediaId !== asset.id}
                onPointerDown={(event) => beginLibraryPointerDrag(event, asset)}
                onDragStart={(event) => libraryDragStart(event, asset)}
                onDragEnd={libraryDragEnd}
                onClick={() => {
                  if (Date.now() < suppressLibraryClickUntilRef.current) return;
                  void addLibraryMedia(asset);
                }}
                aria-label={`Add or drag ${asset.fileName} to the playback sequence`}
              >
                <span className="lesson-library-thumb">
                  {asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : <b>{asset.contentType.startsWith("audio/") ? "♫" : asset.sourceKind === "link" ? "⌘" : "▶"}</b>}
                </span>
                <strong>{asset.fileName}</strong>
                <small>{asset.sourceKind === "link" ? "Online media" : asset.contentType.split("/")[0]}</small>
              </button>
            ))}
          </div>
        </section>
      </section>
    </>
  );
}

export function CueIcon({ name }: { name: "notes" | "options" | "timeline" | "mute" | "clock" | "skip" | "close" }) {
  const paths: Record<typeof name, ReactNode> = {
    notes: <><path d="M5 5.5h14v10H9l-4 3v-13Z" /><path d="M8.5 9h7M8.5 12h5" /></>,
    options: <><path d="M4 7h10M17 7h3M4 17h3M10 17h10M14 4v6M7 14v6" /></>,
    timeline: <><path d="M4 6h16M4 18h16M7 6v12M17 6v12" /><path d="m10 12 4-2.5v5L10 12Z" /></>,
    mute: <><path d="m5 10 4-3v10l-4-3H2v-4h3Z" /><path d="m14 10 6 6M20 10l-6 6" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></>,
    skip: <><path d="m6 7 7 5-7 5V7ZM15 7v10" /></>,
    close: <path d="m7 7 10 10M17 7 7 17" />,
  };
  return (
    <svg className="cue-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function PlaylistCueRow({
  item,
  media,
  index,
  sequenceIndex,
  total,
  dropEdge,
  selected,
  highlighted,
  onSelected,
  onMove,
  onChange,
  onTimeline,
  onRemove,
  onLibraryDragOver,
  onLibraryDrop,
}: {
  item: PlaylistItem;
  media?: Media;
  index: number;
  sequenceIndex: number;
  total: number;
  onMove: (index: number, delta: number) => void | Promise<void>;
  onChange: (
    item: PlaylistItem,
    changes: Record<string, unknown>,
  ) => void | Promise<void>;
  dropEdge?: "before" | "after";
  selected: boolean;
  highlighted: boolean;
  onSelected: () => void;
  onTimeline: () => void;
  onRemove: (id: string) => void | Promise<void>;
  onLibraryDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  onLibraryDrop: (event: ReactDragEvent<HTMLElement>) => void | Promise<void>;
}) {
  const visual = item.type === "video" || item.type === "image";
  const [timedStill, setTimedStill] = useState(item.imageDurationSeconds != null);
  const [stillSeconds, setStillSeconds] = useState(String(item.imageDurationSeconds ?? 10));
  const [estimateSeconds, setEstimateSeconds] = useState(
    item.estimatedDurationSeconds == null ? "" : String(item.estimatedDurationSeconds),
  );
  const [openPanel, setOpenPanel] = useState<"notes" | "advanced">();
  const [panelPosition, setPanelPosition] = useState({ top: 16, left: 16 });
  const panelRef = useRef<HTMLElement>(null);
  const actionDockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setTimedStill(item.imageDurationSeconds != null);
    setStillSeconds(String(item.imageDurationSeconds ?? 10));
    setEstimateSeconds(item.estimatedDurationSeconds == null ? "" : String(item.estimatedDurationSeconds));
  }, [item.id, item.imageDurationSeconds, item.estimatedDurationSeconds]);
  useEffect(() => {
    if (!openPanel) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || actionDockRef.current?.contains(target)) return;
      setOpenPanel(undefined);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpenPanel(undefined);
    };
    const closeOnResize = () => setOpenPanel(undefined);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnResize);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [openPanel]);
  function togglePanel(panel: "notes" | "advanced", event: ReactMouseEvent<HTMLButtonElement>) {
    if (openPanel === panel) {
      setOpenPanel(undefined);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const width = panel === "advanced" ? Math.min(560, window.innerWidth - 24) : Math.min(360, window.innerWidth - 24);
    const height = panel === "advanced" ? Math.min(620, window.innerHeight * 0.72) : 260;
    const below = bounds.bottom + 8;
    setPanelPosition({
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
      top: below + height <= window.innerHeight - 12
        ? below
        : Math.max(12, bounds.top - height - 8),
    });
    setOpenPanel(panel);
  }
  return (
    <article
      className={`playlist-item ${item.role} ${selected ? "selected" : ""} ${highlighted ? "newly-added" : ""} ${dropEdge ? `drop-${dropEdge}` : ""}`}
      id={`lesson-cue-${item.id}`}
      tabIndex={-1}
      data-sequence-index={sequenceIndex}
      data-sequence-role={item.role}
      onDragEnter={onLibraryDragOver}
      onDragOver={onLibraryDragOver}
      onDrop={onLibraryDrop}
    >
      <label className="media-select">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelected}
          aria-label={`Select cue ${item.title}`}
        />
      </label>
      <div className="order-controls">
        <button
          aria-label={`Move ${item.title} up`}
          disabled={!index}
          onClick={() => onMove(index, -1)}
        >
          ↑
        </button>
        <span>{index + 1}</span>
        <button
          aria-label={`Move ${item.title} down`}
          disabled={index === total - 1}
          onClick={() => onMove(index, 1)}
        >
          ↓
        </button>
      </div>
      <div className="media-thumb cue-visual-thumb">
        {media?.thumbnailUrl ? (
          <img src={media.thumbnailUrl} alt="" />
        ) : (
          item.type === "video" ? "▶" : item.type === "audio" ? "♫" : "▧"
        )}
      </div>
      <div className="item-main">
        <div className="cue-card-heading">
          <span className={`role ${item.role}`}>{roleName(item.role)}</span>
          <strong>{item.title}</strong>
        </div>
        <small className="cue-meta">
          {item.mediaFileName || item.type}
        </small>
        <div className="cue-card-footer">
          <div className="cue-action-dock" ref={actionDockRef} role="group" aria-label={`Options for ${item.title}`}>
            <button
              type="button"
              className={openPanel === "notes" ? "active" : ""}
              aria-label={`Notes for ${item.title}`}
              aria-expanded={openPanel === "notes"}
              title="Lesson notes"
              onClick={(event) => togglePanel("notes", event)}
            >
              <CueIcon name="notes" />
              {item.notes && <i aria-hidden="true" />}
            </button>
            <span className="cue-duration" aria-label={`Duration ${cueDurationLabel(item)}`}>
              {cueDurationLabel(item)}
            </span>
            <button
              type="button"
              className={openPanel === "advanced" ? "active" : ""}
              aria-label={`Advanced Options for ${item.title}`}
              aria-expanded={openPanel === "advanced"}
              title="Advanced Options"
              onClick={(event) => togglePanel("advanced", event)}
            >
              <CueIcon name="options" />
            </button>
          </div>
        </div>
        {openPanel === "notes" && (
          <section
            className="cue-popover cue-notes-popover"
            ref={panelRef}
            style={panelPosition}
            role="dialog"
            aria-label={`Notes for ${item.title}`}
          >
            <header>
              <div><CueIcon name="notes" /><span><strong>Notes</strong><small>{item.title}</small></span></div>
              <button type="button" aria-label="Close notes" onClick={() => setOpenPanel(undefined)}><CueIcon name="close" /></button>
            </header>
            <Field
              label="Teacher / volunteer notes"
              hint="Shown beside this cue on the phone controller and printed run sheet."
            >
              <textarea
                rows={5}
                maxLength={2000}
                defaultValue={item.notes || ""}
                placeholder="What the operator should say or do"
                onBlur={(event) =>
                  event.target.value !== item.notes &&
                  onChange(item, { notes: event.target.value })
                }
              />
            </Field>
          </section>
        )}
        {openPanel === "advanced" && (
          <section
            className="cue-popover cue-advanced-popover"
            ref={panelRef}
            style={panelPosition}
            role="dialog"
            aria-label={`Advanced Options for ${item.title}`}
          >
            <header>
              <div><CueIcon name="options" /><span><strong>Advanced Options</strong><small>{item.title}</small></span></div>
              <button type="button" aria-label="Close Advanced Options" onClick={() => setOpenPanel(undefined)}><CueIcon name="close" /></button>
            </header>
            <div className={`cue-tool-row ${item.type === "image" ? "cue-tool-row-no-trim" : ""}`} aria-label="Cue quick actions">
              {item.type !== "image" && (
                <button type="button" onClick={() => { setOpenPanel(undefined); onTimeline(); }}>
                  <CueIcon name="timeline" /><span><strong>Trim & fades</strong><small>Visual editor</small></span>
                </button>
              )}
              <label>
                <input aria-label="Mute cue" type="checkbox" checked={item.muted} onChange={(event) => onChange(item, { muted: event.target.checked })} />
                <CueIcon name="mute" /><span><strong>Mute</strong><small>Silence cue</small></span>
              </label>
              <label>
                <input aria-label="Flexible timing" type="checkbox" checked={item.flexibleTime} onChange={(event) => onChange(item, { flexibleTime: event.target.checked })} />
                <CueIcon name="clock" /><span><strong>Flexible</strong><small>Timing may vary</small></span>
              </label>
              <label>
                <input aria-label="Allow volunteers to skip this cue" type="checkbox" checked={item.allowSkip} onChange={(event) => onChange(item, { allowSkip: event.target.checked })} />
                <CueIcon name="skip" /><span><strong>Skippable</strong><small>Volunteer control</small></span>
              </label>
            </div>
        <div className="item-options simple-cue-controls">
          <Field label="Role">
            <select
              aria-label="Role"
              value={item.role}
              onChange={(e) => onChange(item, { role: e.target.value })}
            >
              <option value="preRoll">Pre-roll</option>
              <option value="countdown">Countdown</option>
              <option value="lesson">Main lesson</option>
              <option value="postLesson">Post-lesson</option>
            </select>
          </Field>
          <Field label="At the end">
            <select
              aria-label="End behavior"
              value={item.endBehavior || defaultEndBehaviorForRole(item.role)}
              onChange={(e) => onChange(item, { endBehavior: e.target.value })}
            >
              <option value="pause">Pause at last frame</option>
              <option value="advance">Play next cue</option>
              <option value="loop">Loop continuously</option>
              <option value="stop">Stop playback</option>
            </select>
          </Field>
          <Field label="Cue volume">
            <div className="unit-input">
              <input
                type="number"
                min="0"
                max="150"
                defaultValue={item.volumePercent}
                onBlur={(e) =>
                  onChange(item, { volumePercent: Number(e.target.value) })
                }
              />
              <span>%</span>
            </div>
          </Field>
          {visual && (
            <Field label="Picture">
              <select
                aria-label="Picture fit"
                value={item.fitMode || "fit"}
                onChange={(e) => onChange(item, { fitMode: e.target.value })}
              >
                <option value="fit">Fit on screen</option>
                <option value="fill">Fill screen (crop edges)</option>
                <option value="letterbox">Letterbox on black</option>
              </select>
            </Field>
          )}
          {item.type === "image" && (
            <div className="still-duration-options">
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={timedStill}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setTimedStill(next);
                    onChange(
                      item,
                      next
                        ? { imageDurationSeconds: Math.max(1, Number(stillSeconds) || 10) }
                        : { clearImageDuration: true },
                    );
                  }}
                />
                Time this still / slide
              </label>
              {timedStill && (
                <Field label="Still/slide duration">
                  <div className="unit-input">
                    <input
                      type="number"
                      min="1"
                      max="3600"
                      value={stillSeconds}
                      onChange={(event) => setStillSeconds(event.target.value)}
                      onBlur={() => {
                        const value = Math.max(1, Math.min(3600, Number(stillSeconds) || 10));
                        setStillSeconds(String(value));
                        onChange(item, { imageDurationSeconds: value });
                      }}
                    />
                    <span>sec</span>
                  </div>
                </Field>
              )}
              {!timedStill && (
                <Field
                  label="Anticipated Slide Duration"
                  hint="Optional estimate for an untimed still or slide."
                >
                  <div className="unit-input">
                    <input
                      type="number"
                      min="1"
                      max="3600"
                      placeholder="Untimed"
                      value={estimateSeconds}
                      onChange={(event) => setEstimateSeconds(event.target.value)}
                      onBlur={() => {
                        if (!estimateSeconds.trim()) {
                          onChange(item, { clearEstimatedDuration: true });
                          return;
                        }
                        const value = Math.max(1, Math.min(3600, Number(estimateSeconds) || 1));
                        setEstimateSeconds(String(value));
                        onChange(item, { estimatedDurationSeconds: value });
                      }}
                    />
                    <span>sec</span>
                  </div>
                </Field>
              )}
            </div>
          )}
        </div>
        {visual && (
          <div className="cue-appearance-summary">
            <i style={{ background: item.backgroundColor || "#000000" }} />
            <span>
              {item.fitMode || "fit"}
              {item.rotationDegrees
                ? ` · rotated ${item.rotationDegrees}°`
                : ""}
              {item.transitionStyle === "fade-black"
                ? ` · ${(item.transitionDurationMs / 1000).toFixed(1)}s fade through black`
                : " · cut"}
            </span>
          </div>
        )}
          <details className="item-advanced" open>
            <summary>Precision playback controls</summary>
            <div className="advanced-grid">
              <Field label="Display title">
                <input
                  defaultValue={item.title}
                  onBlur={(e) =>
                    e.target.value !== item.title &&
                    onChange(item, { title: e.target.value })
                  }
                />
              </Field>
              <Field label="Playback speed">
                <div className="unit-input">
                  <input
                    type="number"
                    min="25"
                    max="400"
                    step="5"
                    defaultValue={item.playbackRatePercent || 100}
                    onBlur={(e) =>
                      onChange(item, {
                        playbackRatePercent: Number(e.target.value),
                      })
                    }
                  />
                  <span>%</span>
                </div>
              </Field>
              <Field label="Play count before ending">
                <input
                  type="number"
                  min="1"
                  max="99"
                  defaultValue={item.repeatCount || 1}
                  onBlur={(e) =>
                    onChange(item, { repeatCount: Number(e.target.value) })
                  }
                />
              </Field>
              {visual && (
                <>
                  <Field label="Rotate">
                    <select
                      value={item.rotationDegrees || 0}
                      onChange={(e) =>
                        onChange(item, {
                          rotationDegrees: Number(e.target.value),
                        })
                      }
                    >
                      <option value="0">No rotation</option>
                      <option value="90">90° clockwise</option>
                      <option value="180">180°</option>
                      <option value="270">270° clockwise</option>
                    </select>
                  </Field>
                  <Field label="Background">
                    <input
                      type="color"
                      value={item.backgroundColor || "#000000"}
                      onChange={(e) =>
                        onChange(item, { backgroundColor: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Transition">
                    <select
                      value={item.transitionStyle || "cut"}
                      onChange={(e) =>
                        onChange(item, { transitionStyle: e.target.value })
                      }
                    >
                      <option value="cut">Cut</option>
                      <option value="fade-black">Fade through black</option>
                    </select>
                  </Field>
                  {item.transitionStyle === "fade-black" && (
                    <Field label="Transition duration">
                      <div className="unit-input">
                        <input
                          type="number"
                          min="0"
                          max="5"
                          step="0.1"
                          defaultValue={
                            (item.transitionDurationMs || 500) / 1000
                          }
                          onBlur={(e) =>
                            onChange(item, {
                              transitionDurationMs: Math.round(
                                Number(e.target.value) * 1000,
                              ),
                            })
                          }
                        />
                        <span>sec</span>
                      </div>
                    </Field>
                  )}
                  <Field label="Crop left">
                    <div className="unit-input">
                      <input
                        type="number"
                        min="0"
                        max="45"
                        defaultValue={item.cropLeftPercent || 0}
                        onBlur={(e) =>
                          onChange(item, {
                            cropLeftPercent: Number(e.target.value),
                          })
                        }
                      />
                      <span>%</span>
                    </div>
                  </Field>
                  <Field label="Crop right">
                    <div className="unit-input">
                      <input
                        type="number"
                        min="0"
                        max="45"
                        defaultValue={item.cropRightPercent || 0}
                        onBlur={(e) =>
                          onChange(item, {
                            cropRightPercent: Number(e.target.value),
                          })
                        }
                      />
                      <span>%</span>
                    </div>
                  </Field>
                  <Field label="Crop top">
                    <div className="unit-input">
                      <input
                        type="number"
                        min="0"
                        max="45"
                        defaultValue={item.cropTopPercent || 0}
                        onBlur={(e) =>
                          onChange(item, {
                            cropTopPercent: Number(e.target.value),
                          })
                        }
                      />
                      <span>%</span>
                    </div>
                  </Field>
                  <Field label="Crop bottom">
                    <div className="unit-input">
                      <input
                        type="number"
                        min="0"
                        max="45"
                        defaultValue={item.cropBottomPercent || 0}
                        onBlur={(e) =>
                          onChange(item, {
                            cropBottomPercent: Number(e.target.value),
                          })
                        }
                      />
                      <span>%</span>
                    </div>
                  </Field>
                </>
              )}
              <Field label="Start at (seconds)">
                <input
                  type="number"
                  min="0"
                  step="0.04"
                  defaultValue={item.startMs / 1000}
                  onBlur={(e) =>
                    onChange(item, {
                      startMs: Math.round(Number(e.target.value) * 1000),
                    })
                  }
                />
              </Field>
              <Field label="End at (seconds)">
                <input
                  type="number"
                  min="0"
                  step="0.04"
                  defaultValue={item.endMs ? item.endMs / 1000 : ""}
                  onBlur={(e) =>
                    onChange(
                      item,
                      e.target.value
                        ? { endMs: Math.round(Number(e.target.value) * 1000) }
                        : { clearEndMs: true },
                    )
                  }
                />
              </Field>
              <Field label="Fade in (seconds)">
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="0.1"
                  defaultValue={(item.fadeInMs || 0) / 1000}
                  onBlur={(e) =>
                    onChange(item, {
                      fadeInMs: Math.round(Number(e.target.value) * 1000),
                    })
                  }
                />
              </Field>
              <Field label="Fade out (seconds)">
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="0.1"
                  defaultValue={(item.fadeOutMs || 0) / 1000}
                  onBlur={(e) =>
                    onChange(item, {
                      fadeOutMs: Math.round(Number(e.target.value) * 1000),
                    })
                  }
                />
              </Field>
            </div>
            <div className="advanced-checks">
              <label className="check-line">
                <input
                  type="checkbox"
                  defaultChecked={item.normalizeAudio}
                  onChange={(e) =>
                    onChange(item, { normalizeAudio: e.target.checked })
                  }
                />{" "}
                Normalize audio when a processed derivative is available
              </label>
            </div>
          </details>
          </section>
        )}
      </div>
      <button
        className="delete-button"
        onClick={() => onRemove(item.id)}
        title="Remove item"
      >
        ×
      </button>
    </article>
  );
}

export function LessonRunSheet({ lesson }: { lesson: Lesson }) {
  const items = [...lesson.items].sort((a, b) => a.position - b.position);
  const rows = items.map((item, index) => {
    const elapsed = items
      .slice(0, index)
      .filter((previous) => previous.role === "lesson")
      .reduce((sum, previous) => sum + cuePlannedDurationMs(previous), 0);
    const duration = cuePlannedDurationMs(item);
    const planned =
      lesson.designatedStartAt && item.role === "lesson"
        ? new Date(
            new Date(lesson.designatedStartAt).getTime() + elapsed,
          ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : roleName(item.role);
    return { item, index, duration, planned };
  });
  return (
    <section className="run-sheet">
      <header>
        <div>
          <span>LESSONCUE RUN SHEET</span>
          <h1>{lesson.title}</h1>
          <p>
            {lesson.className} · {formatDate(lesson.date)}
          </p>
        </div>
        <div>
          <strong>
            {lesson.designatedStartAt
              ? new Date(lesson.designatedStartAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "No fixed start"}
          </strong>
          <small>
            {formatFriendlyDuration(lessonPlannedDurationMs(lesson))} estimated
          </small>
        </div>
      </header>
      {lesson.substituteNotes && (
        <aside>
          <strong>Substitute / teacher instructions</strong>
          <p>{lesson.substituteNotes}</p>
        </aside>
      )}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Planned</th>
            <th>Cue</th>
            <th>Duration</th>
            <th>Operator notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ item, index, duration, planned }) => (
            <tr key={item.id} className={item.flexibleTime ? "flexible" : ""}>
              <td>{index + 1}</td>
              <td>{planned}</td>
              <td>
                <strong>{item.title}</strong>
                <small>
                  {item.mediaFileName || item.type}
                  {item.flexibleTime ? " · FLEXIBLE" : ""}
                </small>
              </td>
              <td>{duration ? formatFriendlyDuration(duration) : "Unknown"}</td>
              <td>{item.notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer>
        <span>
          Estimated finish:{" "}
          {lesson.designatedStartAt
            ? new Date(
                new Date(lesson.designatedStartAt).getTime() +
                  lessonPlannedDurationMs(lesson),
              ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            : "—"}
        </span>
        <span>Printed {new Date().toLocaleString()}</span>
      </footer>
    </section>
  );
}
