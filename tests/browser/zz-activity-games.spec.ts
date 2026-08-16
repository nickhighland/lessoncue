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
  const activityTag = Date.now().toString();
  const triviaName = `Library Trivia ${activityTag}`;
  const bracketName = `Library Bracket ${activityTag}`;
  await page.evaluate(async ({ triviaName, bracketName }) => {
    const definitions = [
      {
        name: triviaName,
        type: "trivia",
        description: "A quiz used to verify library controls.",
        config: {
          title: triviaName,
          questions: [{ id: "q1", prompt: "Which answer is first?", options: ["A", "B"], correctIndex: 0 }],
        },
      },
      {
        name: bracketName,
        type: "bracket",
        description: "A tournament used to verify library controls.",
        config: {
          title: bracketName,
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
  }, { triviaName, bracketName });

  await page.getByRole("button", { name: /Activities$/ }).click();
  await expect(page.getByRole("heading", { name: "Activities Studio" })).toBeVisible();
  await expect(page.locator(".activity-library-grid")).toBeVisible();

  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByText(triviaName, { exact: true })).toBeVisible();
  await expect(page.getByText(bracketName, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("lessoncue.activityView"))).toBe("list");

  await page.getByLabel("Game family").selectOption("quiz");
  await expect(page.getByText(triviaName, { exact: true })).toBeVisible();
  await expect(page.getByText(bracketName, { exact: true })).toHaveCount(0);
  await page.getByLabel("Game family").selectOption("all");

  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(`Move ${triviaName} later`) })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`Move ${triviaName} later`) }).click();
  await expect(page.getByRole("status")).toContainText("Activity order saved.");
  await page.getByRole("button", { name: "Done arranging" }).click();

  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(page.getByText("Not used in lessons").first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ })).toBeVisible();
  await page.getByRole("button", { name: /Activities$/ }).click();
  await expect(page.locator(".activity-library-grid")).toBeVisible();

  await page.getByRole("checkbox", { name: `Select ${triviaName}`, exact: true }).check();
  await page.getByRole("checkbox", { name: `Select ${bracketName}`, exact: true }).check();
  await page.getByRole("button", { name: "Duplicate selected" }).click();
  await expect(page.getByRole("status")).toContainText("2 activities duplicated.");

  await page.getByRole("checkbox", { name: `Select ${triviaName}`, exact: true }).check();
  await page.getByRole("checkbox", { name: `Select ${bracketName}`, exact: true }).check();
  await page.getByRole("button", { name: "Archive selected" }).click();
  await expect(page.getByRole("status")).toContainText("2 activities archived.");
  await page.getByRole("checkbox", { name: "Show archived" }).check();
  await page.getByRole("checkbox", { name: `Select ${triviaName}`, exact: true }).check();
  await page.getByRole("checkbox", { name: `Select ${bracketName}`, exact: true }).check();
  await page.getByRole("button", { name: "Restore selected" }).click();
  await expect(page.getByRole("status")).toContainText("2 activities restored.");

  await page.getByRole("checkbox", { name: `Select ${triviaName}`, exact: true }).check();
  await page.getByRole("checkbox", { name: `Select ${bracketName}`, exact: true }).check();
  await page.getByRole("button", { name: "Delete selected" }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete 2 activities?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Delete selected" }).click();
  await expect(page.getByRole("status")).toContainText("2 deleted");
  await expect(page.getByText(triviaName, { exact: true })).toHaveCount(0);
  await expect(page.getByText(bracketName, { exact: true })).toHaveCount(0);
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

test("Quiz and poll editors apply reusable named presets without changing engines", async ({ page }) => {
  await authenticate(page);
  const quizName = `Preset Quiz ${Date.now()}`;
  const pollName = `Preset Poll ${Date.now()}`;
  const quizId = await createActivity(page, "Trivia Quiz", quizName);
  let pollId = "";
  try {
    await page.getByLabel("Quiz format preset").selectOption("factOrFiction");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.locator("textarea").nth(1)).toHaveValue("A day on Venus is longer than a year on Venus.");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedQuiz = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; questions: Array<{ options: string[] }> } }, quizId);
    expect(savedQuiz.presetType).toBe("factOrFiction");
    expect(savedQuiz.config.preset).toBe("factOrFiction");
    expect(savedQuiz.config.questions[0].options).toHaveLength(2);

    await page.getByRole("button", { name: "Close", exact: true }).click();
    pollId = await createActivity(page, "Live Poll", pollName);
    await page.getByLabel("Poll format preset").selectOption("wouldYouRather");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.getByLabel("Poll question")).toHaveValue("Would you rather be 30 minutes early or 5 minutes late?");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedPoll = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; options: string[] } }, pollId);
    expect(savedPoll.presetType).toBe("wouldYouRather");
    expect(savedPoll.config.preset).toBe("wouldYouRather");
    expect(savedPoll.config.options).toHaveLength(2);
  } finally {
    await page.evaluate(async ids => {
      await fetch("/api/v1/activities/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.filter(Boolean) }),
      });
    }, [quizId, pollId]);
  }
});

