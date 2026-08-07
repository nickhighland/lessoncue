import { useEffect, useRef, useState } from "react";
import { CuePoint, Media, PlaylistItem } from "./models";
import { Field } from "./ui";
import { cuePoints, formatBytes, formatDuration, formatPreciseTime, isConvertibleDocument, youtubeEmbedUrl } from "./utils";

export function TimelineEditor({
  media,
  item,
  onSave,
}: {
  media?: Media;
  item: PlaylistItem;
  onSave: (changes: Record<string, unknown>) => void | Promise<void>;
}) {
  const duration = Math.max(
    0.04,
    (media?.durationMs || item.mediaDurationMs || item.durationMs || 1_000) /
      1000,
  );
  const [start, setStart] = useState(Math.min(duration, item.startMs / 1000));
  const [end, setEnd] = useState(
    Math.min(
      duration,
      (item.endMs ||
        media?.durationMs ||
        item.mediaDurationMs ||
        item.durationMs ||
        1_000) / 1000,
    ),
  );
  const [fadeIn, setFadeIn] = useState((item.fadeInMs || 0) / 1000);
  const [fadeOut, setFadeOut] = useState((item.fadeOutMs || 0) / 1000);
  const [markers, setMarkers] = useState<CuePoint[]>(() => cuePoints(item));
  const [markerName, setMarkerName] = useState("");
  const [cursor, setCursor] = useState(Math.min(duration, item.startMs / 1000));
  const [activeControl, setActiveControl] = useState<
    "in" | "out" | "fade-in" | "fade-out"
  >("in");
  const [visualFadeOpacity, setVisualFadeOpacity] = useState(
    fadeIn > 0 ? 1 : 0,
  );
  const player = useRef<HTMLMediaElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ kind: "trim" | "fade"; edge: "start" | "end" | "in" | "out" } | undefined>(undefined);
  const source = media?.playbackUrl || media?.downloadUrl;
  const startPercent = (start / duration) * 100;
  const endPercent = (end / duration) * 100;
  function seek(value: number, edge: "start" | "end") {
    const next = Math.max(0, Math.min(duration, Math.round(value * 25) / 25));
    const nextStart = edge === "start" ? Math.min(next, end - 0.04) : start;
    const nextEnd = edge === "end" ? Math.max(next, start + 0.04) : end;
    setStart(nextStart);
    setEnd(nextEnd);
    const selection = Math.max(0.04, nextEnd - nextStart);
    setFadeIn((current) => Math.min(current, selection));
    setFadeOut((current) => Math.min(current, selection));
    const exactEdge = edge === "start" ? nextStart : nextEnd;
    const playablePosition =
      edge === "end"
        ? Math.max(nextStart, Math.min(duration - 0.001, nextEnd - 0.001))
        : nextStart;
    setActiveControl(edge === "start" ? "in" : "out");
    setCursor(exactEdge);
    setVisualFadeOpacity(
      (edge === "start" && fadeIn > 0) || (edge === "end" && fadeOut > 0)
        ? 1
        : 0,
    );
    if (player.current) {
      player.current.pause();
      player.current.currentTime = playablePosition;
    }
  }
  function changeFade(value: number, edge: "in" | "out") {
    const next = Math.max(
      0,
      Math.min(end - start, Math.round(value * 10) / 10),
    );
    if (edge === "in") setFadeIn(next);
    else setFadeOut(next);
    const previewPosition = edge === "in" ? start + next / 2 : end - next / 2;
    setActiveControl(edge === "in" ? "fade-in" : "fade-out");
    setCursor(previewPosition);
    setVisualFadeOpacity(next > 0 ? 0.5 : 0);
    if (player.current) {
      player.current.pause();
      player.current.currentTime = Math.max(
        0,
        Math.min(duration - 0.001, previewPosition),
      );
    }
  }
  function pointerValue(clientX: number) {
    const bounds = timeline.current?.getBoundingClientRect();
    return bounds
      ? Math.max(
          0,
          Math.min(
            duration,
            ((clientX - bounds.left) / bounds.width) * duration,
          ),
        )
      : 0;
  }
  function beginTrim(
    event: React.PointerEvent<HTMLButtonElement>,
    edge: "start" | "end",
  ) {
    event.preventDefault();
    dragRef.current = { kind: "trim", edge };
    event.currentTarget.setPointerCapture(event.pointerId);
    seek(pointerValue(event.clientX), edge);
  }
  function nudgeTrim(
    event: React.KeyboardEvent<HTMLButtonElement>,
    edge: "start" | "end",
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    seek(
      (edge === "start" ? start : end) +
        (event.key === "ArrowRight" ? 0.04 : -0.04),
      edge,
    );
  }
  function beginFade(
    event: React.PointerEvent<HTMLButtonElement>,
    edge: "in" | "out",
  ) {
    event.preventDefault();
    dragRef.current = { kind: "fade", edge };
    event.currentTarget.setPointerCapture(event.pointerId);
    changeFade(
      edge === "in"
        ? pointerValue(event.clientX) - start
        : end - pointerValue(event.clientX),
      edge,
    );
  }
  function dragPointer(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const value = pointerValue(event.clientX);
    if (drag.kind === "trim") {
      seek(value, drag.edge as "start" | "end");
    } else {
      const edge = drag.edge as "in" | "out";
      changeFade(edge === "in" ? value - start : end - value, edge);
    }
  }
  function endPointer() {
    dragRef.current = undefined;
  }
  function nudgeFade(
    event: React.KeyboardEvent<HTMLButtonElement>,
    edge: "in" | "out",
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 0.1 : -0.1;
    changeFade(
      (edge === "in" ? fadeIn : fadeOut) +
        (edge === "in" ? direction : -direction),
      edge,
    );
  }
  function updatePreview(element: HTMLMediaElement) {
    const position = element.currentTime;
    setCursor(position);
    if (position >= end) {
      element.pause();
      element.currentTime = start;
      return;
    }
    const intoSelection = position - start;
    const remaining = end - position;
    const fade = Math.min(
      fadeIn ? intoSelection / fadeIn : 1,
      fadeOut ? remaining / fadeOut : 1,
      1,
    );
    element.volume = item.muted
      ? 0
      : Math.max(0, Math.min(1, (item.volumePercent / 100) * fade));
    element.playbackRate = Math.max(
      0.25,
      Math.min(4, (item.playbackRatePercent || 100) / 100),
    );
    const transition =
      item.transitionStyle === "fade-black"
        ? (item.transitionDurationMs || 0) / 1000
        : 0;
    const transitionFade = transition
      ? Math.min(intoSelection / transition, remaining / transition, 1)
      : 1;
    setVisualFadeOpacity(1 - Math.max(0, Math.min(1, fade, transitionFade)));
  }
  function jumpToMarker(marker: CuePoint) {
    const position = Math.max(start, Math.min(end, marker.positionMs / 1000));
    setCursor(position);
    if (player.current) player.current.currentTime = position;
  }
  function addMarker() {
    const name = markerName.trim() || `Marker ${markers.length + 1}`;
    const positionMs = Math.round(
      Math.max(start, Math.min(end, cursor)) * 1000,
    );
    setMarkers((current) =>
      [...current, { name, positionMs }].sort(
        (a, b) => a.positionMs - b.positionMs,
      ),
    );
    setMarkerName("");
  }
  if (
    !media ||
    !source ||
    (!media.contentType.startsWith("video/") &&
      !media.contentType.startsWith("audio/"))
  )
    return <MediaPreview media={media} item={item} />;
  return (
    <section className="timeline-editor">
      <div
        className={`timeline-player editing-${activeControl}`}
        style={{
          backgroundColor:
            item.fitMode === "letterbox"
              ? "#000000"
              : item.backgroundColor || "#000000",
        }}
      >
        {media.contentType.startsWith("video/") ? (
          <>
            <video
              style={cuePreviewStyle(item)}
              ref={player as React.RefObject<HTMLVideoElement>}
              src={source}
              controls
              playsInline
              onLoadedMetadata={(e) => {
                e.currentTarget.currentTime = start;
                updatePreview(e.currentTarget);
              }}
              onTimeUpdate={(e) => updatePreview(e.currentTarget)}
            />
            <span
              className="visual-fade-overlay"
              style={{ opacity: visualFadeOpacity }}
            />
          </>
        ) : (
          <audio
            ref={player as React.RefObject<HTMLAudioElement>}
            src={source}
            controls
            onLoadedMetadata={(e) => {
              e.currentTarget.currentTime = start;
            }}
            onTimeUpdate={(e) => updatePreview(e.currentTarget)}
          />
        )}
        <span className="timeline-preview-label">
          Previewing{" "}
          {activeControl === "in"
            ? "trim in"
            : activeControl === "out"
              ? "trim out"
              : activeControl.replace("-", " ")}{" "}
          · {formatPreciseTime(cursor)}
        </span>
      </div>
      <div
        ref={timeline}
        className="timeline-art"
        aria-label="Media filmstrip, waveform, selected playback area, fade regions, cue markers, and draggable trim handles"
        onPointerMove={dragPointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {media.filmstripUrl && (
          <img src={media.filmstripUrl} alt="Video filmstrip" />
        )}
        {media.waveformUrl && (
          <img
            className="waveform"
            src={media.waveformUrl}
            alt="Audio waveform"
          />
        )}
        <i className="trim-before" style={{ width: `${startPercent}%` }} />
        <i className="trim-after" style={{ left: `${endPercent}%` }} />
        <span
          className="selection"
          style={{
            left: `${startPercent}%`,
            width: `${Math.max(0, endPercent - startPercent)}%`,
          }}
        />
        {fadeIn > 0 && (
          <span
            className={`fade-zone fade-in ${activeControl === "fade-in" ? "active" : ""}`}
            style={{
              left: `${startPercent}%`,
              width: `${Math.min(endPercent - startPercent, (fadeIn / duration) * 100)}%`,
            }}
          >
            FADE IN
          </span>
        )}
        {fadeOut > 0 && (
          <span
            className={`fade-zone fade-out ${activeControl === "fade-out" ? "active" : ""}`}
            style={{
              left: `${Math.max(startPercent, endPercent - (fadeOut / duration) * 100)}%`,
              width: `${Math.min(endPercent - startPercent, (fadeOut / duration) * 100)}%`,
            }}
          >
            FADE OUT
          </span>
        )}
        <button
          type="button"
          className={`trim-handle trim-start ${activeControl === "in" ? "active" : ""}`}
          style={{ left: `${startPercent}%` }}
          aria-label={`Trim in at ${formatPreciseTime(start)}. Drag to adjust.`}
          onPointerDown={(event) => beginTrim(event, "start")}
          onKeyDown={(event) => nudgeTrim(event, "start")}
        >
          <span>IN</span>
        </button>
        <button
          type="button"
          className={`trim-handle trim-end ${activeControl === "out" ? "active" : ""}`}
          style={{ left: `${endPercent}%` }}
          aria-label={`Trim out at ${formatPreciseTime(end)}. Drag to adjust.`}
          onPointerDown={(event) => beginTrim(event, "end")}
          onKeyDown={(event) => nudgeTrim(event, "end")}
        >
          <span>OUT</span>
        </button>
        <button
          type="button"
          className={`fade-handle fade-start ${activeControl === "fade-in" ? "active" : ""}`}
          style={{ left: `${startPercent + (fadeIn / duration) * 100}%` }}
          aria-label={`Fade in over ${fadeIn.toFixed(1)} seconds. Drag to adjust.`}
          onPointerDown={(event) => beginFade(event, "in")}
          onKeyDown={(event) => nudgeFade(event, "in")}
        >
          <span />
        </button>
        <button
          type="button"
          className={`fade-handle fade-end ${activeControl === "fade-out" ? "active" : ""}`}
          style={{ left: `${endPercent - (fadeOut / duration) * 100}%` }}
          aria-label={`Fade out over ${fadeOut.toFixed(1)} seconds. Drag to adjust.`}
          onPointerDown={(event) => beginFade(event, "out")}
          onKeyDown={(event) => nudgeFade(event, "out")}
        >
          <span />
        </button>
        {markers.map((marker, index) => (
          <button
            type="button"
            className="timeline-marker"
            style={{
              left: `${Math.min(100, (marker.positionMs / 1000 / duration) * 100)}%`,
            }}
            title={`${marker.name} · ${formatPreciseTime(marker.positionMs / 1000)}`}
            aria-label={`Jump preview to ${marker.name}`}
            onClick={() => jumpToMarker(marker)}
            key={`${marker.positionMs}-${index}`}
          >
            <span />
          </button>
        ))}
      </div>
      <div className="timeline-rulers">
        <label>
          In <strong>{formatPreciseTime(start)}</strong>
          <input
            type="range"
            min="0"
            max={duration}
            step="0.04"
            value={start}
            onChange={(e) => seek(Number(e.target.value), "start")}
          />
        </label>
        <label>
          Out <strong>{formatPreciseTime(end)}</strong>
          <input
            type="range"
            min="0.04"
            max={duration}
            step="0.04"
            value={end}
            onChange={(e) => seek(Number(e.target.value), "end")}
          />
        </label>
      </div>
      <div className="timeline-fades">
        <Field label={`Fade in · ${fadeIn.toFixed(1)}s`}>
          <input
            type="range"
            min="0"
            max={Math.min(30, end - start)}
            step="0.1"
            value={fadeIn}
            onChange={(e) => changeFade(Number(e.target.value), "in")}
          />
        </Field>
        <Field label={`Fade out · ${fadeOut.toFixed(1)}s`}>
          <input
            type="range"
            min="0"
            max={Math.min(30, end - start)}
            step="0.1"
            value={fadeOut}
            onChange={(e) => changeFade(Number(e.target.value), "out")}
          />
        </Field>
      </div>
      <section className="marker-editor">
        <div>
          <Field label={`New marker at ${formatPreciseTime(cursor)}`}>
            <input
              value={markerName}
              maxLength={80}
              placeholder={`Marker ${markers.length + 1}`}
              onChange={(e) => setMarkerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMarker();
                }
              }}
            />
          </Field>
          <button
            type="button"
            className="button"
            onClick={addMarker}
            disabled={markers.length >= 50}
          >
            ＋ Add at playhead
          </button>
        </div>
        {markers.length ? (
          <div className="marker-list" aria-label="Named cue markers">
            {markers.map((marker, index) => (
              <div key={`${marker.positionMs}-${index}`}>
                <button
                  type="button"
                  className="marker-time"
                  onClick={() => jumpToMarker(marker)}
                  aria-label={`Preview ${marker.name}`}
                >
                  {formatPreciseTime(marker.positionMs / 1000)}
                </button>
                <input
                  value={marker.name}
                  maxLength={80}
                  aria-label={`Name for marker at ${formatPreciseTime(marker.positionMs / 1000)}`}
                  onChange={(e) =>
                    setMarkers((current) =>
                      current.map((value, position) =>
                        position === index
                          ? { ...value, name: e.target.value }
                          : value,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="marker-delete"
                  aria-label={`Delete ${marker.name || "marker"}`}
                  onClick={() =>
                    setMarkers((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <small>
            No named markers yet. Play or scrub to a useful moment, then add
            one.
          </small>
        )}
      </section>
      <div className="timeline-actions">
        <button
          className="button"
          onClick={() => {
            if (player.current) {
              player.current.currentTime = start;
              setCursor(start);
              void player.current.play();
            }
          }}
        >
          ▶ Preview selection
        </button>
        <button
          className="button primary"
          onClick={() =>
            onSave({
              startMs: Math.round(start * 1000),
              endMs: Math.round(end * 1000),
              fadeInMs: Math.round(fadeIn * 1000),
              fadeOutMs: Math.round(fadeOut * 1000),
              cuePoints: markers
                .map((marker) => ({
                  name: marker.name.trim(),
                  positionMs: marker.positionMs,
                }))
                .filter((marker) => marker.name),
            })
          }
        >
          Save timeline and markers
        </button>
      </div>
      <small>
        Drag the IN and OUT handles directly on the filmstrip or use the
        sliders. The preview follows the edge you are adjusting; arrow keys
        nudge a focused handle by one 0.04-second frame step. Dark shading will
        not play. Blue fade regions fade both audio and picture to or from black
        and preview at the midpoint while you adjust them.
      </small>
    </section>
  );
}

export function MediaPreview({ media, item }: { media?: Media; item?: PlaylistItem }) {
  const player = useRef<HTMLMediaElement>(null);
  const [positionMs, setPositionMs] = useState(item?.startMs || 0);
  const startMs = item?.startMs || 0;
  const requestedEnd = item?.endMs;
  const fadeInMs = item?.fadeInMs || 0;
  const fadeOutMs = item?.fadeOutMs || 0;
  const [visualFadeOpacity, setVisualFadeOpacity] = useState(
    fadeInMs > 0 ? 1 : 0,
  );
  const targetVolume = item?.muted
    ? 0
    : Math.min(1, (item?.volumePercent ?? 100) / 100);
  const source =
    media?.sourceKind === "link"
      ? media.sourceUrl
      : media?.playbackUrl || media?.downloadUrl;
  const online =
    media?.linkKind === "youtube" ||
    media?.linkKind === "embedded" ||
    media?.linkKind === "webpage";
  const frameSource =
    media?.linkKind === "youtube" ? youtubeEmbedUrl(source) || source : source;
  useEffect(() => {
    const element = player.current;
    if (!element) return;
    const timer = window.setInterval(() => {
      const current = Math.max(0, element.currentTime * 1000);
      setPositionMs(current);
      const actualEnd =
        requestedEnd ||
        (Number.isFinite(element.duration)
          ? element.duration * 1000
          : undefined);
      const fadeIn = fadeInMs
        ? Math.min(1, Math.max(0, (current - startMs) / fadeInMs))
        : 1;
      const fadeOut =
        fadeOutMs && actualEnd
          ? Math.min(1, Math.max(0, (actualEnd - current) / fadeOutMs))
          : 1;
      const fade = Math.min(fadeIn, fadeOut);
      element.volume = targetVolume * fade;
      element.playbackRate = Math.max(
        0.25,
        Math.min(4, (item?.playbackRatePercent || 100) / 100),
      );
      const transitionMs =
        item?.transitionStyle === "fade-black"
          ? item.transitionDurationMs || 0
          : 0;
      const transitionIn = transitionMs
        ? Math.min(1, Math.max(0, (current - startMs) / transitionMs))
        : 1;
      const transitionOut =
        transitionMs && actualEnd
          ? Math.min(1, Math.max(0, (actualEnd - current) / transitionMs))
          : 1;
      setVisualFadeOpacity(1 - Math.min(fade, transitionIn, transitionOut));
      if (requestedEnd && current >= requestedEnd) {
        if (item?.endBehavior === "loop") {
          element.currentTime = startMs / 1000;
          void element.play();
        } else element.pause();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [
    fadeInMs,
    fadeOutMs,
    item?.endBehavior,
    item?.playbackRatePercent,
    item?.transitionDurationMs,
    item?.transitionStyle,
    requestedEnd,
    startMs,
    targetVolume,
  ]);
  if (!media)
    return (
      <div className="preview-unavailable">
        <strong>Media unavailable</strong>
        <p>This playlist entry no longer has a media file attached.</p>
      </div>
    );
  if (media.processingStatus !== "ready")
    return (
      <div className="preview-unavailable">
        <strong>
          {media.processingStatus === "failed"
            ? "Preview failed"
            : "Media is still processing"}
        </strong>
        <p>
          {media.processingError ||
            "Preview will be available when processing finishes."}
        </p>
      </div>
    );
  if (!source)
    return (
      <div className="preview-unavailable">
        <strong>No preview source</strong>
        <p>The file is not currently available from this server.</p>
      </div>
    );
  const visualStyle = item ? cuePreviewStyle(item) : undefined;
  const stageStyle = item
    ? {
        backgroundColor:
          item.fitMode === "letterbox"
            ? "#000000"
            : item.backgroundColor || "#000000",
      }
    : undefined;
  const mediaElement = media.contentType.startsWith("video") ? (
    <video
      style={visualStyle}
      ref={player as React.RefObject<HTMLVideoElement>}
      src={source}
      controls
      autoPlay
      playsInline
      onLoadedMetadata={(event) => {
        event.currentTarget.currentTime = startMs / 1000;
      }}
    />
  ) : media.contentType.startsWith("audio") ? (
    <div className="audio-preview">
      <div>♫</div>
      <audio
        ref={player as React.RefObject<HTMLAudioElement>}
        src={source}
        controls
        autoPlay
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = startMs / 1000;
        }}
      />
    </div>
  ) : media.contentType.startsWith("image") ? (
    <img style={visualStyle} src={source} alt={media.fileName} />
  ) : media.contentType.includes("pdf") ? (
    <object data={source} type="application/pdf">
      <a href={source} target="_blank" rel="noreferrer">
        Open PDF preview
      </a>
    </object>
  ) : isConvertibleDocument(media) ? (
    <div className="document-preview">
      <span>▤</span>
      <strong>{media.fileName}</strong>
      <p>Convertible document · {formatBytes(media.sizeBytes)}</p>
      <a className="button" href={source} target="_blank" rel="noreferrer">
        Open document
      </a>
    </div>
  ) : online ? (
    <iframe
      style={visualStyle}
      src={frameSource}
      title={media.fileName}
      allow="autoplay; fullscreen"
    />
  ) : (
    <iframe src={source} title={media.fileName} />
  );
  return (
    <div className="media-preview">
      <div className="preview-stage" style={stageStyle}>
        {mediaElement}
        {media.contentType.startsWith("video") && item && (
          <span
            className="visual-fade-overlay"
            style={{ opacity: visualFadeOpacity }}
          />
        )}
        {item?.notes && <div className="preview-notes">{item.notes}</div>}
      </div>
      {item && (
        <div className="preview-readout">
          <span>
            Position <strong>{formatDuration(positionMs)}</strong>
          </span>
          <span>
            Trim{" "}
            <strong>
              {formatDuration(startMs)} →{" "}
              {requestedEnd ? formatDuration(requestedEnd) : "media end"}
            </strong>
          </span>
          <span>
            Fades{" "}
            <strong>
              {(fadeInMs / 1000).toFixed(1)}s in ·{" "}
              {(fadeOutMs / 1000).toFixed(1)}s out
            </strong>
          </span>
          <span>
            Volume{" "}
            <strong>{item.muted ? "Muted" : `${item.volumePercent}%`}</strong>
          </span>
          <span>
            Picture{" "}
            <strong>
              {item.fitMode || "fit"} · {item.rotationDegrees || 0}°
            </strong>
          </span>
        </div>
      )}
      {online && (
        <a
          className="preview-open"
          href={source}
          target="_blank"
          rel="noreferrer"
        >
          Open original page ↗
        </a>
      )}
    </div>
  );
}

export function cuePreviewStyle(item: PlaylistItem): React.CSSProperties {
  const cropLeft = item.cropLeftPercent || 0;
  const cropRight = item.cropRightPercent || 0;
  const cropTop = item.cropTopPercent || 0;
  const cropBottom = item.cropBottomPercent || 0;
  const scaleX = 100 / Math.max(10, 100 - cropLeft - cropRight);
  const scaleY = 100 / Math.max(10, 100 - cropTop - cropBottom);
  return {
    objectFit: item.fitMode === "fill" ? "cover" : "contain",
    transform: `translate(${(cropRight - cropLeft) / 2}%, ${(cropBottom - cropTop) / 2}%) scale(${scaleX}, ${scaleY}) rotate(${item.rotationDegrees || 0}deg)`,
    clipPath: `inset(${cropTop}% ${cropRight}% ${cropBottom}% ${cropLeft}%)`,
  };
}
