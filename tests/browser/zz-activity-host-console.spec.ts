import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// During a live round the host console showed no join code, no roster, and no
// answer count, so the only way to know whether to close the window was to ask
// the room out loud.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Host Console");

async function prepareHostedTrivia(page: Page, name: string) {
  return page.evaluate(async activityName => {
    const headers = { "Content-Type": "application/json" };
    const created = await fetch("/api/v1/activities", {
      method: "POST", headers,
      body: JSON.stringify({
        name: activityName, type: "trivia", config: {
          title: activityName,
          questions: [{ id: "q1", prompt: "Red planet?", options: ["Venus", "Mars"], correctIndex: 1 }],
        },
      }),
    }).then(r => r.json()) as { id: string };

    const lessons = await fetch("/api/v1/lessons").then(r => r.json()) as Array<{ id: string; classId: string; title: string; items: Array<{ position: number }> }>;
    const lesson = lessons.find(l => l.title === "Sample Lesson") || lessons[0];
    const position = Math.max(0, ...lesson.items.map(i => i.position)) + 1000;
    const item = await fetch(`/api/v1/lessons/${lesson.id}/items`, {
      method: "POST", headers,
      body: JSON.stringify({
        title: activityName, type: "activity", role: "lesson", position, mediaId: null,
        activityDefinitionId: created.id, durationMs: null, startMs: 0, endMs: null,
        volumePercent: 100, imageDurationSeconds: null, estimatedDurationSeconds: 60,
        endBehavior: "pause", allowSkip: true,
      }),
    }).then(r => r.json()) as { id: string };

    const bootstrap = await fetch("/api/v1/admin/bootstrap").then(r => r.json()) as { pairingPin: string };
    const pairing = await fetch("/api/v1/pairing/request", {
      method: "POST", headers,
      body: JSON.stringify({ deviceName: `TV ${activityName}`, platform: "android-tv", appVersion: "0.40.48" }),
    }).then(r => r.json()) as { requestId: string };
    const identity = await fetch("/api/v1/pairing/confirm", {
      method: "POST", headers,
      body: JSON.stringify({ requestId: pairing.requestId, pin: bootstrap.pairingPin }),
    }).then(r => r.json()) as { screenId: string; deviceToken: string };
    await fetch(`/api/v1/screens/${identity.screenId}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ assignedClassId: lesson.classId, allowUnsupportedContent: true }),
    });
    await fetch("/api/v1/tv/status", {
      method: "POST", headers: { ...headers, Authorization: `Bearer ${identity.deviceToken}` },
      body: JSON.stringify({
        screenId: identity.screenId, appVersion: "0.40.48", online: true, freeBytes: 4e9,
        manifestVersion: 1, failedDownloads: 0, playbackState: "playing",
        lessonId: lesson.id, itemId: item.id, positionMs: 0, durationMs: 60_000,
      }),
    });

    const run = await fetch("/api/v1/activity-runs", {
      method: "POST", headers,
      body: JSON.stringify({ activityDefinitionId: created.id, lessonId: lesson.id, lessonItemId: item.id }),
    }).then(r => r.json()) as { runId: string; state?: { joinCode?: string } };

    return { screenId: identity.screenId, runId: run.runId, joinCode: run.state!.joinCode! };
  }, name);
}

async function openRemote(page: Page, screenId: string) {
  await page.evaluate(async () => {
    await fetch("/api/v1/controller-pin", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "482731" }),
    });
  });
  await page.goto("/universalremote");
  await page.getByLabel("Six-digit controller PIN").fill("482731");
  await page.getByRole("button", { name: "Open universal remote" }).click();
  await page.getByLabel("Control this screen").selectOption(screenId);
}

test("the remote tabs are named for what they do", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Host Tabs");
  await openRemote(page, prepared.screenId);

  // Placeholder labels shipped as "Tab 1/2/3".
  await expect(page.getByRole("tab", { name: /Tab \d/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Playback/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
});

test("the live console shows the join code, roster, and answers-in count", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Host Live Panel");
  await openRemote(page, prepared.screenId);
  await page.getByRole("tab", { name: /Activity/ }).click();

  const panel = page.locator(".activity-live-host");
  await expect(panel).toBeVisible({ timeout: 20_000 });

  // The code and a scannable QR, without opening setup.
  await expect(panel).toContainText(prepared.joinCode);
  await expect(panel.locator("img.activity-qr")).toBeVisible();
  await expect(panel.getByText("No phones have joined yet.")).toBeVisible();

  const join = async (name: string, avatar: string) => page.evaluate(async input => {
    await fetch(`/api/v1/activity-sessions/join/${input.code}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantToken: null, displayName: input.name, avatar: input.avatar, color: "#4ecdc4" }),
    });
  }, { code: prepared.joinCode, name, avatar });

  await join("Alex", "🦊");
  await join("Jordan", "🐙");
  await expect(panel.locator(".activity-live-host-roster li")).toHaveCount(2, { timeout: 20_000 });
  await expect(panel).toContainText("Alex");

  // Open the window: the host can now see how many are still out.
  const host = (action: string) => page.evaluate(async input => {
    await fetch(`/api/v1/activity-runs/${input.id}/command`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: input.action, payload: null }),
    });
  }, { id: prepared.runId, action });

  await host("start");
  await host("open");
  await expect(panel.getByText("0 of 2")).toBeVisible({ timeout: 20_000 });

  const token = await page.evaluate(async input => {
    const result = await fetch(`/api/v1/activity-sessions/join/${input.code}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantToken: null, displayName: "Sam", avatar: "🚀", color: "#60a5fa" }),
    }).then(r => r.json()) as { token: string; participant: { state: { runId: string } } };
    await fetch(`/api/v1/activity-sessions/${result.participant.state.runId}/participant-action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantToken: result.token, action: "answer", payload: { optionIndex: 1 } }),
    });
    return result.token;
  }, { code: prepared.joinCode });
  expect(token).toBeTruthy();

  await expect(panel.getByText("1 of 3")).toBeVisible({ timeout: 20_000 });
  await expect(panel.locator(".activity-live-host-roster li.answered")).toHaveCount(1);

  // And a standings control, which Trivia previously had no button for.
  await expect(panel.getByRole("button", { name: /Show standings/ })).toBeEnabled();
});
