import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// At reveal the phone used to go passive. It now reports how that player did,
// and only ever their own standing.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Player Result");

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

test("a correct answer is celebrated on the phone with points and rank", async ({ page }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Result Correct");
  const phone = await joinPhone(page, run.joinCode, "Alex");

  try {
    await host(page, run.runId, "start");
    await host(page, run.runId, "open");
    await phone.locator(".participant-choice-list button").nth(1).click();
    await expect(phone.getByText("Your answer is locked in.")).toBeVisible();

    await host(page, run.runId, "lock");
    await host(page, run.runId, "reveal");

    const result = phone.locator(".participant-result");
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(result).toHaveClass(/participant-result-correct/);
    await expect(result.getByText("Correct!")).toBeVisible();
    await expect(result.locator(".participant-result-points")).toContainText("+");

    // Standing is shown, and the count-up settles on the real total.
    await expect.poll(async () => (await result.locator(".participant-result-standing dd").nth(1).innerText()).trim())
      .toBe("100");
    await expect(result.locator(".participant-result-standing dd").first()).toContainText("1");
  } finally {
    await phone.context().close();
  }
});

test("a wrong answer says so without pretending it scored", async ({ page }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Result Wrong");
  const phone = await joinPhone(page, run.joinCode, "Jordan");

  try {
    await host(page, run.runId, "start");
    await host(page, run.runId, "open");
    await phone.locator(".participant-choice-list button").nth(0).click();
    await host(page, run.runId, "lock");
    await host(page, run.runId, "reveal");

    const result = phone.locator(".participant-result");
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(result).toHaveClass(/participant-result-incorrect/);
    await expect(result.getByText("Not this time")).toBeVisible();
    // No points block at all rather than a misleading "+0".
    await expect(result.locator(".participant-result-points")).toHaveCount(0);
  } finally {
    await phone.context().close();
  }
});

test("a player's own result never carries another player's score", async ({ page }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Result Privacy");
  const alex = await joinPhone(page, run.joinCode, "Alex");
  const jordan = await joinPhone(page, run.joinCode, "Jordan");

  try {
    await host(page, run.runId, "start");
    await host(page, run.runId, "open");
    await alex.locator(".participant-choice-list button").nth(1).click();
    await jordan.locator(".participant-choice-list button").nth(0).click();
    await host(page, run.runId, "lock");
    await host(page, run.runId, "reveal");

    await expect(alex.locator(".participant-result")).toHaveClass(/participant-result-correct/, { timeout: 15_000 });
    await expect(jordan.locator(".participant-result")).toHaveClass(/participant-result-incorrect/);

    // Each phone knows its own rank out of two, and nothing about the other's
    // score beyond that number.
    const jordanState = await jordan.evaluate(() => {
      const shell = document.querySelector("main.activity-participant-page");
      return shell ? shell.textContent || "" : "";
    });
    expect(jordanState).not.toContain("Alex");
    await expect(jordan.locator(".participant-result-standing dd").first()).toContainText("2");
  } finally {
    await alex.context().close();
    await jordan.context().close();
  }
});
