import AxeBuilder from "@axe-core/playwright";
import { expect, Page, test } from "@playwright/test";

const password = "LessonCueTest42";

async function scan(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations,
    `${label} accessibility violations:\n${result.violations
      .map(
        violation =>
          `${violation.id}: ${violation.help}\n${violation.nodes
            .map(node => `  ${node.target.join(" ")} — ${node.failureSummary}`)
            .join("\n")}`,
      )
      .join("\n")}`,
  ).toEqual([]);
}

async function authenticate(page: Page) {
  await page.goto("/");
  const setupHeading = page.getByRole("heading", {
    name: "Create your Service Admin",
  });
  const loginHeading = page.getByRole("heading", {
    name: "Sign in to LessonCue",
  });
  await expect(setupHeading.or(loginHeading)).toBeVisible();
  if (
    await setupHeading.isVisible()
  ) {
    await scan(page, "first-run setup");
    await page.getByLabel("Organization name").fill("Accessibility Test");
    await page.getByLabel("Your name").fill("Accessibility Administrator");
    await page.getByLabel("Username").fill("browser-admin");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Finish setup" }).click();
  } else if (
    await loginHeading.isVisible()
  ) {
    await scan(page, "sign-in");
    await page.getByLabel("Username").fill("browser-admin");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ }),
  ).toBeVisible();
}

test("primary administration paths meet the automated WCAG 2.2 AA baseline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await authenticate(page);

  await scan(page, "dashboard");

  await page.getByRole("button", { name: /Lessons$/ }).click();
  await expect(page.getByRole("heading", { name: "Lessons" })).toBeVisible();
  await scan(page, "classes");

  await page.getByRole("button", { name: /Media Library$/ }).click();
  await expect(page.getByRole("heading", { name: "Media library" })).toBeVisible();
  await scan(page, "media library");

  await page.getByRole("button", { name: /Settings$/ }).click();
  await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  await scan(page, "settings");
});

test("confirmation dialogs trap focus, close with Escape, and restore focus", async ({
  page,
}) => {
  await authenticate(page);
  await page.getByRole("button", { name: /Lessons$/ }).click();
  await page.locator(".class-list button").first().click();
  await page.getByRole("button", { name: "Edit class" }).click();
  const deleteButton = page.getByRole("button", {
    name: "Move class to recycling bin",
  });
  await deleteButton.focus();
  await deleteButton.click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("button", { name: "Move to recycling bin" })).toBeFocused();
  await scan(page, "confirmation dialog");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(deleteButton).toBeFocused();
});
