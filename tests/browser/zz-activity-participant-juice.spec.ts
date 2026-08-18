import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// The participant "game juice" layer: tactile button feedback, idle motion,
// the shared last-five-seconds panic state, and the sampled-audio path with
// its synthesized fallback. Presentation only — the server still owns phase,
// timing, and scoring, which these tests rely on rather than simulate.

test.use({ serviceWorkers: "block" });

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
    await page.getByLabel("Organization name").fill("Activity Juice Test");
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
  adminCookies = await page.context().cookies();
}

/**
 * Word Storm round. A 20s timer leaves a comfortable window on both sides of
 * the 5s panic threshold, so the assertions do not race the clock.
 */
function wordConfig(title: string, seconds: number) {
  return {
    title,
    rounds: [{ id: "round-1", prompt: "Name something fast.", category: "Speed", points: 10, seconds }],
    requireModeration: true,
    allowDuplicates: false,
    maxWords: 30,
    turnBased: false,
    eliminateOnDuplicate: false,
  };
}

async function createWordActivity(page: Page, name: string, seconds: number) {
  return page.evaluate(async ({ activityName, config }) => {
    const response = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: activityName, type: "word", description: "Juice coverage", config }),
    });
    const body = await response.json() as { id?: string; error?: string };
    if (!response.ok || !body.id) throw new Error(JSON.stringify(body));
    return body.id;
  }, { activityName: name, config: wordConfig(name, seconds) });
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

