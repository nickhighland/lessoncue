import { expect, test } from "@playwright/test";

function silentWav() {
  const sampleRate = 8_000;
  const dataBytes = sampleRate * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + dataBytes, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
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
});
