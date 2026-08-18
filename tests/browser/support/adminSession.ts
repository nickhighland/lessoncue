import { expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * One admin sign-in shared by every spec that needs it.
 *
 * The server rate-limits sign-in to 10 attempts per 5 minutes per IP, and that
 * budget is shared across the whole suite. Specs that each signed in
 * separately pushed the later ones into 429s, so cookies are cached on disk and
 * reused. The cache is per-run: the Playwright webServer starts from a fresh
 * data path, so a stale cookie simply fails the reuse check and we sign in once
 * more.
 */
const CACHE = "test-results/.auth/admin-cookies.json";
const PASSWORD = "LessonCueTest42";

type Cookies = Awaited<ReturnType<Page["context"]>["cookies"]> extends Promise<infer T> ? T : never;

const greeting = (page: Page) =>
  page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ });

async function reuseCached(page: Page): Promise<boolean> {
  if (!existsSync(CACHE)) return false;
  try {
    const cookies = JSON.parse(readFileSync(CACHE, "utf8")) as Cookies;
    if (!Array.isArray(cookies) || !cookies.length) return false;
    await page.context().addCookies(cookies);
    await page.goto("/");
    await expect(greeting(page)).toBeVisible({ timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export async function signInAsAdmin(page: Page, organization: string): Promise<void> {
  if (await reuseCached(page)) return;

  await page.goto("/");
  const setup = page.getByRole("heading", { name: "Create your Service Admin" });
  const signIn = page.getByRole("heading", { name: "Sign in to LessonCue" });
  await expect(setup.or(signIn)).toBeVisible();

  if (await setup.isVisible()) {
    await page.getByLabel("Organization name").fill(organization);
    await page.getByLabel("Your name").fill(`${organization} Admin`);
    await page.getByLabel("Username").fill("browser-admin");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Finish setup" }).click();
  } else {
    await page.getByLabel("Username").fill("browser-admin");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(greeting(page)).toBeVisible();

  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(await page.context().cookies()));
}
