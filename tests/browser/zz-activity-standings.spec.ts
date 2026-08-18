import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// A scored quiz gave the room no sense of who was ahead: the leaderboard
// primitive existed but the flagship engine never rendered it.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Standings");

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
  if (!response.ok) throw new Error(`${command}: ${response.status} ${await response.text()}`);
}, { id: runId, command: action });

async function joinPhone(page: Page, joinCode: string, name: string, avatar: string) {
  const context = await page.context().browser()!.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await context.newPage();
  await phone.goto(`/play/${joinCode}`);
  await phone.getByLabel("Display name").fill(name);
  await phone.getByRole("radio", { name: `Character ${avatar}` }).click();
  await phone.getByRole("button", { name: "Join game" }).click();
  await expect(phone.getByText("You’re in.")).toBeVisible();
  return phone;
}

test("the host can show standings between rounds and the room sees the order", async ({ page, context }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Standings Between Rounds");
  const alex = await joinPhone(page, run.joinCode, "Alex", "🦊");
  const jordan = await joinPhone(page, run.joinCode, "Jordan", "🐙");

  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  try {
    await tv.goto(`/activity-display?runId=${run.runId}`);
    await expect(tv.locator('.activity-display-root[data-activity-status="ready"]')).toBeVisible({ timeout: 20_000 });

    await host(page, run.runId, "start");
    await host(page, run.runId, "open");
    await alex.locator(".participant-choice-list button").nth(1).click();
    await jordan.locator(".participant-choice-list button").nth(0).click();
    await host(page, run.runId, "lock");
    await host(page, run.runId, "reveal");

    // Standings are a host decision, not automatic.
    await expect(tv.locator(".activity-score-race")).toHaveCount(0);
    await host(page, run.runId, "showleaderboard");

    const race = tv.locator(".activity-score-race");
    await expect(race).toBeVisible({ timeout: 15_000 });
    const lanes = race.locator(".activity-race-lane");
    await expect(lanes).toHaveCount(2);
    // Leader first, and each player runs as the character they picked.
    await expect(lanes.first()).toContainText("Alex");
    await expect(lanes.first()).toHaveClass(/leading/);
    await expect(lanes.first().locator(".activity-race-avatar")).toHaveText("🦊");
    await expect(lanes.nth(1)).toContainText("Jordan");

    // Position encodes the score: the leader is at the finish, a zero score is
    // still on the start line, and the token stays inside its own lane at both
    // ends rather than overhanging the rank and name columns.
    const geometry = await lanes.evaluateAll(nodes => nodes.map(lane => {
      const track = lane.querySelector(".activity-race-track")!.getBoundingClientRect();
      const runner = lane.querySelector(".activity-race-runner")!.getBoundingClientRect();
      return { trackLeft: track.left, trackRight: track.right, runnerLeft: runner.left, runnerRight: runner.right };
    }));
    expect(geometry[0].runnerRight).toBeLessThanOrEqual(geometry[0].trackRight + 1);
    expect(geometry[0].runnerLeft).toBeGreaterThan(geometry[0].trackLeft + 50);
    expect(geometry[1].runnerLeft).toBeGreaterThanOrEqual(geometry[1].trackLeft - 1);
  } finally {
    await alex.context().close();
    await jordan.context().close();
    await tv.close();
  }
});
