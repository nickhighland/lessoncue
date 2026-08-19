import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";
import { ACTIVITY_PRESET_CATALOG } from "../../web-admin/src/activities/activityPresetRegistry";

// Every named format in the teacher-facing catalog must survive the whole
// path: server validation of its starter config, run creation, and rendering a
// real stage. The brief is explicit that a live Activity must never fall back
// to a blank screen, so this guards all of them at once rather than the
// handful that have bespoke tests.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Preset Smoke");

test("every catalog preset saves, launches, and renders a real stage", async ({ page, context }) => {
  test.setTimeout(900_000);
  await authenticate(page);

  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  const consoleErrors: string[] = [];
  tv.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  tv.on("pageerror", error => consoleErrors.push(`PAGEERROR ${error.message}`));

  const blank: string[] = [];
  const noisy: string[] = [];

  for (const preset of ACTIVITY_PRESET_CATALOG) {
    consoleErrors.length = 0;

    const definitionId = await page.evaluate(async ({ name, type, config }) => {
      const response = await fetch("/api/v1/activities", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, description: "preset smoke", config }),
      });
      const body = await response.json() as { id?: string };
      if (!response.ok || !body.id) throw new Error(`create ${preset.id}: ${response.status} ${JSON.stringify(body)}`);
      return body.id;
    }, { name: `Smoke ${preset.label}`, type: preset.type, config: preset.config });

    const runId = await page.evaluate(async id => {
      const response = await fetch("/api/v1/activity-runs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityDefinitionId: id }),
      });
      const body = await response.json() as { runId?: string };
      if (!response.ok || !body.runId) throw new Error(`launch: ${response.status} ${JSON.stringify(body)}`);
      return body.runId;
    }, definitionId);

    await tv.goto(`/activity-display?runId=${runId}`);
    const root = tv.locator(".activity-display-root");
    await expect(root, `${preset.id} stage never mounted`).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => root.getAttribute("data-activity-status"), { timeout: 20_000 })
      .not.toBe("loading");
    expect(await root.getAttribute("data-activity-status"), `${preset.id} stage errored`).toBe("ready");

    // "Renders something" means real content, not just a mounted container:
    // readable text, or a drawn surface such as the wheel canvas.
    const substance = await tv.evaluate(() => {
      const stage = document.querySelector(".activity-display-root");
      if (!stage) return { text: 0, canvases: 0 };
      return {
        text: (stage.textContent || "").replace(/\s+/g, " ").trim().length,
        canvases: stage.querySelectorAll("canvas").length,
      };
    });
    if (substance.text < 40 && substance.canvases === 0) blank.push(preset.id);
    if (consoleErrors.length) noisy.push(`${preset.id}: ${consoleErrors[0].slice(0, 120)}`);
  }

  await tv.close();
  expect(blank, "presets rendering an effectively blank stage").toEqual([]);
  // A stock install ships no sound packs, so nothing should be requested.
  expect(noisy, "presets logging console errors").toEqual([]);
});
