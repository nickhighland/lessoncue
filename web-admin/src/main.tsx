import { CSSProperties, FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import QRCode from "qrcode";
import { WebPlayerApp } from "./WebPlayer";
import "./styles.css";

type Permission = "planning.manage" | "uploads.manage" | "playback.control" | "screens.manage" | "users.manage" | "settings.manage" | "backups.manage" | "updates.manage";
type Session = { setupRequired: boolean; authenticated: boolean; username?: string; displayName?: string; role?: string; permissions?: Permission[]; mustChangePassword?: boolean; registrationMode?: "closed" | "approval" | "open" | "code"; registrationAvailable?: boolean; emailConfigured?: boolean };
type Bootstrap = {
  serverId: string; serverName: string; organization: string; timeZone: string; pairingPin?: string;
  pairingExpiresAt?: string; pairingFixed: boolean; controllerPinConfigured: boolean; settings: Organization;
  storage: StorageStatus; mediaTaxonomy: MediaTaxonomy; update: UpdateStatus; localAddress: LocalAddressStatus; httpPort: HttpPortStatus; cloudflareTunnel: CloudflareTunnelStatus;
  hardwareAcceleration: HardwareAccelerationStatus;
  accountEmail: { configured: boolean; provider: string };
  counts: { classes: number; lessons: number; media: number; screens: number };
  permissionDefinitions: Permission[]; permissionPresets: Record<string, Permission[]>;
};
type MediaTaxonomy = { folders: string[]; tags: string[] };
type Organization = { id: string; name: string; siteName: string; timeZone: string; weekStartsOn: string; defaultLessonDurationMinutes: number; defaultRetentionDays: number; primaryColor: string; accentColor: string; navigationTextColor: string; selectedTabColor: string; welcomeMessage: string; storageLimitBytes: number; adaptiveTranscodingEnabled: boolean; transcodeLeadDays: number; hardwareAccelerationEnabled: boolean; requireLocalRoomControllers: boolean; registrationMode: "closed" | "open" | "code"; publicBaseUrl: string; emailFromAddress: string; emailFromName: string; emailProvider: "none" | "resend" | "brevo" };
type StorageStatus = { usedBytes: number; diskAvailableBytes: number; maximumAllocationBytes: number; allocationBytes: number; remainingBytes: number; automaticAllocation: boolean };
type UpdateStatus = { currentVersion: string; latestVersion?: string; updateAvailable: boolean; lastCheckedAt?: string; releaseUrl?: string; error?: string; automaticInstallSupported: boolean; installing: boolean };
type LocalAddressStatus = { hostname: string; address: string; supported: boolean; pending: boolean; appliedAt?: string; error?: string };
type HttpPortStatus = { port: number; address: string; configurable: boolean; supported: boolean; pending: boolean; appliedAt?: string; error?: string };
type CloudflareTunnelStatus = { enabled: boolean; publicHostname?: string; publicUrl?: string; originUrl: string; supported: boolean; pending: boolean; credentialConfigured: boolean; serviceInstalled: boolean; connected: boolean; activeConnections: number; cloudflaredVersion?: string; cloudflaredCheckedAt?: string; cloudflaredUpdateError?: string; appliedAt?: string; error?: string };
type HardwareAccelerationStatus = { supported: boolean; available: boolean; engine: string; message: string; device?: string; lastCheckedAt?: string; lastHardwareUseAt?: string; lastFallbackAt?: string; lastError?: string };
type LessonClass = { id: string; name: string; description: string; controllerSlug: string; controllerColor: string; controllerHostname?: string; lessonCount: number; screenCount: number };
type TemporaryControllerSession = { token: string; classId: string; lessonId?: string; expiresAt: string; path: string };
type RecycleItem = { kind: "class" | "lesson" | "media"; id: string; title: string; detail: string; deletedAt: string; deletedBy?: string };
type MediaTranscode = { id: string; profile: "h264-720" | "h264-480"; status: "pending" | "converting" | "ready" | "failed"; sizeBytes: number; width?: number; height?: number; videoBitrateKbps: number; sourceVersion: number; error?: string; transcodeEngine?: string; queuedAt: string; startedAt?: string; completedAt?: string };
type Media = { id: string; fileName: string; contentType: string; sizeBytes: number; durationMs?: number; downloadUrl: string; playbackUrl?: string; thumbnailUrl?: string; filmstripUrl?: string; waveformUrl?: string; processingStatus: string; processingError?: string; videoCodec?: string; audioCodec?: string; width?: number; height?: number; compatibilityStatus: string; compatibilityError?: string; compatibilityTranscodedAt?: string; compatibilitySizeBytes?: number; compatibilityTranscodeEngine?: string; transcodes: MediaTranscode[]; sourceKind: string; sourceUrl?: string; linkKind?: string; offlineEligible: boolean; storagePolicy: "lesson" | "persistent"; originLessonId?: string; deleteAfter?: string; retentionDateIsManual: boolean; folder: string; tagsCsv: string; version: number; replacedAt?: string; conversionStatus: string; conversionError?: string; convertedSlidesJson: string; convertedAt?: string };
type MediaVersion = { id: string; versionNumber: number; fileName: string; contentType: string; sizeBytes: number; durationMs?: number; sha256?: string; archivedAt: string; archivedBy: string; downloadUrl: string };
type MediaImpact = { id: string; fileName: string; folder: string; tagsCsv: string; version: number; replacedAt?: string; lessons: { id: string; title: string; date: string; itemCount: number }[]; templates: { id: string; name: string; itemCount: number }[]; signage: { id: string; name: string; mode: string; enabled: boolean }[]; versions: MediaVersion[] };
type CuePoint = { name: string; positionMs: number };
type PlaylistItem = {
  id: string; title: string; type: string; role: "lesson" | "preRoll" | "countdown"; position: number;
  mediaAssetId?: string; mediaFileName?: string; durationMs?: number; mediaDurationMs?: number;
  volumePercent: number; endBehavior: string; allowSkip: boolean; startMs: number; endMs?: number;
  notes: string; fadeInMs: number; fadeOutMs: number; normalizeAudio: boolean; cuePointsJson: string;
};
type Lesson = {
  id: string; classId: string; className: string; date: string; title: string; designatedStartAt?: string; preRollStartsAt?: string;
  preRollEnabled: boolean; countdownItemId?: string; version: number; archived: boolean; keepOffline: boolean; downloadDaysBefore: number; generatedByScheduleId?: string; items: PlaylistItem[];
};
type LessonTemplate = {
  id: string; name: string; description: string; defaultTitle: string; defaultStartMinutes?: number;
  preRollLeadMinutes?: number; availableLeadMinutes?: number; expiresAfterMinutes?: number;
  preRollEnabled: boolean; keepOffline: boolean; downloadDaysBefore: number; scheduleCount: number;
  createdAt: string; updatedAt: string; items: PlaylistItem[];
};
type RecurringSchedule = {
  id: string; templateId: string; templateName: string; classId: string; className: string; name: string;
  frequency: "weekly" | "monthly" | "custom"; interval: number; dayOfWeek?: number; dayOfMonth?: number;
  startDate: string; endDate?: string; startMinutes?: number; titlePattern: string; customDatesJson: string;
  excludedDatesJson: string; enabled: boolean; generateDaysAhead: number; lastGeneratedAt?: string; generatedCount: number;
};
type Screen = {
  id: string; name: string; platform: string; assignedClassId?: string; assignedClassName?: string;
  volunteerMode: boolean; lastSeenAt?: string; online: boolean; freeBytes: number; failedDownloads: number; revoked: boolean; appVersion: string; manifestVersion: number; tagsCsv: string; site: string;
  lastIpAddress?: string; controlVersion: number; controlAction: string; controlLessonId?: string; controlItemId?: string; controlPositionMs?: number; controlIssuedAt?: string;
  acknowledgedControlVersion: number; playbackState: string; playbackLessonId?: string; playbackItemId?: string; playbackPositionMs: number; playbackDurationMs?: number;
  playbackVolumePercent: number; playbackUpdatedAt?: string; playbackError?: string; cachedItems: number; totalItems: number; deviceModel?: string; osVersion?: string;
  cacheInventoryJson: string; downloadQueueJson: string; codecCapabilitiesJson: string; recentErrorsJson: string;
  clockOffsetMs?: number; networkLatencyMs?: number; networkQuality: string; diagnosticsUpdatedAt?: string;
  allowDiagnosticScreenshots: boolean; screenshotRequestId?: string; screenshotRequestedAt?: string; screenshotExpiresAt?: string;
  screenshotStatus: string; screenshotCapturedAt?: string; screenshotAvailable: boolean;
};
type CacheDiagnostic = { itemId?: string; title?: string; state?: string; sizeBytes?: number; expectedBytes?: number; error?: string };
type DownloadDiagnostic = { itemId?: string; title?: string; state?: string; bytesDownloaded?: number; expectedBytes?: number; error?: string };
type CodecDiagnostic = { kind?: string; codec?: string; supported?: boolean; detail?: string };
type ErrorDiagnostic = { timestamp?: string; area?: string; message?: string; itemId?: string };
type User = { id: string; username: string; displayName: string; email?: string; emailVerified: boolean; role: string; disabled: boolean; pendingApproval: boolean; pendingSetup: boolean; mustChangePassword: boolean; createdAt: string; lastLoginAt?: string; permissions: Permission[]; customPermissions?: Permission[] | null };
type AccountProfile = { username: string; displayName: string; email?: string; emailVerified: boolean; role: string };
type RegistrationSettings = { mode: "closed" | "approval" | "open" | "code"; publicBaseUrl: string; emailFromAddress: string; emailFromName: string; emailProvider: "none" | "resend" | "brevo"; emailConfigured: boolean };
type RegistrationCode = { id: string; hint: string; label: string; createdAt: string; expiresAt?: string; revokedAt?: string; uses: number; maxUses?: number; active: boolean };
type Signage = {
  id: string; name: string; mode: "scheduled" | "idle" | "emergency"; enabled: boolean; priority: number;
  startsAt?: string; endsAt?: string; message: string; backgroundColor: string; textColor: string;
  mediaAssetId?: string; mediaFileName?: string; targetTagsCsv: string;
  recurrence: "once" | "daily" | "weekly"; scheduleStartDate?: string; scheduleEndDate?: string;
  startMinutes?: number; endMinutes?: number; daysOfWeek: number[]; excludedDates: string[];
  targetScreenIds: string[]; targetScreenNames: string[]; activeNow: boolean; nextChangeAt?: string;
  readiness: "ready" | "preparing" | "failed" | "missing"; ready: boolean; createdAt: string; updatedAt: string;
  targetScreenCount: number; cachedScreenCount: number; failedScreenCount: number;
};
type Backup = { id: string; fileName: string; kind: string; sizeBytes: number; createdAt: string; createdBy: string };
type BackupPreview = { restoreId: string; fileName: string; kind: string; compressedBytes: number; uncompressedBytes: number; fileCount: number; organization: string; users: number; classes: number; lessons: number; mediaRecords: number; mediaFiles: number; includesMedia: boolean; warnings: string[]; expiresAt: string };
type BackupRestoreResult = { safetyBackupId: string; safetyBackupFileName: string; kind: string; organization: string; mediaRestored: boolean; preservedServerSettings: string[] };
type Audit = { id: number; timestamp: string; actor: string; action: string; object: string; result: string; summary?: string };
type View = "dashboard" | "controller" | "classes" | "templates" | "calendar" | "media" | "screens" | "signage" | "users" | "settings";

const permissionOptions: { id: Permission; label: string; detail: string }[] = [
  { id: "planning.manage", label: "Lesson planning", detail: "Classes, lessons, templates, schedules, and signage" },
  { id: "uploads.manage", label: "Media uploads", detail: "Upload, organize, retain, replace, convert, and delete media" },
  { id: "playback.control", label: "Live playback", detail: "Use the cellphone controller and send TV commands" },
  { id: "screens.manage", label: "Screen administration", detail: "Rename, assign, tag, configure, and revoke screens" },
  { id: "users.manage", label: "User administration", detail: "Create, edit, pause, and delete local accounts" },
  { id: "settings.manage", label: "Server settings", detail: "Organization, branding, storage, address, port, and pairing PIN" },
  { id: "backups.manage", label: "Backups and restore", detail: "Create, download, validate, and restore backups" },
  { id: "updates.manage", label: "Software updates", detail: "Check for and install LessonCue releases" },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.error || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

async function uploadMediaFile(file: File, options: { persistent: boolean; lessonId?: string; folder?: string; tagsCsv?: string; onProgress?: (percent: number) => void }): Promise<Media> {
  const duration = await detectDuration(file);
  let result: Media | { duplicate: true; media: Media };
  if (file.size > 16 * 1024 * 1024) {
    const session = await api<{ uploadId: string; chunkSize: number }>(`/api/v1/uploads?fileName=${encodeURIComponent(file.name)}&totalBytes=${file.size}`, { method: "POST", body: "{}" });
    const totalChunks = Math.ceil(file.size / session.chunkSize);
    for (let index = 0; index < totalChunks; index++) {
      const chunk = file.slice(index * session.chunkSize, Math.min(file.size, (index + 1) * session.chunkSize));
      await api(`/api/v1/uploads/${session.uploadId}/chunks/${index}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: chunk });
      options.onProgress?.(Math.round(((index + 1) / totalChunks) * 100));
    }
    result = await api(`/api/v1/uploads/${session.uploadId}/complete`, { method: "POST", body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream", totalChunks, durationMs: duration || null, persistent: options.persistent, lessonId: options.lessonId || null, folder: options.folder || "", tagsCsv: options.tagsCsv || "" }) });
  } else {
    const data = new FormData();
    data.append("file", file);
    data.append("persistent", String(options.persistent));
    if (options.lessonId) data.append("lessonId", options.lessonId);
    if (options.folder) data.append("folder", options.folder);
    if (options.tagsCsv) data.append("tagsCsv", options.tagsCsv);
    if (duration) data.append("durationMs", String(duration));
    result = await api("/api/v1/media", { method: "POST", body: data });
    options.onProgress?.(100);
  }
  return "media" in result ? result.media : result;
}

function App() {
  if (isWebPlayerPath(location.pathname)) return <WebPlayerApp />;
  return <AdminApp />;
}

function AdminApp() {
  const [session, setSession] = useState<Session>();
  const [view, setView] = useState<View>(isControllerPath(location.pathname) ? "controller" : "dashboard");
  const [notice, setNotice] = useState("");

  useEffect(() => { api<Session>("/api/v1/auth/session").then(setSession).catch(() => setSession({ setupRequired: false, authenticated: false })); }, []);
  if (!session) return <Splash />;
  if (!session.authenticated || isAccountLinkPath(location.pathname)) return <Auth session={session} onAuthenticated={() => api<Session>("/api/v1/auth/session").then(setSession)} />;
  if (session.mustChangePassword) return <RequiredPasswordChange onChanged={() => api<Session>("/api/v1/auth/session").then(setSession)} />;
  return <Shell view={view} setView={setView} username={session.displayName || session.username || "admin"} currentUsername={session.username || ""} role={session.role || "Viewer"} permissions={session.permissions || []} notice={notice} setNotice={setNotice}
    onLogout={async () => { await api<void>("/api/v1/auth/logout", { method: "POST", body: "{}" }); setSession({ ...session, authenticated: false, setupRequired: false }); }} />;
}

function isWebPlayerPath(path: string) {
  return path === "/player" || path === "/display";
}

function isAccountLinkPath(path: string) {
  return path === "/verify" || path === "/verify-email" || path === "/reset-password" ||
    path === "/setup-account" || path === "/register" || path === "/forgot-password";
}

function Splash() {
  return <main className="auth-page"><div className="brand-mark large">LC</div><p className="muted">Opening your local LessonCue server…</p></main>;
}

function RequiredPasswordChange({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.newPassword !== values.confirmPassword) {
      setError("Passwords do not match."); setBusy(false); return;
    }
    try {
      await api("/api/v1/auth/password/change-required", {
        method: "POST",
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
      });
      onChanged();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card">
    <div className="brand-lockup"><div className="brand-mark">LC</div><div><strong>LessonCue</strong><span>Secure first sign-in</span></div></div>
    <div className="auth-copy"><span className="eyebrow">PASSWORD UPDATE REQUIRED</span><h1>Choose your password</h1><p>The administrator-issued password was temporary. Replace it before opening LessonCue.</p></div>
    <form className="stack" onSubmit={submit}>
      <Field label="Temporary password"><input name="currentPassword" type="password" required autoComplete="current-password" autoFocus /></Field>
      <Field label="New password" hint="10+ characters with uppercase, lowercase, and a number"><input name="newPassword" type="password" required minLength={10} autoComplete="new-password" /></Field>
      <Field label="Confirm new password"><input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" /></Field>
      {error && <div className="alert error">{error}</div>}
      <button className="button primary wide" disabled={busy}>{busy ? "Changing…" : "Change password and continue"}</button>
    </form>
  </section></main>;
}

function isControllerPath(path: string) {
  return path === "/controller" || path === "/universalremote" || path.startsWith("/room/") || path.startsWith("/session/");
}

function controllerRouteSlug(path: string) {
  if (!path.startsWith("/room/")) return "";
  try { return decodeURIComponent(path.slice(6).split("/")[0]).toLowerCase(); }
  catch { return ""; }
}

function controllerSessionToken(path: string) {
  return path.startsWith("/session/") ? path.slice(9).split("/")[0].toLowerCase() : "";
}

function controllerSlug(item: LessonClass) {
  return item.controllerSlug || `class-${item.id.slice(0, 8)}`;
}

function classControllerUrl(item: LessonClass, lessonId = "", preferredOrigin = location.origin) {
  const origin = item.controllerHostname ? `https://${item.controllerHostname}` : preferredOrigin;
  return `${origin}/room/${controllerSlug(item)}${lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : ""}`;
}

function QrCode({ value }: { value: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: 220, margin: 1, errorCorrectionLevel: "M", color: { dark: "#172c27", light: "#ffffff" } })
      .then(url => { if (active) setSource(url); }).catch(() => setSource(""));
    return () => { active = false; };
  }, [value]);
  return source ? <img src={source} alt={`QR code for ${value}`} /> : <div className="qr-loading">Building QR code…</div>;
}

function Auth({ session, onAuthenticated }: { session: Session; onAuthenticated: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "resend">(
    location.pathname === "/register" && session.registrationAvailable ? "register" :
      location.pathname === "/forgot-password" && session.emailConfigured ? "forgot" : "login"
  );
  const token = new URLSearchParams(location.search).get("token") || "";
  const verificationPath = location.pathname === "/verify" || location.pathname === "/verify-email";
  const resetPath = location.pathname === "/reset-password";
  const setupAccountPath = location.pathname === "/setup-account";
  const [linkResult, setLinkResult] = useState("");
  useEffect(() => {
    if (!verificationPath || !token) return;
    const endpoint = location.pathname === "/verify-email" ? "/api/v1/auth/email/verify" : "/api/v1/auth/verify";
    api<{ message: string }>(endpoint, { method: "POST", body: JSON.stringify({ token }) })
      .then(result => setLinkResult(result.message)).catch(cause => setError(errorText(cause)));
  }, [token, verificationPath]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(session.setupRequired ? "/api/v1/auth/setup" : "/api/v1/auth/login", { method: "POST", body: JSON.stringify(values) });
      onAuthenticated();
    } catch (e) { setError(e instanceof Error && e.message !== "SESSION_EXPIRED" ? e.message : "The username or password was not accepted."); }
    finally { setBusy(false); }
  }
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { const result = await api<{ message: string }>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(values) }); setLinkResult(result.message); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function forgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await api<{ message: string }>("/api/v1/auth/password/forgot", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); setLinkResult(result.message); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await api<{ message: string }>("/api/v1/auth/verification/resend", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); setLinkResult(result.message); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirmPassword) { setError("Passwords do not match."); setBusy(false); return; }
    try { const result = await api<{ message: string }>("/api/v1/auth/password/reset", { method: "POST", body: JSON.stringify({ token, password: values.password }) }); setLinkResult(result.message); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function setupAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirmPassword) {
      setError("Passwords do not match."); setBusy(false); return;
    }
    try {
      const result = await api<{ message: string }>("/api/v1/auth/setup-account", {
        method: "POST",
        body: JSON.stringify({ token, username: values.username, displayName: values.displayName, password: values.password }),
      });
      setLinkResult(result.message);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-card">
      <div className="brand-lockup"><div className="brand-mark">LC</div><div><strong>LessonCue</strong><span>Local classroom media control</span></div></div>
      <div className="auth-copy">
        <span className="eyebrow">{session.setupRequired ? "FIRST-RUN SETUP" : "WELCOME BACK"}</span>
        <h1>{session.setupRequired ? "Create your local administrator" : setupAccountPath ? "Set up your account" : resetPath ? "Choose a new password" : verificationPath ? "Verify your account" : mode === "register" ? session.registrationMode === "approval" ? "Request access" : "Create your account" : mode === "forgot" ? "Reset your password" : mode === "resend" ? "Resend verification" : "Sign in to LessonCue"}</h1>
        <p>{session.setupRequired ? "This account stays on this server. Nothing is sent to a hosted service." : setupAccountPath ? "Choose your own name, username, and password. This invitation can be used only once." : resetPath || verificationPath ? "This secure link can be used only once and expires automatically." : mode === "register" ? session.registrationMode === "approval" ? "Verify your email, then an administrator will review your request before you can sign in." : "Your administrator controls who may register on this server." : mode === "forgot" ? "We will send a one-time link if the address belongs to a verified account." : mode === "resend" ? "We will replace the previous link if the address belongs to an unverified account." : "Manage classes, playlists, and screens on your local network."}</p>
      </div>
      {linkResult ? <div className="account-result"><strong>{linkResult}</strong><button className="button primary wide" onClick={() => location.assign("/")}>Continue to LessonCue</button></div> : setupAccountPath ? <form onSubmit={setupAccount} className="stack">
        <Field label="Your name"><input name="displayName" required maxLength={120} autoComplete="name" autoFocus /></Field>
        <Field label="Username"><input name="username" required minLength={3} maxLength={80} autoComplete="username" /></Field>
        <Field label="Password" hint="10+ characters with uppercase, lowercase, and a number"><input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
        <Field label="Confirm password"><input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" /></Field>
        {error && <div className="alert error">{error}</div>}<button className="button primary wide" disabled={busy}>{busy ? "Saving…" : "Finish account setup"}</button>
      </form> : resetPath ? <form onSubmit={resetPassword} className="stack">
        <Field label="New password" hint="10+ characters with uppercase, lowercase, and a number"><input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
        <Field label="Confirm new password"><input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" /></Field>
        {error && <div className="alert error">{error}</div>}<button className="button primary wide" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
      </form> : verificationPath ? <div className="account-result">{error ? <div className="alert error">{error}</div> : <p>Checking this one-time link…</p>}</div> : mode === "register" ? <form onSubmit={register} className="stack">
        <Field label="Your name"><input name="displayName" required autoComplete="name" autoFocus /></Field>
        <div className="two-fields"><Field label="Username"><input name="username" required minLength={3} autoComplete="username" /></Field><Field label="Email"><input name="email" type="email" required autoComplete="email" /></Field></div>
        {session.registrationMode === "code" && <Field label="Registration code"><input name="code" required autoComplete="off" /></Field>}
        <Field label="Password" hint="10+ characters with uppercase, lowercase, and a number"><input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
        {error && <div className="alert error">{error}</div>}<button className="button primary wide" disabled={busy}>{busy ? "Creating…" : session.registrationMode === "approval" ? "Submit access request" : "Create account"}</button><button className="text-button" type="button" onClick={() => { setMode("login"); setError(""); }}>Back to sign in</button>
      </form> : mode === "forgot" ? <form onSubmit={forgot} className="stack">
        <Field label="Email"><input name="email" type="email" required autoComplete="email" autoFocus /></Field>
        {error && <div className="alert error">{error}</div>}<button className="button primary wide" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button><button className="text-button" type="button" onClick={() => { setMode("login"); setError(""); }}>Back to sign in</button>
      </form> : mode === "resend" ? <form onSubmit={resend} className="stack">
        <Field label="Email"><input name="email" type="email" required autoComplete="email" autoFocus /></Field>
        {error && <div className="alert error">{error}</div>}<button className="button primary wide" disabled={busy}>{busy ? "Sending…" : "Resend verification link"}</button><button className="text-button" type="button" onClick={() => { setMode("login"); setError(""); }}>Back to sign in</button>
      </form> : <form onSubmit={submit} className="stack">
        {session.setupRequired && <><div className="two-fields"><Field label="Organization name"><input name="organizationName" required defaultValue="My Organization" /></Field><Field label="Site or campus"><input name="siteName" required defaultValue="Main Campus" /></Field></div><div className="two-fields"><Field label="Your name"><input name="displayName" required autoComplete="name" /></Field><Field label="Email (optional)"><input name="email" type="email" autoComplete="email" /></Field></div><div className="two-fields"><Field label="Time zone"><select name="timeZone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}><option>{Intl.DateTimeFormat().resolvedOptions().timeZone}</option><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>UTC</option></select></Field><Field label="Week starts"><select name="weekStartsOn"><option>Sunday</option><option>Monday</option></select></Field></div></>}
        <Field label="Username"><input name="username" required minLength={3} autoComplete="username" autoFocus={!session.setupRequired} /></Field>
        <Field label="Password" hint={session.setupRequired ? "10+ characters with uppercase, lowercase, and a number" : undefined}>
          <div className="password-field"><input name="password" type={showPassword ? "text" : "password"} required minLength={session.setupRequired ? 10 : undefined} autoComplete={session.setupRequired ? "new-password" : "current-password"} /><button type="button" className="text-button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div>
        </Field>
        {error && <div className="alert error">{error}</div>}
        <button className="button primary wide" disabled={busy}>{busy ? "Please wait…" : session.setupRequired ? "Finish setup" : "Sign in"}</button>
      </form>}
      {!session.setupRequired && !setupAccountPath && !resetPath && !verificationPath && <div className="auth-links">{session.registrationAvailable && <a className="registration-link" href="/register">{session.registrationMode === "code" ? "Register with a code" : session.registrationMode === "approval" ? "Request access" : "Create an account"}</a>}{session.emailConfigured && <button className="text-button" onClick={() => setMode("forgot")}>Forgot password?</button>}{session.emailConfigured && <button className="text-button" onClick={() => setMode("resend")}>Resend verification</button>}<a className="recovery-link" href="https://github.com/nickhighland/lessoncue/blob/main/docs/installation.md#reset-a-forgotten-administrator-password" target="_blank" rel="noreferrer">SSH recovery ↗</a></div>}
      <div className="local-note"><span className="status-dot" /> Local server · {location.host}</div>
    </section>
  </main>;
}

function Shell({ view, setView, username, currentUsername, role, permissions, onLogout, notice, setNotice }: {
  view: View; setView: (view: View) => void; username: string; currentUsername: string; role: string; permissions: Permission[]; onLogout: () => void; notice: string; setNotice: (v: string) => void;
}) {
  const has = (permission: Permission) => permissions.includes(permission);
  const canPlan = has("planning.manage");
  const canUpload = has("uploads.manage");
  const canControl = has("playback.control");
  const canManageScreens = has("screens.manage");
  const canManageUsers = has("users.manage");
  const canManageSettings = has("settings.manage");
  const canManageBackups = has("backups.manage");
  const canManageUpdates = has("updates.manage");
  const [dataVersion, setDataVersion] = useState(0);
  const [bootstrap, setBootstrap] = useState<Bootstrap>();
  const [classes, setClasses] = useState<LessonClass[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [templates, setTemplates] = useState<LessonTemplate[]>([]);
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [signage, setSignage] = useState<Signage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = () => setDataVersion(v => v + 1);
  useEffect(() => {
    Promise.all([
      api<Bootstrap>("/api/v1/admin/bootstrap"), api<LessonClass[]>("/api/v1/classes"),
      api<Lesson[]>("/api/v1/lessons"), api<Media[]>("/api/v1/media"), api<Screen[]>("/api/v1/screens"),
      api<LessonTemplate[]>("/api/v1/lesson-templates"), api<RecurringSchedule[]>("/api/v1/recurring-schedules"),
      api<Signage[]>("/api/v1/signage"), canManageUsers ? api<User[]>("/api/v1/users") : Promise.resolve([]),
      canManageBackups ? api<Backup[]>("/api/v1/backups") : Promise.resolve([]),
      canManageSettings ? api<Audit[]>("/api/v1/audit") : Promise.resolve([]),
    ]).then(([b, c, l, m, s, templateData, scheduleData, g, u, backupData, auditData]) => { setBootstrap(b); setClasses(c); setLessons(l); setMedia(m); setScreens(s); setTemplates(templateData); setSchedules(scheduleData); setSignage(g); setUsers(u); setBackups(backupData); setAudit(auditData); })
      .catch(e => setNotice(e.message === "SESSION_EXPIRED" ? "Your session expired. Refresh the page to sign in again." : e.message))
      .finally(() => setLoading(false));
  }, [dataVersion, setNotice, canManageUsers, canManageBackups, canManageSettings]);
  useEffect(() => {
    if (!bootstrap) return;
    document.documentElement.style.setProperty("--deep", bootstrap.settings.primaryColor);
    document.documentElement.style.setProperty("--gold", bootstrap.settings.accentColor);
    document.documentElement.style.setProperty("--nav-text", bootstrap.settings.navigationTextColor);
    document.documentElement.style.setProperty("--nav-selected", bootstrap.settings.selectedTabColor);
  }, [bootstrap]);
  useEffect(() => {
    if (!canManageUpdates) return;
    const poll = () => api<UpdateStatus>("/api/v1/updates").then(update =>
      setBootstrap(current => current ? { ...current, update } : current)).catch(() => undefined);
    const initial = window.setTimeout(poll, 20_000);
    const interval = window.setInterval(poll, 60 * 60 * 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [canManageUpdates]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3_000);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);
  useEffect(() => {
    const connection = new HubConnectionBuilder().withUrl("/hubs/sync")
      .withAutomaticReconnect([0, 1_000, 3_000, 10_000]).configureLogging(LogLevel.Warning).build();
    const refreshScreens = () => api<Screen[]>("/api/v1/screens").then(setScreens).catch(() => undefined);
    const refreshManifest = () => refresh();
    connection.on("ScreenStatusChanged", refreshScreens);
    connection.on("ManifestInvalidated", refreshManifest);
    connection.start().then(() => connection.invoke("JoinAdmins")).catch(() => undefined);
    return () => { connection.off("ScreenStatusChanged", refreshScreens); connection.off("ManifestInvalidated", refreshManifest); void connection.stop(); };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => api<Screen[]>("/api/v1/screens").then(setScreens).catch(() => undefined), 2_500);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const controllerPath = isControllerPath(location.pathname) ? location.pathname : "/universalremote";
    const path = view === "controller" ? controllerPath : "/";
    if (location.pathname !== path) history.replaceState(null, "", path);
  }, [view]);
  useEffect(() => {
    if (view === "controller" && !canControl || view === "classes" && !canPlan || view === "templates" && !canPlan ||
        view === "signage" && !canPlan || view === "users" && !canManageUsers ||
        view === "settings" && !canManageSettings && !canManageBackups && !canManageUpdates) setView("dashboard");
  }, [view, canControl, canPlan, canManageUsers, canManageSettings, canManageBackups, canManageUpdates, setView]);

  const nav: [View, string, string][] = [["dashboard", "⌂", "Dashboard"],
    ...(canControl ? [["controller", "⌁", "Controller"]] as [View, string, string][] : []),
    ...(canPlan ? [["classes", "▤", "Classes"], ["templates", "↻", "Templates"]] as [View, string, string][] : []),
    ["calendar", "□", "Calendar"], ["media", "▶", "Media Library"], ["screens", "▣", "Screens"],
    ...(canPlan ? [["signage", "◇", "Signage"]] as [View, string, string][] : []),
    ...(canManageUsers ? [["users", "♙", "Users"]] as [View, string, string][] : []),
    ...(canManageSettings || canManageBackups || canManageUpdates ? [["settings", "⚙", "Settings"]] as [View, string, string][] : [])];
  return <><a className="skip-link" href="#main-content">Skip to main content</a><div className={`app-shell ${view === "controller" ? "controller-mode" : ""}`}>
    <aside className="sidebar">
      <div className="brand-lockup inverse"><div className="brand-mark">LC</div><div><strong>LessonCue</strong><span>{bootstrap?.organization || "Local server"}</span></div></div>
      <nav>{nav.map(([key, icon, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><span>{icon}</span>{label}</button>)}</nav>
      <div className="sidebar-foot">{canUpload && bootstrap && <div className="storage-mini"><span>Upload space</span><strong>{formatBytes(bootstrap.storage.remainingBytes)} free</strong><StorageMeter storage={bootstrap.storage} /></div>}<div className="server-online"><span className="status-dot" /><div><strong>Server online</strong><small>{location.host}</small></div></div><button className="account-button" onClick={() => setShowProfile(true)}>{username}<span>{role} · Manage account</span></button></div>
    </aside>
    <main className="content" id="main-content" tabIndex={-1}>
      {notice && <div className="toast" key={notice} role="status" aria-live="polite" onClick={() => setNotice("")}>{notice}<span>×</span></div>}
      {loading && !bootstrap ? <div className="loading">Loading local data…</div> : <>
        {bootstrap?.update.updateAvailable && <div className="update-banner" role="status"><div><strong>LessonCue {bootstrap.update.latestVersion} is available</strong><span>{canManageUpdates ? "Your server can be updated from Settings." : "An update administrator can install it from Settings."}</span></div>{canManageUpdates && <button className="button" onClick={() => setView("settings")}>Review update</button>}</div>}
        {view === "dashboard" && bootstrap && <Dashboard bootstrap={bootstrap} lessons={lessons} screens={screens} onNavigate={setView} />}
        {view === "controller" && bootstrap && <ControllerView screens={screens} lessons={lessons} classes={classes} controllerPinConfigured={bootstrap.controllerPinConfigured} requireLocalRoomControllers={bootstrap.settings.requireLocalRoomControllers} localAddress={bootstrap.httpPort.address} userRole={role} refresh={refresh} notify={setNotice} />}
        {view === "classes" && <ClassesView classes={classes} lessons={lessons} media={media} taxonomy={bootstrap?.mediaTaxonomy || { folders: [], tags: [] }} refresh={refresh} notify={setNotice} canUpload={canUpload} storage={bootstrap?.storage} localControllerOrigin={bootstrap?.settings.requireLocalRoomControllers ? bootstrap.httpPort.address : undefined} />}
        {view === "templates" && <TemplatesView templates={templates} schedules={schedules} lessons={lessons} classes={classes} refresh={refresh} notify={setNotice} />}
        {view === "calendar" && <CalendarView lessons={lessons} />}
        {view === "media" && <MediaView media={media} lessons={lessons} taxonomy={bootstrap?.mediaTaxonomy || { folders: [], tags: [] }} refresh={refresh} notify={setNotice} canUpload={canUpload} storage={bootstrap?.storage} />}
        {view === "screens" && bootstrap && <ScreensView screens={screens} classes={classes} pin={bootstrap.pairingPin} refresh={refresh} notify={setNotice} canManage={canManageScreens} />}
        {view === "signage" && <SignageView signage={signage} media={media} screens={screens} timeZone={bootstrap?.timeZone || "UTC"} refresh={refresh} notify={setNotice} />}
        {view === "users" && <UsersView users={users} currentUsername={currentUsername} currentRole={role} refresh={refresh} notify={setNotice} canManage={canManageUsers} emailConfigured={bootstrap?.accountEmail.configured ?? false} />}
        {view === "settings" && bootstrap && <Settings bootstrap={bootstrap} backups={backups} audit={audit} refresh={refresh} notify={setNotice} canSettings={canManageSettings} canBackups={canManageBackups} canUpdates={canManageUpdates} />}
      </>}
    </main>
  </div>{showProfile && <ProfileModal onClose={() => setShowProfile(false)} onLogout={onLogout} notify={setNotice} />}</>;
}

function ProfileModal({ onClose, onLogout, notify }: { onClose: () => void; onLogout: () => void; notify: (message: string) => void }) {
  const [profile, setProfile] = useState<AccountProfile>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<AccountProfile>("/api/v1/auth/profile").then(setProfile).catch(cause => setError(errorText(cause))); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.newPassword && values.newPassword !== values.confirmPassword) {
      setError("New passwords do not match."); setBusy(false); return;
    }
    try {
      const result = await api<{ message: string }>("/api/v1/auth/profile", {
        method: "PUT",
        body: JSON.stringify({ displayName: values.displayName, username: values.username, email: values.email, currentPassword: values.currentPassword || "", newPassword: values.newPassword || "" }),
      });
      notify(result.message);
      onClose();
      window.setTimeout(() => location.reload(), 350);
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  return <Modal title="Your account" onClose={onClose}>
    {!profile ? error ? <div className="alert error">{error}</div> : <p className="muted">Loading your account…</p> : <form className="stack" onSubmit={save}>
      <div className="account-profile-summary"><span>{profile.role}</span><strong>{profile.emailVerified ? "Email verified" : "Email verification pending"}</strong></div>
      <Field label="Your name"><input name="displayName" defaultValue={profile.displayName} required autoComplete="name" /></Field>
      <div className="two-fields"><Field label="Username"><input name="username" defaultValue={profile.username} required minLength={3} autoComplete="username" /></Field><Field label="Email (optional for local accounts)"><input name="email" type="email" defaultValue={profile.email || ""} autoComplete="email" /></Field></div>
      <Field label="Current password" hint="Required only when changing username, email, or password."><input name="currentPassword" type="password" autoComplete="current-password" /></Field>
      <div className="two-fields"><Field label="New password" hint="Leave blank to keep it unchanged."><input name="newPassword" type="password" minLength={10} autoComplete="new-password" /></Field><Field label="Confirm new password"><input name="confirmPassword" type="password" minLength={10} autoComplete="new-password" /></Field></div>
      {error && <div className="alert error">{error}</div>}
      <div className="modal-actions split-actions"><button className="button danger" type="button" onClick={onLogout}>Sign out</button><span /><button className="button" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save account"}</button></div>
    </form>}
  </Modal>;
}

function PageHead({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <header className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div>{action}</header>;
}

function Dashboard({ bootstrap, lessons, screens, onNavigate }: { bootstrap: Bootstrap; lessons: Lesson[]; screens: Screen[]; onNavigate: (v: View) => void }) {
  const upcoming = [...lessons].filter(l => new Date(`${l.date}T23:59:59`) >= new Date()).slice(0, 5);
  const online = screens.filter(s => s.online).length;
  return <>
    <PageHead eyebrow="OVERVIEW" title={`Good ${dayPart()}.`} detail={`${bootstrap.organization} is running entirely on this local server.`} action={<button className="button primary" onClick={() => onNavigate("classes")}>Build a lesson</button>} />
    <div className="stats-grid">
      <Stat label="Classes" value={bootstrap.counts.classes} sub={`${bootstrap.counts.lessons} lessons`} />
      <Stat label="Media files" value={bootstrap.counts.media} sub="stored locally" />
      <Stat label="Paired screens" value={bootstrap.counts.screens} sub={`${online} online now`} />
      <Stat label="Pairing PIN" value={bootstrap.pairingPin || "Restricted"} sub={bootstrap.pairingPin ? "enter on a new screen" : "screen administrators only"} mono />
    </div>
    <div className="dashboard-grid">
      <section className="panel"><PanelTitle title="Upcoming lessons" action="Manage classes" onClick={() => onNavigate("classes")} />
        {upcoming.length ? <div className="rows">{upcoming.map(l => <div className="row" key={l.id}><DateBadge date={l.date} /><div className="grow"><strong>{l.title}</strong><small>{l.className} · {l.items.length} playlist items</small></div><RoleSummary items={l.items} /></div>)}</div> : <Empty title="No upcoming lessons" body="Create a lesson inside one of your classes." />}
      </section>
      <section className="panel"><PanelTitle title="Screen health" action="View screens" onClick={() => onNavigate("screens")} />
        {screens.filter(s => !s.revoked).length ? <div className="rows">{screens.filter(s => !s.revoked).slice(0, 5).map(s => <div className="row" key={s.id}><span className={`screen-icon ${isOnline(s) ? "online" : ""}`}>▣</span><div className="grow"><strong>{s.name}</strong><small>{s.assignedClassName || "Not assigned"}</small></div><Status online={isOnline(s)} /></div>)}</div> : <Empty title="No paired screens" body={bootstrap.pairingPin ? `Open LessonCue TV and enter PIN ${bootstrap.pairingPin}.` : "Ask a screen administrator to pair a television."} />}
      </section>
    </div>
  </>;
}

function ClassesView({ classes, lessons, media, taxonomy, refresh, notify, canUpload, storage, localControllerOrigin }: { classes: LessonClass[]; lessons: Lesson[]; media: Media[]; taxonomy: MediaTaxonomy; refresh: () => void; notify: (s: string) => void; canUpload: boolean; storage?: StorageStatus; localControllerOrigin?: string }) {
  const [selected, setSelected] = useState(classes[0]?.id || "");
  const [editing, setEditing] = useState<string>();
  const [showClassForm, setShowClassForm] = useState(false);
  const [showControllerSettings, setShowControllerSettings] = useState(false);
  const [showEditClass, setShowEditClass] = useState(false);
  const [controllerLessonId, setControllerLessonId] = useState("");
  const [temporaryController, setTemporaryController] = useState<TemporaryControllerSession>();
  const [temporaryMinutes, setTemporaryMinutes] = useState("60");
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(new Set());
  const [lessonBulkAction, setLessonBulkAction] = useState("archive");
  const [showLessonBulk, setShowLessonBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const current = classes.find(c => c.id === selected) || classes[0];
  const classLessons = lessons.filter(l => l.classId === current?.id).sort((a, b) => a.date.localeCompare(b.date));
  const selectedLessons = classLessons.filter(l => selectedLessonIds.has(l.id));
  const allLessonsSelected = classLessons.length > 0 && selectedLessons.length === classLessons.length;
  const lesson = lessons.find(l => l.id === editing);
  if (lesson) return <LessonEditor lesson={lesson} media={media} taxonomy={taxonomy} onBack={() => setEditing(undefined)} refresh={refresh} notify={notify} canUpload={canUpload} storage={storage} />;

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try { const item = await api<LessonClass>("/api/v1/classes", { method: "POST", body: JSON.stringify(values) }); setSelected(item.id); setShowClassForm(false); refresh(); }
    catch (e) { notify(errorText(e)); }
  }
  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!current) return; const values = Object.fromEntries(new FormData(event.currentTarget));
    try { const item = await api<Lesson>("/api/v1/lessons", { method: "POST", body: JSON.stringify({ ...values, classId: current.id, preRollEnabled: false, countdownItemId: null, availableFrom: null, expiresAt: null, designatedStartAt: null }) }); refresh(); setEditing(item.id); }
    catch (e) { notify(errorText(e)); }
  }
  async function updateController(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/v1/classes/${current.id}`, { method: "PUT", body: JSON.stringify({ name: current.name, description: current.description,
        controllerSlug: values.controllerSlug, controllerColor: values.controllerColor, controllerHostname: values.controllerHostname || null }) });
      setShowControllerSettings(false); refresh(); notify("Class controller address and theme saved.");
    } catch (error) { notify(errorText(error)); }
  }
  async function updateClassDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await api(`/api/v1/classes/${current.id}`, { method: "PUT", body: JSON.stringify({ ...values,
      controllerSlug: current.controllerSlug || controllerSlug(current), controllerColor: current.controllerColor, controllerHostname: current.controllerHostname || null }) });
      setShowEditClass(false); refresh(); notify("Class details saved."); }
    catch (error) { notify(errorText(error)); }
  }
  async function deleteClass() {
    if (!current || !confirm(`Move ${current.name} and all of its lessons to the recycling bin? They can be restored for 30 days.`)) return;
    try { await api(`/api/v1/classes/${current.id}`, { method: "DELETE" }); setSelected(""); refresh(); notify("Class and lessons moved to the recycling bin."); }
    catch (error) { notify(errorText(error)); }
  }
  async function createTemporaryController() {
    if (!current) return;
    try { const session = await api<TemporaryControllerSession>("/api/v1/controller/sessions", { method: "POST", body: JSON.stringify({ classId: current.id, lessonId: controllerLessonId || null, expiresInMinutes: Number(temporaryMinutes) }) }); setTemporaryController(session); notify("Temporary restricted controller link created."); }
    catch (error) { notify(errorText(error)); }
  }
  function toggleLesson(id: string) { setSelectedLessonIds(value => { const next = new Set(value); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleAllLessons() { setSelectedLessonIds(allLessonsSelected ? new Set() : new Set(classLessons.map(item => item.id))); }
  async function applyLessonBulk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedLessons.length) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (lessonBulkAction === "delete" && !confirm(`Move ${selectedLessons.length} selected lesson${selectedLessons.length === 1 ? "" : "s"} to the recycling bin? They can be restored for 30 days.`)) return;
    setBulkBusy(true);
    try {
      await api("/api/v1/lessons/bulk", { method: "POST", body: JSON.stringify({ lessonIds: selectedLessons.map(item => item.id), action: lessonBulkAction,
        classId: lessonBulkAction === "move" ? values.classId : null, shiftDays: lessonBulkAction === "shift" ? Number(values.shiftDays) : null,
        titlePrefix: lessonBulkAction === "prefix-title" ? values.titlePrefix : null }) });
      setSelectedLessonIds(new Set()); setShowLessonBulk(false); refresh(); notify(`${selectedLessons.length} lesson${selectedLessons.length === 1 ? "" : "s"} updated.`);
    } catch (error) { notify(errorText(error)); } finally { setBulkBusy(false); }
  }
  return <>
    <PageHead eyebrow="PROGRAMMING" title="Classes & lessons" detail="Schedule lessons and compose exactly what your screens will play." action={<button className="button primary" onClick={() => setShowClassForm(true)}>New class</button>} />
    {showClassForm && <Modal title="Create a class" onClose={() => setShowClassForm(false)}><form onSubmit={createClass} className="stack"><Field label="Class name"><input name="name" required autoFocus /></Field><Field label="Description"><textarea name="description" rows={3} /></Field><button className="button primary">Create class</button></form></Modal>}
    {!classes.length ? <section className="panel"><Empty title="Create your first class" body="Classes organize lessons and determine which screens receive them." action={<button className="button primary" onClick={() => setShowClassForm(true)}>Create class</button>} /></section> : <div className="classes-layout">
      <aside className="class-list panel"><h3>Your classes</h3>{classes.map(c => <button key={c.id} className={current?.id === c.id ? "active" : ""} onClick={() => { setSelected(c.id); setSelectedLessonIds(new Set()); }}><span className="class-glyph">{c.name[0]}</span><span><strong>{c.name}</strong><small>{c.lessonCount} lessons · {c.screenCount} screens</small></span></button>)}</aside>
      <section className="panel class-detail"><div className="class-title"><div><span className="eyebrow">CLASS</span><h2>{current?.name}</h2><p>{current?.description || "No class description yet."}</p></div>{current && <div className="head-actions"><button className="button" onClick={() => setShowEditClass(true)}>Edit class</button><button className="button" onClick={() => setShowControllerSettings(true)}>Controller link</button></div>}</div>
        {showEditClass && current && <Modal title={`Edit ${current.name}`} onClose={() => setShowEditClass(false)}><form className="stack" onSubmit={updateClassDetails}><Field label="Class name"><input name="name" defaultValue={current.name} required autoFocus /></Field><Field label="Description"><textarea name="description" defaultValue={current.description} rows={3} /></Field><button className="button primary">Save class</button><button type="button" className="button danger" onClick={deleteClass}>Move class to recycling bin</button></form></Modal>}
        {showControllerSettings && current && (() => { const controllerOrigin = localControllerOrigin || location.origin; const controllerUrl = temporaryController ? `${controllerOrigin}${temporaryController.path}` : classControllerUrl(current, controllerLessonId, controllerOrigin); return <Modal title={`${current.name} controller`} onClose={() => setShowControllerSettings(false)}><form className="stack" onSubmit={updateController}><div className="controller-share-preview" style={{ "--room-color": current.controllerColor } as CSSProperties}><QrCode value={controllerUrl} /><div><span>{temporaryController ? "TEMPORARY RESTRICTED CONTROLLER" : "TEACHER CONTROLLER"}</span><strong>{controllerUrl}</strong><p>{temporaryController ? `This link expires ${new Date(temporaryController.expiresAt).toLocaleString()} and cannot control another class or lesson.` : `This signed-in page only displays screens and lessons assigned to ${current.name}. Print or scan the QR code, then save the page to the phone's Home Screen.`}</p>{localControllerOrigin && <p>Campus-only control is on, so this QR always uses the local .local address.</p>}</div></div><Field label="QR code opens" hint="A lesson-specific QR still lets the teacher choose another lesson in this class."><select value={controllerLessonId} onChange={event => { setControllerLessonId(event.target.value); setTemporaryController(undefined); }}><option value="">The classroom</option>{classLessons.filter(item => !item.archived).map(item => <option value={item.id} key={item.id}>{formatDate(item.date)} — {item.title}</option>)}</select></Field><div className="temporary-controller-row"><Field label="Temporary link duration"><select value={temporaryMinutes} onChange={event => { setTemporaryMinutes(event.target.value); setTemporaryController(undefined); }}><option value="15">15 minutes</option><option value="60">1 hour</option><option value="240">4 hours</option><option value="1440">1 day</option><option value="10080">7 days</option></select></Field><button type="button" className="button" onClick={createTemporaryController}>Create restricted temporary QR</button></div><div className="two-fields"><Field label="Path" hint="Lowercase letters, numbers, and hyphens"><div className="path-input"><span>/room/</span><input name="controllerSlug" required pattern="[a-z0-9-]+" maxLength={63} defaultValue={controllerSlug(current)} /></div></Field><Field label="Theme color"><input name="controllerColor" type="color" defaultValue={current.controllerColor || "#2d6a4f"} /></Field></div><Field label="Optional public hostname" hint="For example classroom1.example.org. Configure this hostname in Cloudflare to use the same LessonCue origin."><input name="controllerHostname" defaultValue={current.controllerHostname || ""} placeholder="classroom1.example.org" /></Field><button className="button primary">Save controller</button></form></Modal>; })()}
        <form className="quick-create" onSubmit={createLesson}><input name="title" placeholder="New lesson title" required /><input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /><button className="button primary">Create lesson</button></form>
        {showLessonBulk && <Modal title={`Bulk edit ${selectedLessons.length} lesson${selectedLessons.length === 1 ? "" : "s"}`} onClose={() => !bulkBusy && setShowLessonBulk(false)}><form className="stack" onSubmit={applyLessonBulk}><Field label="Action"><select value={lessonBulkAction} onChange={event => setLessonBulkAction(event.target.value)}><option value="archive">Archive</option><option value="restore">Restore from archive</option><option value="move">Move to another class</option><option value="shift">Shift dates and scheduled times</option><option value="prefix-title">Add a title prefix</option><option value="delete">Move to recycling bin</option></select></Field>{lessonBulkAction === "move" && <Field label="Destination class"><select name="classId" required>{classes.filter(item => item.id !== current?.id).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>}{lessonBulkAction === "shift" && <Field label="Days to shift" hint="Use a negative number to move earlier."><input name="shiftDays" type="number" min="-3650" max="3650" required defaultValue="7" /></Field>}{lessonBulkAction === "prefix-title" && <Field label="Prefix"><input name="titlePrefix" maxLength={80} required placeholder="Fall term —" /></Field>}{lessonBulkAction === "delete" && <div className="danger-callout"><strong>The selected lessons will be recoverable for 30 days.</strong><p>The media files remain in the library according to their retention settings.</p></div>}<button className={`button ${lessonBulkAction === "delete" ? "danger" : "primary"}`} disabled={bulkBusy || (lessonBulkAction === "move" && classes.length < 2)}>{bulkBusy ? "Applying…" : "Apply to selected lessons"}</button></form></Modal>}
        {selectedLessons.length > 0 && <section className="bulk-actions lesson-bulk-actions"><strong>{selectedLessons.length} selected</strong><span>Archive, move, shift, rename, restore, or delete these lessons together.</span><div><button className="button primary" onClick={() => setShowLessonBulk(true)}>Bulk edit</button><button className="button" onClick={() => setSelectedLessonIds(new Set())}>Clear</button></div></section>}
        {classLessons.length ? <div className="lesson-cards"><div className="lesson-select-all"><label><input type="checkbox" checked={allLessonsSelected} onChange={toggleAllLessons} /> Select all lessons</label><span>{classLessons.filter(item => item.archived).length} archived</span></div>{classLessons.map(l => <article className={`lesson-card-row ${selectedLessonIds.has(l.id) ? "selected" : ""} ${l.archived ? "archived" : ""}`} key={l.id}><label className="media-select"><input type="checkbox" checked={selectedLessonIds.has(l.id)} onChange={() => toggleLesson(l.id)} aria-label={`Select lesson ${l.title}`} /></label><button onClick={() => setEditing(l.id)}><DateBadge date={l.date} /><span className="grow"><strong>{l.title}</strong><small>{l.items.length} items · Version {l.version}{l.archived ? " · Archived" : ""}</small></span><RoleSummary items={l.items} /><b>›</b></button></article>)}</div> : <Empty title="No lessons in this class" body="Add the first lesson with the form above." />}
      </section>
    </div>}
  </>;
}

function LessonEditor({ lesson, media, taxonomy, onBack, refresh, notify, canUpload, storage }: { lesson: Lesson; media: Media[]; taxonomy: MediaTaxonomy; onBack: () => void; refresh: () => void; notify: (s: string) => void; canUpload: boolean; storage?: StorageStatus }) {
  const [showAdd, setShowAdd] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [onlineMode, setOnlineMode] = useState<"online" | "download" | "slides">("online");
  const [previewItem, setPreviewItem] = useState<PlaylistItem>();
  const [selectedCueIds, setSelectedCueIds] = useState<Set<string>>(new Set());
  const [cueBulkAction, setCueBulkAction] = useState("role");
  const [cueBulkBusy, setCueBulkBusy] = useState(false);
  const items = [...lesson.items].sort((a, b) => a.position - b.position);
  const countdown = items.find(i => i.role === "countdown");
  const playableMedia = media.filter(item => (/^(video|audio|image)\//.test(item.contentType) || item.sourceKind === "link") && item.processingStatus === "ready");
  async function updateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await api(`/api/v1/lessons/${lesson.id}`, { method: "PUT", body: JSON.stringify({ title: values.title, date: values.date, designatedStartAt: values.designatedStartAt ? new Date(String(values.designatedStartAt)).toISOString() : null, clearDesignatedStartAt: !values.designatedStartAt, preRollStartsAt: values.preRollStartsAt ? new Date(String(values.preRollStartsAt)).toISOString() : null, clearPreRollStartsAt: !values.preRollStartsAt, preRollEnabled: values.preRollEnabled === "on", clearCountdown: false }) }); notify("Lesson schedule saved."); refresh(); }
    catch (e) { notify(errorText(e)); }
  }
  const selectedCues = items.filter(item => selectedCueIds.has(item.id));
  const allCuesSelected = items.length > 0 && selectedCues.length === items.length;
  async function addAssetToLesson(asset: Media, role: string, title?: FormDataEntryValue | null, position?: number) {
    const type = asset.linkKind === "webpage" ? "external" : asset.linkKind === "youtube" || asset.linkKind === "embedded" ? "web" : asset.contentType.startsWith("video") ? "video" : asset.contentType.startsWith("audio") ? "audio" : "image";
    await api(`/api/v1/lessons/${lesson.id}/items`, { method: "POST", body: JSON.stringify({ title: title || asset.fileName, type, role, position: position ?? (items.length + 1) * 1000, mediaId: asset.id, durationMs: asset.durationMs, startMs: 0, endMs: null, volumePercent: 100, imageDurationSeconds: type === "image" ? 10 : null, endBehavior: role === "preRoll" ? "loop" : "advance", allowSkip: true }) });
  }
  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const asset = playableMedia.find(m => m.id === values.mediaId);
    if (!asset) return;
    try { await addAssetToLesson(asset, String(values.role), values.title); setShowAdd(false); refresh(); notify("Media added to the lesson."); }
    catch (e) { notify(errorText(e)); }
  }
  async function uploadAndAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (!files.length) return;
    const role = String(form.get("role") || "lesson");
    if (role === "countdown" && files.length > 1) { notify("Choose one file when adding a countdown; a lesson can have only one countdown."); return; }
    const presentationFiles = files.filter(file => isPresentationFileName(file.name));
    if (presentationFiles.length && role !== "lesson") { notify("Imported presentation slides are added as main lesson cues. Choose Main lesson and try again."); return; }
    setUploading(true); setUploadProgress(0);
    try {
      const persistent = form.get("storagePolicy") === "persistent";
      const tagsCsv = formTags(form);
      let completed = 0;
      for (const file of files) {
        const asset = await uploadMediaFile(file, { persistent, lessonId: persistent ? undefined : lesson.id,
          folder: String(form.get("folder") || ""), tagsCsv,
          onProgress: percent => setUploadProgress(Math.round(((completed + percent / 100) / files.length) * 100)) });
        if (isConvertibleDocument(asset)) {
          await api(`/api/v1/media/${asset.id}/convert-and-add-to-lesson`, {
            method: "POST", body: JSON.stringify({ lessonId: lesson.id, imageDurationSeconds: Number(form.get("slideSeconds") || 10) }),
          });
        } else {
          const customTitle = files.length === 1 ? form.get("title") : null;
          await addAssetToLesson(asset, role, customTitle, (items.length + completed + 1) * 1000);
        }
        completed++; setUploadProgress(Math.round(completed / files.length * 100));
      }
      setShowAdd(false); refresh();
      notify(presentationFiles.length ? `${presentationFiles.length} presentation${presentationFiles.length === 1 ? "" : "s"} queued for local slide conversion; the slides will appear in this lesson automatically.` : persistent ? `${files.length} file${files.length === 1 ? "" : "s"} uploaded permanently and added to the lesson.` : `${files.length} file${files.length === 1 ? "" : "s"} added. ${files.length === 1 ? "It" : "They"} will be deleted four weeks after ${formatDate(lesson.date)}.`);
    } catch (e) { notify(errorText(e)); }
    finally { setUploading(false); setUploadProgress(0); }
  }
  async function addOnline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const download = onlineMode === "download"; const importPresentation = onlineMode === "slides";
    setUploading(true);
    try {
      const persistent = onlineMode === "online" || form.get("storagePolicy") === "persistent";
      const asset = await api<Media>("/api/v1/media/link", { method: "POST", body: JSON.stringify({ url: form.get("url"), title: form.get("title") || null, download, importPresentation, persistent, lessonId: persistent ? null : lesson.id, folder: form.get("folder"), tagsCsv: formTags(form) }) });
      if (importPresentation) await api(`/api/v1/media/${asset.id}/convert-and-add-to-lesson`, { method: "POST", body: JSON.stringify({ lessonId: lesson.id, imageDurationSeconds: Number(form.get("slideSeconds") || 10) }) });
      else await addAssetToLesson(asset, download ? String(form.get("role") || "lesson") : "lesson", form.get("title"));
      setShowAdd(false); refresh();
      notify(download ? "YouTube download queued. It will become offline-ready after processing." : importPresentation ? "Google Slides imported; converted slides will appear in this lesson automatically." : "Online media added to the lesson.");
    } catch (e) { notify(errorText(e)); } finally { setUploading(false); }
  }
  async function changeItem(item: PlaylistItem, changes: Record<string, unknown>) { try { await api(`/api/v1/playlist-items/${item.id}`, { method: "PATCH", body: JSON.stringify(changes) }); refresh(); notify("Playlist saved."); } catch (e) { notify(errorText(e)); } }
  async function removeItem(id: string) { if (!confirm("Remove this item from the playlist? The media file will remain in your library.")) return; await api(`/api/v1/playlist-items/${id}`, { method: "DELETE" }); refresh(); }
  async function move(index: number, delta: number) { const reordered = [...items]; const target = index + delta; if (target < 0 || target >= items.length) return; [reordered[index], reordered[target]] = [reordered[target], reordered[index]]; await api(`/api/v1/lessons/${lesson.id}/reorder`, { method: "POST", body: JSON.stringify({ itemIds: reordered.map(i => i.id) }) }); refresh(); }
  function toggleCue(id: string) { setSelectedCueIds(value => { const next = new Set(value); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleAllCues() { setSelectedCueIds(allCuesSelected ? new Set() : new Set(items.map(item => item.id))); }
  async function applyCueBulk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedCues.length) return; const values = Object.fromEntries(new FormData(event.currentTarget));
    if (cueBulkAction === "delete" && !confirm(`Remove ${selectedCues.length} selected cue${selectedCues.length === 1 ? "" : "s"} from this lesson? Media files remain in the library.`)) return;
    setCueBulkBusy(true);
    try {
      await api("/api/v1/playlist-items/bulk", { method: "POST", body: JSON.stringify({ itemIds: selectedCues.map(item => item.id), action: cueBulkAction,
        role: cueBulkAction === "role" ? values.role : null, volumePercent: cueBulkAction === "volume" ? Number(values.volumePercent) : null,
        endBehavior: cueBulkAction === "end-behavior" ? values.endBehavior : null,
        allowSkip: cueBulkAction === "allow-skip" ? values.allowSkip === "true" : null,
        titlePrefix: cueBulkAction === "prefix-title" ? values.titlePrefix : null }) });
      setSelectedCueIds(new Set()); refresh(); notify(`${selectedCues.length} playlist cue${selectedCues.length === 1 ? "" : "s"} updated.`);
    } catch (error) { notify(errorText(error)); } finally { setCueBulkBusy(false); }
  }
  return <>
    <button className="back-button" onClick={onBack}>← Back to {lesson.className}</button>
    <PageHead eyebrow="LESSON BUILDER" title={lesson.title} detail={`${formatDate(lesson.date)} · Manifest version ${lesson.version}`} action={canUpload ? <button className="button primary" onClick={() => setShowAdd(true)}>Add media</button> : undefined} />
    {showAdd && canUpload && <Modal title="Add media to the lesson" onClose={() => !uploading && setShowAdd(false)}><div className="add-media-options">
      <section><h3>Upload from this computer</h3><p>Select one file or add a complete group in order without leaving this lesson. Presentations are converted locally and their slides appear automatically. {storage && `${formatBytes(storage.remainingBytes)} remains available.`}</p><form className="stack" onSubmit={uploadAndAdd}><Field label="Media files" hint="Supports video, audio, images, PDF, PowerPoint, OpenDocument, Keynote, and Word."><input name="files" type="file" multiple accept="video/*,audio/*,image/*,.pdf,.ppt,.pptx,.pps,.ppsx,.pot,.potx,.odp,.key,.doc,.docx" required disabled={uploading} /></Field><RetentionChoices lessonDate={lesson.date} /><TaxonomyFields taxonomy={taxonomy} /><div className="two-fields"><Field label="Playlist role"><select name="role"><option value="lesson">Main lesson</option><option value="preRoll">Pre-roll loop</option><option value="countdown">Countdown video (one file)</option></select></Field><Field label="Display title" hint="Used only when one non-presentation file is selected."><input name="title" placeholder="Use filename" /></Field></div><Field label="Seconds per imported slide" hint="Used only for presentation files."><input name="slideSeconds" type="number" min="1" max="3600" defaultValue="10" /></Field><button type="submit" className="button primary" disabled={uploading}>{uploading ? `Uploading ${uploadProgress}%` : "Upload and add"}</button></form></section>
      <section className="online-choice"><h3>Add online media or slides</h3><p>Show a webpage, play or download YouTube, or import a shared Google Slides deck as local slide images.</p><form className="stack" onSubmit={addOnline}><Field label={onlineMode === "slides" ? "Google Slides share URL" : "Webpage or YouTube URL"} hint={onlineMode === "slides" ? "Share the deck so anyone with the link can view it." : undefined}><input name="url" type="url" required placeholder="https://…" disabled={uploading} /></Field><fieldset className="retention-options"><legend>How should LessonCue use it?</legend><label><input type="radio" checked={onlineMode === "online"} onChange={() => setOnlineMode("online")} /><span><strong>Play online</strong><small>YouTube uses an embedded player; other URLs display as webpages.</small></span></label><label><input type="radio" checked={onlineMode === "download"} onChange={() => setOnlineMode("download")} /><span><strong>Download YouTube locally</strong><small>Use only for video you are authorized to copy. Processing continues in the background.</small></span></label><label><input type="radio" checked={onlineMode === "slides"} onChange={() => setOnlineMode("slides")} /><span><strong>Import Google Slides</strong><small>Download a PDF copy and add converted slides automatically.</small></span></label></fieldset>{onlineMode !== "online" && <RetentionChoices lessonDate={lesson.date} />}<TaxonomyFields taxonomy={taxonomy} /><div className="two-fields">{onlineMode === "download" && <Field label="Playlist role"><select name="role"><option value="lesson">Main lesson</option><option value="preRoll">Pre-roll loop</option><option value="countdown">Countdown video</option></select></Field>}<Field label="Display title"><input name="title" maxLength={240} placeholder={onlineMode === "download" ? "YouTube video" : onlineMode === "slides" ? "Presentation title" : "Use website name"} /></Field>{onlineMode === "slides" && <Field label="Seconds per slide"><input name="slideSeconds" type="number" min="1" max="3600" defaultValue="10" /></Field>}</div><button className="button primary" disabled={uploading}>{uploading ? "Adding…" : onlineMode === "download" ? "Queue download and add" : onlineMode === "slides" ? "Import slides and add" : "Add online media"}</button></form></section>
      {playableMedia.length > 0 && <section className="library-choice"><h3>Choose existing media</h3><form className="stack" onSubmit={addItem}><Field label="Ready media"><select name="mediaId" required>{playableMedia.map(m => <option key={m.id} value={m.id}>{m.fileName}</option>)}</select></Field><div className="two-fields"><Field label="Playlist role"><select name="role"><option value="lesson">Main lesson</option><option value="preRoll">Pre-roll loop</option><option value="countdown">Countdown video</option></select></Field><Field label="Display title"><input name="title" placeholder="Use media filename" /></Field></div><button className="button">Add existing media</button></form></section>}
    </div></Modal>}
    {previewItem && <Modal title={`Visual timeline & fades: ${previewItem.title}`} onClose={() => setPreviewItem(undefined)}><TimelineEditor item={previewItem} media={media.find(asset => asset.id === previewItem.mediaAssetId)} onSave={changes => changeItem(previewItem, changes)} /></Modal>}
    <div className="editor-grid">
      <section className="panel schedule-panel"><h2>Timing</h2><form className="stack" onSubmit={updateLesson}><Field label="Lesson title"><input name="title" defaultValue={lesson.title} required /></Field><Field label="Lesson date"><input name="date" type="date" defaultValue={lesson.date} required /></Field><Field label="Pre-roll begins" hint="Paired screens automatically start looping pre-roll at this time."><input name="preRollStartsAt" type="datetime-local" defaultValue={toLocalInput(lesson.preRollStartsAt)} /></Field><Field label="Designated class start" hint="The countdown begins exactly one countdown-video duration before this time."><input name="designatedStartAt" type="datetime-local" defaultValue={toLocalInput(lesson.designatedStartAt)} /></Field><label className="switch-row"><input type="checkbox" name="preRollEnabled" defaultChecked={lesson.preRollEnabled} /><span /><div><strong>Enable pre-roll</strong><small>Loop all pre-roll items until the countdown or class begins.</small></div></label><button className="button primary">Save timing</button></form>
        <div className="timing-explain"><span>◷</span><div><strong>{countdown && lesson.designatedStartAt ? `Countdown begins ${formatDuration(countdown.durationMs || countdown.mediaDurationMs)} before class` : "Countdown is optional"}</strong><p>Assign one video as the countdown. Its full duration determines when it starts automatically.</p></div></div>
      </section>
      <section className="panel playlist-panel"><div className="panel-heading"><div><h2>Playback sequence</h2><p>Pre-roll loops, countdown runs once, then lesson media plays in order.</p></div><span className="pill">{items.length} items</span></div>
        {items.length > 0 && <div className="preview-strip"><span>PREVIEW WITH TRIMS & FADES</span>{items.map(item => <button key={item.id} onClick={() => setPreviewItem(item)}>▶ {item.title}</button>)}</div>}
        {selectedCues.length > 0 && <form className="cue-bulk-actions" onSubmit={applyCueBulk}><strong>{selectedCues.length} selected</strong><select aria-label="Bulk cue action" value={cueBulkAction} onChange={event => setCueBulkAction(event.target.value)}><option value="role">Set role</option><option value="volume">Set volume</option><option value="end-behavior">Set end behavior</option><option value="allow-skip">Set skipping</option><option value="prefix-title">Add title prefix</option><option value="delete">Remove cues</option></select>{cueBulkAction === "role" && <select name="role" aria-label="Role for selected cues"><option value="lesson">Main lesson</option><option value="preRoll">Pre-roll</option>{selectedCues.length === 1 && <option value="countdown">Countdown</option>}</select>}{cueBulkAction === "volume" && <label>Volume <input name="volumePercent" type="number" min="0" max="150" required defaultValue="100" />%</label>}{cueBulkAction === "end-behavior" && <select name="endBehavior" aria-label="End behavior for selected cues"><option value="advance">Advance</option><option value="loop">Loop</option><option value="pause">Pause on final frame</option><option value="stop">Stop</option></select>}{cueBulkAction === "allow-skip" && <select name="allowSkip" aria-label="Skipping for selected cues"><option value="true">Allow skip</option><option value="false">Do not allow skip</option></select>}{cueBulkAction === "prefix-title" && <input name="titlePrefix" maxLength={80} required placeholder="Title prefix" aria-label="Prefix for selected cue titles" />}<button className={`button ${cueBulkAction === "delete" ? "danger" : "primary"}`} disabled={cueBulkBusy}>{cueBulkBusy ? "Applying…" : "Apply"}</button><button className="button" type="button" onClick={() => setSelectedCueIds(new Set())}>Clear</button></form>}
        {items.length ? <div className="playlist"><label className="playlist-select-all"><input type="checkbox" checked={allCuesSelected} onChange={toggleAllCues} /> Select all cues</label>{items.map((item, index) => <PlaylistCueRow key={item.id} item={item} index={index} total={items.length} selected={selectedCueIds.has(item.id)} onSelected={() => toggleCue(item.id)} onMove={move} onChange={changeItem} onTimeline={() => setPreviewItem(item)} onRemove={removeItem} />)}</div> : <Empty title="This playlist is empty" body="Add videos, audio, or images from your local media library." action={<button className="button primary" onClick={() => setShowAdd(true)}>Add media</button>} />}
      </section>
    </div>
  </>;
}

function PlaylistCueRow({ item, index, total, selected, onSelected, onMove, onChange, onTimeline, onRemove }: {
  item: PlaylistItem; index: number; total: number; onMove: (index: number, delta: number) => void | Promise<void>;
  onChange: (item: PlaylistItem, changes: Record<string, unknown>) => void | Promise<void>;
  selected: boolean; onSelected: () => void; onTimeline: () => void; onRemove: (id: string) => void | Promise<void>;
}) {
  return <article className={`playlist-item ${item.role} ${selected ? "selected" : ""}`}>
    <label className="media-select"><input type="checkbox" checked={selected} onChange={onSelected} aria-label={`Select cue ${item.title}`} /></label>
    <div className="order-controls"><button aria-label={`Move ${item.title} up`} disabled={!index} onClick={() => onMove(index, -1)}>↑</button><span>{index + 1}</span><button aria-label={`Move ${item.title} down`} disabled={index === total - 1} onClick={() => onMove(index, 1)}>↓</button></div>
    <div className="media-thumb">{item.type === "video" ? "▶" : item.type === "audio" ? "♫" : "▧"}</div>
    <div className="item-main"><div><span className={`role ${item.role}`}>{roleName(item.role)}</span><strong>{item.title}</strong></div><small>{item.mediaFileName || item.type} · {formatDuration(item.durationMs || item.mediaDurationMs)}</small>
      <button className="timeline-edit" onClick={onTimeline}>▥ Edit visual timeline, trims & fades</button>
      <div className="item-options"><select aria-label="Role" value={item.role} onChange={e => onChange(item, { role: e.target.value })}><option value="preRoll">Pre-roll</option><option value="countdown">Countdown</option><option value="lesson">Main lesson</option></select><select aria-label="End behavior" value={item.endBehavior} onChange={e => onChange(item, { endBehavior: e.target.value })}><option value="advance">Advance</option><option value="loop">Loop</option><option value="pause">Pause on final frame</option></select><label>Volume <input type="number" min="0" max="150" defaultValue={item.volumePercent} onBlur={e => onChange(item, { volumePercent: Number(e.target.value) })} />%</label></div>
      <details className="item-advanced"><summary>Numeric timing, audio & volunteer notes</summary><div className="advanced-grid"><Field label="Display title"><input defaultValue={item.title} onBlur={e => e.target.value !== item.title && onChange(item, { title: e.target.value })} /></Field><Field label="Start at (seconds)"><input type="number" min="0" step="0.1" defaultValue={item.startMs / 1000} onBlur={e => onChange(item, { startMs: Math.round(Number(e.target.value) * 1000) })} /></Field><Field label="End at (seconds)"><input type="number" min="0" step="0.1" defaultValue={item.endMs ? item.endMs / 1000 : ""} onBlur={e => onChange(item, e.target.value ? { endMs: Math.round(Number(e.target.value) * 1000) } : { clearEndMs: true })} /></Field><Field label="Fade in (seconds)"><input type="number" min="0" max="30" step="0.1" defaultValue={(item.fadeInMs || 0) / 1000} onBlur={e => onChange(item, { fadeInMs: Math.round(Number(e.target.value) * 1000) })} /></Field><Field label="Fade out (seconds)"><input type="number" min="0" max="30" step="0.1" defaultValue={(item.fadeOutMs || 0) / 1000} onBlur={e => onChange(item, { fadeOutMs: Math.round(Number(e.target.value) * 1000) })} /></Field><Field label="Volunteer notes"><input defaultValue={item.notes || ""} placeholder="Shown during playback" onBlur={e => onChange(item, { notes: e.target.value })} /></Field></div><label className="check-line"><input type="checkbox" defaultChecked={item.normalizeAudio} onChange={e => onChange(item, { normalizeAudio: e.target.checked })} /> Normalize audio when a processed derivative is available</label></details>
    </div><button className="delete-button" onClick={() => onRemove(item.id)} title="Remove item">×</button>
  </article>;
}

function MediaView({ media, lessons, taxonomy, refresh, notify, canUpload, storage }: { media: Media[]; lessons: Lesson[]; taxonomy: MediaTaxonomy; refresh: () => void; notify: (s: string) => void; canUpload: boolean; storage?: StorageStatus }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showLink, setShowLink] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<Media>();
  const availableLessons = [...lessons].filter(l => !l.archived).sort((a, b) => a.date.localeCompare(b.date));
  const firstUpcoming = availableLessons.find(l => new Date(`${l.date}T23:59:59`) >= new Date()) || availableLessons.at(-1);
  const [showUpload, setShowUpload] = useState(false);
  const [storagePolicy, setStoragePolicy] = useState<"lesson" | "persistent">(availableLessons.length ? "lesson" : "persistent");
  const [linkMode, setLinkMode] = useState<"online" | "download" | "slides">("online");
  const [linkStoragePolicy, setLinkStoragePolicy] = useState<"lesson" | "persistent">(availableLessons.length ? "lesson" : "persistent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [retentionTargets, setRetentionTargets] = useState<Media[]>([]);
  const [retentionMode, setRetentionMode] = useState<"expire" | "keep">("expire");
  const [retentionDate, setRetentionDate] = useState(dateInputValue(undefined, 28));
  const [bulkBusy, setBulkBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [organizeTargets, setOrganizeTargets] = useState<Media[]>([]);
  const [renameTargets, setRenameTargets] = useState<Media[]>([]);
  const [manageMedia, setManageMedia] = useState<Media>();
  const [mediaImpact, setMediaImpact] = useState<MediaImpact>();
  const [manageBusy, setManageBusy] = useState(false);
  const [conversionLessonId, setConversionLessonId] = useState(firstUpcoming?.id || "");
  const [slideSeconds, setSlideSeconds] = useState(10);
  useEffect(() => { if (!media.some(item => ["downloading", "pending", "processing"].includes(item.processingStatus) || ["pending", "converting"].includes(item.conversionStatus) || item.transcodes?.some(profile => ["pending", "converting"].includes(profile.status)))) return; const timer = window.setTimeout(refresh, 4000); return () => window.clearTimeout(timer); }, [media, refresh]);
  const managedMediaId = manageMedia?.id;
  useEffect(() => { if (!managedMediaId) return; const updated = media.find(item => item.id === managedMediaId); if (updated) setManageMedia(updated); }, [media, managedMediaId]);
  useEffect(() => { setSelectedIds(current => { const next = new Set([...current].filter(id => media.some(item => item.id === id))); return next.size === current.size ? current : next; }); }, [media]);
  const folders = [...new Set([...taxonomy.folders, ...media.map(item => item.folder)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const normalizedSearch = search.trim().toLowerCase();
  const filteredMedia = media.filter(item => (!folderFilter || item.folder === folderFilter) && (!normalizedSearch || `${item.fileName} ${item.folder} ${item.tagsCsv}`.toLowerCase().includes(normalizedSearch)));
  const selectedMedia = media.filter(item => selectedIds.has(item.id));
  const allSelected = filteredMedia.length > 0 && filteredMedia.every(item => selectedIds.has(item.id));
  function toggleSelection(id: string) { setSelectedIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleAll() { setSelectedIds(current => { const next = new Set(current); for (const item of filteredMedia) { if (allSelected) next.delete(item.id); else next.add(item.id); } return next; }); }
  function openRetention(items: Media[], forceExpire = false) {
    if (!items.length) return;
    setRetentionTargets(items);
    setRetentionMode(forceExpire || items.some(item => item.storagePolicy === "lesson") ? "expire" : "keep");
    setRetentionDate(dateInputValue(items.length === 1 ? items[0].deleteAfter : undefined, 28));
  }
  async function runBulk(action: "delete" | "expire" | "keep", items: Media[], deleteOn?: string) {
    if (!items.length) return;
    setBulkBusy(true);
    try {
      await api<{ updated: number }>("/api/v1/media/bulk", { method: "POST", body: JSON.stringify({ mediaIds: items.map(item => item.id), action, deleteOn: action === "expire" ? deleteOn : null }) });
      setSelectedIds(new Set()); setRetentionTargets([]); refresh();
      notify(action === "delete" ? `${items.length} media item${items.length === 1 ? "" : "s"} deleted.` : action === "keep" ? `${items.length} media item${items.length === 1 ? "" : "s"} will be kept permanently.` : `${items.length} media item${items.length === 1 ? "" : "s"} will be deleted after ${formatDate(deleteOn!)}.`);
    } catch (e) { notify(errorText(e)); }
    finally { setBulkBusy(false); }
  }
  async function deleteSelected() {
    if (!selectedMedia.length || !confirm(`Move ${selectedMedia.length} selected media item${selectedMedia.length === 1 ? "" : "s"} to the recycling bin? They can be restored for 30 days.`)) return;
    await runBulk("delete", selectedMedia);
  }
  async function saveRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runBulk(retentionMode, retentionTargets, retentionMode === "expire" ? retentionDate : undefined);
  }
  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!organizeTargets.length) return;
    const form = new FormData(event.currentTarget); const values = Object.fromEntries(form); const tagsCsv = formTags(form); setBulkBusy(true);
    try {
      if (organizeTargets.length === 1) await api(`/api/v1/media/${organizeTargets[0].id}/organize`, { method: "PATCH", body: JSON.stringify({ fileName: values.fileName, folder: values.folder, tagsCsv }) });
      else await api("/api/v1/media/bulk", { method: "POST", body: JSON.stringify({ mediaIds: organizeTargets.map(item => item.id), action: "organize", folder: values.folder, tagsCsv }) });
      setOrganizeTargets([]); setSelectedIds(new Set()); refresh(); notify(`${organizeTargets.length} media item${organizeTargets.length === 1 ? "" : "s"} organized.`);
    } catch (e) { notify(errorText(e)); } finally { setBulkBusy(false); }
  }
  async function prefixNames(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!renameTargets.length) return;
    const values = Object.fromEntries(new FormData(event.currentTarget)); setBulkBusy(true);
    try {
      await api("/api/v1/media/bulk", { method: "POST", body: JSON.stringify({ mediaIds: renameTargets.map(item => item.id), action: "prefix-name", fileNamePrefix: values.fileNamePrefix }) });
      const count = renameTargets.length; setRenameTargets([]); setSelectedIds(new Set()); refresh(); notify(`${count} media item${count === 1 ? "" : "s"} renamed.`);
    } catch (e) { notify(errorText(e)); } finally { setBulkBusy(false); }
  }
  async function loadImpact(item: Media) { setManageMedia(item); setMediaImpact(undefined); try { setMediaImpact(await api<MediaImpact>(`/api/v1/media/${item.id}/impact`)); } catch (e) { notify(errorText(e)); } }
  async function reprocessMedia() { if (!manageMedia) return; setManageBusy(true); try { await api(`/api/v1/media/${manageMedia.id}/reprocess`, { method: "POST", body: "{}" }); notify(`${manageMedia.fileName} queued for reprocessing.`); setManageMedia(undefined); refresh(); } catch (e) { notify(errorText(e)); } finally { setManageBusy(false); } }
  async function replaceMedia(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!manageMedia || !confirm(`Replace ${manageMedia.fileName}? Every lesson and sign using it will receive the new version.`)) return; setManageBusy(true); try { await api(`/api/v1/media/${manageMedia.id}/replace`, { method: "POST", body: new FormData(event.currentTarget) }); notify(`${manageMedia.fileName} replaced; its previous version remains available.`); setManageMedia(undefined); refresh(); } catch (e) { notify(errorText(e)); } finally { setManageBusy(false); } }
  async function restoreMediaVersion(version: MediaVersion) { if (!manageMedia || !confirm(`Restore version ${version.versionNumber} of ${version.fileName} as the new current version?`)) return; setManageBusy(true); try { await api(`/api/v1/media/${manageMedia.id}/versions/${version.id}/restore`, { method: "POST", body: "{}" }); notify(`Version ${version.versionNumber} restored as a new current version.`); setManageMedia(undefined); refresh(); } catch (e) { notify(errorText(e)); } finally { setManageBusy(false); } }
  async function convertPresentation() { if (!manageMedia) return; setManageBusy(true); try { await api(`/api/v1/media/${manageMedia.id}/convert`, { method: "POST", body: "{}" }); notify(`${manageMedia.fileName} queued for fully local slide conversion.`); setManageMedia(undefined); refresh(); } catch (e) { notify(errorText(e)); } finally { setManageBusy(false); } }
  async function addConvertedSlides() { if (!manageMedia || !conversionLessonId) return; setManageBusy(true); try { const result = await api<{ added: number }>(`/api/v1/media/${manageMedia.id}/conversion/add-to-lesson`, { method: "POST", body: JSON.stringify({ lessonId: conversionLessonId, imageDurationSeconds: slideSeconds }) }); notify(`${result.added} converted slides added to the lesson.`); setManageMedia(undefined); refresh(); } catch (e) { notify(errorText(e)); } finally { setManageBusy(false); } }
  async function queueTranscodes(profile: "all" | "h264-720" | "h264-480" = "all") { if (!manageMedia) return; setManageBusy(true); try { await api(`/api/v1/media/${manageMedia.id}/transcodes/${profile}`, { method: "POST", body: "{}" }); notify(profile === "all" ? `${manageMedia.fileName} queued for both adaptive TV profiles.` : `${manageMedia.fileName} queued for the ${profile === "h264-720" ? "720p" : "480p"} TV profile.`); refresh(); } catch (e) { notify(errorText(e)); } finally { setManageBusy(false); } }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (!files.length) return;
    const persistent = storagePolicy === "persistent";
    const lessonId = persistent ? undefined : String(form.get("lessonId") || "");
    setUploading(true); setUploadProgress(0);
    try {
      let completed = 0;
      for (const file of files) {
        await uploadMediaFile(file, { persistent, lessonId, folder: String(form.get("folder") || ""), tagsCsv: formTags(form), onProgress: percent => setUploadProgress(Math.round(((completed + percent / 100) / files.length) * 100)) });
        completed++; setUploadProgress(Math.round(completed / files.length * 100));
      }
      notify(persistent ? `${files.length} reusable file${files.length === 1 ? "" : "s"} stored permanently.` : `${files.length} file${files.length === 1 ? "" : "s"} stored until four weeks after the selected lesson.`);
      setShowUpload(false); refresh();
    }
    catch (e) { notify(errorText(e)); } finally { setUploading(false); setUploadProgress(0); }
  }
  async function addLink(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const download = linkMode === "download"; const importPresentation = linkMode === "slides"; const persistent = linkMode === "online" || linkStoragePolicy === "persistent"; try { await api("/api/v1/media/link", { method: "POST", body: JSON.stringify({ url: form.get("url"), title: form.get("title") || null, download, importPresentation, persistent, lessonId: persistent ? null : form.get("lessonId"), folder: form.get("folder"), tagsCsv: formTags(form) }) }); setShowLink(false); refresh(); notify(download ? "YouTube download queued for local processing." : importPresentation ? "Google Slides imported and queued for slide conversion." : "Online media added to the library."); } catch (e) { notify(errorText(e)); } }
  return <><PageHead eyebrow="LOCAL STORAGE" title="Media library" detail="Files stay on this server. Lesson media expires automatically; reusable media can be kept permanently." action={canUpload ? <div className="head-actions"><button className="button" onClick={() => setShowLink(true)}>Add link</button><button className="button primary" onClick={() => setShowUpload(true)}>Upload media</button></div> : undefined} />
    {canUpload && storage && <section className="storage-overview" aria-label="LessonCue storage"><div><span>Available for uploads</span><strong>{formatBytes(storage.remainingBytes)}</strong></div><StorageMeter storage={storage} /><small>{formatBytes(storage.usedBytes)} used of {formatBytes(storage.allocationBytes)} allocated</small></section>}
    {previewMedia && <Modal title={`Preview: ${previewMedia.fileName}`} onClose={() => setPreviewMedia(undefined)}><MediaPreview media={previewMedia} /></Modal>}
    {retentionTargets.length > 0 && <Modal title={retentionTargets.length === 1 ? `Retention: ${retentionTargets[0].fileName}` : `Retention for ${retentionTargets.length} items`} onClose={() => !bulkBusy && setRetentionTargets([])}><form className="stack" onSubmit={saveRetention}><fieldset className="retention-options"><legend>How long should LessonCue keep {retentionTargets.length === 1 ? "this media" : "these items"}?</legend><label><input type="radio" checked={retentionMode === "expire"} onChange={() => setRetentionMode("expire")} /><span><strong>Delete on a selected date</strong><small>The media remains available through the end of that date.</small></span></label><label><input type="radio" checked={retentionMode === "keep"} onChange={() => setRetentionMode("keep")} /><span><strong>Keep permanently</strong><small>Retain it until someone explicitly deletes it.</small></span></label></fieldset>{retentionMode === "expire" && <Field label="Delete after"><input type="date" value={retentionDate} min={dateInputValue()} onChange={e => setRetentionDate(e.target.value)} required autoFocus /></Field>}<button className="button primary" disabled={bulkBusy}>{bulkBusy ? "Saving…" : "Save retention"}</button></form></Modal>}
    {renameTargets.length > 0 && <Modal title={`Rename ${renameTargets.length} selected media item${renameTargets.length === 1 ? "" : "s"}`} onClose={() => !bulkBusy && setRenameTargets([])}><form className="stack" onSubmit={prefixNames}><Field label="Name prefix" hint="The prefix is added before every selected name; file extensions are preserved."><input name="fileNamePrefix" maxLength={80} required autoFocus placeholder="Spring term —" /></Field><div className="alert">Example: “video.mp4” becomes “Spring term — video.mp4”.</div><button className="button primary" disabled={bulkBusy}>{bulkBusy ? "Renaming…" : "Rename selected media"}</button></form></Modal>}
    {organizeTargets.length > 0 && <Modal title={organizeTargets.length === 1 ? `Organize: ${organizeTargets[0].fileName}` : `Organize ${organizeTargets.length} items`} onClose={() => !bulkBusy && setOrganizeTargets([])}><form className="stack" onSubmit={saveOrganization}>{organizeTargets.length === 1 && <Field label="Display name"><input name="fileName" defaultValue={organizeTargets[0].fileName} maxLength={255} required /></Field>}<TaxonomyFields taxonomy={taxonomy} folder={organizeTargets.length === 1 ? organizeTargets[0].folder : ""} tagsCsv={organizeTargets.length === 1 ? organizeTargets[0].tagsCsv : ""} />{organizeTargets.length > 1 && <div className="alert">Folder and tags will replace the current values on all selected items.</div>}<button className="button primary" disabled={bulkBusy}>{bulkBusy ? "Saving…" : "Save organization"}</button></form></Modal>}
    {manageMedia && <MediaManagerModal media={manageMedia} impact={mediaImpact} lessons={availableLessons} busy={manageBusy} conversionLessonId={conversionLessonId} slideSeconds={slideSeconds} onClose={() => !manageBusy && setManageMedia(undefined)} onOrganize={() => { setOrganizeTargets([manageMedia]); setManageMedia(undefined); }} onReprocess={reprocessMedia} onQueueTranscodes={queueTranscodes} onReplace={replaceMedia} onRestoreVersion={restoreMediaVersion} onConvert={convertPresentation} onAddSlides={addConvertedSlides} onConversionLesson={setConversionLessonId} onSlideSeconds={setSlideSeconds} />}
    {showUpload && <Modal title="Upload media" onClose={() => !uploading && setShowUpload(false)}><form className="stack" onSubmit={upload}><Field label="Files" hint="Presentation formats are converted locally to slide images."><input name="files" type="file" multiple accept="video/*,audio/*,image/*,.pdf,.ppt,.pptx,.pps,.ppsx,.pot,.potx,.odp,.key,.doc,.docx" required disabled={uploading} /></Field><TaxonomyFields taxonomy={taxonomy} /><fieldset className="retention-options"><legend>How long should LessonCue keep these files?</legend>{availableLessons.length > 0 && <label><input type="radio" name="storagePolicy" value="lesson" checked={storagePolicy === "lesson"} onChange={() => setStoragePolicy("lesson")} /><span><strong>For a lesson (default)</strong><small>Delete automatically four weeks after the lesson date.</small></span></label>}<label><input type="radio" name="storagePolicy" value="persistent" checked={storagePolicy === "persistent"} onChange={() => setStoragePolicy("persistent")} /><span><strong>Keep permanently</strong><small>Store in the reusable media library until someone deletes it.</small></span></label></fieldset>{storagePolicy === "lesson" && <Field label="Lesson" hint="Reusing the file in a later lesson automatically extends its deletion date."><select name="lessonId" defaultValue={firstUpcoming?.id} required>{availableLessons.map(l => <option value={l.id} key={l.id}>{formatDate(l.date)} — {l.title}</option>)}</select></Field>}{!availableLessons.length && <div className="alert">Create a lesson before uploading temporary lesson media. This upload will be kept permanently.</div>}<button className="button primary" disabled={uploading}>{uploading ? `Uploading ${uploadProgress}%` : "Upload to local server"}</button></form></Modal>}
    {showLink && <Modal title="Add online media or slides" onClose={() => setShowLink(false)}><form className="stack" onSubmit={addLink}><Field label={linkMode === "slides" ? "Google Slides share URL" : "Webpage or YouTube URL"} hint={linkMode === "slides" ? "The deck must be shared so anyone with the link can view it. LessonCue downloads a PDF copy and converts it locally." : "Online entries require internet. YouTube videos can instead be copied into local storage."}><input name="url" type="url" required autoFocus placeholder="https://…" /></Field><fieldset className="retention-options"><legend>How should LessonCue use it?</legend><label><input type="radio" checked={linkMode === "online"} onChange={() => setLinkMode("online")} /><span><strong>Use online</strong><small>Display a webpage or embedded YouTube player.</small></span></label><label><input type="radio" checked={linkMode === "download"} onChange={() => setLinkMode("download")} /><span><strong>Download YouTube locally</strong><small>Use only for video you are authorized to copy.</small></span></label><label><input type="radio" checked={linkMode === "slides"} onChange={() => setLinkMode("slides")} /><span><strong>Import Google Slides</strong><small>Save a local PDF and convert every slide to a screen-ready image.</small></span></label></fieldset>{linkMode !== "online" && <fieldset className="retention-options"><legend>How long should LessonCue keep the local copy?</legend>{availableLessons.length > 0 && <label><input type="radio" checked={linkStoragePolicy === "lesson"} onChange={() => setLinkStoragePolicy("lesson")} /><span><strong>For a lesson (default)</strong><small>Delete automatically four weeks after its lesson.</small></span></label>}<label><input type="radio" checked={linkStoragePolicy === "persistent"} onChange={() => setLinkStoragePolicy("persistent")} /><span><strong>Keep permanently</strong><small>Store until someone deletes it.</small></span></label></fieldset>}{linkMode !== "online" && linkStoragePolicy === "lesson" && <Field label="Lesson"><select name="lessonId" defaultValue={firstUpcoming?.id} required>{availableLessons.map(l => <option value={l.id} key={l.id}>{formatDate(l.date)} — {l.title}</option>)}</select></Field>}<Field label="Display title"><input name="title" maxLength={240} /></Field><TaxonomyFields taxonomy={taxonomy} /><button className="button primary">{linkMode === "download" ? "Queue local download" : linkMode === "slides" ? "Import and convert slides" : "Add online media"}</button></form></Modal>}
    {media.length > 0 && <section className="media-filters"><Field label="Search media"><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, folder, or tag" /></Field><Field label="Folder"><select value={folderFilter} onChange={e => setFolderFilter(e.target.value)}><option value="">All folders</option>{folders.map(folder => <option value={folder} key={folder}>{folder}</option>)}</select></Field><span>{filteredMedia.length} of {media.length} items</span></section>}
    {filteredMedia.length > 0 && <section className="media-preview-grid" aria-label="Media previews">{filteredMedia.map(item => <button key={item.id} onClick={() => setPreviewMedia(item)} disabled={item.processingStatus !== "ready"}><span>{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : item.contentType.startsWith("audio") ? "♫" : item.sourceKind === "link" ? "↗" : "▶"}</span><strong>{item.fileName}</strong><small>{item.folder || item.tagsCsv || (item.processingStatus === "ready" ? "Preview" : item.processingStatus)}</small></button>)}</section>}
    {canUpload && selectedMedia.length > 0 && <section className="bulk-actions" aria-label="Bulk media actions"><strong>{selectedMedia.length} selected</strong><span>Rename, organize, change retention, or move selected media to the 30-day recycling bin.</span><div><button className="button" onClick={() => setRenameTargets(selectedMedia)} disabled={bulkBusy}>Rename</button><button className="button" onClick={() => setOrganizeTargets(selectedMedia)} disabled={bulkBusy}>Folder & tags</button><button className="button" onClick={() => openRetention(selectedMedia, true)} disabled={bulkBusy}>Set expiration</button><button className="button" onClick={() => runBulk("keep", selectedMedia)} disabled={bulkBusy}>Keep permanently</button><button className="button danger" onClick={deleteSelected} disabled={bulkBusy}>Recycle</button></div></section>}
    <section className="panel"><div className="media-table table-head"><label className="media-select"><input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!canUpload || !filteredMedia.length} aria-label="Select all visible media" /></label><span>File</span><span>Type</span><span>Duration</span><span>Size</span><span>Retention</span><span>Status</span></div>{filteredMedia.length ? filteredMedia.map(m => <div className={`media-table ${selectedIds.has(m.id) ? "selected" : ""}`} key={m.id}><label className="media-select"><input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleSelection(m.id)} disabled={!canUpload} aria-label={`Select ${m.fileName}`} /></label><span className="media-name">{m.thumbnailUrl ? <img src={m.thumbnailUrl} alt="" /> : <b>{m.contentType.startsWith("video") ? "▶" : m.contentType.startsWith("audio") ? "♫" : m.sourceKind === "link" ? "↗" : "▧"}</b>}<span><strong>{m.fileName}</strong><small>{[m.folder || "Unfiled", m.tagsCsv, `v${m.version}`].filter(Boolean).join(" · ")}</small>{canUpload && <button className="media-manage" onClick={() => loadImpact(m)}>Manage versions & impact</button>}</span></span><span>{m.sourceKind === "link" ? `${m.linkKind} link` : friendlyType(m.contentType)}</span><span>{formatDuration(m.durationMs)}</span><span>{formatBytes(m.sizeBytes)}</span><button type="button" className={`retention-badge ${m.storagePolicy === "lesson" ? "temporary" : ""}`} onClick={() => openRetention([m])} disabled={!canUpload}>{m.storagePolicy === "lesson" && m.deleteAfter ? `Deletes ${formatShortDate(m.deleteAfter)}` : "Keep permanently"}<small>{m.retentionDateIsManual ? "Selected date" : m.storagePolicy === "lesson" ? "Based on lesson" : ""}</small></button><span className={`availability ${m.offlineEligible ? "" : "internet"}`}><i className="available-dot" /> {m.processingStatus === "pending" || m.processingStatus === "processing" ? (m.compatibilityStatus === "converting" ? "Making TV copy" : "Processing") : m.processingStatus === "failed" ? "Processing failed" : m.compatibilityStatus === "ready" ? "TV copy ready" : m.offlineEligible ? "TV ready" : "Internet required"}</span></div>) : <Empty title={media.length ? "No media matches these filters" : "No media uploaded"} body={media.length ? "Clear the search or choose All folders." : "Upload MP4, MOV, audio, image, PDF, or PowerPoint files."} />}</section>
  </>;
}

function MediaManagerModal({ media, impact, lessons, busy, conversionLessonId, slideSeconds, onClose,
  onOrganize, onReprocess, onQueueTranscodes, onReplace, onRestoreVersion, onConvert, onAddSlides, onConversionLesson, onSlideSeconds }:
  { media: Media; impact?: MediaImpact; lessons: Lesson[]; busy: boolean; conversionLessonId: string; slideSeconds: number;
    onClose: () => void; onOrganize: () => void; onReprocess: () => void; onQueueTranscodes: (profile?: "all" | "h264-720" | "h264-480") => void; onReplace: (event: FormEvent<HTMLFormElement>) => void;
    onRestoreVersion: (version: MediaVersion) => void; onConvert: () => void; onAddSlides: () => void;
    onConversionLesson: (id: string) => void; onSlideSeconds: (seconds: number) => void }) {
  const converting = media.conversionStatus === "pending" || media.conversionStatus === "converting";
  return <Modal title={`Manage: ${media.fileName}`} onClose={onClose}><div className="media-manager">
    <div className="media-manager-summary"><div><span>CURRENT VERSION</span><strong>v{media.version}</strong></div><div><span>LESSON USES</span><strong>{impact?.lessons.reduce((sum, lesson) => sum + lesson.itemCount, 0) ?? "…"}</strong></div><div><span>TEMPLATE USES</span><strong>{impact?.templates.reduce((sum, template) => sum + template.itemCount, 0) ?? "…"}</strong></div><div><span>SIGNAGE USES</span><strong>{impact?.signage.length ?? "…"}</strong></div></div>
    {media.videoCodec && <><section className={`compatibility-card ${media.compatibilityStatus}`}><div><span>UNIVERSAL TV PLAYBACK</span><strong>{media.compatibilityStatus === "ready" ? "Universal 1080p H.264/AAC copy ready" : media.compatibilityStatus === "native" ? "Original is universally TV-compatible" : media.compatibilityStatus === "converting" ? "Creating the universal copy…" : media.compatibilityStatus === "failed" ? "Compatibility conversion failed" : "Compatibility check pending"}</strong><p>{media.compatibilityError || (media.compatibilityStatus === "ready" ? `LessonCue kept the original and serves a ${formatBytes(media.compatibilitySizeBytes || 0)} MP4 fallback to every TV${media.compatibilityTranscodeEngine ? `, created with ${media.compatibilityTranscodeEngine}` : ""}.` : "LessonCue checks every upload locally and converts only when the original may not play reliably on Android TV, Fire TV, or Apple TV.")}</p></div>{media.compatibilityTranscodedAt && <small>{new Date(media.compatibilityTranscodedAt).toLocaleString()}</small>}</section><section className="transcode-card"><div className="settings-heading"><div><span>ADAPTIVE TV PROFILES</span><h3>Smaller copies for slower rooms</h3><p>LessonCue automatically chooses 720p or 480p from each screen's decoder, network, and free-storage report. The universal copy remains the fallback.</p></div><button className="button primary" onClick={() => onQueueTranscodes("all")} disabled={busy || media.processingStatus !== "ready"}>{busy ? "Queueing…" : "Generate both"}</button></div><div className="transcode-profile-list">{(["h264-720", "h264-480"] as const).map(profile => { const variant = media.transcodes?.find(item => item.profile === profile); const label = profile === "h264-720" ? "720p · 4 Mbps" : "480p · 1.5 Mbps"; return <div key={profile} className={variant?.status || "missing"}><span><strong>{label}</strong><small>{variant?.status === "ready" ? `${formatBytes(variant.sizeBytes)} · ${variant.transcodeEngine || "local encoder"} · ready ${variant.completedAt ? timeAgo(variant.completedAt) : "now"}` : variant?.status === "converting" ? "Converting locally…" : variant?.status === "pending" ? "Waiting in the local queue…" : variant?.status === "failed" ? variant.error || "Conversion failed" : "Generated automatically before an assigned lesson needs it."}</small></span><span className={`availability ${variant?.status === "failed" ? "internet" : ""}`}><i className="available-dot" /> {variant?.status || "not generated"}</span>{variant?.status === "failed" && <button className="button" onClick={() => onQueueTranscodes(profile)} disabled={busy}>Retry</button>}</div>; })}</div></section></>}
    <div className="head-actions"><button className="button" onClick={onOrganize}>Rename, folder & tags</button>{media.sourceKind !== "link" && <button className="button" onClick={onReprocess} disabled={busy}>Reprocess metadata</button>}</div>
    {isConvertibleDocument(media) && <section className={`conversion-card ${media.conversionStatus}`}><div><span>LOCAL SLIDE CONVERSION</span><h3>{media.conversionStatus === "ready" ? `${convertedSlideCount(media)} screen-ready slides` : media.conversionStatus === "failed" ? "Conversion needs attention" : converting ? "Conversion in progress…" : "Turn this document into slides"}</h3><p>{media.conversionError || "LessonCue uses LibreOffice and Poppler on this server; the document is never uploaded to a cloud service."}</p></div>{media.conversionStatus === "ready" ? <div className="conversion-add"><Field label="Add slides to lesson"><select value={conversionLessonId} onChange={event => onConversionLesson(event.target.value)}>{lessons.map(lesson => <option value={lesson.id} key={lesson.id}>{formatDate(lesson.date)} — {lesson.title}</option>)}</select></Field><Field label="Seconds per slide"><input type="number" min="1" max="3600" value={slideSeconds} onChange={event => onSlideSeconds(Number(event.target.value))} /></Field><button className="button primary" onClick={onAddSlides} disabled={busy || !conversionLessonId}>Add slide sequence</button><button className="button" onClick={onConvert} disabled={busy}>Convert again</button></div> : <button className="button primary" onClick={onConvert} disabled={busy || converting}>{media.conversionStatus === "failed" ? "Try conversion again" : converting ? "Converting…" : "Convert to slides"}</button>}</section>}
    {media.sourceKind !== "link" && <form className="replace-media" onSubmit={onReplace}><Field label="Replace current file" hint="Every lesson and sign keeps using this media ID. The current file is archived as a restorable version."><input name="file" type="file" accept="video/*,audio/*,image/*,.pdf,.ppt,.pptx,.pps,.ppsx,.pot,.potx,.odp,.key,.doc,.docx" required disabled={busy} /></Field><button className="button primary" disabled={busy}>{busy ? "Working…" : "Preview impact and replace"}</button></form>}
    <section className="impact-list"><h3>Current impact</h3>{impact?.lessons.map(lesson => <div key={lesson.id}><span>{formatDate(lesson.date)} · {lesson.title}</span><strong>{lesson.itemCount} cue{lesson.itemCount === 1 ? "" : "s"}</strong></div>)}{impact?.templates.map(template => <div key={template.id}><span>{template.name}</span><strong>{template.itemCount} template cue{template.itemCount === 1 ? "" : "s"}</strong></div>)}{impact?.signage.map(sign => <div key={sign.id}><span>{sign.name}</span><strong>{sign.enabled ? "Active sign" : "Inactive sign"}</strong></div>)}{impact && !impact.lessons.length && !impact.templates.length && !impact.signage.length && <p className="settings-copy">This media is not currently used by a lesson, template, or sign.</p>}</section>
    <section className="version-list"><h3>Previous versions</h3>{impact?.versions.map(version => <div key={version.id}><span><strong>v{version.versionNumber} · {version.fileName}</strong><small>{formatBytes(version.sizeBytes)} · archived {new Date(version.archivedAt).toLocaleString()} by {version.archivedBy}</small></span><div><a className="button" href={version.downloadUrl}>Download</a><button className="button" onClick={() => onRestoreVersion(version)} disabled={busy}>Restore</button></div></div>)}{impact && !impact.versions.length && <p className="settings-copy">No previous versions yet. The first replacement will archive the current file here.</p>}</section>
  </div></Modal>;
}

function ControllerView({ screens, lessons, classes, controllerPinConfigured, requireLocalRoomControllers, localAddress, userRole, refresh, notify }: { screens: Screen[]; lessons: Lesson[]; classes: LessonClass[]; controllerPinConfigured: boolean; requireLocalRoomControllers: boolean; localAddress: string; userRole: string; refresh: () => void; notify: (s: string) => void }) {
  const routeSlug = controllerRouteSlug(location.pathname);
  const sessionToken = controllerSessionToken(location.pathname);
  const [temporarySession, setTemporarySession] = useState<TemporaryControllerSession | null>();
  useEffect(() => {
    if (!sessionToken) return;
    api<Omit<TemporaryControllerSession, "token" | "path">>(`/api/v1/controller/sessions/${sessionToken}`)
      .then(session => setTemporarySession({ ...session, token: sessionToken, path: `/session/${sessionToken}` }))
      .catch(() => setTemporarySession(null));
  }, [sessionToken]);
  const room = classes.find(item => temporarySession ? item.id === temporarySession.classId : controllerSlug(item) === routeSlug || (!!item.controllerHostname && item.controllerHostname === location.hostname));
  const liveScreens = screens.filter(screen => !screen.revoked && (!room || screen.assignedClassId === room.id));
  const [screenId, setScreenId] = useState(liveScreens.find(screen => screen.online)?.id || liveScreens[0]?.id || "");
  useEffect(() => {
    if (!liveScreens.some(screen => screen.id === screenId)) setScreenId(liveScreens.find(screen => screen.online)?.id || liveScreens[0]?.id || "");
  }, [liveScreens, screenId]);
  const selectedScreen = liveScreens.find(screen => screen.id === screenId);
  const availableLessons = lessons.filter(lesson => !lesson.archived && (room ? lesson.classId === room.id && (!temporarySession?.lessonId || lesson.id === temporarySession.lessonId) : !selectedScreen?.assignedClassId || lesson.classId === selectedScreen.assignedClassId));
  const requestedLessonId = new URLSearchParams(location.search).get("lesson") || "";
  const [lessonId, setLessonId] = useState(availableLessons.some(item => item.id === requestedLessonId) ? requestedLessonId : availableLessons[0]?.id || "");
  const lesson = availableLessons.find(item => item.id === lessonId) || availableLessons[0];
  const orderedItems = [...(lesson?.items || [])].sort((a, b) => a.position - b.position);
  const [selectedItemId, setSelectedItemId] = useState("");
  const selectedItem = orderedItems.find(item => item.id === selectedItemId);
  const [seekSeconds, setSeekSeconds] = useState(0);
  const [universalPin, setUniversalPin] = useState("");
  const [universalGrant, setUniversalGrant] = useState(() => sessionStorage.getItem("lessoncue.universalGrant") || "");
  const [universalUnlocked, setUniversalUnlocked] = useState(() => !!sessionStorage.getItem("lessoncue.universalGrant"));
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [controlsLocked, setControlsLocked] = useState(false);
  const [commandReceipt, setCommandReceipt] = useState<{ version?: number; action: string; error?: string }>();
  async function unlockUniversal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setUnlocking(true); setUnlockError("");
    try { const result = await api<{ grant: string }>("/api/v1/controller/unlock", { method: "POST", body: JSON.stringify({ pin: universalPin }) }); sessionStorage.setItem("lessoncue.universalGrant", result.grant); setUniversalGrant(result.grant); setUniversalPin(""); setUniversalUnlocked(true); }
    catch (error) { setUnlockError(errorText(error)); }
    finally { setUnlocking(false); }
  }
  async function command(action: string, extras: Record<string, unknown> = {}) {
    if (!screenId) return notify("Choose a paired screen first.");
    if (controlsLocked) return notify("Unlock the controller before sending a command.");
    setCommandReceipt({ action });
    try {
      const controllerHeaders: Record<string, string> = sessionToken ? { "X-LessonCue-Controller": `session:${sessionToken}` } : room ? { "X-LessonCue-Controller": `room:${room.id}` } : { "X-LessonCue-Controller": "universal", "X-LessonCue-Controller-Grant": universalGrant };
      const result = await api<{ version: number }>(`/api/v1/screens/${screenId}/control`, { method: "POST", headers: controllerHeaders, body: JSON.stringify({ action, ...extras }) });
      setCommandReceipt({ version: result.version, action });
      notify(`${action[0].toUpperCase()}${action.slice(1)} sent to ${selectedScreen?.name || "screen"}.`); refresh();
    } catch (e) {
      const message = errorText(e);
      if (!room && !sessionToken && message.includes("controller PIN")) {
        sessionStorage.removeItem("lessoncue.universalGrant"); setUniversalGrant(""); setUniversalUnlocked(false);
      }
      setCommandReceipt({ action, error: message });
      notify(message);
    }
  }
  const play = (itemId?: string) => lesson && command("play", { lessonId: lesson.id, itemId: itemId || null });
  const durationSeconds = Math.max(1, Math.round(((selectedItem?.endMs ? selectedItem.endMs - selectedItem.startMs : selectedItem?.durationMs || selectedItem?.mediaDurationMs) || 600_000) / 1000));
  const reportedLesson = lessons.find(item => item.id === selectedScreen?.playbackLessonId);
  const reportedItem = reportedLesson?.items.find(item => item.id === selectedScreen?.playbackItemId);
  const commandPending = !!selectedScreen && !!commandReceipt?.version && selectedScreen.acknowledgedControlVersion < commandReceipt.version;
  const downloads = parseDiagnosticJson<DownloadDiagnostic>(selectedScreen?.downloadQueueJson);
  const downloading = downloads.some(item => ["queued", "pending", "downloading", "running"].includes((item.state || "").toLowerCase()));
  const recentlySeen = selectedScreen?.lastSeenAt ? Date.now() - new Date(selectedScreen.lastSeenAt).getTime() < 120_000 : false;
  const controllerState = !selectedScreen?.online ? recentlySeen ? "reconnecting" : "offline" :
    selectedScreen.playbackError || selectedScreen.failedDownloads > 0 ? "error" : downloading ? "downloading" : "ready";
  const controllerStateLabel = controllerState === "ready" ? "Ready" : controllerState === "downloading" ? "Downloading media" :
    controllerState === "reconnecting" ? "Reconnecting" : controllerState === "error" ? "Needs attention" : "Offline";
  const isAdministrator = userRole === "Owner" || userRole === "Administrator";
  const localRestrictionBlocked = !!room && requireLocalRoomControllers && !isAdministrator && !location.hostname.toLowerCase().endsWith(".local");
  const progress = selectedScreen?.playbackDurationMs ? Math.min(100, (selectedScreen.playbackPositionMs / selectedScreen.playbackDurationMs) * 100) : 0;
  if (sessionToken && temporarySession === undefined) return <div className="controller-page"><div className="loading">Validating temporary controller…</div></div>;
  if (sessionToken && temporarySession === null || (routeSlug || sessionToken) && !room) return <div className="controller-page"><PageHead eyebrow="CONTROLLER LINK" title="Controller unavailable" detail="This controller link is invalid, expired, or no longer assigned. Ask an administrator for a current QR code." /></div>;
  if (localRestrictionBlocked) return <div className="controller-page controller-lock"><section className="panel"><div className="brand-mark large">LC</div><span className="eyebrow">CAMPUS NETWORK REQUIRED</span><h1>Open this controller locally</h1><p>An administrator requires non-administrator room remotes to use the server's .local address. Connect this phone to the campus network, then open the local controller.</p><a className="button primary wide" href={`${localAddress}/room/${controllerSlug(room!)}${location.search}`}>Open on {new URL(localAddress).host}</a></section></div>;
  if (!room && !sessionToken && !universalUnlocked) return <div className="controller-page controller-lock"><section className="panel"><div className="brand-mark large">LC</div><span className="eyebrow">UNIVERSAL REMOTE</span><h1>{controllerPinConfigured ? "Enter controller PIN" : "Controller PIN required"}</h1><p>{controllerPinConfigured ? "This additional local PIN protects the controller that can operate every classroom." : "An administrator must set the six-digit universal controller PIN in Settings before this remote can be used."}</p>{controllerPinConfigured && <form className="stack" onSubmit={unlockUniversal}><Field label="Six-digit controller PIN"><input value={universalPin} onChange={event => setUniversalPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="off" required autoFocus /></Field>{unlockError && <div className="alert error">{unlockError}</div>}<button className="button primary wide" disabled={unlocking}>{unlocking ? "Checking…" : "Open universal remote"}</button></form>}</section></div>;
  const controllerStyle = room ? { "--room-color": room.controllerColor } as CSSProperties : undefined;
  const commandAcknowledgement = commandReceipt?.error ? `Command failed: ${commandReceipt.error}` :
    commandPending ? `Sending ${commandReceipt?.action} to ${selectedScreen?.name || "screen"}…` :
    commandReceipt?.version ? `✓ ${commandReceipt.action} received by ${selectedScreen?.name || "screen"}` :
    selectedScreen?.controlVersion ? `✓ Command ${selectedScreen.acknowledgedControlVersion} received` : "Ready for a command";
  return <div className={`controller-page ${room ? "room-themed" : ""}`} style={controllerStyle}><PageHead eyebrow={temporarySession ? "TEMPORARY CONTROL" : room ? "CLASSROOM CONTROL" : "LIVE CONTROL"} title={room ? room.name : "Universal controller"} detail={temporarySession ? `Restricted link · expires ${new Date(temporarySession.expiresAt).toLocaleString()}` : room ? `This controller is restricted to ${room.name} screens and lessons.` : "Choose any paired screen, then run its assigned lesson from this phone."} action={<div className="controller-head-actions"><span className={`controller-connection ${controllerState}`}><i />{controllerStateLabel}</span><button className={`button controller-lock-toggle ${controlsLocked ? "locked" : ""}`} aria-pressed={controlsLocked} onClick={() => setControlsLocked(value => !value)}>{controlsLocked ? "🔒 Controls locked — unlock" : "🔓 Lock controls"}</button></div>} />
    {controlsLocked && <div className="controller-locked-banner" role="status">Controls are locked. Nothing on this remote can change the screen until you unlock it.</div>}
    <fieldset className="controller-controls" disabled={controlsLocked} aria-label="Room playback controls">
    <div className="controller-grid"><section className="panel controller-target"><Field label="Control this screen"><select value={screenId} onChange={e => { setScreenId(e.target.value); setLessonId(""); setSelectedItemId(""); setCommandReceipt(undefined); }}>{liveScreens.map(screen => <option value={screen.id} key={screen.id}>{screen.name} · {screen.online ? "online" : "offline"}</option>)}</select></Field><div className="now-playing"><span>ACTUAL SCREEN STATE</span><strong>{friendlyPlaybackState(selectedScreen?.playbackState)}</strong><small>{reportedItem?.title || reportedLesson?.title || (selectedScreen?.playbackState === "idle" ? "Nothing playing" : "Waiting for item details")}</small>{selectedScreen?.playbackDurationMs ? <><div className="playback-progress"><i style={{ width: `${progress}%` }} /></div><small>{formatDuration(selectedScreen.playbackPositionMs)} / {formatDuration(selectedScreen.playbackDurationMs)}</small></> : null}<span className={`command-ack ${commandPending ? "pending" : commandReceipt?.error ? "error" : commandReceipt?.version ? "received" : ""}`} role="status" aria-live="polite">{commandAcknowledgement}</span>{selectedScreen?.playbackError && <div className="playback-error">{selectedScreen.playbackError}</div>}</div><div className="transport" aria-label="Playback controls"><button onClick={() => command("previous")} aria-label="Previous media">‹‹</button><button className="transport-main" onClick={() => command(selectedScreen?.playbackState === "paused" ? "resume" : "pause")} aria-label={selectedScreen?.playbackState === "paused" ? "Resume" : "Pause"}>{selectedScreen?.playbackState === "paused" ? "▶" : "Ⅱ"}</button><button onClick={() => command("next")} aria-label="Next media">››</button></div><button className="button stop-button" onClick={() => command("stop")}>■ Stop playback</button></section>
      <section className="panel controller-media"><Field label="Lesson"><select value={lesson?.id || ""} onChange={e => { setLessonId(e.target.value); setSelectedItemId(""); }}><option value="">Choose a lesson</option>{availableLessons.map(item => <option key={item.id} value={item.id}>{formatDate(item.date)} — {item.title}</option>)}</select></Field>{lesson ? <><button className="button primary wide controller-play-all" onClick={() => play()}>▶ Play lesson from the beginning</button><div className="controller-list"><span>SELECT MEDIA</span>{orderedItems.map((item, index) => <button key={item.id} className={selectedItemId === item.id ? "selected" : ""} onClick={() => { setSelectedItemId(item.id); setSeekSeconds(0); play(item.id); }}><b>{index + 1}</b><span><strong>{item.title}</strong><small>{roleName(item.role)} · {formatDuration(item.durationMs || item.mediaDurationMs)}</small></span><i>▶</i></button>)}</div>{selectedItem && <div className="controller-seek"><label><span>Seek within {selectedItem.title}</span><strong>{formatDuration(seekSeconds * 1000)}</strong></label><input type="range" min="0" max={durationSeconds} value={seekSeconds} onChange={e => setSeekSeconds(Number(e.target.value))} />{cuePoints(selectedItem).length > 0 && <div className="controller-markers" aria-label="Jump to named cue"><span>JUMP TO CUE</span>{cuePoints(selectedItem).map((marker, index) => { const relativeMs = Math.max(0, marker.positionMs - selectedItem.startMs); return <button type="button" key={`${marker.positionMs}-${index}`} onClick={() => { setSeekSeconds(Math.round(relativeMs / 1000)); void command("seek", { positionMs: relativeMs }); }}><strong>{marker.name}</strong><small>{formatDuration(relativeMs)}</small></button>; })}</div>}<button className="button" onClick={() => command("seek", { positionMs: seekSeconds * 1000 })}>Go to position</button></div>}</> : <Empty title="No lesson selected" body="Assign a class to this screen or choose a lesson to begin." />}</section>
    </div></fieldset><section className="controller-install"><div className="brand-mark">LC</div><div><strong>Save this controller as an app</strong><p>On iPhone or iPad, use Share → Add to Home Screen. On Android, open the browser menu and choose Install app or Add to Home screen.</p><small>{temporarySession ? `${requireLocalRoomControllers ? localAddress : location.origin}/session/${sessionToken}` : room ? classControllerUrl(room, "", requireLocalRoomControllers ? localAddress : location.origin) : `${location.origin}/universalremote`}</small></div></section>
  </div>;
}

function ScreensView({ screens, classes, pin, refresh, notify, canManage }: { screens: Screen[]; classes: LessonClass[]; pin?: string; refresh: () => void; notify: (s: string) => void; canManage: boolean }) {
  const active = screens.filter(s => !s.revoked);
  const [expanded, setExpanded] = useState<string>();
  const [screenshotNonce, setScreenshotNonce] = useState(Date.now());
  const [busy, setBusy] = useState<string>();
  async function change(screen: Screen, changes: object) { try { await api(`/api/v1/screens/${screen.id}`, { method: "PATCH", body: JSON.stringify(changes) }); refresh(); } catch (e) { notify(errorText(e)); } }
  async function revoke(screen: Screen) { if (!confirm(`Revoke ${screen.name}? It will need to be paired again.`)) return; await api(`/api/v1/screens/${screen.id}`, { method: "DELETE" }); refresh(); }
  async function requestScreenshot(screen: Screen) { setBusy(screen.id); try { await api(`/api/v1/screens/${screen.id}/diagnostics/screenshot-request`, { method: "POST", body: "{}" }); notify("One-time screenshot requested. The TV will show a visible notice before capture."); setTimeout(() => { setScreenshotNonce(Date.now()); refresh(); }, 4_000); refresh(); } catch (e) { notify(errorText(e)); } finally { setBusy(undefined); } }
  async function deleteScreenshot(screen: Screen) { setBusy(screen.id); try { await api(`/api/v1/screens/${screen.id}/diagnostics/screenshot`, { method: "DELETE" }); refresh(); notify("Diagnostic screenshot deleted."); } catch (e) { notify(errorText(e)); } finally { setBusy(undefined); } }
  return <><PageHead eyebrow="PLAYBACK DEVICES" title="Screens" detail="Pair TVs, assign a class, and inspect cache, downloads, codecs, timing, network quality, and recent errors." action={canManage && pin ? <div className="pin-card"><span>PAIRING PIN</span><strong>{pin}</strong></div> : undefined} />
    <section className="panel browser-player-intro"><div><span className="eyebrow">COMPUTERS &amp; PROJECTORS</span><h2>Use this server as a full-screen display</h2><p>Open the browser player on the presentation computer, pair it with the PIN above, and control it exactly like a TV. Add <code>?kiosk=1</code> for a clean startup view.</p><small>{location.origin}/player</small></div><div className="card-actions"><a className="button primary" href="/player" target="_blank" rel="noreferrer">Open browser player ↗</a><a className="button" href="/player?kiosk=1" target="_blank" rel="noreferrer">Open kiosk player ↗</a></div></section>
    <section className="panel"><div className="screen-grid">{active.length ? active.map(s => {
      const cache = parseDiagnosticJson<CacheDiagnostic>(s.cacheInventoryJson);
      const downloads = parseDiagnosticJson<DownloadDiagnostic>(s.downloadQueueJson);
      const codecs = parseDiagnosticJson<CodecDiagnostic>(s.codecCapabilitiesJson);
      const errors = parseDiagnosticJson<ErrorDiagnostic>(s.recentErrorsJson);
      const clockWarning = Math.abs(s.clockOffsetMs || 0) > 5_000;
      return <article className={`screen-card ${expanded === s.id ? "expanded" : ""}`} key={s.id}>
        <div className="screen-card-top"><span className={`screen-icon large ${isOnline(s) ? "online" : ""}`}>▣</span><Status online={isOnline(s)} /></div>
        <input aria-label="Screen name" className="screen-name-input" defaultValue={s.name} disabled={!canManage} onBlur={e => e.target.value !== s.name && change(s, { name: e.target.value })} />
        <small>{s.deviceModel || s.platform} · {s.osVersion || s.appVersion} · {s.lastSeenAt ? `Last seen ${timeAgo(s.lastSeenAt)}` : "Waiting for first check-in"}</small>
        <div className="screen-diagnostics"><span><b>{friendlyPlaybackState(s.playbackState)}</b> playback</span><span><b>{s.acknowledgedControlVersion}/{s.controlVersion}</b> command</span><span><b>{s.cachedItems}/{s.totalItems}</b> cached</span><span><b>{downloads.length}</b> queued</span><span><b className={`quality-${s.networkQuality}`}>{s.networkQuality || "unknown"}</b> network</span><span><b className={clockWarning ? "warning-text" : ""}>{formatClockOffset(s.clockOffsetMs)}</b> clock</span></div>
        {s.playbackError && <div className="playback-error">{s.playbackError}</div>}
        <Field label="Assigned class"><select value={s.assignedClassId || ""} disabled={!canManage} onChange={e => change(s, e.target.value ? { assignedClassId: e.target.value } : { clearAssignment: true })}><option value="">Not assigned</option>{classes.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></Field>
        <div className="two-fields"><Field label="Site"><input defaultValue={s.site} disabled={!canManage} onBlur={e => change(s, { site: e.target.value })} /></Field><Field label="Tags"><input defaultValue={s.tagsCsv} disabled={!canManage} placeholder="lobby, elementary" onBlur={e => change(s, { tagsCsv: e.target.value })} /></Field></div>
        <label className="switch-row compact"><input type="checkbox" checked={s.volunteerMode} disabled={!canManage} onChange={e => change(s, { volunteerMode: e.target.checked })} /><span /><div><strong>Volunteer mode</strong></div></label>
        <div className="screen-meta"><span>{formatBytes(s.freeBytes)} device free</span><span>{s.networkLatencyMs != null ? `${s.networkLatencyMs} ms` : "Latency pending"} · {s.lastIpAddress || "IP pending"}</span></div>
        <button className="button wide" onClick={() => setExpanded(expanded === s.id ? undefined : s.id)}>{expanded === s.id ? "Hide diagnostics" : "View diagnostics"}</button>
        {expanded === s.id && <div className="diagnostic-detail">
          <div className="diagnostic-summary"><span><b>{cache.filter(x => x.state === "cached").length}</b> cached files</span><span><b>{formatBytes(cache.reduce((sum, x) => sum + (x.sizeBytes || 0), 0))}</b> cache size</span><span><b>{codecs.filter(x => x.supported).length}/{codecs.length}</b> codecs</span><span><b>{errors.length}</b> recent errors</span></div>
          <DiagnosticList title="Cache inventory" empty="No detailed inventory reported yet." items={cache.map(item => ({ title: item.title || item.itemId || "Media", detail: `${item.state || "unknown"} · ${formatBytes(item.sizeBytes || 0)}${item.expectedBytes ? ` / ${formatBytes(item.expectedBytes)}` : ""}`, error: item.error }))} />
          <DiagnosticList title="Download queue" empty="Download queue is clear." items={downloads.map(item => ({ title: item.title || item.itemId || "Media", detail: `${item.state || "queued"} · ${formatBytes(item.bytesDownloaded || 0)}${item.expectedBytes ? ` / ${formatBytes(item.expectedBytes)}` : ""}`, error: item.error }))} />
          <div className="codec-list"><strong>Decoder capabilities</strong>{codecs.length ? codecs.map((item, index) => <span className={item.supported ? "supported" : "unsupported"} key={`${item.codec}-${index}`}>{item.codec || "Unknown"}<i>{item.supported ? "Supported" : "Unavailable"}</i></span>) : <small>Upgrade the TV player to receive codec details.</small>}</div>
          <DiagnosticList title="Recent device errors" empty="No recent errors reported." items={errors.map(item => ({ title: item.area || "device", detail: item.timestamp ? `${timeAgo(item.timestamp)} · ${item.message || "Unknown error"}` : item.message || "Unknown error" }))} />
          <div className="screenshot-privacy"><div><strong>Privacy-gated screenshot</strong><small>Off by default. A one-time request expires in 60 seconds, displays a banner on the TV, and is deleted after 24 hours.</small></div><label className="switch-row compact"><input type="checkbox" checked={s.allowDiagnosticScreenshots} disabled={!canManage} onChange={e => change(s, { allowDiagnosticScreenshots: e.target.checked })} /><span /><div><strong>{s.allowDiagnosticScreenshots ? "Allowed" : "Disabled"}</strong></div></label>{s.screenshotAvailable && <img src={`/api/v1/screens/${s.id}/diagnostics/screenshot?v=${screenshotNonce}`} alt={`Diagnostic screenshot from ${s.name}`} />}{canManage && <div className="card-actions"><button className="button primary" disabled={!s.allowDiagnosticScreenshots || !isOnline(s) || busy === s.id} onClick={() => requestScreenshot(s)}>{s.screenshotStatus === "pending" ? "Capture pending…" : "Request screenshot"}</button>{s.screenshotAvailable && <button className="button" onClick={() => deleteScreenshot(s)}>Delete now</button>}</div>}</div>
          <small className="diagnostic-freshness">Diagnostics {s.diagnosticsUpdatedAt ? `updated ${timeAgo(s.diagnosticsUpdatedAt)}` : "will appear after a 0.18 TV player checks in"} · Manifest {s.manifestVersion}</small>
        </div>}
        {canManage && <button className="text-danger" onClick={() => revoke(s)}>Revoke pairing</button>}
      </article>;
    }) : <Empty title="No screens paired" body={canManage && pin ? `Install LessonCue TV, choose Pair, and enter ${pin}.` : "No paired screens are reporting to this server."} />}</div></section>
  </>;
}

function DiagnosticList({ title, empty, items }: { title: string; empty: string; items: { title: string; detail: string; error?: string }[] }) {
  return <div className="diagnostic-list"><strong>{title}</strong>{items.length ? items.map((item, index) => <div key={`${item.title}-${index}`}><span>{item.title}</span><small>{item.detail}</small>{item.error && <em>{item.error}</em>}</div>) : <small>{empty}</small>}</div>;
}

function TemplatesView({ templates, schedules, lessons, classes, refresh, notify }: {
  templates: LessonTemplate[]; schedules: RecurringSchedule[]; lessons: Lesson[]; classes: LessonClass[];
  refresh: () => void; notify: (value: string) => void;
}) {
  const [showTemplate, setShowTemplate] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<LessonTemplate>();
  const [instantiateTemplate, setInstantiateTemplate] = useState<LessonTemplate>();
  const [frequency, setFrequency] = useState<RecurringSchedule["frequency"]>("weekly");
  const [busy, setBusy] = useState(false);
  const [exceptionDates, setExceptionDates] = useState<Record<string, string>>({});

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true);
    try { await api("/api/v1/lesson-templates/from-lesson", { method: "POST", body: JSON.stringify({ lessonId: values.lessonId, name: values.name, description: values.description }) }); setShowTemplate(false); refresh(); notify("Reusable lesson template created."); }
    catch (error) { notify(errorText(error)); } finally { setBusy(false); }
  }
  async function updateTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingTemplate) return; const values = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true);
    try {
      await api(`/api/v1/lesson-templates/${editingTemplate.id}`, { method: "PUT", body: JSON.stringify({
        name: values.name, description: values.description, defaultTitle: values.defaultTitle,
        defaultStartMinutes: minutesFromTime(String(values.defaultStartTime || "")),
        preRollLeadMinutes: values.preRollLeadMinutes === "" ? null : Number(values.preRollLeadMinutes),
        preRollEnabled: values.preRollEnabled === "on", keepOffline: values.keepOffline === "on",
        downloadDaysBefore: Number(values.downloadDaysBefore)
      }) }); setEditingTemplate(undefined); refresh(); notify("Template defaults saved.");
    } catch (error) { notify(errorText(error)); } finally { setBusy(false); }
  }
  async function replaceTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingTemplate) return; const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!confirm("Replace this template's playlist and timing defaults from the selected lesson? Existing generated lessons will not change.")) return;
    setBusy(true); try { await api(`/api/v1/lesson-templates/${editingTemplate.id}/replace-from-lesson`, { method: "POST", body: JSON.stringify({ lessonId: values.lessonId }) }); setEditingTemplate(undefined); refresh(); notify("Template structure refreshed. Referenced media will now be kept permanently."); }
    catch (error) { notify(errorText(error)); } finally { setBusy(false); }
  }
  async function instantiate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!instantiateTemplate) return; const values = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true);
    try {
      await api(`/api/v1/lesson-templates/${instantiateTemplate.id}/instantiate`, { method: "POST", body: JSON.stringify({ classId: values.classId, date: values.date, title: values.title || null, startMinutes: minutesFromTime(String(values.startTime || "")) }) });
      setInstantiateTemplate(undefined); refresh(); notify("Lesson created from the template.");
    } catch (error) { notify(errorText(error)); } finally { setBusy(false); }
  }
  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true);
    try {
      await api("/api/v1/recurring-schedules", { method: "POST", body: JSON.stringify({
        templateId: values.templateId, classId: values.classId, name: values.name, frequency,
        interval: Number(values.interval || 1), dayOfWeek: frequency === "weekly" ? Number(values.dayOfWeek) : null,
        dayOfMonth: frequency === "monthly" ? Number(values.dayOfMonth) : null,
        startDate: values.startDate, endDate: values.endDate || null,
        startMinutes: minutesFromTime(String(values.startTime || "")), titlePattern: values.titlePattern,
        customDates: frequency === "custom" ? parseDateList(String(values.customDates || "")) : [],
        excludedDates: [], enabled: true, generateDaysAhead: Number(values.generateDaysAhead || 90)
      }) }); setShowSchedule(false); refresh(); notify("Recurring schedule saved and upcoming lessons generated.");
    } catch (error) { notify(errorText(error)); } finally { setBusy(false); }
  }
  async function generate(schedule: RecurringSchedule) {
    setBusy(true); try { const result = await api<{ generated: number }>(`/api/v1/recurring-schedules/${schedule.id}/generate`, { method: "POST", body: "{}" }); refresh(); notify(result.generated ? `${result.generated} new lesson${result.generated === 1 ? "" : "s"} generated.` : "Schedule is already up to date."); }
    catch (error) { notify(errorText(error)); } finally { setBusy(false); }
  }
  async function setEnabled(schedule: RecurringSchedule, enabled: boolean) {
    try { await api(`/api/v1/recurring-schedules/${schedule.id}`, { method: "PUT", body: JSON.stringify(schedulePayload(schedule, enabled)) }); refresh(); notify(enabled ? "Schedule resumed." : "Schedule paused. Existing lessons were kept."); }
    catch (error) { notify(errorText(error)); }
  }
  async function setException(schedule: RecurringSchedule, date: string, excluded: boolean) {
    if (!date) return;
    try { await api(`/api/v1/recurring-schedules/${schedule.id}/exception`, { method: "POST", body: JSON.stringify({ date, excluded }) }); setExceptionDates(current => ({ ...current, [schedule.id]: "" })); refresh(); notify(excluded ? "Date skipped and its generated lesson removed." : "Date restored to the schedule."); }
    catch (error) { notify(errorText(error)); }
  }
  async function removeTemplate(template: LessonTemplate) {
    if (!confirm(`Delete ${template.name}? Its ${template.scheduleCount} recurring schedule${template.scheduleCount === 1 ? "" : "s"} will also be removed. Existing lessons stay intact.`)) return;
    try { await api(`/api/v1/lesson-templates/${template.id}`, { method: "DELETE" }); refresh(); notify("Template deleted; existing lessons were preserved."); } catch (error) { notify(errorText(error)); }
  }
  async function removeSchedule(schedule: RecurringSchedule) {
    if (!confirm(`Delete ${schedule.name}? Existing generated lessons will stay in their classes.`)) return;
    try { await api(`/api/v1/recurring-schedules/${schedule.id}`, { method: "DELETE" }); refresh(); notify("Schedule deleted; existing lessons were preserved."); } catch (error) { notify(errorText(error)); }
  }

  return <>
    <PageHead eyebrow="REUSABLE PLANNING" title="Templates & recurring schedules" detail="Capture a proven lesson structure once, then generate dated lessons automatically with explicit holiday exceptions." action={<div className="page-actions"><button className="button" onClick={() => setShowTemplate(true)} disabled={!lessons.length}>New template</button><button className="button primary" onClick={() => setShowSchedule(true)} disabled={!templates.length || !classes.length}>New schedule</button></div>} />
    {showTemplate && <Modal title="Create template from a lesson" onClose={() => !busy && setShowTemplate(false)}><form className="stack" onSubmit={createTemplate}><Field label="Source lesson" hint="Playlist order, media, trims, fades, pre-roll, countdown, timing, and offline defaults are copied. Referenced media is kept permanently for safe reuse."><select name="lessonId" required>{[...lessons].sort((a, b) => b.date.localeCompare(a.date)).map(lesson => <option key={lesson.id} value={lesson.id}>{formatShortDate(lesson.date)} — {lesson.title} ({lesson.className})</option>)}</select></Field><Field label="Template name"><input name="name" required autoFocus placeholder="Standard weekly lesson" /></Field><Field label="Description"><textarea name="description" rows={3} placeholder="When this structure should be used" /></Field><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Create reusable template"}</button></form></Modal>}
    {editingTemplate && <Modal title="Edit template defaults" onClose={() => !busy && setEditingTemplate(undefined)}><form className="stack" onSubmit={updateTemplate}><div className="two-fields"><Field label="Template name"><input name="name" required defaultValue={editingTemplate.name} /></Field><Field label="Default lesson title"><input name="defaultTitle" required defaultValue={editingTemplate.defaultTitle} /></Field></div><Field label="Description"><textarea name="description" rows={3} defaultValue={editingTemplate.description} /></Field><div className="two-fields"><Field label="Default start time"><input name="defaultStartTime" type="time" defaultValue={timeFromMinutes(editingTemplate.defaultStartMinutes)} /></Field><Field label="Pre-roll lead (minutes)"><input name="preRollLeadMinutes" type="number" min="0" max="1440" defaultValue={editingTemplate.preRollLeadMinutes ?? ""} /></Field></div><div className="two-fields"><Field label="Download days before"><input name="downloadDaysBefore" type="number" min="0" max="365" defaultValue={editingTemplate.downloadDaysBefore} /></Field><div className="template-switches"><label className="check-line"><input name="preRollEnabled" type="checkbox" defaultChecked={editingTemplate.preRollEnabled} /> Enable pre-roll</label><label className="check-line"><input name="keepOffline" type="checkbox" defaultChecked={editingTemplate.keepOffline} /> Keep lesson offline</label></div></div><button className="button primary" disabled={busy}>Save defaults</button></form><form className="template-replace stack" onSubmit={replaceTemplate}><div><strong>Refresh the complete structure</strong><p>Replace playlist order, media, trims, fades, cue markers, role assignments, and timing defaults from a newer lesson. Referenced media is kept permanently for safe reuse.</p></div><Field label="New source lesson"><select name="lessonId" required>{[...lessons].sort((a, b) => b.date.localeCompare(a.date)).map(lesson => <option key={lesson.id} value={lesson.id}>{formatShortDate(lesson.date)} — {lesson.title}</option>)}</select></Field><button className="button" disabled={busy}>Replace from selected lesson</button></form></Modal>}
    {instantiateTemplate && <Modal title="Create one lesson from template" onClose={() => !busy && setInstantiateTemplate(undefined)}><form className="stack" onSubmit={instantiate}><div className="template-source"><span>TEMPLATE</span><strong>{instantiateTemplate.name}</strong><small>{instantiateTemplate.items.length} playlist items</small></div><div className="two-fields"><Field label="Class"><select name="classId" required>{classes.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Lesson date"><input name="date" type="date" required defaultValue={dateInputValue(undefined, 7)} /></Field></div><div className="two-fields"><Field label="Lesson title"><input name="title" defaultValue={instantiateTemplate.defaultTitle} /></Field><Field label="Start time"><input name="startTime" type="time" defaultValue={timeFromMinutes(instantiateTemplate.defaultStartMinutes)} /></Field></div><button className="button primary" disabled={busy}>Create lesson</button></form></Modal>}
    {showSchedule && <Modal title="Create recurring schedule" onClose={() => !busy && setShowSchedule(false)}><form className="stack schedule-form" onSubmit={createSchedule}><div className="two-fields"><Field label="Schedule name"><input name="name" required autoFocus placeholder="Fall weekly sessions" /></Field><Field label="Template"><select name="templateId" required>{templates.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field></div><div className="two-fields"><Field label="Class"><select name="classId" required>{classes.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Recurrence"><select value={frequency} onChange={event => setFrequency(event.target.value as RecurringSchedule["frequency"])}><option value="weekly">Weekly / biweekly</option><option value="monthly">Monthly</option><option value="custom">Term or custom dates</option></select></Field></div><div className="three-fields"><Field label="Every"><select name="interval" defaultValue="1"><option value="1">1 period</option><option value="2">2 periods</option><option value="3">3 periods</option><option value="4">4 periods</option></select></Field>{frequency === "weekly" && <Field label="Weekday"><select name="dayOfWeek" defaultValue="0">{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option value={index} key={day}>{day}</option>)}</select></Field>}{frequency === "monthly" && <Field label="Day of month"><input name="dayOfMonth" type="number" min="1" max="31" required defaultValue="1" /></Field>}<Field label="Start time"><input name="startTime" type="time" /></Field></div>{frequency === "custom" && <Field label="Term or custom dates" hint="Enter dates separated by commas or new lines (YYYY-MM-DD)."><textarea name="customDates" required rows={4} placeholder={dateInputValue(undefined, 7)} /></Field>}<div className="two-fields"><Field label="Begins"><input name="startDate" type="date" required defaultValue={dateInputValue(undefined, 7)} /></Field><Field label="Ends (optional)"><input name="endDate" type="date" /></Field></div><Field label="Lesson title pattern" hint="Use {template}, {class}, and {date}."><input name="titlePattern" defaultValue="{template} — {date}" required /></Field><div className="two-fields"><Field label="Generate ahead"><select name="generateDaysAhead" defaultValue="90"><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">1 year</option><option value="730">2 years</option></select></Field><div className="schedule-help"><strong>Safe to rerun</strong><small>LessonCue recognizes generated dates and never duplicates them.</small></div></div><button className="button primary" disabled={busy}>{busy ? "Generating…" : "Save and generate lessons"}</button></form></Modal>}
    <section className="planning-section"><div className="section-heading"><div><span className="eyebrow">STRUCTURES</span><h2>Lesson templates</h2></div><span className="pill">{templates.length}</span></div>{templates.length ? <div className="template-grid">{templates.map(template => <article className="template-card panel" key={template.id}><div className="template-card-head"><div><span>REUSABLE TEMPLATE</span><h3>{template.name}</h3><p>{template.description || "No description"}</p></div><strong>{template.items.length}</strong></div><div className="template-meta"><span>{timeFromMinutes(template.defaultStartMinutes) || "No default time"}</span><span>{template.preRollEnabled ? `Pre-roll${template.preRollLeadMinutes != null ? ` ${template.preRollLeadMinutes}m early` : ""}` : "No pre-roll"}</span><span>{template.scheduleCount} schedule{template.scheduleCount === 1 ? "" : "s"}</span></div><div className="template-sequence">{template.items.slice(0, 6).map((item, index) => <span className={item.role} key={item.id}><b>{index + 1}</b>{item.title}</span>)}{template.items.length > 6 && <i>+{template.items.length - 6} more</i>}</div><div className="card-actions"><button className="button primary" onClick={() => setInstantiateTemplate(template)}>Create lesson</button><button className="button" onClick={() => setEditingTemplate(template)}>Edit defaults</button><button className="text-danger" onClick={() => removeTemplate(template)}>Delete</button></div></article>)}</div> : <section className="panel"><Empty title="No reusable templates yet" body="Open a proven lesson, then capture its full media and timing structure as a template." action={lessons.length ? <button className="button primary" onClick={() => setShowTemplate(true)}>Create first template</button> : undefined} /></section>}</section>
    <section className="planning-section"><div className="section-heading"><div><span className="eyebrow">AUTOMATION</span><h2>Recurring schedules</h2></div><span className="pill">{schedules.length}</span></div>{schedules.length ? <div className="schedule-list">{schedules.map(schedule => { const excluded = parseStoredDates(schedule.excludedDatesJson); return <article className={`schedule-card panel ${schedule.enabled ? "" : "paused"}`} key={schedule.id}><div className="schedule-card-main"><div className="schedule-status"><i /><span>{schedule.enabled ? "ACTIVE" : "PAUSED"}</span></div><div><h3>{schedule.name}</h3><p>{schedule.templateName} → {schedule.className}</p><strong>{scheduleSummary(schedule)}</strong></div><div className="schedule-count"><strong>{schedule.generatedCount}</strong><span>lessons</span></div></div><div className="schedule-details"><span>From {formatShortDate(schedule.startDate)}{schedule.endDate ? ` to ${formatShortDate(schedule.endDate)}` : " · no end date"}</span><span>{schedule.startMinutes != null ? `Starts ${timeFromMinutes(schedule.startMinutes)}` : "Uses template start time"}</span><span>Generates {schedule.generateDaysAhead} days ahead</span><span>{schedule.lastGeneratedAt ? `Checked ${timeAgo(schedule.lastGeneratedAt)}` : "Not generated yet"}</span></div><div className="exception-editor"><div><strong>Holiday / skipped dates</strong><small>Adding a date removes only the lesson generated by this schedule.</small></div><div className="exception-add"><input aria-label={`Skip date for ${schedule.name}`} type="date" value={exceptionDates[schedule.id] || ""} onChange={event => setExceptionDates(current => ({ ...current, [schedule.id]: event.target.value }))} /><button className="button" onClick={() => setException(schedule, exceptionDates[schedule.id], true)}>Skip date</button></div>{excluded.length > 0 && <div className="exception-chips">{excluded.map(date => <button key={date} title="Restore this date" onClick={() => setException(schedule, date, false)}>{formatShortDate(date)} ×</button>)}</div>}</div><div className="card-actions"><button className="button primary" onClick={() => generate(schedule)} disabled={busy || !schedule.enabled}>Generate now</button><label className="switch-row compact"><input type="checkbox" checked={schedule.enabled} onChange={event => setEnabled(schedule, event.target.checked)} /><span /><div><strong>{schedule.enabled ? "Enabled" : "Paused"}</strong></div></label><button className="text-danger" onClick={() => removeSchedule(schedule)}>Delete schedule</button></div></article>; })}</div> : <section className="panel"><Empty title="No recurring schedules" body="Create a template first, then generate weekly, monthly, term-based, or custom dated lessons." action={templates.length ? <button className="button primary" onClick={() => setShowSchedule(true)}>Create schedule</button> : undefined} /></section>}</section>
  </>;
}

function CalendarView({ lessons }: { lessons: Lesson[] }) {
  const visible = [...lessons].filter(l => !l.archived).sort((a, b) => a.date.localeCompare(b.date));
  const grouped = visible.reduce<Record<string, Lesson[]>>((all, lesson) => { const key = lesson.date.slice(0, 7); (all[key] ||= []).push(lesson); return all; }, {});
  return <><PageHead eyebrow="SCHEDULE" title="Calendar" detail="Every dated lesson and its pre-class timing in one place." />
    <div className="calendar-stack">{Object.entries(grouped).length ? Object.entries(grouped).map(([month, entries]) => <section className="panel" key={month}><div className="panel-title"><h2>{new Date(`${month}-15T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><span className="pill">{entries.length} lessons</span></div><div className="calendar-grid">{entries.map(l => <article key={l.id}><DateBadge date={l.date} /><div><strong>{l.title}</strong><small>{l.className}{l.generatedByScheduleId ? " · Recurring schedule" : ""}</small><div className="calendar-meta"><span>{l.designatedStartAt ? new Date(l.designatedStartAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Start time not set"}</span><RoleSummary items={l.items} /></div></div></article>)}</div></section>) : <section className="panel"><Empty title="No lessons scheduled" body="Create a dated lesson from Classes and it will appear here." /></section>}</div>
  </>;
}

function SignageView({ signage, media, screens, timeZone, refresh, notify }: {
  signage: Signage[]; media: Media[]; screens: Screen[]; timeZone: string; refresh: () => void; notify: (s: string) => void;
}) {
  const [editing, setEditing] = useState<Signage | "new">();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = editing;
    if (!current) return;
    try {
      await api(current === "new" ? "/api/v1/signage" : `/api/v1/signage/${current.id}`, {
        method: current === "new" ? "POST" : "PUT",
        body: JSON.stringify(signageFormPayload(new FormData(event.currentTarget))),
      });
      setEditing(undefined); refresh(); notify(current === "new" ? "Signage schedule created." : "Signage schedule updated.");
    } catch (error) { notify(errorText(error)); }
  }
  async function setEnabled(item: Signage, enabled: boolean) {
    try {
      await api(`/api/v1/signage/${item.id}`, { method: "PUT", body: JSON.stringify(signagePayload(item, enabled)) });
      refresh(); notify(`${item.name} ${enabled ? "resumed" : "paused"}.`);
    } catch (error) { notify(errorText(error)); }
  }
  async function remove(item: Signage) {
    if (!confirm(`Delete ${item.name}?`)) return;
    try { await api(`/api/v1/signage/${item.id}`, { method: "DELETE" }); refresh(); notify("Signage deleted."); }
    catch (error) { notify(errorText(error)); }
  }
  return <><PageHead eyebrow="AMBIENT PLAYBACK" title="Signage" detail={`Recurring welcome screens, announcements, and emergency overrides · ${timeZone}`} action={<button className="button primary" onClick={() => setEditing("new")}>New signage</button>} />
    <section className="signage-priority panel"><strong>Conflict order</strong><span>Emergency override</span><b>›</b><span>Scheduled signage</span><b>›</b><span>Idle fallback</span><small>Within each level, the highest priority wins. Lesson playback remains in control and signage returns automatically afterward.</small></section>
    {editing && <SignageEditor item={editing === "new" ? undefined : editing} media={media} screens={screens} timeZone={timeZone} onSave={save} onClose={() => setEditing(undefined)} />}
    <div className="signage-grid">{signage.length ? signage.map(item => <article className={`signage-card ${item.mode} ${!item.enabled ? "paused" : ""}`} key={item.id} style={{ background: item.backgroundColor, color: item.textColor }}>
      <div className="signage-top"><span>{item.mode.toUpperCase()}</span><span>{!item.enabled ? "PAUSED" : item.activeNow ? "SHOWING NOW" : "SCHEDULED"}</span></div>
      <h2>{item.message || item.name}</h2>
      <p>{item.name}{item.mediaFileName ? ` · ${item.mediaFileName}` : ""}</p>
      <div className="signage-meta"><span>{signageScheduleSummary(item)}</span><span>{signageTargets(item)}</span><span className={`signage-ready ${item.readiness}`}>{item.readiness === "ready" ? "✓ Server media ready" : item.readiness === "preparing" ? "◷ Server media preparing" : `! Server media ${item.readiness}`}</span>{item.mediaAssetId && <span className={`signage-ready ${item.failedScreenCount ? "failed" : item.cachedScreenCount === item.targetScreenCount && item.targetScreenCount ? "ready" : "preparing"}`}>{item.targetScreenCount === 0 ? "No paired target displays" : item.failedScreenCount ? `! ${item.failedScreenCount} display cache failed` : item.cachedScreenCount === item.targetScreenCount ? `✓ Cached on ${item.targetScreenCount} display${item.targetScreenCount === 1 ? "" : "s"}` : `◷ Cached on ${item.cachedScreenCount} of ${item.targetScreenCount} displays`}</span>}</div>
      <div className="signage-foot"><span>Priority {item.priority}</span><div><button onClick={() => setEditing(item)}>Edit</button><button onClick={() => setEnabled(item, !item.enabled)}>{item.enabled ? "Pause" : "Resume"}</button><button onClick={() => remove(item)}>Delete</button></div></div>
    </article>) : <section className="panel"><Empty title="No signage yet" body="Create an idle welcome screen or a recurring scheduled announcement." /></section>}</div>
  </>;
}

function SignageEditor({ item, media, screens, timeZone, onSave, onClose }: {
  item?: Signage; media: Media[]; screens: Screen[]; timeZone: string;
  onSave: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void;
}) {
  const [recurrence, setRecurrence] = useState<Signage["recurrence"]>(item?.recurrence || "once");
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return <Modal title={item ? `Edit ${item.name}` : "Create signage"} onClose={onClose}><form className="stack" onSubmit={onSave}>
    <Field label="Name"><input name="name" required maxLength={160} autoFocus defaultValue={item?.name} /></Field>
    <div className="two-fields"><Field label="Mode"><select name="mode" defaultValue={item?.mode || "scheduled"}><option value="scheduled">Scheduled</option><option value="idle">Idle fallback</option><option value="emergency">Emergency override</option></select></Field><Field label="Priority"><input name="priority" type="number" min="0" max="100" defaultValue={item?.priority ?? 10} /></Field></div>
    <Field label="Message"><textarea name="message" rows={3} maxLength={2000} defaultValue={item?.message} /></Field>
    <div className="two-fields"><Field label="Optional image or video"><select name="mediaAssetId" defaultValue={item?.mediaAssetId || ""}><option value="">Text only</option>{media.filter(value => value.sourceKind !== "link" && (value.contentType.startsWith("image/") || value.contentType.startsWith("video/"))).map(value => <option key={value.id} value={value.id}>{value.fileName}</option>)}</select></Field><Field label="Repeats"><select name="recurrence" value={recurrence} onChange={event => setRecurrence(event.target.value as Signage["recurrence"])}><option value="once">One time</option><option value="daily">Every day</option><option value="weekly">Selected weekdays</option></select></Field></div>
    {recurrence === "once" ? <div className="two-fields"><Field label="Starts" hint="Leave blank to start immediately."><input name="startsAt" type="datetime-local" defaultValue={toLocalInput(item?.startsAt)} /></Field><Field label="Ends" hint="Leave blank to continue until paused."><input name="endsAt" type="datetime-local" defaultValue={toLocalInput(item?.endsAt)} /></Field></div> : <>
      <div className="two-fields"><Field label="First date"><input name="scheduleStartDate" type="date" defaultValue={item?.scheduleStartDate || dateInputValue(undefined)} /></Field><Field label="Last date" hint="Optional"><input name="scheduleEndDate" type="date" defaultValue={item?.scheduleEndDate || ""} /></Field></div>
      <div className="two-fields"><Field label="Daily start"><input name="startTime" type="time" required defaultValue={signageTime(item?.startMinutes, "08:00")} /></Field><Field label="Daily end"><input name="endTime" type="time" required defaultValue={signageTime(item?.endMinutes, "17:00")} /></Field></div>
      {recurrence === "weekly" && <fieldset className="signage-weekdays"><legend>Show on</legend>{days.map((day, index) => <label key={day}><input type="checkbox" name="dayOfWeek" value={index} defaultChecked={item ? item.daysOfWeek.includes(index) : index > 0 && index < 6} /> {day.slice(0, 3)}</label>)}</fieldset>}
      <Field label="Excluded dates" hint={`One YYYY-MM-DD date per line. Times use ${timeZone}.`}><textarea name="excludedDates" rows={3} defaultValue={item?.excludedDates.join("\n")} placeholder={"2026-12-25\n2027-01-01"} /></Field>
    </>}
    <fieldset className="signage-targets"><legend>Specific screens</legend><p>Leave every box clear to use tags or target all screens.</p>{screens.filter(screen => !screen.revoked).map(screen => <label key={screen.id}><input type="checkbox" name="targetScreenId" value={screen.id} defaultChecked={item?.targetScreenIds.includes(screen.id)} /><span><strong>{screen.name}</strong><small>{screen.site}{screen.tagsCsv ? ` · ${screen.tagsCsv}` : ""}</small></span></label>)}</fieldset>
    <Field label="Target screen tags" hint="A selected screen or a screen with any matching tag receives this sign. Leave both blank for every screen."><input name="targetTagsCsv" maxLength={2000} defaultValue={item?.targetTagsCsv} placeholder="lobby, campus-a" /></Field>
    <div className="two-fields"><Field label="Background color"><input name="backgroundColor" type="color" defaultValue={item?.backgroundColor || "#25302d"} /></Field><Field label="Text color"><input name="textColor" type="color" defaultValue={item?.textColor || "#ffffff"} /></Field></div>
    <label className="check-row"><input type="checkbox" name="enabled" defaultChecked={item?.enabled ?? true} /> Publish this schedule</label>
    <div className="modal-actions"><button className="button" type="button" onClick={onClose}>Cancel</button><button className="button primary">{item ? "Save changes" : "Create signage"}</button></div>
  </form></Modal>;
}

function UsersView({ users, currentUsername, currentRole, refresh, notify, canManage, emailConfigured }: { users: User[]; currentUsername: string; currentRole: string; refresh: () => void; notify: (s: string) => void; canManage: boolean; emailConfigured: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [creationMode, setCreationMode] = useState<"invite" | "temporary">("invite");
  const [editingUser, setEditingUser] = useState<User>();
  const [passwordUser, setPasswordUser] = useState<User>();
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const values = Object.fromEntries(form);
    try {
      const permissions = values.customPermissions === "on" ? form.getAll("permission") : null;
      if (creationMode === "invite") {
        const result = await api<{ message: string }>("/api/v1/users/invitations", {
          method: "POST",
          body: JSON.stringify({ email: values.email, displayName: values.displayName || null, role: values.role, permissions }),
        });
        notify(result.message);
      } else {
        await api("/api/v1/users", {
          method: "POST", body: JSON.stringify({ ...values, disabled: false, permissions }),
        });
        notify("Local user created with a temporary password.");
      }
      setShowForm(false); refresh();
    } catch (e) { refresh(); notify(errorText(e)); }
  }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingUser) return;
    const form = new FormData(event.currentTarget); const values = Object.fromEntries(form);
    try {
      await api(`/api/v1/users/${editingUser.id}`, { method: "PUT", body: JSON.stringify({ ...values, password: values.password || null, disabled: editingUser.disabled, permissions: values.customPermissions === "on" ? form.getAll("permission") : null }) });
      const invitationAddressChanged = editingUser.pendingSetup &&
        String(values.email || "").trim().toLowerCase() !== String(editingUser.email || "").trim().toLowerCase();
      setEditingUser(undefined);
      notify(invitationAddressChanged ? "User details saved. Send a new setup link to the changed address." : "User details saved.");
      if (editingUser.username === currentUsername) location.reload(); else refresh();
    } catch (e) { notify(errorText(e)); }
  }
  async function togglePaused(user: User) {
    try {
      await api(`/api/v1/users/${user.id}`, { method: "PUT", body: JSON.stringify({ username: user.username, displayName: user.displayName, email: user.email || null, role: user.role, password: null, disabled: !user.disabled, permissions: user.customPermissions ?? null }) });
      refresh(); notify(user.disabled ? `${user.displayName} can sign in again.` : `${user.displayName} is paused and has been signed out.`);
    } catch (e) { notify(errorText(e)); }
  }
  async function remove(user: User) {
    if (!confirm(`Delete ${user.displayName}? This permanently removes the local account and cannot be undone.`)) return;
    try { await api(`/api/v1/users/${user.id}`, { method: "DELETE" }); refresh(); notify(`${user.displayName} was deleted.`); }
    catch (e) { notify(errorText(e)); }
  }
  async function approve(user: User) {
    try {
      const result = await api<{ message: string }>(`/api/v1/users/${user.id}/approve`, { method: "POST", body: "{}" });
      refresh(); notify(result.message);
    } catch (cause) { notify(errorText(cause)); }
  }
  async function resendInvitation(user: User) {
    try {
      const result = await api<{ message: string }>(`/api/v1/users/${user.id}/invitation`, { method: "POST", body: "{}" });
      notify(result.message);
    } catch (cause) { notify(errorText(cause)); }
  }
  async function setTemporaryPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!passwordUser) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirmPassword) { notify("Passwords do not match."); return; }
    try {
      const result = await api<{ message: string }>(`/api/v1/users/${passwordUser.id}/temporary-password`, {
        method: "POST", body: JSON.stringify({ password: values.password }),
      });
      setPasswordUser(undefined); refresh(); notify(result.message);
    } catch (cause) { notify(errorText(cause)); }
  }
  function accountStatus(user: User) {
    if (user.pendingSetup) return { label: "Setup invited", className: "pending" };
    if (user.disabled) return { label: "Paused", className: "paused" };
    if (user.pendingApproval) return { label: user.emailVerified ? "Awaiting approval" : "Verify then approve", className: "pending" };
    if (!user.emailVerified) return { label: "Awaiting email", className: "pending" };
    if (user.mustChangePassword) return { label: "Temporary password", className: "pending" };
    return { label: "Active", className: "" };
  }
  return <><PageHead eyebrow="ACCESS CONTROL" title="Users" detail="Create accounts, approve requests, send setup invitations, reset passwords, and grant only the permissions each person needs." action={canManage ? <div className="head-actions"><button className="button primary" disabled={!emailConfigured} title={!emailConfigured ? "Configure account email under Settings → Organization & accounts first." : undefined} onClick={() => { setCreationMode("invite"); setShowForm(true); }}>Send setup link</button><button className="button" onClick={() => { setCreationMode("temporary"); setShowForm(true); }}>Create with password</button></div> : undefined} />
    {canManage && !emailConfigured && <div className="alert user-email-note">Setup invitations and approval notifications require a configured email provider under Settings → Organization & accounts. Local temporary-password accounts remain available.</div>}
    {showForm && <Modal title={creationMode === "invite" ? "Invite a user" : "Create a local user"} onClose={() => setShowForm(false)}><form className="stack" onSubmit={create}>
      {creationMode === "invite" ? <><div className="alert">LessonCue emails a one-time setup link. The recipient chooses their name, username, and password; you control their permissions now.</div><Field label="Email"><input name="email" type="email" required autoComplete="email" autoFocus /></Field><Field label="Name (optional)"><input name="displayName" maxLength={120} autoComplete="name" /></Field></> : <><Field label="Name"><input name="displayName" required autoFocus /></Field><div className="two-fields"><Field label="Username"><input name="username" required minLength={3} /></Field><Field label="Email (optional)"><input name="email" type="email" /></Field></div></>}
      <Field label="Role"><select name="role"><option>Editor</option><option>Viewer</option><option>Administrator</option>{currentRole === "Owner" && <option>Owner</option>}</select></Field><PermissionEditor />
      {creationMode === "temporary" && <Field label="Temporary password" hint="The user must replace this after their first sign-in. Use 10+ characters with uppercase, lowercase, and a number."><input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>}
      <button className="button primary">{creationMode === "invite" ? "Send setup email" : "Create user"}</button>
    </form></Modal>}
    {editingUser && <Modal title={`Edit ${editingUser.displayName}`} onClose={() => setEditingUser(undefined)}><form className="stack" onSubmit={update}><Field label="Name"><input name="displayName" required autoFocus defaultValue={editingUser.displayName} /></Field><div className="two-fields"><Field label="Username"><input name="username" required minLength={3} maxLength={80} defaultValue={editingUser.username} disabled={editingUser.pendingSetup} /></Field><Field label="Email (optional)"><input name="email" type="email" defaultValue={editingUser.email || ""} /></Field></div>{editingUser.pendingSetup && <input type="hidden" name="username" value={editingUser.username} />}<Field label="Role"><select name="role" defaultValue={editingUser.role}><option>Editor</option><option>Viewer</option><option>Administrator</option>{currentRole === "Owner" && <option>Owner</option>}</select></Field><PermissionEditor customPermissions={editingUser.customPermissions} /><button className="button primary">Save user</button></form></Modal>}
    {passwordUser && <Modal title={`Temporary password for ${passwordUser.displayName}`} onClose={() => setPasswordUser(undefined)}><form className="stack" onSubmit={setTemporaryPassword}><div className="alert">Existing sessions will be signed out. The user must replace this temporary password after signing in.</div><Field label="Temporary password" hint="10+ characters with uppercase, lowercase, and a number"><input name="password" type="password" required minLength={10} autoComplete="new-password" autoFocus /></Field><Field label="Confirm temporary password"><input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" /></Field><button className="button primary">Set temporary password</button></form></Modal>}
    <section className="panel user-table"><div className="user-row user-head"><span>User</span><span>Role</span><span>Status</span><span>Last sign-in</span><span>Actions</span></div>{users.map(user => { const self = user.username === currentUsername; const protectedOwner = user.role === "Owner" && currentRole !== "Owner"; const status = accountStatus(user); return <div className={`user-row ${user.disabled ? "paused" : ""}`} key={user.id}><span className="user-name"><b>{initials(user.displayName)}</b><span><strong>{user.displayName}{self ? " (you)" : ""}</strong><small>{user.pendingSetup ? "Username chosen during setup" : `@${user.username}`}{user.email ? ` · ${user.email}` : ""}</small><small>{user.permissions.length} of {permissionOptions.length} permissions{user.customPermissions ? " · custom" : " · role defaults"}</small></span></span><span><i className="pill">{user.role}</i></span><span className={`user-status ${status.className}`}><i />{status.label}</span><span>{user.lastLoginAt ? timeAgo(user.lastLoginAt) : "Never"}</span><span className="user-actions">{canManage && <>{user.pendingApproval && <button className="primary-action" onClick={() => approve(user)} disabled={protectedOwner}>Approve</button>}{user.pendingSetup && <button onClick={() => resendInvitation(user)} disabled={protectedOwner}>Resend setup</button>}<button onClick={() => setEditingUser(user)} disabled={protectedOwner}>Edit</button>{!user.pendingSetup && !self && <button onClick={() => setPasswordUser(user)} disabled={protectedOwner}>Reset password</button>}<button onClick={() => togglePaused(user)} disabled={self || protectedOwner || user.pendingSetup} title={self ? "You cannot pause your own account." : undefined}>{user.disabled ? "Reactivate" : "Pause"}</button><button className="danger" onClick={() => remove(user)} disabled={self || protectedOwner} title={self ? "You cannot delete your own account." : undefined}>Delete</button></>}</span></div>; })}</section>
  </>;
}

function PermissionEditor({ customPermissions }: { customPermissions?: Permission[] | null }) {
  const [custom, setCustom] = useState(customPermissions != null);
  const [selected, setSelected] = useState<Permission[]>(customPermissions || []);
  return <fieldset className="permission-editor"><legend>Permissions</legend><label className="check-row"><input type="checkbox" name="customPermissions" checked={custom} onChange={event => setCustom(event.target.checked)} /><span>Customize this role</span></label><p>{custom ? "Choose each capability independently. Changes sign the user out of existing sessions." : "Use the selected role's safe defaults. Owners always retain every permission."}</p>{custom && <><div className="permission-grid">{permissionOptions.map(permission => { const active = selected.includes(permission.id); return <button type="button" aria-pressed={active} key={permission.id} onClick={() => setSelected(current => active ? current.filter(value => value !== permission.id) : [...current, permission.id])}><i>{active ? "✓" : ""}</i><span><strong>{permission.label}</strong><small>{permission.detail}</small></span></button>; })}</div>{selected.map(permission => <input type="hidden" name="permission" value={permission} key={permission} />)}</>}</fieldset>;
}

function RegistrationSettingsPanel({ bootstrap, notify, refresh }: { bootstrap: Bootstrap; notify: (message: string) => void; refresh: () => void }) {
  const [settings, setSettings] = useState<RegistrationSettings>({
    mode: bootstrap.settings.registrationMode,
    publicBaseUrl: bootstrap.settings.publicBaseUrl,
    emailFromAddress: bootstrap.settings.emailFromAddress,
    emailFromName: bootstrap.settings.emailFromName,
    emailProvider: bootstrap.settings.emailProvider,
    emailConfigured: bootstrap.accountEmail.configured,
  });
  const [apiKey, setApiKey] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);
  const [codes, setCodes] = useState<RegistrationCode[]>([]);
  const [revealedCode, setRevealedCode] = useState("");
  const [editingCode, setEditingCode] = useState<RegistrationCode>();
  const [busy, setBusy] = useState(false);
  const loadCodes = () => api<RegistrationCode[]>("/api/v1/registration/codes").then(setCodes).catch(cause => notify(errorText(cause)));
  useEffect(() => { void api<RegistrationCode[]>("/api/v1/registration/codes").then(setCodes).catch(cause => notify(errorText(cause))); }, [notify]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api<{ emailConfigured: boolean }>("/api/v1/registration/settings", {
        method: "PUT",
        body: JSON.stringify({ ...settings, apiKey }),
      });
      setSettings(current => ({ ...current, emailConfigured: result.emailConfigured }));
      setApiKey(""); refresh(); notify("Registration and account email settings saved.");
    } catch (cause) { notify(errorText(cause)); } finally { setBusy(false); }
  }
  async function sendTestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setTestingEmail(true);
    try {
      const result = await api<{ message: string }>("/api/v1/registration/email/test", {
        method: "POST", body: JSON.stringify({ recipient: testRecipient }),
      });
      notify(result.message);
    } catch (cause) { notify(errorText(cause)); }
    finally { setTestingEmail(false); }
  }
  async function createCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api<{ code: string }>("/api/v1/registration/codes", {
        method: "POST",
        body: JSON.stringify({ label: values.label, expiresAt: values.expiresAt ? new Date(String(values.expiresAt)).toISOString() : null, maxUses: values.maxUses ? Number(values.maxUses) : null }),
      });
      setRevealedCode(result.code); form.reset(); await loadCodes(); notify("Registration code created. Copy it now.");
    } catch (cause) { notify(errorText(cause)); }
  }
  async function rotateCode(item: RegistrationCode) {
    if (!confirm(`Replace “${item.label}”? The current code will stop working immediately.`)) return;
    try {
      const result = await api<{ code: string }>(`/api/v1/registration/codes/${item.id}/rotate`, { method: "POST", body: "{}" });
      setRevealedCode(result.code); await loadCodes(); notify("Registration code replaced. Copy the new code now.");
    } catch (cause) { notify(errorText(cause)); }
  }
  async function updateCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCode) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/v1/registration/codes/${editingCode.id}`, {
        method: "PUT",
        body: JSON.stringify({ label: values.label, expiresAt: values.expiresAt ? new Date(String(values.expiresAt)).toISOString() : null, maxUses: values.maxUses ? Number(values.maxUses) : null }),
      });
      setEditingCode(undefined); await loadCodes(); notify("Registration code limits saved.");
    } catch (cause) { notify(errorText(cause)); }
  }
  async function revokeCode(item: RegistrationCode) {
    if (!confirm(`Revoke “${item.label}”?`)) return;
    try { await api(`/api/v1/registration/codes/${item.id}`, { method: "DELETE" }); await loadCodes(); notify("Registration code revoked."); }
    catch (cause) { notify(errorText(cause)); }
  }
  return <section className="panel wide-settings account-settings">
    {editingCode && <Modal title={`Edit ${editingCode.label}`} onClose={() => setEditingCode(undefined)}><form className="stack" onSubmit={updateCode}><Field label="Label"><input name="label" required maxLength={120} defaultValue={editingCode.label} /></Field><Field label="Expires (leave blank for no expiration)"><input name="expiresAt" type="datetime-local" defaultValue={editingCode.expiresAt ? localDateTimeValue(editingCode.expiresAt) : ""} /></Field><Field label="Maximum uses (leave blank for unlimited)"><input name="maxUses" type="number" min="1" max="100000" defaultValue={editingCode.maxUses || ""} /></Field><div className="modal-actions"><button className="button" type="button" onClick={() => setEditingCode(undefined)}>Cancel</button><button className="button primary">Save limits</button></div></form></Modal>}
    <div className="settings-heading"><div><span className="settings-kicker">ACCOUNTS</span><h2>Registration & email</h2><p className="settings-copy">Keep registration closed, require administrator approval, open it to verified email addresses, or require a code. Administrator invitations remain available in every mode.</p></div><span className={`update-state ${settings.mode === "closed" ? "current" : "available"}`}>{settings.mode === "closed" ? "Registration closed" : settings.mode === "approval" ? "Approval required" : settings.mode === "code" ? "Code required" : "Registration open"}</span></div>
    <form className="stack" onSubmit={save}>
      <Field label="Registration mode"><select value={settings.mode} onChange={event => setSettings(current => ({ ...current, mode: event.target.value as RegistrationSettings["mode"] }))}><option value="closed">Closed — administrator-created accounts and invitations only</option><option value="approval">Request access — verify email, then wait for administrator approval</option><option value="code">Require an active registration code</option><option value="open">Open to anyone with a verified email</option></select></Field>
      <div className="two-fields"><Field label="Account email provider"><select value={settings.emailProvider} onChange={event => setSettings(current => ({ ...current, emailProvider: event.target.value as RegistrationSettings["emailProvider"] }))}><option value="none">None — local accounts only</option><option value="resend">Resend</option><option value="brevo">Brevo</option></select></Field><Field label={settings.emailConfigured ? "Replace API key (optional)" : "Email API key"} hint="The key is encrypted on this server and is never returned to a browser."><input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} required={settings.emailProvider !== "none" && !settings.emailConfigured} disabled={settings.emailProvider === "none"} autoComplete="new-password" /></Field></div>
      <div className="two-fields"><Field label="Sender name"><input value={settings.emailFromName} onChange={event => setSettings(current => ({ ...current, emailFromName: event.target.value }))} required={settings.emailProvider !== "none"} disabled={settings.emailProvider === "none"} /></Field><Field label="Verified sender address"><input type="email" value={settings.emailFromAddress} onChange={event => setSettings(current => ({ ...current, emailFromAddress: event.target.value }))} required={settings.emailProvider !== "none"} disabled={settings.emailProvider === "none"} /></Field></div>
      <Field label="Public account-link address" hint="Use the HTTPS Cloudflare or reverse-proxy address users can reach from email. Leave blank to use the address from the current request."><input type="url" value={settings.publicBaseUrl} onChange={event => setSettings(current => ({ ...current, publicBaseUrl: event.target.value }))} placeholder="https://lesson.example.org" /></Field>
      {settings.mode !== "closed" && settings.emailProvider === "none" && <div className="alert error">Self-service registration needs Resend or Brevo so LessonCue can verify email addresses.</div>}
      <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save account settings"}</button>
    </form>
    <form className="settings-subsection email-test-form" onSubmit={sendTestEmail}>
      <div><h3>Test email delivery</h3><p>Send a real message through the saved provider and verified sender before opening registration.</p></div>
      <Field label="Test recipient"><input type="email" value={testRecipient} onChange={event => setTestRecipient(event.target.value)} required placeholder="you@example.org" /></Field>
      <button className="button" disabled={!settings.emailConfigured || testingEmail}>{testingEmail ? "Sending…" : settings.emailConfigured ? "Send test email" : "Save provider first"}</button>
    </form>
    <div className="settings-subsection registration-codes">
      <div className="settings-heading"><div><h3>Registration codes</h3><p>Codes are stored as one-way hashes. LessonCue shows each full code only when it is created or replaced.</p></div></div>
      {revealedCode && <div className="secret-reveal"><span>Copy this code now</span><code>{revealedCode}</code><button className="button" type="button" onClick={() => { void navigator.clipboard.writeText(revealedCode); notify("Registration code copied."); }}>Copy</button><button className="text-button" type="button" onClick={() => setRevealedCode("")}>Hide</button></div>}
      <form className="registration-code-form" onSubmit={createCode}><Field label="Label"><input name="label" required maxLength={120} placeholder="Fall semester staff" /></Field><Field label="Expires (optional)"><input name="expiresAt" type="datetime-local" /></Field><Field label="Maximum uses (optional)"><input name="maxUses" type="number" min="1" max="100000" /></Field><button className="button">Create code</button></form>
      {codes.length ? <div className="registration-code-list">{codes.map(item => <div key={item.id} className={!item.active ? "inactive" : ""}><span><strong>{item.label}</strong><small>Ends in …{item.hint} · {item.uses}{item.maxUses ? ` of ${item.maxUses}` : ""} uses · {item.expiresAt ? `expires ${new Date(item.expiresAt).toLocaleString()}` : "no expiration"}</small></span><span className="row-actions">{item.active && <button className="button" type="button" onClick={() => setEditingCode(item)}>Edit</button>}{item.active && <button className="button" type="button" onClick={() => rotateCode(item)}>Replace</button>}{item.active && <button className="button danger" type="button" onClick={() => revokeCode(item)}>Revoke</button>}{!item.active && <small>Inactive</small>}</span></div>)}</div> : <Empty title="No registration codes" body="Create a code when registration is set to require one." />}
    </div>
  </section>;
}

function Settings({ bootstrap, backups, audit, refresh, notify, canSettings, canBackups, canUpdates }: { bootstrap: Bootstrap; backups: Backup[]; audit: Audit[]; refresh: () => void; notify: (s: string) => void; canSettings: boolean; canBackups: boolean; canUpdates: boolean }) {
  const canManage = canSettings;
  const [settingsSection, setSettingsSection] = useState<"system" | "accounts" | "media" | "connections" | "data">(
    canUpdates ? "system" : canSettings ? "accounts" : "data"
  );
  const [automaticStorage, setAutomaticStorage] = useState(bootstrap.storage.automaticAllocation);
  const [allocationGb, setAllocationGb] = useState((bootstrap.storage.allocationBytes / 1024 ** 3).toFixed(1));
  const [adaptiveTranscoding, setAdaptiveTranscoding] = useState(bootstrap.settings.adaptiveTranscodingEnabled);
  const [transcodeLeadDays, setTranscodeLeadDays] = useState(String(bootstrap.settings.transcodeLeadDays));
  const [hardwareAcceleration, setHardwareAcceleration] = useState(bootstrap.settings.hardwareAccelerationEnabled);
  const [checkingHardware, setCheckingHardware] = useState(false);
  const [mediaFolders, setMediaFolders] = useState(bootstrap.mediaTaxonomy.folders.join("\n"));
  const [mediaTags, setMediaTags] = useState(bootstrap.mediaTaxonomy.tags.join("\n"));
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [fixedPairing, setFixedPairing] = useState(bootstrap.pairingFixed);
  const [pairingPin, setPairingPin] = useState(bootstrap.pairingPin || "");
  const [controllerPin, setControllerPin] = useState("");
  const [localHostname, setLocalHostname] = useState(bootstrap.localAddress.hostname);
  const [httpPort, setHttpPort] = useState(String(bootstrap.httpPort.port));
  const [tunnelEnabled, setTunnelEnabled] = useState(bootstrap.cloudflareTunnel.enabled);
  const [tunnelHostname, setTunnelHostname] = useState(bootstrap.cloudflareTunnel.publicHostname || "");
  const [tunnelToken, setTunnelToken] = useState("");
  const [tunnelAcknowledged, setTunnelAcknowledged] = useState(false);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [restorePreview, setRestorePreview] = useState<BackupPreview>();
  const [restoreResult, setRestoreResult] = useState<BackupRestoreResult>();
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [recycleItems, setRecycleItems] = useState<RecycleItem[]>([]);
  const loadRecycleBin = () => canSettings ? api<RecycleItem[]>("/api/v1/recycle-bin").then(setRecycleItems).catch(() => undefined) : Promise.resolve();
  useEffect(() => { if (canSettings) void api<RecycleItem[]>("/api/v1/recycle-bin").then(setRecycleItems).catch(() => undefined); }, [canSettings]);
  async function saveOrganization(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const values = Object.fromEntries(form); try { await api("/api/v1/organization", { method: "PUT", body: JSON.stringify({ ...values, defaultLessonDurationMinutes: Number(values.defaultLessonDurationMinutes), defaultRetentionDays: Number(values.defaultRetentionDays), requireLocalRoomControllers: form.get("requireLocalRoomControllers") === "on" }) }); refresh(); notify("Organization settings saved."); } catch (e) { notify(errorText(e)); } }
  async function backup(full: boolean) { try { await api(`/api/v1/backups?full=${full}`, { method: "POST", body: "{}" }); refresh(); notify(full ? "Full backup created." : "Configuration backup created."); } catch (e) { notify(errorText(e)); } }
  async function previewBackupRestore(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setRestoreBusy(true); try { const preview = await api<BackupPreview>("/api/v1/backups/restore/preview", { method: "POST", body: form }); setRestorePreview(preview); setRestoreResult(undefined); setRestoreConfirmation(""); } catch (e) { notify(errorText(e)); } finally { setRestoreBusy(false); } }
  async function restoreBackup() { if (!restorePreview || restoreConfirmation !== "RESTORE") return; setRestoreBusy(true); try { const result = await api<BackupRestoreResult>("/api/v1/backups/restore", { method: "POST", body: JSON.stringify({ restoreId: restorePreview.restoreId, confirmation: restoreConfirmation }) }); setRestoreResult(result); notify("Backup restored. Review the safety-backup details, then reload LessonCue."); } catch (e) { notify(errorText(e)); } finally { setRestoreBusy(false); } }
  async function saveStorage(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { const limitBytes = automaticStorage ? 0 : Math.round(Number(allocationGb) * 1024 ** 3); await api<StorageStatus>("/api/v1/storage", { method: "PUT", body: JSON.stringify({ limitBytes }) }); refresh(); notify(automaticStorage ? "Storage allocation will adjust automatically." : "Storage allocation saved."); } catch (e) { notify(errorText(e)); } }
  async function saveAdaptiveTranscoding(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { await api("/api/v1/organization", { method: "PUT", body: JSON.stringify({ ...o, adaptiveTranscodingEnabled: adaptiveTranscoding, transcodeLeadDays: Number(transcodeLeadDays), hardwareAccelerationEnabled: hardwareAcceleration }) }); refresh(); notify(hardwareAcceleration && bootstrap.hardwareAcceleration.available ? `${bootstrap.hardwareAcceleration.engine} will accelerate local video conversion.` : "Playback profile settings saved."); } catch (e) { notify(errorText(e)); } }
  async function checkHardware() { setCheckingHardware(true); try { const status = await api<HardwareAccelerationStatus>("/api/v1/hardware-acceleration/check", { method: "POST", body: "{}" }); refresh(); notify(status.available ? `${status.engine} is ready.` : status.message); } catch (e) { notify(errorText(e)); } finally { setCheckingHardware(false); } }
  async function saveMediaTaxonomy(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { const result = await api<MediaTaxonomy>("/api/v1/media-taxonomy", { method: "PUT", body: JSON.stringify({ folders: mediaFolders.split("\n"), tags: mediaTags.split("\n") }) }); setMediaFolders(result.folders.join("\n")); setMediaTags(result.tags.join("\n")); refresh(); notify("Approved media folders and tags saved."); } catch (e) { notify(errorText(e)); } }
  async function checkUpdates() { setChecking(true); try { const status = await api<UpdateStatus>("/api/v1/updates/check", { method: "POST", body: "{}" }); refresh(); notify(status.updateAvailable ? `LessonCue ${status.latestVersion} is available.` : "LessonCue is up to date."); } catch (e) { notify(errorText(e)); } finally { setChecking(false); } }
  async function installUpdate() { if (!confirm(`Install LessonCue ${bootstrap.update.latestVersion}? The local interface will be unavailable briefly while the server restarts.`)) return; setInstalling(true); try { await api("/api/v1/updates/install", { method: "POST", body: "{}" }); notify("Installing the update. LessonCue will reconnect automatically."); await waitForVersion(bootstrap.update.latestVersion); location.reload(); } catch (e) { notify(errorText(e)); setInstalling(false); } }
  async function savePairingPin(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { await api("/api/v1/pairing/pin", { method: "PUT", body: JSON.stringify({ automatic: !fixedPairing, pin: fixedPairing ? pairingPin : null }) }); refresh(); notify(fixedPairing ? "The fixed pairing PIN is active." : "Automatic PIN rotation is active."); } catch (e) { notify(errorText(e)); } }
  async function saveControllerPin(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { await api("/api/v1/controller-pin", { method: "PUT", body: JSON.stringify({ pin: controllerPin }) }); setControllerPin(""); sessionStorage.removeItem("lessoncue.universalGrant"); refresh(); notify("Universal controller PIN saved."); } catch (e) { notify(errorText(e)); } }
  async function saveLocalAddress(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { const status = await api<LocalAddressStatus>("/api/v1/local-address", { method: "PUT", body: JSON.stringify({ hostname: localHostname }) }); setLocalHostname(status.hostname); refresh(); notify(status.pending ? `Setting up ${status.address}…` : `${status.address} is active.`); } catch (e) { notify(errorText(e)); } }
  async function saveHttpPort(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const port = Number(httpPort); if (!confirm(`Change LessonCue's browser port to ${port}? The interface will restart. Saved browser links and screens using the old address must be updated.`)) return; try { const status = await api<HttpPortStatus>("/api/v1/http-port", { method: "PUT", body: JSON.stringify({ port }) }); setHttpPort(String(status.port)); if (status.supported) { notify(`Restarting LessonCue at ${status.address}…`); const destination = new URL(location.href); destination.port = status.port === 80 ? "" : String(status.port); for (let attempt = 0; attempt < 45; attempt++) { await new Promise(resolve => window.setTimeout(resolve, 1000)); try { await fetch(`${destination.origin}/health`, { mode: "no-cors", cache: "no-store" }); location.assign(destination.origin); return; } catch { /* Wait for the protected restart or rollback. */ } } notify("The new port did not respond. Returning to the previous address."); location.reload(); } else { refresh(); notify(status.error || "Port saved. Restart the server to apply it."); } } catch (e) { notify(errorText(e)); } }
  async function saveCloudflareTunnel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tunnelEnabled && bootstrap.cloudflareTunnel.enabled && !confirm("Disable remote access through this Cloudflare Tunnel? Local LessonCue access will continue to work.")) return;
    setTunnelBusy(true);
    try {
      await api<CloudflareTunnelStatus>("/api/v1/cloudflare-tunnel", { method: "PUT", body: JSON.stringify({ enabled: tunnelEnabled, publicHostname: tunnelHostname, token: tunnelToken || null, acknowledgedRemoteExposure: tunnelEnabled && tunnelAcknowledged }) });
      setTunnelToken(""); notify(tunnelEnabled ? "Cloudflare Tunnel setup started. Checking its edge connection…" : "Cloudflare Tunnel is being disabled.");
      for (let attempt = 0; attempt < 45; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 1500));
        const status = await api<CloudflareTunnelStatus>("/api/v1/cloudflare-tunnel");
        if (!status.pending) { refresh(); notify(status.error || (status.connected ? `${status.publicUrl} is connected through Cloudflare.` : status.enabled ? "Cloudflare Tunnel is enabled and waiting for an edge connection." : "Cloudflare Tunnel is disabled.")); break; }
      }
    } catch (e) { notify(errorText(e)); } finally { setTunnelBusy(false); }
  }
  async function restoreRecycleItem(item: RecycleItem) { try { await api(`/api/v1/recycle-bin/${item.kind}/${item.id}/restore`, { method: "POST", body: "{}" }); await loadRecycleBin(); refresh(); notify(`${item.title} restored.`); } catch (error) { notify(errorText(error)); } }
  async function purgeRecycleBin() { if (!confirm("Permanently purge every item in the recycling bin? Files and records cannot be recovered after this.")) return; try { const result = await api<{ purged: number }>("/api/v1/recycle-bin", { method: "DELETE" }); await loadRecycleBin(); refresh(); notify(`${result.purged} recycled item${result.purged === 1 ? "" : "s"} permanently purged.`); } catch (error) { notify(errorText(error)); } }
  const o = bootstrap.settings;
  return <><PageHead eyebrow="SERVER" title="Settings" detail="Updates, appearance, storage, connectivity, recovery, and local server operations." />
    <nav className="settings-tabs" aria-label="Settings sections">{canUpdates && <button className={settingsSection === "system" ? "active" : ""} onClick={() => setSettingsSection("system")}><span>↻</span><strong>System</strong><small>Updates</small></button>}{canSettings && <button className={settingsSection === "accounts" ? "active" : ""} onClick={() => setSettingsSection("accounts")}><span>♙</span><strong>Organization & accounts</strong><small>Appearance, registration, email</small></button>}{canSettings && <button className={settingsSection === "media" ? "active" : ""} onClick={() => setSettingsSection("media")}><span>▶</span><strong>Media & storage</strong><small>Folders, capacity, playback</small></button>}{canSettings && <button className={settingsSection === "connections" ? "active" : ""} onClick={() => setSettingsSection("connections")}><span>⌁</span><strong>Connections</strong><small>Address, pairing, remote access</small></button>}{(canSettings || canBackups) && <button className={settingsSection === "data" ? "active" : ""} onClick={() => setSettingsSection("data")}><span>▤</span><strong>Data & recovery</strong><small>Backups, recycle bin, activity</small></button>}</nav>
    <div className="settings-page" data-section={settingsSection}>
    {canSettings && <div className="settings-grid account-settings-grid settings-panel settings-accounts"><RegistrationSettingsPanel bootstrap={bootstrap} notify={notify} refresh={refresh} /></div>}
    {restorePreview && <Modal title={restoreResult ? "Restore complete" : "Review backup restore"} onClose={() => !restoreBusy && setRestorePreview(undefined)}>{restoreResult ? <div className="restore-complete"><div className="success-mark">✓</div><h3>{restoreResult.organization} was restored</h3><p>A full safety backup was created first and remains available on this server.</p><Definition label="Safety backup" value={restoreResult.safetyBackupFileName} /><Definition label="Media" value={restoreResult.mediaRestored ? "Restored from the archive" : "Existing server media preserved"} /><p className="settings-copy">This server kept its {restoreResult.preservedServerSettings.join(", ")}.</p><button className="button primary wide" onClick={() => location.reload()}>Reload restored LessonCue</button></div> : <div className="restore-review"><div className="restore-heading"><div><span>{restorePreview.kind.toUpperCase()} BACKUP</span><h3>{restorePreview.organization}</h3><p>{restorePreview.fileName}</p></div><strong>{formatBytes(restorePreview.compressedBytes)}</strong></div><div className="restore-counts"><Definition label="Users" value={String(restorePreview.users)} /><Definition label="Classes" value={String(restorePreview.classes)} /><Definition label="Lessons" value={String(restorePreview.lessons)} /><Definition label="Media records" value={String(restorePreview.mediaRecords)} /></div>{restorePreview.warnings.map(warning => <div className="alert" key={warning}>{warning}</div>)}<div className="danger-callout"><strong>This replaces current LessonCue data.</strong><p>LessonCue creates a full safety backup before changing anything. The receiving server's identity, keys, network address, port, and pairing secrets remain unchanged.</p></div><Field label="Type RESTORE to continue"><input value={restoreConfirmation} onChange={e => setRestoreConfirmation(e.target.value)} autoComplete="off" /></Field><button className="button danger wide" onClick={restoreBackup} disabled={restoreBusy || restoreConfirmation !== "RESTORE"}>{restoreBusy ? "Restoring…" : "Create safety backup and restore"}</button></div>}</Modal>}
    <div className="settings-grid"><section className="panel wide-settings update-settings settings-panel settings-system"><div className="settings-heading"><div><span className="settings-kicker">SYSTEM MAINTENANCE</span><h2>Software updates</h2><p className="settings-copy">LessonCue checks once each day and alerts administrators when a newer release is available.</p></div><span className={`update-state ${bootstrap.update.updateAvailable ? "available" : "current"}`}>{bootstrap.update.updateAvailable ? "Update available" : "Up to date"}</span></div><div className="storage-facts"><Definition label="Installed version" value={bootstrap.update.currentVersion} /><Definition label="Latest version" value={bootstrap.update.latestVersion || "Not checked yet"} /><Definition label="Last checked" value={bootstrap.update.lastCheckedAt ? timeAgo(bootstrap.update.lastCheckedAt) : "Not checked yet"} /></div>{bootstrap.update.error && <div className="alert error">{bootstrap.update.error}</div>}<div className="head-actions"><button className="button" onClick={checkUpdates} disabled={!canUpdates || checking}>{checking ? "Checking…" : "Check now"}</button>{canUpdates && bootstrap.update.updateAvailable && bootstrap.update.automaticInstallSupported && <button className="button primary" onClick={installUpdate} disabled={installing}>{installing ? "Installing…" : `Install ${bootstrap.update.latestVersion}`}</button>}{bootstrap.update.releaseUrl && <a className="button" href={bootstrap.update.releaseUrl} target="_blank" rel="noreferrer">Release notes</a>}</div>{!canUpdates && <p className="settings-copy">An account with software-update permission controls update checks and installation.</p>}{!bootstrap.update.automaticInstallSupported && <p className="settings-copy">Run the current release installer once from SSH to enable automatic updates on this server.</p>}</section>
      <section className="panel wide-settings settings-panel settings-accounts"><h2>Organization & appearance</h2><p className="settings-copy">Manage organization defaults, controller access, and every interface color together.</p><form className="stack" onSubmit={saveOrganization}><div className="two-fields"><Field label="Organization"><input name="name" defaultValue={o.name} disabled={!canManage} required /></Field><Field label="Site"><input name="siteName" defaultValue={o.siteName} disabled={!canManage} required /></Field></div><div className="two-fields"><Field label="Time zone"><input name="timeZone" defaultValue={o.timeZone} disabled={!canManage} required /></Field><Field label="Week starts"><select name="weekStartsOn" defaultValue={o.weekStartsOn} disabled={!canManage}><option>Sunday</option><option>Monday</option></select></Field></div><Field label="Welcome message"><input name="welcomeMessage" defaultValue={o.welcomeMessage} disabled={!canManage} /></Field><div className="two-fields"><Field label="Default lesson minutes"><input name="defaultLessonDurationMinutes" type="number" min="5" max="480" defaultValue={o.defaultLessonDurationMinutes} disabled={!canManage} /></Field><Field label="Archive retention days"><input name="defaultRetentionDays" type="number" min="1" max="3650" defaultValue={o.defaultRetentionDays} disabled={!canManage} /></Field></div><div className="settings-subsection"><h3>Room controller access</h3><label className="check-row"><input name="requireLocalRoomControllers" type="checkbox" defaultChecked={o.requireLocalRoomControllers} disabled={!canManage} /> Require non-administrator room remotes to use the local .local address</label><p>When enabled, room and temporary controllers used by Editors or Viewers are rejected on public hostnames. Owners and Administrators can still troubleshoot remotely.</p></div><div className="settings-subsection"><h3>Interface colors</h3><p>Choose the navigation background, general accent, navigation text, and selected-tab colors in one place.</p><div className="color-fields"><Field label="Navigation background"><input name="primaryColor" type="color" defaultValue={o.primaryColor} disabled={!canManage} /></Field><Field label="Accent color"><input name="accentColor" type="color" defaultValue={o.accentColor} disabled={!canManage} /></Field><Field label="Navigation text"><input name="navigationTextColor" type="color" defaultValue={o.navigationTextColor} disabled={!canManage} /></Field><Field label="Selected navigation tab"><input name="selectedTabColor" type="color" defaultValue={o.selectedTabColor} disabled={!canManage} /></Field></div></div>{canManage && <button className="button primary">Save organization & appearance</button>}</form></section>
      <section className="panel wide-settings"><div className="settings-heading"><div><span className="settings-kicker">MEDIA LIBRARY</span><h2>Approved folders & tags</h2><p className="settings-copy">Give uploaders a consistent organization system. Folder paths may use / for hierarchy; enter one folder or tag per line.</p></div><span className="update-state current">{bootstrap.mediaTaxonomy.folders.length} folders · {bootstrap.mediaTaxonomy.tags.length} tags</span></div>{canManage ? <form className="stack" onSubmit={saveMediaTaxonomy}><div className="two-fields taxonomy-settings"><Field label="Approved folder paths" hint="Examples: Elementary/Science or Main Campus/Events"><textarea rows={7} value={mediaFolders} onChange={event => setMediaFolders(event.target.value)} placeholder={"General\nLessons\nSignage"} /></Field><Field label="Approved tags" hint="Each tag may be up to 40 characters."><textarea rows={7} value={mediaTags} onChange={event => setMediaTags(event.target.value)} placeholder={"Reusable\nIntro\nReference"} /></Field></div><div className="alert">A folder or tag that is already assigned to media cannot be removed until those items are reassigned.</div><button className="button primary">Save approved folders & tags</button></form> : <p className="settings-copy">An account with server-settings permission controls the approved media organization.</p>}</section>
      <section className="panel"><h2>Storage allocation</h2><div className="storage-facts"><Definition label="LessonCue is using" value={formatBytes(bootstrap.storage.usedBytes)} /><Definition label="Available on computer" value={formatBytes(bootstrap.storage.diskAvailableBytes)} /><Definition label="Available for uploads" value={formatBytes(bootstrap.storage.remainingBytes)} /></div><StorageMeter storage={bootstrap.storage} />{canManage ? <form className="stack storage-form" onSubmit={saveStorage}><label className="check-row"><input type="checkbox" checked={automaticStorage} onChange={e => setAutomaticStorage(e.target.checked)} /> Adjust allocation automatically</label><Field label="Maximum LessonCue storage" hint={`Must be between ${formatBytes(bootstrap.storage.usedBytes)} and ${formatBytes(bootstrap.storage.maximumAllocationBytes)}. LessonCue keeps 512 MB free for the operating system.`}><div className="number-suffix"><input type="number" min={Math.max(.1, bootstrap.storage.usedBytes / 1024 ** 3)} max={bootstrap.storage.maximumAllocationBytes / 1024 ** 3} step="0.1" value={allocationGb} onChange={e => setAllocationGb(e.target.value)} disabled={automaticStorage} required={!automaticStorage} /><span>GB</span></div></Field><button className="button primary">Save storage limit</button></form> : <p className="settings-copy">An administrator controls the upload allocation.</p>}</section>
      <section className="panel"><div className="settings-heading"><div><h2>Adaptive TV playback</h2><p className="settings-copy">LessonCue prepares reusable, validated 720p and 480p H.264 copies and automatically falls back to software if hardware conversion fails.</p></div><span className={`update-state ${bootstrap.hardwareAcceleration.available && hardwareAcceleration ? "current" : ""}`}>{bootstrap.hardwareAcceleration.available && hardwareAcceleration ? "Hardware ready" : "Software ready"}</span></div><div className="storage-facts"><Definition label="Conversion engine" value={bootstrap.hardwareAcceleration.available && hardwareAcceleration ? bootstrap.hardwareAcceleration.engine : "Software (libx264)"} />{bootstrap.hardwareAcceleration.device && <Definition label="Hardware device" value={bootstrap.hardwareAcceleration.device} />}<Definition label="Hardware checked" value={bootstrap.hardwareAcceleration.lastCheckedAt ? timeAgo(bootstrap.hardwareAcceleration.lastCheckedAt) : "Starting check"} />{bootstrap.hardwareAcceleration.lastHardwareUseAt && <Definition label="Last hardware use" value={timeAgo(bootstrap.hardwareAcceleration.lastHardwareUseAt)} />}</div><p className="settings-copy">{bootstrap.hardwareAcceleration.message}</p>{bootstrap.hardwareAcceleration.lastError && <div className="alert">Most recent hardware fallback: {bootstrap.hardwareAcceleration.lastError}</div>}{canManage ? <form className="stack" onSubmit={saveAdaptiveTranscoding}><label className="check-row"><input type="checkbox" checked={hardwareAcceleration && bootstrap.hardwareAcceleration.available} onChange={e => setHardwareAcceleration(e.target.checked)} disabled={!bootstrap.hardwareAcceleration.available} /> Use Intel hardware encoding when available</label><label className="check-row"><input type="checkbox" checked={adaptiveTranscoding} onChange={e => setAdaptiveTranscoding(e.target.checked)} /> Prepare adaptive copies automatically</label><Field label="Guaranteed lead time" hint="Idle capacity starts preparing new uploads immediately. This setting ensures assigned lesson media is prioritized no later than the selected number of days before class."><div className="number-suffix"><input type="number" min="1" max="30" step="1" value={transcodeLeadDays} onChange={e => setTranscodeLeadDays(e.target.value)} disabled={!adaptiveTranscoding} required /><span>days</span></div></Field><div className="head-actions"><button className="button primary">Save playback profiles</button><button className="button" type="button" onClick={checkHardware} disabled={checkingHardware}>{checkingHardware ? "Checking…" : "Check hardware"}</button></div></form> : <><Definition label="Hardware acceleration" value={o.hardwareAccelerationEnabled && bootstrap.hardwareAcceleration.available ? "On" : "Off"} /><Definition label="Automatic preparation" value={o.adaptiveTranscodingEnabled ? "On" : "Off"} /><Definition label="Guaranteed lead time" value={`${o.transcodeLeadDays} days`} /></>}</section>
      <section className="panel"><h2>Connection & pairing</h2><Definition label="Browser address" value={`${location.protocol}//${location.host}`} /><Definition label="Preferred local address" value={bootstrap.httpPort.address} /><Definition label="HTTP port" value={String(bootstrap.httpPort.port)} /><Definition label="Server name" value={bootstrap.serverName} /><Definition label="Server ID" value={bootstrap.serverId} mono />{(bootstrap.localAddress.pending || bootstrap.httpPort.pending) && <div className="alert">The new connection setting is being applied. The previous address may remain available briefly.</div>}{bootstrap.localAddress.error && <p className="settings-copy">{bootstrap.localAddress.error}</p>}{bootstrap.httpPort.error && <p className="settings-copy">{bootstrap.httpPort.error}</p>}{canManage && bootstrap.httpPort.configurable && <form className="stack pairing-form" onSubmit={saveHttpPort}><Field label="Browser port" hint="Port 80 is the default and does not need to be typed in the browser address. If a tunnel is enabled, update its published application route after changing this port."><input type="number" min="1" max="65535" step="1" value={httpPort} onChange={e => setHttpPort(e.target.value)} inputMode="numeric" required /></Field><button className="button primary">Save browser port</button></form>}{canManage && bootstrap.localAddress.supported && <form className="stack pairing-form" onSubmit={saveLocalAddress}><Field label="Local browser name" hint="Use letters, numbers, or hyphens. Devices on this network will open this name with .local appended."><div className="number-suffix domain-suffix"><input value={localHostname} onChange={e => setLocalHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 63))} pattern="[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?" minLength={1} maxLength={63} required autoComplete="off" /><span>.local</span></div></Field><button className="button primary">Save local address</button></form>}<Definition label="Current pairing PIN" value={bootstrap.pairingPin || "Restricted"} mono />{canManage ? <form className="stack pairing-form" onSubmit={savePairingPin}><label className="check-row"><input type="checkbox" checked={fixedPairing} onChange={e => setFixedPairing(e.target.checked)} /> Use a fixed local PIN</label><Field label="Six-digit pairing PIN" hint={fixedPairing ? "This PIN remains active until an administrator changes it." : "Automatic mode creates a new PIN every ten minutes."}><input value={pairingPin} onChange={e => setPairingPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} disabled={!fixedPairing} required={fixedPairing} autoComplete="off" /></Field><button className="button primary">Save pairing mode</button></form> : <p className="settings-copy">{bootstrap.pairingFixed ? "An administrator has configured a fixed local PIN." : "The pairing PIN rotates automatically every ten minutes."}</p>}</section>
      <section className="panel"><h2>Universal controller</h2><Definition label="Address" value={`${location.origin}/universalremote`} /><Definition label="PIN protection" value={bootstrap.controllerPinConfigured ? "Configured" : "PIN not set"} /><p className="settings-copy">The universal remote can operate every paired classroom. Its PIN is separate from account passwords and TV pairing.</p>{canManage ? <form className="stack pairing-form" onSubmit={saveControllerPin}><Field label={bootstrap.controllerPinConfigured ? "New six-digit PIN" : "Six-digit PIN"}><input value={controllerPin} onChange={event => setControllerPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="new-password" /></Field><button className="button primary">{bootstrap.controllerPinConfigured ? "Change controller PIN" : "Set controller PIN"}</button></form> : <p className="settings-copy">An account with server-settings permission controls this PIN.</p>}</section>
      <section className="panel wide-settings cloudflare-settings"><div className="settings-heading"><div><h2>Optional remote access</h2><p className="settings-copy">Connect this self-hosted server to your own domain with a remotely managed Cloudflare Tunnel. Local access keeps working and remains the default.</p></div><span className={`tunnel-state ${bootstrap.cloudflareTunnel.connected ? "connected" : bootstrap.cloudflareTunnel.enabled ? "waiting" : ""}`}>{bootstrap.cloudflareTunnel.connected ? `${bootstrap.cloudflareTunnel.activeConnections} edge connections` : bootstrap.cloudflareTunnel.pending ? "Applying…" : bootstrap.cloudflareTunnel.enabled ? "Waiting for connection" : "Off"}</span></div><div className="storage-facts"><Definition label="Public address" value={bootstrap.cloudflareTunnel.publicUrl || "Not configured"} /><Definition label="Local origin route" value={bootstrap.cloudflareTunnel.originUrl} /><Definition label="Connector version" value={bootstrap.cloudflareTunnel.cloudflaredVersion || "Preparing verified connector"} /><Definition label="Connector verified" value={bootstrap.cloudflareTunnel.cloudflaredCheckedAt ? timeAgo(bootstrap.cloudflareTunnel.cloudflaredCheckedAt) : "Pending first check"} /></div>{bootstrap.cloudflareTunnel.cloudflaredUpdateError && <div className="alert error">Connector update: {bootstrap.cloudflareTunnel.cloudflaredUpdateError}</div>}{bootstrap.cloudflareTunnel.error && <div className="alert error">{bootstrap.cloudflareTunnel.error}</div>}<ol className="tunnel-steps"><li>Create a <a href="https://one.dash.cloudflare.com/" target="_blank" rel="noreferrer">remotely managed tunnel in Cloudflare</a>.</li><li>Add a published application hostname and point its service to <code>{bootstrap.cloudflareTunnel.originUrl}</code>.</li><li>Protect the hostname with Cloudflare Access, then paste its tunnel token below. LessonCue keeps a checksum-verified connector ready and checks it daily.</li></ol>{canManage ? <form className="stack" onSubmit={saveCloudflareTunnel}><label className="check-row"><input type="checkbox" checked={tunnelEnabled} onChange={e => setTunnelEnabled(e.target.checked)} disabled={!bootstrap.cloudflareTunnel.supported || tunnelBusy} /> Enable Cloudflare Tunnel remote access</label>{tunnelEnabled && <><Field label="Public hostname" hint="Use the exact published application hostname configured in Cloudflare."><input value={tunnelHostname} onChange={e => setTunnelHostname(e.target.value.trim().toLowerCase())} type="text" inputMode="url" placeholder="lesson.example.org" required autoComplete="off" /></Field><Field label={bootstrap.cloudflareTunnel.credentialConfigured ? "Replace tunnel token (optional)" : "Tunnel token"} hint="Paste the eyJ… token or Cloudflare's complete cloudflared service install command. LessonCue never returns this secret to the browser."><input value={tunnelToken} onChange={e => setTunnelToken(e.target.value)} type="password" required={!bootstrap.cloudflareTunnel.credentialConfigured} autoComplete="new-password" /></Field><label className="check-row security-confirm"><input type="checkbox" checked={tunnelAcknowledged} onChange={e => setTunnelAcknowledged(e.target.checked)} required /> I configured Cloudflare Access, or I understand this exposes the LessonCue sign-in page to the internet.</label></>}<button className={`button ${tunnelEnabled ? "primary" : "danger"}`} disabled={tunnelBusy || bootstrap.cloudflareTunnel.pending || !bootstrap.cloudflareTunnel.supported}>{tunnelBusy ? "Applying…" : tunnelEnabled ? bootstrap.cloudflareTunnel.enabled ? bootstrap.cloudflareTunnel.connected ? "Update tunnel" : "Retry tunnel connection" : "Install and enable tunnel" : "Disable tunnel"}</button></form> : <p className="settings-copy">An account with server-settings permission controls remote access.</p>}<p className="settings-copy">The connector runs as a restricted local service and uses an outbound-only connection. Disable it here to stop the service and remove its stored credential; the verified connector remains cached for later use and security updates.</p></section>
      {canSettings && <section className="panel wide-settings"><div className="settings-heading"><div><h2>Recycling bin</h2><p className="settings-copy">Deleted classes, lessons, and media remain recoverable for 30 days. Recycled media still uses storage until it is purged.</p></div>{recycleItems.length > 0 && <button className="button danger" onClick={purgeRecycleBin}>Purge all</button>}</div>{recycleItems.length ? <div className="recycle-list">{recycleItems.map(item => <div key={`${item.kind}-${item.id}`}><span className="recycle-kind">{item.kind}</span><span><strong>{item.title}</strong><small>{item.detail} · deleted {timeAgo(item.deletedAt)}{item.deletedBy ? ` by ${item.deletedBy}` : ""}</small></span><span><small>Purges {new Date(new Date(item.deletedAt).getTime() + 30 * 86400000).toLocaleDateString()}</small><button className="button" onClick={() => restoreRecycleItem(item)}>Restore</button></span></div>)}</div> : <Empty title="Recycling bin is empty" body="Deleted classes, lessons, and media will appear here for 30 days." />}</section>}
      <section className="panel"><h2>Privacy & backups</h2><div className="privacy-callout"><span>⌂</span><div><strong>{bootstrap.cloudflareTunnel.enabled ? "Local-first with optional remote access" : "Fully local"}</strong><p>The interface, database, accounts, schedules, and media live on this server. {bootstrap.cloudflareTunnel.enabled ? "Cloudflare carries encrypted requests to this local origin; it does not become LessonCue's data store." : "No hosted service is required."}</p></div></div>{canBackups && <><div className="backup-actions"><button className="button" onClick={() => backup(false)}>Back up settings</button><button className="button primary" onClick={() => backup(true)}>Full backup</button></div><form className="backup-restore-upload" onSubmit={previewBackupRestore}><label><span>Restore a LessonCue backup</span><input name="file" type="file" accept=".zip,application/zip" required disabled={restoreBusy} /></label><button className="button" disabled={restoreBusy}>{restoreBusy ? "Validating…" : "Validate and preview"}</button></form></>}{!canBackups && <p className="settings-copy">An account with backup permission controls backup creation, download, and restore.</p>}{backups.slice(0, 4).map(item => <a className="backup-row" href={`/api/v1/backups/${item.id}/file`} key={item.id}><span>{item.kind} · {formatBytes(item.sizeBytes)}</span><small>{new Date(item.createdAt).toLocaleString()}</small></a>)}</section><section className="panel"><h2>Recent activity</h2><div className="audit-list">{audit.slice(0, 8).map(item => <div key={item.id}><span>{item.action.replaceAll(".", " ")}</span><small>{item.actor} · {timeAgo(item.timestamp)}</small></div>)}</div></section><section className="panel"><h2>Server commands</h2><pre>sudo systemctl status lessoncue{`\n`}sudo journalctl -u lessoncue -f{`\n`}sudo systemctl restart lessoncue{bootstrap.cloudflareTunnel.enabled ? `\n\nsudo systemctl status lessoncue-cloudflared\nsudo journalctl -u lessoncue-cloudflared -f` : ""}</pre></section></div>
    </div>
  </>;
}

function TimelineEditor({ media, item, onSave }: { media?: Media; item: PlaylistItem; onSave: (changes: Record<string, unknown>) => void | Promise<void> }) {
  const duration = Math.max(.04, (media?.durationMs || item.mediaDurationMs || item.durationMs || 1_000) / 1000);
  const [start, setStart] = useState(Math.min(duration, item.startMs / 1000));
  const [end, setEnd] = useState(Math.min(duration, (item.endMs || media?.durationMs || item.mediaDurationMs || item.durationMs || 1_000) / 1000));
  const [fadeIn, setFadeIn] = useState((item.fadeInMs || 0) / 1000);
  const [fadeOut, setFadeOut] = useState((item.fadeOutMs || 0) / 1000);
  const [markers, setMarkers] = useState<CuePoint[]>(() => cuePoints(item));
  const [markerName, setMarkerName] = useState("");
  const [cursor, setCursor] = useState(Math.min(duration, item.startMs / 1000));
  const [visualFadeOpacity, setVisualFadeOpacity] = useState(fadeIn > 0 ? 1 : 0);
  const player = useRef<HTMLMediaElement>(null);
  const source = media?.playbackUrl || media?.downloadUrl;
  const startPercent = start / duration * 100;
  const endPercent = end / duration * 100;
  function seek(value: number, edge: "start" | "end") {
    const next = Math.round(value * 25) / 25;
    const nextStart = edge === "start" ? Math.min(next, end - .04) : start;
    const nextEnd = edge === "end" ? Math.max(next, start + .04) : end;
    setStart(nextStart); setEnd(nextEnd);
    const selection = Math.max(.04, nextEnd - nextStart);
    setFadeIn(current => Math.min(current, selection)); setFadeOut(current => Math.min(current, selection));
    const previewPosition = edge === "start" ? Math.min(next, end - .04) : start;
    setCursor(previewPosition);
    if (player.current) player.current.currentTime = previewPosition;
  }
  function updatePreview(element: HTMLMediaElement) {
    const position = element.currentTime;
    setCursor(position);
    if (position >= end) { element.pause(); element.currentTime = start; return; }
    const intoSelection = position - start;
    const remaining = end - position;
    const fade = Math.min(fadeIn ? intoSelection / fadeIn : 1, fadeOut ? remaining / fadeOut : 1, 1);
    element.volume = Math.max(0, Math.min(1, item.volumePercent / 100 * fade));
    setVisualFadeOpacity(1 - Math.max(0, Math.min(1, fade)));
  }
  function jumpToMarker(marker: CuePoint) {
    const position = Math.max(start, Math.min(end, marker.positionMs / 1000));
    setCursor(position);
    if (player.current) player.current.currentTime = position;
  }
  function addMarker() {
    const name = markerName.trim() || `Marker ${markers.length + 1}`;
    const positionMs = Math.round(Math.max(start, Math.min(end, cursor)) * 1000);
    setMarkers(current => [...current, { name, positionMs }].sort((a, b) => a.positionMs - b.positionMs));
    setMarkerName("");
  }
  if (!media || !source || (!media.contentType.startsWith("video/") && !media.contentType.startsWith("audio/"))) return <MediaPreview media={media} item={item} />;
  return <section className="timeline-editor">
    <div className="timeline-player">{media.contentType.startsWith("video/") ? <><video ref={player as React.RefObject<HTMLVideoElement>} src={source} controls playsInline onLoadedMetadata={e => { e.currentTarget.currentTime = start; updatePreview(e.currentTarget); }} onTimeUpdate={e => updatePreview(e.currentTarget)} /><span className="visual-fade-overlay" style={{ opacity: visualFadeOpacity }} /></> : <audio ref={player as React.RefObject<HTMLAudioElement>} src={source} controls onLoadedMetadata={e => { e.currentTarget.currentTime = start; }} onTimeUpdate={e => updatePreview(e.currentTarget)} />}</div>
    <div className="timeline-art" aria-label="Media filmstrip, waveform, selected playback area, fade regions, and cue markers">{media.filmstripUrl && <img src={media.filmstripUrl} alt="Video filmstrip" />}{media.waveformUrl && <img className="waveform" src={media.waveformUrl} alt="Audio waveform" />}<i className="trim-before" style={{ width: `${startPercent}%` }} /><i className="trim-after" style={{ left: `${endPercent}%` }} /><span className="selection" style={{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }} />{fadeIn > 0 && <span className="fade-zone fade-in" style={{ left: `${startPercent}%`, width: `${fadeIn / duration * 100}%` }}>FADE IN</span>}{fadeOut > 0 && <span className="fade-zone fade-out" style={{ left: `${Math.max(startPercent, endPercent - fadeOut / duration * 100)}%`, width: `${fadeOut / duration * 100}%` }}>FADE OUT</span>}{markers.map((marker, index) => <button type="button" className="timeline-marker" style={{ left: `${Math.min(100, marker.positionMs / 1000 / duration * 100)}%` }} title={`${marker.name} · ${formatPreciseTime(marker.positionMs / 1000)}`} aria-label={`Jump preview to ${marker.name}`} onClick={() => jumpToMarker(marker)} key={`${marker.positionMs}-${index}`}><span /></button>)}</div>
    <div className="timeline-rulers"><label>In <strong>{formatPreciseTime(start)}</strong><input type="range" min="0" max={duration} step="0.04" value={start} onChange={e => seek(Number(e.target.value), "start")} /></label><label>Out <strong>{formatPreciseTime(end)}</strong><input type="range" min="0.04" max={duration} step="0.04" value={end} onChange={e => seek(Number(e.target.value), "end")} /></label></div>
    <div className="timeline-fades"><Field label={`Fade in · ${fadeIn.toFixed(1)}s`}><input type="range" min="0" max={Math.min(30, end - start)} step="0.1" value={fadeIn} onChange={e => setFadeIn(Number(e.target.value))} /></Field><Field label={`Fade out · ${fadeOut.toFixed(1)}s`}><input type="range" min="0" max={Math.min(30, end - start)} step="0.1" value={fadeOut} onChange={e => setFadeOut(Number(e.target.value))} /></Field></div>
    <section className="marker-editor"><div><Field label={`New marker at ${formatPreciseTime(cursor)}`}><input value={markerName} maxLength={80} placeholder={`Marker ${markers.length + 1}`} onChange={e => setMarkerName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addMarker(); } }} /></Field><button type="button" className="button" onClick={addMarker} disabled={markers.length >= 50}>＋ Add at playhead</button></div>{markers.length ? <div className="marker-list" aria-label="Named cue markers">{markers.map((marker, index) => <div key={`${marker.positionMs}-${index}`}><button type="button" className="marker-time" onClick={() => jumpToMarker(marker)} aria-label={`Preview ${marker.name}`}>{formatPreciseTime(marker.positionMs / 1000)}</button><input value={marker.name} maxLength={80} aria-label={`Name for marker at ${formatPreciseTime(marker.positionMs / 1000)}`} onChange={e => setMarkers(current => current.map((value, position) => position === index ? { ...value, name: e.target.value } : value))} /><button type="button" className="marker-delete" aria-label={`Delete ${marker.name || "marker"}`} onClick={() => setMarkers(current => current.filter((_, position) => position !== index))}>×</button></div>)}</div> : <small>No named markers yet. Play or scrub to a useful moment, then add one.</small>}</section>
    <div className="timeline-actions"><button className="button" onClick={() => { if (player.current) { player.current.currentTime = start; setCursor(start); void player.current.play(); } }}>▶ Preview selection</button><button className="button primary" onClick={() => onSave({ startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), fadeInMs: Math.round(fadeIn * 1000), fadeOutMs: Math.round(fadeOut * 1000), cuePoints: markers.map(marker => ({ name: marker.name.trim(), positionMs: marker.positionMs })).filter(marker => marker.name) })}>Save timeline and markers</button></div>
    <small>Drag the In/Out and Fade sliders while watching the filmstrip or waveform. Arrow keys nudge a focused trim handle by one 0.04-second frame step. Dark shading will not play; gold regions fade both audio and picture to or from black.</small>
  </section>;
}

