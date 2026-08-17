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
  // Named presets and blank building blocks intentionally share labels (for
  // example, both expose “Punchline”). The named card is the first exact
  // match and is the one this helper is meant to exercise.
  await chooser.getByText(presetName, { exact: true }).first().click();
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

async function launchHostOnly(page: Page, definitionId: string) {
  return page.evaluate(async id => {
    const response = await fetch("/api/v1/activity-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityDefinitionId: id }),
    });
    const body = await response.json() as { runId: string; state?: Record<string, unknown> };
    if (!response.ok || !body.runId) throw new Error(JSON.stringify(body));
    return { runId: body.runId };
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
      state: { state: Record<string, unknown>; config?: Record<string, unknown> };
      participants: Array<{ id: string; displayName: string }>;
      teams: Array<{ id: string; name: string; score: number }>;
      submissions: Array<{ id: string; moderationStatus: string }>;
      scoreEvents: Array<{ amount: number }>;
    }>;
  }, runId);
}

async function participantAction(page: Page, runId: string, token: string, action: string, payload?: Record<string, unknown>) {
  return page.evaluate(async ({ id, participantToken, command, commandPayload }) => {
    const response = await fetch(`/api/v1/activity-sessions/${id}/participant-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantToken, action: command, payload: commandPayload || null }),
    });
    return { status: response.status, body: await response.json() };
  }, { id: runId, participantToken: token, command: action, commandPayload: payload });
}

async function runState(page: Page, runId: string) {
  return page.evaluate(async id => {
    const response = await fetch(`/api/v1/activity-runs/${id}`);
    const body = await response.json() as { state: Record<string, unknown> };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body.state;
  }, runId);
}

test("The existing Activities chooser exposes named game formats from one searchable catalog", async ({ page }) => {
  await authenticate(page);
  await page.getByRole("button", { name: /Activities$/ }).click();
  await expect(page.getByRole("heading", { name: "Activities Studio" })).toBeVisible();
  await page.getByRole("button", { name: "+ Create activity" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose an Activity Type" });
  await expect(chooser.getByRole("heading", { name: "Named game formats" })).toBeVisible();
  await expect(chooser.getByRole("button", { name: /Telephone Draw/ })).toBeVisible();
  await expect(chooser.getByRole("button", { name: /Connections/ })).toBeVisible();
  await expect(chooser.getByRole("button", { name: /Adventure/ })).toBeVisible();
  await expect(chooser.getByRole("button", { name: /Safari Spin/ })).toBeVisible();
  await expect(chooser.getByRole("button", { name: /Coin Flip/ })).toBeVisible();
  await chooser.getByLabel("Search game formats").fill("memory");
  await expect(chooser.getByRole("button", { name: /Memory Grid/ })).toBeVisible();
  await expect(chooser.getByText("No named formats match", { exact: false })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("Wheel and utility presets use the existing live run and controller paths", async ({ page }) => {
  await authenticate(page);
  const wheelId = await createActivity(page, "Safari Spin", "Browser Safari Spin");
  const wheelDefinition = await page.evaluate(async id => {
    const response = await fetch(`/api/v1/activities/${id}`);
    return response.json() as Promise<{ type: string; presetType?: string; config: { items?: unknown[] } }>;
  }, wheelId);
  expect(wheelDefinition.type).toBe("wheel");
  expect(wheelDefinition.presetType).toBe("safariSpin");
  expect(wheelDefinition.config.items).toHaveLength(4);
  const wheelRun = await launchHostOnly(page, wheelId);
  await hostAction(page, wheelRun.runId, "spin");
  expect((await runState(page, wheelRun.runId)).winnerLabel).toBeTruthy();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  const utilityId = await createActivity(page, "Coin Flip", "Browser Animal Coin Flip");
  const utilityDefinition = await page.evaluate(async id => {
    const response = await fetch(`/api/v1/activities/${id}`);
    return response.json() as Promise<{ type: string; presetType?: string; config: { utilityType?: string } }>;
  }, utilityId);
  expect(utilityDefinition.type).toBe("utility");
  expect(utilityDefinition.presetType).toBe("coinFlip");
  expect(utilityDefinition.config.utilityType).toBe("coinFlip");
  const utilityRun = await launchHostOnly(page, utilityId);
  await hostAction(page, utilityRun.runId, "start");
  await hostAction(page, utilityRun.runId, "flip");
  expect((await runState(page, utilityRun.runId)).result).toBeTruthy();
});

test("Named presets carry a TV theme and the editor can change it", async ({ page }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Safari Spin", "Browser Themed Safari Spin");
  await expect(page.getByText("TV presentation", { exact: true })).toBeVisible();
  await page.locator(".activity-theme-editor select").first().selectOption("neon");
  const saveResponse = page.waitForResponse(response => response.request().method() === "PUT" && response.url().includes(`/api/v1/activities/${definitionId}`) && response.ok());
  await page.getByRole("button", { name: "Save activity" }).click();
  await saveResponse;
  const definition = await page.evaluate(async id => {
    const response = await fetch(`/api/v1/activities/${id}`);
    return response.json() as Promise<{ theme?: { preset?: string; soundPack?: string; backgroundMotion?: boolean } }>;
  }, definitionId);
  expect(definition.theme?.preset).toBe("neon");
  expect(definition.theme?.soundPack).toBe("arcade");
  expect(definition.theme?.backgroundMotion).toBe(true);
});

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

test("Trivia supports short-answer and number lock-in rounds without leaking answers", async ({ page, browser }) => {
  await authenticate(page);
  const definition = await page.evaluate(async () => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Browser Flexible Quiz",
        type: "trivia",
        config: {
          title: "Browser Flexible Quiz",
          preset: "fillTheBlank",
          questions: [
            { id: "text-round", prompt: "Finish this phrase: Better late than ____.", answerMode: "text", acceptedAnswers: ["never", "not ever"], correctText: "never", points: 125 },
            { id: "number-round", prompt: "What is the mystery number?", answerMode: "number", targetNumber: 42, tolerance: 1, scoringMode: "exact", points: 150 },
          ],
        },
      }),
    });
    const body = await response.json() as { id: string };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  const run = await launch(page, definition.id);
  const baseURL = new URL(page.url()).origin;
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    for (const [participantPage, name] of [[first, "Alex"], [second, "Jordan"]] as const) {
      await participantPage.goto(`/play/${run.joinCode}`);
      await participantPage.getByLabel("Display name").fill(name);
      await participantPage.getByRole("button", { name: "Join game" }).click();
      await expect(participantPage.getByText("You’re in.")).toBeVisible();
    }

    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "open");
    for (const participantPage of [first, second]) {
      await expect(participantPage.getByText("SHORT ANSWER", { exact: true })).toBeVisible();
      await participantPage.locator("textarea").fill("never");
      await participantPage.getByRole("button", { name: "Lock in answer" }).click();
      await expect(participantPage.getByText("Your response is locked in.")).toBeVisible();
    }

    const firstToken = await first.evaluate(code => localStorage.getItem(`lessoncue:activity-participant:${code}`) || "", run.joinCode);
    const beforeReveal = await first.evaluate(async ({ runId, participantToken }) => {
      const response = await fetch(`/api/v1/activity-sessions/${runId}/participant-state?participantToken=${encodeURIComponent(participantToken)}`);
      return response.json() as Promise<{ state: { config: { questions: Array<Record<string, unknown>> }; state: Record<string, unknown> } }>;
    }, { runId: run.runId, participantToken: firstToken });
    expect(beforeReveal.state.config.questions[0].correctText).toBeUndefined();
    expect(beforeReveal.state.config.questions[0].acceptedAnswers).toBeUndefined();
    expect(beforeReveal.state.state.revealedAnswer).toBeUndefined();

    await hostAction(page, run.runId, "lock");
    await hostAction(page, run.runId, "reveal");
    const textReveal = await runState(page, run.runId);
    expect(textReveal.revealedAnswer).toBe("never");
    expect((await hostState(page, run.runId)).scoreEvents.filter(event => event.amount === 125)).toHaveLength(2);

    await hostAction(page, run.runId, "next");
    await hostAction(page, run.runId, "open");
    for (const participantPage of [first, second]) {
      await expect(participantPage.getByText("NUMBER LOCK-IN", { exact: true })).toBeVisible();
      await participantPage.locator("input[type=number]").fill("42");
      await participantPage.getByRole("button", { name: "Lock in answer" }).click();
    }
    await hostAction(page, run.runId, "lock");
    await hostAction(page, run.runId, "reveal");
    expect((await runState(page, run.runId)).revealedAnswer).toBe("42");
    expect((await hostState(page, run.runId)).scoreEvents.filter(event => event.amount === 150)).toHaveLength(2);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("Wager Trivia exposes shared modifier controls and scores the server-authoritative result", async ({ page, browser }) => {
  await authenticate(page);
  const definition = await page.evaluate(async () => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Browser Wager Trivia",
        type: "trivia",
        config: {
          title: "Browser Wager Trivia",
          modifiers: {
            wager: { enabled: true, maxPoints: 50, defaultPoints: 10 },
            doubleOrNothing: { enabled: true },
            lives: { enabled: true, startingLives: 2, eliminateAtZero: true },
          },
          questions: [{ id: "q1", prompt: "Choose B", options: ["A", "B"], correctIndex: 1, points: 100 }],
        },
      }),
    });
    const body = await response.json() as { id: string };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  const run = await launch(page, definition.id);
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const participant = await context.newPage();
  try {
    await participant.goto(`/play/${run.joinCode}`);
    await participant.getByLabel("Display name").fill("Risk Taker");
    await participant.getByRole("button", { name: "Join game" }).click();
    await expect(participant.getByText("You’re in.")).toBeVisible();
    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "open");
    await expect(participant.getByLabel("Quiz options")).toBeVisible();
    await expect(participant.getByText("Wager points")).toBeVisible();
    await expect(participant.getByText("Risk it for double points")).toBeVisible();
    await participant.locator("input[type=number]").fill("20");
    await participant.getByLabel("Risk it for double points").check();
    await participant.locator(".participant-choice-list button").nth(1).click();
    await hostAction(page, run.runId, "reveal");
    const state = await hostState(page, run.runId);
    expect(state.scoreEvents.some(event => event.amount === 240)).toBe(true);
  } finally {
    await context.close();
  }
});

test("Read the Room sequences editable rounds with different choice counts", async ({ page, browser }) => {
  await authenticate(page);
  const definition = await page.evaluate(async () => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Browser Poll Gauntlet",
        type: "poll",
        config: {
          title: "Browser Poll Gauntlet",
          preset: "thisOrThatGauntlet",
          rounds: [
            { id: "round-1", question: "Which side wins round one?", options: ["This", "That"] },
            { id: "round-2", question: "Which choice wins round two?", options: ["A", "B", "C", "D", "E", "F"] },
          ],
        },
      }),
    });
    const body = await response.json() as { id: string };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  const run = await launch(page, definition.id);
  const baseURL = new URL(page.url()).origin;
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    for (const [participantPage, name] of [[first, "Alex"], [second, "Jordan"]] as const) {
      await participantPage.goto(`/play/${run.joinCode}`);
      await participantPage.getByLabel("Display name").fill(name);
      await participantPage.getByRole("button", { name: "Join game" }).click();
      await expect(participantPage.getByText("You’re in.")).toBeVisible();
    }

    const firstToken = await first.evaluate(code => localStorage.getItem(`lessoncue:activity-participant:${code}`) || "", run.joinCode);
    const secondToken = await second.evaluate(code => localStorage.getItem(`lessoncue:activity-participant:${code}`) || "", run.joinCode);
    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "open");
    await expect(first.getByText("Which side wins round one?")).toBeVisible();
    expect((await participantAction(page, run.runId, firstToken, "vote", { optionIndex: 0 })).status).toBe(200);
    expect((await participantAction(page, run.runId, secondToken, "vote", { optionIndex: 1 })).status).toBe(200);
    await hostAction(page, run.runId, "reveal");
    expect((await runState(page, run.runId)).resultsVisible).toBe(true);

    await hostAction(page, run.runId, "next");
    expect((await runState(page, run.runId)).currentRoundIndex).toBe(1);
    await hostAction(page, run.runId, "open");
    await first.reload();
    await expect(first.getByText("Which choice wins round two?")).toBeVisible();
    await expect(first.locator(".participant-choice-list button")).toHaveCount(6);
    expect((await participantAction(page, run.runId, firstToken, "vote", { optionIndex: 5 })).status).toBe(200);
    expect((await participantAction(page, run.runId, secondToken, "vote", { optionIndex: 4 })).status).toBe(200);
    await hostAction(page, run.runId, "reveal");
    await hostAction(page, run.runId, "next");
    expect((await runState(page, run.runId)).phase).toBe("finalResults");
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

test("Punchline can resolve a moderated head-to-head matchup through the phone controller", async ({ page, browser }) => {
  await authenticate(page);
  const definition = await page.evaluate(async () => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Browser Head-to-Head Punchline",
        type: "punchline",
        config: {
          title: "Browser Head-to-Head Punchline",
          votingStyle: "headToHead",
          headToHeadMatchPoints: 25,
          requireModeration: false,
          prompts: [{ id: "prompt-1", prompt: "The worst mascot would be...", points: 100 }],
        },
      }),
    });
    const body = await response.json() as { id: string };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  const run = await launch(page, definition.id);
  const baseURL = new URL(page.url()).origin;
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    for (const [participantPage, name] of [[first, "Alex"], [second, "Jordan"]] as const) {
      await participantPage.goto(`/play/${run.joinCode}`);
      await participantPage.getByLabel("Display name").fill(name);
      await participantPage.getByRole("button", { name: "Join game" }).click();
      await expect(participantPage.getByText("You’re in.")).toBeVisible();
    }
    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "open");
    for (const [participantPage, answer] of [[first, "A tiny mascot"], [second, "A mascot made of toast"]] as const) {
      await expect(participantPage.locator("textarea")).toBeVisible();
      await participantPage.locator("textarea").fill(answer);
      await participantPage.getByRole("button", { name: "Send response" }).click();
    }
    await expect.poll(async () => (await hostState(page, run.runId)).submissions.length).toBe(2);
    await hostAction(page, run.runId, "lock");
    await hostAction(page, run.runId, "openvoting");
    await expect(first.locator(".participant-choice-list button")).toHaveCount(2);
    const session = await hostState(page, run.runId);
    const firstSubmissionId = session.submissions[0].id;
    await first.locator(".participant-choice-list button").first().click();
    await second.locator(".participant-choice-list button").first().click();
    await hostAction(page, run.runId, "reveal", { winnerId: firstSubmissionId });
    await expect.poll(async () => (await runState(page, run.runId)).phase).toBe("finalResults");
    const scores = (await hostState(page, run.runId)).scoreEvents.map(event => event.amount);
    expect(scores).toContain(25);
    expect(scores).toContain(100);
    await expect(first.getByText("Reveal time.")).toBeVisible();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("Buzzer Battle keeps the first buzz authoritative and locks out a miss", async ({ page, browser }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Buzzer Battle", "Browser Buzzer Vertical Slice");
  const run = await launch(page, definitionId);
  const baseURL = new URL(page.url()).origin;
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    for (const [participantPage, name] of [[first, "Alex"], [second, "Jordan"]] as const) {
      await participantPage.goto(`/play/${run.joinCode}`);
      await participantPage.getByLabel("Display name").fill(name);
      await participantPage.getByRole("button", { name: "Join game" }).click();
      await expect(participantPage.getByText("You’re in.")).toBeVisible();
    }

    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "revealclue");
    await expect(first.getByRole("button", { name: "BUZZ", exact: true })).toBeVisible();
    await first.getByRole("button", { name: "BUZZ", exact: true }).click();
    await expect.poll(async () => (await runState(page, run.runId)).buzzWinnerName).toBe("Alex");

    const secondToken = await second.evaluate(code => localStorage.getItem(`lessoncue:activity-participant:${code}`) || "", run.joinCode);
    const rejectedWhileLocked = await participantAction(page, run.runId, secondToken, "buzz");
    expect(rejectedWhileLocked.status).toBe(400);

    await hostAction(page, run.runId, "incorrect");
    await expect.poll(async () => (await runState(page, run.runId)).phase).toBe("acceptingResponses");
    const firstToken = await first.evaluate(code => localStorage.getItem(`lessoncue:activity-participant:${code}`) || "", run.joinCode);
    const lockedOut = await participantAction(page, run.runId, firstToken, "buzz");
    expect(lockedOut.status).toBe(400);
    const secondBuzz = await participantAction(page, run.runId, secondToken, "buzz");
    expect(secondBuzz.status).toBe(200);
    await hostAction(page, run.runId, "correct");

    const state = await hostState(page, run.runId);
    expect(state.scoreEvents.some(event => event.amount === 100)).toBe(true);
    expect((await runState(page, run.runId)).phase).toBe("reveal");
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("Existing game engines can run an embedded server-authoritative utility", async ({ page }) => {
  await authenticate(page);
  const definition = await page.evaluate(async () => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Embedded Utility ${Date.now()}`, type: "buzzer", config: { title: "Embedded Utility", clues: [{ id: "c1", prompt: "Clue", answer: "Answer", points: 100 }], embeddedUtility: { utilityType: "dice", diceSides: 6 } } })
    });
    if (!response.ok) throw new Error(await response.text());
    return await response.json() as { id: string };
  });
  try {
    const run = await launch(page, definition.id);
    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "utility.roll");
    const state = await runState(page, run.runId);
    expect((state.embeddedUtilityState as { result: { kind: string; value: number } }).result.kind).toBe("dice");
    expect((state.embeddedUtilityState as { result: { kind: string; value: number } }).result.value).toBeGreaterThanOrEqual(1);
    expect((state.embeddedUtilityState as { result: { kind: string; value: number } }).result.value).toBeLessThanOrEqual(6);
  } finally {
    await page.evaluate(async id => {
      await fetch("/api/v1/activities/bulk-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
    }, definition.id);
  }
});

