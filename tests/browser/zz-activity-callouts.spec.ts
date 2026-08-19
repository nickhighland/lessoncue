import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// Streak and speed callouts ride on the scoring the server already does, so
// they must never be a client claim about how fast someone was.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Callouts");

async function launchTrivia(page: Page, name: string) {
  return page.evaluate(async activityName => {
    const created = await fetch("/api/v1/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: activityName, type: "trivia", config: {
          title: activityName,
          questions: [
            { id: "q1", prompt: "Red planet?", options: ["Venus", "Mars"], correctIndex: 1 },
            { id: "q2", prompt: "Continents?", options: ["6", "7"], correctIndex: 1 },
          ],
        },
      }),
    }).then(r => r.json()) as { id: string };
    const run = await fetch("/api/v1/activity-runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityDefinitionId: created.id }),
    }).then(r => r.json()) as { runId: string; state?: { joinCode?: string } };
    return { runId: run.runId, joinCode: run.state!.joinCode! };
  }, name);
}

const host = (page: Page, runId: string, action: string) => page.evaluate(async ({ id, command }) => {
  const response = await fetch(`/api/v1/activity-runs/${id}/command`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: command, payload: null }),
  });
  if (!response.ok) throw new Error(`${command}: ${response.status}`);
}, { id: runId, command: action });

async function joinPhone(page: Page, joinCode: string, name: string) {
  const context = await page.context().browser()!.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await context.newPage();
  await phone.goto(`/play/${joinCode}`);
  await phone.getByLabel("Display name").fill(name);
  await phone.getByRole("button", { name: "Join game" }).click();
  await expect(phone.getByText("You’re in.")).toBeVisible();
  return phone;
}

test("the first correct answer and a run of them are called out", async ({ page, context }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Callout Check");
  const alex = await joinPhone(page, run.joinCode, "Alex");
  const jordan = await joinPhone(page, run.joinCode, "Jordan");

  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  try {
    await tv.goto(`/activity-display?runId=${run.runId}`);

    // Round one: Alex answers correctly first, Jordan gets it wrong.
    await host(page, run.runId, "start");
    await host(page, run.runId, "open");
    await alex.locator(".participant-choice-list button").nth(1).click();
    await expect(alex.getByText("Your answer is locked in.")).toBeVisible();
    await jordan.locator(".participant-choice-list button").nth(0).click();
    await host(page, run.runId, "lock");
    await host(page, run.runId, "reveal");

    const alexResult = alex.locator(".participant-result");
    await expect(alexResult).toBeVisible({ timeout: 15_000 });
    await expect(alexResult.getByText("First in!")).toBeVisible();
    // One correct round is not a streak.
    await expect(alexResult.locator(".participant-callout.streak")).toHaveCount(0);
    // And a wrong answer gets no callouts at all.
    await expect(jordan.locator(".participant-result .participant-callout")).toHaveCount(0);

    // Round two: Alex scores again, which is a run.
    await host(page, run.runId, "next");
    await host(page, run.runId, "open");
    await alex.locator(".participant-choice-list button").nth(1).click();
    await jordan.locator(".participant-choice-list button").nth(0).click();
    await host(page, run.runId, "lock");
    await host(page, run.runId, "reveal");

    await expect(alexResult.locator(".participant-callout.streak")).toHaveText(/2 in a row/, { timeout: 15_000 });
    await expect(jordan.locator(".participant-result .participant-callout.streak")).toHaveCount(0);

    // The room sees the run on the standings too.
    await host(page, run.runId, "showleaderboard");
    const lanes = tv.locator(".activity-score-race .activity-race-lane");
    await expect(lanes.first()).toContainText("Alex", { timeout: 15_000 });
    await expect(lanes.first().locator(".activity-race-streak")).toHaveText("🔥2");
    await expect(lanes.nth(1).locator(".activity-race-streak")).toHaveCount(0);
  } finally {
    await alex.context().close();
    await jordan.context().close();
    await tv.close();
  }
});
