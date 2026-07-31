import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// The committed service worker intentionally owns display caching in production.
// Block it here so the fixture routes exercise the renderer deterministically.
test.use({ serviceWorkers: "block" });

const fallbackManifest = {
  apiVersion: 1,
  capabilityContractVersion: 1,
  manifestVersion: 14,
  generatedAt: "2026-07-29T12:00:00Z",
  displayCapabilities: {
    platform: "web-player",
    displayName: "Browser display",
    contractVersion: 1,
    minimumClientVersion: "0.40.2",
    capabilities: [],
    limitations: [],
  },
  compatibilityWarnings: [{
    code: "unsupported-lesson-cue",
    severity: "warning",
    contentKind: "lesson",
    contentId: "cue-fallback",
    title: "Legacy classroom clip",
    message: "This file cannot be rendered by this display.",
    fallback: "LessonCue will show an explanatory title card and keep remote navigation available.",
  }],
  screen: {
    id: "conformance-screen",
    name: "Compatibility test display",
    volunteerMode: true,
    site: "Test lab",
    signageOnly: false,
  },
  signage: [],
  signageSchedule: [],
  playlists: [{
    playlistId: "conformance-lesson",
    title: "Display conformance lesson",
    lessonDate: "2026-07-29",
    items: [{
      itemId: "cue-fallback",
      type: "video",
      title: "Legacy classroom clip",
      renderSupport: "fallback",
      fallbackMessage: "This file cannot be rendered by this display.",
      startMs: 0,
      volumePercent: 0,
      imageDurationSeconds: 10,
      endBehavior: "advance",
      allowSkip: true,
      fadeInMs: 0,
      fadeOutMs: 0,
      cuePoints: [],
    }],
  }],
};

const committedManifestFixtures = [
  "manifest-v1-minimum.json",
  "manifest-v1-current.json",
  "manifest-v1-future-additive.json",
] as const;

for (const fixtureName of committedManifestFixtures) {
  test(`browser accepts committed protocol fixture: ${fixtureName}`, async ({ page }) => {
    const manifest = JSON.parse(readFileSync(
      new URL(`../../protocol/fixtures/${fixtureName}`, import.meta.url),
      "utf8",
    )) as { playlists: Array<{ title: string }> };

    await page.route("**/api/v1/screens/protocol-fixture/manifest", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) }));
    await page.route("**/api/v1/screens/protocol-fixture/control**", route =>
      route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ changed: false, version: 0, action: "none" }) }));
    await page.route("**/api/v1/screens/protocol-fixture/status", route =>
      route.fulfill({ status: 204, body: "" }));

    await page.goto("/display?screenId=protocol-fixture&token=test-token&name=Protocol%20fixture");
    await expect(page.getByRole("button", { name: new RegExp(manifest.playlists[0].title) })).toBeVisible();
  });
}

test("browser renders the declared safe fallback and preserves navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route("**/api/v1/screens/conformance-screen/manifest", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fallbackManifest) }));
  await page.route("**/api/v1/screens/conformance-screen/control**", route =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ changed: false, version: 0, action: "none" }) }));
  await page.route("**/api/v1/screens/conformance-screen/status", route =>
    route.fulfill({ status: 204, body: "" }));

  await page.goto("/display?screenId=conformance-screen&token=test-token&name=Compatibility%20test%20display");
  await page.getByRole("button", { name: /Display conformance lesson/ }).click();

  const fallback = page.getByRole("status");
  await expect(fallback).toContainText("CONTENT UNAVAILABLE");
  await expect(fallback).toContainText("Legacy classroom clip");
  await expect(fallback).toContainText("This file cannot be rendered by this display.");
  await expect(page.getByRole("button", { name: "Next media" })).toBeVisible();
  await expect(page).toHaveScreenshot("browser-safe-fallback.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.03,
  });
});
