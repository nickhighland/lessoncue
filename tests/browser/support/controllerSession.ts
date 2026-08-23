import { expect, type Page } from "@playwright/test";

/**
 * One universal-remote unlock shared by every spec in a worker.
 *
 * `/controller/unlock` sits behind the same ten-per-five-minutes budget as
 * sign-in, and that budget is per IP across the whole suite. Each spec
 * unlocking for itself spent it, and the specs that ran later got a 429 and a
 * remote stuck on the PIN screen.
 *
 * The grant it returns is just a string the remote reads out of session
 * storage at mount, so it is held in the worker and seeded into each new
 * context. Deliberately in memory rather than on disk: a grant only means
 * anything to the server process that issued it, and a stale one from an
 * earlier run would unlock the shell and then fail at the first command.
 */
const KEY = "lessoncue.universalGrant";
const PIN = "482731";

let granted: string | null = null;

/** Open the universal remote, spending an unlock only when this worker has no grant. */
export async function openUniversalRemote(page: Page, screenId: string) {
  if (!granted) {
    const status = await page.evaluate(async pin => (await fetch("/api/v1/controller-pin", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }),
    })).status, PIN);
    expect(status).toBe(204);
  }

  await page.goto("/universalremote");

  if (granted) {
    await page.evaluate(([key, value]) => sessionStorage.setItem(key, value), [KEY, granted]);
    await page.reload();
  } else {
    await page.getByLabel("Six-digit controller PIN").fill(PIN);
    await page.getByRole("button", { name: "Open universal remote" }).click();
  }

  // Wait for the shell itself: selecting straight away raced its mount, which
  // under a loaded machine read as "the screen selector does not exist".
  await expect(page.locator(".remote-shell")).toBeVisible({ timeout: 30_000 });
  if (!granted) {
    granted = await page.evaluate(key => sessionStorage.getItem(key), KEY);
    expect(granted).toMatch(/^[0-9a-f]{64}$/);
  }

  const selector = page.getByLabel("Control this screen");
  await expect(selector.locator(`option[value="${screenId}"]`)).toHaveCount(1, { timeout: 30_000 });
  await selector.selectOption(screenId);
}
