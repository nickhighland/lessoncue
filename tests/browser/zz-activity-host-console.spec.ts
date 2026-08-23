import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";
import { openUniversalRemote } from "./support/controllerSession";

// During a live round the host console showed no join code, no roster, and no
// answer count, so the only way to know whether to close the window was to ask
// the room out loud.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Host Console");

let pairedScreen: { screenId: string; deviceToken: string } | null = null;

async function prepareHostedTrivia(page: Page, name: string, engine?: { type: string; config: Record<string, unknown> }, ownLesson = false) {
  const prepared = await page.evaluate(async input => {
    const activityName = input.activityName;
    const headers = { "Content-Type": "application/json" };
    const created = await fetch("/api/v1/activities", {
      method: "POST", headers,
      body: JSON.stringify({
        name: activityName, type: input.engine?.type ?? "trivia", config: input.engine?.config ?? {
          title: activityName,
          questions: [{ id: "q1", prompt: "Red planet?", options: ["Venus", "Mars"], correctIndex: 1 }],
        },
      }),
    }).then(r => r.json()) as { id: string };

    const lessons = await fetch("/api/v1/lessons").then(r => r.json()) as Array<{ id: string; classId: string; title: string; items: Array<{ position: number }> }>;
    const shared = lessons.find(l => l.title === "Sample Lesson") || lessons[0];
    // Players and scores follow a lesson across its games by design, so a test
    // that needs an empty room has to bring its own lesson rather than reuse
    // the shared one every other test has already filled.
    const lesson = input.ownLesson
      ? { ...await fetch("/api/v1/lessons", {
            method: "POST", headers,
            body: JSON.stringify({ classId: shared.classId, title: `${activityName} Lesson`, description: null }),
          }).then(r => r.json()) as { id: string; classId: string }, items: [] as Array<{ position: number }> }
      : shared;
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

    // Pairing is capped at ten a minute per IP and every spec shares that
    // budget. One screen is enough here: each test reassigns it and posts its
    // own status, so pair once and reuse it.
    const identity = input.paired ?? await (async () => {
      const bootstrap = await fetch("/api/v1/admin/bootstrap").then(r => r.json()) as { pairingPin: string };
      const pairing = await fetch("/api/v1/pairing/request", {
        method: "POST", headers,
        body: JSON.stringify({ deviceName: `TV ${activityName}`, platform: "android-tv", appVersion: "0.40.56" }),
      }).then(r => r.json()) as { requestId: string };
      return await fetch("/api/v1/pairing/confirm", {
        method: "POST", headers,
        body: JSON.stringify({ requestId: pairing.requestId, pin: bootstrap.pairingPin }),
      }).then(r => r.json()) as { screenId: string; deviceToken: string };
    })();
    await fetch(`/api/v1/screens/${identity.screenId}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ assignedClassId: lesson.classId, allowUnsupportedContent: true }),
    });
    await fetch("/api/v1/tv/status", {
      method: "POST", headers: { ...headers, Authorization: `Bearer ${identity.deviceToken}` },
      body: JSON.stringify({
        screenId: identity.screenId, appVersion: "0.40.56", online: true, freeBytes: 4e9,
        manifestVersion: 1, failedDownloads: 0, playbackState: "playing",
        lessonId: lesson.id, itemId: item.id, positionMs: 0, durationMs: 60_000,
      }),
    });

    const run = await fetch("/api/v1/activity-runs", {
      method: "POST", headers,
      body: JSON.stringify({ activityDefinitionId: created.id, lessonId: lesson.id, lessonItemId: item.id }),
    }).then(r => r.json()) as { runId: string; state?: { joinCode?: string } };

    return {
      screenId: identity.screenId,
      deviceToken: identity.deviceToken,
      lessonId: lesson.id,
      itemId: item.id,
      runId: run.runId,
      joinCode: run.state!.joinCode!,
    };
  }, { activityName: name, engine: engine ?? null, ownLesson, paired: pairedScreen });
  pairedScreen ??= { screenId: prepared.screenId, deviceToken: prepared.deviceToken };
  return prepared;
}

test("the remote tabs are named for what they do", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Host Tabs");
  await openUniversalRemote(page, prepared.screenId);

  // Placeholder labels shipped as "Tab 1/2/3".
  await expect(page.getByRole("tab", { name: /Tab \d/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Lesson/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Playlist/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Quick tools/ })).toHaveCount(0);
  await expect(page.locator(".remote-header")).toHaveCount(0);
  await expect(page.locator(".remote-transport button")).toHaveCount(4);
  await expect(page.getByText("Save this controller as an app", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: /Playlist/ }).click();
  await expect(page.locator(".remote-run-summary")).toContainText("REMAINING");
  await expect(page.locator(".remote-run-summary")).toContainText("EST. FINISH");
});

test("the compact remote keeps playback failures visible instead of saying Ready", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Host Playback Error");
  const status = await page.evaluate(async input => {
    const response = await fetch("/api/v1/tv/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.deviceToken}`,
      },
      body: JSON.stringify({
        screenId: input.screenId,
        appVersion: "0.40.56",
        online: true,
        freeBytes: 4e9,
        manifestVersion: 1,
        failedDownloads: 0,
        playbackState: "error",
        lessonId: input.lessonId,
        itemId: input.itemId,
        positionMs: 0,
        durationMs: 60_000,
        playbackError: "Decoder stopped while opening the activity.",
      }),
    });
    return response.status;
  }, prepared);
  expect(status).toBe(202);

  await openUniversalRemote(page, prepared.screenId);
  await expect(page.getByRole("alert")).toContainText("Decoder stopped while opening the activity.");
  await page.getByRole("tab", { name: /Playlist/ }).click();
  await expect(page.locator(".remote-run-summary")).toContainText("REMAINING");
});