test("Fake Out keeps truth hidden as a label, moderates bluffs, and scores truth picks", async ({ page, browser }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Fake Out", "Browser Fake Out Vertical Slice");
  const run = await launch(page, definitionId);
  const baseURL = new URL(page.url()).origin;
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    for (const [participantPage, name] of [[first, "Alex"], [second, "Jordan"]] as const) {
      await participantPage.goto(`/play/${run.joinCode}`);
      await participantPage.getByLabel("Display name").fill(name);
      await participantPage.getByRole("button", { name: "Join game" }).click();
      await expect(participantPage.getByText("You’re in.")).toBeVisible();
    }

    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "open");
    for (const [participantPage, answer] of [[first, "A believable fake"], [second, "Another believable fake"]] as const) {
      await expect(participantPage.locator("textarea")).toBeVisible();
      await participantPage.locator("textarea").fill(answer);
      await participantPage.getByRole("button", { name: "Send response" }).click();
    }
    await expect.poll(async () => (await hostState(page, run.runId)).submissions.length).toBe(2);
    const pending = await hostState(page, run.runId);
    expect(pending.submissions.every(item => item.moderationStatus === "pending")).toBe(true);
    for (const submission of pending.submissions) await hostAction(page, run.runId, "moderate", { submissionId: submission.id, status: "approved" });

    await hostAction(page, run.runId, "lock");
    await hostAction(page, run.runId, "openvoting");
    const beforeReveal = await runState(page, run.runId);
    expect((beforeReveal.options as Array<{ isTruth?: boolean }>).some(option => option.isTruth === true)).toBe(false);
    for (const participantPage of [first, second]) {
      await expect(participantPage.locator(".participant-choice-list")).toBeVisible();
      await participantPage.locator(".participant-choice-list button").last().click();
    }
    await hostAction(page, run.runId, "reveal");
    const afterReveal = await runState(page, run.runId);
    expect((afterReveal.options as Array<{ isTruth?: boolean }>).some(option => option.isTruth === true)).toBe(true);
    const state = await hostState(page, run.runId);
    expect(state.scoreEvents.filter(event => event.amount === 100)).toHaveLength(2);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("Survey Showdown supports team turns, strikes, conservative matching, and a steal", async ({ page, browser }) => {
  await authenticate(page);
  const definition = await page.evaluate(async () => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Browser Survey Showdown",
        type: "surveyBoard",
        config: {
          title: "Browser Survey Showdown",
          teamPlay: true,
          stealEnabled: true,
          strikesToSteal: 3,
          questions: [{
            id: "question-1",
            prompt: "Name a fruit people pack for lunch.",
            answers: [
              { id: "answer-1", rank: 1, text: "Apples", points: 40, aliases: ["apple"] },
              { id: "answer-2", rank: 2, text: "Bananas", points: 30, aliases: ["banana"] },
            ],
          }],
        },
      }),
    });
    const body = await response.json() as { id: string };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  const run = await launch(page, definition.id);
  const baseURL = new URL(page.url()).origin;
  const northContext = await browser.newContext({ baseURL });
  const southContext = await browser.newContext({ baseURL });
  const north = await northContext.newPage();
  const south = await southContext.newPage();
  try {
    for (const [participantPage, name] of [[north, "North Player"], [south, "South Player"]] as const) {
      await participantPage.goto(`/play/${run.joinCode}`);
      await participantPage.getByLabel("Display name").fill(name);
      await participantPage.getByRole("button", { name: "Join game" }).click();
      await expect(participantPage.getByText("You’re in.")).toBeVisible();
    }

    await page.evaluate(async runId => {
      const response = await fetch(`/api/v1/activity-sessions/${runId}/teams`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify([{ name: "North" }, { name: "South" }]) });
      if (!response.ok) throw new Error(await response.text());
    }, run.runId);
    let session = await hostState(page, run.runId);
    const northTeam = session.teams.find(team => team.name === "North");
    const southTeam = session.teams.find(team => team.name === "South");
    const northPlayer = session.participants.find(participant => participant.displayName === "North Player");
    const southPlayer = session.participants.find(participant => participant.displayName === "South Player");
    expect(northTeam?.id).toBeTruthy();
    expect(southTeam?.id).toBeTruthy();
    await page.evaluate(async ({ runId, participantId, teamId }) => {
      const response = await fetch(`/api/v1/activity-sessions/${runId}/participants/team`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId, teamId }) });
      if (!response.ok) throw new Error(await response.text());
    }, { runId: run.runId, participantId: northPlayer?.id, teamId: northTeam?.id });
    await page.evaluate(async ({ runId, participantId, teamId }) => {
      const response = await fetch(`/api/v1/activity-sessions/${runId}/participants/team`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId, teamId }) });
      if (!response.ok) throw new Error(await response.text());
    }, { runId: run.runId, participantId: southPlayer?.id, teamId: southTeam?.id });

    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "open");
    await expect(north.locator("textarea")).toBeVisible();
    await north.locator("textarea").fill("Pears");
    await north.getByRole("button", { name: "Send response" }).click();
    await hostAction(page, run.runId, "addstrike");
    await hostAction(page, run.runId, "addstrike");
    await hostAction(page, run.runId, "addstrike");
    session = await hostState(page, run.runId);
    expect(session.state.state.stealOpen).toBe(true);
    expect(session.state.state.stealTeamName).toBe("South");
    await south.reload();
    const southView = await south.evaluate(async runId => {
      const code = location.pathname.split("/")[2] || "";
      const token = localStorage.getItem(`lessoncue:activity-participant:${code}`) || "";
      return fetch(`/api/v1/activity-sessions/${runId}/participant-state?participantToken=${encodeURIComponent(token)}`).then(response => response.json()) as Promise<{ state: { state: Record<string, unknown> } }>;
    }, run.runId);
    expect(southView.state.state.isActiveTeam).toBe(true);
    await expect(south.locator("textarea")).toBeVisible();
    await south.locator("textarea").fill("Banana");
    await south.getByRole("button", { name: "Send response" }).click();
    await hostAction(page, run.runId, "suggestmatch");
    session = await hostState(page, run.runId);
    const suggestions = session.state.state.surveyMatchSuggestions as Array<{ rank: number; confidence: number }>;
    expect(suggestions[0]?.rank).toBe(2);
    expect(suggestions[0]?.confidence).toBeGreaterThanOrEqual(90);
    await hostAction(page, run.runId, "revealitem", { rank: 2 });
    session = await hostState(page, run.runId);
    const stealScore = session.teams.find(team => team.name === "South")?.score || 0;
    expect(stealScore).toBe(30);
    expect((await runState(page, run.runId)).stealOpen).toBe(false);
  } finally {
    await northContext.close();
    await southContext.close();
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

test("Match Minds supports private text answers on phone controllers", async ({ page, browser }) => {
  await authenticate(page);
  const definition = await page.evaluate(async () => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Browser Text Match Minds",
        type: "matchPlayer",
        config: {
          title: "Browser Text Match Minds",
          rounds: [{ id: "round-1", prompt: "Name a favorite animal", answerMode: "text", points: 100 }],
        },
      }),
    });
    const body = await response.json() as { id: string };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  const run = await launch(page, definition.id);
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
    await target.locator("textarea").fill("  red   panda ");
    await target.getByRole("button", { name: "Lock in answer" }).click();
    await predictor.locator("textarea").fill("red panda");
    await predictor.getByRole("button", { name: "Lock in answer" }).click();
    await hostAction(page, run.runId, "lock");
    await hostAction(page, run.runId, "reveal");
    await expect(predictor.getByText("Reveal time.")).toBeVisible();
    expect((await hostState(page, run.runId)).scoreEvents.some(event => event.amount === 100)).toBe(true);
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

