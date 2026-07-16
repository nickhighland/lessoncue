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
});
