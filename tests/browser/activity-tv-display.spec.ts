import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const wheelEnvelope = {
  runId: "tv-wheel-test",
  definitionId: "wheel-definition",
  type: "wheel",
  revision: 1,
  status: "prepared",
  serverTime: "2026-08-16T12:00:00Z",
  name: "Safari Spin",
  theme: {
    preset: "stage",
    primaryColor: "#16a34a",
    secondaryColor: "#2563eb",
    accentColor: "#fbbf24",
    backgroundColor: "#062a24",
    textColor: "#ffffff",
  },
  config: {
    title: "Safari Spin",
    subtitle: "Spin for an animal challenge",
    items: [
      { id: "parrot", label: "Parrot Party", weight: 1, color: "#f59e0b" },
      { id: "otter", label: "Otter Antics", weight: 1, color: "#06b6d4" },
      { id: "tiger", label: "Tiger Time", weight: 1, color: "#ef4444" },
      { id: "panda", label: "Panda Parade", weight: 1, color: "#8b5cf6" },
    ],
  },
  state: {
    items: [
      { id: "parrot", label: "Parrot Party", weight: 1, color: "#f59e0b" },
      { id: "otter", label: "Otter Antics", weight: 1, color: "#06b6d4" },
      { id: "tiger", label: "Tiger Time", weight: 1, color: "#ef4444" },
      { id: "panda", label: "Panda Parade", weight: 1, color: "#8b5cf6" },
    ],
    removedIds: [],
    spinCount: 0,
  },
};

const compactStageEnvelopes = {
  "tv-scoreboard-test": {
    ...wheelEnvelope,
    runId: "tv-scoreboard-test",
    type: "scoreboard",
    name: "Jungle Jam Scoreboard",
    config: {
      title: "Jungle Jam Scoreboard",
      teams: [
        { id: "cats", name: "Canopy Cats", color: "#f97316", icon: "🐆" },
        { id: "reef", name: "Reef Runners", color: "#06b6d4", icon: "🐬" },
        { id: "burrow", name: "Burrow Brains", color: "#a78bfa", icon: "🐇" },
        { id: "sky", name: "Sky Squad", color: "#facc15", icon: "🦅" },
      ],
    },
    state: { teams: [
      { id: "cats", score: 0 }, { id: "reef", score: 0 },
      { id: "burrow", score: 0 }, { id: "sky", score: 0 },
    ] },
  },
  "tv-survey-test": {
    ...wheelEnvelope,
    runId: "tv-survey-test",
    type: "surveyBoard",
    name: "Survey Showdown: Animal Edition",
    config: {
      title: "Survey Showdown: Animal Edition",
      questions: [{
        prompt: "Name an animal people would love to see on a safari.",
        answers: Array.from({ length: 5 }, (_, index) => ({
          id: `answer-${index + 1}`, rank: index + 1, text: `Animal ${index + 1}`, points: 50 - index * 5,
        })),
      }],
    },
    state: { answers: [], currentQuestionIndex: 0, strikes: 0, strikeLimit: 3 },
  },
  "tv-ordering-test": {
    ...wheelEnvelope,
    runId: "tv-ordering-test",
    type: "ordering",
    name: "Order Up: Animal Superlatives",
    config: {
      title: "Order Up: Animal Superlatives",
      presetLabel: "ORDERING CHALLENGE",
      rounds: [{
        prompt: "Put these animals in order from smallest to largest by typical adult weight.",
        items: ["Mouse", "Rabbit", "Dog", "Elephant"].map((label, index) => ({ id: `animal-${index}`, label })),
      }],
    },
    state: { phase: "lobby", currentRoundIndex: 0, joinCode: "CMUBVB", participantCount: 0 },
  },
} as const;

test("dedicated TV Activity route fills a 1080p stage and draws the wheel", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route("**/api/v1/activity-runs/tv-wheel-test", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(wheelEnvelope) }));

  await page.goto("/activity-display?runId=tv-wheel-test");
  const root = page.locator('.activity-display-root[data-activity-status="ready"]');
  await expect(root).toBeVisible();
  await expect(root).toHaveAttribute("data-activity-type", "wheel");
  await expect(page.getByText("Safari Spin", { exact: true })).toBeVisible();

  const bounds = await root.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(1900);
  expect(bounds?.height).toBeGreaterThanOrEqual(1070);
  await expect.poll(() => page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
    visibleWidth: canvas.getBoundingClientRect().width,
    visibleHeight: canvas.getBoundingClientRect().height,
  }))).toMatchObject({
    width: expect.any(Number),
    height: expect.any(Number),
    visibleWidth: expect.any(Number),
    visibleHeight: expect.any(Number),
  });
  const canvasSize = await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => [
    canvas.width,
    canvas.height,
    canvas.getBoundingClientRect().width,
    canvas.getBoundingClientRect().height,
  ]);
  expect(Math.min(...canvasSize)).toBeGreaterThan(300);
  await expect(page.locator(".web-player-transport, .player-overlay")).toHaveCount(0);
});

test("wheel remains visible in the constrained CSS viewport used by Android TV WebView", async ({ page }) => {
  await page.setViewportSize({ width: 962, height: 541 });
  await page.route("**/api/v1/activity-runs/tv-wheel-test", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(wheelEnvelope) }));

  await page.goto("/activity-display?runId=tv-wheel-test");
  await expect(page.locator('.activity-display-root[data-activity-status="ready"]')).toBeVisible();
  await expect.poll(() => page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const bounds = canvas.getBoundingClientRect();
    return Math.min(bounds.width, bounds.height);
  })).toBeGreaterThan(250);
});

test("content-heavy game stages fit the constrained Android TV WebView viewport", async ({ page }) => {
  await page.setViewportSize({ width: 962, height: 541 });
  await page.route("**/api/v1/activity-runs/*", route => {
    const runId = new URL(route.request().url()).pathname.split("/").pop() as keyof typeof compactStageEnvelopes;
    const envelope = compactStageEnvelopes[runId];
    return envelope
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope) })
      : route.fallback();
  });

  for (const runId of Object.keys(compactStageEnvelopes)) {
    await page.goto(`/activity-display?runId=${runId}`);
    await expect(page.locator('.activity-display-root[data-activity-status="ready"]')).toBeVisible();
    const clippedText = await page.locator(".activity-stage").evaluate(stage =>
      [...stage.querySelectorAll<HTMLElement>("*")]
        .filter(element => {
          if (element.children.length || !element.textContent?.trim()) return false;
          const bounds = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return bounds.width > 10 && bounds.height > 10 && style.display !== "none" && style.visibility !== "hidden" &&
            (bounds.top < -2 || bounds.left < -2 || bounds.right > innerWidth + 2 || bounds.bottom > innerHeight + 2);
        })
        .map(element => element.textContent?.trim())
    );
    expect(clippedText, `${runId} clipped visible content`).toEqual([]);
  }
});

test("dedicated TV Activity route shows a recoverable error when the cue has no identity", async ({ page }) => {
  await page.goto("/activity-display");
  const error = page.getByRole("alert");
  await expect(error).toContainText("This Activity could not be identified");
  await expect(error).toContainText("launch the cue again");
});