test("Stage Challenge can take an audience call before the host reveals", async ({ page, browser }) => {
  await authenticate(page);
  const definition = await page.evaluate(async () => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Browser Audience Stage Challenge",
        type: "stageChallenge",
        config: {
          title: "Browser Audience Stage Challenge",
          audienceVoting: true,
          audienceVotePoints: 15,
          challenges: [{ id: "challenge-1", title: "Balance a banana", instructions: "Keep it balanced.", seconds: 10, points: 125 }],
        },
      }),
    });
    const body = await response.json() as { id: string };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  const run = await launch(page, definition.id);
  const baseURL = new URL(page.url()).origin;
  const contestantContext = await browser.newContext({ baseURL });
  const voterContext = await browser.newContext({ baseURL });
  const contestant = await contestantContext.newPage();
  const voter = await voterContext.newPage();
  try {
    for (const [participantPage, name] of [[contestant, "Contestant"], [voter, "Voter"]] as const) {
      await participantPage.goto(`/play/${run.joinCode}`);
      await participantPage.getByLabel("Display name").fill(name);
      await participantPage.getByRole("button", { name: "Join game" }).click();
      await expect(participantPage.getByText("You’re in.")).toBeVisible();
    }
    const lobby = await hostState(page, run.runId);
    const contestantId = lobby.participants.find(participant => participant.displayName === "Contestant")?.id;
    expect(contestantId).toBeTruthy();
    await hostAction(page, run.runId, "start");
    await hostAction(page, run.runId, "selectcontestant", { participantId: contestantId });
    await hostAction(page, run.runId, "starttimer");
    await hostAction(page, run.runId, "pausetimer");
    await hostAction(page, run.runId, "openaudiencevote");
    await expect(voter.getByText("CALL THE CHALLENGE")).toBeVisible();
    await voter.getByRole("button", { name: "Success" }).click();
    await hostAction(page, run.runId, "closeaudiencevote");
    await hostAction(page, run.runId, "useaudiencevote");
    await expect(voter.getByText("Reveal time.")).toBeVisible();
    const state = await hostState(page, run.runId);
    expect(state.scoreEvents.some(event => event.amount === 125)).toBe(true);
    expect(state.scoreEvents.some(event => event.amount === 15)).toBe(true);
  } finally {
    await contestantContext.close();
    await voterContext.close();
  }
});

