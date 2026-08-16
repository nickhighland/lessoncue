import { confirmAction } from "../../AccessibleDialogs";
import { useEffect, useState } from "react";
import { api } from "../api";
import { CacheDiagnostic, CodecDiagnostic, DisplayCapabilityContract, DisplayCompatibilityIssue, DownloadDiagnostic, ErrorDiagnostic, LessonClass, Screen, Signage } from "../models";
import { Empty, Field, PageHead, Status } from "../ui";
import { errorText, formatBytes, formatClockOffset, friendlyPlaybackState, isOnline, parseDiagnosticJson, timeAgo } from "../utils";

export function ScreensView({
  screens,
  classes,
  signs,
  pin,
  pinExpiresAt,
  pinFixed,
  refresh,
  notify,
  canManage,
}: {
  screens: Screen[];
  classes: LessonClass[];
  signs: Signage[];
  pin?: string;
  pinExpiresAt?: string;
  pinFixed: boolean;
  refresh: () => void;
  notify: (s: string) => void;
  canManage: boolean;
}) {
  const active = screens.filter((s) => !s.revoked);
  const [expanded, setExpanded] = useState<string>();
  const [screenshotNonce, setScreenshotNonce] = useState(Date.now());
  const [busy, setBusy] = useState<string>();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (pinFixed || !pinExpiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [pinExpiresAt, pinFixed]);
  const pinRemainingSeconds = pinExpiresAt
    ? Math.max(0, Math.ceil((new Date(pinExpiresAt).getTime() - now) / 1000))
    : 0;
  async function change(screen: Screen, changes: object) {
    try {
      await api(`/api/v1/screens/${screen.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      refresh();
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function assignClass(screen: Screen, assignedClassId?: string) {
    if (!assignedClassId) {
      await change(screen, { clearAssignment: true });
      return;
    }
    try {
      const result = await api<{
        contract: DisplayCapabilityContract;
        issues: DisplayCompatibilityIssue[];
      }>(`/api/v1/screens/${screen.id}/assignment-check`, {
        method: "POST",
        body: JSON.stringify({ assignedClassId }),
      });
      if (
        result.issues.length > 0 &&
        !await confirmAction(
          `${result.contract.displayName} will show a clear fallback card for:\n\n${result.issues
            .slice(0, 8)
            .map((issue) => `• ${issue.title}: ${issue.message}`)
            .join("\n")}${result.issues.length > 8 ? `\n• …and ${result.issues.length - 8} more` : ""}\n\nAssign this class anyway?`,
        )
      )
        return;
      await change(screen, {
        assignedClassId,
        allowUnsupportedContent: result.issues.length > 0,
      });
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function assignSign(screen: Screen, assignedSignageId?: string) {
    try {
      await change(screen, assignedSignageId
        ? { assignedSignageId }
        : { clearSignageAssignment: true });
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function revoke(screen: Screen) {
    if (!await confirmAction(
      `Revoke ${screen.name}? It will need to be paired again.`,
      { destructive: true, confirmLabel: "Revoke screen" },
    ))
      return;
    await api(`/api/v1/screens/${screen.id}`, { method: "DELETE" });
    refresh();
  }
  async function requestScreenshot(screen: Screen) {
    setBusy(screen.id);
    try {
      await api(`/api/v1/screens/${screen.id}/diagnostics/screenshot-request`, {
        method: "POST",
        body: "{}",
      });
      notify(
        "One-time screenshot requested. The TV will show a visible notice before capture.",
      );
      setTimeout(() => {
        setScreenshotNonce(Date.now());
        refresh();
      }, 4_000);
      refresh();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(undefined);
    }
  }
  async function deleteScreenshot(screen: Screen) {
    setBusy(screen.id);
    try {
      await api(`/api/v1/screens/${screen.id}/diagnostics/screenshot`, {
        method: "DELETE",
      });
      refresh();
      notify("Diagnostic screenshot deleted.");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(undefined);
    }
  }
  async function openScreen(screen: Screen) {
    const displayWindow = window.open("about:blank", "_blank");
    if (!displayWindow)
      return notify(
        `Could not open ${screen.name}. Allow pop-ups for this LessonCue server and try again.`,
      );
    displayWindow.opener = null;
    setBusy(screen.id);
    try {
      const result = await api<{ url: string }>(
        `/api/v1/screens/${screen.id}/browser-link`,
        { method: "POST", body: "{}" },
      );
      displayWindow.location.replace(result.url);
      notify(`Opened ${screen.name} as a browser display.`);
    } catch (e) {
      displayWindow?.close();
      notify(errorText(e));
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="PLAYBACK DEVICES"
        title="Screens"
        detail="Pair TVs, assign a class, and inspect cache, downloads, codecs, timing, network quality, and recent errors."
        action={
          canManage && pin ? (
            <div className="pin-card">
              <span>PAIRING PIN</span>
              <strong>{pin}</strong>
              <small>
                {pinFixed
                  ? "Fixed until changed"
                  : `Changes in ${Math.floor(pinRemainingSeconds / 60)}:${String(pinRemainingSeconds % 60).padStart(2, "0")}`}
              </small>
            </div>
          ) : undefined
        }
      />
      <section className="panel browser-player-intro">
        <div>
          <span className="eyebrow">COMPUTERS &amp; PROJECTORS</span>
          <h2>Use this server as a full-screen display</h2>
          <p>
            Open the browser player on the presentation computer, pair it with
            the PIN above, and control it exactly like a TV. Add{" "}
            <code>?kiosk=1</code> for a clean startup view.
          </p>
          <small>{location.origin}/player</small>
        </div>
        <div className="card-actions">
          <a
            className="button primary"
            href="/player"
            target="_blank"
            rel="noreferrer"
          >
            Open browser player ↗
          </a>
          <a
            className="button"
            href="/player?kiosk=1"
            target="_blank"
            rel="noreferrer"
          >
            Open kiosk player ↗
          </a>
        </div>
      </section>
      <section className="panel">
        <div className="screen-grid">
          {active.length ? (
            active.map((s) => {
              const cache = parseDiagnosticJson<CacheDiagnostic>(
                s.cacheInventoryJson,
              );
              const downloads = parseDiagnosticJson<DownloadDiagnostic>(
                s.downloadQueueJson,
              );
              const codecs = parseDiagnosticJson<CodecDiagnostic>(
                s.codecCapabilitiesJson,
              );
              const errors = parseDiagnosticJson<ErrorDiagnostic>(
                s.recentErrorsJson,
              );
              const clockWarning = Math.abs(s.clockOffsetMs || 0) > 5_000;
              return (
                <article
                  className={`screen-card ${expanded === s.id ? "expanded" : ""}`}
                  key={s.id}
                >
                  <div className="screen-card-top">
                    <span
                      className={`screen-icon large ${isOnline(s) ? "online" : ""}`}
                    >
                      ▣
                    </span>
                    <Status online={isOnline(s)} />
                  </div>
                  <input
                    aria-label="Screen name"
                    className="screen-name-input"
                    defaultValue={s.name}
                    disabled={!canManage}
                    onBlur={(e) =>
                      e.target.value !== s.name &&
                      change(s, { name: e.target.value })
                    }
                  />
                  <small>
                    {s.deviceModel || s.platform} ·{" "}
                    {s.osVersion || s.appVersion} ·{" "}
                    {s.lastSeenAt
                      ? `Last seen ${timeAgo(s.lastSeenAt)}`
                      : "Waiting for first check-in"}
                  </small>
                  <div className="screen-diagnostics">
                    <span>
                      <b>{friendlyPlaybackState(s.playbackState)}</b> playback
                    </span>
                    <span>
                      <b>
                        {s.acknowledgedControlVersion}/{s.controlVersion}
                      </b>{" "}
                      command
                    </span>
                    <span>
                      <b>
                        {s.cachedItems}/{s.totalItems}
                      </b>{" "}
                      cached
                    </span>
                    <span>
                      <b>{downloads.length}</b> queued
                    </span>
                    <span>
                      <b className={`quality-${s.networkQuality}`}>
                        {s.networkQuality || "unknown"}
                      </b>{" "}
                      network
                    </span>
                    <span>
                      <b className={clockWarning ? "warning-text" : ""}>
                        {formatClockOffset(s.clockOffsetMs)}
                      </b>{" "}
                      clock
                    </span>
                  </div>
                  {s.playbackError && (
                    <div className="playback-error">{s.playbackError}</div>
                  )}
                  {s.signageOnly ? (
                    <Field label="Assigned Screen">
                      <select
                        value={s.assignedSignageId || ""}
                        disabled={!canManage}
                        onChange={(e) =>
                          void assignSign(s, e.target.value || undefined)
                        }
                      >
                        <option value="">Not assigned</option>
                        {s.assignedSignageId && s.assignedSignageName &&
                          !signs.some((sign) => sign.id === s.assignedSignageId) && (
                            <option value={s.assignedSignageId}>
                              {s.assignedSignageName}
                            </option>
                          )}
                        {signs.map((sign) => (
                          <option value={sign.id} key={sign.id}>
                            {sign.name}
                          </option>
                        ))}
                      </select>
                      {!signs.length && (
                        <small>Create a Sign in the Signage menu first.</small>
                      )}
                    </Field>
                  ) : (
                    <Field label="Assigned class">
                      <select
                        value={s.assignedClassId || ""}
                        disabled={!canManage}
                        onChange={(e) =>
                          void assignClass(s, e.target.value || undefined)
                        }
                      >
                        <option value="">Not assigned</option>
                        {classes.map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <div className="two-fields">
                    <label className="switch-row compact">
                      <input
                        type="checkbox"
                        checked={!!s.signageOnly}
                        disabled={!canManage}
                        onChange={(e) =>
                          change(s, { signageOnly: e.target.checked })
                        }
                      />
                      <span />
                      <div>
                        <strong>Signage only</strong>
                        <small>Excludes lessons and controller playback.</small>
                      </div>
                    </label>
                    <label className="switch-row compact">
                      <input
                        type="checkbox"
                        checked={!!s.permanentPairing}
                        disabled={!canManage}
                        onChange={(e) =>
                          change(s, { permanentPairing: e.target.checked })
                        }
                      />
                      <span />
                      <div>
                        <strong>Permanent pairing</strong>
                        <small>
                          Keep this browser screen after inactivity.
                        </small>
                      </div>
                    </label>
                  </div>
                  <div className="two-fields">
                    <Field label="Site">
                      <input
                        defaultValue={s.site}
                        disabled={!canManage}
                        onBlur={(e) => change(s, { site: e.target.value })}
                      />
                    </Field>
                    <Field label="Tags">
                      <input
                        defaultValue={s.tagsCsv}
                        disabled={!canManage}
                        placeholder="lobby, elementary"
                        onBlur={(e) => change(s, { tagsCsv: e.target.value })}
                      />
                    </Field>
                  </div>
                  <label className="switch-row compact">
                    <input
                      type="checkbox"
                      checked={s.volunteerMode}
                      disabled={!canManage}
                      onChange={(e) =>
                        change(s, { volunteerMode: e.target.checked })
                      }
                    />
                    <span />
                    <div>
                      <strong>Volunteer mode</strong>
                    </div>
                  </label>
                  <div className="screen-meta">
                    <span>{formatBytes(s.freeBytes)} device free</span>
                    <span>
                      {s.networkLatencyMs != null
                        ? `${s.networkLatencyMs} ms`
                        : "Latency pending"}{" "}
                      · {s.lastIpAddress || "IP pending"}
                    </span>
                  </div>
                  <div className="card-actions">
                    <button
                      className="button"
                      disabled={!canManage || busy === s.id}
                      onClick={() => void openScreen(s)}
                    >
                      {busy === s.id ? "Opening…" : "Open screen ↗"}
                    </button>
                    <button
                      className="button"
                      onClick={() =>
                        setExpanded(expanded === s.id ? undefined : s.id)
                      }
                    >
                      {expanded === s.id
                        ? "Hide diagnostics"
                        : "View diagnostics"}
                    </button>
                  </div>
                  {expanded === s.id && (
                    <div className="diagnostic-detail">
                      <div className="diagnostic-summary">
                        <span>
                          <b>
                            {cache.filter((x) => x.state === "cached").length}
                          </b>{" "}
                          cached files
                        </span>
                        <span>
                          <b>
                            {formatBytes(
                              cache.reduce(
                                (sum, x) => sum + (x.sizeBytes || 0),
                                0,
                              ),
                            )}
                          </b>{" "}
                          cache size
                        </span>
                        <span>
                          <b>
                            {codecs.filter((x) => x.supported).length}/
                            {codecs.length}
                          </b>{" "}
                          codecs
                        </span>
                        <span>
                          <b>{errors.length}</b> recent errors
                        </span>
                      </div>
                      <DiagnosticList
                        title="Cache inventory"
                        empty="No detailed inventory reported yet."
                        items={cache.map((item) => ({
                          title: item.title || item.itemId || "Media",
                          detail: `${item.state || "unknown"} · ${formatBytes(item.sizeBytes || 0)}${item.expectedBytes ? ` / ${formatBytes(item.expectedBytes)}` : ""}`,
                          error: item.error,
                        }))}
                      />
                      <DiagnosticList
                        title="Download queue"
                        empty="Download queue is clear."
                        items={downloads.map((item) => ({
                          title: item.title || item.itemId || "Media",
                          detail: `${item.state || "queued"} · ${formatBytes(item.bytesDownloaded || 0)}${item.expectedBytes ? ` / ${formatBytes(item.expectedBytes)}` : ""}`,
                          error: item.error,
                        }))}
                      />
                      <div className="codec-list">
                        <strong>Decoder capabilities</strong>
                        {codecs.length ? (
                          codecs.map((item, index) => (
                            <span
                              className={
                                item.supported ? "supported" : "unsupported"
                              }
                              key={`${item.codec}-${index}`}
                            >
                              {item.codec || "Unknown"}
                              <i>
                                {item.supported ? "Supported" : "Unavailable"}
                              </i>
                            </span>
                          ))
                        ) : (
                          <small>
                            Upgrade the TV player to receive codec details.
                          </small>
                        )}
                      </div>
                      <DiagnosticList
                        title="Recent device errors"
                        empty="No recent errors reported."
                        items={errors.map((item) => ({
                          title: item.area || "device",
                          detail: item.timestamp
                            ? `${timeAgo(item.timestamp)} · ${item.message || "Unknown error"}`
                            : item.message || "Unknown error",
                        }))}
                      />
                      <div className="screenshot-privacy">
                        <div>
                          <strong>Privacy-gated screenshot</strong>
                          <small>
                            Off by default. A one-time request expires in 60
                            seconds, displays a banner on the TV, and is deleted
                            after 24 hours.
                          </small>
                        </div>
                        <label className="switch-row compact">
                          <input
                            type="checkbox"
                            checked={s.allowDiagnosticScreenshots}
                            disabled={!canManage}
                            onChange={(e) =>
                              change(s, {
                                allowDiagnosticScreenshots: e.target.checked,
                              })
                            }
                          />
                          <span />
                          <div>
                            <strong>
                              {s.allowDiagnosticScreenshots
                                ? "Allowed"
                                : "Disabled"}
                            </strong>
                          </div>
                        </label>
                        {s.screenshotAvailable && (
                          <img
                            src={`/api/v1/screens/${s.id}/diagnostics/screenshot?v=${screenshotNonce}`}
                            alt={`Diagnostic screenshot from ${s.name}`}
                          />
                        )}
                        {canManage && (
                          <div className="card-actions">
                            <button
                              className="button primary"
                              disabled={
                                !s.allowDiagnosticScreenshots ||
                                !isOnline(s) ||
                                busy === s.id
                              }
                              onClick={() => requestScreenshot(s)}
                            >
                              {s.screenshotStatus === "pending"
                                ? "Capture pending…"
                                : "Request screenshot"}
                            </button>
                            {s.screenshotAvailable && (
                              <button
                                className="button"
                                onClick={() => deleteScreenshot(s)}
                              >
                                Delete now
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <small className="diagnostic-freshness">
                        Diagnostics{" "}
                        {s.diagnosticsUpdatedAt
                          ? `updated ${timeAgo(s.diagnosticsUpdatedAt)}`
                          : "will appear after a 0.18 TV player checks in"}{" "}
                        · Manifest {s.manifestVersion}
                      </small>
                    </div>
                  )}
                  {canManage && (
                    <button className="text-danger" onClick={() => revoke(s)}>
                      Revoke pairing
                    </button>
                  )}
                </article>
              );
            })
          ) : (
            <Empty
              title="No screens paired"
              body={
                canManage && pin
                  ? `Install LessonCue TV, choose Pair, and enter ${pin}.`
                  : "No paired screens are reporting to this server."
              }
            />
          )}
        </div>
      </section>
    </>
  );
}

export function DiagnosticList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { title: string; detail: string; error?: string }[];
}) {
  return (
    <div className="diagnostic-list">
      <strong>{title}</strong>
      {items.length ? (
        items.map((item, index) => (
          <div key={`${item.title}-${index}`}>
            <span>{item.title}</span>
            <small>{item.detail}</small>
            {item.error && <em>{item.error}</em>}
          </div>
        ))
      ) : (
        <small>{empty}</small>
      )}
    </div>
  );
}
