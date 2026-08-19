import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// Players pick a character at join. It is how the room tells them apart on the
// stage, and it is the escape hatch when a shared phone already holds someone
// else's session.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Player Identity");

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

test("a player picks a character and it follows them into the game", async ({ page, context }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Identity Pick");

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  try {
    await phone.goto(`/play/${run.joinCode}`);
    await phone.getByLabel("Display name").fill("Alex");

    const avatars = phone.getByRole("radio", { name: /^Character / });
    await expect(avatars.first()).toBeVisible();
    expect(await avatars.count()).toBeGreaterThan(8);
    const colours = phone.getByRole("radio", { name: /^Colour / });
    expect(await colours.count()).toBeGreaterThan(4);

    // Pick something other than the default so the choice is observable.
    await avatars.nth(4).click();
    await colours.nth(3).click();
    const chosenAvatar = (await avatars.nth(4).innerText()).trim();
    await expect(avatars.nth(4)).toHaveAttribute("aria-checked", "true");

    await phone.getByRole("button", { name: "Join game" }).click();
    await expect(phone.getByText("You’re in.")).toBeVisible();

    // The header badge shows the character they chose, not the default.
    await expect(phone.locator(".participant-identity-badge")).toHaveText(chosenAvatar);
  } finally {
    await phone.close();
  }
});

test("a shared phone can hand over to the next player", async ({ page, context }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Identity Handover");

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  try {
    await phone.goto(`/play/${run.joinCode}`);
    await phone.getByLabel("Display name").fill("Alex");
    await phone.getByRole("button", { name: "Join game" }).click();
    await expect(phone.getByText("You’re in.")).toBeVisible();

    // Reloading used to silently resume as Alex with no way out.
    await phone.reload();
    await expect(phone.getByText("You’re in.")).toBeVisible();
    const handover = phone.getByRole("button", { name: /Not Alex\?/ });
    await expect(handover).toBeVisible();
    await handover.click();

    // Back to a clean join screen for the next player.
    await expect(phone.getByLabel("Display name")).toBeVisible();
    await phone.getByLabel("Display name").fill("Jordan");
    await phone.getByRole("button", { name: "Join game" }).click();
    await expect(phone.getByText("You’re in.")).toBeVisible();
    await expect(phone.getByRole("button", { name: /Not Jordan\?/ })).toBeVisible();
  } finally {
    await phone.close();
  }
});

test("the lobby roster is public but disappears once play starts", async ({ page }) => {
  await authenticate(page);
  const run = await launchTrivia(page, "Roster Scope");

  const joined = await page.evaluate(async code => {
    await fetch(`/api/v1/activity-sessions/join/${code}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantToken: null, displayName: "Bluffer", avatar: "🦊", color: "#4ecdc4" }),
    });
    const session = await fetch(`/api/v1/activity-sessions/join/${code}`).then(r => r.json());
    return session.state.state as { roster?: Array<{ name: string; avatar: string; color: string }> };
  }, run.joinCode);

  expect(joined.roster?.map(entry => entry.name)).toContain("Bluffer");
  expect(joined.roster?.[0].avatar).toBe("🦊");
  expect(joined.roster?.[0].color).toBe("#4ecdc4");

  // Bluffing and creative games hide who wrote what, so a name list must not
  // survive into play for the room to correlate against.
  await page.evaluate(async id => {
    for (const action of ["start", "open"]) {
      await fetch(`/api/v1/activity-runs/${id}/command`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload: null }),
      });
    }
  }, run.runId);

  const playing = await page.evaluate(async code =>
    (await fetch(`/api/v1/activity-sessions/join/${code}`).then(r => r.json())).state.state as { roster?: unknown[] },
    run.joinCode);
  expect(playing.roster).toBeUndefined();
});