test("Buzzer, creative, and bluffing editors reuse named engine presets", async ({ page }) => {
  await authenticate(page);
  const tag = Date.now();
  const buzzerName = `Preset Buzzer ${tag}`;
  const punchlineName = `Preset Punchline ${tag}`;
  const fakeOutName = `Preset Fake Out ${tag}`;
  const buzzerId = await createActivity(page, "Buzzer Battle", buzzerName);
  let punchlineId = "";
  let fakeOutId = "";
  try {
    await page.getByLabel("Buzzer format preset").selectOption("clueLadder");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.locator('input[placeholder="Clue text"]').first()).toHaveValue("This answer can be found in many kitchens.");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedBuzzer = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; clues: Array<{ points: number }> } }, buzzerId);
    expect(savedBuzzer.presetType).toBe("clueLadder");
    expect(savedBuzzer.config.preset).toBe("clueLadder");
    expect(savedBuzzer.config.clues.map(clue => clue.points)).toEqual([300, 200, 100]);

    await page.getByRole("button", { name: "Close", exact: true }).click();
    punchlineId = await createActivity(page, "Punchline", punchlineName);
    await page.getByLabel("Creative format preset").selectOption("captionThis");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.locator("textarea").nth(1)).toHaveValue("Write the caption this picture deserves.");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedPunchline = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string } }, punchlineId);
    expect(savedPunchline.presetType).toBe("captionThis");
    expect(savedPunchline.config.preset).toBe("captionThis");

    await page.getByRole("button", { name: "Close", exact: true }).click();
    fakeOutId = await createActivity(page, "Fake Out", fakeOutName);
    await page.getByLabel("Bluffing format preset").selectOption("confessions");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.locator('input[placeholder="The true answer"]')).toHaveValue("Add the real confession");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedFakeOut = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string } }, fakeOutId);
    expect(savedFakeOut.presetType).toBe("confessions");
    expect(savedFakeOut.config.preset).toBe("confessions");
  } finally {
    await page.evaluate(async ids => {
      await fetch("/api/v1/activities/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.filter(Boolean) }),
      });
    }, [buzzerId, punchlineId, fakeOutId]);
  }
});

test("Drawing and survey editors apply creative board templates with editable entries", async ({ page }) => {
  await authenticate(page);
  const tag = Date.now();
  const drawingName = `Preset Drawing ${tag}`;
  const surveyName = `Preset Survey ${tag}`;
  const drawingId = await createActivity(page, "Doodle & Guess", drawingName);
  let surveyId = "";
  try {
    await page.getByLabel("Drawing format preset").selectOption("mascotMaker");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.locator("textarea").nth(1)).toHaveValue("Design a mascot for a team that never gives up.");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedDrawing = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; prompts: Array<{ prompt: string }> } }, drawingId);
    expect(savedDrawing.presetType).toBe("mascotMaker");
    expect(savedDrawing.config.preset).toBe("mascotMaker");
    expect(savedDrawing.config.prompts[0].prompt).toContain("mascot");

    await page.getByRole("button", { name: "Close", exact: true }).click();
    surveyId = await createActivity(page, "Survey Board", surveyName);
    await page.getByLabel("Survey board format preset").selectOption("topFive");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.getByLabel("Prompt")).toHaveValue("What are five things that help a team succeed?");
    await expect(page.getByRole("textbox", { name: "Answer 5" })).toHaveValue("Celebrate");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedSurvey = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; questions: Array<{ answers: Array<unknown> }> } }, surveyId);
    expect(savedSurvey.presetType).toBe("topFive");
    expect(savedSurvey.config.preset).toBe("topFive");
    expect(savedSurvey.config.questions[0].answers).toHaveLength(5);
  } finally {
    await page.evaluate(async ids => {
      await fetch("/api/v1/activities/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.filter(Boolean) }),
      });
    }, [drawingId, surveyId]);
  }
});

