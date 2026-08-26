import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

test.use({
  serviceWorkers: "block",
  viewport: { width: 1280, height: 1000 },
});

test("MFA is available per account and is not shown for an unenrolled login", async ({ page, browser }) => {
  await signInAsAdmin(page, "MFA settings");

  await page.getByRole("button", { name: /Manage account/ }).click();
  const accountDialog = page.getByRole("dialog", { name: "Your account" });
  await expect(accountDialog.getByRole("heading", { name: "Authenticator MFA" })).toBeVisible();
  await expect(accountDialog.getByText("Each user can protect their own account", { exact: false })).toBeVisible();
  await accountDialog.getByRole("button", { name: "Close dialog" }).click();

  await page.getByRole("button", { name: /Settings$/ }).click();
  await page.getByRole("button", { name: "Security & Audit", exact: true }).click();
  const allUserPolicy = page.getByLabel("Require Authenticator MFA for every active user");
  await expect(allUserPolicy).toBeVisible();
  await expect(allUserPolicy).not.toBeChecked();
  await expect(allUserPolicy).toBeDisabled();

  const loginContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const loginPage = await loginContext.newPage();
  try {
    await loginPage.goto("/");
    await loginPage.getByLabel("Username").fill("browser-admin");
    await expect(loginPage.getByLabel("Authenticator code")).toHaveCount(0);
    const requirement = await loginPage.evaluate(async () => {
      const response = await fetch("/api/v1/auth/login/mfa-requirement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "browser-admin" }),
      });
      return { status: response.status, body: await response.json() };
    });
    expect(requirement).toEqual({ status: 200, body: { required: false } });
  } finally {
    await loginContext.close();
  }
});
