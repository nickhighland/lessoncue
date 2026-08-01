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

function onePagePdf(label = "LessonCue PDF slide") {
  const safeLabel = label.replace(/[()\\]/g, "");
  const content = `BT /F1 24 Tf 72 700 Td (${safeLabel}) Tj ET\n`;
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

async function acceptActionDialog(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("button.primary, button.danger").click();
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
  const backupPassword = "LessonCue browser backup 42";
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create your Service Admin" })).toBeVisible();
  await page.getByLabel("Organization name").fill("LessonCue Browser Test");
  await page.getByLabel("Your name").fill("Test Administrator");
  await page.getByLabel("Username").fill("browser-admin");
  await page.locator('input[type="password"]').fill("LessonCueTest42");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ })).toBeVisible();
  await page.getByRole("button", { name: /Test Administrator.*Manage account/ }).click();
  const ownAccountDialog = page.getByRole("dialog", { name: "Your account" });
  await expect(ownAccountDialog.getByText("Email verified")).toBeVisible();
  await ownAccountDialog.getByLabel("Your name").fill("Test Administrator Updated");
  await ownAccountDialog.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByRole("button", { name: /Test Administrator Updated.*Manage account/ })).toBeVisible();

  await page.getByRole("button", { name: /Classes$/ }).click();
  await page.getByRole("button", { name: /Sample Lesson/ }).first().click();
  await expect(page.getByRole("heading", { name: "Sample Lesson" })).toBeVisible();

  await page.getByRole("button", { name: "Add media" }).click();
  await page.getByRole("button", { name: "Upload new media" }).click();
  const uploadForm = page.locator("form").filter({ has: page.getByLabel("Media files") });
  await uploadForm.getByLabel("Media files").setInputFiles({
    name: "browser-test-audio.wav",
    mimeType: "audio/wav",
    buffer: silentWav(),
  });
  await uploadForm.getByLabel("Display title").fill("Browser Test Audio");
  await uploadForm.getByLabel("Folder").selectOption("General");
  await uploadForm.getByLabel("Reusable", { exact: true }).check();
  expect(await uploadForm.locator(":invalid").evaluateAll(elements => elements.map(element => ({
    name: (element as HTMLInputElement).name, type: (element as HTMLInputElement).type,
    message: (element as HTMLInputElement).validationMessage
  })))).toEqual([]);
  await uploadForm.getByRole("button", { name: "Upload and add" }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByText("1 file added. It will be deleted four weeks after", { exact: false })).toBeVisible();
  await expect(page.getByText("Browser Test Audio", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add media" }).click();
  await page.getByRole("button", { name: "Upload new media" }).click();
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
  await page.getByRole("button", { name: "Upload new media" }).click();
  const videoUploadForm = page.locator("form").filter({ has: page.getByLabel("Media files") });
  await videoUploadForm.getByLabel("Media files").setInputFiles({
    name: "needs-tv-conversion.mp4",
    mimeType: "video/mp4",
    buffer: incompatibleVideo(),
  });
  await videoUploadForm.getByLabel("Display title").fill("Browser Compatibility Video");
  await videoUploadForm.getByRole("button", { name: "Upload and add" }).click();
  await expect(page.getByText("Browser Compatibility Video", { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const items = await fetch("/api/v1/media").then(response => response.json());
    const item = items.find((value: { fileName: string }) => value.fileName === "needs-tv-conversion.mp4");
    return `${item?.processingStatus}:${item?.compatibilityStatus}`;
  }), { timeout: 60_000 }).toBe("ready:ready");
  const playbackDelivery = await page.evaluate(async () => {
    const items = await fetch("/api/v1/media").then(response => response.json());
    const item = items.find((value: { fileName: string }) => value.fileName === "needs-tv-conversion.mp4");
    const response = await fetch(item.playbackUrl);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { contentType: response.headers.get("content-type"), signature: String.fromCharCode(...bytes.slice(4, 8)) };
  });
  expect(playbackDelivery).toEqual({ contentType: "video/mp4", signature: "ftyp" });
  const adaptiveProfiles = await page.evaluate(async () => {
    const media = await fetch("/api/v1/media").then(response => response.json());
    const item = media.find((value: { fileName: string }) => value.fileName === "needs-tv-conversion.mp4");
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
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await videoCue.getByLabel("Picture fit").selectOption("fill");
  await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
  await videoCue.getByLabel("Rotate").selectOption("90");
  await videoCue.getByLabel("Playback speed").fill("125");
  await videoCue.getByLabel("Playback speed").press("Tab");
  await videoCue.getByLabel("Play count before ending").fill("2");
  await videoCue.getByLabel("Play count before ending").press("Tab");
  await videoCue.getByLabel("Transition").selectOption("fade-black");
  await videoCue.getByRole("button", { name: "▥ Visually trim both ends & edit fades" }).click();
  await expect(page.getByRole("heading", { name: "Visual timeline & fades: Browser Compatibility Video" })).toBeVisible();
  await expect(page.locator(".trim-handle.trim-start")).toBeVisible();
  await expect(page.locator(".trim-handle.trim-end")).toBeVisible();
  await expect(page.locator(".fade-handle.fade-start")).toBeVisible();
  const timelineBounds = await page.locator(".timeline-art").boundingBox();
  const outHandleBounds = await page.locator(".trim-handle.trim-end").boundingBox();
  if (!timelineBounds || !outHandleBounds) throw new Error("Visual timeline handles are unavailable.");
  await page.locator(".trim-handle.trim-end").hover({ position: { x: 3, y: outHandleBounds.height / 2 } });
  await page.mouse.down();
  await page.mouse.move(timelineBounds.x + timelineBounds.width * .85, timelineBounds.y + timelineBounds.height / 2);
  await page.mouse.up();
  await expect(page.locator(".timeline-preview-label")).toContainText("Previewing trim out");
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
  await expect.poll(() => page.evaluate(async () => {
    const lessons = await fetch("/api/v1/lessons").then(response => response.json());
    const cue = lessons.flatMap((lesson: { items: unknown[] }) => lesson.items)
      .find((item: { title?: string }) => item.title === "Browser Compatibility Video") as {
        fitMode?: string; rotationDegrees?: number; playbackRatePercent?: number; repeatCount?: number; transitionStyle?: string
      } | undefined;
    return cue ? `${cue.fitMode}:${cue.rotationDegrees}:${cue.playbackRatePercent}:${cue.repeatCount}:${cue.transitionStyle}` : "missing";
  })).toBe("fill:90:125:2:fade-black");

  const runCue = page.locator(".playlist-item").filter({ hasText: "Browser Compatibility Video" });
  await runCue.getByLabel("Flexible timing").evaluate((input: HTMLInputElement) => input.click());
  await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
  await runCue.getByLabel("Teacher / volunteer notes").fill("Pause for questions before continuing.");
  await runCue.getByLabel("Teacher / volunteer notes").press("Tab");
  await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
  await page.getByLabel("Substitute or teacher instructions").fill("Check the room display before participants arrive.");
  await page.getByLabel("Optional pre-roll livestream monitor").fill("https://example.org/private-monitor");
  await page.getByRole("button", { name: "Save lesson settings" }).click();
  await expect(page.getByText("Lesson schedule saved.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Print run sheet" }).click();
  const runSheet = page.getByRole("dialog", { name: "Run sheet: Sample Lesson" });
  await expect(runSheet.getByText("Check the room display before participants arrive.")).toBeVisible();
  await expect(runSheet.getByText("Pause for questions before continuing.")).toBeVisible();
  await expect(runSheet.getByText(/FLEXIBLE/)).toBeVisible();
  await runSheet.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Copy or move" }).click();
  const relocateDialog = page.getByRole("dialog", { name: "Copy or move lesson" });
  await relocateDialog.getByLabel("Lesson title").fill("Sample Lesson run-of-show copy");
  await relocateDialog.getByRole("button", { name: "Create copy" }).click();
  await expect(page.getByText("Lesson copied with its complete run of show.", { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const lessons = await fetch("/api/v1/lessons").then(response => response.json());
    const copy = lessons.find((item: { title: string }) => item.title === "Sample Lesson run-of-show copy");
    const cue = copy?.items.find((item: { title: string }) => item.title === "Browser Compatibility Video");
    return copy ? `${copy.substituteNotes}:${copy.preRollMonitorUrl}:${cue?.flexibleTime}:${cue?.notes}` : "missing";
  })).toBe("Check the room display before participants arrive.:https://example.org/private-monitor:true:Pause for questions before continuing.");
  await page.evaluate(async () => {
    const lessons = await fetch("/api/v1/lessons").then(response => response.json());
    const copy = lessons.find((item: { title: string }) => item.title === "Sample Lesson run-of-show copy");
    await fetch(`/api/v1/lessons/${copy.id}`, { method: "DELETE" });
  });

  await page.getByRole("button", { name: "Add media" }).click();
  await page.getByRole("button", { name: "Add online media or slides" }).click();
  const onlineForm = page.locator("form").filter({ has: page.getByLabel("Webpage or YouTube URL") });
  await onlineForm.getByLabel("Webpage or YouTube URL").fill("https://example.org/learning");
  await onlineForm.getByLabel("Display title").fill("Online Learning Page");
  await onlineForm.getByRole("button", { name: "Add online media" }).click();
  await expect(page.getByText("Online media added to the lesson.", { exact: false })).toBeVisible();
  await expect(page.getByText("Online Learning Page", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Calendar$/ }).click();
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.locator(".calendar-period")).toBeVisible();
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.locator(".calendar-week")).toBeVisible();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator(".calendar-month")).toBeVisible();
  await page.getByRole("button", { name: "Room", exact: true }).click();
  await expect(page.locator(".calendar-rooms")).toContainText("Learning Lab");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();

  await page.getByRole("button", { name: /Media Library$/ }).click();
  const audioRow = page.locator(".media-table").filter({ hasText: "browser-test-audio.wav" });
  await expect(audioRow).toBeVisible();
  await expect(audioRow.getByRole("button", { name: /Deletes/ })).toBeVisible();
  await expect(page.locator(".media-table").filter({ hasText: "Online Learning Page" })).toBeVisible();

  await page.getByRole("button", { name: /Settings$/ }).click();
  await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  await page.getByRole("button", { name: /Organization & accounts/ }).click();
  await expect(page.getByRole("heading", { name: "Registration & email" })).toBeVisible();
  const mfaPanel = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "Authenticator MFA" }) });
  await expect(mfaPanel).toHaveCount(1);
  await expect(mfaPanel).toBeVisible();
  await page.getByLabel("Enable Signage").check();
  await expect.poll(() => page.evaluate(async () =>
    (await fetch("/api/v1/admin/bootstrap").then(response => response.json())).settings.signageEnabled
  )).toBe(true);
  expect(await page.evaluate(async () => (await fetch("/api/v1/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "closed-user", displayName: "Closed User", email: "closed@example.org", password: "ClosedAccount42", code: "even-with-a-code" })
  })).status)).toBe(403);
  await page.getByLabel("Label", { exact: true }).fill("Browser test registrations");
  await page.getByLabel("Maximum uses (optional)").fill("2");
  await page.getByRole("button", { name: "Create code" }).click();
  await expect(page.getByText("Copy this code now")).toBeVisible();
  const registrationCode = await page.locator(".secret-reveal code").textContent();
  expect(registrationCode).toMatch(/^[a-f0-9]{16}$/);
  const registrationRow = page.locator(".registration-code-list > div").filter({ hasText: "Browser test registrations" });
  await registrationRow.getByRole("button", { name: "Edit" }).click();
  const codeDialog = page.getByRole("dialog", { name: "Edit Browser test registrations" });
  await codeDialog.getByLabel("Maximum uses (leave blank for unlimited)").fill("3");
  await codeDialog.getByRole("button", { name: "Save limits" }).click();
  await expect(registrationRow).toContainText("0 of 3 uses");
  await registrationRow.getByRole("button", { name: "Revoke" }).click();
  await acceptActionDialog(page);
  await expect(registrationRow).toContainText("Inactive");
  await expect(page.getByRole("button", { name: "Save provider first" })).toBeDisabled();
  await page.getByLabel("Registration mode").selectOption("approval");
  await page.getByLabel("Account email provider").selectOption("resend");
  await page.getByLabel("Email API key").fill("browser-layout-placeholder-key");
  await page.getByLabel("Sender name").fill("LessonCue Browser Test");
  await page.getByLabel("Verified sender address").fill("accounts@example.org");
  await page.getByLabel("Public account-link address").fill(new URL(page.url()).origin);
  await page.getByRole("button", { name: "Save account settings" }).click();
  await expect(page.getByText("Registration and account email settings saved.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /Media & storage/ }).click();
  await expect(mfaPanel).toBeHidden();
  await page.getByLabel("Approved folder paths").fill("General\nLessons\nSignage\nAudio/Classroom");
  await page.getByLabel("Approved tags").fill("Reusable\nIntro\nOutro\nReference\nWelcome");
  await page.getByRole("button", { name: "Save approved folders & tags" }).click();
  await expect(page.getByText("Approved media folders and tags saved.", { exact: false })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/api/v1/media/link", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.org/rejected", title: "Rejected", folder: "Unapproved", tagsCsv: "Reusable" })
  })).status)).toBe(400);
  await page.getByRole("button", { name: /Media Library$/ }).click();

  await audioRow.getByRole("button", { name: "Manage versions & impact" }).click();
  await expect(page.getByRole("heading", { name: "Manage: browser-test-audio.wav" })).toBeVisible();
  await expect(page.getByText("Sample Lesson", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Rename, folder & tags" }).click();
  const organizeDialog = page.getByRole("dialog", { name: "Organize: browser-test-audio.wav" });
  await organizeDialog.getByLabel("Folder").selectOption("Audio/Classroom");
  await organizeDialog.getByLabel("Welcome", { exact: true }).check();
  await organizeDialog.getByLabel("Reusable", { exact: true }).check();
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
  await bulkRenameDialog.getByLabel("New name for bulk-cue-one.wav").fill("Term A — bulk-cue-one.wav");
  await bulkRenameDialog.getByLabel("New name for bulk-cue-two.wav").fill("Term A — bulk-cue-two.wav");
  await bulkRenameDialog.getByRole("button", { name: "Rename selected media" }).click();
  await expect(page.getByText("2 media items renamed.", { exact: false })).toBeVisible();
  await expect(page.locator(".media-table").filter({ hasText: "Term A — bulk-cue-one.wav" })).toBeVisible();
  await expect(page.locator(".media-table").filter({ hasText: "Term A — bulk-cue-two.wav" })).toBeVisible();
  await page.getByLabel("Select Term A — bulk-cue-one.wav").check();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  const conflictRenameDialog = page.getByRole("dialog", { name: "Rename 1 selected media item" });
  await conflictRenameDialog.getByLabel("New name").fill("Term A — bulk-cue-two.wav");
  await conflictRenameDialog.getByRole("button", { name: "Rename selected media" }).click();
  await expect(page.getByText(/already exists/, { exact: false })).toBeVisible();
  await conflictRenameDialog.getByLabel("New name").fill("Term A — bulk-cue-one.wav");
  await conflictRenameDialog.getByRole("button", { name: "Rename selected media" }).click();
  await expect(page.getByText("1 media item renamed.", { exact: false })).toBeVisible();

  const organizedRow = page.locator(".media-table").filter({ hasText: "browser-test-audio.wav" });
  await organizedRow.getByRole("button", { name: "Manage versions & impact" }).click();
  await page.getByLabel("Replace current file").setInputFiles({ name: "browser-test-audio-v2.wav", mimeType: "audio/wav", buffer: silentWav(1) });
  await page.getByRole("button", { name: "Preview impact and replace" }).click();
  await acceptActionDialog(page);
  await expect(page.getByText("previous version remains available", { exact: false })).toBeVisible();
  const replacedRow = page.locator(".media-table").filter({ hasText: "browser-test-audio-v2.wav" });
  await expect(replacedRow).toContainText("v2");
  await replacedRow.getByRole("button", { name: "Manage versions & impact" }).click();
  await expect(page.getByText("v1 · browser-test-audio.wav", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await acceptActionDialog(page);
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
  await page.getByRole("button", { name: /Connections/ }).click();
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
  await expect.poll(async () => page.locator(".toast").count(), { timeout: 5_000 }).toBe(0);
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
  await page.getByRole("button", { name: /Data & recovery/ }).click();
  const troubleshootingPanel = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "Troubleshooting log" }) });
  await troubleshootingPanel.getByRole("button", { name: "Load log" }).click();
  await expect(troubleshootingPanel.getByRole("button", { name: "Download JSON" })).toBeVisible();
  await expect(troubleshootingPanel.getByRole("heading", { name: /Activity audit/ })).toBeVisible();
  await page.getByLabel("Encryption password").fill(backupPassword);
  await page.getByLabel("Confirm password").fill(backupPassword);
  await page.getByRole("button", { name: "Full backup" }).click();
  await expect(page.getByText("Encrypted full backup created.", { exact: false })).toBeVisible();
  const fullBackupLink = page.locator(".backup-row a").filter({ hasText: "full" });
  await expect(fullBackupLink).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await fullBackupLink.click();
  const backupDownload = await downloadPromise;
  const backupPath = await backupDownload.path();
  expect(backupPath).not.toBeNull();

  await expect.poll(async () => page.locator(".toast").count(), { timeout: 5_000 }).toBe(0);
  await page.getByRole("button", { name: /Organization & accounts/ }).click();
  await page.getByLabel("Organization", { exact: true }).fill("Changed Organization");
  await page.getByLabel("Require non-administrator room remotes to use the local .local address").check();
  const localControllerSave = await page.evaluate(async () => {
    const bootstrap = await fetch("/api/v1/admin/bootstrap").then(response => response.json());
    return (await fetch("/api/v1/organization", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...bootstrap.settings, name: "Changed Organization", requireLocalRoomControllers: true }) })).status;
  });
  expect(localControllerSave).toBe(200);
  await expect.poll(() => page.evaluate(async () =>
    (await fetch("/api/v1/admin/bootstrap").then(response => response.json())).settings.requireLocalRoomControllers)).toBe(true);

  await page.getByRole("button", { name: /Data & recovery/ }).click();
  const restoreForm = page.locator("form.backup-restore-upload");
  await restoreForm.getByLabel("Restore a LessonCue backup").setInputFiles(backupPath!);
  await restoreForm.getByLabel("Backup password").fill(backupPassword);
  await restoreForm.getByRole("button", { name: "Validate and preview" }).click();
  const restoreDialog = page.getByRole("dialog", { name: "Review backup restore" });
  await expect(restoreDialog).toBeVisible();
  await expect(restoreDialog.getByRole("heading", { name: "LessonCue Browser Test" })).toBeVisible();
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
  await expect(page.locator(".media-table").filter({ hasText: "needs-tv-conversion.mp4" })).toContainText("TV copy ready");
  await expect(page.locator(".media-table").filter({ hasText: "one-page-handout — Slide 1" })).toBeVisible();
  await page.getByRole("button", { name: /Classes$/ }).click();
  await page.getByRole("button", { name: /Sample Lesson/ }).first().click();
  await expect(page.getByText("one-page-handout — Slide 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add media" }).click();
  await page.getByRole("button", { name: "Upload new media" }).click();
  const lessonMediaDialog = page.getByRole("dialog", { name: "Upload new media" });
  await lessonMediaDialog.getByLabel("Media files").setInputFiles({
    name: "lesson-direct-deck.pdf", mimeType: "application/pdf", buffer: onePagePdf("Direct lesson presentation"),
  });
  await lessonMediaDialog.getByLabel("Seconds per imported slide").fill("7");
  await lessonMediaDialog.getByRole("button", { name: "Upload and add" }).click();
  await expect(page.getByText("queued for local slide conversion", { exact: false })).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const lessons = await fetch("/api/v1/lessons").then(response => response.json());
    return lessons.some((entry: { items: { title: string; durationMs?: number }[] }) =>
      entry.items.some(item => item.title === "lesson-direct-deck — Slide 1" && item.durationMs === 7_000));
  }), { timeout: 30_000 }).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: /Classes$/ }).click();
  await page.getByRole("button", { name: /Sample Lesson/ }).first().click();
  await expect(page.getByText("lesson-direct-deck — Slide 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Templates$/ }).click();
  await expect(page.locator(".template-card").filter({ hasText: "Reusable Browser Lesson" })).toBeVisible();
  await expect(page.locator(".schedule-card").filter({ hasText: "Browser Test Term" })).toContainText("1");

  const diagnostics = await page.evaluate(async () => {
    const jsonHeaders = { "Content-Type": "application/json" };
    const bootstrap = await fetch("/api/v1/admin/bootstrap").then(response => response.json());
    const lessons = await fetch("/api/v1/lessons").then(response => response.json());
    const adaptiveLesson = lessons.find((lesson: { items: Array<{ title: string }> }) =>
      lesson.items.some(item => item.title === "Browser Compatibility Video"));
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
      body: JSON.stringify({
        assignedClassId: adaptiveLesson.classId,
        allowDiagnosticScreenshots: true,
        allowUnsupportedContent: true,
      }) });
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
    await fetch(`/api/v1/screens/${identity.screenId}`, { method: "PATCH", headers: jsonHeaders,
      body: JSON.stringify({ signageOnly: true, permanentPairing: true }) });
    const signageOnlyManifest = await fetch(`/api/v1/screens/${identity.screenId}/manifest`,
      { headers: { Authorization: `Bearer ${identity.deviceToken}` } }).then(response => response.json());
    const blockedControl = await fetch(`/api/v1/screens/${identity.screenId}/control`, { method: "POST", headers: jsonHeaders,
      body: JSON.stringify({ action: "play", lessonId: adaptiveLesson.id }) });
    const browserLink = await fetch(`/api/v1/screens/${identity.screenId}/browser-link`,
      { method: "POST", headers: jsonHeaders, body: "{}" }).then(response => response.json());
    const browserUrl = new URL(browserLink.url);
    const directManifest = await fetch(`/api/v1/screens/${identity.screenId}/manifest`,
      { headers: { Authorization: `Bearer ${browserUrl.searchParams.get("token")}` } });
    await fetch(`/api/v1/screens/${identity.screenId}`, { method: "PATCH", headers: jsonHeaders,
      body: JSON.stringify({ signageOnly: false, permanentPairing: false }) });
    const screenshot = await fetch(`/api/v1/screens/${identity.screenId}/diagnostics/screenshot`);
    return { upload: upload.status, screenshot: screenshot.status, requestMatches: control.screenshotRequestId === screenshotRequest.requestId,
      cache: JSON.parse(screen.cacheInventoryJson)[0]?.title, quality: screen.networkQuality, screenshotAvailable: screen.screenshotAvailable,
      requestedProfile: adaptiveItem?.requestedProfile, selectedProfile: adaptiveItem?.selectedProfile,
      signageOnlyPlaylists: signageOnlyManifest.playlists.length, blockedControl: blockedControl.status,
      browserLinkPath: browserUrl.pathname, directManifest: directManifest.status };
  });
  expect(diagnostics).toEqual({ upload: 202, screenshot: 200, requestMatches: true, cache: "Cached welcome", quality: "poor", screenshotAvailable: true,
    requestedProfile: "h264-480", selectedProfile: "h264-480", signageOnlyPlaylists: 0, blockedControl: 409,
    browserLinkPath: "/display", directManifest: 200 });

  await page.getByRole("button", { name: /Screens$/ }).click();
  await expect(page.getByRole("link", { name: "Open browser player ↗" })).toHaveAttribute("href", "/player");
  await expect(page.getByRole("link", { name: "Open kiosk player ↗" })).toHaveAttribute("href", "/player?kiosk=1");
  await expect(page.locator('input.screen-name-input[value="Browser Test TV"]')).toBeVisible();
  await page.getByRole("button", { name: "View diagnostics" }).click();
  await expect(page.getByText("Cached welcome", { exact: true })).toBeVisible();
  await expect(page.locator(".codec-list > span")).toContainText("H.264 / AVC");
  await expect(page.getByAltText("Diagnostic screenshot from Browser Test TV")).toBeVisible();

  await page.goto("/universalremote");
  await page.getByLabel("Six-digit controller PIN").fill("482731");
  await page.getByRole("button", { name: "Open universal remote" }).click();
  await expect(page.getByText("Needs attention", { exact: true })).toBeVisible();
  await expect(page.getByText("Check the room display before participants arrive.", { exact: true })).toBeVisible();
  await expect(page.locator(".controller-list")).toContainText("Pause for questions before continuing.");
  await expect(page.locator(".controller-list")).toContainText("Flexible");
  await page.getByRole("button", { name: "Open monitor" }).click();
  await expect(page.locator(".pre-roll-monitor iframe")).toHaveAttribute("src", "https://example.org/private-monitor");
  await expect(page.locator(".controller-run-summary")).toContainText("REMAINING");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Sending pause to Browser Test TV…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "🔓 Lock controls" }).click();
  await expect(page.getByText("Controls are locked. Nothing on this remote can change the screen until you unlock it.", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Room playback controls" }).getByRole("button", { name: "Pause", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: /Classes$/ }).click();
  await page.getByRole("button", { name: "Controller link" }).click();
  const controllerDialog = page.getByRole("dialog", { name: /controller$/ });
  await expect(controllerDialog.getByAltText(/QR code for/)).toBeVisible();
  await expect(controllerDialog.getByText(/\/room\/browser-room/)).toBeVisible();
  const controllerColor = controllerDialog.getByLabel("Controller theme color");
  await expect(controllerColor).toHaveValue("#316b83");
  await controllerColor.evaluate((element: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, "#8a3f72");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(controllerDialog.getByText("#8A3F72")).toBeVisible();
  await expect(controllerDialog.locator(".controller-share-preview")).toHaveCSS(
    "border-left-color",
    "rgb(138, 63, 114)",
  );
  await controllerDialog.getByRole("button", { name: "Create permanent QR" }).click();
  await expect(controllerDialog.getByText("PERMANENT REVOCABLE CONTROLLER")).toBeVisible();
  const firstPermanent = await page.evaluate(async () => {
    const classes = await fetch("/api/v1/classes").then(response => response.json());
    return fetch(`/api/v1/controller/permanent/${classes[0].id}`).then(response => response.json());
  });
  expect(firstPermanent.path).toMatch(/^\/session\/[a-f0-9]{48}$/);
  expect((await page.request.get(firstPermanent.path.replace("/session/", "/api/v1/controller/sessions/"))).status()).toBe(200);
  await controllerDialog.getByRole("button", { name: "Refresh permanent QR" }).click();
  await acceptActionDialog(page);
  const rotatedPermanent = await page.evaluate(async () => {
    const classes = await fetch("/api/v1/classes").then(response => response.json());
    return fetch(`/api/v1/controller/permanent/${classes[0].id}`).then(response => response.json());
  });
  expect(rotatedPermanent.path).not.toBe(firstPermanent.path);
  expect((await page.request.get(firstPermanent.path.replace("/session/", "/api/v1/controller/sessions/"))).status()).toBe(404);
  expect((await page.request.get(rotatedPermanent.path.replace("/session/", "/api/v1/controller/sessions/"))).status()).toBe(200);
  await controllerDialog.getByRole("button", { name: "Revoke" }).click();
  await acceptActionDialog(page);
  await expect(controllerDialog.getByRole("button", { name: "Create permanent QR" })).toBeVisible();
  expect((await page.request.get(rotatedPermanent.path.replace("/session/", "/api/v1/controller/sessions/"))).status()).toBe(404);
  await controllerDialog.getByRole("button", { name: "Save controller" }).click();
  await expect(page.getByText("Class controller address and theme saved.")).toBeVisible();
  expect(await page.evaluate(async () => {
    const classes = await fetch("/api/v1/classes").then(response => response.json());
    return classes[0].controllerColor;
  })).toBe("#8a3f72");
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
  expect(recycleWorkflow).toMatchObject({ statuses: [204, 204, 204, 204, 200, 204, 200], classEntries: 1, lessonEntries: expect.any(Number) });
  expect(recycleWorkflow.lessonEntries).toBeGreaterThan(0);
  expect(recycleWorkflow.purged).toBeGreaterThanOrEqual(1);
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

  await expect(page.locator(".toast")).toHaveCount(0);
  await page.getByRole("button", { name: /Signage$/ }).click();
  await expect(page.getByRole("navigation", { name: "Signage setup" })).toBeVisible();
  await expect(page.getByText("Self-hosted", { exact: true })).toHaveCount(0);
  await page.getByLabel("Open LessonCue navigation").click();
  const signageNavigation = page.getByRole("navigation", { name: "LessonCue navigation" });
  await expect(signageNavigation).toBeVisible();
  await expect(signageNavigation.getByRole("button", { name: "Dashboard" })).toBeVisible();
  await expect(signageNavigation.getByRole("button", { name: "Signage" })).toHaveClass(/active/);
  await page.getByLabel("Open LessonCue navigation").click();
  await expect(page.getByRole("button", { name: /1 Layouts Build the persistent frame/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /2 Playlists Choose looping content/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /3 Signs & screens Combine and assign/ })).toBeVisible();

  await page.getByRole("button", { name: /Information frame/ }).click();
  await page.getByLabel("Layout name").fill("Browser information frame");
  await page.getByLabel("Bottom boxes").selectOption("3");
  await page.getByLabel("Side boxes").selectOption("3");
  await page.getByLabel("Frame color").fill("#123f32");
  await page.getByLabel("Alternate color").fill("#0a2b22");
  await page.getByLabel("Inner padding").fill("12");
  await page.getByLabel("Content size").fill("70");
  await page.getByLabel("Vertical position").selectOption("top");
  await page.getByLabel("Media fit").selectOption("contain");
  await page.getByLabel("RTMP override").check();
  await page.getByLabel("RTMP stream address").fill("rtmp://stream.example/live");
  const startBoundary = page.getByRole("group", { name: "Start boundary" });
  await startBoundary.getByLabel("Date").fill("2026-08-02");
  await startBoundary.getByLabel("Time").fill("10:00");
  const endBoundary = page.getByRole("group", { name: "End boundary" });
  await endBoundary.getByLabel("Date").fill("2026-08-02");
  await endBoundary.getByLabel("Time").fill("11:00");
  await expect(page.locator(".simple-layout-canvas .web-player-signage-zone")).toHaveCount(7);
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.locator(".toast")).toContainText("Layout saved and updated on assigned screens.");

  await page.getByRole("button", { name: /2 Playlists Choose looping content/ }).click();
  await page.getByRole("button", { name: /New playlist/ }).click();
  await page.getByLabel("Playlist name").fill("Browser continuous loop");
  await page.locator(".signage-media-tray button").filter({ hasText: "browser-test-audio.wav" }).click();
  await page.getByLabel("Time on screen").fill("18");
  await page.getByLabel("Fade in").fill("1.2");
  await page.getByLabel("Fade out").fill("1.5");
  await expect(page.getByText("LOOPS BACK TO START ↻")).toBeVisible();
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.locator(".toast")).toContainText("Playlist saved. It will loop continuously.");

  await page.getByRole("button", { name: /1 Layouts Build the persistent frame/ }).click();
  await page.locator(".element-list button").filter({ hasText: "Playlist" }).first().click();
  await page.locator(".stream-override-controls select").first().selectOption({ label: "Browser continuous loop" });
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.locator(".toast")).toContainText("Layout saved and updated on assigned screens.");

  await page.getByRole("button", { name: /3 Signs & screens Combine and assign/ }).click();
  await page.getByRole("button", { name: /Create sign/ }).click();
  await page.getByLabel("Sign name").fill("Browser lobby sign");
  await page.locator(".inspector-section").filter({ hasText: "Persistent layout" })
    .locator("select").selectOption({ label: "Browser information frame" });
  await page.getByLabel("Playlist").selectOption({ label: "Browser continuous loop · 1 items" });
  await page.getByLabel("Browser Test TV").check();
  await page.getByRole("button", { name: /Save & update screens/ }).click();
  await expect(page.locator(".toast")).toContainText("Sign saved and assigned screens updated.");

  const simpleSignage = await page.evaluate(async () => {
    const [signs, screens] = await Promise.all([
      fetch("/api/v1/signage-studio/signs").then(response => response.json()),
      fetch("/api/v1/screens").then(response => response.json()),
    ]);
    const sign = signs.find((item: { name: string }) => item.name === "Browser lobby sign");
    const screen = screens.find((item: { name: string }) => item.name === "Browser Test TV");
    const browserLink = await fetch(`/api/v1/screens/${screen.id}/browser-link`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    }).then(response => response.json());
    const token = new URL(browserLink.url).searchParams.get("token");
    const manifest = await fetch(`/api/v1/screens/${screen.id}/manifest`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(response => response.json());
    return {
      signId: sign?.id,
      assignedSignageId: screen?.assignedSignageId,
      signageOnly: screen?.signageOnly,
      manifestSign: manifest.signage?.[0]?.name,
      manifestPlaylist: manifest.signage?.[0]?.zones
        ?.find((zone: { id: string }) => zone.id === "main-playlist")
        ?.contentPlaylist?.name,
      containment: (() => {
        const zone = manifest.signage?.[0]?.zones
          ?.find((entry: { id: string }) => entry.id === "main-playlist");
        return zone
          ? [zone.contentPadding, zone.contentScale, zone.verticalAlign, zone.fit,
            zone.streamOverrideWhenLive, zone.streamOverrideStartsAt, zone.streamOverrideEndsAt]
          : null;
      })(),
    };
  });
  expect(simpleSignage.assignedSignageId).toBe(simpleSignage.signId);
  expect(simpleSignage.signageOnly).toBe(true);
  expect(simpleSignage.manifestSign).toBe("Browser lobby sign");
  expect(simpleSignage.manifestPlaylist).toBe("Browser continuous loop");
  expect(simpleSignage.containment?.slice(0, 5)).toEqual([12, 70, "top", "contain", true]);
  expect(Date.parse(simpleSignage.containment?.[5] || "")).not.toBeNaN();
  expect(Date.parse(simpleSignage.containment?.[6] || "")).not.toBeNaN();

  // Retained legacy assertions are intentionally unreachable while the replacement
  // data model settles; they document the removed schedule/publish/emergency workflow.
  if (false) {
  await page.evaluate(() => Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined }));
  await page.getByRole("button", { name: "New schedule" }).click();
  const signageDialog = page.getByRole("dialog", { name: "Create signage" });
  await expect(page.locator("main")).toBeVisible();
  await signageDialog.getByLabel("Name").fill("Browser dashboard layout");
  await signageDialog.getByRole("button", { name: "dashboard" }).click();
  await expect(signageDialog.locator(".signage-zone-editor")).toHaveCount(4);
  const firstCanvasZone = signageDialog.locator(".signage-zone-preview").first();
  const beforeDrag = JSON.parse(await signageDialog.locator('input[name="zonesJson"]').inputValue())[0];
  await firstCanvasZone.hover({ position: { x: 20, y: 20 } });
  const canvasZoneBounds = await firstCanvasZone.boundingBox();
  if (!canvasZoneBounds) throw new Error("The signage canvas zone was not measurable.");
  const dragStart = { x: canvasZoneBounds.x + canvasZoneBounds.width / 2, y: canvasZoneBounds.y + canvasZoneBounds.height / 2 };
  await firstCanvasZone.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "mouse", button: 0, buttons: 1, clientX: dragStart.x, clientY: dragStart.y });
  await expect(signageDialog.getByLabel("Angle")).toBeVisible();
  await page.evaluate(({ x, y }) => document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, pointerType: "mouse", buttons: 1, clientX: x + 35, clientY: y + 20 })), dragStart);
  await page.evaluate(({ x, y }) => document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, pointerType: "mouse", button: 0, clientX: x + 35, clientY: y + 20 })), dragStart);
  await expect.poll(async () => JSON.parse(await signageDialog.locator('input[name="zonesJson"]').inputValue())[0].x).toBeGreaterThan(beforeDrag.x);
  await firstCanvasZone.click();
  await signageDialog.getByLabel("Angle").fill("23");
  await signageDialog.locator(".signage-zone-editor").first().getByLabel("Zone type").selectOption("clock");
  const streamZoneEditor = signageDialog.locator(".signage-zone-editor").nth(3);
  await streamZoneEditor.locator(".signage-zone-toggle").click();
  await streamZoneEditor.getByLabel("Zone type").selectOption("stream");
  await streamZoneEditor.getByLabel("Live stream address").fill("rtmp://stream.example.org/live/browser-test-key");
  await signageDialog.getByLabel("Publish this schedule").uncheck();
  expect(await signageDialog.locator("form").evaluate(form => Array.from(form.querySelectorAll(":invalid")).map(element => ({
    tag: element.tagName,
    name: (element as HTMLInputElement).name,
    value: (element as HTMLInputElement).value,
    validationMessage: (element as HTMLInputElement).validationMessage,
  })))).toEqual([]);
  await signageDialog.locator("form").evaluate(form => (form as HTMLFormElement).requestSubmit());
  await expect(page.locator(".toast")).toContainText("Signage schedule created.");
  const signageCard = page.locator(".signage-card").filter({ hasText: "Browser dashboard layout" });
  await expect(signageCard).toContainText("4-zone dashboard layout");
  await expect(signageCard).toContainText("PAUSED");
  const savedSignageLayout = await page.evaluate(async () => {
    const signage = await fetch("/api/v1/signage").then(response => response.json());
    return signage.find((entry: { name: string }) => entry.name === "Browser dashboard layout").zones;
  });
  expect(savedSignageLayout[0].rotation).toBe(23);
  expect(savedSignageLayout[0].x).toBeGreaterThan(beforeDrag.x);
  expect(savedSignageLayout[3]).toMatchObject({ type: "stream", sourceUrl: "rtmp://stream.example.org/live/browser-test-key" });
  const seriesEditing = await page.evaluate(async () => {
    const date = (offset: number) => { const value = new Date(); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10); };
    const base = {
      name: "Browser recurring signage", mode: "scheduled", enabled: false, priority: 15, startsAt: null, endsAt: null,
      message: "Original series", backgroundColor: "#25302d", textColor: "#ffffff", mediaAssetId: null,
      targetTagsCsv: "", recurrence: "daily", scheduleStartDate: date(0), scheduleEndDate: date(10),
      startMinutes: 480, endMinutes: 1020, daysOfWeek: [], excludedDates: [], targetScreenIds: [],
      layoutPreset: "single", zones: [], layoutId: null, contentPlaylistId: null, volumePercent: 100,
      displayPower: "unchanged", kioskEnabled: false, kioskInteractionUrl: null, kioskTimeoutSeconds: 60,
      kioskShowCloseButton: true, kioskShowTouchIndicator: true, kioskVirtualKeyboard: false
    };
    const created = await fetch("/api/v1/signage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(base) }).then(response => response.json());
    const occurrenceDate = date(1);
    const eventResponse = await fetch(`/api/v1/signage-studio/schedules/${created.id}/series-edit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "event", effectiveDate: occurrenceDate, changes: { ...base, message: "One changed occurrence" } })
    });
    const futureDate = date(3);
    const futureResponse = await fetch(`/api/v1/signage-studio/schedules/${created.id}/series-edit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "future", effectiveDate: futureDate, changes: { ...base, message: "Changed future series", scheduleStartDate: futureDate } })
    });
    const schedules = await fetch("/api/v1/signage").then(response => response.json());
    const source = schedules.find((value: { id: string }) => value.id === created.id);
    const exception = schedules.find((value: { message: string }) => value.message === "One changed occurrence");
    const future = schedules.find((value: { message: string }) => value.message === "Changed future series");
    return { eventStatus: eventResponse.status, futureStatus: futureResponse.status, excluded: source.excludedDates.includes(occurrenceDate),
      sourceEnd: source.scheduleEndDate, expectedSourceEnd: date(2), exceptionRecurrence: exception?.recurrence,
      futureStart: future?.scheduleStartDate, expectedFutureStart: futureDate };
  });
  expect(seriesEditing).toEqual({ eventStatus: 200, futureStatus: 200, excluded: true, sourceEnd: seriesEditing.expectedSourceEnd,
    expectedSourceEnd: seriesEditing.expectedSourceEnd, exceptionRecurrence: "once", futureStart: seriesEditing.expectedFutureStart,
    expectedFutureStart: seriesEditing.expectedFutureStart });

  await page.getByRole("button", { name: "Layouts", exact: true }).click();
  await expect(page.getByText("Welcome board", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create sign" }).click();
  const createSignDialog = page.getByRole("dialog", { name: "Create a sign" });
  await createSignDialog.getByRole("button", { name: "Continue" }).click();
  await createSignDialog.getByRole("button", { name: "Continue" }).click();
  await createSignDialog.getByRole("button", { name: "Create draft sign →" }).click();
  const layoutDialog = page.getByRole("dialog", { name: "New reusable layout" });
  await layoutDialog.getByText("Advanced layout controls", { exact: true }).click();
  await layoutDialog.getByLabel("Layout name").fill("Browser reusable portrait");
  await layoutDialog.getByLabel("Resolution").selectOption("1080x1920");
  await layoutDialog.getByLabel("Canvas background").fill("#262f2c");
  await layoutDialog.getByRole("button", { name: "+ Element" }).click();
  await layoutDialog.getByLabel("Quick element type").selectOption("wifi");
  await layoutDialog.getByRole("button", { name: "+ Element" }).click();
  await layoutDialog.getByLabel("Network name (SSID)").fill("LessonCue Guest");
  await layoutDialog.getByRole("textbox", { name: "Password", exact: true }).fill("welcome123");
  await layoutDialog.getByLabel("QR placement").selectOption("left");
  await layoutDialog.getByRole("textbox", { name: "Right", exact: true }).fill("Scan to connect");
  await expect(layoutDialog.locator(".zone-qr img")).toBeVisible();
  await expect(layoutDialog.locator(".zone-qr-layout.placement-left")).toContainText("Scan to connect");
  await layoutDialog.getByRole("button", { name: "Publish & push" }).click();
  await expect(page.locator(".toast")).toContainText("Layout published and screens notified.");
  const reusableLayoutCard = page.locator(".studio-resource-card").filter({ hasText: "Browser reusable portrait" });
  await expect(reusableLayoutCard).toContainText("published");
  await expect(reusableLayoutCard).toContainText("1080×1920");
  await reusableLayoutCard.getByRole("button", { name: "Edit" }).click();
  const existingLayoutDialog = page.getByRole("dialog", { name: "Layout · Browser reusable portrait" });
  await existingLayoutDialog.getByRole("tab", { name: /Layers/ }).click();
  await existingLayoutDialog.getByRole("button", { name: "Select wifi layer" }).click();
  await existingLayoutDialog.getByLabel("Network name (SSID)").fill("LessonCue Guest Updated");
  await existingLayoutDialog.getByRole("textbox", { name: "Right", exact: true }).fill("Updated scan instructions");
  await existingLayoutDialog.getByRole("button", { name: "Publish & push" }).click();
  await expect(page.locator(".toast")).toContainText("Layout published and screens notified.");
  await expect.poll(() => page.evaluate(async () => {
    const layouts = await fetch("/api/v1/signage-studio/layouts").then(response => response.json());
    const layout = layouts.find((item: { name: string }) => item.name === "Browser reusable portrait");
    const draft = layout?.zones?.find((zone: { type: string }) => zone.type === "wifi");
    const published = layout?.publishedZones?.find((zone: { type: string }) => zone.type === "wifi");
    return {
      versionsMatch: layout?.version === layout?.publishedVersion,
      draftQr: draft?.qrValue,
      draftLabel: draft?.qrLabelRight,
      publishedQr: published?.qrValue,
      publishedLabel: published?.qrLabelRight,
    };
  })).toEqual({
    versionsMatch: true,
    draftQr: "WIFI:T:WPA;S:LessonCue Guest Updated;P:welcome123;;",
    draftLabel: "Updated scan instructions",
    publishedQr: "WIFI:T:WPA;S:LessonCue Guest Updated;P:welcome123;;",
    publishedLabel: "Updated scan instructions",
  });

  await page.getByRole("button", { name: "Playlists", exact: true }).click();
  await page.getByRole("button", { name: "New playlist" }).click();
  const playlistDialog = page.getByRole("dialog", { name: "New signage playlist" });
  await playlistDialog.locator('.playlist-editor-head input[placeholder="Playlist name"]').fill("Browser signage rotation");
  await playlistDialog.getByRole("button", { name: "+ layout" }).click();
  await playlistDialog.locator(".playlist-items article").first().locator("select").first().selectOption({ label: "Browser reusable portrait" });
  await playlistDialog.getByRole("button", { name: "Publish & push" }).click();
  await expect(page.locator(".toast")).toContainText("Playlist published and screens notified.");
  await expect(page.locator(".studio-resource-card").filter({ hasText: "Browser signage rotation" })).toContainText("published");

  const permanentSign = await page.evaluate(async () => {
    const jsonHeaders = { "Content-Type": "application/json" };
    const [screens, layouts, playlists] = await Promise.all([
      fetch("/api/v1/screens").then(response => response.json()),
      fetch("/api/v1/signage-studio/layouts").then(response => response.json()),
      fetch("/api/v1/signage-studio/playlists").then(response => response.json()),
    ]);
    const screen = screens.find((item: { name: string }) => item.name === "Browser Test TV");
    const layout = layouts.find((item: { name: string }) => item.name === "Browser reusable portrait");
    const playlist = playlists.find((item: { name: string }) => item.name === "Browser signage rotation");
    const scheduleResponse = await fetch("/api/v1/signage", { method: "POST", headers: jsonHeaders, body: JSON.stringify({
      name: "Browser permanent sign", mode: "idle", enabled: true, priority: 100,
      startsAt: null, endsAt: null, message: "", backgroundColor: "#000000", textColor: "#ffffff",
      mediaAssetId: null, targetTagsCsv: "", recurrence: "once", targetScreenIds: [screen.id],
      layoutId: layout.id, contentPlaylistId: playlist.id, volumePercent: 100, displayPower: "unchanged",
    }) });
    if (!scheduleResponse.ok) throw new Error(`Permanent signage setup failed (${scheduleResponse.status}): ${await scheduleResponse.text()}`);
    const schedule = await scheduleResponse.json();
    await fetch(`/api/v1/screens/${screen.id}`, { method: "PATCH", headers: jsonHeaders,
      body: JSON.stringify({ signageOnly: true, permanentPairing: true }) });
    const browserLink = await fetch(`/api/v1/screens/${screen.id}/browser-link`,
      { method: "POST", headers: jsonHeaders, body: "{}" }).then(response => response.json());
    return { url: browserLink.url as string, screenId: screen.id as string, scheduleId: schedule.id as string };
  });
  const permanentContext = await page.context().browser()!.newContext({ viewport: { width: 1280, height: 720 } });
  const permanentPage = await permanentContext.newPage();
  await permanentPage.goto(permanentSign.url);
  await expect(permanentPage.locator('[data-display-mode="permanent-sign"]')).toBeVisible();
  await expect(permanentPage.getByLabel("Browser reusable portrait signage layout")).toBeVisible();
  await expect(permanentPage.getByAltText("QR code for WIFI:T:WPA;S:LessonCue Guest Updated;P:welcome123;;")).toBeVisible();
  const permanentBounds = await permanentPage.evaluate(() => {
    const sign = document.querySelector<HTMLElement>('[data-display-mode="permanent-sign"]')!.getBoundingClientRect();
    const layout = document.querySelector<HTMLElement>(".web-player-signage-layout")!.getBoundingClientRect();
    return {
      sign: [sign.x, sign.y, sign.width, sign.height],
      layout: [layout.x, layout.y, layout.width, layout.height],
      viewport: [innerWidth, innerHeight],
      hasLibrary: Boolean(document.querySelector(".web-player-library")),
      hasLessonControls: Boolean(document.querySelector(".web-player-lessons, .web-player-actions")),
    };
  });
  expect(permanentBounds).toEqual({
    sign: [0, 0, 1280, 720], layout: [0, 0, 1280, 720], viewport: [1280, 720],
    hasLibrary: false, hasLessonControls: false,
  });
  await permanentContext.close();
  await page.evaluate(async ({ screenId, scheduleId }) => {
    const headers = { "Content-Type": "application/json" };
    await fetch(`/api/v1/screens/${screenId}`, { method: "PATCH", headers,
      body: JSON.stringify({ signageOnly: false, permanentPairing: false }) });
    await fetch(`/api/v1/signage/${scheduleId}`, { method: "DELETE" });
  }, permanentSign);

  await page.getByRole("button", { name: "Operations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Screen and content status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Per-screen format mapping" })).toBeVisible();
  await page.getByRole("button", { name: "Emergency", exact: true }).click();
  await page.getByRole("button", { name: "New alert type" }).click();
  const emergencyDialog = page.getByRole("dialog", { name: "New emergency alert type" });
  await emergencyDialog.getByLabel("Name").fill("Browser safety notice");
  await emergencyDialog.getByLabel("Message").fill("Please follow staff directions.");
  await emergencyDialog.getByRole("button", { name: "Review alert" }).click();
  const emergencyReview = page.getByRole("dialog", { name: "Review emergency alert" });
  await expect(emergencyReview).toContainText("Please follow staff directions.");
  await emergencyReview.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.locator(".emergency-card").filter({ hasText: "Browser safety notice" })).toBeVisible();
  }

  const browserPlayerPin = await page.evaluate(async () =>
    (await fetch("/api/v1/admin/bootstrap").then(response => response.json())).pairingPin as string);
  await page.goto("/player");
  await expect(page.getByRole("heading", { name: "Pair this computer or projector" })).toBeVisible();
  await page.getByLabel("Display name").fill("Browser Test Projector");
  await page.getByRole("button", { name: "Start pairing" }).click();
  await page.getByLabel("Six-digit pairing PIN").fill(browserPlayerPin);
  await page.getByRole("button", { name: "Pair this display" }).click();
  await expect(page.getByRole("heading", { name: "Ready for a lesson" })).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();

  const browserPlayback = await page.evaluate(async () => {
    const identity = JSON.parse(localStorage.getItem("lessoncue.web-player.identity.v1") || "{}");
    const lessons = await fetch("/api/v1/lessons").then(response => response.json());
    const lesson = lessons.find((entry: { items: { title: string }[] }) => entry.items.some(item => item.title === "Browser Test Audio"));
    const item = lesson.items.find((entry: { title: string }) => entry.title === "Browser Test Audio");
    const response = await fetch(`/api/v1/screens/${identity.screenId}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "play", lessonId: lesson.id, itemId: item.id }),
    });
    const command = await response.json();
    return { screenId: identity.screenId, lessonId: lesson.id, itemId: item.id, version: command.version, status: response.status };
  });
  expect(browserPlayback.status).toBe(202);
  await expect(page.getByText("Browser Test Audio", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start browser playback/ })).toBeVisible();
  await expect.poll(() => page.evaluate(async ({ screenId, version }) => {
    const screens = await fetch("/api/v1/screens").then(response => response.json());
    const screen = screens.find((entry: { id: string }) => entry.id === screenId);
    return { acknowledged: screen?.acknowledgedControlVersion, platform: screen?.platform, appVersion: screen?.appVersion };
  }, browserPlayback), { timeout: 12_000 }).toEqual({ acknowledged: browserPlayback.version, platform: "web-player", appVersion: "0.40.8" });
  await page.getByRole("button", { name: /Start browser playback/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Ready for a lesson" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ready for a lesson" })).toBeVisible();
  await expect(page.getByText("Browser Test Audio", { exact: true })).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("button", { name: /Audience$/ }).click();
  await expect(page.getByRole("heading", { name: "Audience interaction" })).toBeVisible();
  await page.getByRole("button", { name: "New interaction" }).click();
  const audienceDialog = page.getByRole("dialog", { name: "New audience session" });
  await audienceDialog.getByLabel("Session title").fill("Browser audience poll");
  await audienceDialog.getByLabel("Prompt").fill("Ready to continue?");
  await audienceDialog.getByRole("button", { name: "Save session" }).click();
  await expect(page.getByRole("heading", { name: "Browser audience poll" })).toBeVisible();
  await page.getByRole("button", { name: "Open responses" }).click();
  await expect(page.getByText("Audience session opened.")).toBeVisible();
  const audiencePath = await page.getByRole("link", { name: "Open response page" }).getAttribute("href");
  expect(audiencePath).toMatch(/^\/respond\/[A-Z0-9]{6}$/);
  const responsePage = await page.context().newPage();
  await responsePage.goto(audiencePath!);
  await expect(responsePage.getByRole("heading", { name: "Browser audience poll" })).toBeVisible();
  await responsePage.getByLabel("Yes").check();
  await responsePage.getByRole("button", { name: "Send anonymous response" }).click();
  await expect(responsePage.getByText("Response received")).toBeVisible();
  await responsePage.close();
  await expect.poll(() => page.evaluate(async () => {
    const sessions = await fetch("/api/v1/audience/admin/sessions").then(response => response.json());
    return { participants: sessions[0]?.participantCount, responses: sessions[0]?.questions[0]?.responses.length };
  })).toEqual({ participants: 1, responses: 1 });
  await expect(page.getByText("1 anonymous participant", { exact: false })).toBeVisible();
  const audienceDisplayPage = await page.context().newPage();
  await audienceDisplayPage.goto(
    audiencePath!.replace("/respond/", "/audience-display/") +
      "?results=1&delay=1",
  );
  await expect(
    audienceDisplayPage.getByRole("heading", { name: "Ready to continue?" }),
  ).toBeVisible();
  await expect(audienceDisplayPage.getByText("1 response")).toHaveCount(0);
  await expect(audienceDisplayPage.getByText("1 response")).toBeVisible({
    timeout: 4_000,
  });
  await expect(audienceDisplayPage.getByText(/delay/i)).toHaveCount(0);
  await audienceDisplayPage.close();

  await page.getByRole("button", { name: /Classes$/ }).click();
  await page.getByRole("button", { name: /Learning Lab/ }).click();
  await page.getByRole("button", { name: /Sample Lesson/ }).first().click();
  await page.getByRole("button", { name: "Add media" }).click();
  await page.getByRole("button", { name: "Add an audience poll" }).click();
  const lessonAudienceForm = page.getByRole("dialog", { name: "Add an audience poll" });
  await expect(lessonAudienceForm.getByLabel("Audience poll")).toContainText("Browser audience poll");
  await lessonAudienceForm.getByLabel("Display title").fill("Live class poll");
  await lessonAudienceForm.getByLabel("Planned duration").fill("90");
  await lessonAudienceForm.getByLabel("Result timing").selectOption("30");
  await lessonAudienceForm.getByRole("button", { name: "Add audience poll" }).click();
  await expect(page.getByText("Audience poll added to the lesson.")).toBeVisible();
  await expect(page.getByText("Live class poll", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Signage$/ }).click();
  await page.getByRole("button", { name: /2 Playlists Choose looping content/ }).click();
  await page.getByRole("button", { name: /Browser continuous loop/ }).click();
  await page
    .getByLabel("Playlist audience result timing")
    .selectOption("30");
  await page.getByLabel("Audience poll to add").selectOption({ index: 1 });
  await expect(page.locator(".playlist-timeline")).toContainText("Browser audience poll");
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.locator(".toast")).toContainText("Playlist saved. It will loop continuously.");

  await page.getByRole("button", { name: /1 Layouts Build the persistent frame/ }).click();
  await page.getByRole("button", { name: /Browser information frame/ }).click();
  await page.locator(".element-list button").filter({ hasText: "Text message" }).first().click();
  await page.locator(".element-editor select").first().selectOption("audience");
  await page.locator(".audience-poll-controls select").first().selectOption({ index: 1 });
  await page.getByLabel("Audience result timing").selectOption("30");
  await expect(page.locator(".signage-audience img")).toHaveAttribute("alt", /\/respond\/[A-Z0-9]{6}$/);
  await expect(page.locator(".signage-audience")).toContainText("Voting open");
  await expect(page.locator(".signage-audience")).toContainText("Ready to continue?");
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.locator(".toast")).toContainText("Layout saved and updated on assigned screens.");

  await page.locator(".simple-signage-navigation summary").click();
  await page.locator(".simple-signage-navigation").getByRole("button", { name: /Users$/ }).click();
  await page.getByRole("button", { name: "Send setup link" }).click();
  const invitationDialog = page.getByRole("dialog", { name: "Invite a user" });
  await expect(invitationDialog.getByLabel("Email")).toBeVisible();
  await expect(invitationDialog.getByText("recipient chooses their name, username, and password", { exact: false })).toBeVisible();
  await invitationDialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Create with password" }).click();
  const userDialog = page.getByRole("dialog", { name: "Create a local user" });
  await userDialog.getByLabel("Name", { exact: true }).fill("Playback Volunteer");
  await userDialog.getByLabel("Username").fill("playback-volunteer");
  await userDialog.getByRole("combobox", { name: /Role/ }).selectOption("Viewer");
  await userDialog.getByLabel("Customize this role").check();
  await userDialog.getByRole("button", { name: /^Live playback/ }).click();
  await expect(userDialog.getByRole("button", { name: /Live playback/ })).toHaveAttribute("aria-pressed", "true");
  await userDialog.getByLabel("Temporary password").fill("PlaybackOnly42");
  await userDialog.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText("Local user created with a temporary password.", { exact: false })).toBeVisible();
  const volunteerRow = page.locator(".user-row").filter({ hasText: "Playback Volunteer" });
  await expect(volunteerRow).toContainText("1 of 9 permissions · custom");
  await volunteerRow.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("dialog", { name: "Temporary password for Playback Volunteer" })).toBeVisible();
  await page.getByRole("dialog", { name: "Temporary password for Playback Volunteer" }).getByRole("button", { name: "Close dialog" }).click();

  await page.getByRole("button", { name: /Test Administrator Updated.*Manage account/ }).click();
  await page.getByRole("dialog", { name: "Your account" }).getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to LessonCue" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request access" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend verification" })).toBeVisible();
  expect(await page.locator(".auth-links > *").evaluateAll(elements => {
    const rectangles = elements.map(element => element.getBoundingClientRect());
    return rectangles.every((rectangle, index) => rectangles.every((other, otherIndex) =>
      index === otherIndex || rectangle.right <= other.left || other.right <= rectangle.left ||
      rectangle.bottom <= other.top || other.bottom <= rectangle.top));
  })).toBe(true);
  const signInCard = page.locator(".auth-card");
  await signInCard.getByLabel("Username").fill("playback-volunteer");
  await signInCard.getByLabel("Password").fill("PlaybackOnly42");
  await signInCard.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/api/v1/classes")).status)).toBe(403);
  await page.getByLabel("Temporary password").fill("PlaybackOnly42");
  await page.locator('input[name="newPassword"]').fill("PlaybackChanged43");
  await page.locator('input[name="confirmPassword"]').fill("PlaybackChanged43");
  await page.getByRole("button", { name: "Change password and continue" }).click();
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
