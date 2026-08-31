import { expect, test, Page, ConsoleMessage } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

/**
 * Every engine, on all three surfaces it has to work on at once.
 *
 * The suite had deep tests for a dozen engines and nothing at all for the rest,
 * so a game could render a blank stage, throw on a phone, or leave the host
 * with no way to start it, and every test would still pass. This plays each one
 * far enough to see that the TV shows the game, a phone can join it, and the
 * host has something to press — and it fails on a console error from any of
 * them, because a stage that throws is not a stage a room can use.
 */

/** Every engine the catalogue can build a default configuration for. */
const ENGINES = [
  "wheel", "picker", "prizeGrid", "scoreboard", "surveyBoard", "trivia",
  "imageReveal", "imageShuffle", "countdown", "poll", "ranking", "responses",
  "rapidFire", "emojiPrompt", "rankIt", "wordScramble", "prediction", "buzzer",
  "punchline", "fakeOut", "drawing", "ordering", "word", "matchPlayer",
  "stageChallenge", "bracket", "physicalRoom", "utility",
] as const;

/** Noise from the environment rather than the game under test. */
const IGNORED = [
  "favicon",
  "Failed to load resource",
  "ERR_CONNECTION",
  "net::",
  "manifest.json",
  "Download the React DevTools",
  "AudioContext",
  "play() failed",
  "The play() request",
];

function watchConsole(page: Page, sink: string[]) {
  const record = (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED.some(pattern => text.includes(pattern))) return;
    sink.push(text);
  };
  page.on("console", record);
  page.on("pageerror", error => {
    const text = String(error?.message ?? error);
    if (!IGNORED.some(pattern => text.includes(pattern))) sink.push(text);
  });
}

/** Build one live run of an engine, using the catalogue's own default config. */
async function startRun(page: Page, type: string) {
  return await page.evaluate(async engineType => {
    const headers = { "Content-Type": "application/json" };
    // Report what the server said rather than dying on an empty body: a
    // refused create is a finding, not a broken test.
    const read = async (response: Response, what: string) => {
      const body = await response.text();
      if (!response.ok) throw new Error(`${what} returned ${response.status}: ${body.slice(0, 300) || "(empty)"}`);
      try { return JSON.parse(body); } catch { throw new Error(`${what} returned unreadable JSON: ${body.slice(0, 300)}`); }
    };

    const created = await fetch("/api/v1/activities", {
      method: "POST", headers,
      // No config: the server fills in the engine's shipped default, which is
      // what a teacher gets when they create one from the library.
      body: JSON.stringify({ name: `Sweep ${engineType}`, type: engineType }),
    }).then(r => read(r, "creating the activity")) as { id: string; type: string };

    // Creating the run is what makes it live: the response carries the state a
    // TV would receive, join code and all.
    const run = await fetch("/api/v1/activity-runs", {
      method: "POST", headers,
      body: JSON.stringify({ activityDefinitionId: created.id }),
    }).then(r => read(r, "starting the run")) as { runId: string; state?: { joinCode?: string } };

    return { definitionId: created.id, runId: run.runId, joinCode: run.state?.joinCode ?? "" };
  }, type);
}

test.describe("every game works on every surface", () => {
  for (const type of ENGINES) {
    test(`${type} plays on the TV, a phone, and the host console`, async ({ page, context }) => {
      const problems: string[] = [];
      watchConsole(page, problems);
      await signInAsAdmin(page, "Browser Test Church");

      const prepared = await startRun(page, type);
      expect(prepared.runId, `${type} produced no run`).toBeTruthy();

      // ── The TV. What the room looks at.
      await page.goto(`/activity-display?runId=${prepared.runId}`);
      const stage = page.locator(".activity-display-root");
      await expect(stage, `${type}: the stage never rendered`).toBeVisible({ timeout: 20_000 });
      // The TV shell puts up its own recovery surface when a renderer throws.
      await expect(page.locator('[data-activity-status="error"]'),
        `${type}: the stage fell back to its recovery screen`).toHaveCount(0);

      // ── The phone. What a player holds.
      if (prepared.joinCode) {
        const phone = await context.newPage();
        const phoneProblems: string[] = [];
        watchConsole(phone, phoneProblems);
        await phone.setViewportSize({ width: 390, height: 844 });
        await phone.goto(`/play/${prepared.joinCode}`);
        // Either the join form or an already-joined surface, but something a
        // thumb can act on rather than a blank screen.
        await expect(phone.locator("body"), `${type}: the player screen was empty`)
          .not.toBeEmpty();
        await phone.waitForTimeout(500);
        problems.push(...phoneProblems.map(problem => `phone: ${problem}`));
        await phone.close();
      }

      // ── The host. What the teacher drives it from.
      //
      // Asked for rather than navigated to: re-visiting the stage would abort
      // its own in-flight request and log a failure this sweep would then
      // report as the game's fault.
      const host = await page.evaluate(async runId =>
        await fetch(`/api/v1/activity-sessions/${runId}/host-state`).then(async response => ({
          status: response.status,
          body: await response.text(),
        })), prepared.runId);
      expect(host.status, `${type}: the host console could not load this game`).toBe(200);
      const hostView = JSON.parse(host.body) as { state?: Record<string, unknown> };
      expect(hostView.state, `${type}: the host was given no state to drive`).toBeTruthy();

      expect(problems, `${type} logged errors:\n${problems.join("\n")}`).toEqual([]);
    });
  }
});
