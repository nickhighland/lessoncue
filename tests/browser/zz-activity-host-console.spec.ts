import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";
import { openUniversalRemote } from "./support/controllerSession";

// During a live round the host console showed no join code, no roster, and no
// answer count, so the only way to know whether to close the window was to ask
// the room out loud.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Host Console");

test("an older host snapshot cannot restore an obsolete player roster", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Host snapshot ordering", undefined, true);
  let staleResponses = 0;
  let replayOld = false;
  let oldBody: string | undefined;
  await page.route(`**/activity-sessions/${prepared.runId}/host-state`, async route => {
    if (replayOld && oldBody) {
      await route.fulfill({ status: 200, contentType: "application/json", body: oldBody });
      staleResponses++;
      return;
    }
    const response = await route.fetch();
    oldBody ??= await response.text();
    await route.fulfill({ response });
  });
  await openUniversalRemote(page, prepared.screenId);
  const panel = page.getByRole("region", { name: "Live game controls" });
  await expect(panel).toContainText("No phones have joined yet.");
  const joined = await page.request.post(`/api/v1/activity-sessions/join/${prepared.joinCode}`, {
    data: { participantToken: null, displayName: "Carmen", avatar: "🦊", color: "#4ecdc4" },
  });
  expect(joined.ok()).toBeTruthy();
  await expect(panel).toContainText("Carmen");
  replayOld = true;
  await expect.poll(() => staleResponses).toBeGreaterThanOrEqual(2);
  await expect(panel).toContainText("Carmen");
});

let pairedScreen: { screenId: string; deviceToken: string } | null = null;

test("the host counts votes separately from drawings already submitted", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Host voting count", { type: 'drawing', config: {
    title: 'Host voting count', autoPilot: false, requireModeration: false,
    prompts: [{ id: 'p1', prompt: 'Draw a penguin', points: 100 }],
  } }, true);
  const tokens: string[] = [];
  for (const name of ['Carmen', 'Letty']) {
    const response = await page.request.post(`/api/v1/activity-sessions/join/${prepared.joinCode}`, { data: { displayName: name } });
    expect(response.ok()).toBeTruthy();
    tokens.push((await response.json()).token);
  }
  const host = async (action: string) => {
    expect((await page.request.post(`/api/v1/activity-runs/${prepared.runId}/command`, { data: { action } })).ok()).toBeTruthy();
  };
  await host('start');
  await host('open');
  for (const token of tokens) {
    expect((await page.request.post(`/api/v1/activity-sessions/${prepared.runId}/participant-action`, {
      data: { participantToken: token, action: 'submit', payload: { strokes: [{ color: '#f8fafc', width: .012, points: [[.5, .5]] }] } },
    })).ok()).toBeTruthy();
  }
  await openUniversalRemote(page, prepared.screenId);
  const panel = page.getByRole('region', { name: 'Live game controls' });
  await expect(panel).toContainText('2 of 2');
  await host('openvoting');
  await expect(panel).toContainText('0 of 2');
  const snapshot = await (await page.request.get(`/api/v1/activity-sessions/${prepared.runId}/host-state`)).json();
  const target = snapshot.submissions.find((entry: { participantName: string }) => entry.participantName === 'Letty');
  expect((await page.request.post(`/api/v1/activity-sessions/${prepared.runId}/participant-action`, {
    data: { participantToken: tokens[0], action: 'vote', payload: { targetId: target.id } },
  })).ok()).toBeTruthy();
  await expect(panel).toContainText('1 of 2');
});

test("a failed host command is explained without an unhandled browser exception", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Host command failure", undefined, true);
  await openUniversalRemote(page, prepared.screenId);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`**/activity-runs/${prepared.runId}/command`, route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Game server temporarily unavailable.' }),
  }));
  await page.getByRole('button', { name: 'Start the game', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Game server temporarily unavailable.');
  await expect(page.getByRole('button', { name: 'Start the game', exact: true })).toBeEnabled();
  await page.waitForTimeout(100); // Allow the rejected event-handler promise to settle.
  expect(errors).toEqual([]);
});