test("Ordering, word, and match editors reuse named templates with flexible content", async ({ page }) => {
  await authenticate(page);
  const tag = Date.now();
  const orderingName = `Preset Ordering ${tag}`;
  const wordName = `Preset Word ${tag}`;
  const matchName = `Preset Match ${tag}`;
  const orderingId = await createActivity(page, "Order Up", orderingName);
  let wordId = "";
  let matchId = "";
  try {
    await page.getByLabel("Ordering format preset").selectOption("timeline");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.locator("textarea").nth(1)).toHaveValue("Put these events in chronological order.");
    await expect(page.getByLabel("Item 4")).toHaveValue("Fourth event");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedOrdering = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; rounds: Array<{ items: Array<unknown> }> } }, orderingId);
    expect(savedOrdering.presetType).toBe("timeline");
    expect(savedOrdering.config.preset).toBe("timeline");
    expect(savedOrdering.config.rounds[0].items).toHaveLength(4);

    await page.getByRole("button", { name: "Close", exact: true }).click();
    wordId = await createActivity(page, "Word Storm", wordName);
    await page.getByLabel("Word format preset").selectOption("nameFive");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.locator("textarea").nth(1)).toHaveValue("Name five examples that fit the prompt.");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedWord = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; maxWords: number } }, wordId);
    expect(savedWord.presetType).toBe("nameFive");
    expect(savedWord.config.preset).toBe("nameFive");
    expect(savedWord.config.maxWords).toBe(5);

    await page.getByRole("button", { name: "Close", exact: true }).click();
    matchId = await createActivity(page, "Match Minds", matchName);
    await page.getByLabel("Match format preset").selectOption("friendMatch");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.locator("textarea").nth(1)).toHaveValue("Which option would your friend pick?");
    await expect(page.getByLabel("Choice 3")).toHaveValue("Option C");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedMatch = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; rounds: Array<{ options: string[] }> } }, matchId);
    expect(savedMatch.presetType).toBe("friendMatch");
    expect(savedMatch.config.preset).toBe("friendMatch");
    expect(savedMatch.config.rounds[0].options).toHaveLength(3);
  } finally {
    await page.evaluate(async ids => {
      await fetch("/api/v1/activities/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.filter(Boolean) }),
      });
    }, [orderingId, wordId, matchId]);
  }
});

test("Media reveal editors apply named visual formats without changing the source link", async ({ page }) => {
  await authenticate(page);
  const activityName = `Preset Media ${Date.now()}`;
  const definitionId = await createActivity(page, "Image Reveal", activityName);
  try {
    await page.getByLabel("Reveal format preset").selectOption("silhouette");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.locator('input[placeholder="e.g. Mystery Object Reveal"]')).toHaveValue("Silhouette");
    await expect(page.getByLabel("Reveal style")).toHaveValue("silhouette");
    await expect(page.locator('input[type="number"]')).toHaveValue("5");
    await page.locator('input[placeholder="https://... or /api/v1/media/..."]').fill("/api/v1/media/example-image");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const saved = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; style: string; imageUrl: string } }, definitionId);
    expect(saved.presetType).toBe("silhouette");
    expect(saved.config.preset).toBe("silhouette");
    expect(saved.config.style).toBe("silhouette");
    expect(saved.config.imageUrl).toBe("/api/v1/media/example-image");
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

test("Stage challenge editors apply host-led formats with editable timing and scoring", async ({ page }) => {
  await authenticate(page);
  const activityName = `Preset Stage ${Date.now()}`;
  const definitionId = await createActivity(page, "Beat the Clock", activityName);
  try {
    await page.getByLabel("Stage challenge format preset").selectOption("teachItBack");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.locator('input[placeholder="Build a paper tower"]')).toHaveValue("Explain one idea in 30 seconds");
    await expect(page.locator('textarea[placeholder="Challenge instructions"]')).toHaveValue("Teach the room the key idea using an example anyone can understand.");
    await expect(page.locator('input[type="number"]').first()).toHaveValue("30");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const saved = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; challenges: Array<{ seconds: number; points: number }> } }, definitionId);
    expect(saved.presetType).toBe("teachItBack");
    expect(saved.config.preset).toBe("teachItBack");
    expect(saved.config.challenges[0].seconds).toBe(30);
    expect(saved.config.challenges[0].points).toBe(100);
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
