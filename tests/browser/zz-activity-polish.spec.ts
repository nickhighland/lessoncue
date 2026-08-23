import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Activity Polish");

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
    return { definitionId: created.id, runId: run.runId, joinCode: run.state!.joinCode! };
  }, name);
}

test("a player can silence their own phone and it sticks across reloads", async ({ page, context }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Mute Check");

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  try {
    await phone.goto(`/play/${run.joinCode}`);
    // Reachable before joining, since the join tap itself makes a sound.
    const mute = phone.locator(".participant-mute-button").first();
    await expect(mute).toBeVisible();
    await expect(mute).toHaveAttribute("aria-pressed", "false");

    await mute.click();
    await expect(mute).toHaveAttribute("aria-pressed", "true");

    await phone.reload();
    await expect(phone.locator(".participant-mute-button").first()).toHaveAttribute("aria-pressed", "true");

    // And it survives into the game itself.
    await phone.getByLabel("Display name").fill("Quiet");
    await phone.getByRole("button", { name: "Join game" }).click();
    await expect(phone.getByText("You’re in.")).toBeVisible();
    await expect(phone.locator(".participant-mute-button").first()).toHaveAttribute("aria-pressed", "true");
  } finally {
    await phone.close();
  }
});

test("the phone shows the game title once, not twice", async ({ page, context }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Title Once");

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  try {
    await phone.goto(`/play/${run.joinCode}`);
    await phone.getByLabel("Display name").fill("Reader");
    await phone.getByRole("button", { name: "Join game" }).click();
    await expect(phone.getByText("You’re in.")).toBeVisible();

    // The activity name and its title are the same string here, so the small
    // label above the heading was printing it a second time.
    const header = phone.locator(".participant-game-header");
    await expect(header.locator("h1")).toHaveText("Title Once");
    await expect(header.locator(".participant-kicker")).toHaveCount(0);

    const occurrences = (await header.innerText()).match(/Title Once/g) ?? [];
    expect(occurrences).toHaveLength(1);
  } finally {
    await phone.close();
  }
});

test("game headings use a display face rather than the admin serif", async ({ page, context }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Type Check");

  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  try {
    await tv.goto(`/activity-display?runId=${run.runId}`);
    await expect(tv.locator('.activity-display-root[data-activity-status="ready"]')).toBeVisible({ timeout: 20_000 });

    const title = await tv.locator(".activity-title").first().evaluate(node => {
      const style = getComputedStyle(node);
      return { family: style.fontFamily, weight: style.fontWeight, tracking: style.letterSpacing };
    });
    expect(title.family.toLowerCase()).not.toContain("georgia");
    expect(Number(title.weight)).toBeGreaterThanOrEqual(800);
    // Tight tracking is what makes a heavy sans read as a title.
    expect(Number.parseFloat(title.tracking)).toBeLessThan(0);
  } finally {
    await tv.close();
  }
});

test("a teacher can pre-arm auto-advance when authoring", async ({ page }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Auto Arm Check");

  await page.getByRole("button", { name: /Activities$/ }).click();
  await expect(page.getByRole("heading", { name: "Activities Studio" })).toBeVisible();
  await page.getByText("Auto Arm Check", { exact: true }).first().click();

  const toggle = page.getByRole("checkbox", { name: /Close the response window as soon as every player has answered/ });
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await toggle.check();

  const saved = page.waitForResponse(response =>
    response.request().method() === "PUT" && response.url().includes("/api/v1/activities/") && response.ok());
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Save activity" }).click();
  await saved;

  // The saved definition pre-arms the run rather than needing the host console.
  const config = await page.evaluate(async id =>
    (await fetch(`/api/v1/activities/${id}`).then(r => r.json())).config as { autoAdvance?: boolean },
    run.definitionId);
  expect(config.autoAdvance).toBe(true);
});