test("a stalled fallback snapshot does not accumulate requests while live connection is pending", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Fallback stalled polling", undefined, true);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/hubs/activities/negotiate?**', async route => {
    await held;
    await route.abort();
  });
  let requests = 0;
  try {
    await openUniversalRemote(page, prepared.screenId);
    await expect(page.getByRole("region", { name: "Live game controls" })).toContainText(prepared.joinCode);
    await page.route(`**/api/v1/activity-runs/${prepared.runId}`, async route => {
      requests++;
      await held;
      await route.abort();
    });
    await expect.poll(() => requests).toBeGreaterThan(0);
    await page.waitForTimeout(4500);
    expect(requests).toBe(1);
  } finally { release(); }
});

test("a stalled host refresh does not accumulate polling requests", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Host stalled polling", undefined, true);
  await openUniversalRemote(page, prepared.screenId);
  await expect(page.getByRole("region", { name: "Live game controls" })).toContainText(prepared.joinCode);
  let requests = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/activity-sessions/${prepared.runId}/host-state`, async route => {
    requests++;
    await held;
    await route.abort();
  });
  try {
    await expect.poll(() => requests).toBeGreaterThan(0);
    await page.waitForTimeout(4500); // More than two polling intervals with no response.
    expect(requests).toBe(1);
  } finally { release(); }
});

test("switching the live cue ignores delayed host responses from the previous game", async ({ page }) => {
  await authenticate(page);
  const first = await prepareHostedTrivia(page, "Previous host game", undefined, true);
  const second = await prepareHostedTrivia(page, "Next host game", undefined, true);
  const report = async (input: typeof first) => {
    const response = await page.request.post('/api/v1/tv/status', {
      headers: { Authorization: `Bearer ${input.deviceToken}` },
        data: { screenId: input.screenId, appVersion: '0.46.6', online: true, freeBytes: 4e9,
        manifestVersion: 1, failedDownloads: 0, playbackState: 'playing',
        lessonId: input.lessonId, itemId: input.itemId, positionMs: 0, durationMs: 60000 },
    });
    expect(response.status()).toBe(202);
  };
  await report(first);
  await openUniversalRemote(page, first.screenId);
  const panel = page.getByRole("region", { name: "Live game controls" });
  await expect(panel).toContainText(first.joinCode);
  let heldResponses = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/activity-sessions/${first.runId}/host-state`, async route => {
    const response = await route.fetch();
    heldResponses++;
    await held;
    await route.fulfill({ response });
  });
  try {
    await expect.poll(() => heldResponses).toBeGreaterThan(0);
    await report(second);
    expect(second.joinCode).not.toBe(first.joinCode);
    await expect(panel).toContainText(second.joinCode, { timeout: 20000 });
    await page.evaluate(() => {
      const observed: string[] = [];
      Object.assign(window, { auditHostCodes: observed });
      new MutationObserver(() => {
        const code = document.querySelector('.activity-live-host-join strong')?.textContent;
        if (code) observed.push(code);
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    release();
    // Wait until the delayed old response has been rendered or discarded.
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { auditHostCodes: string[] }).auditHostCodes)).not.toContain(first.joinCode);
    await expect(panel).toContainText(second.joinCode);
    const sent = page.waitForResponse(response => response.url().endsWith(`/activity-runs/${second.runId}/command`) && response.request().method() === "POST");
    await panel.getByRole("button", { name: "Start the game", exact: true }).click();
    expect((await sent).status()).toBe(200);
  } finally { release(); }
});

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

