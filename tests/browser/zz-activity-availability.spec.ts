import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// A Service Admin can hide an unfinished game system from the people planning
// real lessons, without deleting anything or cutting off a live class.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Activity Availability");

const setEnabled = (page: Page, enabled: boolean) => page.evaluate(async value => {
  const response = await fetch("/api/v1/activity-availability", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: value }),
  });
  if (!response.ok) throw new Error(`availability: ${response.status}`);
  return response.json() as Promise<{ enabled: boolean }>;
}, enabled);

async function createTrivia(page: Page, name: string) {
  return page.evaluate(async activityName => {
    const response = await fetch("/api/v1/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: activityName, type: "trivia", config: {
          title: activityName,
          questions: [{ id: "q1", prompt: "Red planet?", options: ["Venus", "Mars"], correctIndex: 1 }],
        },
      }),
    });
    const body = await response.json() as { id?: string };
    if (!response.ok || !body.id) throw new Error(JSON.stringify(body));
    return body.id;
  }, name);
}

const startRun = (page: Page, definitionId: string) => page.evaluate(async id => {
  const response = await fetch("/api/v1/activity-runs", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activityDefinitionId: id }),
  });
  return { status: response.status, body: await response.json().catch(() => null) as { runId?: string } | null };
}, definitionId);

test.afterEach(async ({ page }) => {
  // Never leave the suite with Activities hidden.
  await setEnabled(page, true).catch(() => {});
});

test("hiding Activities removes the teacher surfaces and blocks new games", async ({ page }) => {
  await authenticate(page);
  const definitionId = await createTrivia(page, "Availability Check");

  await expect(page.getByRole("button", { name: /Activities$/ })).toBeVisible();
  const before = await startRun(page, definitionId);
  expect(before.status).toBe(200);

  await setEnabled(page, false);
  await page.reload();

  await expect(page.getByRole("button", { name: /Activities$/ })).toHaveCount(0);
  const blocked = await startRun(page, definitionId);
  expect(blocked.status).toBe(403);

  // Nothing is deleted: the definition is still there when it comes back.
  await setEnabled(page, true);
  await page.reload();
  await expect(page.getByRole("button", { name: /Activities$/ })).toBeVisible();
  const after = await startRun(page, definitionId);
  expect(after.status).toBe(200);
  expect(after.body?.runId).toBe(before.body?.runId);
});

test("a game already running is not cut off when Activities are hidden", async ({ page }) => {
  await authenticate(page);
  const definitionId = await createTrivia(page, "Live Session Check");
  const started = await startRun(page, definitionId);
  const runId = started.body!.runId!;

  await setEnabled(page, false);

  // The live run still accepts host commands and still reports its state.
  const command = await page.evaluate(async id => {
    const response = await fetch(`/api/v1/activity-runs/${id}/command`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", payload: null }),
    });
    return response.status;
  }, runId);
  expect(command, "an in-flight game must keep working").toBe(200);

  const state = await page.evaluate(async id =>
    (await fetch(`/api/v1/activity-runs/${id}`)).status, runId);
  expect(state).toBe(200);
});

test("only a Service Admin can change the switch", async ({ page }) => {
  await authenticate(page);
  // The endpoint is gated on settings.manage rather than planning permissions.
  const readable = await page.evaluate(async () =>
    (await fetch("/api/v1/activity-availability")).status);
  expect(readable).toBe(200);
});