test("the live console shows the join code, roster, and answers-in count", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Host Live Panel");
  await openUniversalRemote(page, prepared.screenId);
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

test("when autonomy gives up, the console says so instead of looking frozen", async ({ page }) => {
  await authenticate(page);
  // Match Minds needs somebody chosen as the target. With an empty room even
  // autonomy cannot choose one, so the action is refused and the run parks --
  // and a parked game is indistinguishable from a broken one unless it says why.
  const prepared = await prepareHostedTrivia(page, "Parked Game", {
    type: "matchPlayer",
    config: { title: "Parked Game", rounds: [{ id: "r1", prompt: "Pick one", options: ["A", "B"], answerMode: "choice" }] },
  }, true);
  await page.evaluate(async id => {
    await fetch(`/api/v1/activity-runs/${id}/command`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", payload: null }),
    });
  }, prepared.runId);

  await openUniversalRemote(page, prepared.screenId);
  await page.getByRole("tab", { name: /Activity/ }).click();

  const panel = page.locator(".activity-live-host");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel).toContainText("Needs you", { timeout: 30_000 });
  await expect(panel).toContainText(/target participant/i);
  // And no clock ticking towards a moment that will never come.
  await expect(panel.locator(".activity-live-host-countdown")).toHaveCount(0);
});

test("a full class fits: everyone is listed, findable, and removable mid-game", async ({ page }) => {
  test.setTimeout(120_000);
  await authenticate(page);
  // A host runs the console from a phone in their hand, which is where an
  // unbounded roster does its damage.
  await page.setViewportSize({ width: 390, height: 844 });
  const prepared = await prepareHostedTrivia(page, "Full Class", undefined, true);

  // A class, not a demo. Thirty phones is an ordinary lesson.
  const names = await page.evaluate(async code => {
    const joined: string[] = [];
    for (let index = 0; index < 30; index += 1) {
      const displayName = `Player ${String(index + 1).padStart(2, "0")}`;
      await fetch(`/api/v1/activity-sessions/join/${code}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantToken: null, displayName, avatar: "🦊", color: "#4ecdc4" }),
      });
      joined.push(displayName);
    }
    return joined;
  }, prepared.joinCode);

  await openUniversalRemote(page, prepared.screenId);
  await page.getByRole("tab", { name: /Activity/ }).click();
  const panel = page.locator(".activity-live-host");
  await expect(panel).toBeVisible({ timeout: 20_000 });

  // Every one of them, not a truncated first page.
  await expect(panel.locator(".activity-live-host-roster li")).toHaveCount(names.length, { timeout: 20_000 });

  // The roster scrolls within itself rather than growing without limit, so the
  // controls stay where the host left them however full the room is.
  const roster = panel.locator(".activity-live-host-roster");
  const capped = await roster.evaluate(node => ({
    scrolls: node.scrollHeight > node.clientHeight + 1,
    height: node.getBoundingClientRect().height,
    viewport: window.innerHeight,
  }));
  expect(capped.scrolls, "a thirty-player roster should scroll inside itself").toBe(true);
  expect(capped.height, "the roster must not take the whole screen").toBeLessThan(capped.viewport * 0.5);

  // And one person can be found among thirty.
  await panel.getByLabel("Find a player in the roster").fill("Player 17");
  await expect(panel.locator(".activity-live-host-roster li")).toHaveCount(1);

  page.once("dialog", dialog => void dialog.accept());
  await panel.getByRole("button", { name: "Remove Player 17 from the game" }).click();
  await panel.getByLabel("Find a player in the roster").fill("");
  await expect(panel.locator(".activity-live-host-roster li")).toHaveCount(names.length - 1, { timeout: 20_000 });
});
