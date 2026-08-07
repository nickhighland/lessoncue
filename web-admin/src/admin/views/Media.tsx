import { confirmAction } from "../../AccessibleDialogs";
import { FormEvent, useEffect, useState } from "react";
import { api, uploadMediaFile } from "../api";
import { MediaPreview } from "../media-editor";
import { Lesson, Media, MediaImpact, MediaTaxonomy, MediaUploadControl, MediaVersion, StorageStatus } from "../models";
import { Empty, Field, Modal, PageHead, StorageMeter, TaxonomyFields, formTags } from "../ui";
import { convertedSlideCount, dateInputValue, errorText, formatBytes, formatDate, formatDuration, formatShortDate, friendlyType, isConvertibleDocument, mediaCategory, mediaFileExtension, mediaNameStem, timeAgo } from "../utils";

export function MediaView({
  media,
  lessons,
  taxonomy,
  refresh,
  notify,
  canUpload,
  storage,
}: {
  media: Media[];
  lessons: Lesson[];
  taxonomy: MediaTaxonomy;
  refresh: () => void;
  notify: (s: string) => void;
  canUpload: boolean;
  storage?: StorageStatus;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadControl, setUploadControl] = useState<MediaUploadControl>();
  const [uploadPaused, setUploadPaused] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<Media>();
  const availableLessons = [...lessons]
    .filter((l) => !l.archived)
    .sort((a, b) => a.date.localeCompare(b.date));
  const firstUpcoming =
    availableLessons.find(
      (l) => new Date(`${l.date}T23:59:59`) >= new Date(),
    ) || availableLessons.at(-1);
  const [showUpload, setShowUpload] = useState(false);
  const [storagePolicy, setStoragePolicy] = useState<"lesson" | "persistent">(
    availableLessons.length ? "lesson" : "persistent",
  );
  const [linkMode, setLinkMode] = useState<"online" | "download" | "slides">(
    "online",
  );
  const [linkStoragePolicy, setLinkStoragePolicy] = useState<
    "lesson" | "persistent"
  >(availableLessons.length ? "lesson" : "persistent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [retentionTargets, setRetentionTargets] = useState<Media[]>([]);
  const [retentionMode, setRetentionMode] = useState<"expire" | "keep">(
    "expire",
  );
  const [retentionDate, setRetentionDate] = useState(
    dateInputValue(undefined, 28),
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [mediaTypeFilter, setMediaTypeFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [organizeTargets, setOrganizeTargets] = useState<Media[]>([]);
  const [renameTargets, setRenameTargets] = useState<Media[]>([]);
  const [manageMedia, setManageMedia] = useState<Media>();
  const [mediaImpact, setMediaImpact] = useState<MediaImpact>();
  const [manageBusy, setManageBusy] = useState(false);
  const [conversionLessonId, setConversionLessonId] = useState(
    firstUpcoming?.id || "",
  );
  const [slideSeconds, setSlideSeconds] = useState<number | "">("");
  useEffect(() => {
    if (
      !media.some(
        (item) =>
          ["downloading", "pending", "processing"].includes(
            item.processingStatus,
          ) ||
          ["pending", "converting"].includes(item.conversionStatus) ||
          item.transcodes?.some((profile) =>
            ["pending", "converting"].includes(profile.status),
          ),
      )
    )
      return;
    const timer = window.setTimeout(refresh, 4000);
    return () => window.clearTimeout(timer);
  }, [media, refresh]);
  const managedMediaId = manageMedia?.id;
  useEffect(() => {
    if (!managedMediaId) return;
    const updated = media.find((item) => item.id === managedMediaId);
    if (updated) setManageMedia(updated);
  }, [media, managedMediaId]);
  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set(
        [...current].filter((id) => media.some((item) => item.id === id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [media]);
  const folders = [
    ...new Set(
      [...taxonomy.folders, ...media.map((item) => item.folder)].filter(
        Boolean,
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const normalizedSearch = search.trim().toLowerCase();
  const filteredMedia = media.filter(
    (item) =>
      (!folderFilter || item.folder === folderFilter) &&
      (!mediaTypeFilter || mediaCategory(item) === mediaTypeFilter) &&
      (!normalizedSearch ||
        `${item.fileName} ${item.folder} ${item.tagsCsv}`
          .toLowerCase()
          .includes(normalizedSearch)),
  );
  const selectedMedia = media.filter((item) => selectedIds.has(item.id));
  const allSelected =
    filteredMedia.length > 0 &&
    filteredMedia.every((item) => selectedIds.has(item.id));
  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of filteredMedia) {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  }
  function openRetention(items: Media[], forceExpire = false) {
    if (!items.length) return;
    setRetentionTargets(items);
    setRetentionMode(
      forceExpire || items.some((item) => item.storagePolicy === "lesson")
        ? "expire"
        : "keep",
    );
    setRetentionDate(
      dateInputValue(items.length === 1 ? items[0].deleteAfter : undefined, 28),
    );
  }
  async function runBulk(
    action: "delete" | "expire" | "keep",
    items: Media[],
    deleteOn?: string,
  ) {
    if (!items.length) return;
    setBulkBusy(true);
    try {
      await api<{ updated: number }>("/api/v1/media/bulk", {
        method: "POST",
        body: JSON.stringify({
          mediaIds: items.map((item) => item.id),
          action,
          deleteOn: action === "expire" ? deleteOn : null,
        }),
      });
      setSelectedIds(new Set());
      setRetentionTargets([]);
      refresh();
      notify(
        action === "delete"
          ? `${items.length} media item${items.length === 1 ? "" : "s"} deleted.`
          : action === "keep"
            ? `${items.length} media item${items.length === 1 ? "" : "s"} will be kept permanently.`
            : `${items.length} media item${items.length === 1 ? "" : "s"} will be deleted after ${formatDate(deleteOn!)}.`,
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBulkBusy(false);
    }
  }
  async function deleteSelected() {
    if (
      !selectedMedia.length ||
      !await confirmAction(
        `Move ${selectedMedia.length} selected media item${selectedMedia.length === 1 ? "" : "s"} to the recycling bin? They can be restored for 30 days.`,
        { destructive: true, confirmLabel: "Move to recycling bin" },
      )
    )
      return;
    await runBulk("delete", selectedMedia);
  }
  async function saveRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runBulk(
      retentionMode,
      retentionTargets,
      retentionMode === "expire" ? retentionDate : undefined,
    );
  }
  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizeTargets.length) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    const tagsCsv = formTags(form);
    setBulkBusy(true);
    try {
      if (organizeTargets.length === 1)
        await api(`/api/v1/media/${organizeTargets[0].id}/organize`, {
          method: "PATCH",
          body: JSON.stringify({
            fileName: values.fileName,
            folder: values.folder,
            tagsCsv,
          }),
        });
      else
        await api("/api/v1/media/bulk", {
          method: "POST",
          body: JSON.stringify({
            mediaIds: organizeTargets.map((item) => item.id),
            action: "organize",
            folder: values.folder,
            tagsCsv,
          }),
        });
      setOrganizeTargets([]);
      setSelectedIds(new Set());
      refresh();
      notify(
        `${organizeTargets.length} media item${organizeTargets.length === 1 ? "" : "s"} organized.`,
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBulkBusy(false);
    }
  }
  async function renameMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTargets.length) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBulkBusy(true);
    try {
      await api("/api/v1/media/bulk", {
        method: "POST",
        body: JSON.stringify({
          mediaIds: renameTargets.map((item) => item.id),
          action: "rename",
          renames: renameTargets.map((item) => ({
            mediaId: item.id,
            fileName: String(values[`fileName-${item.id}`] || ""),
          })),
        }),
      });
      const count = renameTargets.length;
      setRenameTargets([]);
      setSelectedIds(new Set());
      refresh();
      notify(`${count} media item${count === 1 ? "" : "s"} renamed.`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBulkBusy(false);
    }
  }
  async function loadImpact(item: Media) {
    setManageMedia(item);
    setMediaImpact(undefined);
    try {
      setMediaImpact(await api<MediaImpact>(`/api/v1/media/${item.id}/impact`));
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function reprocessMedia() {
    if (!manageMedia) return;
    setManageBusy(true);
    try {
      await api(`/api/v1/media/${manageMedia.id}/reprocess`, {
        method: "POST",
        body: "{}",
      });
      notify(`${manageMedia.fileName} queued for reprocessing.`);
      setManageMedia(undefined);
      refresh();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setManageBusy(false);
    }
  }
  async function replaceMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      !manageMedia ||
      !await confirmAction(
        `Replace ${manageMedia.fileName}? Every lesson and sign using it will receive the new version.`,
      )
    )
      return;
    setManageBusy(true);
    try {
      await api(`/api/v1/media/${manageMedia.id}/replace`, {
        method: "POST",
        body: form,
      });
      notify(
        `${manageMedia.fileName} replaced; its previous version remains available.`,
      );
      setManageMedia(undefined);
      refresh();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setManageBusy(false);
    }
  }
  async function restoreMediaVersion(version: MediaVersion) {
    if (
      !manageMedia ||
      !await confirmAction(
        `Restore version ${version.versionNumber} of ${version.fileName} as the new current version?`,
      )
    )
      return;
    setManageBusy(true);
    try {
      await api(
        `/api/v1/media/${manageMedia.id}/versions/${version.id}/restore`,
        { method: "POST", body: "{}" },
      );
      notify(
        `Version ${version.versionNumber} restored as a new current version.`,
      );
      setManageMedia(undefined);
      refresh();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setManageBusy(false);
    }
  }
  async function convertPresentation() {
    if (!manageMedia) return;
    setManageBusy(true);
    try {
      await api(`/api/v1/media/${manageMedia.id}/convert`, {
        method: "POST",
        body: "{}",
      });
      notify(
        `${manageMedia.fileName} queued for fully local slide conversion.`,
      );
      setManageMedia(undefined);
      refresh();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setManageBusy(false);
    }
  }
  async function addConvertedSlides() {
    if (!manageMedia || !conversionLessonId) return;
    setManageBusy(true);
    try {
      const result = await api<{ added: number }>(
        `/api/v1/media/${manageMedia.id}/conversion/add-to-lesson`,
        {
          method: "POST",
          body: JSON.stringify({
            lessonId: conversionLessonId,
            imageDurationSeconds: slideSeconds === "" ? null : slideSeconds,
          }),
        },
      );
      notify(`${result.added} converted slides added to the lesson.`);
      setManageMedia(undefined);
      refresh();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setManageBusy(false);
    }
  }
  async function queueTranscodes(
    profile: "all" | "h264-720" | "h264-480" = "all",
  ) {
    if (!manageMedia) return;
    setManageBusy(true);
    try {
      await api(`/api/v1/media/${manageMedia.id}/transcodes/${profile}`, {
        method: "POST",
        body: "{}",
      });
      notify(
        profile === "all"
          ? `${manageMedia.fileName} queued for both adaptive TV profiles.`
          : `${manageMedia.fileName} queued for the ${profile === "h264-720" ? "720p" : "480p"} TV profile.`,
      );
      refresh();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setManageBusy(false);
    }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const files = form
      .getAll("files")
      .filter((item): item is File => item instanceof File && item.size > 0);
    if (!files.length) return;
    const persistent = storagePolicy === "persistent";
    const lessonId = persistent
      ? undefined
      : String(form.get("lessonId") || "");
    setUploading(true);
    setUploadProgress(0);
    try {
      let completed = 0;
      for (const file of files) {
        await uploadMediaFile(file, {
          persistent,
          lessonId,
          folder: String(form.get("folder") || ""),
          tagsCsv: formTags(form),
          onProgress: (percent) =>
            setUploadProgress(
              Math.round(((completed + percent / 100) / files.length) * 100),
            ),
          onControlReady: (control) => {
            setUploadControl(control);
            if (!control) setUploadPaused(false);
          },
        });
        completed++;
        setUploadProgress(Math.round((completed / files.length) * 100));
      }
      notify(
        persistent
          ? `${files.length} reusable file${files.length === 1 ? "" : "s"} stored permanently.`
          : `${files.length} file${files.length === 1 ? "" : "s"} stored until four weeks after the selected lesson.`,
      );
      setShowUpload(false);
      refresh();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }
  async function addLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const doNotDownload = form.get("doNotDownload") === "on";
    const download = linkMode === "download" && !doNotDownload;
    const importPresentation = linkMode === "slides";
    const persistent =
      linkMode === "online" || linkStoragePolicy === "persistent";
    try {
      await api("/api/v1/media/link", {
        method: "POST",
        body: JSON.stringify({
          url: form.get("url"),
          title: form.get("title") || null,
          download,
          importPresentation,
          persistent,
          lessonId: persistent ? null : form.get("lessonId"),
          folder: form.get("folder"),
          tagsCsv: formTags(form),
        }),
      });
      setShowLink(false);
      refresh();
      notify(
        download
          ? "YouTube download queued for local processing."
          : importPresentation
            ? "Google Slides imported and queued for slide conversion."
            : "Online media added to the library.",
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  return (
    <>
      <PageHead
        eyebrow="LOCAL STORAGE"
        title="Media library"
        detail="Files stay on this server. Lesson media expires automatically; reusable media can be kept permanently."
        action={
          canUpload ? (
            <div className="head-actions">
              <button className="button" onClick={() => setShowLink(true)}>
                Add link
              </button>
              <button
                className="button primary"
                onClick={() => setShowUpload(true)}
              >
                Upload media
              </button>
            </div>
          ) : undefined
        }
      />
      {canUpload && storage && (
        <section className="storage-overview" aria-label="LessonCue storage">
          <div>
            <span>Available for uploads</span>
            <strong>{formatBytes(storage.remainingBytes)}</strong>
          </div>
          <StorageMeter storage={storage} />
          <small>
            {formatBytes(storage.usedBytes)} used of{" "}
            {formatBytes(storage.allocationBytes)} allocated
          </small>
        </section>
      )}
      {previewMedia && (
        <Modal
          title={`Preview: ${previewMedia.fileName}`}
          onClose={() => setPreviewMedia(undefined)}
        >
          <MediaPreview media={previewMedia} />
        </Modal>
      )}
      {retentionTargets.length > 0 && (
        <Modal
          title={
            retentionTargets.length === 1
              ? `Retention: ${retentionTargets[0].fileName}`
              : `Retention for ${retentionTargets.length} items`
          }
          onClose={() => !bulkBusy && setRetentionTargets([])}
        >
          <form className="stack" onSubmit={saveRetention}>
            <fieldset className="retention-options">
              <legend>
                How long should LessonCue keep{" "}
                {retentionTargets.length === 1 ? "this media" : "these items"}?
              </legend>
              <label>
                <input
                  type="radio"
                  checked={retentionMode === "expire"}
                  onChange={() => setRetentionMode("expire")}
                />
                <span>
                  <strong>Delete on a selected date</strong>
                  <small>
                    The media remains available through the end of that date.
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  checked={retentionMode === "keep"}
                  onChange={() => setRetentionMode("keep")}
                />
                <span>
                  <strong>Keep permanently</strong>
                  <small>Retain it until someone explicitly deletes it.</small>
                </span>
              </label>
            </fieldset>
            {retentionMode === "expire" && (
              <Field label="Delete after">
                <input
                  type="date"
                  value={retentionDate}
                  min={dateInputValue()}
                  onChange={(e) => setRetentionDate(e.target.value)}
                  required
                  autoFocus
                />
              </Field>
            )}
            <button className="button primary" disabled={bulkBusy}>
              {bulkBusy ? "Saving…" : "Save retention"}
            </button>
          </form>
        </Modal>
      )}
      {renameTargets.length > 0 && (
        <Modal
          title={`Rename ${renameTargets.length} selected media item${renameTargets.length === 1 ? "" : "s"}`}
          onClose={() => !bulkBusy && setRenameTargets([])}
        >
          <form className="stack" onSubmit={renameMedia}>
            {renameTargets.map((item, index) => (
              <Field
                key={item.id}
                label={
                  renameTargets.length === 1
                    ? "New name"
                    : `New name for ${item.fileName}`
                }
              >
                <div className="locked-extension-input">
                  <input
                    name={`fileName-${item.id}`}
                    maxLength={255}
                    required
                    autoFocus={index === 0}
                    defaultValue={mediaNameStem(item.fileName)}
                    aria-label={`New name for ${item.fileName}`}
                  />
                  {mediaFileExtension(item.fileName) && (
                    <span>{mediaFileExtension(item.fileName)}</span>
                  )}
                </div>
              </Field>
            ))}
            <div className="alert">
              Enter the new name without changing the locked file extension.
              Names must be unique within the media library.
            </div>
            <button className="button primary" disabled={bulkBusy}>
              {bulkBusy ? "Renaming…" : "Rename selected media"}
            </button>
          </form>
        </Modal>
      )}
      {organizeTargets.length > 0 && (
        <Modal
          title={
            organizeTargets.length === 1
              ? `Organize: ${organizeTargets[0].fileName}`
              : `Organize ${organizeTargets.length} items`
          }
          onClose={() => !bulkBusy && setOrganizeTargets([])}
        >
          <form className="stack" onSubmit={saveOrganization}>
            {organizeTargets.length === 1 && (
              <Field label="Display name">
                <div className="locked-extension-input">
                  <input
                    name="fileName"
                    defaultValue={mediaNameStem(organizeTargets[0].fileName)}
                    maxLength={255}
                    required
                  />
                  {mediaFileExtension(organizeTargets[0].fileName) && (
                    <span>{mediaFileExtension(organizeTargets[0].fileName)}</span>
                  )}
                </div>
              </Field>
            )}
            <TaxonomyFields
              taxonomy={taxonomy}
              folder={
                organizeTargets.length === 1 ? organizeTargets[0].folder : ""
              }
              tagsCsv={
                organizeTargets.length === 1 ? organizeTargets[0].tagsCsv : ""
              }
            />
            {organizeTargets.length > 1 && (
              <div className="alert">
                Folder and tags will replace the current values on all selected
                items.
              </div>
            )}
            <button className="button primary" disabled={bulkBusy}>
              {bulkBusy ? "Saving…" : "Save organization"}
            </button>
          </form>
        </Modal>
      )}
      {manageMedia && (
        <MediaManagerModal
          media={manageMedia}
          impact={mediaImpact}
          lessons={availableLessons}
          busy={manageBusy}
          conversionLessonId={conversionLessonId}
          slideSeconds={slideSeconds}
          onClose={() => !manageBusy && setManageMedia(undefined)}
          onOrganize={() => {
            setOrganizeTargets([manageMedia]);
            setManageMedia(undefined);
          }}
          onReprocess={reprocessMedia}
          onQueueTranscodes={queueTranscodes}
          onReplace={replaceMedia}
          onRestoreVersion={restoreMediaVersion}
          onConvert={convertPresentation}
          onAddSlides={addConvertedSlides}
          onConversionLesson={setConversionLessonId}
          onSlideSeconds={setSlideSeconds}
        />
      )}
      {showUpload && (
        <Modal
          title="Upload media"
          onClose={() => !uploading && setShowUpload(false)}
        >
          <form className="stack" onSubmit={upload}>
            <Field
              label="Files"
              hint="Presentation formats are converted locally to slide images."
            >
              <input
                name="files"
                type="file"
                multiple
                accept="video/*,audio/*,image/*,.pdf,.ppt,.pptx,.pps,.ppsx,.pot,.potx,.odp,.key,.doc,.docx"
                required
                disabled={uploading}
              />
            </Field>
            <TaxonomyFields taxonomy={taxonomy} />
            <fieldset className="retention-options">
              <legend>How long should LessonCue keep these files?</legend>
              {availableLessons.length > 0 && (
                <label>
                  <input
                    type="radio"
                    name="storagePolicy"
                    value="lesson"
                    checked={storagePolicy === "lesson"}
                    onChange={() => setStoragePolicy("lesson")}
                  />
                  <span>
                    <strong>For a lesson (default)</strong>
                    <small>
                      Delete automatically four weeks after the lesson date.
                    </small>
                  </span>
                </label>
              )}
              <label>
                <input
                  type="radio"
                  name="storagePolicy"
                  value="persistent"
                  checked={storagePolicy === "persistent"}
                  onChange={() => setStoragePolicy("persistent")}
                />
                <span>
                  <strong>Keep permanently</strong>
                  <small>
                    Store in the reusable media library until someone deletes
                    it.
                  </small>
                </span>
              </label>
            </fieldset>
            {storagePolicy === "lesson" && (
              <Field
                label="Lesson"
                hint="Reusing the file in a later lesson automatically extends its deletion date."
              >
                <select
                  name="lessonId"
                  defaultValue={firstUpcoming?.id}
                  required
                >
                  {availableLessons.map((l) => (
                    <option value={l.id} key={l.id}>
                      {formatDate(l.date)} — {l.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {!availableLessons.length && (
              <div className="alert">
                Create a lesson before uploading temporary lesson media. This
                upload will be kept permanently.
              </div>
            )}
            <button className="button primary" disabled={uploading}>
              {uploading
                ? `Uploading ${uploadProgress}%`
                : "Upload to local server"}
            </button>
            {uploading && uploadControl && (
              <div className="button-row upload-controls">
                <button
                  type="button"
                  className="button"
                  onClick={async () => {
                    if (uploadPaused) {
                      await uploadControl.resume();
                      setUploadPaused(false);
                    } else {
                      await uploadControl.pause();
                      setUploadPaused(true);
                    }
                  }}
                >
                  {uploadPaused ? "Resume upload" : "Pause upload"}
                </button>
                <button
                  type="button"
                  className="button danger"
                  onClick={() => void uploadControl.cancel()}
                >
                  Cancel upload
                </button>
              </div>
            )}
            {uploadPaused && (
              <div className="alert">
                Upload paused. Received chunks and reserved storage are kept for
                24 hours.
              </div>
            )}
          </form>
        </Modal>
      )}
      {showLink && (
        <Modal
          title="Add online media or slides"
          onClose={() => setShowLink(false)}
        >
          <form className="stack" onSubmit={addLink}>
            <Field
              label={
                linkMode === "slides"
                  ? "Google Slides share URL"
                  : "Webpage or YouTube URL"
              }
              hint={
                linkMode === "slides"
                  ? "The deck must be shared so anyone with the link can view it. LessonCue downloads a PDF copy and converts it locally."
                  : "Online entries require internet. YouTube videos can instead be copied into local storage."
              }
            >
              <input
                name="url"
                type="url"
                required
                autoFocus
                placeholder="https://…"
              />
            </Field>
            <fieldset className="retention-options">
              <legend>How should LessonCue use it?</legend>
              <label>
                <input
                  type="radio"
                  checked={linkMode === "online"}
                  onChange={() => setLinkMode("online")}
                />
                <span>
                  <strong>Use online</strong>
                  <small>Display a webpage or embedded YouTube player.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  checked={linkMode === "download"}
                  onChange={() => setLinkMode("download")}
                />
                <span>
                  <strong>Download YouTube locally</strong>
                  <small>Use only for video you are authorized to copy.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  checked={linkMode === "slides"}
                  onChange={() => setLinkMode("slides")}
                />
                <span>
                  <strong>Import Google Slides</strong>
                  <small>
                    Save a local PDF and convert every slide to a screen-ready
                    image.
                  </small>
                </span>
              </label>
            </fieldset>
            {linkMode !== "slides" && (
              <label>
                <input type="checkbox" name="doNotDownload" />
                <span>
                  <strong>Do not download locally</strong>
                  <small>Keep this entry online-only (metadata only).</small>
                </span>
              </label>
            )}
            {linkMode !== "online" && (
              <fieldset className="retention-options">
                <legend>How long should LessonCue keep the local copy?</legend>
                {availableLessons.length > 0 && (
                  <label>
                    <input
                      type="radio"
                      checked={linkStoragePolicy === "lesson"}
                      onChange={() => setLinkStoragePolicy("lesson")}
                    />
                    <span>
                      <strong>For a lesson (default)</strong>
                      <small>
                        Delete automatically four weeks after its lesson.
                      </small>
                    </span>
                  </label>
                )}
                <label>
                  <input
                    type="radio"
                    checked={linkStoragePolicy === "persistent"}
                    onChange={() => setLinkStoragePolicy("persistent")}
                  />
                  <span>
                    <strong>Keep permanently</strong>
                    <small>Store until someone deletes it.</small>
                  </span>
                </label>
              </fieldset>
            )}
            {linkMode !== "online" && linkStoragePolicy === "lesson" && (
              <Field label="Lesson">
                <select
                  name="lessonId"
                  defaultValue={firstUpcoming?.id}
                  required
                >
                  {availableLessons.map((l) => (
                    <option value={l.id} key={l.id}>
                      {formatDate(l.date)} — {l.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Display title">
              <input name="title" maxLength={240} />
            </Field>
            <TaxonomyFields taxonomy={taxonomy} />
            <button className="button primary">
              {linkMode === "download"
                ? "Queue local download"
                : linkMode === "slides"
                  ? "Import and convert slides"
                  : "Add online media"}
            </button>
          </form>
        </Modal>
      )}
      {media.length > 0 && (
        <section className="media-filters">
          <Field label="Search media">
            <div className="search-input-wrapper">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, folder, or tag"
              />
              {search && (
                <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="Clear search">×</button>
              )}
            </div>
          </Field>
          <Field label="Folder">
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
            >
              <option value="">All folders</option>
              {folders.map((folder) => (
                <option value={folder} key={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Media type">
            <select
              value={mediaTypeFilter}
              onChange={(e) => setMediaTypeFilter(e.target.value)}
            >
              <option value="">All media types</option>
              <option value="video">Video</option>
              <option value="image">Image</option>
              <option value="audio">Audio</option>
              <option value="presentation">Presentation</option>
              <option value="pdf">PDF</option>
              <option value="website">Website</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <div className="media-filters-right">
            <span>
              {filteredMedia.length} of {media.length} items
            </span>
            <div className="view-toggle">
              <button
                className={viewMode === "grid" ? "active" : ""}
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                title="Grid view"
              >⊞</button>
              <button
                className={viewMode === "list" ? "active" : ""}
                onClick={() => setViewMode("list")}
                aria-label="List view"
                title="List view"
              >☰</button>
            </div>
          </div>
        </section>
      )}
      {viewMode === "grid" && filteredMedia.length > 0 && (
        <section className="media-preview-grid" aria-label="Media previews">
          {filteredMedia.map((item) => (
            <button
              key={item.id}
              onClick={() => setPreviewMedia(item)}
              disabled={item.processingStatus !== "ready"}
            >
              <span>
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" />
                ) : item.contentType.startsWith("audio") ? (
                  "♫"
                ) : item.sourceKind === "link" ? (
                  "↗"
                ) : (
                  "▶"
                )}
              </span>
              <strong>{item.fileName}</strong>
              <small>
                {item.folder ||
                  item.tagsCsv ||
                  (item.processingStatus === "ready"
                    ? "Preview"
                    : item.processingStatus)}
              </small>
            </button>
          ))}
        </section>
      )}
      {viewMode === "list" && canUpload && selectedMedia.length > 0 && (
        <section className="bulk-actions" aria-label="Bulk media actions">
          <strong>{selectedMedia.length} selected</strong>
          <span>
            Rename, organize, change retention, or move selected media to the
            30-day recycling bin.
          </span>
          <div>
            <button
              className="button"
              onClick={() => setRenameTargets(selectedMedia)}
              disabled={bulkBusy}
            >
              Rename
            </button>
            <button
              className="button"
              onClick={() => setOrganizeTargets(selectedMedia)}
              disabled={bulkBusy}
            >
              Folder & tags
            </button>
            <button
              className="button"
              onClick={() => openRetention(selectedMedia, true)}
              disabled={bulkBusy}
            >
              Set expiration
            </button>
            <button
              className="button"
              onClick={() => runBulk("keep", selectedMedia)}
              disabled={bulkBusy}
            >
              Keep permanently
            </button>
            <button
              className="button danger"
              onClick={deleteSelected}
              disabled={bulkBusy}
            >
              Recycle
            </button>
          </div>
        </section>
      )}
      {viewMode === "list" && (
      <section className="panel">
        <div className="media-table table-head">
          <label className="media-select">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={!canUpload || !filteredMedia.length}
              aria-label="Select all visible media"
            />
          </label>
          <span>File</span>
          <span>Type</span>
          <span>Duration</span>
          <span>Size</span>
          <span>Retention</span>
          <span>Status</span>
        </div>
        {filteredMedia.length ? (
          filteredMedia.map((m) => (
            <div
              className={`media-table ${selectedIds.has(m.id) ? "selected" : ""}`}
              key={m.id}
            >
              <label className="media-select">
                <input
                  type="checkbox"
                  checked={selectedIds.has(m.id)}
                  onChange={() => toggleSelection(m.id)}
                  disabled={!canUpload}
                  aria-label={`Select ${m.fileName}`}
                />
              </label>
              <span className="media-name">
                {m.thumbnailUrl ? (
                  <img src={m.thumbnailUrl} alt="" />
                ) : (
                  <b>
                    {m.contentType.startsWith("video")
                      ? "▶"
                      : m.contentType.startsWith("audio")
                        ? "♫"
                        : m.sourceKind === "link"
                          ? "↗"
                          : "▧"}
                  </b>
                )}
                <span>
                  <strong>{m.fileName}</strong>
                  <small>
                    {[m.folder || "Unfiled", m.tagsCsv, `v${m.version}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  {canUpload && (
                    <button
                      className="media-manage"
                      onClick={() => loadImpact(m)}
                    >
                      Manage versions & impact
                    </button>
                  )}
                </span>
              </span>
              <span>
                {m.sourceKind === "link"
                  ? `${m.linkKind} link`
                  : friendlyType(m.contentType)}
              </span>
              <span>{formatDuration(m.durationMs)}</span>
              <span>{formatBytes(m.sizeBytes)}</span>
              <button
                type="button"
                className={`retention-badge ${m.storagePolicy === "lesson" ? "temporary" : ""}`}
                onClick={() => openRetention([m])}
                disabled={!canUpload}
              >
                {m.storagePolicy === "lesson" && m.deleteAfter
                  ? `Deletes ${formatShortDate(m.deleteAfter)}`
                  : "Keep permanently"}
                <small>
                  {m.retentionDateIsManual
                    ? "Selected date"
                    : m.storagePolicy === "lesson"
                      ? "Based on lesson"
                      : ""}
                </small>
              </button>
              <span
                className={`availability ${m.offlineEligible ? "" : "internet"}`}
              >
                <i className="available-dot" />{" "}
                {m.processingStatus === "pending" ||
                m.processingStatus === "processing"
                  ? m.compatibilityStatus === "converting"
                    ? "Making TV copy"
                    : "Processing"
                  : m.processingStatus === "failed"
                    ? "Processing failed"
                    : m.compatibilityStatus === "ready"
                      ? "TV copy ready"
                      : m.offlineEligible
                        ? "TV ready"
                        : "Internet required"}
              </span>
            </div>
          ))
        ) : (
          <Empty
            title={
              media.length
                ? "No media matches these filters"
                : "No media uploaded"
            }
            body={
              media.length
                ? "Clear the search or choose All folders."
                : "Upload MP4, MOV, audio, image, PDF, or PowerPoint files."
            }
          />
        )}
      </section>
      )}
    </>
  );
}

export function MediaManagerModal({
  media,
  impact,
  lessons,
  busy,
  conversionLessonId,
  slideSeconds,
  onClose,
  onOrganize,
  onReprocess,
  onQueueTranscodes,
  onReplace,
  onRestoreVersion,
  onConvert,
  onAddSlides,
  onConversionLesson,
  onSlideSeconds,
}: {
  media: Media;
  impact?: MediaImpact;
  lessons: Lesson[];
  busy: boolean;
  conversionLessonId: string;
  slideSeconds: number | "";
  onClose: () => void;
  onOrganize: () => void;
  onReprocess: () => void;
  onQueueTranscodes: (profile?: "all" | "h264-720" | "h264-480") => void;
  onReplace: (event: FormEvent<HTMLFormElement>) => void;
  onRestoreVersion: (version: MediaVersion) => void;
  onConvert: () => void;
  onAddSlides: () => void;
  onConversionLesson: (id: string) => void;
  onSlideSeconds: (seconds: number | "") => void;
}) {
  const converting =
    media.conversionStatus === "pending" ||
    media.conversionStatus === "converting";
  return (
    <Modal title={`Manage: ${media.fileName}`} onClose={onClose}>
      <div className="media-manager">
        <div className="media-manager-summary">
          <div>
            <span>CURRENT VERSION</span>
            <strong>v{media.version}</strong>
          </div>
          <div>
            <span>LESSON USES</span>
            <strong>
              {impact?.lessons.reduce(
                (sum, lesson) => sum + lesson.itemCount,
                0,
              ) ?? "…"}
            </strong>
          </div>
          <div>
            <span>TEMPLATE USES</span>
            <strong>
              {impact?.templates.reduce(
                (sum, template) => sum + template.itemCount,
                0,
              ) ?? "…"}
            </strong>
          </div>
          <div>
            <span>SIGNAGE USES</span>
            <strong>{impact?.signage.length ?? "…"}</strong>
          </div>
        </div>
        {media.videoCodec && (
          <>
            <section
              className={`compatibility-card ${media.compatibilityStatus}`}
            >
              <div>
                <span>UNIVERSAL TV PLAYBACK</span>
                <strong>
                  {media.compatibilityStatus === "ready"
                    ? "Universal 1080p H.264/AAC copy ready"
                    : media.compatibilityStatus === "native"
                      ? "Original is universally TV-compatible"
                      : media.compatibilityStatus === "converting"
                        ? "Creating the universal copy…"
                        : media.compatibilityStatus === "failed"
                          ? "Compatibility conversion failed"
                          : "Compatibility check pending"}
                </strong>
                <p>
                  {media.compatibilityError ||
                    (media.compatibilityStatus === "ready"
                      ? `LessonCue kept the original and serves a ${formatBytes(media.compatibilitySizeBytes || 0)} MP4 fallback to every TV${media.compatibilityTranscodeEngine ? `, created with ${media.compatibilityTranscodeEngine}` : ""}.`
                      : "LessonCue checks every upload locally and converts only when the original may not play reliably on Android TV, Google TV, or Fire TV.")}
                </p>
              </div>
              {media.compatibilityTranscodedAt && (
                <small>
                  {new Date(media.compatibilityTranscodedAt).toLocaleString()}
                </small>
              )}
            </section>
            <section className="transcode-card">
              <div className="settings-heading">
                <div>
                  <span>ADAPTIVE TV PROFILES</span>
                  <h3>Smaller copies for slower rooms</h3>
                  <p>
                    LessonCue automatically chooses 720p or 480p from each
                    screen's decoder, network, and free-storage report. The
                    universal copy remains the fallback.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => onQueueTranscodes("all")}
                  disabled={busy || media.processingStatus !== "ready"}
                >
                  {busy ? "Queueing…" : "Generate both"}
                </button>
              </div>
              <div className="transcode-profile-list">
                {(["h264-720", "h264-480"] as const).map((profile) => {
                  const variant = media.transcodes?.find(
                    (item) => item.profile === profile,
                  );
                  const label =
                    profile === "h264-720"
                      ? "720p · 4 Mbps"
                      : "480p · 1.5 Mbps";
                  return (
                    <div key={profile} className={variant?.status || "missing"}>
                      <span>
                        <strong>{label}</strong>
                        <small>
                          {variant?.status === "ready"
                            ? `${formatBytes(variant.sizeBytes)} · ${variant.transcodeEngine || "local encoder"} · ready ${variant.completedAt ? timeAgo(variant.completedAt) : "now"}`
                            : variant?.status === "converting"
                              ? "Converting locally…"
                              : variant?.status === "pending"
                                ? "Waiting in the local queue…"
                                : variant?.status === "failed"
                                  ? variant.error || "Conversion failed"
                                  : "Generated automatically before an assigned lesson needs it."}
                        </small>
                      </span>
                      <span
                        className={`availability ${variant?.status === "failed" ? "internet" : ""}`}
                      >
                        <i className="available-dot" />{" "}
                        {variant?.status || "not generated"}
                      </span>
                      {variant?.status === "failed" && (
                        <button
                          className="button"
                          onClick={() => onQueueTranscodes(profile)}
                          disabled={busy}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
        <div className="head-actions">
          <button className="button" onClick={onOrganize}>
            Rename, folder & tags
          </button>
          {media.sourceKind !== "link" && (
            <button className="button" onClick={onReprocess} disabled={busy}>
              Reprocess metadata
            </button>
          )}
        </div>
        {isConvertibleDocument(media) && (
          <section className={`conversion-card ${media.conversionStatus}`}>
            <div>
              <span>LOCAL SLIDE CONVERSION</span>
              <h3>
                {media.conversionStatus === "ready"
                  ? `${convertedSlideCount(media)} screen-ready slides`
                  : media.conversionStatus === "failed"
                    ? "Conversion needs attention"
                    : converting
                      ? "Conversion in progress…"
                      : "Turn this document into slides"}
              </h3>
              <p>
                {media.conversionError ||
                  "LessonCue uses LibreOffice and Poppler on this server; the document is never uploaded to a cloud service."}
              </p>
            </div>
            {media.conversionStatus === "ready" ? (
              <div className="conversion-add">
                <Field label="Add slides to lesson">
                  <select
                    value={conversionLessonId}
                    onChange={(event) => onConversionLesson(event.target.value)}
                  >
                    {lessons.map((lesson) => (
                      <option value={lesson.id} key={lesson.id}>
                        {formatDate(lesson.date)} — {lesson.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Time each slide" hint="Optional; blank keeps the slide sequence untimed.">
                  <input
                    type="number"
                    min="1"
                    max="3600"
                    placeholder="Untimed"
                    value={slideSeconds}
                    onChange={(event) => onSlideSeconds(
                      event.target.value === "" ? "" : Number(event.target.value),
                    )}
                  />
                </Field>
                <button
                  className="button primary"
                  onClick={onAddSlides}
                  disabled={busy || !conversionLessonId}
                >
                  Add slide sequence
                </button>
                <button className="button" onClick={onConvert} disabled={busy}>
                  Convert again
                </button>
              </div>
            ) : (
              <button
                className="button primary"
                onClick={onConvert}
                disabled={busy || converting}
              >
                {media.conversionStatus === "failed"
                  ? "Try conversion again"
                  : converting
                    ? "Converting…"
                    : "Convert to slides"}
              </button>
            )}
          </section>
        )}
        {media.sourceKind !== "link" && (
          <form className="replace-media" onSubmit={onReplace}>
            <Field
              label="Replace current file"
              hint="Every lesson and sign keeps using this media ID. The current file is archived as a restorable version."
            >
              <input
                name="file"
                type="file"
                accept="video/*,audio/*,image/*,.pdf,.ppt,.pptx,.pps,.ppsx,.pot,.potx,.odp,.key,.doc,.docx"
                required
                disabled={busy}
              />
            </Field>
            <button className="button primary" disabled={busy}>
              {busy ? "Working…" : "Preview impact and replace"}
            </button>
          </form>
        )}
        <section className="impact-list">
          <h3>Current impact</h3>
          {impact?.lessons.map((lesson) => (
            <div key={lesson.id}>
              <span>
                {formatDate(lesson.date)} · {lesson.title}
              </span>
              <strong>
                {lesson.itemCount} cue{lesson.itemCount === 1 ? "" : "s"}
              </strong>
            </div>
          ))}
          {impact?.templates.map((template) => (
            <div key={template.id}>
              <span>{template.name}</span>
              <strong>
                {template.itemCount} template cue
                {template.itemCount === 1 ? "" : "s"}
              </strong>
            </div>
          ))}
          {impact?.signage.map((sign) => (
            <div key={sign.id}>
              <span>{sign.name}</span>
              <strong>{sign.enabled ? "Active sign" : "Inactive sign"}</strong>
            </div>
          ))}
          {impact &&
            !impact.lessons.length &&
            !impact.templates.length &&
            !impact.signage.length && (
              <p className="settings-copy">
                This media is not currently used by a lesson, template, or sign.
              </p>
            )}
        </section>
        <section className="version-list">
          <h3>Previous versions</h3>
          {impact?.versions.map((version) => (
            <div key={version.id}>
              <span>
                <strong>
                  v{version.versionNumber} · {version.fileName}
                </strong>
                <small>
                  {formatBytes(version.sizeBytes)} · archived{" "}
                  {new Date(version.archivedAt).toLocaleString()} by{" "}
                  {version.archivedBy}
                </small>
              </span>
              <div>
                <a className="button" href={version.downloadUrl}>
                  Download
                </a>
                <button
                  className="button"
                  onClick={() => onRestoreVersion(version)}
                  disabled={busy}
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
          {impact && !impact.versions.length && (
            <p className="settings-copy">
              No previous versions yet. The first replacement will archive the
              current file here.
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}
