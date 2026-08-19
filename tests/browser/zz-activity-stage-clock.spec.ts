import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// The room could not see the clock: timers were drawn only on the phones.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Stage Clock");

async function launchWord(page: Page, name: string, seconds: number) {
  return page.evaluate(async input => {
    const created = await fetch("/api/v1/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name, type: "word", config: {
          title: input.name,
          rounds: [{ id: "round-1", prompt: "Name something fast.", category: "Speed", points: 10, seconds: input.seconds }],
          requireModeration: true, allowDuplicates: false, maxWords: 30, turnBased: false, eliminateOnDuplicate: false,
        },
      }),
    }).then(r => r.json()) as { id: string };
    const run = await fetch("/api/v1/activity-runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityDefinitionId: created.id }),
    }).then(r => r.json()) as { runId: string; state?: { joinCode?: string } };
    return { runId: run.runId, joinCode: run.state!.joinCode! };
  }, { name, seconds });
}

test("the stage shows the response clock and enters panic in the last five seconds", async ({ page, context }) => {
  await authenticate(page);
  const run = await launchWord(page, "Stage Clock Check", 20);

  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  try {
    await tv.goto(`/activity-display?runId=${run.runId}`);
    await expect(tv.locator('.activity-display-root[data-activity-status="ready"]')).toBeVisible({ timeout: 20_000 });
    // No window open yet, so no clock.
    await expect(tv.locator(".activity-stage-clock")).toHaveCount(0);

    await page.evaluate(async id => {
      await fetch(`/api/v1/activity-runs/${id}/command`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", payload: null }),
      });
    }, run.runId);

    const clock = tv.locator(".activity-stage-clock .activity-motion-countdown");
    await expect(clock).toBeVisible({ timeout: 15_000 });
    // Sized for the back of a room, not a phone.
    const size = await clock.locator("strong").evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize));
    expect(size, "stage clock should be large").toBeGreaterThan(38);

    // The shared panic threshold applies to the room clock too.
    await expect(clock).toHaveAttribute("data-panic", "true", { timeout: 25_000 });
  } finally {
    await tv.close();
  }
});
