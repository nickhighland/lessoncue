import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const password = "LessonCueTest42";
let adminCookies: Parameters<BrowserContext["addCookies"]>[0] = [];

async function authenticate(page: Page) {
  if (adminCookies.length > 0) {
    await page.context().addCookies(adminCookies);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ })).toBeVisible();
    return;
  }
  await page.goto("/");
  const setup = page.getByRole("heading", { name: "Create your Service Admin" });
  const signIn = page.getByRole("heading", { name: "Sign in to LessonCue" });
  await expect(setup.or(signIn)).toBeVisible();
  if (await setup.isVisible()) {
    await page.getByLabel("Organization name").fill("Activity Games Test");
    await page.getByLabel("Your name").fill("Activity Administrator");
    await page.getByLabel("Username").fill("browser-admin");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Finish setup" }).click();
  } else {
    await page.getByLabel("Username").fill("browser-admin");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await authenticate(page);
  adminCookies = await context.cookies();
  await context.close();
});

async function createActivity(page: Page, presetName: string, activityName: string) {
  await page.getByRole("button", { name: /Activities$/ }).click();
  await expect(page.getByRole("heading", { name: "Activities Studio" })).toBeVisible();
  await page.getByRole("button", { name: "+ Create activity" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose an Activity Type" });
  await chooser.getByText(presetName, { exact: true }).click();
  await page.locator('input[type="text"]').first().fill(activityName);
  const saveResponse = page.waitForResponse(response => response.request().method() === "PUT" && response.url().includes("/api/v1/activities/") && response.ok());
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Save activity" }).click();
  const saved = await saveResponse;
  const activity = await saved.json() as { id: string; name: string };
  expect(activity.name).toBe(activityName);
  return activity.id;
}

async function launch(page: Page, definitionId: string) {
  return page.evaluate(async id => {
    const response = await fetch("/api/v1/activity-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityDefinitionId: id }),
    });
    const body = await response.json() as { runId: string; state?: { joinCode?: string } };
    if (!response.ok || !body.state?.joinCode) throw new Error(JSON.stringify(body));
    return { runId: body.runId, joinCode: body.state.joinCode };
  }, definitionId);
}

async function hostAction(page: Page, runId: string, action: string, payload?: Record<string, unknown>) {
  const result = await page.evaluate(async ({ id, command, commandPayload }) => {
    const response = await fetch(`/api/v1/activity-runs/${id}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: command, payload: commandPayload || null }),
    });
    return { status: response.status, body: await response.json() };
  }, { id: runId, command: action, commandPayload: payload });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
}

async function hostState(page: Page, runId: string) {
  return page.evaluate(async id => {
    const response = await fetch(`/api/v1/activity-sessions/${id}/host-state`);
    return response.json() as Promise<{
      participants: Array<{ id: string; displayName: string }>;
      submissions: Array<{ id: string; moderationStatus: string }>;
      scoreEvents: Array<{ amount: number }>;
    }>;
  }, runId);
}

async function runState(page: Page, runId: string) {
  return page.evaluate(async id => {
    const response = await fetch(`/api/v1/activity-runs/${id}`);
    const body = await response.json() as { state: Record<string, unknown> };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body.state;
  }, runId);
}

test("Trivia runs from teacher launch through two phone answers and scored reveal", async ({ page, browser }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Trivia Quiz", "Browser Trivia Vertical Slice");
  const run = await launch(page, definitionId);
  const baseURL = new URL(page.url()).origin;
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    for (const [participantPage, name] of [[first, "Alex"], [second, "Jordan"]] as const) {
      await participantPage.goto(`/play/${run.joinCode}`);
      await expect(participantPage.getByRole("heading", { name: "Browser Trivia Vertical Slice" })).toBeVisible();
      await participantPage.getByLabel("Display name").fill(name);
      await participantPage.getByRole("button", { name: "Join game" }).click();
      await expect(participantPage.getByText("You’re in.")).toBeVisible();
    }

    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "open");
    for (const participantPage of [first, second]) {
      await expect(participantPage.locator(".participant-choice-list")).toBeVisible();
      await participantPage.locator(".participant-choice-list button").nth(1).click();
      await expect(participantPage.getByText("Your answer is locked in.")).toBeVisible();
    }
    await hostAction(page, run.runId, "lock");
    await hostAction(page, run.runId, "reveal");
    await expect(first.getByText("Reveal time.")).toBeVisible();
    const state = await hostState(page, run.runId);
    expect(state.scoreEvents.filter(event => event.amount === 100)).toHaveLength(2);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("Punchline keeps anonymous responses moderated before voting", async ({ page, browser }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Punchline", "Browser Punchline Vertical Slice");
  const run = await launch(page, definitionId);
  const baseURL = new URL(page.url()).origin;
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    for (const [participantPage, name, answer] of [[first, "Alex", "A very tiny mascot"], [second, "Jordan", "A mascot made of toast"]] as const) {
      await participantPage.goto(`/play/${run.joinCode}`);
      await participantPage.getByLabel("Display name").fill(name);
      await participantPage.getByRole("button", { name: "Join game" }).click();
    }
    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "open");
    for (const [participantPage, answer] of [[first, "A very tiny mascot"], [second, "A mascot made of toast"]] as const) {
      await expect(participantPage.locator("textarea")).toBeVisible();
      await participantPage.locator("textarea").fill(answer);
      await participantPage.getByRole("button", { name: "Send response" }).click();
    }
    await expect.poll(async () => (await hostState(page, run.runId)).submissions.length).toBe(2);
    let state = await hostState(page, run.runId);
    expect(state.submissions.every(item => item.moderationStatus === "pending")).toBe(true);
    for (const submission of state.submissions) await hostAction(page, run.runId, "moderate", { submissionId: submission.id, status: "approved" });
    await hostAction(page, run.runId, "lock");
    await hostAction(page, run.runId, "openvoting");
    await expect(first.locator(".participant-choice-list")).toBeVisible();
    await first.locator(".participant-choice-list button").first().click();
    await second.locator(".participant-choice-list button").first().click();
    await hostAction(page, run.runId, "reveal");
    state = await hostState(page, run.runId);
    expect(state.scoreEvents.length).toBeGreaterThan(0);
    await expect(first.getByText("Reveal time.")).toBeVisible();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("Order Up supports accessible phone sorting and partial credit", async ({ page, browser }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Order Up", "Browser Order Up Vertical Slice");
  const run = await launch(page, definitionId);
  const baseURL = new URL(page.url()).origin;
  const context = await browser.newContext({ baseURL });
  const participant = await context.newPage();
  try {
    await participant.goto(`/play/${run.joinCode}`);
    await participant.getByLabel("Display name").fill("Sorter");
    await participant.getByRole("button", { name: "Join game" }).click();
    await expect(participant.getByText("You’re in.")).toBeVisible();

    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "open");
    await expect(participant.locator(".ordering-participant-list")).toBeVisible();
    await participant.getByRole("button", { name: "Move Try down" }).click();
    await participant.getByRole("button", { name: "Lock in order" }).click();
    await expect(participant.getByText("Your answer is locked in.")).toBeVisible();

    await hostAction(page, run.runId, "lock");
    await hostAction(page, run.runId, "reveal");
    await expect(participant.getByText("Reveal time.")).toBeVisible();
    const state = await hostState(page, run.runId);
    expect(state.scoreEvents.some(event => event.amount === 33)).toBe(true);
  } finally {
    await context.close();
  }
});

test("Match Minds gives the target a private answer and scores matching predictions", async ({ page, browser }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Match Minds", "Browser Match Minds Vertical Slice");
  const run = await launch(page, definitionId);
  const baseURL = new URL(page.url()).origin;
  const targetContext = await browser.newContext({ baseURL });
  const predictorContext = await browser.newContext({ baseURL });
  const target = await targetContext.newPage();
  const predictor = await predictorContext.newPage();
  try {
    for (const [participantPage, name] of [[target, "Target"], [predictor, "Predictor"]] as const) {
      await participantPage.goto(`/play/${run.joinCode}`);
      await participantPage.getByLabel("Display name").fill(name);
      await participantPage.getByRole("button", { name: "Join game" }).click();
      await expect(participantPage.getByText("You’re in.")).toBeVisible();
    }
    await hostAction(page, run.runId, "start");
    const lobby = await hostState(page, run.runId);
    const targetId = lobby.participants.find(participant => participant.displayName === "Target")?.id;
    expect(targetId).toBeTruthy();
    await hostAction(page, run.runId, "selecttarget", { participantId: targetId });
    await hostAction(page, run.runId, "open");
    await expect(target.getByText("ANSWER PRIVATELY")).toBeVisible();
    await expect(predictor.getByText("PREDICT THE TARGET")).toBeVisible();
    await target.locator(".participant-choice-list button").nth(2).click();
    await predictor.locator(".participant-choice-list button").nth(2).click();
    await hostAction(page, run.runId, "lock");
    await hostAction(page, run.runId, "reveal");
    await expect(predictor.getByText("Reveal time.")).toBeVisible();
    const state = await hostState(page, run.runId);
    expect(state.scoreEvents.some(event => event.amount === 100)).toBe(true);
  } finally {
    await targetContext.close();
    await predictorContext.close();
  }
});

test("Beat the Clock gives the host a timed no-phone challenge and ruling", async ({ page, browser }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Beat the Clock", "Browser Beat the Clock Vertical Slice");
  const run = await launch(page, definitionId);
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const contestant = await context.newPage();
  try {
    await contestant.goto(`/play/${run.joinCode}`);
    await contestant.getByLabel("Display name").fill("Contestant");
    await contestant.getByRole("button", { name: "Join game" }).click();
    await expect(contestant.getByText("You’re in.")).toBeVisible();
    await hostAction(page, run.runId, "start");
    const lobby = await hostState(page, run.runId);
    const contestantId = lobby.participants.find(participant => participant.displayName === "Contestant")?.id;
    expect(contestantId).toBeTruthy();
    await hostAction(page, run.runId, "selectcontestant", { participantId: contestantId });
    await hostAction(page, run.runId, "starttimer");
    await expect(page.locator(".stage-timer-card")).toBeVisible();
    await hostAction(page, run.runId, "success");
    const state = await hostState(page, run.runId);
    expect(state.scoreEvents.some(event => event.amount === 100)).toBe(true);
  } finally {
    await context.close();
  }
});

test("Four Corners runs with no phone participants and host-controlled pacing", async ({ page }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Four Corners", "Browser Four Corners Vertical Slice");
  const run = await launch(page, definitionId);

  await hostAction(page, run.runId, "start");
  let state = await runState(page, run.runId);
  expect(state.phase).toBe("roundIntro");
  expect((state.currentRound as { choices: string[] }).choices).toHaveLength(4);

  await hostAction(page, run.runId, "starttimer");
  state = await runState(page, run.runId);
  expect(state.challengeStatus).toBe("running");
  expect(state.timerDurationMs).toBe(30000);
  await hostAction(page, run.runId, "pausetimer");
  expect((await runState(page, run.runId)).challengeStatus).toBe("paused");
  await hostAction(page, run.runId, "resumetimer");
  await hostAction(page, run.runId, "randomize");
  await hostAction(page, run.runId, "reveal");
  expect((await runState(page, run.runId)).revealed).toBe(true);
  await hostAction(page, run.runId, "next");
  expect((await runState(page, run.runId)).phase).toBe("finalResults");
});

test("Game Show Utilities keeps random outcomes server-controlled", async ({ page }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Game Show Utilities", "Browser Utility Vertical Slice");
  const run = await launch(page, definitionId);

  await hostAction(page, run.runId, "start");
  await hostAction(page, run.runId, "flip");
  const state = await runState(page, run.runId);
  expect(state.result).toMatchObject({ kind: "coinFlip" });
  expect(["Heads", "Tails"]).toContain((state.result as { label: string }).label);
});

test("Game Show Utilities can pick the live roster and run a server countdown", async ({ page, browser }) => {
  await authenticate(page);
  const definition = await page.evaluate(async () => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Browser Utility Roster",
        type: "utility",
        config: { title: "Roster Picker", utilityType: "randomPerson" },
      }),
    });
    const body = await response.json() as { id: string };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  const run = await launch(page, definition.id);
  const baseURL = new URL(page.url()).origin;
  const context = await browser.newContext({ baseURL });
  const participant = await context.newPage();
  try {
    await participant.goto(`/play/${run.joinCode}`);
    await participant.getByLabel("Display name").fill("Roster Player");
    await participant.getByRole("button", { name: "Join game" }).click();
    await expect(participant.getByText("You’re in.")).toBeVisible();
    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "pickperson");
    expect((await runState(page, run.runId)).result).toMatchObject({ kind: "randomPerson", label: "Roster Player" });
  } finally {
    await context.close();
  }

  const countdownDefinition = await page.evaluate(async () => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Browser Utility Countdown",
        type: "utility",
        config: { title: "Quick Timer", utilityType: "countdown", durationSeconds: 30 },
      }),
    });
    const body = await response.json() as { id: string };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  const countdown = await launch(page, countdownDefinition.id);
  await hostAction(page, countdown.runId, "start");
  await hostAction(page, countdown.runId, "starttimer");
  expect((await runState(page, countdown.runId)).timerRunning).toBe(true);
  await hostAction(page, countdown.runId, "pausetimer");
  expect((await runState(page, countdown.runId)).timerRunning).toBe(false);
  await hostAction(page, countdown.runId, "adjusttime", { deltaSeconds: 10 });
  expect((await runState(page, countdown.runId)).timerRemainingMs as number).toBeGreaterThan(0);
});

test("Activities Studio supports grid/list views, filters, arranging, and bulk deletion", async ({ page }) => {
  await authenticate(page);
  await page.evaluate(async () => {
    const definitions = [
      {
        name: "Library Trivia",
        type: "trivia",
        description: "A quiz used to verify library controls.",
        config: {
          title: "Library Trivia",
          questions: [{ id: "q1", prompt: "Which answer is first?", options: ["A", "B"], correctIndex: 0 }],
        },
      },
      {
        name: "Library Bracket",
        type: "bracket",
        description: "A tournament used to verify library controls.",
        config: {
          title: "Library Bracket",
          entrants: [
            { id: "a", label: "Alpha" },
            { id: "b", label: "Beta" },
          ],
        },
      },
    ];
    for (const definition of definitions) {
      const response = await fetch("/api/v1/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(definition),
      });
      if (!response.ok) throw new Error(`Could not create ${definition.name}: ${await response.text()}`);
    }
  });

  await page.getByRole("button", { name: /Activities$/ }).click();
  await expect(page.getByRole("heading", { name: "Activities Studio" })).toBeVisible();
  await expect(page.locator(".activity-library-grid")).toBeVisible();

  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByText("Library Trivia", { exact: true })).toBeVisible();
  await expect(page.getByText("Library Bracket", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("lessoncue.activityView"))).toBe("list");

  await page.getByLabel("Game family").selectOption("quiz");
  await expect(page.getByText("Library Trivia", { exact: true })).toBeVisible();
  await expect(page.getByText("Library Bracket", { exact: true })).toHaveCount(0);
  await page.getByLabel("Game family").selectOption("all");

  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await expect(page.getByRole("button", { name: /Move Library Trivia later/ })).toBeVisible();
  await page.getByRole("button", { name: /Move Library Trivia later/ }).click();
  await expect(page.getByRole("status")).toContainText("Activity order saved.");
  await page.getByRole("button", { name: "Done arranging" }).click();

  await page.getByRole("button", { name: "Grid view" }).click();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ })).toBeVisible();
  await page.getByRole("button", { name: /Activities$/ }).click();
  await expect(page.locator(".activity-library-grid")).toBeVisible();

  await page.getByRole("checkbox", { name: "Select Library Trivia" }).check();
  await page.getByRole("checkbox", { name: "Select Library Bracket" }).check();
  await page.getByRole("button", { name: "Delete selected" }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete 2 activities?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Delete selected" }).click();
  await expect(page.getByRole("status")).toContainText("2 deleted");
  await expect(page.getByText("Library Trivia", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Library Bracket", { exact: true })).toHaveCount(0);
});

test("Activities editor previews draft snapshots and protects unsaved changes", async ({ page }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Trivia Quiz", "Preview Dirty State Activity");
  try {
    await expect(page.locator(".activity-editor-draft-status")).toHaveText("Saved");
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeDisabled();

    await page.locator('input[type="text"]').first().fill("Preview Draft Activity");
    await expect(page.locator(".activity-editor-draft-status")).toHaveText("Unsaved changes");
    await expect(page.getByRole("button", { name: "Save activity", exact: true })).toBeEnabled();

    for (const [mode, marker] of [
      ["Participant", "PARTICIPANT PREVIEW"],
      ["Reveal", "Trivia Quiz"],
      ["Leaderboard", "SCOREBOARD PREVIEW"],
      ["Podium", "FINAL RESULTS PREVIEW"]
    ] as const) {
      await page.getByRole("tab", { name: mode, exact: true }).click();
      if (mode === "Reveal") {
        await expect(page.locator('[data-preview-mode="reveal"] .activity-title')).toBeVisible();
      } else {
        await expect(page.getByText(marker, { exact: false }).last()).toBeVisible();
      }
    }

    await page.getByRole("button", { name: "Close", exact: true }).click();
    const warning = page.getByRole("dialog", { name: "Unsaved changes" });
    await expect(warning).toBeVisible();
    await warning.getByRole("button", { name: "Keep editing" }).click();
    await expect(warning).toHaveCount(0);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("dialog", { name: "Unsaved changes" }).getByRole("button", { name: "Discard changes" }).click();
    await expect(page.locator(".activity-editor-draft-status")).toHaveCount(0);
  } finally {
    await page.evaluate(async id => {
      await fetch("/api/v1/activities/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    }, definitionId);
  }
});
