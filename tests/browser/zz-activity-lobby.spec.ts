import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// The lobby is the only screen whose job is getting phones into the game, so
// the code and QR dominate it and players appear as they arrive.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Game Lobby");

async function launchTrivia(page: Page, name: string) {
  return page.evaluate(async activityName => {
    const created = await fetch("/api/v1/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: activityName, type: "trivia", config: {
          title: activityName,
          questions: [{ id: "q1", prompt: "Red planet?", options: ["Venus", "Mars"], correctIndex: 1 }],
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

const join = (page: Page, code: string, name: string, avatar: string, color: string) =>
  page.evaluate(async input => {
    await fetch(`/api/v1/activity-sessions/join/${input.code}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantToken: null, displayName: input.name, avatar: input.avatar, color: input.color }),
    });
  }, { code, name, avatar, color });

test("the lobby leads with the code and QR, then shows players as they arrive", async ({ page, context }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Lobby Arrivals");

  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  try {
    await tv.goto(`/activity-display?runId=${run.runId}`);
    await expect(tv.locator('.activity-display-root[data-activity-status="ready"]')).toBeVisible({ timeout: 20_000 });

    const lobby = tv.locator(".activity-lobby-stage");
    await expect(lobby).toBeVisible();
    await expect(lobby.getByText("Waiting for the first player…")).toBeVisible();

    // The code is the biggest thing on screen after the title.
    const code = lobby.locator(".activity-join-code");
    await expect(code).toHaveText(run.joinCode);
    const codeSize = await code.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize));
    expect(codeSize, "join code should dominate the lobby").toBeGreaterThan(40);
    await expect(lobby.locator(".activity-join-prominent-qr img.activity-qr")).toBeVisible();

    await join(page, run.joinCode, "Alex", "🦊", "#4ecdc4");
    const roster = lobby.locator(".activity-lobby-roster li");
    await expect(roster).toHaveCount(1, { timeout: 15_000 });
    await expect(roster.first()).toContainText("Alex");
    await expect(roster.first().locator(".activity-lobby-avatar")).toHaveText("🦊");

    await join(page, run.joinCode, "Jordan", "🐙", "#f472b6");
    await expect(roster).toHaveCount(2, { timeout: 15_000 });
    await expect(lobby.getByText("2 players in")).toBeVisible();
  } finally {
    await tv.close();
  }
});

test("starting the game replaces the lobby with play", async ({ page, context }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Lobby Handoff");
  await join(page, run.joinCode, "Alex", "🦊", "#4ecdc4");

  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  try {
    await tv.goto(`/activity-display?runId=${run.runId}`);
    await expect(tv.locator(".activity-lobby-stage")).toBeVisible({ timeout: 20_000 });

    await page.evaluate(async id => {
      await fetch(`/api/v1/activity-runs/${id}/command`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", payload: null }),
      });
    }, run.runId);

    // Waits on a live SignalR push rather than a poll, so it needs headroom
    // when the whole suite is competing for the same server.
    await expect(tv.locator(".activity-lobby-stage")).toHaveCount(0, { timeout: 40_000 });
    // Play keeps a compact join banner so latecomers can still get in.
    await expect(tv.locator(".interactive-join-banner")).toBeVisible();
    await expect(tv.getByText("Red planet?")).toBeVisible();
  } finally {
    await tv.close();
  }
});

test("a full class all appear on the lobby wall, not just the first two dozen", async ({ page, context }) => {
  test.setTimeout(120_000);
  await authenticate(page);
  const run = await launchTrivia(page, "Packed Lobby");

  await page.evaluate(async code => {
    for (let index = 0; index < 34; index += 1) {
      await fetch(`/api/v1/activity-sessions/join/${code}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantToken: null, displayName: `Player ${index + 1}`, avatar: "🐙", color: "#f6c531" }),
      });
    }
  }, run.joinCode);

  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  try {
    await tv.goto(`/activity-display?runId=${run.runId}`);
    const roster = tv.locator(".activity-lobby-roster");
    await expect(roster).toBeVisible({ timeout: 20_000 });
    await expect(roster.locator("li")).toHaveCount(34, { timeout: 20_000 });

    // Clipped names read as "I did not join", which is the complaint this
    // whole roster exists to answer -- so the last to arrive must be visible.
    const last = roster.locator("li").last();
    await expect(last).toBeInViewport();
    const clipped = await roster.evaluate(node => node.scrollHeight > node.clientHeight + 1);
    expect(clipped, "the lobby roster must not hide players").toBe(false);
  } finally {
    await tv.close();
  }
});
