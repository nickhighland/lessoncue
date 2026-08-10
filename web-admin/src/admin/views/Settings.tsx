import { confirmAction } from "../../AccessibleDialogs";
import { FormEvent, useEffect, useState } from "react";
import { api, waitForVersion } from "../api";
import { Audit, Backup, BackupPolicyStatus, BackupPreview, BackupRestoreResult, Bootstrap, CloudflareTunnelStatus, HardwareAccelerationStatus, HttpPortStatus, LocalAddressStatus, MediaTaxonomy, MigrationTransferGrant, RecycleItem, StorageStatus, UpdateStatus, UploadQuotaPolicy } from "../models";
import { Definition, Empty, Field, Modal, PageHead, StorageMeter } from "../ui";
import { RegistrationSettingsPanel, ServiceAdminMfaPanel, TroubleshootingLogPanel } from "./Users";
import { cleanReleaseNotes, errorText, formatBytes, parseStringArray, quotaLimitsFromText, quotaLimitsToText, timeAgo } from "../utils";

export function Settings({
  bootstrap,
  backups,
  audit,
  refresh,
  notify,
  canAppSettings,
  canServiceSettings,
  canBackups,
  canUpdates,
}: {
  bootstrap: Bootstrap;
  backups: Backup[];
  audit: Audit[];
  refresh: () => void;
  notify: (s: string) => void;
  canAppSettings: boolean;
  canServiceSettings: boolean;
  canBackups: boolean;
  canUpdates: boolean;
}) {
  const canManageApp = canAppSettings || canServiceSettings;
  const [settingsSection, setSettingsSection] = useState<
    "system" | "accounts" | "media" | "connections" | "data"
  >(canUpdates ? "system" : canManageApp ? "accounts" : "data");
  const [automaticStorage, setAutomaticStorage] = useState(
    bootstrap.storage.automaticAllocation,
  );
  const [allocationGb, setAllocationGb] = useState(
    (bootstrap.storage.allocationBytes / 1024 ** 3).toFixed(1),
  );
  const uploadPolicy = bootstrap.uploadQuotaPolicy;
  const [maxUploadFileGb, setMaxUploadFileGb] = useState(
    uploadPolicy?.maxFileBytes
      ? (uploadPolicy.maxFileBytes / 1024 ** 3).toFixed(1)
      : "0",
  );
  const [maxUploadDailyGb, setMaxUploadDailyGb] = useState(
    uploadPolicy?.maxDailyBytes
      ? (uploadPolicy.maxDailyBytes / 1024 ** 3).toFixed(1)
      : "0",
  );
  const [maxActiveUploads, setMaxActiveUploads] = useState(
    String(uploadPolicy?.maxActiveSessionsPerUser || 3),
  );
  const [uploadUserLimits, setUploadUserLimits] = useState(
    quotaLimitsToText(uploadPolicy?.userDailyBytes),
  );
  const [uploadRoleLimits, setUploadRoleLimits] = useState(
    quotaLimitsToText(uploadPolicy?.roleDailyBytes),
  );
  const [uploadClassLimits, setUploadClassLimits] = useState(
    quotaLimitsToText(uploadPolicy?.classDailyBytes),
  );
  const [allowedVideoCodecs, setAllowedVideoCodecs] = useState(
    uploadPolicy?.allowedVideoCodecs.join(", ") || "",
  );
  const [allowedAudioCodecs, setAllowedAudioCodecs] = useState(
    uploadPolicy?.allowedAudioCodecs.join(", ") || "",
  );
  const [adaptiveTranscoding, setAdaptiveTranscoding] = useState(
    bootstrap.settings.adaptiveTranscodingEnabled,
  );
  const [transcodeLeadDays, setTranscodeLeadDays] = useState(
    String(bootstrap.settings.transcodeLeadDays),
  );
  const [hardwareAcceleration, setHardwareAcceleration] = useState(
    bootstrap.settings.hardwareAccelerationEnabled,
  );
  const [signageEnabled, setSignageEnabled] = useState(
    bootstrap.settings.signageEnabled,
  );
  const [checkingHardware, setCheckingHardware] = useState(false);
  const [mediaFolders, setMediaFolders] = useState(
    bootstrap.mediaTaxonomy.folders.join("\n"),
  );
  const [mediaTags, setMediaTags] = useState(
    bootstrap.mediaTaxonomy.tags.join("\n"),
  );
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [fixedPairing, setFixedPairing] = useState(bootstrap.pairingFixed);
  const [pairingPin, setPairingPin] = useState(bootstrap.pairingPin || "");
  const [controllerPin, setControllerPin] = useState("");
  const [localHostname, setLocalHostname] = useState(
    bootstrap.localAddress.hostname,
  );
  const [httpPort, setHttpPort] = useState(String(bootstrap.httpPort.port));
  const [tunnelEnabled, setTunnelEnabled] = useState(
    bootstrap.cloudflareTunnel.enabled,
  );
  const [tunnelHostname, setTunnelHostname] = useState(
    bootstrap.cloudflareTunnel.publicHostname || "",
  );
  const [tunnelToken, setTunnelToken] = useState("");
  const [tunnelAcknowledged, setTunnelAcknowledged] = useState(false);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [restorePreview, setRestorePreview] = useState<BackupPreview>();
  const [restoreResult, setRestoreResult] = useState<BackupRestoreResult>();
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupPasswordConfirmation, setBackupPasswordConfirmation] =
    useState("");
  const [backupIncludeSecrets, setBackupIncludeSecrets] = useState(false);
  const [restorePassword, setRestorePassword] = useState("");
  const [backupPolicy, setBackupPolicy] = useState<BackupPolicyStatus>();
  const [backupDrill, setBackupDrill] = useState<BackupPreview>();
  const [backupPolicyBusy, setBackupPolicyBusy] = useState(false);
  const [policyEnabled, setPolicyEnabled] = useState(false);
  const [policyFrequency, setPolicyFrequency] = useState<"daily" | "weekly">(
    "daily",
  );
  const [policyHour, setPolicyHour] = useState("2");
  const [policyWeeklyDay, setPolicyWeeklyDay] = useState("0");
  const [policyFull, setPolicyFull] = useState(true);
  const [policyRetentionCount, setPolicyRetentionCount] = useState("7");
  const [policyRetentionDays, setPolicyRetentionDays] = useState("30");
  const [policyIncludeSecrets, setPolicyIncludeSecrets] = useState(false);
  const [policyPassword, setPolicyPassword] = useState("");
  const [policyRemoteUrl, setPolicyRemoteUrl] = useState("");
  const [policyRemoteAuthentication, setPolicyRemoteAuthentication] = useState<
    "none" | "basic" | "bearer"
  >("none");
  const [policyRemoteUsername, setPolicyRemoteUsername] = useState("");
  const [policyRemoteSecret, setPolicyRemoteSecret] = useState("");
  const [migrationGrant, setMigrationGrant] =
    useState<MigrationTransferGrant>();
  const [migrationSourceAddress, setMigrationSourceAddress] = useState("");
  const [migrationToken, setMigrationToken] = useState("");
  const [migrationPassword, setMigrationPassword] = useState("");
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [recycleItems, setRecycleItems] = useState<RecycleItem[]>([]);
  const loadRecycleBin = () =>
    canManageApp
      ? api<RecycleItem[]>("/api/v1/recycle-bin")
          .then(setRecycleItems)
          .catch(() => undefined)
      : Promise.resolve();
  useEffect(() => {
    if (canManageApp)
      void api<RecycleItem[]>("/api/v1/recycle-bin")
        .then(setRecycleItems)
        .catch(() => undefined);
  }, [canManageApp]);
  useEffect(() => {
    if (!canBackups) return;
    void api<BackupPolicyStatus>("/api/v1/backups/policy")
      .then((status) => {
        setBackupPolicy(status);
        setPolicyEnabled(status.enabled);
        setPolicyFrequency(status.frequency);
        setPolicyHour(String(status.hourLocal));
        setPolicyWeeklyDay(String(status.weeklyDay ?? 0));
        setPolicyFull(status.includeMedia);
        setPolicyRetentionCount(String(status.retentionCount));
        setPolicyRetentionDays(String(status.retentionDays));
        setPolicyIncludeSecrets(status.secretHandling === "include");
        setPolicyRemoteUrl(status.remoteWebDavUrl || "");
        setPolicyRemoteAuthentication(status.remoteAuthentication);
        setPolicyRemoteUsername(status.remoteUsername || "");
      })
      .catch((error) => notify(errorText(error)));
  }, [canBackups, notify]);
  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    try {
      await api("/api/v1/organization", {
        method: "PUT",
        body: JSON.stringify({
          ...values,
          defaultLessonDurationMinutes: Number(
            values.defaultLessonDurationMinutes,
          ),
          defaultRetentionDays: Number(values.defaultRetentionDays),
          requireLocalRoomControllers:
            form.get("requireLocalRoomControllers") === "on",
          ...(form.has("signageEnabled")
            ? { signageEnabled: form.get("signageEnabled") === "on" }
            : {}),
          signageSourceAllowlist: String(values.signageSourceAllowlist || "")
            .split(/[\s,]+/)
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      refresh();
      notify("Organization settings saved.");
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function saveSignageAvailability(enabled: boolean) {
    try {
      await api("/api/v1/organization/signage-availability", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      refresh();
      notify(
        enabled
          ? "Signage enabled."
          : "Signage disabled and hidden from users.",
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function backup(full: boolean) {
    if (backupPassword.length < 12) {
      notify("Use a backup password with at least 12 characters.");
      return;
    }
    if (backupPassword !== backupPasswordConfirmation) {
      notify("The backup password confirmation does not match.");
      return;
    }
    setBackupBusy(true);
    try {
      await api("/api/v1/backups", {
        method: "POST",
        body: JSON.stringify({
          full,
          password: backupPassword,
          secretHandling: backupIncludeSecrets ? "include" : "exclude",
        }),
      });
      setBackupPassword("");
      setBackupPasswordConfirmation("");
      refresh();
      notify(
        full
          ? "Encrypted full backup created."
          : "Encrypted configuration backup created.",
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBackupBusy(false);
    }
  }

  async function verifyBackup(item: Backup) {
    try {
      const preview = await api<BackupPreview>(`/api/v1/backups/${item.id}/verify`, {
        method: "POST",
        body: JSON.stringify({ password: restorePassword }),
      });
      setBackupDrill(preview);
      notify(
        `Backup verified: ${preview.fileCount} files, authenticated manifest, and a healthy database.`,
      );
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function saveBackupPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBackupPolicyBusy(true);
    try {
      const status = await api<BackupPolicyStatus>("/api/v1/backups/policy", {
        method: "PUT",
        body: JSON.stringify({
          enabled: policyEnabled,
          frequency: policyFrequency,
          hourLocal: Number(policyHour),
          weeklyDay:
            policyFrequency === "weekly" ? Number(policyWeeklyDay) : null,
          includeMedia: policyFull,
          retentionCount: Number(policyRetentionCount),
          retentionDays: Number(policyRetentionDays),
          secretHandling: policyIncludeSecrets ? "include" : "exclude",
          backupPassword: policyPassword || null,
          remoteWebDavUrl: policyRemoteUrl || null,
          remoteAuthentication: policyRemoteAuthentication,
          remoteUsername: policyRemoteUsername || null,
          remoteSecret: policyRemoteSecret || null,
        }),
      });
      setBackupPolicy(status);
      setPolicyPassword("");
      setPolicyRemoteSecret("");
      notify("Scheduled backup policy saved.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBackupPolicyBusy(false);
    }
  }
  async function runBackupPolicy() {
    setBackupPolicyBusy(true);
    try {
      const status = await api<BackupPolicyStatus>(
        "/api/v1/backups/policy/run",
        { method: "POST", body: "{}" },
      );
      setBackupPolicy(status);
      refresh();
      notify("Scheduled backup created, verified, and delivered.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBackupPolicyBusy(false);
    }
  }
  async function createMigrationLink(item: Backup) {
    setMigrationBusy(true);
    try {
      const grant = await api<MigrationTransferGrant>(
        `/api/v1/backups/${item.id}/migration-link`,
        { method: "POST", body: "{}" },
      );
      setMigrationGrant(grant);
    } catch (error) {
      notify(errorText(error));
    } finally {
      setMigrationBusy(false);
    }
  }
  async function previewMigration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMigrationBusy(true);
    try {
      const preview = await api<BackupPreview>(
        "/api/v1/backups/migration/preview",
        {
          method: "POST",
          body: JSON.stringify({
            sourceAddress: migrationSourceAddress,
            transferToken: migrationToken,
            password: migrationPassword,
          }),
        },
      );
      setRestorePreview(preview);
      setRestoreResult(undefined);
      setRestoreConfirmation("");
      setMigrationToken("");
      setMigrationPassword("");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setMigrationBusy(false);
    }
  }
  async function previewBackupRestore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setRestoreBusy(true);
    try {
      const preview = await api<BackupPreview>(
        "/api/v1/backups/restore/preview",
        { method: "POST", body: form },
      );
      setRestorePreview(preview);
      setRestoreResult(undefined);
      setRestoreConfirmation("");
      setRestorePassword("");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setRestoreBusy(false);
    }
  }
  async function restoreBackup() {
    if (!restorePreview || restoreConfirmation !== "RESTORE") return;
    setRestoreBusy(true);
    try {
      const result = await api<BackupRestoreResult>("/api/v1/backups/restore", {
        method: "POST",
        body: JSON.stringify({
          restoreId: restorePreview.restoreId,
          confirmation: restoreConfirmation,
        }),
      });
      setRestoreResult(result);
      notify(
        "Backup restored. Review the safety-backup details, then reload LessonCue.",
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setRestoreBusy(false);
    }
  }
  async function saveStorage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const limitBytes = automaticStorage
        ? 0
        : Math.round(Number(allocationGb) * 1024 ** 3);
      await api<StorageStatus>("/api/v1/storage", {
        method: "PUT",
        body: JSON.stringify({ limitBytes }),
      });
      refresh();
      notify(
        automaticStorage
          ? "Storage allocation will adjust automatically."
          : "Storage allocation saved.",
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function saveUploadPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const toBytes = (value: string) =>
        value.trim() === "" || Number(value) === 0
          ? 0
          : Math.round(Number(value) * 1024 ** 3);
      const policy = await api<UploadQuotaPolicy>("/api/v1/upload-policy", {
        method: "PUT",
        body: JSON.stringify({
          maxFileBytes: toBytes(maxUploadFileGb),
          maxDailyBytes: toBytes(maxUploadDailyGb),
          maxActiveSessionsPerUser: Number(maxActiveUploads),
          userDailyBytes: quotaLimitsFromText(uploadUserLimits),
          roleDailyBytes: quotaLimitsFromText(uploadRoleLimits),
          classDailyBytes: quotaLimitsFromText(uploadClassLimits),
          allowedVideoCodecs: allowedVideoCodecs
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          allowedAudioCodecs: allowedAudioCodecs
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      setMaxUploadFileGb(
        policy.maxFileBytes
          ? (policy.maxFileBytes / 1024 ** 3).toFixed(1)
          : "0",
      );
      setMaxUploadDailyGb(
        policy.maxDailyBytes
          ? (policy.maxDailyBytes / 1024 ** 3).toFixed(1)
          : "0",
      );
      setUploadUserLimits(quotaLimitsToText(policy.userDailyBytes));
      setUploadRoleLimits(quotaLimitsToText(policy.roleDailyBytes));
      setUploadClassLimits(quotaLimitsToText(policy.classDailyBytes));
      notify("Upload limits saved.");
      refresh();
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function saveAdaptiveTranscoding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api("/api/v1/organization", {
        method: "PUT",
        body: JSON.stringify({
          ...o,
          adaptiveTranscodingEnabled: adaptiveTranscoding,
          transcodeLeadDays: Number(transcodeLeadDays),
          hardwareAccelerationEnabled: hardwareAcceleration,
        }),
      });
      refresh();
      notify(
        hardwareAcceleration && bootstrap.hardwareAcceleration.available
          ? `${bootstrap.hardwareAcceleration.engine} will accelerate local video conversion.`
          : "Playback profile settings saved.",
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function checkHardware() {
    setCheckingHardware(true);
    try {
      const status = await api<HardwareAccelerationStatus>(
        "/api/v1/hardware-acceleration/check",
        { method: "POST", body: "{}" },
      );
      refresh();
      notify(status.available ? `${status.engine} is ready.` : status.message);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setCheckingHardware(false);
    }
  }
  async function saveMediaTaxonomy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await api<MediaTaxonomy>("/api/v1/media-taxonomy", {
        method: "PUT",
        body: JSON.stringify({
          folders: mediaFolders.split("\n"),
          tags: mediaTags.split("\n"),
        }),
      });
      setMediaFolders(result.folders.join("\n"));
      setMediaTags(result.tags.join("\n"));
      refresh();
      notify("Approved media folders and tags saved.");
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function checkUpdates() {
    setChecking(true);
    try {
      const status = await api<UpdateStatus>("/api/v1/updates/check", {
        method: "POST",
        body: "{}",
      });
      refresh();
      notify(
        status.updateAvailable
          ? `LessonCue ${status.latestVersion} is available.`
          : "LessonCue is up to date.",
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setChecking(false);
    }
  }
  async function installUpdate() {
    if (
      !await confirmAction(
        `Install LessonCue ${bootstrap.update.latestVersion}? The local interface will be unavailable briefly while the server restarts.`,
      )
    )
      return;
    setInstalling(true);
    try {
      await api("/api/v1/updates/install", { method: "POST", body: "{}" });
      notify("Installing the update. LessonCue will reconnect automatically.");
      await waitForVersion(bootstrap.update.latestVersion);
      location.reload();
    } catch (e) {
      notify(errorText(e));
      setInstalling(false);
    }
  }
  async function rollbackUpdate() {
    const target = bootstrap.update.rollbackTargetVersion;
    if (
      !await confirmAction(
        `Restore the protected ${target ? `LessonCue ${target} ` : ""}last-known-good snapshot? This replaces the current application, database, and server configuration with their pre-update copies. Media files are not changed.`,
        { destructive: true, confirmLabel: "Restore snapshot" },
      )
    )
      return;
    setInstalling(true);
    try {
      const result = await api<{
        message: string;
        targetVersion?: string;
      }>("/api/v1/updates/rollback", { method: "POST", body: "{}" });
      notify(result.message);
      await waitForVersion(result.targetVersion);
      location.reload();
    } catch (e) {
      notify(errorText(e));
      setInstalling(false);
    }
  }
  async function savePairingPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api("/api/v1/pairing/pin", {
        method: "PUT",
        body: JSON.stringify({
          automatic: !fixedPairing,
          pin: fixedPairing ? pairingPin : null,
        }),
      });
      refresh();
      notify(
        fixedPairing
          ? "The fixed pairing PIN is active."
          : "Automatic PIN rotation is active.",
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function saveControllerPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api("/api/v1/controller-pin", {
        method: "PUT",
        body: JSON.stringify({ pin: controllerPin }),
      });
      setControllerPin("");
      sessionStorage.removeItem("lessoncue.universalGrant");
      refresh();
      notify("Universal controller PIN saved.");
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function saveLocalAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const status = await api<LocalAddressStatus>("/api/v1/local-address", {
        method: "PUT",
        body: JSON.stringify({ hostname: localHostname }),
      });
      setLocalHostname(status.hostname);
      refresh();
      notify(
        status.pending
          ? `Setting up ${status.address}…`
          : `${status.address} is active.`,
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function saveHttpPort(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const port = Number(httpPort);
    if (
      !await confirmAction(
        `Change LessonCue's browser port to ${port}? The interface will restart. Saved browser links and screens using the old address must be updated.`,
      )
    )
      return;
    try {
      const status = await api<HttpPortStatus>("/api/v1/http-port", {
        method: "PUT",
        body: JSON.stringify({ port }),
      });
      setHttpPort(String(status.port));
      if (status.supported) {
        notify(`Restarting LessonCue at ${status.address}…`);
        const destination = new URL(location.href);
        destination.port = status.port === 80 ? "" : String(status.port);
        for (let attempt = 0; attempt < 45; attempt++) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          try {
            await fetch(`${destination.origin}/health`, {
              mode: "no-cors",
              cache: "no-store",
            });
            location.assign(destination.origin);
            return;
          } catch {
            /* Wait for the protected restart or rollback. */
          }
        }
        notify(
          "The new port did not respond. Returning to the previous address.",
        );
        location.reload();
      } else {
        refresh();
        notify(status.error || "Port saved. Restart the server to apply it.");
      }
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function saveCloudflareTunnel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !tunnelEnabled &&
      bootstrap.cloudflareTunnel.enabled &&
      !await confirmAction(
        "Disable remote access through this Cloudflare Tunnel? Local LessonCue access will continue to work.",
        { destructive: true, confirmLabel: "Disable remote access" },
      )
    )
      return;
    setTunnelBusy(true);
    try {
      await api<CloudflareTunnelStatus>("/api/v1/cloudflare-tunnel", {
        method: "PUT",
        body: JSON.stringify({
          enabled: tunnelEnabled,
          publicHostname: tunnelHostname,
          token: tunnelToken || null,
          acknowledgedRemoteExposure: tunnelEnabled && tunnelAcknowledged,
        }),
      });
      setTunnelToken("");
      notify(
        tunnelEnabled
          ? "Cloudflare Tunnel setup started. Checking its edge connection…"
          : "Cloudflare Tunnel is being disabled.",
      );
      for (let attempt = 0; attempt < 45; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const status = await api<CloudflareTunnelStatus>(
          "/api/v1/cloudflare-tunnel",
        );
        if (!status.pending) {
          refresh();
          notify(
            status.error ||
              (status.connected
                ? `${status.publicUrl} is connected through Cloudflare.`
                : status.enabled
                  ? "Cloudflare Tunnel is enabled and waiting for an edge connection."
                  : "Cloudflare Tunnel is disabled."),
          );
          break;
        }
      }
    } catch (e) {
      notify(errorText(e));
    } finally {
      setTunnelBusy(false);
    }
  }
  async function restoreRecycleItem(item: RecycleItem) {
    try {
      await api(`/api/v1/recycle-bin/${item.kind}/${item.id}/restore`, {
        method: "POST",
        body: "{}",
      });
      await loadRecycleBin();
      refresh();
      notify(`${item.title} restored.`);
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function purgeRecycleBin() {
    if (
      !await confirmAction(
        "Permanently purge every item in the recycling bin? Files and records cannot be recovered after this.",
        { destructive: true, confirmLabel: "Permanently purge" },
      )
    )
      return;
    try {
      const result = await api<{ purged: number }>("/api/v1/recycle-bin", {
        method: "DELETE",
      });
      await loadRecycleBin();
      refresh();
      notify(
        `${result.purged} recycled item${result.purged === 1 ? "" : "s"} permanently purged.`,
      );
    } catch (error) {
      notify(errorText(error));
    }
  }
  const o = bootstrap.settings;
  const caddyOriginPort =
    bootstrap.httpPort.port === 443 ? 8080 : bootstrap.httpPort.port;
  const caddyConfig = `${bootstrap.localAddress.hostname}.local {\n  tls internal\n  reverse_proxy 127.0.0.1:${caddyOriginPort}\n}`;
  return (
    <>
      <PageHead
        eyebrow="SERVER"
        title="Settings"
        detail="Updates, appearance, storage, connectivity, recovery, and local server operations."
      />
      <nav className="settings-tabs" aria-label="Settings sections">
        {canUpdates && (
          <button
            className={settingsSection === "system" ? "active" : ""}
            onClick={() => setSettingsSection("system")}
          >
            <span>↻</span>
            <strong>System</strong>
            <small>Updates</small>
          </button>
        )}
        {canManageApp && (
          <button
            className={settingsSection === "accounts" ? "active" : ""}
            onClick={() => setSettingsSection("accounts")}
          >
            <span>♙</span>
            <strong>
              {canServiceSettings ? "Organization & accounts" : "Registration"}
            </strong>
            <small>
              {canServiceSettings
                ? "Appearance, registration, email"
                : "Modes and registration codes"}
            </small>
          </button>
        )}
        {canManageApp && (
          <button
            className={settingsSection === "media" ? "active" : ""}
            onClick={() => setSettingsSection("media")}
          >
            <span>▶</span>
            <strong>Media & storage</strong>
            <small>
              {canServiceSettings
                ? "Folders, capacity, playback"
                : "Approved folders and tags"}
            </small>
          </button>
        )}
        {canManageApp && (
          <button
            className={settingsSection === "connections" ? "active" : ""}
            onClick={() => setSettingsSection("connections")}
          >
            <span>⌁</span>
            <strong>Connections & pairing</strong>
            <small>
              {canServiceSettings
                ? "Address, pairing, remote access"
                : "Pairing and controller PINs"}
            </small>
          </button>
        )}
        {(canManageApp || canBackups) && (
          <button
            className={settingsSection === "data" ? "active" : ""}
            onClick={() => setSettingsSection("data")}
          >
            <span>▤</span>
            <strong>Data & recovery</strong>
            <small>
              {canServiceSettings
                ? "Backups, recycle bin, activity"
                : "Recycle bin and activity"}
            </small>
          </button>
        )}
      </nav>
      <div className="settings-page" data-section={settingsSection}>
        {canManageApp && (
          <div className="settings-grid account-settings-grid">
            <RegistrationSettingsPanel
              bootstrap={bootstrap}
              notify={notify}
              refresh={refresh}
              canServiceSettings={canServiceSettings}
            />
            {canServiceSettings && <ServiceAdminMfaPanel notify={notify} />}
            {canServiceSettings && (
              <section className="panel settings-panel settings-accounts">
                <h2>Preview features</h2>
                <p className="settings-copy">
                  Choose which optional features are available to your organization.
                </p>
                <div className="stack">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={signageEnabled}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setSignageEnabled(enabled);
                        void saveSignageAvailability(enabled);
                      }}
                    />{" "}
                    Enable Signage
                  </label>
                  <p className="settings-copy">
                    Signage is currently a preview feature. When it is off, its
                    navigation, editor, APIs, and display output are unavailable
                    while existing sign data remains safely stored.
                  </p>
                </div>
              </section>
            )}
          </div>
        )}
        {restorePreview && (
          <Modal
            title={restoreResult ? "Restore complete" : "Review backup restore"}
            onClose={() => !restoreBusy && setRestorePreview(undefined)}
          >
            {restoreResult ? (
              <div className="restore-complete">
                <div className="success-mark">✓</div>
                <h3>{restoreResult.organization} was restored</h3>
                <p>
                  A full safety backup was created first and remains available
                  on this server.
                </p>
                <Definition
                  label="Safety backup"
                  value={restoreResult.safetyBackupFileName}
                />
                <Definition
                  label="Media"
                  value={
                    restoreResult.mediaRestored
                      ? "Restored from the archive"
                      : "Existing server media preserved"
                  }
                />
                <p className="settings-copy">
                  This server kept its{" "}
                  {restoreResult.preservedServerSettings.join(", ")}.
                </p>
                <button
                  className="button primary wide"
                  onClick={() => location.reload()}
                >
                  Reload restored LessonCue
                </button>
              </div>
            ) : (
              <div className="restore-review">
                <div className="restore-heading">
                  <div>
                    <span>
                      {restorePreview.encrypted ? "ENCRYPTED " : ""}
                      {restorePreview.kind.toUpperCase()} BACKUP
                    </span>
                    <h3>{restorePreview.organization}</h3>
                    <p>
                      {restorePreview.fileName} · Server secrets{" "}
                      {restorePreview.secretHandling === "include"
                        ? "included"
                        : restorePreview.secretHandling === "exclude"
                          ? "excluded"
                          : "use legacy behavior"}{" "}
                      · Source version {restorePreview.sourceVersion || "unknown"}
                    </p>
                  </div>
                  <strong>{formatBytes(restorePreview.compressedBytes)}</strong>
                </div>
                <div className="restore-counts">
                  <Definition
                    label="Users"
                    value={String(restorePreview.users)}
                  />
                  <Definition
                    label="Classes"
                    value={String(restorePreview.classes)}
                  />
                  <Definition
                    label="Lessons"
                    value={String(restorePreview.lessons)}
                  />
                  <Definition
                    label="Media records"
                    value={String(restorePreview.mediaRecords)}
                  />
                </div>
                {restorePreview.warnings.map((warning) => (
                  <div className="alert" key={warning}>
                    {warning}
                  </div>
                ))}
                <div className="danger-callout">
                  <strong>This replaces current LessonCue data.</strong>
                  <p>
                    LessonCue creates a full safety backup before changing
                    anything. The receiving server's identity, keys, network
                    address, port, and pairing secrets remain unchanged.
                  </p>
                </div>
                <Field label="Type RESTORE to continue">
                  <input
                    value={restoreConfirmation}
                    onChange={(e) => setRestoreConfirmation(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <button
                  className="button danger wide"
                  onClick={restoreBackup}
                  disabled={restoreBusy || restoreConfirmation !== "RESTORE"}
                >
                  {restoreBusy
                    ? "Restoring…"
                    : "Create safety backup and restore"}
                </button>
              </div>
            )}
          </Modal>
        )}
        {backupDrill && (
          <Modal
            title="Restore-readiness drill passed"
            onClose={() => setBackupDrill(undefined)}
          >
            <div className="restore-complete">
              <div className="success-mark">✓</div>
              <h3>{backupDrill.fileName} is recoverable</h3>
              <p>
                LessonCue authenticated the complete encrypted envelope,
                checked every manifest digest, opened SQLite read-only, ran its
                integrity check, and confirmed the required tables and media
                inventory without changing this server.
              </p>
              <div className="restore-counts">
                <Definition
                  label="Archive files"
                  value={String(backupDrill.fileCount)}
                />
                <Definition
                  label="Database"
                  value="Healthy"
                />
                <Definition
                  label="Media files"
                  value={String(backupDrill.mediaFiles)}
                />
                <Definition
                  label="Encryption"
                  value={backupDrill.encrypted ? "Authenticated" : "Legacy ZIP"}
                />
              </div>
              <div className="danger-callout">
                <strong>Complete the human part of the drill.</strong>
                <p>
                  Confirm the password is stored separately, download this
                  backup to another device, and record who can reach it. For
                  the strongest test, restore that copy on a spare LessonCue
                  server rather than replacing this production server.
                </p>
              </div>
              <button
                className="button primary wide"
                onClick={() => setBackupDrill(undefined)}
              >
                Finish drill
              </button>
            </div>
          </Modal>
        )}
        {migrationGrant && (
          <Modal
            title="One-time server transfer"
            onClose={() => setMigrationGrant(undefined)}
          >
            <div className="migration-grant">
              <div className="privacy-callout">
                <strong>{migrationGrant.fileName}</strong>
                <p>
                  This encrypted backup can be downloaded once, until{" "}
                  {new Date(migrationGrant.expiresAt).toLocaleString()}. The
                  source server never receives its backup password.
                </p>
              </div>
              <Field label="Source LessonCue address">
                <input
                  readOnly
                  value={
                    bootstrap.cloudflareTunnel.publicUrl ||
                    bootstrap.httpPort.address
                  }
                />
              </Field>
              <Field label="One-time transfer token">
                <textarea readOnly value={migrationGrant.token} rows={2} />
              </Field>
              <button
                className="button primary wide"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${bootstrap.cloudflareTunnel.publicUrl || bootstrap.httpPort.address}\n${migrationGrant.token}`,
                  );
                  notify("Source address and one-time token copied.");
                }}
              >
                Copy transfer details
              </button>
              <p className="settings-copy">
                On the destination server, open Privacy & backups and paste
                these values under <strong>Move from another server</strong>.
                Enter the backup password separately.
              </p>
            </div>
          </Modal>
        )}
        <div className="settings-grid">
          {canUpdates && (
            <section className="panel wide-settings update-settings settings-panel settings-system">
              <div className="settings-heading">
                <div>
                  <span className="settings-kicker">SYSTEM MAINTENANCE</span>
                  <h2>Software updates</h2>
                  <p className="settings-copy">
                    LessonCue checks once each day and alerts administrators
                    when a newer release is available.
                  </p>
                </div>
                <span
                  className={`update-state ${bootstrap.update.updateAvailable ? "available" : "current"}`}
                >
                  {bootstrap.update.updateAvailable
                    ? "Update available"
                    : "Up to date"}
                </span>
              </div>
              <div className="storage-facts">
                <Definition
                  label="Installed version"
                  value={bootstrap.update.currentVersion}
                />
                <Definition
                  label="Latest version"
                  value={bootstrap.update.latestVersion || "Not checked yet"}
                />
                <Definition
                  label="Last checked"
                  value={
                    bootstrap.update.lastCheckedAt
                      ? timeAgo(bootstrap.update.lastCheckedAt)
                      : "Not checked yet"
                  }
                />
              </div>
              {bootstrap.update.updateAvailable && bootstrap.update.releaseNotes && (
                <div className="update-notes" aria-label="What is new in this update">
                  <strong>What’s new in this update</strong>
                  <p>{cleanReleaseNotes(bootstrap.update.releaseNotes)}</p>
                </div>
              )}
              {bootstrap.update.error && (
                <div className="alert error" role="alert">{bootstrap.update.error}</div>
              )}
              {!bootstrap.update.error &&
                bootstrap.update.lastInstallMessage &&
                bootstrap.update.lastInstallAt && (
                  <div
                    className={`alert ${
                      bootstrap.update.lastInstallSucceeded === false
                        ? "error"
                        : "success"
                    }`}
                  >
                    {bootstrap.update.lastInstallMessage}{" "}
                    <span className="muted">
                      ({timeAgo(bootstrap.update.lastInstallAt)})
                    </span>
                  </div>
                )}
              {bootstrap.update.rollbackSnapshotAvailable && (
                <div className="rollback-available">
                  <p className="settings-copy">
                    A protected last-known-good application, database,
                    configuration, updater, and service snapshot
                    {bootstrap.update.rollbackTargetVersion
                      ? ` for LessonCue ${bootstrap.update.rollbackTargetVersion}`
                      : ""}{" "}
                    is available. Media files are not replaced.
                  </p>
                  {canServiceSettings && (
                    <button
                      className="button danger"
                      onClick={rollbackUpdate}
                      disabled={installing}
                    >
                      {installing
                        ? "Server operation in progress…"
                        : "Restore last-known-good snapshot"}
                    </button>
                  )}
                </div>
              )}
              <div className="head-actions">
                <button
                  className="button"
                  onClick={checkUpdates}
                  disabled={checking}
                >
                  {checking ? "Checking…" : "Check now"}
                </button>
                {bootstrap.update.updateAvailable &&
                  bootstrap.update.automaticInstallSupported && (
                    <button
                      className="button primary"
                      onClick={installUpdate}
                      disabled={installing}
                    >
                      {installing
                        ? "Installing…"
                        : `Install ${bootstrap.update.latestVersion}`}
                    </button>
                  )}
                {bootstrap.update.releaseUrl && (
                  <a
                    className="button"
                    href={bootstrap.update.releaseUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Release notes
                  </a>
                )}
              </div>
              {!bootstrap.update.automaticInstallSupported && (
                <p className="settings-copy">
                  Run the current release installer once from SSH to enable
                  automatic updates on this server.
                </p>
              )}
            </section>
          )}
      {canServiceSettings && (
        <section className="panel wide-settings settings-panel settings-accounts">
              <h2>Organization & appearance</h2>
              <p className="settings-copy">
                Manage organization defaults, controller access, and every
                interface color together.
              </p>
              <form className="stack" onSubmit={saveOrganization}>
                <div className="two-fields">
                  <Field label="Organization">
                    <input name="name" defaultValue={o.name} required />
                  </Field>
                  <Field label="Site">
                    <input name="siteName" defaultValue={o.siteName} required />
                  </Field>
                </div>
                <div className="two-fields">
                  <Field label="Time zone">
                    <input name="timeZone" defaultValue={o.timeZone} required />
                  </Field>
                  <Field label="Week starts">
                    <select name="weekStartsOn" defaultValue={o.weekStartsOn}>
                      <option>Sunday</option>
                      <option>Monday</option>
                    </select>
                  </Field>
                </div>
                <Field label="Welcome message">
                  <input
                    name="welcomeMessage"
                    defaultValue={o.welcomeMessage}
                  />
                </Field>
                <div className="two-fields">
                  <Field label="Default lesson minutes">
                    <input
                      name="defaultLessonDurationMinutes"
                      type="number"
                      min="5"
                      max="480"
                      defaultValue={o.defaultLessonDurationMinutes}
                    />
                  </Field>
                  <Field label="Archive retention days">
                    <input
                      name="defaultRetentionDays"
                      type="number"
                      min="1"
                      max="3650"
                      defaultValue={o.defaultRetentionDays}
                    />
                  </Field>
                </div>
                {o.signageEnabled && <div className="settings-subsection">
                  <h3>Approved signage information sources</h3>
                  <p>
                    Enter one trusted website origin per line, such as
                    https://weather.example.org. Signage editors may only use
                    RSS, calendars, weather, menus, or JSON data from these
                    origins.
                  </p>
                  <Field label="Approved source origins">
                    <textarea
                      name="signageSourceAllowlist"
                      rows={4}
                      defaultValue={parseStringArray(
                        o.signageSourceAllowlistJson,
                      ).join("\n")}
                      placeholder="https://example.org"
                    />
                  </Field>
                </div>}
                <div className="settings-subsection">
                  <h3>Room controller access</h3>
                  <label className="check-row">
                    <input
                      name="requireLocalRoomControllers"
                      type="checkbox"
                      defaultChecked={o.requireLocalRoomControllers}
                    />{" "}
                    Require non-administrator room remotes to use the local
                    .local address
                  </label>
                  <p>
                    When enabled, room and temporary controllers used by Editors
                    or Viewers are rejected on public hostnames. Service Admins
                    and App Admins can still troubleshoot remotely.
                  </p>
                </div>
                <div className="settings-subsection">
                  <h3>Interface colors</h3>
                  <p>
                    Choose the navigation background, general accent, navigation
                    text, and selected-tab colors in one place.
                  </p>
                  <div className="color-fields">
                    <Field label="Navigation background">
                      <input
                        name="primaryColor"
                        type="color"
                        defaultValue={o.primaryColor}
                      />
                    </Field>
                    <Field label="Accent color">
                      <input
                        name="accentColor"
                        type="color"
                        defaultValue={o.accentColor}
                      />
                    </Field>
                    <Field label="Navigation text">
                      <input
                        name="navigationTextColor"
                        type="color"
                        defaultValue={o.navigationTextColor}
                      />
                    </Field>
                    <Field label="Selected navigation tab">
                      <input
                        name="selectedTabColor"
                        type="color"
                        defaultValue={o.selectedTabColor}
                      />
                    </Field>
                  </div>
                </div>
                <button className="button primary">
                  Save organization & appearance
                </button>
              </form>
            </section>
          )}
          {canManageApp && (
            <section className="panel wide-settings settings-panel settings-media">
              <div className="settings-heading">
                <div>
                  <span className="settings-kicker">MEDIA LIBRARY</span>
                  <h2>Approved folders & tags</h2>
                  <p className="settings-copy">
                    Give uploaders a consistent organization system. Folder
                    paths may use / for hierarchy; enter one folder or tag per
                    line.
                  </p>
                </div>
                <span className="update-state current">
                  {bootstrap.mediaTaxonomy.folders.length} folders ·{" "}
                  {bootstrap.mediaTaxonomy.tags.length} tags
                </span>
              </div>
              <form className="stack" onSubmit={saveMediaTaxonomy}>
                <div className="two-fields taxonomy-settings">
                  <Field
                    label="Approved folder paths"
                    hint="Examples: Elementary/Science or Main Campus/Events"
                  >
                    <textarea
                      rows={7}
                      value={mediaFolders}
                      onChange={(event) => setMediaFolders(event.target.value)}
                      placeholder={"General\nLessons\nSignage"}
                    />
                  </Field>
                  <Field
                    label="Approved tags"
                    hint="Each tag may be up to 40 characters."
                  >
                    <textarea
                      rows={7}
                      value={mediaTags}
                      onChange={(event) => setMediaTags(event.target.value)}
                      placeholder={"Reusable\nIntro\nReference"}
                    />
                  </Field>
                </div>
                <div className="alert">
                  A folder or tag that is already assigned to media cannot be
                  removed until those items are reassigned.
                </div>
                <button className="button primary">
                  Save approved folders & tags
                </button>
              </form>
            </section>
          )}
          {canServiceSettings && (
            <section className="panel settings-panel settings-media">
              <h2>Storage allocation</h2>
              <div className="storage-facts">
                <Definition
                  label="LessonCue is using"
                  value={formatBytes(bootstrap.storage.usedBytes)}
                />
                <Definition
                  label="Available on computer"
                  value={formatBytes(bootstrap.storage.diskAvailableBytes)}
                />
                <Definition
                  label="Available for uploads"
                  value={formatBytes(bootstrap.storage.remainingBytes)}
                />
                <Definition
                  label="Reserved by active uploads"
                  value={formatBytes(bootstrap.storage.reservedBytes)}
                />
              </div>
              <StorageMeter storage={bootstrap.storage} />
              <form className="stack storage-form" onSubmit={saveStorage}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={automaticStorage}
                    onChange={(e) => setAutomaticStorage(e.target.checked)}
                  />{" "}
                  Adjust allocation automatically
                </label>
                <Field
                  label="Maximum LessonCue storage"
                  hint={`Must be between ${formatBytes(bootstrap.storage.usedBytes)} and ${formatBytes(bootstrap.storage.maximumAllocationBytes)}. LessonCue keeps 512 MB free for the operating system.`}
                >
                  <div className="number-suffix">
                    <input
                      type="number"
                      min={Math.max(
                        0.1,
                        bootstrap.storage.usedBytes / 1024 ** 3,
                      )}
                      max={bootstrap.storage.maximumAllocationBytes / 1024 ** 3}
                      step="0.1"
                      value={allocationGb}
                      onChange={(e) => setAllocationGb(e.target.value)}
                      disabled={automaticStorage}
                      required={!automaticStorage}
                    />
                    <span>GB</span>
                  </div>
                </Field>
                <button className="button primary">Save storage limit</button>
              </form>
            </section>
          )}
          {canServiceSettings && (
            <section className="panel wide-settings settings-panel settings-media">
              <div className="settings-heading">
                <div>
                  <span className="settings-kicker">UPLOAD SAFETY</span>
                  <h2>Upload limits</h2>
                  <p className="settings-copy">
                    Limit file size and daily use without changing the main
                    storage allocation. Enter 0 for no size or daily limit.
                    Active uploads always reserve their full declared size.
                  </p>
                </div>
                <span className="update-state current">
                  {maxActiveUploads} active per account
                </span>
              </div>
              <form className="stack" onSubmit={saveUploadPolicy}>
                <div className="three-fields">
                  <Field label="Maximum file size" hint="0 means unlimited.">
                    <div className="number-suffix">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={maxUploadFileGb}
                        onChange={(event) =>
                          setMaxUploadFileGb(event.target.value)
                        }
                      />
                      <span>GB</span>
                    </div>
                  </Field>
                  <Field
                    label="Default daily allowance"
                    hint="Per account, reset at 00:00 UTC; 0 means unlimited."
                  >
                    <div className="number-suffix">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={maxUploadDailyGb}
                        onChange={(event) =>
                          setMaxUploadDailyGb(event.target.value)
                        }
                      />
                      <span>GB</span>
                    </div>
                  </Field>
                  <Field
                    label="Active uploads per account"
                    hint="Paused and failed resumable uploads count."
                  >
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={maxActiveUploads}
                      onChange={(event) =>
                        setMaxActiveUploads(event.target.value)
                      }
                    />
                  </Field>
                </div>
                <details>
                  <summary>Advanced per-user, role, class, and codec limits</summary>
                  <div className="stack details-body">
                    <div className="three-fields">
                      <Field
                        label="User daily overrides"
                        hint={"One per line: username = GB or account UUID = GB"}
                      >
                        <textarea
                          rows={5}
                          value={uploadUserLimits}
                          onChange={(event) =>
                            setUploadUserLimits(event.target.value)
                          }
                          placeholder="alex = 5"
                        />
                      </Field>
                      <Field
                        label="Role daily overrides"
                        hint="One per line: role = GB. The stricter applicable limit wins."
                      >
                        <textarea
                          rows={5}
                          value={uploadRoleLimits}
                          onChange={(event) =>
                            setUploadRoleLimits(event.target.value)
                          }
                          placeholder={"Editor = 10\nViewer = 2"}
                        />
                      </Field>
                      <Field
                        label="Class daily limits"
                        hint="One per line: class name or UUID = GB. Shared by everyone uploading to that class."
                      >
                        <textarea
                          rows={5}
                          value={uploadClassLimits}
                          onChange={(event) =>
                            setUploadClassLimits(event.target.value)
                          }
                          placeholder="Learning Lab = 20"
                        />
                      </Field>
                    </div>
                    <div className="two-fields">
                      <Field
                        label="Allowed video codecs"
                        hint="Comma-separated FFmpeg names such as h264, hevc, vp9. Blank allows all."
                      >
                        <input
                          value={allowedVideoCodecs}
                          onChange={(event) =>
                            setAllowedVideoCodecs(event.target.value)
                          }
                          placeholder="All video codecs"
                        />
                      </Field>
                      <Field
                        label="Allowed audio codecs"
                        hint="Comma-separated FFmpeg names such as aac, mp3, opus. Blank allows all."
                      >
                        <input
                          value={allowedAudioCodecs}
                          onChange={(event) =>
                            setAllowedAudioCodecs(event.target.value)
                          }
                          placeholder="All audio codecs"
                        />
                      </Field>
                    </div>
                    <div className="alert">
                      Codec rules are verified from the file itself during
                      processing, not from its name or browser-supplied type.
                      A disallowed codec is marked failed with a specific
                      explanation.
                    </div>
                  </div>
                </details>
                <button className="button primary">Save upload limits</button>
              </form>
            </section>
          )}
          {canServiceSettings && (
            <section className="panel settings-panel settings-media">
              <div className="settings-heading">
                <div>
                  <h2>Adaptive TV playback</h2>
                  <p className="settings-copy">
                    LessonCue prepares reusable, validated 720p and 480p H.264
                    copies and automatically falls back to software if hardware
                    conversion fails.
                  </p>
                </div>
                <span
                  className={`update-state ${bootstrap.hardwareAcceleration.available && hardwareAcceleration ? "current" : ""}`}
                >
                  {bootstrap.hardwareAcceleration.available &&
                  hardwareAcceleration
                    ? "Hardware ready"
                    : "Software ready"}
                </span>
              </div>
              <div className="storage-facts">
                <Definition
                  label="Conversion engine"
                  value={
                    bootstrap.hardwareAcceleration.available &&
                    hardwareAcceleration
                      ? bootstrap.hardwareAcceleration.engine
                      : "Software (libx264)"
                  }
                />
                {bootstrap.hardwareAcceleration.device && (
                  <Definition
                    label="Hardware device"
                    value={bootstrap.hardwareAcceleration.device}
                  />
                )}
                <Definition
                  label="Hardware checked"
                  value={
                    bootstrap.hardwareAcceleration.lastCheckedAt
                      ? timeAgo(bootstrap.hardwareAcceleration.lastCheckedAt)
                      : "Starting check"
                  }
                />
                {bootstrap.hardwareAcceleration.lastHardwareUseAt && (
                  <Definition
                    label="Last hardware use"
                    value={timeAgo(
                      bootstrap.hardwareAcceleration.lastHardwareUseAt,
                    )}
                  />
                )}
              </div>
              <p className="settings-copy">
                {bootstrap.hardwareAcceleration.message}
              </p>
              {bootstrap.hardwareAcceleration.lastError && (
                <div className="alert">
                  Most recent hardware fallback:{" "}
                  {bootstrap.hardwareAcceleration.lastError}
                </div>
              )}
              <form className="stack" onSubmit={saveAdaptiveTranscoding}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={
                      hardwareAcceleration &&
                      bootstrap.hardwareAcceleration.available
                    }
                    onChange={(e) => setHardwareAcceleration(e.target.checked)}
                    disabled={!bootstrap.hardwareAcceleration.available}
                  />{" "}
                  Use Intel hardware encoding when available
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={adaptiveTranscoding}
                    onChange={(e) => setAdaptiveTranscoding(e.target.checked)}
                  />{" "}
                  Prepare adaptive copies automatically
                </label>
                <Field
                  label="Guaranteed lead time"
                  hint="Idle capacity starts preparing new uploads immediately. This setting ensures assigned lesson media is prioritized no later than the selected number of days before class."
                >
                  <div className="number-suffix">
                    <input
                      type="number"
                      min="1"
                      max="30"
                      step="1"
                      value={transcodeLeadDays}
                      onChange={(e) => setTranscodeLeadDays(e.target.value)}
                      disabled={!adaptiveTranscoding}
                      required
                    />
                    <span>days</span>
                  </div>
                </Field>
                <div className="head-actions">
                  <button className="button primary">
                    Save playback profiles
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={checkHardware}
                    disabled={checkingHardware}
                  >
                    {checkingHardware ? "Checking…" : "Check hardware"}
                  </button>
                </div>
              </form>
            </section>
          )}
          {canServiceSettings && (
            <section className="panel settings-panel settings-connections">
              <h2>Server connection</h2>
              <Definition
                label="Browser address"
                value={`${location.protocol}//${location.host}`}
              />
              <Definition
                label="Preferred local address"
                value={bootstrap.httpPort.address}
              />
              <Definition
                label="HTTP port"
                value={String(bootstrap.httpPort.port)}
              />
              <Definition label="Server name" value={bootstrap.serverName} />
              <Definition label="Server ID" value={bootstrap.serverId} mono />
              {(bootstrap.localAddress.pending ||
                bootstrap.httpPort.pending) && (
                <div className="alert">
                  The new connection setting is being applied. The previous
                  address may remain available briefly.
                </div>
              )}
              {bootstrap.localAddress.error && (
                <p className="settings-copy">{bootstrap.localAddress.error}</p>
              )}
              {bootstrap.httpPort.error && (
                <p className="settings-copy">{bootstrap.httpPort.error}</p>
              )}
              {bootstrap.httpPort.configurable && (
                <form className="stack pairing-form" onSubmit={saveHttpPort}>
                  <Field
                    label="Browser port"
                    hint="Port 80 is the default and does not need to be typed in the browser address. If a tunnel is enabled, update its published application route after changing this port."
                  >
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      step="1"
                      value={httpPort}
                      onChange={(e) => setHttpPort(e.target.value)}
                      inputMode="numeric"
                      required
                    />
                  </Field>
                  <button className="button primary">Save browser port</button>
                </form>
              )}
              {bootstrap.localAddress.supported && (
                <form
                  className="stack pairing-form"
                  onSubmit={saveLocalAddress}
                >
                  <Field
                    label="Local browser name"
                    hint="Use letters, numbers, or hyphens. Devices on this network will open this name with .local appended."
                  >
                    <div className="number-suffix domain-suffix">
                      <input
                        value={localHostname}
                        onChange={(e) =>
                          setLocalHostname(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, "")
                              .slice(0, 63),
                          )
                        }
                        pattern="[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"
                        minLength={1}
                        maxLength={63}
                        required
                        autoComplete="off"
                      />
                      <span>.local</span>
                    </div>
                  </Field>
                  <button className="button primary">Save local address</button>
                </form>
              )}
            </section>
          )}
          {canServiceSettings && (
            <section className="panel wide-settings settings-panel settings-connections">
              <div className="settings-heading">
                <div>
                  <span className="settings-kicker">LOCAL NETWORK SECURITY</span>
                  <h2>Optional local HTTPS</h2>
                  <p className="settings-copy">
                    Browsers on a trusted private network may use local HTTP.
                    Use a local reverse proxy when this network is shared or
                    untrusted.
                  </p>
                </div>
                <span
                  className={`update-state ${location.protocol === "https:" ? "current" : "available"}`}
                >
                  {location.protocol === "https:"
                    ? "HTTPS protected"
                    : "Local HTTP"}
                </span>
              </div>
              {bootstrap.httpPort.port === 80 && (
                <div className="alert">
                  Change LessonCue’s browser port to 8080 before placing Caddy
                  on ports 80 and 443.
                </div>
              )}
              <Field label="Caddy configuration">
                <textarea readOnly rows={4} value={caddyConfig} />
              </Field>
              <div className="head-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(caddyConfig);
                    notify("Caddy configuration copied.");
                  }}
                >
                  Copy configuration
                </button>
                <a
                  className="button"
                  href="https://github.com/nickhighland/lessoncue/blob/main/docs/local-network-security.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Setup & trust instructions
                </a>
              </div>
              <p className="settings-copy">
                Do not expose LessonCue’s origin port to the internet. Remote
                access must use an HTTPS reverse proxy, VPN, or the protected
                Cloudflare option below.
              </p>
            </section>
          )}
          {canManageApp && (
            <section className="panel settings-panel settings-connections">
              <h2>Screen pairing</h2>
              <Definition
                label="Current pairing PIN"
                value={bootstrap.pairingPin || "Restricted"}
                mono
              />
              <form className="stack pairing-form" onSubmit={savePairingPin}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={fixedPairing}
                    onChange={(e) => setFixedPairing(e.target.checked)}
                  />{" "}
                  Use a fixed local PIN
                </label>
                <Field
                  label="Six-digit pairing PIN"
                  hint={
                    fixedPairing
                      ? "This PIN remains active until an administrator changes it."
                      : "Automatic mode creates a new PIN every ten minutes."
                  }
                >
                  <input
                    value={pairingPin}
                    onChange={(e) =>
                      setPairingPin(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    disabled={!fixedPairing}
                    required={fixedPairing}
                    autoComplete="off"
                  />
                </Field>
                <button className="button primary">Save pairing mode</button>
              </form>
            </section>
          )}
          {canManageApp && (
            <section className="panel settings-panel settings-connections">
              <h2>Universal controller</h2>
              <Definition
                label="Address"
                value={`${location.origin}/universalremote`}
              />
              <Definition
                label="PIN protection"
                value={
                  bootstrap.controllerPinConfigured
                    ? "Configured"
                    : "PIN not set"
                }
              />
              <p className="settings-copy">
                The universal remote can operate every paired classroom. Its PIN
                is separate from account passwords and TV pairing.
              </p>
              <form className="stack pairing-form" onSubmit={saveControllerPin}>
                <Field
                  label={
                    bootstrap.controllerPinConfigured
                      ? "New six-digit PIN"
                      : "Six-digit PIN"
                  }
                >
                  <input
                    value={controllerPin}
                    onChange={(event) =>
                      setControllerPin(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                    autoComplete="new-password"
                  />
                </Field>
                <button className="button primary">
                  {bootstrap.controllerPinConfigured
                    ? "Change controller PIN"
                    : "Set controller PIN"}
                </button>
              </form>
            </section>
          )}
          {canServiceSettings && (
            <section className="panel wide-settings cloudflare-settings settings-panel settings-connections">
              <div className="settings-heading">
                <div>
                  <h2>Optional remote access</h2>
                  <p className="settings-copy">
                    Connect this self-hosted server to your own domain with a
                    remotely managed Cloudflare Tunnel. Local access keeps
                    working and remains the default.
                  </p>
                </div>
                <span
                  className={`tunnel-state ${bootstrap.cloudflareTunnel.connected ? "connected" : bootstrap.cloudflareTunnel.enabled ? "waiting" : ""}`}
                >
                  {bootstrap.cloudflareTunnel.connected
                    ? `${bootstrap.cloudflareTunnel.activeConnections} edge connections`
                    : bootstrap.cloudflareTunnel.pending
                      ? "Applying…"
                      : bootstrap.cloudflareTunnel.enabled
                        ? "Waiting for connection"
                        : "Off"}
                </span>
              </div>
              <div className="storage-facts">
                <Definition
                  label="Public address"
                  value={
                    bootstrap.cloudflareTunnel.publicUrl || "Not configured"
                  }
                />
                <Definition
                  label="Local origin route"
                  value={bootstrap.cloudflareTunnel.originUrl}
                />
                <Definition
                  label="Connector version"
                  value={
                    bootstrap.cloudflareTunnel.cloudflaredVersion ||
                    "Preparing verified connector"
                  }
                />
                <Definition
                  label="Connector verified"
                  value={
                    bootstrap.cloudflareTunnel.cloudflaredCheckedAt
                      ? timeAgo(bootstrap.cloudflareTunnel.cloudflaredCheckedAt)
                      : "Pending first check"
                  }
                />
              </div>
              {bootstrap.cloudflareTunnel.cloudflaredUpdateError && (
                <div className="alert error">
                  Connector update:{" "}
                  {bootstrap.cloudflareTunnel.cloudflaredUpdateError}
                </div>
              )}
              {bootstrap.cloudflareTunnel.error && (
                <div className="alert error">
                  {bootstrap.cloudflareTunnel.error}
                </div>
              )}
              <ol className="tunnel-steps">
                <li>
                  Create a{" "}
                  <a
                    href="https://one.dash.cloudflare.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    remotely managed tunnel in Cloudflare
                  </a>
                  .
                </li>
                <li>
                  Add a published application hostname and point its service to{" "}
                  <code>{bootstrap.cloudflareTunnel.originUrl}</code>.
                </li>
                <li>
                  Protect the hostname with Cloudflare Access, then paste its
                  tunnel token below. LessonCue keeps a checksum-verified
                  connector ready and checks it daily.
                </li>
              </ol>
              <form className="stack" onSubmit={saveCloudflareTunnel}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={tunnelEnabled}
                    onChange={(e) => setTunnelEnabled(e.target.checked)}
                    disabled={
                      !bootstrap.cloudflareTunnel.supported || tunnelBusy
                    }
                  />{" "}
                  Enable Cloudflare Tunnel remote access
                </label>
                {tunnelEnabled && (
                  <>
                    <Field
                      label="Public hostname"
                      hint="Use the exact published application hostname configured in Cloudflare."
                    >
                      <input
                        value={tunnelHostname}
                        onChange={(e) =>
                          setTunnelHostname(e.target.value.trim().toLowerCase())
                        }
                        type="text"
                        inputMode="url"
                        placeholder="lesson.example.org"
                        required
                        autoComplete="off"
                      />
                    </Field>
                    <Field
                      label={
                        bootstrap.cloudflareTunnel.credentialConfigured
                          ? "Replace tunnel token (optional)"
                          : "Tunnel token"
                      }
                      hint="Paste the eyJ… token or Cloudflare's complete cloudflared service install command. LessonCue never returns this secret to the browser."
                    >
                      <input
                        value={tunnelToken}
                        onChange={(e) => setTunnelToken(e.target.value)}
                        type="password"
                        required={
                          !bootstrap.cloudflareTunnel.credentialConfigured
                        }
                        autoComplete="new-password"
                      />
                    </Field>
                    <label className="check-row security-confirm">
                      <input
                        type="checkbox"
                        checked={tunnelAcknowledged}
                        onChange={(e) =>
                          setTunnelAcknowledged(e.target.checked)
                        }
                        required
                      />{" "}
                      I configured Cloudflare Access, or I understand this
                      exposes the LessonCue sign-in page to the internet.
                    </label>
                  </>
                )}
                <button
                  className={`button ${tunnelEnabled ? "primary" : "danger"}`}
                  disabled={
                    tunnelBusy ||
                    bootstrap.cloudflareTunnel.pending ||
                    !bootstrap.cloudflareTunnel.supported
                  }
                >
                  {tunnelBusy
                    ? "Applying…"
                    : tunnelEnabled
                      ? bootstrap.cloudflareTunnel.enabled
                        ? bootstrap.cloudflareTunnel.connected
                          ? "Update tunnel"
                          : "Retry tunnel connection"
                        : "Install and enable tunnel"
                      : "Disable tunnel"}
                </button>
              </form>
              <p className="settings-copy">
                The connector runs as a restricted local service and uses an
                outbound-only connection. Disable it here to stop the service
                and remove its stored credential; the verified connector remains
                cached for later use and security updates.
              </p>
            </section>
          )}
          {canManageApp && (
            <section className="panel wide-settings settings-panel settings-data">
              <div className="settings-heading">
                <div>
                  <h2>Recycling bin</h2>
                  <p className="settings-copy">
                    Deleted classes, lessons, and media remain recoverable for
                    30 days. Recycled media still uses storage until it is
                    purged.
                  </p>
                </div>
                {recycleItems.length > 0 && (
                  <button className="button danger" onClick={purgeRecycleBin}>
                    Purge all
                  </button>
                )}
              </div>
              {recycleItems.length ? (
                <div className="recycle-list">
                  {recycleItems.map((item) => (
                    <div key={`${item.kind}-${item.id}`}>
                      <span className="recycle-kind">{item.kind}</span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.detail} · deleted {timeAgo(item.deletedAt)}
                          {item.deletedBy ? ` by ${item.deletedBy}` : ""}
                        </small>
                      </span>
                      <span>
                        <small>
                          Purges{" "}
                          {new Date(
                            new Date(item.deletedAt).getTime() + 30 * 86400000,
                          ).toLocaleDateString()}
                        </small>
                        <button
                          className="button"
                          onClick={() => restoreRecycleItem(item)}
                        >
                          Restore
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Recycling bin is empty"
                  body="Deleted classes, lessons, and media will appear here for 30 days."
                />
              )}
            </section>
          )}
          {canServiceSettings && canBackups && (
            <section className="panel settings-panel settings-data">
              <h2>Privacy & backups</h2>
              <div className="privacy-callout">
                <span>⌂</span>
                <div>
                  <strong>
                    {bootstrap.cloudflareTunnel.enabled
                      ? "Local-first with optional remote access"
                      : "Fully local"}
                  </strong>
                  <p>
                    The interface, database, accounts, schedules, and media live
                    on this server.{" "}
                    {bootstrap.cloudflareTunnel.enabled
                      ? "Cloudflare carries encrypted requests to this local origin; it does not become LessonCue's data store."
                      : "No hosted service is required."}
                  </p>
                </div>
              </div>
              <div className="backup-actions">
                <label>
                  <span>Encryption password</span>
                  <input
                    type="password"
                    value={backupPassword}
                    minLength={12}
                    maxLength={1024}
                    autoComplete="new-password"
                    placeholder="At least 12 characters"
                    onChange={(event) => setBackupPassword(event.target.value)}
                  />
                </label>
                <label>
                  <span>Confirm password</span>
                  <input
                    type="password"
                    value={backupPasswordConfirmation}
                    minLength={12}
                    maxLength={1024}
                    autoComplete="new-password"
                    onChange={(event) =>
                      setBackupPasswordConfirmation(event.target.value)
                    }
                  />
                </label>
                <label className="check backup-secret-choice">
                  <input
                    type="checkbox"
                    checked={backupIncludeSecrets}
                    onChange={(event) =>
                      setBackupIncludeSecrets(event.target.checked)
                    }
                  />
                  Include this server&apos;s encrypted provider credentials,
                  pairing secrets, and data-protection keys
                </label>
                <p className="settings-copy backup-password-note">
                  LessonCue never stores this password. Keep it somewhere
                  separate from the downloaded backup. Excluding server secrets
                  is safest for ordinary exports and migrations.
                </p>
                <button
                  className="button"
                  onClick={() => void backup(false)}
                  disabled={backupBusy}
                >
                  Back up settings
                </button>
                <button
                  className="button primary"
                  onClick={() => void backup(true)}
                  disabled={backupBusy}
                >
                  Full backup
                </button>
              </div>
              <form
                className="backup-policy-form"
                onSubmit={saveBackupPolicy}
              >
                <div className="settings-section-heading">
                  <div>
                    <span>AUTOMATIC RECOVERY COPIES</span>
                    <h3>Scheduled and off-server backups</h3>
                    <p>
                      Create, authenticate, verify, retain, and optionally send
                      encrypted backups to an HTTPS WebDAV folder.
                    </p>
                  </div>
                  <label className="toggle-line">
                    <input
                      type="checkbox"
                      checked={policyEnabled}
                      onChange={(event) =>
                        setPolicyEnabled(event.target.checked)
                      }
                    />
                    Enabled
                  </label>
                </div>
                {backupPolicy?.lastError && (
                  <div className="alert error" role="alert">{backupPolicy.lastError}</div>
                )}
                {backupPolicy?.overdue && !backupPolicy.lastError && (
                  <div className="alert error">
                    The most recent verified scheduled backup is overdue.
                  </div>
                )}
                {backupPolicy?.lastSucceededAt && (
                  <div className="alert success">
                    Last verified{" "}
                    {timeAgo(
                      backupPolicy.lastVerifiedAt ||
                        backupPolicy.lastSucceededAt,
                    )}
                    {backupPolicy.lastBackupFileName
                      ? ` · ${backupPolicy.lastBackupFileName}`
                      : ""}
                    {backupPolicy.nextRunAt
                      ? ` · Next ${new Date(
                          backupPolicy.nextRunAt,
                        ).toLocaleString()}`
                      : ""}
                  </div>
                )}
                <div className="two-fields">
                  <Field label="Frequency">
                    <select
                      value={policyFrequency}
                      onChange={(event) =>
                        setPolicyFrequency(
                          event.target.value as "daily" | "weekly",
                        )
                      }
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </Field>
                  <Field label={`Hour in ${bootstrap.timeZone}`}>
                    <select
                      value={policyHour}
                      onChange={(event) => setPolicyHour(event.target.value)}
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <option key={hour} value={hour}>
                          {new Date(2000, 0, 1, hour).toLocaleTimeString([], {
                            hour: "numeric",
                          })}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {policyFrequency === "weekly" && (
                  <Field label="Weekday">
                    <select
                      value={policyWeeklyDay}
                      onChange={(event) =>
                        setPolicyWeeklyDay(event.target.value)
                      }
                    >
                      {[
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ].map((day, index) => (
                        <option key={day} value={index}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="two-fields">
                  <Field label="Keep newest copies">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={policyRetentionCount}
                      onChange={(event) =>
                        setPolicyRetentionCount(event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Maximum age in days">
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={policyRetentionDays}
                      onChange={(event) =>
                        setPolicyRetentionDays(event.target.value)
                      }
                    />
                  </Field>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={policyFull}
                    onChange={(event) => setPolicyFull(event.target.checked)}
                  />
                  Include the media library
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={policyIncludeSecrets}
                    onChange={(event) =>
                      setPolicyIncludeSecrets(event.target.checked)
                    }
                  />
                  Include local provider credentials, pairing secrets, and
                  data-protection keys
                </label>
                <Field
                  label={
                    backupPolicy?.backupPasswordConfigured
                      ? "Replace scheduled-backup password (optional)"
                      : "Scheduled-backup password"
                  }
                >
                  <input
                    type="password"
                    minLength={12}
                    maxLength={1024}
                    value={policyPassword}
                    autoComplete="new-password"
                    placeholder={
                      backupPolicy?.backupPasswordConfigured
                        ? "Leave blank to keep the saved protected password"
                        : "At least 12 characters"
                    }
                    onChange={(event) => setPolicyPassword(event.target.value)}
                  />
                </Field>
                <div className="backup-remote-settings">
                  <h4>Optional HTTPS WebDAV copy</h4>
                  <p className="settings-copy">
                    Use a folder URL from a WebDAV-capable NAS or storage
                    provider. LessonCue uploads each already-encrypted `.lcbak`
                    file with HTTP PUT.
                  </p>
                  <Field label="WebDAV folder URL">
                    <input
                      type="url"
                      value={policyRemoteUrl}
                      placeholder="https://backup.example.org/lessoncue/"
                      onChange={(event) =>
                        setPolicyRemoteUrl(event.target.value)
                      }
                    />
                  </Field>
                  {policyRemoteUrl && (
                    <>
                      <div className="two-fields">
                        <Field label="Authentication">
                          <select
                            value={policyRemoteAuthentication}
                            onChange={(event) =>
                              setPolicyRemoteAuthentication(
                                event.target.value as
                                  | "none"
                                  | "basic"
                                  | "bearer",
                              )
                            }
                          >
                            <option value="none">None</option>
                            <option value="basic">Username and password</option>
                            <option value="bearer">Bearer token</option>
                          </select>
                        </Field>
                        {policyRemoteAuthentication === "basic" && (
                          <Field label="Username">
                            <input
                              value={policyRemoteUsername}
                              onChange={(event) =>
                                setPolicyRemoteUsername(event.target.value)
                              }
                            />
                          </Field>
                        )}
                      </div>
                      {policyRemoteAuthentication !== "none" && (
                        <Field
                          label={
                            backupPolicy?.remoteSecretConfigured
                              ? "Replace remote credential (optional)"
                              : policyRemoteAuthentication === "basic"
                                ? "Password"
                                : "Bearer token"
                          }
                        >
                          <input
                            type="password"
                            maxLength={4096}
                            value={policyRemoteSecret}
                            autoComplete="new-password"
                            placeholder={
                              backupPolicy?.remoteSecretConfigured
                                ? "Leave blank to keep the saved protected credential"
                                : ""
                            }
                            onChange={(event) =>
                              setPolicyRemoteSecret(event.target.value)
                            }
                          />
                        </Field>
                      )}
                    </>
                  )}
                </div>
                <div className="head-actions">
                  <button
                    className="button primary"
                    disabled={backupPolicyBusy}
                  >
                    {backupPolicyBusy ? "Working…" : "Save backup policy"}
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => void runBackupPolicy()}
                    disabled={
                      backupPolicyBusy ||
                      !backupPolicy?.backupPasswordConfigured
                    }
                  >
                    Create and verify now
                  </button>
                </div>
              </form>
              <form
                className="backup-restore-upload"
                onSubmit={previewBackupRestore}
              >
                <label>
                  <span>Restore a LessonCue backup</span>
                  <input
                    name="file"
                    type="file"
                    accept=".lcbak,.zip,application/vnd.lessoncue.backup,application/zip"
                    required
                    disabled={restoreBusy}
                  />
                </label>
                <label>
                  <span>Backup password</span>
                  <input
                    name="password"
                    type="password"
                    value={restorePassword}
                    maxLength={1024}
                    autoComplete="current-password"
                    placeholder="Required for .lcbak files"
                    onChange={(event) => setRestorePassword(event.target.value)}
                  />
                </label>
                <button className="button" disabled={restoreBusy}>
                  {restoreBusy ? "Validating…" : "Validate and preview"}
                </button>
              </form>
              <form
                className="migration-pull-form"
                onSubmit={previewMigration}
              >
                <div>
                  <span className="settings-kicker">SERVER MIGRATION</span>
                  <h3>Move from another LessonCue server</h3>
                  <p className="settings-copy">
                    Pull a one-time encrypted backup directly over the local
                    network or HTTPS, then review the normal restore preview.
                  </p>
                </div>
                <Field label="Source LessonCue address">
                  <input
                    type="url"
                    required
                    value={migrationSourceAddress}
                    placeholder="http://192.168.1.50 or https://lesson.example.org"
                    onChange={(event) =>
                      setMigrationSourceAddress(event.target.value)
                    }
                  />
                </Field>
                <Field label="One-time transfer token">
                  <input
                    required
                    minLength={64}
                    maxLength={64}
                    value={migrationToken}
                    autoComplete="off"
                    onChange={(event) =>
                      setMigrationToken(event.target.value)
                    }
                  />
                </Field>
                <Field label="Backup password">
                  <input
                    type="password"
                    required
                    value={migrationPassword}
                    maxLength={1024}
                    autoComplete="current-password"
                    onChange={(event) =>
                      setMigrationPassword(event.target.value)
                    }
                  />
                </Field>
                <button
                  className="button"
                  disabled={migrationBusy}
                >
                  {migrationBusy
                    ? "Transferring and validating…"
                    : "Transfer and preview"}
                </button>
              </form>
              {backups.slice(0, 4).map((item) => (
                <div className="backup-row backup-row-actions" key={item.id}>
                  <a href={`/api/v1/backups/${item.id}/file`}>
                    <span>{item.kind} · {formatBytes(item.sizeBytes)}</span>
                    <small>{new Date(item.createdAt).toLocaleString()}</small>
                  </a>
                  <button
                    className="button"
                    onClick={() => void verifyBackup(item)}
                  >
                    Run restore drill
                  </button>
                  <button
                    className="button"
                    onClick={() => void createMigrationLink(item)}
                    disabled={migrationBusy}
                  >
                    Transfer
                  </button>
                </div>
              ))}
            </section>
          )}
          {canManageApp && (
            <section className="panel settings-panel settings-data">
              <h2>Recent activity</h2>
              <div className="audit-list">
                {audit.slice(0, 8).map((item) => (
                  <div key={item.id}>
                    <span>{item.action.replaceAll(".", " ")}</span>
                    <small>
                      {item.actor} · {timeAgo(item.timestamp)}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          )}
          {canServiceSettings && <TroubleshootingLogPanel notify={notify} />}
          {canServiceSettings && (
            <section className="panel settings-panel settings-data">
              <h2>Server commands</h2>
              <pre>
                sudo systemctl status lessoncue{`\n`}sudo journalctl -u
                lessoncue -f{`\n`}sudo systemctl restart lessoncue
                {bootstrap.cloudflareTunnel.enabled
                  ? `\n\nsudo systemctl status lessoncue-cloudflared\nsudo journalctl -u lessoncue-cloudflared -f`
                  : ""}
              </pre>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