function MediaPreview({ media, item }: { media?: Media; item?: PlaylistItem }) {
  const player = useRef<HTMLMediaElement>(null);
  const [positionMs, setPositionMs] = useState(item?.startMs || 0);
  const startMs = item?.startMs || 0;
  const requestedEnd = item?.endMs;
  const fadeInMs = item?.fadeInMs || 0;
  const fadeOutMs = item?.fadeOutMs || 0;
  const [visualFadeOpacity, setVisualFadeOpacity] = useState(fadeInMs > 0 ? 1 : 0);
  const targetVolume = Math.min(1, (item?.volumePercent ?? 100) / 100);
  const source = media?.sourceKind === "link" ? media.sourceUrl : media?.playbackUrl || media?.downloadUrl;
  const online = media?.linkKind === "youtube" || media?.linkKind === "embedded" || media?.linkKind === "webpage";
  const frameSource = media?.linkKind === "youtube" ? youtubeEmbedUrl(source) || source : source;
  useEffect(() => {
    const element = player.current; if (!element) return;
    const timer = window.setInterval(() => {
      const current = Math.max(0, element.currentTime * 1000); setPositionMs(current);
      const actualEnd = requestedEnd || (Number.isFinite(element.duration) ? element.duration * 1000 : undefined);
      const fadeIn = fadeInMs ? Math.min(1, Math.max(0, (current - startMs) / fadeInMs)) : 1;
      const fadeOut = fadeOutMs && actualEnd ? Math.min(1, Math.max(0, (actualEnd - current) / fadeOutMs)) : 1;
      const fade = Math.min(fadeIn, fadeOut);
      element.volume = targetVolume * fade;
      setVisualFadeOpacity(1 - fade);
      if (requestedEnd && current >= requestedEnd) {
        if (item?.endBehavior === "loop") { element.currentTime = startMs / 1000; void element.play(); }
        else element.pause();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [fadeInMs, fadeOutMs, item?.endBehavior, requestedEnd, startMs, targetVolume]);
  if (!media) return <div className="preview-unavailable"><strong>Media unavailable</strong><p>This playlist entry no longer has a media file attached.</p></div>;
  if (media.processingStatus !== "ready") return <div className="preview-unavailable"><strong>{media.processingStatus === "failed" ? "Preview failed" : "Media is still processing"}</strong><p>{media.processingError || "Preview will be available when processing finishes."}</p></div>;
  if (!source) return <div className="preview-unavailable"><strong>No preview source</strong><p>The file is not currently available from this server.</p></div>;
  const mediaElement = media.contentType.startsWith("video") ? <video ref={player as React.RefObject<HTMLVideoElement>} src={source} controls autoPlay playsInline onLoadedMetadata={event => { event.currentTarget.currentTime = startMs / 1000; }} />
    : media.contentType.startsWith("audio") ? <div className="audio-preview"><div>♫</div><audio ref={player as React.RefObject<HTMLAudioElement>} src={source} controls autoPlay onLoadedMetadata={event => { event.currentTarget.currentTime = startMs / 1000; }} /></div>
    : media.contentType.startsWith("image") ? <img src={source} alt={media.fileName} />
    : media.contentType.includes("pdf") ? <object data={source} type="application/pdf"><a href={source} target="_blank" rel="noreferrer">Open PDF preview</a></object>
    : isConvertibleDocument(media) ? <div className="document-preview"><span>▤</span><strong>{media.fileName}</strong><p>Convertible document · {formatBytes(media.sizeBytes)}</p><a className="button" href={source} target="_blank" rel="noreferrer">Open document</a></div>
    : online ? <iframe src={frameSource} title={media.fileName} allow="autoplay; fullscreen" />
    : <iframe src={source} title={media.fileName} />;
  return <div className="media-preview"><div className="preview-stage">{mediaElement}{media.contentType.startsWith("video") && item && <span className="visual-fade-overlay" style={{ opacity: visualFadeOpacity }} />}{item?.notes && <div className="preview-notes">{item.notes}</div>}</div>{item && <div className="preview-readout"><span>Position <strong>{formatDuration(positionMs)}</strong></span><span>Trim <strong>{formatDuration(startMs)} → {requestedEnd ? formatDuration(requestedEnd) : "media end"}</strong></span><span>Fades <strong>{(fadeInMs / 1000).toFixed(1)}s in · {(fadeOutMs / 1000).toFixed(1)}s out</strong></span><span>Volume <strong>{item.volumePercent}%</strong></span></div>}{online && <a className="preview-open" href={source} target="_blank" rel="noreferrer">Open original page ↗</a>}</div>;
}

function formTags(form: FormData) { return form.getAll("tags").map(value => String(value)).join(", "); }
function TaxonomyFields({ taxonomy, folder = "", tagsCsv = "" }: { taxonomy: MediaTaxonomy; folder?: string; tagsCsv?: string }) {
  const selected = new Set(tagsCsv.split(",").map(tag => tag.trim().toLowerCase()).filter(Boolean));
  const folders = taxonomy.folders.includes(folder) || !folder ? taxonomy.folders : [...taxonomy.folders, folder].sort((a, b) => a.localeCompare(b));
  const tags = [...taxonomy.tags];
  for (const tag of tagsCsv.split(",").map(value => value.trim()).filter(Boolean)) if (!tags.some(value => value.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  return <div className="two-fields taxonomy-fields"><Field label="Folder" hint="Administrators define the available library folders."><select name="folder" defaultValue={folder}><option value="">Unfiled</option>{folders.map(value => <option value={value} key={value}>{value}</option>)}</select></Field><fieldset className="taxonomy-tags"><legend>Tags</legend>{tags.length ? <div>{tags.map(tag => <label key={tag}><input type="checkbox" name="tags" value={tag} defaultChecked={selected.has(tag.toLowerCase())} /><span>{tag}</span></label>)}</div> : <small>No approved tags are configured.</small>}<small>Choose any administrator-approved tags that apply.</small></fieldset></div>;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function RetentionChoices({ lessonDate }: { lessonDate: string }) { return <fieldset className="retention-options"><legend>How long should LessonCue keep this file?</legend><label><input type="radio" name="storagePolicy" value="lesson" defaultChecked /><span><strong>For this lesson (default)</strong><small>Delete automatically on {formatDateAfterDays(lessonDate, 28)}.</small></span></label><label><input type="radio" name="storagePolicy" value="persistent" /><span><strong>Keep permanently</strong><small>Make it reusable for future lessons.</small></span></label></fieldset>; }
function Stat({ label, value, sub, mono }: { label: string; value: string | number; sub: string; mono?: boolean }) { return <div className="stat-card"><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong><small>{sub}</small></div>; }
function PanelTitle({ title, action, onClick }: { title: string; action: string; onClick: () => void }) { return <div className="panel-title"><h2>{title}</h2><button onClick={onClick}>{action} →</button></div>; }
function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) { return <div className="empty"><div>◇</div><strong>{title}</strong><p>{body}</p>{action}</div>; }
function DateBadge({ date }: { date: string }) { const d = new Date(`${date}T12:00:00`); return <span className="date-badge"><b>{d.toLocaleDateString(undefined, { month: "short" })}</b><strong>{d.getDate()}</strong></span>; }
function Status({ online }: { online: boolean }) { return <span className={`status ${online ? "online" : "offline"}`}><i />{online ? "Online" : "Offline"}</span>; }
function RoleSummary({ items }: { items: PlaylistItem[] }) { const pre = items.filter(i => i.role === "preRoll").length; const countdown = items.some(i => i.role === "countdown"); return <span className="role-summary">{pre > 0 && <i>Pre-roll ×{pre}</i>}{countdown && <i>Countdown</i>}</span>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { const heading = `dialog-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`; return <div className="modal-backdrop" onMouseDown={e => e.currentTarget === e.target && onClose()} onKeyDown={e => e.key === "Escape" && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-labelledby={heading}><div className="modal-title"><h2 id={heading}>{title}</h2><button onClick={onClose} aria-label="Close dialog">×</button></div>{children}</div></div>; }
function Definition({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div className="definition"><span>{label}</span><strong className={mono ? "mono small" : ""}>{value}</strong></div>; }
function StorageMeter({ storage }: { storage: StorageStatus }) { const percent = storage.allocationBytes > 0 ? Math.min(100, storage.usedBytes / storage.allocationBytes * 100) : 0; return <div className="storage-meter" role="progressbar" aria-label="LessonCue storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div>; }

function dayPart() { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; }
function formatDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }
function formatDateAfterDays(date: string, days: number) { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); }
function formatShortDate(value: string) { return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function dateInputValue(value?: string, addDays = 0) { if (value) return value.slice(0, 10); const date = new Date(); if (addDays) date.setDate(date.getDate() + addDays); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function minutesFromTime(value: string) { if (!/^\d{2}:\d{2}$/.test(value)) return null; const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }
function timeFromMinutes(value?: number) { if (value == null || value < 0 || value > 1439) return ""; return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function parseDateList(value: string) { return [...new Set(value.split(/[\s,;]+/).map(item => item.trim()).filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item)))]; }
function parseStoredDates(value: string) { try { const dates = JSON.parse(value); return Array.isArray(dates) ? dates.filter(item => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item)).sort() : []; } catch { return []; } }
function schedulePayload(schedule: RecurringSchedule, enabled = schedule.enabled) { return { templateId: schedule.templateId, classId: schedule.classId, name: schedule.name, frequency: schedule.frequency, interval: schedule.interval, dayOfWeek: schedule.dayOfWeek ?? null, dayOfMonth: schedule.dayOfMonth ?? null, startDate: schedule.startDate, endDate: schedule.endDate || null, startMinutes: schedule.startMinutes ?? null, titlePattern: schedule.titlePattern, customDates: parseStoredDates(schedule.customDatesJson), excludedDates: parseStoredDates(schedule.excludedDatesJson), enabled, generateDaysAhead: schedule.generateDaysAhead }; }
function scheduleSummary(schedule: RecurringSchedule) { if (schedule.frequency === "custom") return `${parseStoredDates(schedule.customDatesJson).length} term or custom dates`; if (schedule.frequency === "monthly") return `Every ${schedule.interval === 1 ? "month" : `${schedule.interval} months`} on day ${schedule.dayOfMonth}`; const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][schedule.dayOfWeek ?? 0]; return schedule.interval === 1 ? `Every ${day}` : `Every ${schedule.interval} weeks on ${day}`; }
function signageFormPayload(form: FormData) {
  const recurrence = String(form.get("recurrence") || "once") as Signage["recurrence"];
  const startValue = String(form.get("startsAt") || "");
  const endValue = String(form.get("endsAt") || "");
  const endTime = String(form.get("endTime") || "");
  return {
    name: String(form.get("name") || ""), mode: String(form.get("mode") || "scheduled"),
    enabled: form.get("enabled") === "on", priority: Number(form.get("priority") || 0),
    message: String(form.get("message") || ""), mediaAssetId: String(form.get("mediaAssetId") || "") || null,
    backgroundColor: String(form.get("backgroundColor") || "#25302d"), textColor: String(form.get("textColor") || "#ffffff"),
    targetTagsCsv: String(form.get("targetTagsCsv") || ""), targetScreenIds: form.getAll("targetScreenId").map(String),
    recurrence, startsAt: recurrence === "once" && startValue ? new Date(startValue).toISOString() : null,
    endsAt: recurrence === "once" && endValue ? new Date(endValue).toISOString() : null,
    scheduleStartDate: recurrence === "once" ? null : String(form.get("scheduleStartDate") || "") || null,
    scheduleEndDate: recurrence === "once" ? null : String(form.get("scheduleEndDate") || "") || null,
    startMinutes: recurrence === "once" ? null : minutesFromTime(String(form.get("startTime") || "")),
    endMinutes: recurrence === "once" ? null : endTime === "00:00" ? 1440 : minutesFromTime(endTime),
    daysOfWeek: recurrence === "weekly" ? form.getAll("dayOfWeek").map(Number) : [],
    excludedDates: recurrence === "once" ? [] : parseDateList(String(form.get("excludedDates") || "")),
  };
}
function signagePayload(item: Signage, enabled = item.enabled) {
  return {
    name: item.name, mode: item.mode, enabled, priority: item.priority, startsAt: item.startsAt || null,
    endsAt: item.endsAt || null, message: item.message, backgroundColor: item.backgroundColor, textColor: item.textColor,
    mediaAssetId: item.mediaAssetId || null, targetTagsCsv: item.targetTagsCsv, recurrence: item.recurrence,
    scheduleStartDate: item.scheduleStartDate || null, scheduleEndDate: item.scheduleEndDate || null,
    startMinutes: item.startMinutes ?? null, endMinutes: item.endMinutes ?? null, daysOfWeek: item.daysOfWeek,
    excludedDates: item.excludedDates, targetScreenIds: item.targetScreenIds,
  };
}
function signageTime(value?: number, fallback = "") { return value === 1440 ? "00:00" : timeFromMinutes(value) || fallback; }
function signageScheduleSummary(item: Signage) {
  if (item.recurrence === "once") {
    if (!item.startsAt && !item.endsAt) return "Always available";
    const start = item.startsAt ? new Date(item.startsAt).toLocaleString() : "Now";
    const end = item.endsAt ? new Date(item.endsAt).toLocaleString() : "until paused";
    return `${start} – ${end}`;
  }
  const weekdays = item.recurrence === "weekly"
    ? item.daysOfWeek.map(day => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ")
    : "Every day";
  const dates = item.scheduleEndDate ? `${item.scheduleStartDate || "now"} – ${item.scheduleEndDate}` : `from ${item.scheduleStartDate || "now"}`;
  return `${weekdays} · ${signageTime(item.startMinutes, "00:00")}–${signageTime(item.endMinutes, "00:00")} · ${dates}${item.excludedDates.length ? ` · ${item.excludedDates.length} excluded` : ""}`;
}
function signageTargets(item: Signage) {
  const targets = [...item.targetScreenNames];
  if (item.targetTagsCsv) targets.push(`tags: ${item.targetTagsCsv}`);
  return targets.length ? targets.join(" · ") : "All screens";
}
function formatDuration(ms?: number) { if (ms === undefined || ms === null) return "Duration unknown"; const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function formatPreciseTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.${String(Math.round(seconds % 1 * 100)).padStart(2, "0")}`; }
function formatBytes(bytes: number) { if (bytes === 0) return "0 B"; if (!Number.isFinite(bytes) || bytes < 0) return "—"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`; }
function parseDiagnosticJson<T>(value?: string): T[] { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function formatClockOffset(value?: number) { if (value == null) return "pending"; const absolute = Math.abs(value); if (absolute < 1_000) return `${absolute} ms`; const direction = value > 0 ? "fast" : "slow"; return `${(absolute / 1_000).toFixed(1)}s ${direction}`; }
function cuePoints(item?: PlaylistItem): CuePoint[] {
  if (!item?.cuePointsJson) return [];
  try {
    const values = JSON.parse(item.cuePointsJson) as Array<Partial<CuePoint> & { Name?: string; PositionMs?: number }>;
    return values.map(value => ({ name: String(value.name ?? value.Name ?? "").trim(), positionMs: Number(value.positionMs ?? value.PositionMs) })).filter(value => value.name && Number.isFinite(value.positionMs) && value.positionMs >= 0).sort((a, b) => a.positionMs - b.positionMs);
  } catch { return []; }
}
function friendlyType(type: string) { if (type.startsWith("video")) return "Video"; if (type.startsWith("audio")) return "Audio"; if (type.startsWith("image")) return "Image"; if (type.includes("pdf")) return "PDF"; return "Document"; }
function isPresentationFileName(fileName: string) { return /\.(pdf|ppt|pptx|pps|ppsx|pot|potx|odp|key|doc|docx)$/i.test(fileName); }
function isConvertibleDocument(media: Media) { return /\.(pdf|ppt|pptx|pps|ppsx|pot|potx|odp|key|doc|docx)$/i.test(media.fileName) || /pdf|presentation|powerpoint|keynote|msword|wordprocessingml|opendocument/.test(media.contentType); }
function convertedSlideCount(media: Media) { try { const value = JSON.parse(media.convertedSlidesJson); return Array.isArray(value) ? value.length : 0; } catch { return 0; } }
function friendlyPlaybackState(state?: string) { return ({ idle: "Ready", loading: "Loading", buffering: "Buffering", playing: "Playing", paused: "Paused", completed: "Completed", error: "Error" } as Record<string, string>)[state || "idle"] || "Unknown"; }
function youtubeEmbedUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split("/").filter(Boolean)[1] || "";
    }
    return /^[A-Za-z0-9_-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : undefined;
  } catch { return undefined; }
}
function isOnline(screen: Screen) { return screen.online; }
function timeAgo(value: string) { const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return `${seconds}s ago`; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function roleName(role: PlaylistItem["role"]) { return role === "preRoll" ? "PRE-ROLL" : role === "countdown" ? "COUNTDOWN" : "LESSON"; }
function toLocalInput(value?: string) { if (!value) return ""; const d = new Date(value); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
function localDateTimeValue(value?: string) { return toLocalInput(value); }
function errorText(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "LC"; }
async function waitForVersion(version?: string) { await new Promise(resolve => setTimeout(resolve, 4000)); for (let attempt = 0; attempt < 60; attempt++) { try { const status = await api<UpdateStatus>("/api/v1/updates"); if (!version || status.currentVersion === version) return; } catch { /* The server is restarting. */ } await new Promise(resolve => setTimeout(resolve, 2000)); } throw new Error("The update is taking longer than expected. Refresh this page in a minute."); }
function detectDuration(file: File): Promise<number | undefined> { if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) return Promise.resolve(undefined); return new Promise(resolve => { const element = document.createElement(file.type.startsWith("video/") ? "video" : "audio"); const url = URL.createObjectURL(file); element.preload = "metadata"; element.onloadedmetadata = () => { const result = Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : undefined; URL.revokeObjectURL(url); resolve(result); }; element.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); }; element.src = url; }); }

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}
