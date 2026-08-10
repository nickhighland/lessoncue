import { useDialogFocus } from "../AccessibleDialogs";
import QRCode from "qrcode";
import { ReactNode, useEffect, useState } from "react";
import { MediaTaxonomy, PlaylistItem, StorageStatus } from "./models";
import { formatDateAfterDays } from "./utils";

export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand-mark${large ? " large" : ""}`} aria-hidden="true">
      <img src="/lessoncue-icon.svg" alt="" />
    </span>
  );
}

export function QrCode({ value }: { value: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#172c27", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setSource(url);
      })
      .catch(() => setSource(""));
    return () => {
      active = false;
    };
  }, [value]);
  return source ? (
    <img src={source} alt={`QR code for ${value}`} />
  ) : (
    <div className="qr-loading">Building QR code…</div>
  );
}

export function PageHead({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {action}
    </header>
  );
}

export function CollapsibleSettingsSection({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section
      className={`panel settings-collapsible ${className}`.trim()}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <button
        className="settings-collapse-toggle"
        type="button"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Minimize"} ${label}`}
        title={`${collapsed ? "Expand" : "Minimize"} ${label}`}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span aria-hidden="true">{collapsed ? "+" : "−"}</span>
      </button>
      <div className="settings-collapsed-title" aria-hidden={!collapsed}>
        {label}
      </div>
      {children}
    </section>
  );
}

export function formTags(form: FormData) {
  return form
    .getAll("tags")
    .map((value) => String(value))
    .join(", ");
}
export function TaxonomyFields({
  taxonomy,
  folder = "",
  tagsCsv = "",
}: {
  taxonomy: MediaTaxonomy;
  folder?: string;
  tagsCsv?: string;
}) {
  const selected = new Set(
    tagsCsv
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  );
  const folders =
    taxonomy.folders.includes(folder) || !folder
      ? taxonomy.folders
      : [...taxonomy.folders, folder].sort((a, b) => a.localeCompare(b));
  const tags = [...taxonomy.tags];
  for (const tag of tagsCsv
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean))
    if (!tags.some((value) => value.toLowerCase() === tag.toLowerCase()))
      tags.push(tag);
  return (
    <div className="two-fields taxonomy-fields">
      <Field
        label="Folder"
        hint="Administrators define the available library folders."
      >
        <select name="folder" defaultValue={folder}>
          <option value="">Unfiled</option>
          {folders.map((value) => (
            <option value={value} key={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
      <fieldset className="taxonomy-tags">
        <legend>Tags</legend>
        {tags.length ? (
          <div>
            {tags.map((tag) => (
              <label key={tag}>
                <input
                  type="checkbox"
                  name="tags"
                  value={tag}
                  defaultChecked={selected.has(tag.toLowerCase())}
                />
                <span>{tag}</span>
              </label>
            ))}
          </div>
        ) : (
          <small>No approved tags are configured.</small>
        )}
        <small>Choose any administrator-approved tags that apply.</small>
      </fieldset>
    </div>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function RetentionChoices({ lessonDate }: { lessonDate: string }) {
  return (
    <fieldset className="retention-options">
      <legend>How long should LessonCue keep this file?</legend>
      <label>
        <input
          type="radio"
          name="storagePolicy"
          value="lesson"
          defaultChecked
        />
        <span>
          <strong>For this lesson (default)</strong>
          <small>
            Delete automatically on {formatDateAfterDays(lessonDate, 28)}.
          </small>
        </span>
      </label>
      <label>
        <input type="radio" name="storagePolicy" value="persistent" />
        <span>
          <strong>Keep permanently</strong>
          <small>Make it reusable for future lessons.</small>
        </span>
      </label>
    </fieldset>
  );
}
export function Stat({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string | number;
  sub: string;
  mono?: boolean;
}) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}
export function PanelTitle({
  title,
  action,
  onClick,
}: {
  title: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <button onClick={onClick}>{action} →</button>
    </div>
  );
}
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div>◇</div>
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function DateBadge({ date }: { date: string }) {
  const d = new Date(`${date}T12:00:00`);
  return (
    <span className="date-badge">
      <b>{d.toLocaleDateString(undefined, { month: "short" })}</b>
      <strong>{d.getDate()}</strong>
    </span>
  );
}
export function Status({ online }: { online: boolean }) {
  return (
    <span className={`status ${online ? "online" : "offline"}`}>
      <i />
      {online ? "Online" : "Offline"}
    </span>
  );
}
export function RoleSummary({ items }: { items: PlaylistItem[] }) {
  const pre = items.filter((i) => i.role === "preRoll").length;
  const countdown = items.some((i) => i.role === "countdown");
  const post = items.filter((i) => i.role === "postLesson").length;
  return (
    <span className="role-summary">
      {pre > 0 && <i>Pre-roll ×{pre}</i>}
      {countdown && <i>Countdown</i>}
      {post > 0 && <i>Post-lesson ×{post}</i>}
    </span>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const heading = `dialog-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const { dialogRef, onDialogKeyDown } =
    useDialogFocus<HTMLDivElement>(onClose);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.currentTarget === e.target && onClose()}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
      >
        <div className="modal-title">
          <h2 id={heading}>{title}</h2>
          <button onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Definition({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="definition">
      <span>{label}</span>
      <strong className={mono ? "mono small" : ""}>{value}</strong>
    </div>
  );
}
export function StorageMeter({ storage }: { storage: StorageStatus }) {
  const percent =
    storage.allocationBytes > 0
      ? Math.min(100, (storage.usedBytes / storage.allocationBytes) * 100)
      : 0;
  return (
    <div
      className="storage-meter"
      role="progressbar"
      aria-label="LessonCue storage used"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}