test("a signed-out phone can host a game and receives the TV acknowledgment without another tap", async ({ page, browser }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Public remote", undefined, true);
  await openUniversalRemote(page, prepared.screenId);
  const grant = await page.evaluate(() => sessionStorage.getItem("lessoncue.universalGrant"));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(value => sessionStorage.setItem("lessoncue.universalGrant", value!), grant);
  const phone = await context.newPage();
  try {
    const concurrent = await Promise.all(Array.from({ length: 8 }, () => context.request.post(`/api/v1/screens/${prepared.screenId}/control`, {
      headers: { 'X-LessonCue-Controller': 'universal', 'X-LessonCue-Controller-Grant': grant! }, data: { action: 'pause' },
    })));
    for (const result of concurrent) expect(result.status()).toBe(202);
    const versions = await Promise.all(concurrent.map(result => result.json()));
    expect(new Set(versions.map(result => result.version)).size).toBe(8);
    await phone.goto(`/universalremote?lesson=${prepared.lessonId}`);
    await phone.getByLabel("Control this screen").selectOption(prepared.screenId);
    await expect(phone.getByRole("region", { name: "Live game controls" })).toBeVisible({ timeout: 20000 });
    const sent = phone.waitForResponse(response => response.url().endsWith(`/activity-runs/${prepared.runId}/command`) && response.request().method() === 'POST', { timeout: 30_000 });
    await phone.getByRole('button', { name: 'Start the game', exact: true }).click();
    expect((await sent).status()).toBe(200);

    const receipt = phone.waitForResponse(response => response.url().endsWith(`/screens/${prepared.screenId}/control`) && response.request().method() === 'POST');
    await phone.locator('.remote-transport').getByRole('button', { name: /Pause/ }).click();
    const response = await receipt;
    expect(response.status()).toBe(202);
    const { version } = await response.json();
    const status = await page.request.post('/api/v1/tv/status', {
      headers: { Authorization: `Bearer ${prepared.deviceToken}` },
      data: { screenId: prepared.screenId, appVersion: '0.46.6', online: true, freeBytes: 4e9,
        manifestVersion: 1, failedDownloads: 0, acknowledgedControlVersion: version,
        playbackState: 'paused', lessonId: prepared.lessonId, itemId: prepared.itemId, positionMs: 0, durationMs: 60000 },
    });
    expect(status.ok()).toBeTruthy();
    await expect(phone.getByText('Received', { exact: true })).toBeVisible({ timeout: 10000 });
    const liveRefresh = await phone.waitForResponse(response => response.url().includes('/controller/bootstrap?') && response.url().includes('liveOnly=true'));
    const liveState = await liveRefresh.json();
    expect(liveState.libraryIncluded).toBe(false);
    expect(liveState.lessons).toEqual([]);
    expect(liveState.classes).toEqual([]);
    expect(liveState.screens.some((screen: { id: string }) => screen.id === prepared.screenId)).toBeTruthy();
    await expect(phone.getByRole('region', { name: 'Live game controls' })).toBeVisible();

    // An interrupted refresh retains the controls and recovers automatically.
    await context.setOffline(true);
    await expect(phone.getByText('Connection interrupted. Retrying…')).toBeVisible({ timeout: 12000 });
    await expect(phone.locator('.remote-shell')).toBeVisible();
    await context.setOffline(false);
    await expect(phone.getByText('Connection interrupted. Retrying…')).toHaveCount(0, { timeout: 12000 });
  } finally { await context.close(); }
});

test("the remote reads as one flow rather than three tabs", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Host Tabs");
  await openUniversalRemote(page, prepared.screenId);

  // Tabs asked a teacher to know which of three panels held what they wanted,
  // and said nothing about which to look in next. The work is a sequence, so
  // the remote is one now: lesson, then cue, then that cue's controls.
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Lesson" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cues" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cue controls" })).toBeVisible();
  await expect(page.locator(".remote-header")).toHaveCount(0);
  await expect(page.locator(".remote-transport button")).toHaveCount(4);
  const transportHeights = await page.locator(".remote-transport button").evaluateAll(buttons =>
    buttons.map(button => Math.round(button.getBoundingClientRect().height)));
  expect(Math.max(...transportHeights) - Math.min(...transportHeights), "pause must share the remote control footprint").toBeLessThanOrEqual(1);
  await expect(page.getByText("Save this controller as an app", { exact: true })).toHaveCount(0);
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
  await expect(page.locator(".remote-run-summary")).toContainText("REMAINING");
});

test("the live console shows the join code, roster, and answers-in count", async ({ page }) => {
  await authenticate(page);
  const prepared = await prepareHostedTrivia(page, "Host Live Panel");
  await openUniversalRemote(page, prepared.screenId);

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

  const panel = page.locator(".activity-live-host");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel).toContainText("Needs you", { timeout: 30_000 });
  await expect(panel).toContainText(/target participant/i);
  // And no clock ticking towards a moment that will never come.
  await expect(panel.locator(".activity-live-host-countdown")).toHaveCount(0);
});

test("a full class fits: everyone is listed, findable, and lockable mid-game", async ({ page }) => {
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
  await panel.getByRole("button", { name: "Lock Player 17" }).click();
  await expect(panel.locator(".activity-live-host-roster li")).toContainText("Locked");
  await expect(panel.getByRole("button", { name: "Unlock Player 17" })).toBeVisible();

  // Locking is reversible; the player remains in the roster and can be
  // unblocked without creating a second identity on the phone.
  await panel.getByRole("button", { name: "Unlock Player 17" }).click();
  await expect(panel.getByRole("button", { name: "Lock Player 17" })).toBeVisible();
});
