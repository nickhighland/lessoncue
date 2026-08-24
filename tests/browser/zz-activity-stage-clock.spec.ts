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

test("the stage shows the response clock, sized for the back of a room", async ({ page, context }) => {
  await authenticate(page);
  // Deliberately far longer than the test needs. The clock unmounts the moment
  // the round ends, so a round that can expire mid-assertion makes every read
  // after the first a race.
  const run = await launchWord(page, "Stage Clock Check", 600);

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
    const size = await clock.locator("strong").evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize));
    expect(size, "stage clock should be large").toBeGreaterThan(38);
  } finally {
    await tv.close();
  }
});

test("the room clock enters panic in the last five seconds", async ({ page, context }) => {
  await authenticate(page);
  // Panic is only true while there is time left, so the window closes as well
  // as opens. Nothing else is asserted here: one timing-sensitive claim per
  // test, and no reads of children that vanish when the round ends.
  const run = await launchWord(page, "Stage Panic Check", 30);

  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  try {
    await tv.goto(`/activity-display?runId=${run.runId}`);
    await expect(tv.locator('.activity-display-root[data-activity-status="ready"]')).toBeVisible({ timeout: 20_000 });
    await page.evaluate(async id => {
      await fetch(`/api/v1/activity-runs/${id}/command`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", payload: null }),
      });
    }, run.runId);

    await expect(tv.locator(".activity-stage-clock .activity-motion-countdown"))
      .toHaveAttribute("data-panic", "true", { timeout: 40_000 });
  } finally {
    await tv.close();
  }
});

test("a game timed by autonomy puts its answer window on the room's screen too", async ({ page, context }) => {
  await authenticate(page);
  // Trivia runs no engine timer of its own — autonomy publishes a deadline
  // instead, and that clock used to be invisible to everyone but the server.
  const run = await page.evaluate(async () => {
    const created = await fetch("/api/v1/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Autonomous Clock", type: "trivia", config: {
          title: "Autonomous Clock",
          rounds: [{ id: "round-1", prompt: "Pick one.", options: ["A", "B"], correctIndex: 0, points: 10 }],
        },
      }),
    }).then(r => r.json()) as { id: string };
    const started = await fetch("/api/v1/activity-runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityDefinitionId: created.id }),
    }).then(r => r.json()) as { runId: string };
    await fetch(`/api/v1/activity-runs/${started.runId}/command`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open", payload: null }),
    });
    return started;
  });

  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  try {
    await tv.goto(`/activity-display?runId=${run.runId}`);
    const clock = tv.locator(".activity-stage-clock .activity-motion-countdown");
    await expect(clock).toBeVisible({ timeout: 20_000 });

    // A real countdown, not a frozen zero, and with a bar to read it against.
    await expect(clock.locator("strong")).not.toHaveText("0:00");
    await expect(clock.locator(".activity-motion-countdown-track")).toBeVisible();
    const first = await clock.locator("strong").textContent();
    await expect.poll(async () => clock.locator("strong").textContent(), { timeout: 10_000 }).not.toBe(first);
  } finally {
    await tv.close();
  }
});
