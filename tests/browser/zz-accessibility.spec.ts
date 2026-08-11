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

test("mobile navigation, skip link, switches, and public audience flow remain accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page);

  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
  await scan(page, "mobile navigation drawer");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();

  const skip = page.getByRole("link", { name: "Skip to main content" });
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  await page.evaluate(async () => {
    const headers = { "Content-Type": "application/json" };
    const bootstrap = await fetch("/api/v1/admin/bootstrap").then(response => response.json());
    const pairing = await fetch("/api/v1/pairing/request", {
      method: "POST",
      headers,
      body: JSON.stringify({ deviceName: "Accessibility browser screen", platform: "web-player", appVersion: "test" }),
    }).then(response => response.json());
    const identity = await fetch("/api/v1/pairing/confirm", {
      method: "POST",
      headers,
      body: JSON.stringify({ requestId: pairing.requestId, pin: bootstrap.pairingPin }),
    }).then(response => response.json());
    await fetch("/api/v1/tv/status", {
      method: "POST",
      headers: { ...headers, Authorization: `Bearer ${identity.deviceToken}` },
      body: JSON.stringify({
        screenId: identity.screenId,
        appVersion: "test",
        online: true,
        freeBytes: 1_000_000_000,
        manifestVersion: 1,
        failedDownloads: 0,
        cachedItems: 0,
        totalItems: 0,
        clientTimeUnixMs: Date.now(),
        networkLatencyMs: 5,
        cacheInventory: [],
        downloadQueue: [],
        codecCapabilities: [],
        recentErrors: [],
      }),
    });
  });

  await menu.click();
  await page.getByRole("button", { name: /Screens$/ }).click();
  await expect(page.getByRole("heading", { name: "Screens" })).toBeVisible();
  const switches = page.locator(".switch-row input[type=checkbox]");
  await expect(switches.first()).toBeAttached();
  await switches.first().focus();
  await expect(switches.first()).toBeFocused();

  const session = await page.evaluate(async () => {
    const response = await fetch("/api/v1/audience/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Accessible public poll",
        privacy: "Anonymous and local.",
        retentionDays: 1,
        showLiveResults: true,
        allowResponseChanges: false,
        questions: [{ type: "single", prompt: "Is this easy to use?", options: ["Yes", "No"], required: true, maxSelections: 1, moderateResponses: false }],
      }),
    });
    const created = await response.json();
    const opened = await fetch(`/api/v1/audience/admin/sessions/${created.id}/state/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!opened.ok) throw new Error(`Audience session did not open (${opened.status}).`);
    return created;
  });
  await page.goto(`/respond/${session.code}`);
  await expect(page.getByRole("heading", { name: "Accessible public poll" })).toBeVisible();
  await scan(page, "public audience response at phone width");
  for (const width of [320, 390, 480, 720, 1080]) {
    await page.setViewportSize({ width, height: width <= 480 ? 844 : 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      `public audience response must not overflow at ${width}px`,
    ).toBe(true);
    const submitBounds = await page.getByRole("button", { name: "Send anonymous response" }).boundingBox();
    expect(submitBounds?.height, `submit touch target at ${width}px`).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const firstChoice = page.getByLabel("Yes");
  await firstChoice.focus();
  await page.keyboard.press("Space");
  await expect(firstChoice).toBeChecked();
});
