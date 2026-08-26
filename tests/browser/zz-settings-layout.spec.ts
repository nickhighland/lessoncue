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

test("Room controller policy sits beside Authenticator MFA on desktop", async ({ page }) => {
  await signInAsAdmin(page, "Security settings layout");
  await page.getByRole("button", { name: /Settings$/ }).click();
  await page.getByRole("button", { name: "Security & Audit", exact: true }).click();

  const mfa = page.locator("section.settings-mfa");
  const policy = page.locator("section.settings-room-policy");
  await expect(mfa).toBeVisible();
  await expect(policy).toBeVisible();

  const positions = await page.evaluate(() => {
    const mfaSection = document.querySelector("section.settings-mfa");
    const policySection = document.querySelector("section.settings-room-policy");
    if (!mfaSection || !policySection) throw new Error("Security settings sections are missing");
    const mfaRect = mfaSection.getBoundingClientRect();
    const policyRect = policySection.getBoundingClientRect();
    return {
      sameGrid: mfaSection.parentElement === policySection.parentElement,
      mfaTop: mfaRect.top,
      policyTop: policyRect.top,
      mfaRight: mfaRect.right,
      policyLeft: policyRect.left,
      policyWidth: policyRect.width,
    };
  });

  expect(positions.sameGrid).toBe(true);
  expect(Math.abs(positions.mfaTop - positions.policyTop)).toBeLessThan(4);
  expect(positions.mfaRight).toBeLessThanOrEqual(positions.policyLeft);
  expect(positions.policyWidth).toBeGreaterThan(0);
});

test("Privacy & backups spans the settings area and uses compact columns on desktop", async ({ page }) => {
  await signInAsAdmin(page, "Backup settings layout");
  await page.getByRole("button", { name: /Settings$/ }).click();
  await page.getByRole("button", { name: "Backup & Recovery", exact: true }).click();

  const privacy = page.locator("section.settings-privacy-backups");
  await expect(privacy).toBeVisible();

  const positions = await page.evaluate(() => {
    const panel = document.querySelector("section.settings-privacy-backups");
    const retention = document.querySelector("section.settings-privacy-backups > form.retention-form");
    const policy = document.querySelector("section.settings-privacy-backups > form.backup-policy-form");
    const grid = panel?.parentElement;
    if (!panel || !retention || !policy || !grid) {
      throw new Error("Privacy and backup settings sections are missing");
    }
    const panelRect = panel.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const retentionRect = retention.getBoundingClientRect();
    const policyRect = policy.getBoundingClientRect();
    return {
      panelWidth: panelRect.width,
      gridWidth: gridRect.width,
      retentionTop: retentionRect.top,
      policyTop: policyRect.top,
      retentionRight: retentionRect.right,
      policyLeft: policyRect.left,
    };
  });

  expect(positions.panelWidth).toBeGreaterThan(positions.gridWidth * 0.95);
  expect(Math.abs(positions.retentionTop - positions.policyTop)).toBeLessThan(4);
  expect(positions.retentionRight).toBeLessThanOrEqual(positions.policyLeft);
});

test("Settings overview includes the system diagnostics panel", async ({ page }) => {
  await signInAsAdmin(page, "Settings overview diagnostics");
  await page.getByRole("button", { name: /Settings$/ }).click();

  const overview = page.locator('.settings-page[data-section="overview"]');
  await expect(overview.locator("section.settings-diagnostics")).toBeVisible();
  await expect(
    overview.getByRole("heading", { name: "System diagnostics & support" }),
  ).toBeVisible();
  await expect(
    overview.getByRole("link", { name: "Download redacted support bundle" }),
  ).toBeVisible();
});
