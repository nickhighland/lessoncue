import { expect, test } from "@playwright/test";

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

test("fresh local server supports setup, direct lesson upload, retention, and online media", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create your local administrator" })).toBeVisible();
  await page.getByLabel("Organization name").fill("LessonCue Browser Test");
  await page.getByLabel("Your name").fill("Test Administrator");
  await page.getByLabel("Username").fill("browser-admin");
  await page.locator('input[type="password"]').fill("LessonCueTest42");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ })).toBeVisible();

  await page.getByRole("button", { name: /Classes$/ }).click();
  await page.getByRole("button", { name: /Sample Lesson/ }).click();
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
  await expect(page.getByText("Media added. It will be deleted four weeks after", { exact: false })).toBeVisible();
  await expect(page.getByText("Browser Test Audio", { exact: true })).toBeVisible();

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

  await page.getByRole("button", { name: /Settings$/ }).click();
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
  await page.getByRole("button", { name: "Save settings" }).click();
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
  await expect(page.locator(".media-table").filter({ hasText: "one-page-handout — Slide 1" })).toBeVisible();
  await page.getByRole("button", { name: /Classes$/ }).click();
  await page.getByRole("button", { name: /Sample Lesson/ }).click();
  await expect(page.getByText("one-page-handout — Slide 1", { exact: true })).toBeVisible();
});
