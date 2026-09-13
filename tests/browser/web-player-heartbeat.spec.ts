import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ serviceWorkers: "block" });

test("a delayed heartbeat does not create another loop when a command is acknowledged", async ({ page }) => {
  const manifest = JSON.parse(readFileSync(
    new URL("../../protocol/fixtures/manifest-v1-current.json", import.meta.url), "utf8",
  )) as { screen: Record<string, unknown> };
  manifest.screen = { ...manifest.screen, id: "heartbeat-race", name: "Heartbeat race" };

  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>(resolve => { releaseFirst = resolve; });
  let heartbeatCount = 0;
  let controlCount = 0;
  const acknowledgements: number[] = [];

  await page.route("**/api/v1/screens/heartbeat-race/manifest", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/api/v1/screens/heartbeat-race/control**", route => {
    controlCount += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(
      controlCount === 1
        ? { changed: false, version: 0, action: "none" }
        : controlCount === 2
          ? { changed: true, version: 1, action: "pause" }
          : { changed: false, version: 1, action: "none" },
    ) });
  });
  await page.route("**/api/v1/tv/status", async route => {
    heartbeatCount += 1;
    acknowledgements.push(route.request().postDataJSON().acknowledgedControlVersion);
    if (heartbeatCount === 1) await firstResponse;
    await route.fulfill({ status: 204, body: "" });
  });

  try {
    await page.goto("/display?screenId=heartbeat-race&token=test-token&name=Heartbeat%20race");
    await expect.poll(() => controlCount).toBeGreaterThanOrEqual(2);
    await expect.poll(() => heartbeatCount).toBe(1);
    releaseFirst();
    await expect.poll(() => heartbeatCount, { timeout: 3_000 }).toBe(2);
    expect(acknowledgements).toEqual([0, 1]);
    await page.waitForTimeout(1_000);
    expect(heartbeatCount).toBe(2);
  } finally {
    releaseFirst();
  }
});

test("a late successful control response cannot restart polling after unpairing", async ({ page }) => {
  const manifest = JSON.parse(readFileSync(
    new URL("../../protocol/fixtures/manifest-v1-current.json", import.meta.url), "utf8",
  )) as { screen: Record<string, unknown> };
  manifest.screen = { ...manifest.screen, id: "control-cleanup", name: "Control cleanup" };

  let releaseControl!: () => void;
  const heldControl = new Promise<void>(resolve => { releaseControl = resolve; });
  let releaseHeartbeat!: () => void;
  const heldHeartbeat = new Promise<void>(resolve => { releaseHeartbeat = resolve; });
  let controlCount = 0;

  await page.route("**/api/v1/screens/control-cleanup/manifest", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/api/v1/screens/control-cleanup/control**", async route => {
    controlCount += 1;
    if (controlCount === 1) await heldControl;
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ changed: false, version: 0, action: "none" }) }).catch(() => {});
  });
  await page.route("**/api/v1/tv/status", async route => {
    await heldHeartbeat;
    await route.fulfill({ status: 401, body: "" });
  });

  try {
    await page.goto("/display?screenId=control-cleanup&token=test-token&name=Control%20cleanup");
    await expect.poll(() => controlCount).toBe(1);
    releaseHeartbeat();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("lessoncue.web-player.identity.v1"))).toBe(null);
    releaseControl();
    await page.waitForTimeout(1_000);
    expect(controlCount).toBe(1);
  } finally {
    releaseHeartbeat();
    releaseControl();
  }
});
