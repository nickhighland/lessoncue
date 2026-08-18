import { expect, test, type Page } from "@playwright/test";

// Each engine and named preset carries its own colour identity, and a theme a
// teacher actually customised always wins over the generated palette.

test.use({ serviceWorkers: "block" });

type Stub = { type: string; preset?: string; theme?: Record<string, string> };

function envelope(runId: string, { type, preset, theme }: Stub) {
  return {
    runId,
    definitionId: `${runId}-definition`,
    type,
    revision: 1,
    status: "prepared",
    serverTime: "2026-08-17T12:00:00Z",
    name: `${type} stage`,
    ...(theme ? { theme } : {}),
    config: {
      title: `${type} stage`,
      ...(preset ? { preset } : {}),
      questions: [{ id: "q1", prompt: "Sample prompt.", options: ["A", "B"], correctIndex: 0 }],
      rounds: [{ id: "r1", prompt: "Sample prompt.", items: [] }],
      items: [{ id: "i1", label: "One", weight: 1 }, { id: "i2", label: "Two", weight: 1 }],
    },
    state: { phase: "lobby", currentQuestionIndex: 0, currentRoundIndex: 0, items: [], removedIds: [], spinCount: 0 },
  };
}

async function stageColors(page: Page, runId: string, stub: Stub) {
  await page.route(`**/api/v1/activity-runs/${runId}`, route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(envelope(runId, stub)),
  }));
  await page.goto(`/activity-display?runId=${runId}`);
  const root = page.locator('.activity-display-root[data-activity-status="ready"]');
  await expect(root).toBeVisible();
  return root.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      primary: style.getPropertyValue("--act-stage-primary").trim(),
      secondary: style.getPropertyValue("--act-stage-secondary").trim(),
      accent: style.getPropertyValue("--act-stage-accent").trim(),
      background: style.getPropertyValue("--act-stage-bg").trim(),
    };
  });
}

test("every engine gets its own stage palette", async ({ page }) => {
  const types = ["trivia", "poll", "buzzer", "punchline", "drawing", "word", "imageReveal", "physicalRoom"];
  const seen = new Map<string, string>();

  for (const type of types) {
    const colors = await stageColors(page, `palette-${type}`, { type });
    for (const [key, value] of Object.entries(colors)) {
      expect(value, `${type} ${key} should be set`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    const signature = `${colors.primary}|${colors.accent}|${colors.background}`;
    const clash = seen.get(signature);
    expect(clash, `${type} reuses the palette already used by ${clash}`).toBeUndefined();
    seen.set(signature, type);
  }
  expect(seen.size).toBe(types.length);
});

test("named presets vary within their engine's family", async ({ page }) => {
  const trivia = await stageColors(page, "palette-preset-base", { type: "trivia" });
  const wager = await stageColors(page, "palette-preset-wager", { type: "trivia", preset: "wagerTrivia" });
  const quote = await stageColors(page, "palette-preset-quote", { type: "trivia", preset: "finishTheQuote" });

  // Distinct from the bare engine and from each other…
  expect(wager.primary).not.toBe(trivia.primary);
  expect(quote.primary).not.toBe(trivia.primary);
  expect(wager.primary).not.toBe(quote.primary);

  // …but a preset is stable across loads, not random per render.
  const wagerAgain = await stageColors(page, "palette-preset-wager-again", { type: "trivia", preset: "wagerTrivia" });
  expect(wagerAgain).toEqual(wager);
});

test("a teacher's customised theme overrides the generated palette", async ({ page }) => {
  const custom = await stageColors(page, "palette-custom", {
    type: "trivia",
    preset: "wagerTrivia",
    theme: {
      preset: "stage",
      primaryColor: "#123456",
      secondaryColor: "#654321",
      accentColor: "#abcdef",
      backgroundColor: "#010203",
      textColor: "#ffffff",
    },
  });
  expect(custom).toEqual({
    primary: "#123456",
    secondary: "#654321",
    accent: "#abcdef",
    background: "#010203",
  });
});

test("an untouched shared preset is upgraded to the game's own palette", async ({ page }) => {
  // Every existing definition was seeded from one of six shared themes. Those
  // are safe to replace; only a real customisation is preserved.
  const stageDefault = await stageColors(page, "palette-legacy", {
    type: "buzzer",
    theme: {
      preset: "stage",
      primaryColor: "#2a6e4a",
      secondaryColor: "#2563eb",
      accentColor: "#f59e0b",
      backgroundColor: "#091c1d",
      textColor: "#ffffff",
    },
  });
  const generated = await stageColors(page, "palette-buzzer", { type: "buzzer" });
  expect(stageDefault).toEqual(generated);
  expect(stageDefault.primary).not.toBe("#2a6e4a");
});
