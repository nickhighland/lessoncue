import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function silentWav(marker = 0) {
  const sampleRate = 8_000;
  const dataBytes = sampleRate * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + dataBytes, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(dataBytes, 40);
  buffer[buffer.length - 1] = marker;
  return buffer;
}

function onePagePdf() {
  const content = "BT /F1 24 Tf 72 700 Td (LessonCue PDF slide) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(value)); value += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(value);
  value += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) value += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  value += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(value);
}

function dateDaysFromNow(days: number) {
  const value = new Date(); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function incompatibleVideo() {
  const path = join(tmpdir(), `lessoncue-incompatible-${Date.now()}.mp4`);
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=15", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "1", "-c:v", "mpeg4", "-q:v", "5", "-c:a", "mp3", "-shortest", path]);
    return readFileSync(path);
  } finally { rmSync(path, { force: true }); }
}

test("fresh local server supports setup, direct lesson upload, retention, and online media", async ({ page }) => {
  const scheduleStart = dateDaysFromNow(7);
  const scheduleDate = dateDaysFromNow(14);
  const scheduleEnd = dateDaysFromNow(21);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create your local administrator" })).toBeVisible();
  await page.getByLabel("Organization name").fill("LessonCue Browser Test");
  await page.getByLabel("Your name").fill("Test Administrator");
  await page.getByLabel("Username").fill("browser-admin");
  await page.locator('input[type="password"]').fill("LessonCueTest42");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ })).toBeVisible();

  await page.getByRole("button", { name: /Classes$/ }).click();
  await page.getByRole("button", { name: /Sample Lesson/ }).first().click();
  await expect(page.getByRole("heading", { name: "Sample Lesson" })).toBeVisible();

  await page.getByRole("button", { name: "Add media" }).click();
  const uploadForm = page.locator("form").filter({ has: page.getByLabel("Media file") });
  await uploadForm.getByLabel("Media file").setInputFiles({
    name: "browser-test-audio.wav",
    mimeType: "audio/wav",
    buffer: silentWav(),
  });
  await uploadForm.getByLabel("Display title").fill("Browser Test Audio");
  await uploadForm.getByRole("button", { name: "Upload and add" }).click();
  await expect(page.getByText("1 file added. It will be deleted four weeks after", { exact: false })).toBeVisible();
  await expect(page.getByText("Browser Test Audio", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add media" }).click();
  const multiUploadForm = page.locator("form").filter({ has: page.getByLabel("Media files") });
  await multiUploadForm.getByLabel("Media files").setInputFiles([
    { name: "bulk-cue-one.wav", mimeType: "audio/wav", buffer: silentWav(1) },
    { name: "bulk-cue-two.wav", mimeType: "audio/wav", buffer: silentWav(2) },
  ]);
  await multiUploadForm.getByRole("button", { name: "Upload and add" }).click();
  await expect(page.getByText("2 files added.", { exact: false })).toBeVisible();
  await expect(page.getByText("bulk-cue-one.wav", { exact: true })).toBeVisible();
  await expect(page.getByText("bulk-cue-two.wav", { exact: true })).toBeVisible();
  await page.getByLabel("Select cue bulk-cue-one.wav").check();
  await page.getByLabel("Select cue bulk-cue-two.wav").check();
  await page.getByLabel("Bulk cue action").selectOption("volume");
  await page.locator('.cue-bulk-actions input[name="volumePercent"]').fill("65");
  await page.locator(".cue-bulk-actions").getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("2 playlist cues updated.", { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const lessons = await fetch("/api/v1/lessons").then(response => response.json());
    const lesson = lessons.find((item: { title: string }) => item.title === "Sample Lesson");
    return lesson.items.filter((item: { title: string }) => item.title.startsWith("bulk-cue-")).map((item: { volumePercent: number }) => item.volumePercent).join(",");
  })).toBe("65,65");

  await page.getByRole("button", { name: "Add media" }).click();
  const videoUploadForm = page.locator("form").filter({ has: page.getByLabel("Media file") });
  await videoUploadForm.getByLabel("Media file").setInputFiles({
    name: "needs-tv-conversion.avi",
    mimeType: "application/octet-stream",
    buffer: incompatibleVideo(),
  });
  await videoUploadForm.getByLabel("Display title").fill("Browser Compatibility Video");
  await videoUploadForm.getByRole("button", { name: "Upload and add" }).click();
  await expect(page.getByText("Browser Compatibility Video", { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const items = await fetch("/api/v1/media").then(response => response.json());
    const item = items.find((value: { fileName: string }) => value.fileName === "needs-tv-conversion.avi");
    return `${item?.processingStatus}:${item?.compatibilityStatus}`;
  }), { timeout: 60_000 }).toBe("ready:ready");
  const playbackDelivery = await page.evaluate(async () => {
    const items = await fetch("/api/v1/media").then(response => response.json());
    const item = items.find((value: { fileName: string }) => value.fileName === "needs-tv-conversion.avi");
    const response = await fetch(item.playbackUrl);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { contentType: response.headers.get("content-type"), signature: String.fromCharCode(...bytes.slice(4, 8)) };
  });
  expect(playbackDelivery).toEqual({ contentType: "video/mp4", signature: "ftyp" });
  const adaptiveProfiles = await page.evaluate(async () => {
    const media = await fetch("/api/v1/media").then(response => response.json());
    const item = media.find((value: { fileName: string }) => value.fileName === "needs-tv-conversion.avi");
    const queued = await fetch(`/api/v1/media/${item.id}/transcodes/all`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    return { id: item.id, queued: queued.status };
  });
  expect(adaptiveProfiles.queued).toBe(202);
  await expect.poll(async () => page.evaluate(async id => {
    const media = await fetch("/api/v1/media").then(response => response.json());
    return media.find((item: { id: string }) => item.id === id)?.transcodes.map((item: { profile: string; status: string }) => `${item.profile}:${item.status}`).sort().join(",");
  }, adaptiveProfiles.id), { timeout: 60_000 }).toBe("h264-480:ready,h264-720:ready");
  const adaptiveDelivery = await page.evaluate(async id => {
    const response = await fetch(`/api/v1/media/${id}/transcodes/h264-480`, { headers: { Range: "bytes=0-31" } });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, type: response.headers.get("content-type"), signature: String.fromCharCode(...bytes.slice(4, 8)) };
  }, adaptiveProfiles.id);
  expect(adaptiveDelivery).toEqual({ status: 206, type: "video/mp4", signature: "ftyp" });

  await page.reload();
  await page.getByRole("button", { name: /Classes$/ }).click();
  await page.getByRole("button", { name: /Sample Lesson/ }).first().click();
  const videoCue = page.locator(".playlist-item").filter({ hasText: "Browser Compatibility Video" });
  await videoCue.getByRole("button", { name: "▥ Edit visual timeline, trims & fades" }).click();
  await expect(page.getByRole("heading", { name: "Visual timeline & fades: Browser Compatibility Video" })).toBeVisible();
  await page.getByLabel("Fade in · 0.0s").fill("0.4");
  await page.getByLabel("Fade out · 0.0s").fill("0.4");
  const visualFade = page.locator(".timeline-player .visual-fade-overlay");
  await expect(visualFade).toBeAttached();
  await page.locator(".timeline-player video").evaluate((video: HTMLVideoElement) => { video.currentTime = 0; video.dispatchEvent(new Event("timeupdate")); });
  await expect.poll(() => visualFade.evaluate(element => Number((element as HTMLElement).style.opacity))).toBeGreaterThan(.95);
  await page.locator(".timeline-player video").evaluate((video: HTMLVideoElement) => { video.currentTime = .2; video.dispatchEvent(new Event("timeupdate")); });
  await expect.poll(() => visualFade.evaluate(element => Number((element as HTMLElement).style.opacity))).toBeGreaterThan(.35);
  await expect.poll(() => visualFade.evaluate(element => Number((element as HTMLElement).style.opacity))).toBeLessThan(.65);
  await page.getByRole("button", { name: "Save timeline and markers" }).click();
  await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();

  await page.getByRole("button", { name: "Add media" }).click();
  const onlineForm = page.locator("form").filter({ has: page.getByLabel("Webpage or YouTube URL") });
  await onlineForm.getByLabel("Webpage or YouTube URL").fill("https://example.org/learning");
  await onlineForm.getByLabel("Display title").fill("Online Learning Page");
  await onlineForm.getByRole("button", { name: "Add online media" }).click();
  await expect(page.getByText("Online media added to the lesson.", { exact: false })).toBeVisible();
  await expect(page.getByText("Online Learning Page", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Media Library$/ }).click();
  const audioRow = page.locator(".media-table").filter({ hasText: "browser-test-audio.wav" });
  await expect(audioRow).toBeVisible();
  await expect(audioRow.getByRole("button", { name: /Deletes/ })).toBeVisible();
  await expect(page.locator(".media-table").filter({ hasText: "Online Learning Page" })).toBeVisible();

  await audioRow.getByRole("button", { name: "Manage versions & impact" }).click();
  await expect(page.getByRole("heading", { name: "Manage: browser-test-audio.wav" })).toBeVisible();
  await expect(page.getByText("Sample Lesson", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Rename, folder & tags" }).click();
  const organizeDialog = page.getByRole("dialog", { name: "Organize: browser-test-audio.wav" });
  await organizeDialog.getByRole("textbox", { name: /^Folder/ }).fill("Audio/Classroom");
  await organizeDialog.getByRole("textbox", { name: /^Tags/ }).fill("welcome, reusable");
  await organizeDialog.getByRole("button", { name: "Save organization" }).click();
  await expect(page.getByText("1 media item organized.", { exact: false })).toBeVisible();
  await expect(page.locator(".media-table").filter({ hasText: "Audio/Classroom" })).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const items = await fetch("/api/v1/media").then(response => response.json());
    return items.find((item: { fileName: string }) => item.fileName === "browser-test-audio.wav")?.processingStatus;
  }), { timeout: 30_000 }).toBe("ready");

  await page.getByLabel("Select bulk-cue-one.wav").check();
  await page.getByLabel("Select bulk-cue-two.wav").check();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  const bulkRenameDialog = page.getByRole("dialog", { name: "Rename 2 selected media items" });
  await bulkRenameDialog.getByLabel("Name prefix").fill("Term A —");
  await bulkRenameDialog.getByRole("button", { name: "Rename selected media" }).click();
  await expect(page.getByText("2 media items renamed.", { exact: false })).toBeVisible();
  await expect(page.locator(".media-table").filter({ hasText: "Term A — bulk-cue-one.wav" })).toBeVisible();
  await expect(page.locator(".media-table").filter({ hasText: "Term A — bulk-cue-two.wav" })).toBeVisible();

  const organizedRow = page.locator(".media-table").filter({ hasText: "browser-test-audio.wav" });
  await organizedRow.getByRole("button", { name: "Manage versions & impact" }).click();
  await page.getByLabel("Replace current file").setInputFiles({ name: "browser-test-audio-v2.wav", mimeType: "audio/wav", buffer: silentWav(1) });
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Preview impact and replace" }).click();
  await expect(page.getByText("previous version remains available", { exact: false })).toBeVisible();
  const replacedRow = page.locator(".media-table").filter({ hasText: "browser-test-audio-v2.wav" });
  await expect(replacedRow).toContainText("v2");
  await replacedRow.getByRole("button", { name: "Manage versions & impact" }).click();
  await expect(page.getByText("v1 · browser-test-audio.wav", { exact: false })).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("restored as a new current version", { exact: false })).toBeVisible();
  await expect(page.locator(".media-table").filter({ hasText: "browser-test-audio.wav" })).toContainText("v3");

  await page.getByRole("button", { name: "Upload media" }).click();
  const uploadDialog = page.getByRole("dialog", { name: "Upload media" });
  await uploadDialog.getByLabel("Files").setInputFiles({ name: "one-page-handout.pdf", mimeType: "application/pdf", buffer: onePagePdf() });
  await uploadDialog.getByRole("button", { name: "Upload to local server" }).click();
  await expect(page.getByText("stored until four weeks", { exact: false })).toBeVisible();
  const pdfRow = page.locator(".media-table").filter({ hasText: "one-page-handout.pdf" });
  await pdfRow.getByRole("button", { name: "Manage versions & impact" }).click();
  await page.getByRole("button", { name: "Convert to slides" }).click();
  await expect(page.getByText("queued for fully local slide conversion", { exact: false })).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const items = await fetch("/api/v1/media").then(response => response.json());
    return items.find((item: { fileName: string }) => item.fileName === "one-page-handout.pdf")?.conversionStatus;
  }), { timeout: 30_000 }).toBe("ready");
  await page.reload();
  await page.getByRole("button", { name: /Media Library$/ }).click();
  const convertedPdfRow = page.locator(".media-table").filter({ hasText: "one-page-handout.pdf" });
  await convertedPdfRow.getByRole("button", { name: "Manage versions & impact" }).click();
  await expect(page.getByText("1 screen-ready slides", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Add slide sequence" }).click();
  await expect(page.getByText("1 converted slides added to the lesson", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: /Templates$/ }).click();
  await page.getByRole("button", { name: "New template" }).click();
  const templateDialog = page.getByRole("dialog", { name: "Create template from a lesson" });
  await templateDialog.getByLabel("Template name").fill("Reusable Browser Lesson");
  await templateDialog.getByLabel("Description").fill("A complete local template used by the browser release test.");
  await templateDialog.getByRole("button", { name: "Create reusable template" }).click();
  await expect(page.getByText("Reusable lesson template created.", { exact: false })).toBeVisible();
  const templateCard = page.locator(".template-card").filter({ hasText: "Reusable Browser Lesson" });
  await expect(templateCard).toContainText("Pre-roll");
  await expect.poll(() => page.evaluate(async () => {
    const templates = await fetch("/api/v1/lesson-templates").then(response => response.json());
    return templates.find((item: { name: string }) => item.name === "Reusable Browser Lesson")?.items
      .some((item: { title: string }) => item.title === "Online Learning Page");
  })).toBe(true);

  await page.getByRole("button", { name: "New schedule" }).click();
  const scheduleDialog = page.getByRole("dialog", { name: "Create recurring schedule" });
  await scheduleDialog.getByLabel("Schedule name").fill("Browser Test Term");
  await scheduleDialog.getByLabel("Recurrence").selectOption("custom");
  await scheduleDialog.getByRole("textbox", { name: /^Term or custom dates/ }).fill(scheduleDate);
  await scheduleDialog.getByLabel("Begins").fill(scheduleStart);
  await scheduleDialog.getByLabel("Ends (optional)").fill(scheduleEnd);
  await scheduleDialog.getByRole("button", { name: "Save and generate lessons" }).click();
  await expect(page.getByText("Recurring schedule saved and upcoming lessons generated.", { exact: false })).toBeVisible();
  const scheduleCard = page.locator(".schedule-card").filter({ hasText: "Browser Test Term" });
  await expect(scheduleCard.locator(".schedule-count")).toContainText("1");
  await scheduleCard.getByLabel("Skip date for Browser Test Term").fill(scheduleDate);
  await scheduleCard.getByRole("button", { name: "Skip date" }).click();
  await expect(page.getByText("Date skipped and its generated lesson removed.", { exact: false })).toBeVisible();
  await expect(scheduleCard.locator(".schedule-count")).toContainText("0");
  await scheduleCard.locator(".exception-chips button").click();
  await expect(page.getByText("Date restored to the schedule.", { exact: false })).toBeVisible();
  await expect(scheduleCard.locator(".schedule-count")).toContainText("1");

  await page.getByRole("button", { name: /Settings$/ }).click();
  await expect(page.getByRole("heading", { name: "Optional remote access" })).toBeVisible();
  await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
  const unsupportedTunnel = await page.evaluate(async () => {
    const response = await fetch("/api/v1/cloudflare-tunnel", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, publicHostname: "lesson.example.org", token: `eyJ${"a".repeat(77)}`, acknowledgedRemoteExposure: true }) });
    return { status: response.status, body: await response.json() };
  });
  expect(unsupportedTunnel.status).toBe(400);
  expect(unsupportedTunnel.body.error).toContain("native Linux installation");
  const universalPanel = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "Universal controller" }) });
  await universalPanel.getByLabel("Six-digit PIN").fill("482731");
  await universalPanel.getByRole("button", { name: "Set controller PIN" }).click();
  await expect(page.getByText("Universal controller PIN saved.", { exact: false })).toBeVisible();
  const controllerSecurity = await page.evaluate(async () => {
    const headers = { "Content-Type": "application/json" };
    const unlock = (pin: string) => fetch("/api/v1/controller/unlock", { method: "POST", headers, body: JSON.stringify({ pin }) });
    const denied = await unlock("000000");
    const accepted = await unlock("482731");
    const classes = await fetch("/api/v1/classes").then(response => response.json());
    const lesson = (await fetch("/api/v1/lessons").then(response => response.json()))[0];
    const updated = await fetch(`/api/v1/classes/${classes[0].id}`, { method: "PUT", headers,
      body: JSON.stringify({ name: classes[0].name, description: classes[0].description, controllerSlug: "browser-room", controllerColor: "#316b83", controllerHostname: null }) });
    const created = await fetch("/api/v1/controller/sessions", { method: "POST", headers,
      body: JSON.stringify({ classId: classes[0].id, lessonId: lesson.id, expiresInMinutes: 15 }) });
    const temporary = await created.json();
    const resolved = await fetch(`/api/v1/controller/sessions/${temporary.token}`);
    return { denied: denied.status, accepted: accepted.status, updated: updated.status, created: created.status,
      resolved: resolved.status, path: temporary.path, scope: await resolved.json() };
  });
  expect(controllerSecurity).toMatchObject({ denied: 403, accepted: 200, updated: 200, created: 201, resolved: 200,
    path: expect.stringMatching(/^\/session\/[0-9a-f]{48}$/), scope: { lessonId: expect.any(String) } });
  await page.getByRole("button", { name: "Full backup" }).click();
  await expect(page.getByText("Full backup created.", { exact: false })).toBeVisible();
  const fullBackupLink = page.locator("a.backup-row").filter({ hasText: "full" });
  await expect(fullBackupLink).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await fullBackupLink.click();
  const backupDownload = await downloadPromise;
  const backupPath = await backupDownload.path();
  expect(backupPath).not.toBeNull();

  await page.getByLabel("Organization", { exact: true }).fill("Changed Organization");
  await page.getByRole("button", { name: "Save organization & appearance" }).click();
  await expect(page.getByText("Organization settings saved.", { exact: false })).toBeVisible();

  await page.getByLabel("Restore a LessonCue backup").setInputFiles(backupPath!);
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(page.getByRole("heading", { name: "Review backup restore" })).toBeVisible();
  await expect(page.getByText("LessonCue Browser Test", { exact: true })).toBeVisible();
  await page.getByLabel("Type RESTORE to continue").fill("RESTORE");
  await page.getByRole("button", { name: "Create safety backup and restore" }).click();
  await expect(page.getByRole("heading", { name: "Restore complete" })).toBeVisible();
  await expect(page.getByText("A full safety backup was created first", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Reload restored LessonCue" }).click();
  await expect(page.getByText("LessonCue Browser Test", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Media Library$/ }).click();
  const restoredVersionRow = page.locator(".media-table").filter({ hasText: "browser-test-audio.wav" });
  await expect(restoredVersionRow).toContainText("Audio/Classroom");
  await expect(restoredVersionRow).toContainText("v3");
  await expect(page.locator(".media-table").filter({ hasText: "one-page-handout.pdf" })).toBeVisible();
  await expect(page.locator(".media-table").filter({ hasText: "needs-tv-conversion.avi" })).toContainText("TV copy ready");
  await expect(page.locator(".media-table").filter({ hasText: "one-page-handout — Slide 1" })).toBeVisible();
  await page.getByRole("button", { name: /Classes$/ }).click();
  await page.getByRole("button", { name: /Sample Lesson/ }).first().click();
  await expect(page.getByText("one-page-handout — Slide 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Templates$/ }).click();
  await expect(page.locator(".template-card").filter({ hasText: "Reusable Browser Lesson" })).toBeVisible();
  await expect(page.locator(".schedule-card").filter({ hasText: "Browser Test Term" })).toContainText("1");

  const diagnostics = await page.evaluate(async () => {
    const jsonHeaders = { "Content-Type": "application/json" };
    const bootstrap = await fetch("/api/v1/admin/bootstrap").then(response => response.json());
    const classes = await fetch("/api/v1/classes").then(response => response.json());
    const pairing = await fetch("/api/v1/pairing/request", { method: "POST", headers: jsonHeaders,
      body: JSON.stringify({ deviceName: "Browser Test TV", platform: "android-tv", appVersion: "0.18.0" }) }).then(response => response.json());
    const identity = await fetch("/api/v1/pairing/confirm", { method: "POST", headers: jsonHeaders,
      body: JSON.stringify({ requestId: pairing.requestId, pin: bootstrap.pairingPin }) }).then(response => response.json());
    const deviceHeaders = { ...jsonHeaders, Authorization: `Bearer ${identity.deviceToken}` };
    await fetch("/api/v1/tv/status", { method: "POST", headers: deviceHeaders, body: JSON.stringify({
      screenId: identity.screenId, appVersion: "0.18.0", online: true, freeBytes: 4_000_000_000,
      manifestVersion: 12, failedDownloads: 1, cachedItems: 1, totalItems: 2,
      clientTimeUnixMs: Date.now() + 6_000, networkLatencyMs: 500,
      cacheInventory: [{ itemId: "cached-1", title: "Cached welcome", state: "cached", sizeBytes: 1_024, expectedBytes: 1_024 }],
      downloadQueue: [{ itemId: "queued-1", title: "Queued lesson", state: "downloading", bytesDownloaded: 512, expectedBytes: 2_048 }],
      codecCapabilities: [{ kind: "video", codec: "H.264 / AVC", supported: true, detail: "video/avc" }],
      recentErrors: [{ timestamp: new Date().toISOString(), area: "download", message: "Test retry", itemId: "queued-1" }]
    }) });
    await fetch(`/api/v1/screens/${identity.screenId}`, { method: "PATCH", headers: jsonHeaders,
      body: JSON.stringify({ assignedClassId: classes[0].id, allowDiagnosticScreenshots: true }) });
    const screenshotRequest = await fetch(`/api/v1/screens/${identity.screenId}/diagnostics/screenshot-request`,
      { method: "POST", headers: jsonHeaders, body: "{}" }).then(response => response.json());
    const control = await fetch(`/api/v1/screens/${identity.screenId}/control`, { headers: { Authorization: `Bearer ${identity.deviceToken}` } }).then(response => response.json());
    const jpeg = Uint8Array.from(atob("/9j/4AAQSkZJRgABAQAAAQABAAD/2Q=="), character => character.charCodeAt(0));
    const upload = await fetch(`/api/v1/tv/screens/${identity.screenId}/diagnostics/screenshot/${screenshotRequest.requestId}`,
      { method: "PUT", headers: { Authorization: `Bearer ${identity.deviceToken}`, "Content-Type": "image/jpeg" }, body: jpeg });
    const screens = await fetch("/api/v1/screens").then(response => response.json());
    const screen = screens.find((item: { id: string }) => item.id === identity.screenId);
    const manifest = await fetch(`/api/v1/screens/${identity.screenId}/manifest`, { headers: { Authorization: `Bearer ${identity.deviceToken}` } }).then(response => response.json());
    const adaptiveItem = manifest.playlists.flatMap((playlist: { items: unknown[] }) => playlist.items)
      .find((item: { title: string }) => item.title === "Browser Compatibility Video");
    const screenshot = await fetch(`/api/v1/screens/${identity.screenId}/diagnostics/screenshot`);
    return { upload: upload.status, screenshot: screenshot.status, requestMatches: control.screenshotRequestId === screenshotRequest.requestId,
      cache: JSON.parse(screen.cacheInventoryJson)[0]?.title, quality: screen.networkQuality, screenshotAvailable: screen.screenshotAvailable,
      requestedProfile: adaptiveItem?.requestedProfile, selectedProfile: adaptiveItem?.selectedProfile };
  });
  expect(diagnostics).toEqual({ upload: 202, screenshot: 200, requestMatches: true, cache: "Cached welcome", quality: "poor", screenshotAvailable: true,
    requestedProfile: "h264-480", selectedProfile: "h264-480" });

  await page.getByRole("button", { name: /Screens$/ }).click();
  await expect(page.locator('input.screen-name-input[value="Browser Test TV"]')).toBeVisible();
  await page.getByRole("button", { name: "View diagnostics" }).click();
  await expect(page.getByText("Cached welcome", { exact: true })).toBeVisible();
  await expect(page.locator(".codec-list > span")).toContainText("H.264 / AVC");
  await expect(page.getByAltText("Diagnostic screenshot from Browser Test TV")).toBeVisible();

  await page.getByRole("button", { name: /Classes$/ }).click();
  await page.getByRole("button", { name: "Controller link" }).click();
  const controllerDialog = page.getByRole("dialog", { name: /controller$/ });
  await expect(controllerDialog.getByAltText(/QR code for/)).toBeVisible();
  await expect(controllerDialog.getByText(/\/room\/browser-room/)).toBeVisible();
  await controllerDialog.getByRole("button", { name: "Close" }).click();
  const recycleWorkflow = await page.evaluate(async () => {
    const headers = { "Content-Type": "application/json" };
    const classes = await fetch("/api/v1/classes").then(response => response.json());
    const lessons = await fetch("/api/v1/lessons").then(response => response.json());
    const media = await fetch("/api/v1/media").then(response => response.json());
    const lesson = lessons.find((item: { classId: string }) => item.classId === classes[0].id);
    const asset = media.find((item: { fileName: string }) => item.fileName === "Online Learning Page");
    const recycleClass = await fetch(`/api/v1/classes/${classes[0].id}`, { method: "DELETE" });
    const afterClassDelete = await fetch("/api/v1/recycle-bin").then(response => response.json());
    const restoreClass = await fetch(`/api/v1/recycle-bin/class/${classes[0].id}/restore`, { method: "POST", headers, body: "{}" });
    const recycleLesson = await fetch(`/api/v1/lessons/${lesson.id}`, { method: "DELETE" });
    const restoreLesson = await fetch(`/api/v1/recycle-bin/lesson/${lesson.id}/restore`, { method: "POST", headers, body: "{}" });
    const recycleMedia = await fetch("/api/v1/media/bulk", { method: "POST", headers,
      body: JSON.stringify({ mediaIds: [asset.id], action: "delete" }) });
    const restoreMedia = await fetch(`/api/v1/recycle-bin/media/${asset.id}/restore`, { method: "POST", headers, body: "{}" });
    const disposable = await fetch("/api/v1/classes", { method: "POST", headers,
      body: JSON.stringify({ name: "Disposable Browser Class", description: "Purge verification" }) }).then(response => response.json());
    await fetch(`/api/v1/classes/${disposable.id}`, { method: "DELETE" });
    const purge = await fetch("/api/v1/recycle-bin", { method: "DELETE" });
    return { statuses: [recycleClass.status, restoreClass.status, recycleLesson.status, restoreLesson.status, recycleMedia.status, restoreMedia.status, purge.status],
      classEntries: afterClassDelete.filter((item: { kind: string }) => item.kind === "class").length,
      lessonEntries: afterClassDelete.filter((item: { kind: string }) => item.kind === "lesson").length,
      purged: (await purge.json()).purged };
  });
  expect(recycleWorkflow).toEqual({ statuses: [204, 204, 204, 204, 200, 204, 200], classEntries: 1, lessonEntries: expect.any(Number), purged: 1 });
  expect(recycleWorkflow.lessonEntries).toBeGreaterThan(0);
  const quickCreate = page.locator("form.quick-create");
  await quickCreate.locator('input[name="title"]').fill("Bulk Lesson One");
  await quickCreate.locator('input[name="date"]').fill(dateDaysFromNow(35));
  await quickCreate.getByRole("button", { name: "Create lesson" }).click();
  await page.getByRole("button", { name: /Back to/ }).click();
  await quickCreate.locator('input[name="title"]').fill("Bulk Lesson Two");
  await quickCreate.locator('input[name="date"]').fill(dateDaysFromNow(42));
  await quickCreate.getByRole("button", { name: "Create lesson" }).click();
  await page.getByRole("button", { name: /Back to/ }).click();
  await page.getByLabel("Select lesson Bulk Lesson One").check();
  await page.getByLabel("Select lesson Bulk Lesson Two").check();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  const lessonBulkDialog = page.getByRole("dialog", { name: "Bulk edit 2 lessons" });
  await lessonBulkDialog.getByLabel("Action").selectOption("prefix-title");
  await lessonBulkDialog.getByRole("textbox", { name: "Prefix", exact: true }).fill("Batch —");
  await lessonBulkDialog.getByRole("button", { name: "Apply to selected lessons" }).click();
  await expect(page.getByText("Batch — Bulk Lesson One", { exact: true })).toBeVisible();
  await expect(page.getByText("Batch — Bulk Lesson Two", { exact: true })).toBeVisible();
  const lessonBulkApi = await page.evaluate(async () => {
    const headers = { "Content-Type": "application/json" };
    const lessons = await fetch("/api/v1/lessons").then(response => response.json());
    const selected = lessons.filter((item: { title: string }) => item.title.startsWith("Batch — Bulk Lesson"));
    const targetClass = await fetch("/api/v1/classes", { method: "POST", headers,
      body: JSON.stringify({ name: "Bulk Destination", description: "Bulk action verification" }) }).then(response => response.json());
    const apply = (action: string, extras = {}) => fetch("/api/v1/lessons/bulk", { method: "POST", headers,
      body: JSON.stringify({ lessonIds: selected.map((item: { id: string }) => item.id), action, ...extras }) });
    const archive = await apply("archive");
    const restore = await apply("restore");
    const shift = await apply("shift", { shiftDays: 7 });
    const move = await apply("move", { classId: targetClass.id });
    const moved = await fetch("/api/v1/lessons").then(response => response.json());
    const updated = moved.filter((item: { id: string }) => selected.some((original: { id: string }) => original.id === item.id));
    const remove = await apply("delete");
    return { statuses: [archive.status, restore.status, shift.status, move.status, remove.status], moved: updated.every((item: { classId: string }) => item.classId === targetClass.id),
      shifted: updated.every((item: { date: string }, index: number) => item.date !== selected[index].date) };
  });
  expect(lessonBulkApi).toEqual({ statuses: [200, 200, 200, 200, 200], moved: true, shifted: true });

  await page.getByRole("button", { name: /Users$/ }).click();
  await page.getByRole("button", { name: "Add user" }).click();
  const userDialog = page.getByRole("dialog", { name: "Add a local user" });
  await userDialog.getByLabel("Name", { exact: true }).fill("Playback Volunteer");
  await userDialog.getByLabel("Username").fill("playback-volunteer");
  await userDialog.getByRole("combobox", { name: /Role/ }).selectOption("Viewer");
  await userDialog.getByLabel("Customize this role").check();
  await userDialog.getByRole("button", { name: /^Live playback/ }).click();
  await expect(userDialog.getByRole("button", { name: /Live playback/ })).toHaveAttribute("aria-pressed", "true");
  await userDialog.getByLabel("Temporary password").fill("PlaybackOnly42");
  await userDialog.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText("Local user created.", { exact: false })).toBeVisible();
  const volunteerRow = page.locator(".user-row").filter({ hasText: "Playback Volunteer" });
  await expect(volunteerRow).toContainText("1 of 8 permissions · custom");

  await page.getByRole("button", { name: /Test Administrator.*Sign out/ }).click();
  await page.getByLabel("Username").fill("playback-volunteer");
  await page.getByLabel("Password").fill("PlaybackOnly42");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: /Controller$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Classes$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Users$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Settings$/ })).toHaveCount(0);
  const permissionStatuses = await page.evaluate(async () => ({
    planning: (await fetch("/api/v1/classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Denied", description: "" }) })).status,
    users: (await fetch("/api/v1/users")).status,
    recycle: (await fetch("/api/v1/recycle-bin")).status,
    playback: (await fetch("/api/v1/screens/00000000-0000-0000-0000-000000000000/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop" }) })).status,
  }));
  expect(permissionStatuses).toEqual({ planning: 403, users: 403, recycle: 403, playback: 404 });
});
