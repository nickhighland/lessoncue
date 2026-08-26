import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

test.use({
  serviceWorkers: "block",
  viewport: { width: 1280, height: 1000 },
});

test("Upload limits sits beside Storage allocation on desktop", async ({ page }) => {
  await signInAsAdmin(page, "Settings layout");
  await page.getByRole("button", { name: /Settings$/ }).click();
  await page.getByRole("button", { name: "Media & Storage", exact: true }).click();

  const upload = page.locator("section.settings-upload-limits");
  const storage = page.locator("section.settings-storage");
  await expect(upload).toBeVisible();
  await expect(storage).toBeVisible();

  const positions = await page.evaluate(() => {
    const uploadSection = document.querySelector("section.settings-upload-limits");
    const storageSection = document.querySelector("section.settings-storage");
    if (!uploadSection || !storageSection) throw new Error("Media settings sections are missing");
    const uploadRect = uploadSection.getBoundingClientRect();
    const storageRect = storageSection.getBoundingClientRect();
    return {
      uploadTop: uploadRect.top,
      storageTop: storageRect.top,
      uploadRight: uploadRect.right,
      storageLeft: storageRect.left,
      uploadWidth: uploadRect.width,
    };
  });

  expect(Math.abs(positions.uploadTop - positions.storageTop)).toBeLessThan(4);
  expect(positions.uploadRight).toBeLessThanOrEqual(positions.storageLeft);
  expect(positions.uploadWidth).toBeGreaterThan(0);
});