test("Bracket Battle carries phone votes through semifinals and a final", async ({ page, browser }) => {
  await authenticate(page);
  const definition = await page.evaluate(async () => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Browser Bracket Battle",
        type: "bracket",
        config: {
          title: "Browser Bracket Battle",
          entrants: [
            { id: "a", label: "Alpha" },
            { id: "b", label: "Beta" },
            { id: "c", label: "Gamma" },
            { id: "d", label: "Delta" },
          ],
          pointsPerWin: 10,
        },
      }),
    });
    const body = await response.json() as { id: string };
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  const run = await launch(page, definition.id);
  const baseURL = new URL(page.url()).origin;
  const firstVoterContext = await browser.newContext({ baseURL });
  const secondVoterContext = await browser.newContext({ baseURL });
  const firstVoter = await firstVoterContext.newPage();
  const secondVoter = await secondVoterContext.newPage();
  try {
    for (const [participantPage, name] of [[firstVoter, "First Voter"], [secondVoter, "Second Voter"]] as const) {
      await participantPage.goto(`/play/${run.joinCode}`);
      await participantPage.getByLabel("Display name").fill(name);
      await participantPage.getByRole("button", { name: "Join game" }).click();
      await expect(participantPage.getByText("You’re in.")).toBeVisible();
    }

    const playMatch = async (winnerId: string, expectRound: number) => {
      await hostAction(page, run.runId, "open");
      await expect(firstVoter.getByText("VOTE TO ADVANCE")).toBeVisible();
      await expect(firstVoter.locator(".participant-choice-list button")).toHaveCount(2);
      await firstVoter.locator(".participant-choice-list button").first().click();
      await secondVoter.locator(".participant-choice-list button").first().click();
      await hostAction(page, run.runId, "close");
      await hostAction(page, run.runId, "reveal", { winnerId });
      await expect(firstVoter.getByText("Reveal time.")).toBeVisible();
      const revealed = await runState(page, run.runId);
      expect(revealed.phase).toBe("reveal");
      expect(revealed.currentRound).toBe(expectRound);
      await hostAction(page, run.runId, "next");
    };

    await hostAction(page, run.runId, "start");
    await playMatch("a", 1);
    await playMatch("c", 1);
    await playMatch("a", 2);
    const final = await runState(page, run.runId);
    expect(final.phase).toBe("finalResults");
    expect(final.bracketChampionId).toBe("a");
  } finally {
    await firstVoterContext.close();
    await secondVoterContext.close();
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

  await hostAction(page, run.runId, "randomize");
  await hostAction(page, run.runId, "starttimer");
  state = await runState(page, run.runId);
  expect(state.challengeStatus).toBe("running");
  expect(state.timerDurationMs).toBe(30000);
  await hostAction(page, run.runId, "pausetimer");
  expect((await runState(page, run.runId)).challengeStatus).toBe("paused");
  await hostAction(page, run.runId, "resumetimer");
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

test("Activity controller shows live recovery state and command acknowledgements", async ({ page }) => {
  await authenticate(page);
  const definitionId = await createActivity(page, "Trivia Quiz", "Browser Controller Recovery Activity");
  const prepared = await page.evaluate(async activityDefinitionId => {
    const headers = { "Content-Type": "application/json" };
    const lessons = await fetch("/api/v1/lessons").then(response => response.json()) as Array<{
      id: string; classId: string; title: string; items: Array<{ position: number }>;
    }>;
    const lesson = lessons.find(item => item.title === "Sample Lesson") || lessons[0];
    if (!lesson) throw new Error("The browser test lesson is unavailable.");
    const position = Math.max(0, ...lesson.items.map(item => item.position)) + 1000;
    const itemResponse = await fetch(`/api/v1/lessons/${lesson.id}/items`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Browser Controller Recovery Activity",
        type: "activity",
        role: "lesson",
        position,
        mediaId: null,
        activityDefinitionId,
        durationMs: null,
        startMs: 0,
        endMs: null,
        volumePercent: 100,
        imageDurationSeconds: null,
        estimatedDurationSeconds: 60,
        endBehavior: "pause",
        allowSkip: true,
      }),
    });
    if (!itemResponse.ok) throw new Error(await itemResponse.text());
    const item = await itemResponse.json() as { id: string };
    const bootstrap = await fetch("/api/v1/admin/bootstrap").then(response => response.json()) as { pairingPin: string };
    const pairing = await fetch("/api/v1/pairing/request", {
      method: "POST", headers,
      body: JSON.stringify({ deviceName: "Browser Activity Controller TV", platform: "android-tv", appVersion: "0.40.47" }),
    }).then(response => response.json()) as { requestId: string };
    const identity = await fetch("/api/v1/pairing/confirm", {
      method: "POST", headers,
      body: JSON.stringify({ requestId: pairing.requestId, pin: bootstrap.pairingPin }),
    }).then(response => response.json()) as { screenId: string; deviceToken: string };
    const assignment = await fetch(`/api/v1/screens/${identity.screenId}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ assignedClassId: lesson.classId, allowUnsupportedContent: true }),
    });
    if (!assignment.ok) throw new Error(await assignment.text());
    const status = await fetch("/api/v1/tv/status", {
      method: "POST",
      headers: { ...headers, Authorization: `Bearer ${identity.deviceToken}` },
      body: JSON.stringify({
        screenId: identity.screenId,
        appVersion: "0.40.47",
        online: true,
        freeBytes: 4_000_000_000,
        manifestVersion: 1,
        failedDownloads: 0,
        playbackState: "playing",
        lessonId: lesson.id,
        itemId: item.id,
        positionMs: 0,
        durationMs: 60_000,
      }),
    });
    if (!status.ok) throw new Error(await status.text());
    return { screenId: identity.screenId };
  }, definitionId);

  const pinResponse = await page.evaluate(async () => (await fetch("/api/v1/controller-pin", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: "482731" }),
  })).ok);
  expect(pinResponse).toBe(true);
  await page.goto("/universalremote");
  await page.getByLabel("Six-digit controller PIN").fill("482731");
  await page.getByRole("button", { name: "Open universal remote" }).click();
  await page.getByLabel("Control this screen").selectOption(prepared.screenId);
  const activityController = page.locator(".activity-controller-shell");
  await expect(activityController.getByText("Browser Controller Recovery Activity", { exact: true })).toBeVisible();
  await expect(activityController.getByRole("button", { name: "Refresh activity controller" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Activity connection: Live connection" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Open answers/ }).click();
  await expect(page.locator(".activity-command-notice")).toContainText(/openresponses sent · revision \d+/i);
  await activityController.getByRole("button", { name: "Refresh activity controller" }).click();
  await expect(activityController.getByRole("button", { name: "Refresh activity controller" })).toBeEnabled();
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

  const librarySearch = page.getByPlaceholder("Name, description, or game type");
  await librarySearch.fill(activityTag);
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByText(triviaName, { exact: true })).toBeVisible();
  await expect(page.getByText(bracketName, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("lessoncue.activityView"))).toBe("list");

  await page.getByLabel("Game family").selectOption("quiz");
  await expect(page.getByText(triviaName, { exact: true })).toBeVisible();
  await expect(page.getByText(bracketName, { exact: true })).toHaveCount(0);
  await page.getByLabel("Game family").selectOption("all");

  await librarySearch.fill("");
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  const libraryCountText = await page.locator(".activity-library-count").innerText();
  if (/Page 1 of 1/.test(libraryCountText)) {
    await expect(page.getByRole("button", { name: new RegExp(`Move ${triviaName} later`) })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`Move ${triviaName} later`) }).click();
    await expect(page.getByRole("status")).toContainText("Activity order saved.");
    await page.getByRole("button", { name: "Done arranging" }).click();
  } else {
    await expect(page.getByRole("status")).toContainText("Arrange is available when the full library fits on one page");
  }

  await page.getByRole("button", { name: "Grid view" }).click();
  await librarySearch.fill(activityTag);
  await expect(page.getByText("Not used in lessons").first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ })).toBeVisible();
  await page.getByRole("button", { name: /Activities$/ }).click();
  await expect(page.locator(".activity-library-grid")).toBeVisible();
  await page.getByPlaceholder("Name, description, or game type").fill(activityTag);

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

test("Activities library exposes bounded server-side pages for large collections", async ({ page }) => {
  await authenticate(page);
  const tag = Date.now();
  const ids = await page.evaluate(async tagValue => {
    const ids: string[] = [];
    for (const suffix of ["One", "Two"]) {
      const response = await fetch("/api/v1/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Paged Activity ${tagValue} ${suffix}`, type: "trivia", config: { title: "Paged", questions: [{ id: "q1", prompt: "Pick", options: ["A", "B"], correctIndex: 0 }] } })
      });
      if (!response.ok) throw new Error(await response.text());
      ids.push((await response.json() as { id: string }).id);
    }
    return ids;
  }, tag);
  try {
    const pageResult = await page.evaluate(async tagValue => {
      const response = await fetch(`/api/v1/activities/library?page=1&pageSize=1&search=${encodeURIComponent(`Paged Activity ${tagValue}`)}`);
      return { status: response.status, body: await response.json() as { items: Array<{ name: string }>; page: number; pageSize: number; totalCount: number } };
    }, tag);
    expect(pageResult.status).toBe(200);
    expect(pageResult.body.page).toBe(1);
    expect(pageResult.body.pageSize).toBe(1);
    expect(pageResult.body.items).toHaveLength(1);
    expect(pageResult.body.totalCount).toBe(2);
  } finally {
    await page.evaluate(async idsToDelete => {
      await fetch("/api/v1/activities/bulk-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: idsToDelete }) });
    }, ids);
  }
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
    await expect(page.getByRole("option", { name: "Which Came First?", exact: true })).toBeAttached();
    await page.getByLabel("Quiz format preset").selectOption("factOrFiction");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.locator("textarea").nth(1)).toHaveValue("A day on Venus is longer than a year on Venus.");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedQuiz = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; questions: Array<{ options: string[] }> } }, quizId);
    expect(savedQuiz.presetType).toBe("factOrFiction");
    expect(savedQuiz.config.preset).toBe("factOrFiction");
    expect(savedQuiz.config.questions[0].options).toHaveLength(2);

    await page.getByLabel("Quiz format preset").selectOption("guessTheNumber");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.getByLabel("Answer format")).toHaveValue("number");
    await expect(page.getByLabel("Target number")).toHaveValue("42");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    const savedNumberQuiz = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { config: { preset: string; questions: Array<{ answerMode: string; targetNumber: number }> } }, quizId);
    expect(savedNumberQuiz.config.preset).toBe("guessTheNumber");
    expect(savedNumberQuiz.config.questions[0].answerMode).toBe("number");
    expect(savedNumberQuiz.config.questions[0].targetNumber).toBe(42);

    await page.getByRole("button", { name: "Close", exact: true }).click();
    pollId = await createActivity(page, "Live Poll", pollName);
    await expect(page.getByRole("option", { name: "Prediction Machine", exact: true })).toBeAttached();
    await page.getByLabel("Poll format preset").selectOption("wouldYouRather");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.getByLabel("Poll question")).toHaveValue("Would you rather be 30 minutes early or 5 minutes late?");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedPoll = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; options: string[] } }, pollId);
    expect(savedPoll.presetType).toBe("wouldYouRather");
    expect(savedPoll.config.preset).toBe("wouldYouRather");
    expect(savedPoll.config.options).toHaveLength(2);

    await page.getByLabel("Poll format preset").selectOption("thisOrThatGauntlet");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.getByRole("button", { name: "Round 3", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    const savedGauntlet = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { presetType: string; config: { preset: string; rounds: Array<{ options: string[] }> } }, pollId);
    expect(savedGauntlet.presetType).toBe("thisOrThatGauntlet");
    expect(savedGauntlet.config.preset).toBe("thisOrThatGauntlet");
    expect(savedGauntlet.config.rounds).toHaveLength(3);
    expect(savedGauntlet.config.rounds[2].options).toHaveLength(2);

    await page.getByLabel("Poll format preset").selectOption("wouldYouRather");
    await page.getByRole("button", { name: "Apply preset template", exact: true }).click();
    await expect(page.getByRole("button", { name: "Round 3", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    const savedSingleRound = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { config: { preset: string; rounds?: unknown[] } }, pollId);
    expect(savedSingleRound.config.preset).toBe("wouldYouRather");
    expect(savedSingleRound.config.rounds).toBeUndefined();
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
    await expect(page.getByRole("option", { name: "Secret Category", exact: true })).toBeAttached();
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
    await expect(page.getByRole("option", { name: "Explain It Badly", exact: true })).toBeAttached();
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
    await expect(page.locator("#image-reveal-total-stages")).toHaveValue("5");
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

test("Adventure and observation presets expose their differentiated editor surfaces", async ({ page }) => {
  await authenticate(page);
  const tag = Date.now();
  const adventureId = await createActivity(page, "Adventure", `Browser Adventure ${tag}`);
  let differenceId = "";
  let emojiId = "";
  let rebusId = "";
  try {
    await expect(page.getByText("Adventure story map", { exact: true })).toBeVisible();
    await expect(page.getByText("Story branches", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Round 1 choice 1 destination")).toHaveValue("node-2");
    await page.getByLabel("Round 1 node type").selectOption("media");
    await expect(page.getByLabel("Round 1 media URL")).toBeVisible();
    await page.getByLabel("Round 1 node type").selectOption("score");
    await expect(page.getByLabel("Score effect")).toBeVisible();
    await page.getByLabel("Round 1 node type").selectOption("condition");
    await expect(page.getByLabel("Round 1 true destination")).toBeVisible();
    await page.getByLabel("Round 1 node type").selectOption("choice");
    await page.getByLabel("Round 1 choice 1 destination").selectOption("__end__");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    await expect(page.locator(".activity-library-status")).toContainText("Activity saved.");
    const savedAdventure = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { config: { adventure: boolean; rounds: Array<{ id: string; branches: Record<string, string> }> } }, adventureId);
    expect(savedAdventure.config.adventure).toBe(true);
    expect(savedAdventure.config.rounds[0].branches["0"]).toBe("__end__");

    await page.getByRole("button", { name: "Close", exact: true }).click();
    differenceId = await createActivity(page, "What's Different?", `Browser Difference ${tag}`);
    await expect(page.getByText("What's Different? clue", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Media round type")).toHaveValue("difference");
    await page.getByLabel("Second image URL").fill("/api/v1/media/second-safari-scene");
    await page.getByRole("button", { name: "Save activity", exact: true }).click();
    const savedDifference = await page.evaluate(async id => (await fetch(`/api/v1/activities/${id}`)).json() as { config: { mediaMode: string; comparisonImageUrl: string } }, differenceId);
    expect(savedDifference.config.mediaMode).toBe("difference");
    expect(savedDifference.config.comparisonImageUrl).toBe("/api/v1/media/second-safari-scene");

    await page.getByRole("button", { name: "Close", exact: true }).click();
    emojiId = await createActivity(page, "Emoji Decode", `Browser Emoji ${tag}`);
    await expect(page.getByText("Emoji Decode clue", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Emoji clue" })).toHaveValue("🐢🏁");

    await page.getByRole("button", { name: "Close", exact: true }).click();
    rebusId = await createActivity(page, "Rebus Rush", `Browser Rebus ${tag}`);
    await expect(page.getByText("Rebus Rush clue", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Rebus clue" })).toHaveValue("🦊 + 🕳️");
  } finally {
    await page.evaluate(async ids => {
      await fetch("/api/v1/activities/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.filter(Boolean) }),
      });
    }, [adventureId, differenceId, emojiId, rebusId]);
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
