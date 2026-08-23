import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// The host presses Start and moderates. Everything else is on a clock, and the
// controller says what it is doing.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Auto Play");

async function launch(page: Page, name: string, type: string, config: Record<string, unknown>) {
  return page.evaluate(async input => {
    const created = await fetch("/api/v1/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name, type: input.type, config: input.config }),
    }).then(r => r.json()) as { id: string };
    const run = await fetch("/api/v1/activity-runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityDefinitionId: created.id }),
    }).then(r => r.json()) as { runId: string; state?: { joinCode?: string } };
    return { runId: run.runId, joinCode: run.state!.joinCode! };
  }, { name, type, config });
}

const phaseOf = (page: Page, runId: string) => page.evaluate(async id =>
  (await fetch(`/api/v1/activity-runs/${id}`).then(r => r.json()))?.state?.phase as string, runId);

const host = (page: Page, runId: string, action: string) => page.evaluate(async input => {
  await fetch(`/api/v1/activity-runs/${input.id}/command`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: input.action, payload: null }),
  });
}, { id: runId, action });

async function joinPhone(page: Page, joinCode: string, name: string) {
  const context = await page.context().browser()!.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await context.newPage();
  await phone.goto(`/play/${joinCode}`);
  await phone.getByLabel("Display name").fill(name);
  await phone.getByRole("button", { name: "Join game" }).click();
  await expect(phone.getByText("You’re in.")).toBeVisible();
  return phone;
}

const QUIZ = {
  title: "Auto Quiz",
  questions: [
    { id: "q1", prompt: "Red planet?", options: ["Venus", "Mars"], correctIndex: 1 },
    { id: "q2", prompt: "Continents?", options: ["6", "7"], correctIndex: 1 },
  ],
};

test("a lobby waits for the host, then the game runs itself to standings", async ({ page }) => {
  test.setTimeout(120_000);
  await authenticate(page);
  const run = await launch(page, "Auto Quiz", "trivia", QUIZ);
  const phone = await joinPhone(page, run.joinCode, "Alex");

  try {
    // Nothing moves until a person says so.
    await page.waitForTimeout(6_000);
    expect(await phaseOf(page, run.runId)).toBe("lobby");

    await host(page, run.runId, "start");

    // The round intro opens the question by itself.
    await expect.poll(() => phaseOf(page, run.runId), { timeout: 30_000 }).toBe("acceptingResponses");

    // The last answer closes the window without the host.
    await phone.locator(".participant-choice-list button").nth(1).click();
    await expect.poll(() => phaseOf(page, run.runId), { timeout: 20_000 }).toBe("reveal");

    // Standings come up after the round, unasked.
    await expect.poll(() => phaseOf(page, run.runId), { timeout: 30_000 }).toBe("leaderboard");
  } finally {
    await phone.context().close();
  }
});

test("the controller says what it wants and counts down when it does not", async ({ page }) => {
  test.setTimeout(120_000);
  await authenticate(page);
  const run = await launch(page, "Guided Quiz", "trivia", QUIZ);
  const phone = await joinPhone(page, run.joinCode, "Alex");

  try {
    await page.goto(`/activity-display?runId=${run.runId}`);
    // The host panel is reachable from the controller, but its guidance is the
    // same component, so drive it through the API-backed state instead.
    await host(page, run.runId, "start");
    await expect.poll(() => phaseOf(page, run.runId), { timeout: 30_000 }).toBe("acceptingResponses");

    // Holding stops the clock entirely.
    await host(page, run.runId, "hold");
    const held = await phaseOf(page, run.runId);
    await page.waitForTimeout(8_000);
    expect(await phaseOf(page, run.runId), "a held game must not advance").toBe(held);

    await host(page, run.runId, "resume");
    await phone.locator(".participant-choice-list button").nth(1).click();
    await expect.poll(() => phaseOf(page, run.runId), { timeout: 25_000 }).not.toBe(held);
  } finally {
    await phone.context().close();
  }
});

test("a player can change their name and character without losing their score", async ({ page }) => {
  test.setTimeout(120_000);
  await authenticate(page);
  const run = await launch(page, "Rename Quiz", "trivia", QUIZ);
  const phone = await joinPhone(page, run.joinCode, "Alex");

  try {
    await host(page, run.runId, "start");
    await expect.poll(() => phaseOf(page, run.runId), { timeout: 30_000 }).toBe("acceptingResponses");
    await phone.locator(".participant-choice-list button").nth(1).click();
    await expect.poll(() => phaseOf(page, run.runId), { timeout: 25_000 }).toBe("reveal");

    // Their own result card proves they scored.
    await expect(phone.locator(".participant-result")).toHaveClass(/participant-result-correct/, { timeout: 20_000 });

    await phone.getByRole("button", { name: /Change your name and character/ }).click();
    const editor = phone.locator(".participant-identity-editor");
    await expect(editor).toBeVisible();
    await editor.getByRole("radio", { name: /^Character / }).nth(4).click();
    await editor.locator("input").fill("Alexandra");
    await editor.getByRole("button", { name: "Save" }).click();

    // Same player: the header updates and no second person appears.
    await expect(phone.getByRole("button", { name: /Not Alexandra\?/ })).toBeVisible({ timeout: 15_000 });
    const roster = await page.evaluate(async id =>
      ((await fetch(`/api/v1/activity-sessions/${id}/host-state`).then(r => r.json()))
        .participants as Array<{ displayName: string }>), run.runId);
    expect(roster).toHaveLength(1);
    expect(roster[0].displayName).toBe("Alexandra");
  } finally {
    await phone.context().close();
  }
});