async function hostAction(page: Page, runId: string, action: string) {
  const result = await page.evaluate(async ({ id, command }) => {
    const response = await fetch(`/api/v1/activity-runs/${id}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: command, payload: null }),
    });
    return { status: response.status, body: await response.json() };
  }, { id: runId, command: action });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
}

async function joinAs(participant: Page, joinCode: string, name: string) {
  await participant.goto(`/play/${joinCode}`);
  await participant.getByLabel("Display name").fill(name);
  await participant.getByRole("button", { name: "Join game" }).click();
  await expect(participant.getByText("You’re in.")).toBeVisible();
}

/** Minimal valid PCM WAV. decodeAudioData sniffs the container, not the URL. */
function wavBytes(seconds: number, sampleRate = 8000) {
  const samples = Math.floor(seconds * sampleRate);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index++) {
    buffer.writeInt16LE(Math.round(Math.sin(index / 8) * 8000), 44 + index * 2);
  }
  return buffer;
}

test("the lobby preloads the documented audio paths and still plays with an empty sound pack", async ({ page, context }) => {
  await authenticate(page);
  const definitionId = await createWordActivity(page, "Juice Preload Check", 45);
  const run = await launch(page, definitionId);

  const participant = await context.newPage();
  const requested: string[] = [];
  participant.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/assets/games/")) requested.push(url.pathname);
  });

  try {
    await participant.goto(`/play/${run.joinCode}`);
    // Preload starts as soon as the lobby resolves, before the player joins.
    await expect.poll(() => requested.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect.poll(() => [...requested].sort()).toEqual(expect.arrayContaining([
      "/assets/games/word/audio/sfx/fx-confetti-pop.mp3",
      "/assets/games/word/audio/sfx/game-timer-alarm.mp3",
      "/assets/games/word/audio/sfx/game-timer-tick.mp3",
      "/assets/games/word/audio/sfx/ui-btn-hover.mp3",
      "/assets/games/word/audio/sfx/ui-btn-lock-in.mp3",
      "/assets/games/word/audio/sfx/ui-btn-select.mp3",
    ]));

    // Every one of those 404s in a stock install. The game must be unaffected.
    await joinAs(participant, run.joinCode, "Preloader");
    await expect(participant.locator(".participant-waiting")).toBeVisible();
  } finally {
    await participant.close();
  }
});

test("tapping a control squashes and springs back", async ({ page, context }) => {
  await authenticate(page);
  const definitionId = await createWordActivity(page, "Juice Squash Check", 45);
  const run = await launch(page, definitionId);

  const participant = await context.newPage();
  try {
    await joinAs(participant, run.joinCode, "Squasher");
    const leave = participant.getByRole("button", { name: "Leave this device" });
    await expect(leave).toHaveAttribute("data-juice", "idle");

    await leave.dispatchEvent("pointerdown");
    await expect(leave).toHaveAttribute("data-juice", "pressed");
    const pressedTransform = await leave.evaluate(node => getComputedStyle(node).transform);
    expect(pressedTransform, "pressed control should be scaled down").not.toBe("none");

    await leave.dispatchEvent("pointerup");
    await expect(leave).toHaveAttribute("data-juice", "released");
    // The release animation returns the control to rest on its own.
    await expect(leave).toHaveAttribute("data-juice", "idle", { timeout: 5_000 });
  } finally {
    await participant.close();
  }
});

test("phone controls keep chunky touch targets", async ({ page, context }) => {
  await authenticate(page);
  const definitionId = await createWordActivity(page, "Juice Target Check", 45);
  const run = await launch(page, definitionId);

  const participant = await context.newPage();
  try {
    await participant.setViewportSize({ width: 390, height: 844 });
    await participant.goto(`/play/${run.joinCode}`);
    const joinButton = participant.getByRole("button", { name: "Join game" });
    expect((await joinButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(60);

    await participant.getByLabel("Display name").fill("Thumbs");
    await joinButton.click();
    await expect(participant.getByText("You’re in.")).toBeVisible();

    await hostAction(page, run.runId, "open");
    const send = participant.getByRole("button", { name: "Send words" });
    await expect(send).toBeVisible();
    expect((await send.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(60);

    const leave = participant.getByRole("button", { name: "Leave this device" });
    expect((await leave.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  } finally {
    await participant.close();
  }
});

test("waiting states drift instead of sitting frozen", async ({ page, context }) => {
  await authenticate(page);
  const definitionId = await createWordActivity(page, "Juice Wobble Check", 45);
  const run = await launch(page, definitionId);

  const participant = await context.newPage();
  try {
    await joinAs(participant, run.joinCode, "Waiter");
    const orb = participant.locator(".participant-waiting .waiting-orb").first();
    const motion = await orb.evaluate(node => {
      const style = getComputedStyle(node);
      return {
        names: style.animationName,
        duration: style.animationDuration,
        delay: style.animationDelay,
        state: style.animationPlayState,
      };
    });
    expect(motion.names).toContain("lc-idle-wobble");
    expect(motion.state).toContain("running");
    // Seeded per participant so each element drifts on its own rhythm.
    expect(motion.delay).not.toBe("0s");
    expect(motion.duration).not.toBe("0s");
  } finally {
    await participant.close();
  }
});

test("the final five seconds put the phone into the shared panic state", async ({ page, context }) => {
  await authenticate(page);
  const definitionId = await createWordActivity(page, "Juice Panic Check", 20);
  const run = await launch(page, definitionId);

  const participant = await context.newPage();
  try {
    await joinAs(participant, run.joinCode, "Panicker");
    const shell = participant.locator("main.activity-participant-page");
    await expect(shell).toHaveAttribute("data-activity-panic", "false");

    await hostAction(page, run.runId, "open");

    // A 20s server timer crosses the 5s threshold 15s after opening.
    await expect(shell).toHaveAttribute("data-activity-panic", "true", { timeout: 30_000 });
    await expect(participant.locator("body.lc-panic")).toHaveCount(1);
    await expect(participant.locator(".activity-motion-countdown.panic")).toBeVisible();

    // Panic is a live-window state: it clears when the window closes.
    await expect(shell).toHaveAttribute("data-activity-panic", "false", { timeout: 15_000 });
    await expect(participant.locator("body.lc-panic")).toHaveCount(0);
  } finally {
    await participant.close();
  }
});

test("repeated taps vary the sampled pitch instead of sounding identical", async ({ page, context }) => {
  await authenticate(page);
  const definitionId = await createWordActivity(page, "Juice Pitch Check", 45);
  const run = await launch(page, definitionId);

  const participant = await context.newPage();
  try {
    // Serve a real sample so the decoded-buffer path — not the synthesized
    // fallback — is the one under test. 0.25s is distinct from every
    // synthesized buffer, so the spy can isolate it.
    await participant.route("**/assets/games/**/sfx/ui-btn-select.mp3", route => route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: wavBytes(0.25),
    }));

    await participant.addInitScript(() => {
      const store: Array<{ rate: number; duration: number }> = [];
      (window as unknown as { __lcSfx: typeof store }).__lcSfx = store;
      const proto = window.AudioContext?.prototype;
      if (!proto) return;
      const create = proto.createBufferSource;
      proto.createBufferSource = function patched(this: AudioContext) {
        const node = create.call(this);
        const start = node.start.bind(node);
        node.start = ((...args: [number?, number?, number?]) => {
          store.push({ rate: node.playbackRate.value, duration: node.buffer?.duration ?? 0 });
          return start(...args);
        }) as typeof node.start;
        return node;
      };
    });

    await joinAs(participant, run.joinCode, "Tapper");
    const leave = participant.getByRole("button", { name: "Leave this device" });

    // Pointer-down only: this fires the tap cue without activating the button.
    const sampled = () => participant.evaluate(() =>
      (window as unknown as { __lcSfx: Array<{ rate: number; duration: number }> }).__lcSfx
        .filter(entry => entry.duration > 0.2 && entry.duration < 0.3)
        .map(entry => entry.rate));

    await expect.poll(async () => {
      await leave.dispatchEvent("pointerdown");
      await leave.dispatchEvent("pointerup");
      return (await sampled()).length;
    }, { timeout: 20_000 }).toBeGreaterThanOrEqual(8);

    const rates = await sampled();
    for (const rate of rates) {
      expect(rate, `playback rate ${rate} outside the 0.85–1.15 range`).toBeGreaterThanOrEqual(0.85);
      expect(rate, `playback rate ${rate} outside the 0.85–1.15 range`).toBeLessThanOrEqual(1.15);
    }
    expect(new Set(rates.map(rate => rate.toFixed(4))).size, "pitch should vary between taps").toBeGreaterThan(1);
  } finally {
    await participant.close();
  }
});

test("the phone wears the same palette as the stage", async ({ page, context }) => {
  await authenticate(page);
  const definitionId = await createWordActivity(page, "Juice Palette Check", 45);
  const run = await launch(page, definitionId);

  const participant = await context.newPage();
  try {
    await joinAs(participant, run.joinCode, "Painter");
    const shell = participant.locator("main.activity-participant-page");
    await expect(shell).toHaveAttribute("data-activity-type", "word");

    const colors = await shell.evaluate(node => {
      const style = getComputedStyle(node);
      return {
        accent: style.getPropertyValue("--act-stage-accent").trim(),
        primary: style.getPropertyValue("--act-stage-primary").trim(),
      };
    });
    // The Word engine's own palette, not the old shared green-and-gold.
    expect(colors.primary).toBe("#56a329");
    expect(colors.accent).toBe("#31cff6");
    expect(colors.accent).not.toBe("#f2b943");

    // And the palette is actually painted, not just declared.
    const orb = participant.locator(".participant-waiting .waiting-orb").first();
    expect(await orb.evaluate(node => getComputedStyle(node).backgroundImage)).toContain("rgb(49, 207, 246)");
  } finally {
    await participant.close();
  }
});

test("the display owns the music bed so phones stay effects-only", async ({ page, context }) => {
  // Stubbed envelope: this covers the display's theme wiring, not a live run.
  const lobbyEnvelope = {
    runId: "juice-theme-test",
    definitionId: "juice-theme-definition",
    type: "ordering",
    revision: 1,
    status: "prepared",
    serverTime: "2026-08-17T12:00:00Z",
    name: "Theme Wiring Check",
    config: { title: "Theme Wiring Check", rounds: [{ prompt: "Order these.", items: [] }] },
    state: { phase: "lobby", currentRoundIndex: 0, joinCode: "THEMEA", participantCount: 0 },
  };

  await authenticate(page);
  const display = await context.newPage();
  const requested: string[] = [];
  display.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/assets/games/")) requested.push(url.pathname);
  });

  try {
    await display.route("**/api/v1/activity-runs/juice-theme-test", route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(lobbyEnvelope),
    }));
    await display.goto("/activity-display?runId=juice-theme-test");
    await expect(display.locator('.activity-display-root[data-activity-status="ready"]')).toBeVisible();

    // The lobby music bed is requested by the shared display, not the phones.
    await expect.poll(() => requested, { timeout: 15_000 })
      .toContain("/assets/games/ordering/audio/themes/intro-theme.mp3");
  } finally {
    await display.close();
  }
});

test("the stage plays a lobby bed, an opening sting, and a closing sting", async ({ page, context }) => {
  await authenticate(page);
  const definitionId = await createWordActivity(page, "Juice Sting Check", 45);
  const run = await launch(page, definitionId);

  // Shares the admin session, so the display can read the authoritative run.
  const display = await context.newPage();
  try {
    // Serve real audio so the theme cues actually resolve. Preload probes every
    // theme URL up front, so fetches prove nothing about ordering — playback
    // attempts do, which is what this spy records.
    await display.route("**/assets/games/**/themes/*.mp3", route => route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: wavBytes(0.25),
    }));
    await display.addInitScript(() => {
      const played: string[] = [];
      (window as unknown as { __lcThemes: string[] }).__lcThemes = played;
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function patched(this: HTMLMediaElement) {
        played.push(new URL(this.src, location.href).pathname.split("/").pop() || "");
        // Autoplay may be refused without a gesture; the attempt is the signal.
        return play.call(this).catch(() => {});
      };
    });

    const played = () => display.evaluate(() => (window as unknown as { __lcThemes: string[] }).__lcThemes);
    const heard = async (file: string) => (await played()).includes(file);

    await display.goto(`/activity-display?runId=${run.runId}`);
    await expect(display.locator('.activity-display-root[data-activity-status="ready"]')).toBeVisible();

    // Lobby: the looping bed, and neither sting yet.
    await expect.poll(() => heard("intro-theme.mp3"), { timeout: 15_000 }).toBe(true);
    expect(await heard("game-intro.mp3"), "opening sting must wait for the game to start").toBe(false);
    expect(await heard("game-outro.mp3")).toBe(false);

    // Leaving the lobby for any phase is the start of play.
    await hostAction(page, run.runId, "open");
    await expect.poll(() => heard("game-intro.mp3"), { timeout: 20_000 }).toBe(true);
    expect(await heard("game-outro.mp3"), "closing sting must wait for the end").toBe(false);

    // One round, so advancing past it reaches final results.
    await hostAction(page, run.runId, "next");
    await expect.poll(() => heard("game-outro.mp3"), { timeout: 20_000 }).toBe(true);

    // The lobby bed is the only cue that repeats.
    const loops = await display.evaluate(() =>
      [...document.querySelectorAll("audio")].map(node => ({ src: node.src.split("/").pop(), loop: node.loop })));
    for (const node of loops) {
      if (node.src === "intro-theme.mp3") expect(node.loop, "lobby bed should loop").toBe(true);
      else expect(node.loop, `${node.src} should be a one-shot`).toBe(false);
    }
  } finally {
    await display.close();
  }
});

test("a missing preset pack falls through to its engine and then to shared", async ({ page, context }) => {
  await authenticate(page);
  const definitionId = await createWordActivity(page, "Juice Cascade Check", 45);
  const run = await launch(page, definitionId);

  const participant = await context.newPage();
  const requested: string[] = [];
  participant.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/assets/games/")) requested.push(path);
  });

  try {
    await participant.goto(`/play/${run.joinCode}`);
    // The definition carries no preset, so the cascade is engine then shared.
    await expect.poll(() => requested, { timeout: 15_000 })
      .toContain("/assets/games/word/audio/sfx/ui-btn-select.mp3");
    await expect.poll(() => requested, { timeout: 15_000 })
      .toContain("/assets/games/shared/audio/sfx/ui-btn-select.mp3");

    // Engine is tried before shared, never the other way round.
    expect(requested.indexOf("/assets/games/word/audio/sfx/ui-btn-select.mp3"))
      .toBeLessThan(requested.indexOf("/assets/games/shared/audio/sfx/ui-btn-select.mp3"));

    await joinAs(participant, run.joinCode, "Cascader");
    await expect(participant.locator(".participant-waiting")).toBeVisible();
  } finally {
    await participant.close();
  }
});

test.describe("reduced motion", () => {
  test("suppresses the decorative motion but keeps the panic colour", async ({ page, context }) => {
    await authenticate(page);
    const definitionId = await createWordActivity(page, "Juice Reduced Motion Check", 20);
    const run = await launch(page, definitionId);

    const participant = await context.newPage();
    try {
      // Emulate on the page under assertion rather than the shared context,
      // which `authenticate` has already opened a page against.
      await participant.emulateMedia({ reducedMotion: "reduce" });
      expect(await participant.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
      await joinAs(participant, run.joinCode, "Calm");
      const orb = participant.locator(".participant-waiting .waiting-orb").first();
      expect(await orb.evaluate(node => getComputedStyle(node).animationName)).toBe("none");

      const leave = participant.getByRole("button", { name: "Leave this device" });
      await leave.dispatchEvent("pointerdown");
      await expect(leave).toHaveAttribute("data-juice", "pressed");
      // No transform, but the press is still visibly acknowledged.
      expect(await leave.evaluate(node => getComputedStyle(node).transform)).toBe("none");
      expect(await leave.evaluate(node => getComputedStyle(node).filter)).toContain("brightness");
      await leave.dispatchEvent("pointerup");

      await hostAction(page, run.runId, "open");
      const shell = participant.locator("main.activity-participant-page");
      await expect(shell).toHaveAttribute("data-activity-panic", "true", { timeout: 30_000 });
      // Colour is information, so it survives reduced motion; the pulse does not.
      const panic = await shell.evaluate(node => ({
        background: getComputedStyle(node).backgroundImage,
        animation: getComputedStyle(node).animationName,
      }));
      expect(panic.animation).toBe("none");
      expect(panic.background).toContain("rgb(163, 52, 31)");
    } finally {
      await participant.close();
    }
  });
});
