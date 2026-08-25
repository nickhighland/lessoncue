import { confirmAction } from "../../AccessibleDialogs";
import { SignageCalendarBoard, SignageStudioPanel, SignageStudioSection } from "../../SignageStudio";
import { Component, KeyboardEvent as ReactKeyboardEvent, ReactNode, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Media, Screen, Signage, SignageLayoutPreset, SignageZone, SignageZoneType } from "../models";
import { Empty, Field, Modal, PageHead } from "../ui";
import { applySignagePreset, dateInputValue, errorText, localId, newSignageZone, signageFormPayload, signagePayload, signageScheduleSummary, signageTargets, signageTime, timeAgo, toLocalInput } from "../utils";

// Retained during the Simple Signage migration for backward-compatible editing.
export function SignageView({
  signage,
  media,
  screens,
  timeZone,
  sourceAllowlist,
  refresh,
  notify,
}: {
  signage: Signage[];
  media: Media[];
  screens: Screen[];
  timeZone: string;
  sourceAllowlist: string[];
  refresh: () => void;
  notify: (s: string) => void;
}) {
  const [editing, setEditing] = useState<Signage | "new">();
  const [editingOccurrenceDate, setEditingOccurrenceDate] = useState<string>();
  const [section, setSection] = useState<SignageStudioSection>("schedule");
  async function save(
    payload: ReturnType<typeof signageFormPayload>,
    series?: { scope: "event" | "future" | "series"; effectiveDate: string },
  ) {
    const current = editing;
    if (!current) return;
    try {
      if (current !== "new" && current.recurrence !== "once" && series) {
        await api(
          `/api/v1/signage-studio/schedules/${current.id}/series-edit`,
          {
            method: "POST",
            body: JSON.stringify({
              scope: series.scope,
              effectiveDate: series.effectiveDate,
              changes: payload,
            }),
          },
        );
      } else {
        await api(
          current === "new"
            ? "/api/v1/signage"
            : `/api/v1/signage/${current.id}`,
          {
            method: current === "new" ? "POST" : "PUT",
            body: JSON.stringify(payload),
          },
        );
      }
      setEditing(undefined);
      setEditingOccurrenceDate(undefined);
      refresh();
      notify(
        current === "new"
          ? "Signage schedule created."
          : series?.scope === "event"
            ? "This occurrence was updated."
            : series?.scope === "future"
              ? "This and future occurrences were updated."
              : "Signage schedule updated.",
      );
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function setEnabled(item: Signage, enabled: boolean) {
    try {
      await api(`/api/v1/signage/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(signagePayload(item, enabled)),
      });
      refresh();
      notify(`${item.name} ${enabled ? "resumed" : "paused"}.`);
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function remove(item: Signage) {
    if (!await confirmAction(`Delete ${item.name}?`, { destructive: true })) return;
    try {
      await api(`/api/v1/signage/${item.id}`, { method: "DELETE" });
      refresh();
      notify("Signage deleted.");
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function refreshWidgets(item: Signage) {
    try {
      await api(`/api/v1/signage/${item.id}/widgets/refresh`, {
        method: "POST",
        body: "{}",
      });
      refresh();
      notify(`Refreshed approved sources for ${item.name}.`);
    } catch (error) {
      notify(errorText(error));
    }
  }
  return (
    <>
      <PageHead
        eyebrow="SIGNAGE STUDIO"
        title="Signage"
        detail={`Layouts, playlists, schedules, publishing, emergency alerts, and screen health · ${timeZone}`}
        action={
          section === "schedule" ? (
            <button
              className="button primary"
              onClick={() => {
                setEditingOccurrenceDate(undefined);
                setEditing("new");
              }}
            >
              New schedule
            </button>
          ) : undefined
        }
      />
      <nav className="signage-studio-tabs" aria-label="Signage Studio sections">
        {(
          [
            ["layouts", "▦", "Layouts", "Design reusable screens"],
            ["playlists", "▶", "Playlists", "Sequence layouts and media"],
            ["schedule", "◷", "Calendar", "Choose what plays and when"],
            ["publishing", "↑", "Publishing", "Assign and deliver content"],
            ["operations", "✓", "Operations", "Monitor screens and playback"],
            ["emergencies", "!", "Emergency", "Send an immediate alert"],
          ] as [SignageStudioSection, string, string, string][]
        ).map(([value, icon, label, detail]) => (
          <button
            key={value}
            className={section === value ? "active" : ""}
            aria-label={label}
            aria-current={section === value ? "page" : undefined}
            onClick={() => setSection(value)}
          >
            <i aria-hidden="true">{icon}</i>
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </button>
        ))}
      </nav>
      {section !== "schedule" && (
        <SignageStudioPanel
          section={section}
          media={media}
          screens={screens}
          signage={signage}
          timeZone={timeZone}
          sourceAllowlist={sourceAllowlist}
          refresh={refresh}
          notify={notify}
        />
      )}
      {section === "schedule" && (
        <>
          <SignageCalendarBoard
            signage={signage}
            timeZone={timeZone}
            onEdit={(id, occurrenceDate) => {
              const item = signage.find((value) => value.id === id);
              if (item) {
                setEditingOccurrenceDate(occurrenceDate);
                setEditing(item);
              }
            }}
          />
          <section className="signage-priority panel">
            <strong>Conflict order</strong>
            <span>Emergency override</span>
            <b>›</b>
            <span>Scheduled signage</span>
            <b>›</b>
            <span>Idle fallback</span>
            <small>
              Within each level, the highest priority wins. Lesson playback
              remains in control and signage returns automatically afterward.
            </small>
          </section>
          {editing && (
            <SignageEditorErrorBoundary onClose={() => setEditing(undefined)}>
              <SignageEditor
                item={editing === "new" ? undefined : editing}
                occurrenceDate={editingOccurrenceDate}
                media={media}
                screens={screens}
                timeZone={timeZone}
                sourceAllowlist={sourceAllowlist}
                onSave={save}
                onClose={() => setEditing(undefined)}
              />
            </SignageEditorErrorBoundary>
          )}
          <div className="signage-grid">
            {signage.length ? (
              signage.map((item) => (
                <article
                  className={`signage-card ${item.mode} ${!item.enabled ? "paused" : ""}`}
                  key={item.id}
                  style={{
                    background: item.backgroundColor,
                    color: item.textColor,
                  }}
                >
                  <div className="signage-top">
                    <span>{item.mode.toUpperCase()}</span>
                    <span>
                      {!item.enabled
                        ? "PAUSED"
                        : item.activeNow
                          ? "SHOWING NOW"
                          : "SCHEDULED"}
                    </span>
                  </div>
                  <h2>{item.message || item.name}</h2>
                  <p>
                    {item.name}
                    {item.mediaFileName ? ` · ${item.mediaFileName}` : ""}
                    {item.zones?.length
                      ? ` · ${item.zones.length}-zone ${item.layoutPreset.replace("-", " ")} layout`
                      : ""}
                  </p>
                  <div className="signage-meta">
                    <span>{signageScheduleSummary(item)}</span>
                    <span>{signageTargets(item)}</span>
                    <span className={`signage-ready ${item.readiness}`}>
                      {item.readiness === "ready"
                        ? "✓ Server media ready"
                        : item.readiness === "preparing"
                          ? "◷ Server media preparing"
                          : `! Server media ${item.readiness}`}
                    </span>
                    {item.mediaAssetId && (
                      <span
                        className={`signage-ready ${item.failedScreenCount ? "failed" : item.cachedScreenCount === item.targetScreenCount && item.targetScreenCount ? "ready" : "preparing"}`}
                      >
                        {item.targetScreenCount === 0
                          ? "No paired target displays"
                          : item.failedScreenCount
                            ? `! ${item.failedScreenCount} display cache failed`
                            : item.cachedScreenCount === item.targetScreenCount
                              ? `✓ Cached on ${item.targetScreenCount} display${item.targetScreenCount === 1 ? "" : "s"}`
                              : `◷ Cached on ${item.cachedScreenCount} of ${item.targetScreenCount} displays`}
                      </span>
                    )}
                  </div>
                  <div className="signage-foot">
                    <span>
                      Priority {item.priority}
                      {item.widgetCacheUpdatedAt
                        ? ` · data ${timeAgo(item.widgetCacheUpdatedAt)}`
                        : ""}
                    </span>
                    <div>
                      {item.zones?.some((zone) => zone.sourceUrl) && (
                        <button onClick={() => refreshWidgets(item)}>
                          Refresh data
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingOccurrenceDate(undefined);
                          setEditing(item);
                        }}
                      >
                        Edit
                      </button>
                      <button onClick={() => setEnabled(item, !item.enabled)}>
                        {item.enabled ? "Pause" : "Resume"}
                      </button>
                      <button onClick={() => remove(item)}>Delete</button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <section className="panel">
                <Empty
                  title="No signage yet"
                  body="Create an idle welcome screen or a recurring scheduled announcement."
                />
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}

export class SignageEditorErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("Unable to open the signage editor.", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Modal title="Unable to open signage editor" onClose={this.props.onClose}>
        <div className="stack">
          <p>
            The editor encountered an unexpected browser compatibility problem.
            Close this message and try again after updating LessonCue.
          </p>
          <div className="modal-actions">
            <button
              className="button primary"
              type="button"
              onClick={this.props.onClose}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }
}

export function SignageEditor({
  item,
  occurrenceDate,
  media,
  screens,
  timeZone,
  sourceAllowlist,
  onSave,
  onClose,
}: {
  item?: Signage;
  media: Media[];
  screens: Screen[];
  timeZone: string;
  sourceAllowlist: string[];
  occurrenceDate?: string;
  onSave: (
    payload: ReturnType<typeof signageFormPayload>,
    series?: { scope: "event" | "future" | "series"; effectiveDate: string },
  ) => void;
  onClose: () => void;
}) {
  const [recurrence, setRecurrence] = useState<Signage["recurrence"]>(
    item?.recurrence || "once",
  );
  const [preset, setPreset] = useState<SignageLayoutPreset>(
    item?.layoutPreset || "single",
  );
  const [zones, setZones] = useState<SignageZone[]>(() =>
    item?.zones?.length
      ? item.zones
      : applySignagePreset("single", [
          newSignageZone("text", item?.message || "Welcome"),
        ]),
  );
  const [selectedZoneId, setSelectedZoneId] = useState<string>();
  const [expandedZoneId, setExpandedZoneId] = useState<string>();
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [studioLayouts, setStudioLayouts] = useState<
    { id: string; name: string; publishedVersion: number }[]
  >([]);
  const [studioPlaylists, setStudioPlaylists] = useState<
    { id: string; name: string; publishedVersion: number }[]
  >([]);
  const [kioskEnabled, setKioskEnabled] = useState(item?.kioskEnabled || false);
  const [seriesScope, setSeriesScope] = useState<"event" | "future" | "series">(
    occurrenceDate ? "event" : "series",
  );
  const [seriesEffectiveDate, setSeriesEffectiveDate] = useState(
    occurrenceDate || item?.scheduleStartDate || dateInputValue(),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const cached = new Map(
    item?.widgetCache?.map((entry) => [entry.zoneId, entry]),
  );
  useEffect(() => {
    void Promise.all([
      api<{ id: string; name: string; publishedVersion: number }[]>(
        "/api/v1/signage-studio/layouts",
      ),
      api<{ id: string; name: string; publishedVersion: number }[]>(
        "/api/v1/signage-studio/playlists",
      ),
    ])
      .then(([layouts, playlists]) => {
        setStudioLayouts(layouts);
        setStudioPlaylists(playlists);
      })
      .catch(() => undefined);
  }, []);
  const setZone = (id: string, patch: Partial<SignageZone>) =>
    setZones((current) =>
      current.map((zone) => (zone.id === id ? { ...zone, ...patch } : zone)),
    );
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId);
  function selectPreset(value: SignageLayoutPreset) {
    setPreset(value);
    setZones((current) => applySignagePreset(value, current));
  }
  function addZone() {
    if (zones.length >= 8) return;
    const zone = {
      ...newSignageZone("text", "New zone"),
      x: 5 + zones.length * 3,
      y: 5 + zones.length * 3,
      width: 40,
      height: 35,
      zIndex: Math.max(0, ...zones.map((value) => value.zIndex ?? 0)) + 1,
    };
    setZones((current) => [...current, zone]);
    setSelectedZoneId(zone.id);
    setExpandedZoneId(zone.id);
    setPreset("dashboard");
  }
  function duplicateZone(zone: SignageZone) {
    if (zones.length >= 8) return;
    const copy = {
      ...zone,
      id: localId(),
      title: `${zone.title || zone.type} copy`,
      x: Math.min(90, zone.x + 3),
      y: Math.min(90, zone.y + 3),
      locked: false,
      zIndex: Math.max(0, ...zones.map((value) => value.zIndex ?? 0)) + 1,
    };
    setZones((current) => [...current, copy]);
    setSelectedZoneId(copy.id);
    setExpandedZoneId(copy.id);
  }
  function layerZone(zone: SignageZone, direction: "front" | "back") {
    setZones((current) => {
      if (direction === "front") {
        const top = Math.max(
          0,
          ...current
            .filter((value) => value.id !== zone.id)
            .map((value) => value.zIndex ?? 0),
        );
        return current.map((value) =>
          value.id === zone.id
            ? { ...value, zIndex: Math.min(100, top + 1) }
            : value,
        );
      }
      return current.map((value) =>
        value.id === zone.id
          ? { ...value, zIndex: 0 }
          : { ...value, zIndex: Math.min(100, (value.zIndex ?? 0) + 1) },
      );
    });
  }
  function beginZoneGesture(
    event: ReactPointerEvent,
    zone: SignageZone,
    mode: "move" | "resize" | "rotate",
  ) {
    event.preventDefault();
    event.stopPropagation();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    } catch {
      /* document listeners still track the gesture */
    }
    setSelectedZoneId(zone.id);
    setExpandedZoneId(zone.id);
    if (zone.locked || !canvasRef.current) return;
    const canvas = canvasRef.current.getBoundingClientRect();
    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      rotation: zone.rotation ?? 0,
    };
    const centerX =
      canvas.left + ((zone.x + zone.width / 2) * canvas.width) / 100;
    const centerY =
      canvas.top + ((zone.y + zone.height / 2) * canvas.height) / 100;
    const startAngle =
      (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) /
      Math.PI;
    const snap = (value: number, step: number, enabled: boolean) =>
      enabled ? Math.round(value / step) * step : Math.round(value * 10) / 10;
    const move = (pointer: PointerEvent | MouseEvent) => {
      if (mode === "rotate") {
        const angle =
          (Math.atan2(pointer.clientY - centerY, pointer.clientX - centerX) *
            180) /
          Math.PI;
        let rotation = start.rotation + angle - startAngle;
        while (rotation > 180) rotation -= 360;
        while (rotation < -180) rotation += 360;
        setZone(zone.id, {
          rotation: Math.round(
            snap(rotation, 5, snapToGrid && !pointer.shiftKey),
          ),
        });
        return;
      }
      const dx = ((pointer.clientX - start.clientX) / canvas.width) * 100;
      const dy = ((pointer.clientY - start.clientY) / canvas.height) * 100;
      if (mode === "move") {
        setZone(zone.id, {
          x: Math.max(
            0,
            Math.min(
              100 - start.width,
              snap(start.x + dx, 1, snapToGrid && !pointer.shiftKey),
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              100 - start.height,
              snap(start.y + dy, 1, snapToGrid && !pointer.shiftKey),
            ),
          ),
        });
      } else {
        setZone(zone.id, {
          width: Math.max(
            10,
            Math.min(
              100 - start.x,
              snap(start.width + dx, 1, snapToGrid && !pointer.shiftKey),
            ),
          ),
          height: Math.max(
            10,
            Math.min(
              100 - start.y,
              snap(start.height + dy, 1, snapToGrid && !pointer.shiftKey),
            ),
          ),
        });
      }
    };
    const finish = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish, { once: true });
    document.addEventListener("pointercancel", finish, { once: true });
  }
  function nudgeZone(event: ReactKeyboardEvent, zone: SignageZone) {
    const amount = event.shiftKey ? 5 : 1;
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-amount, 0],
      ArrowRight: [amount, 0],
      ArrowUp: [0, -amount],
      ArrowDown: [0, amount],
    };
    if (
      (event.ctrlKey || event.metaKey) &&
      ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(event.key)
    ) {
      event.preventDefault();
      layerZone(
        zone,
        event.key === "ArrowRight" || event.key === "ArrowUp"
          ? "front"
          : "back",
      );
      return;
    }
    if (event.key === "[" || event.key === "]") {
      if (zone.locked) return;
      event.preventDefault();
      setZone(zone.id, {
        rotation: Math.max(
          -180,
          Math.min(
            180,
            (zone.rotation ?? 0) +
              (event.key === "]" ? amount : -amount),
          ),
        ),
      });
      return;
    }
    const delta = movement[event.key];
    if (!delta || zone.locked) return;
    event.preventDefault();
    if (event.altKey) {
      setZone(zone.id, {
        width: Math.max(
          2,
          Math.min(100 - zone.x, zone.width + delta[0]),
        ),
        height: Math.max(
          2,
          Math.min(100 - zone.y, zone.height + delta[1]),
        ),
      });
      return;
    }
    setZone(zone.id, {
      x: Math.max(0, Math.min(100 - zone.width, zone.x + delta[0])),
      y: Math.max(0, Math.min(100 - zone.height, zone.y + delta[1])),
    });
  }
  function submit() {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    onSave(
      signageFormPayload(new FormData(form)),
      item?.recurrence !== "once"
        ? { scope: seriesScope, effectiveDate: seriesEffectiveDate }
        : undefined,
    );
  }
  return (
    <Modal
      title={item ? `Edit ${item.name}` : "Create signage"}
      onClose={onClose}
    >
      <form
        ref={formRef}
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input type="hidden" name="layoutPreset" value={preset} />
        <input type="hidden" name="zonesJson" value={JSON.stringify(zones)} />
        <Field label="Name">
          <input
            name="name"
            required
            maxLength={160}
            autoFocus
            defaultValue={item?.name}
          />
        </Field>
        <div className="two-fields">
          <Field label="Mode">
            <select name="mode" defaultValue={item?.mode || "scheduled"}>
              <option value="scheduled">Scheduled</option>
              <option value="idle">Idle fallback</option>
              <option value="emergency">Emergency override</option>
            </select>
          </Field>
          <Field label="Priority">
            <input
              name="priority"
              type="number"
              min="0"
              max="100"
              defaultValue={item?.priority ?? 10}
            />
          </Field>
        </div>
        <Field label="Message">
          <textarea
            name="message"
            rows={3}
            maxLength={2000}
            defaultValue={item?.message}
          />
        </Field>
        <section className="signage-layout-builder">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SCREEN LAYOUT</span>
              <h3>Design directly on the screen</h3>
              <p>
                Drag zones to move them. Use the square handle to resize and the
                round handle to rotate. Arrow keys nudge the selected zone; hold
                Shift for larger steps. Alt plus an arrow resizes, brackets
                rotate, and Control or Command plus an arrow changes layer order.
              </p>
            </div>
            <button
              className="button"
              type="button"
              onClick={addZone}
              disabled={zones.length >= 8}
            >
              Add zone
            </button>
          </div>
          <div
            className="signage-presets"
            role="group"
            aria-label="Signage layout preset"
          >
            {(
              [
                "single",
                "sidebar",
                "split",
                "header-grid",
                "dashboard",
              ] as SignageLayoutPreset[]
            ).map((value) => (
              <button
                type="button"
                className={preset === value ? "active" : ""}
                onClick={() => selectPreset(value)}
                key={value}
              >
                <i className={`preset-icon ${value}`} />
                {value.replace("-", " ")}
              </button>
            ))}
          </div>
          <div className="signage-canvas-toolbar">
            <label className="check-row">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(event) => setSnapToGrid(event.target.checked)}
              />{" "}
              Snap to grid
            </label>
            {selectedZone ? (
              <div className="signage-selection-tools">
                <span>
                  <b>{selectedZone.title || selectedZone.type}</b> selected
                </span>
                <Field label="Angle">
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    value={selectedZone.rotation ?? 0}
                    onChange={(event) =>
                      setZone(selectedZone.id, {
                        rotation: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Opacity">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedZone.opacity ?? 100}
                    onChange={(event) =>
                      setZone(selectedZone.id, {
                        opacity: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => layerZone(selectedZone, "back")}
                >
                  Send back
                </button>
                <button
                  type="button"
                  onClick={() => layerZone(selectedZone, "front")}
                >
                  Bring front
                </button>
                <button
                  type="button"
                  onClick={() => duplicateZone(selectedZone)}
                  disabled={zones.length >= 8}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className={selectedZone.locked ? "active" : ""}
                  onClick={() =>
                    setZone(selectedZone.id, { locked: !selectedZone.locked })
                  }
                >
                  {selectedZone.locked ? "Unlock" : "Lock"}
                </button>
                <button
                  type="button"
                  className={selectedZone.hidden ? "active" : ""}
                  onClick={() =>
                    setZone(selectedZone.id, { hidden: !selectedZone.hidden })
                  }
                >
                  {selectedZone.hidden ? "Show" : "Hide"}
                </button>
              </div>
            ) : (
              <span className="settings-copy">
                Select a zone to arrange it.
              </span>
            )}
          </div>
          <div className="signage-layout-workspace">
            <div
              ref={canvasRef}
              className={`signage-canvas ${snapToGrid ? "snap-grid" : ""}`}
              style={{ background: item?.backgroundColor || "#25302d" }}
              onPointerDown={() => setSelectedZoneId(undefined)}
            >
              {zones.map((zone, index) => {
                const cache = cached.get(zone.id);
                const mediaItem = media.find(
                  (value) => value.id === zone.mediaAssetId,
                );
                const selected = selectedZoneId === zone.id;
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`${zone.title || zone.type} zone`}
                    aria-pressed={selected}
                    className={`signage-zone-preview ${zone.type} ${selected ? "selected" : ""} ${zone.locked ? "locked" : ""} ${zone.hidden ? "hidden" : ""}`}
                    key={zone.id}
                    onPointerDown={(event) =>
                      beginZoneGesture(event, zone, "move")
                    }
                    onKeyDown={(event) => nudgeZone(event, zone)}
                    style={{
                      left: `${zone.x}%`,
                      top: `${zone.y}%`,
                      width: `${zone.width}%`,
                      height: `${zone.height}%`,
                      background: zone.backgroundColor,
                      color: zone.textColor,
                      borderColor: zone.accentColor,
                      zIndex: zone.zIndex ?? 0,
                      opacity: (zone.opacity ?? 100) / 100,
                      transform: `rotate(${zone.rotation ?? 0}deg) scaleX(${zone.flipX ? -1 : 1}) scaleY(${zone.flipY ? -1 : 1})`,
                    }}
                  >
                    {zone.type === "media" &&
                      mediaItem &&
                      (mediaItem.contentType.startsWith("image/") ? (
                        <img
                          src={mediaItem.thumbnailUrl || mediaItem.downloadUrl}
                          alt=""
                          style={{ objectFit: zone.fit || "cover" }}
                        />
                      ) : (
                        <div className="signage-video-placeholder">
                          ▶ {mediaItem.fileName}
                        </div>
                      ))}
                    <small>
                      {zone.type}
                      {zone.locked ? " · locked" : ""}
                    </small>
                    <strong>{zone.title || zone.type}</strong>
                    {zone.type === "clock" ? (
                      <b>
                        {new Date().toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </b>
                    ) : zone.type === "media" ? (
                      <span>
                        {zone.mediaFileName ||
                          mediaItem?.fileName ||
                          "Choose media"}
                      </span>
                    ) : zone.type === "stream" ? (
                      <span>
                        ● LIVE ·{" "}
                        {zone.sourceUrl?.split(":")[0].toUpperCase() ||
                          "Choose stream"}
                      </span>
                    ) : (
                      <span>
                        {cache?.text ||
                          cache?.items?.[0] ||
                          zone.content ||
                          `Zone ${index + 1}`}
                      </span>
                    )}
                    {selected && !zone.locked && (
                      <>
                        <i
                          className="signage-resize-handle"
                          aria-hidden="true"
                          onPointerDown={(event) =>
                            beginZoneGesture(event, zone, "resize")
                          }
                        />
                        <i
                          className="signage-rotate-handle"
                          aria-hidden="true"
                          onPointerDown={(event) =>
                            beginZoneGesture(event, zone, "rotate")
                          }
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="signage-zone-list">
              {zones.map((zone, index) => (
                <section
                  className={`signage-zone-editor ${selectedZoneId === zone.id ? "selected" : ""}`}
                  key={zone.id}
                >
                  <div className="signage-zone-summary">
                    <button
                      type="button"
                      className="signage-zone-toggle"
                      aria-expanded={
                        expandedZoneId === zone.id ||
                        (!expandedZoneId && index === 0)
                      }
                      onClick={() => {
                        setSelectedZoneId(zone.id);
                        setExpandedZoneId((current) =>
                          current === zone.id ? undefined : zone.id,
                        );
                      }}
                    >
                      <b>{index + 1}</b>
                      <span>
                        <strong>{zone.title || zone.type}</strong>
                        <small>
                          {zone.type}
                          {zone.sourceUrl
                            ? zone.type === "stream"
                              ? " · live source"
                              : " · approved online source"
                            : ""}
                          {zone.rotation ? ` · ${zone.rotation}°` : ""}
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="text-danger"
                      onClick={() => {
                        setZones((current) =>
                          current.filter((value) => value.id !== zone.id),
                        );
                        if (selectedZoneId === zone.id)
                          setSelectedZoneId(undefined);
                        if (expandedZoneId === zone.id)
                          setExpandedZoneId(undefined);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  {(expandedZoneId === zone.id ||
                    (!expandedZoneId && index === 0)) && (
                    <div className="stack">
                      <div className="two-fields">
                        <Field label="Zone type">
                          <select
                            value={zone.type}
                            onChange={(event) =>
                              setZone(zone.id, {
                                type: event.target.value as SignageZoneType,
                                sourceUrl: undefined,
                                mediaAssetId: undefined,
                              })
                            }
                          >
                            <option value="text">Text</option>
                            <option value="media">Image or video</option>
                            <option value="stream">
                              Live stream (RTMP, RTSP or HLS)
                            </option>
                            <option value="clock">Clock and date</option>
                            <option value="calendar">Calendar</option>
                            <option value="weather">Weather</option>
                            <option value="menu">Menu or schedule</option>
                            <option value="rss">RSS headlines</option>
                            <option value="data">Approved JSON data</option>
                          </select>
                        </Field>
                        <Field label="Heading">
                          <input
                            value={zone.title || ""}
                            maxLength={160}
                            onChange={(event) =>
                              setZone(zone.id, { title: event.target.value })
                            }
                            placeholder="Optional heading"
                          />
                        </Field>
                      </div>
                      {zone.type === "media" ? (
                        <Field label="Image or video">
                          <select
                            value={zone.mediaAssetId || ""}
                            onChange={(event) =>
                              setZone(zone.id, {
                                mediaAssetId: event.target.value || undefined,
                                mediaFileName: media.find(
                                  (value) => value.id === event.target.value,
                                )?.fileName,
                              })
                            }
                          >
                            <option value="">Choose media…</option>
                            {media
                              .filter(
                                (value) =>
                                  value.sourceKind !== "link" &&
                                  (value.contentType.startsWith("image/") ||
                                    value.contentType.startsWith("video/")),
                              )
                              .map((value) => (
                                <option value={value.id} key={value.id}>
                                  {value.fileName}
                                </option>
                              ))}
                          </select>
                        </Field>
                      ) : (
                        zone.type !== "clock" &&
                        zone.type !== "stream" && (
                          <Field
                            label={
                              zone.type === "text" ? "Text" : "Fallback text"
                            }
                            hint={
                              zone.type === "text"
                                ? undefined
                                : "Shown until the first refresh and whenever no cached items are available."
                            }
                          >
                            <textarea
                              rows={2}
                              maxLength={4000}
                              value={zone.content || ""}
                              onChange={(event) =>
                                setZone(zone.id, {
                                  content: event.target.value,
                                })
                              }
                            />
                          </Field>
                        )
                      )}
                      {zone.type === "stream" && (
                        <Field
                          label="Live stream address"
                          hint="Accepts RTMP, RTMPS, RTSP, HLS (.m3u8), and direct HTTP streams. The server relays it as HLS for every LessonCue display."
                        >
                          <input
                            type="url"
                            required
                            value={zone.sourceUrl || ""}
                            onChange={(event) =>
                              setZone(zone.id, {
                                sourceUrl: event.target.value,
                              })
                            }
                            placeholder="rtmp://stream.example.org/live/key"
                          />
                        </Field>
                      )}
                      {(
                        [
                          "calendar",
                          "weather",
                          "menu",
                          "rss",
                          "data",
                        ] as SignageZoneType[]
                      ).includes(zone.type) && (
                        <>
                          <Field
                            label="Approved source URL"
                            hint={
                              sourceAllowlist.length
                                ? `Allowed: ${sourceAllowlist.join(", ")}`
                                : "An administrator must first approve its origin in Settings → Integrations."
                            }
                          >
                            <input
                              type="url"
                              value={zone.sourceUrl || ""}
                              onChange={(event) =>
                                setZone(zone.id, {
                                  sourceUrl: event.target.value,
                                })
                              }
                              placeholder="https://approved.example/feed"
                            />
                          </Field>
                          <Field label="Refresh every">
                            <select
                              value={zone.refreshMinutes}
                              onChange={(event) =>
                                setZone(zone.id, {
                                  refreshMinutes: Number(event.target.value),
                                })
                              }
                            >
                              <option value="5">5 minutes</option>
                              <option value="15">15 minutes</option>
                              <option value="30">30 minutes</option>
                              <option value="60">1 hour</option>
                              <option value="360">6 hours</option>
                              <option value="1440">Daily</option>
                            </select>
                          </Field>
                        </>
                      )}
                      <div className="three-fields signage-zone-colors">
                        <Field label="Background">
                          <input
                            type="color"
                            value={zone.backgroundColor}
                            onChange={(event) =>
                              setZone(zone.id, {
                                backgroundColor: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label="Text">
                          <input
                            type="color"
                            value={zone.textColor}
                            onChange={(event) =>
                              setZone(zone.id, {
                                textColor: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label="Accent">
                          <input
                            type="color"
                            value={zone.accentColor}
                            onChange={(event) =>
                              setZone(zone.id, {
                                accentColor: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </div>
                      <div className="two-fields">
                        <Field label="Media fitting">
                          <select
                            value={zone.fit || "cover"}
                            onChange={(event) =>
                              setZone(zone.id, {
                                fit: event.target.value as SignageZone["fit"],
                              })
                            }
                          >
                            <option value="cover">Fill and crop</option>
                            <option value="contain">Fit entire item</option>
                            <option value="fill">Stretch</option>
                          </select>
                        </Field>
                        <Field label="Opacity">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={zone.opacity ?? 100}
                            onChange={(event) =>
                              setZone(zone.id, {
                                opacity: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                      </div>
                      <div className="three-fields">
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={zone.flipX || false}
                            onChange={(event) =>
                              setZone(zone.id, { flipX: event.target.checked })
                            }
                          />{" "}
                          Flip horizontal
                        </label>
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={zone.flipY || false}
                            onChange={(event) =>
                              setZone(zone.id, { flipY: event.target.checked })
                            }
                          />{" "}
                          Flip vertical
                        </label>
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={zone.locked || false}
                            onChange={(event) =>
                              setZone(zone.id, { locked: event.target.checked })
                            }
                          />{" "}
                          Lock position
                        </label>
                      </div>
                      <details>
                        <summary>Exact position, rotation, and layer</summary>
                        <div className="four-fields">
                          <Field label="Left %">
                            <input
                              type="number"
                              min="0"
                              max="90"
                              value={zone.x}
                              onChange={(event) =>
                                setZone(zone.id, {
                                  x: Number(event.target.value),
                                })
                              }
                            />
                          </Field>
                          <Field label="Top %">
                            <input
                              type="number"
                              min="0"
                              max="90"
                              value={zone.y}
                              onChange={(event) =>
                                setZone(zone.id, {
                                  y: Number(event.target.value),
                                })
                              }
                            />
                          </Field>
                          <Field label="Width %">
                            <input
                              type="number"
                              min="10"
                              max="100"
                              value={zone.width}
                              onChange={(event) =>
                                setZone(zone.id, {
                                  width: Number(event.target.value),
                                })
                              }
                            />
                          </Field>
                          <Field label="Height %">
                            <input
                              type="number"
                              min="10"
                              max="100"
                              value={zone.height}
                              onChange={(event) =>
                                setZone(zone.id, {
                                  height: Number(event.target.value),
                                })
                              }
                            />
                          </Field>
                          <Field label="Rotation °">
                            <input
                              type="number"
                              min="-180"
                              max="180"
                              value={zone.rotation ?? 0}
                              onChange={(event) =>
                                setZone(zone.id, {
                                  rotation: Number(event.target.value),
                                })
                              }
                            />
                          </Field>
                          <Field label="Layer">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={zone.zIndex ?? 0}
                              onChange={(event) =>
                                setZone(zone.id, {
                                  zIndex: Number(event.target.value),
                                })
                              }
                            />
                          </Field>
                        </div>
                      </details>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
          {item?.widgetCacheError && (
            <div className="alert error">
              Last source refresh: {item.widgetCacheError}. The last successful
              cached content remains available.
            </div>
          )}
        </section>
        <div className="two-fields">
          <Field label="Reusable layout">
            <select name="layoutId" defaultValue={item?.layoutId || ""}>
              <option value="">Use the inline layout above</option>
              {studioLayouts
                .filter((value) => value.publishedVersion > 0)
                .map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Signage playlist">
            <select
              name="contentPlaylistId"
              defaultValue={item?.contentPlaylistId || ""}
            >
              <option value="">No independent playlist</option>
              {studioPlaylists
                .filter((value) => value.publishedVersion > 0)
                .map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <div className="two-fields">
          <Field label="Optional image or video">
            <select name="mediaAssetId" defaultValue={item?.mediaAssetId || ""}>
              <option value="">Text only</option>
              {media
                .filter(
                  (value) =>
                    value.sourceKind !== "link" &&
                    (value.contentType.startsWith("image/") ||
                      value.contentType.startsWith("video/")),
                )
                .map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.fileName}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Repeats">
            <select
              name="recurrence"
              value={recurrence}
              onChange={(event) =>
                setRecurrence(event.target.value as Signage["recurrence"])
              }
            >
              <option value="once">One time</option>
              <option value="daily">Every day</option>
              <option value="weekly">Selected weekdays</option>
            </select>
          </Field>
        </div>
        <div className="two-fields">
          <Field label="Screen volume">
            <input
              name="volumePercent"
              type="number"
              min="0"
              max="150"
              defaultValue={item?.volumePercent ?? 100}
            />
          </Field>
          <Field label="Screen power event">
            <select
              name="displayPower"
              defaultValue={item?.displayPower || "unchanged"}
            >
              <option value="unchanged">Leave unchanged</option>
              <option value="on">Turn on</option>
              <option value="off">Turn off</option>
            </select>
          </Field>
        </div>
        {recurrence === "once" ? (
          <div className="two-fields">
            <Field label="Starts" hint="Leave blank to start immediately.">
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={toLocalInput(item?.startsAt)}
              />
            </Field>
            <Field label="Ends" hint="Leave blank to continue until paused.">
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={toLocalInput(item?.endsAt)}
              />
            </Field>
          </div>
        ) : (
          <>
            <div className="two-fields">
              <Field label="First date">
                <input
                  name="scheduleStartDate"
                  type="date"
                  defaultValue={
                    item?.scheduleStartDate || dateInputValue(undefined)
                  }
                />
              </Field>
              <Field label="Last date" hint="Optional">
                <input
                  name="scheduleEndDate"
                  type="date"
                  defaultValue={item?.scheduleEndDate || ""}
                />
              </Field>
            </div>
            <div className="two-fields">
              <Field label="Daily start">
                <input
                  name="startTime"
                  type="time"
                  required
                  defaultValue={signageTime(item?.startMinutes, "08:00")}
                />
              </Field>
              <Field label="Daily end">
                <input
                  name="endTime"
                  type="time"
                  required
                  defaultValue={signageTime(item?.endMinutes, "17:00")}
                />
              </Field>
            </div>
            {recurrence === "weekly" && (
              <fieldset className="signage-weekdays">
                <legend>Show on</legend>
                {days.map((day, index) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      name="dayOfWeek"
                      value={index}
                      defaultChecked={
                        item
                          ? item.daysOfWeek.includes(index)
                          : index > 0 && index < 6
                      }
                    />{" "}
                    {day.slice(0, 3)}
                  </label>
                ))}
              </fieldset>
            )}
            <Field
              label="Excluded dates"
              hint={`One YYYY-MM-DD date per line. Times use ${timeZone}.`}
            >
              <textarea
                name="excludedDates"
                rows={3}
                defaultValue={item?.excludedDates.join("\n")}
                placeholder={"2026-12-25\n2027-01-01"}
              />
            </Field>
            {item?.recurrence !== "once" && (
              <div className="series-scope panel">
                <strong>Apply these changes to</strong>
                <div className="two-fields">
                  <Field label="Edit scope">
                    <select
                      value={seriesScope}
                      onChange={(event) =>
                        setSeriesScope(event.target.value as typeof seriesScope)
                      }
                    >
                      <option value="event">This event only</option>
                      <option value="future">This and future events</option>
                      <option value="series">Entire series</option>
                    </select>
                  </Field>
                  <Field label="Occurrence date">
                    <input
                      type="date"
                      required
                      disabled={seriesScope === "series"}
                      value={seriesEffectiveDate}
                      onChange={(event) =>
                        setSeriesEffectiveDate(event.target.value)
                      }
                    />
                  </Field>
                </div>
                <small>
                  {seriesScope === "event"
                    ? "Creates a one-time exception and leaves every other occurrence unchanged."
                    : seriesScope === "future"
                      ? "Ends the current series the day before this date and starts a new series with these changes."
                      : "Updates every occurrence in the existing series."}
                </small>
              </div>
            )}
          </>
        )}
        <fieldset className="signage-targets">
          <legend>Specific screens</legend>
          <p>Leave every box clear to use tags or target all screens.</p>
          {screens
            .filter((screen) => !screen.revoked)
            .map((screen) => (
              <label key={screen.id}>
                <input
                  type="checkbox"
                  name="targetScreenId"
                  value={screen.id}
                  defaultChecked={item?.targetScreenIds.includes(screen.id)}
                />
                <span>
                  <strong>{screen.name}</strong>
                  <small>
                    {screen.site}
                    {screen.tagsCsv ? ` · ${screen.tagsCsv}` : ""}
                  </small>
                </span>
              </label>
            ))}
        </fieldset>
        <Field
          label="Target screen tags"
          hint="A selected screen or a screen with any matching tag receives this sign. Leave both blank for every screen."
        >
          <input
            name="targetTagsCsv"
            maxLength={2000}
            defaultValue={item?.targetTagsCsv}
            placeholder="lobby, campus-a"
          />
        </Field>
        <div className="two-fields">
          <Field label="Background color">
            <input
              name="backgroundColor"
              type="color"
              defaultValue={item?.backgroundColor || "#25302d"}
            />
          </Field>
          <Field label="Text color">
            <input
              name="textColor"
              type="color"
              defaultValue={item?.textColor || "#ffffff"}
            />
          </Field>
        </div>
        <details className="settings-block" open={kioskEnabled}>
          <summary>Touch and kiosk behavior</summary>
          <label className="check-row">
            <input
              type="checkbox"
              name="kioskEnabled"
              checked={kioskEnabled}
              onChange={(event) => setKioskEnabled(event.target.checked)}
            />{" "}
            Enable interactive kiosk mode
          </label>
          {kioskEnabled && (
            <>
              <Field
                label="Interaction content"
                hint="A local or approved HTTPS webpage shown after the display is touched. Emergency alerts always override it."
              >
                <input
                  name="kioskInteractionUrl"
                  type="url"
                  defaultValue={item?.kioskInteractionUrl || ""}
                  placeholder="https://…"
                />
              </Field>
              <div className="two-fields">
                <Field label="Idle timeout (seconds)">
                  <input
                    name="kioskTimeoutSeconds"
                    type="number"
                    min="5"
                    max="86400"
                    defaultValue={item?.kioskTimeoutSeconds || 60}
                  />
                </Field>
                <div className="stack compact">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      name="kioskShowCloseButton"
                      defaultChecked={item?.kioskShowCloseButton ?? true}
                    />{" "}
                    Show close button
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      name="kioskShowTouchIndicator"
                      defaultChecked={item?.kioskShowTouchIndicator ?? true}
                    />{" "}
                    Show touch indicator
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      name="kioskVirtualKeyboard"
                      defaultChecked={item?.kioskVirtualKeyboard ?? false}
                    />{" "}
                    Allow virtual keyboard
                  </label>
                </div>
              </div>
            </>
          )}
        </details>
        <label className="check-row">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={item?.enabled ?? true}
          />{" "}
          Publish this schedule
        </label>
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            {item ? "Save changes" : "Create signage"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
