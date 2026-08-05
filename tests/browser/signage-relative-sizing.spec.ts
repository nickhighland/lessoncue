import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ serviceWorkers: "block" });

function zone(id: string, type: string, overrides: Record<string, unknown> = {}) {
  return {
    id, type, title: type, content: "", sourceUrl: null,
    x: 0, y: 0, width: 100, height: 100, backgroundColor: "#063d4b", textColor: "#ffffff", accentColor: "#ffab28",
    refreshMinutes: 15, rotation: 0, zIndex: 1, opacity: 100, fit: "cover", locked: false, hidden: false,
    flipX: false, flipY: false, fontFamily: "system-ui", fontSize: 48, fontScalePercent: 8, fontWeight: 600,
    italic: false, underline: false, lineHeightPercent: 120, textAlign: "left", cornerRadius: 0,
    weatherFields: "icon,conditions,temperature,high,low,humidity,wind", weatherLayout: "icon-left",
    calendarMaxItems: 4, calendarFields: "date,time,title,description",
    ...overrides,
  };
}

test("signage widgets scale with their panels and can show event descriptions", async ({ page }) => {
  const manifest = JSON.parse(readFileSync(
    new URL("../../protocol/fixtures/manifest-v1-current.json", import.meta.url), "utf8",
  )) as { screen: Record<string, unknown>; signage: Array<Record<string, unknown>>; signageSchedule: unknown[] };
  manifest.screen = { ...manifest.screen, id: "relative-signage", name: "Relative signage", signageOnly: true };
  manifest.signageSchedule = [];
  manifest.signage = [{
    id: "relative-signage-item", name: "Relative sizing fixture", version: 1, publishedVersion: 1,
    publishState: "published", mode: "sign", priority: 0, message: "", backgroundColor: "#17201e", textColor: "#ffffff",
    mediaAssetId: null, mediaUrl: null, media: null, layoutPreset: "single", canvasWidth: 1920, canvasHeight: 1080,
    safeAreaPercent: 0, zones: [
      zone("fixture-calendar", "calendar", {
        title: "Upcoming events", x: 0, y: 0, width: 50, height: 100,
        cached: { zoneId: "fixture-calendar", title: "Upcoming events", text: "", items: [], refreshedAt: "2026-08-01T12:00:00Z", events: [{
          title: "Event Title", description: "Description text is available when enabled.", location: "Community room",
          startsAt: "2026-08-01T19:00:00Z", endsAt: "2026-08-01T22:00:00Z", allDay: false,
        }] },
      }),
      zone("fixture-weather", "weather", {
        title: "Rochester, NY", x: 50, y: 0, width: 50, height: 100,
        cached: { zoneId: "fixture-weather", title: "Rochester, NY", text: "☀️ 83°F", items: [], refreshedAt: "2026-08-01T12:00:00Z", icon: "☀️", weather: {
          temperature: 83, high: 85, low: 67, humidity: 50, wind: 5, temperatureUnit: "°F", windUnit: "mph", conditions: "Sunny",
        } },
      }),
    ],
  }];
  await page.route("**/api/v1/screens/relative-signage/manifest", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/api/v1/screens/relative-signage/control**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ changed: false, version: 0, action: "none" }) }));
  await page.route("**/api/v1/screens/relative-signage/status", route => route.fulfill({ status: 204, body: "" }));

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/display?screenId=relative-signage&token=test-token&name=Relative%20signage");
  await expect(page.locator(".web-player-signage-layout")).toBeVisible();
  await expect(page.locator(".signage-calendar-heading")).toContainText("Upcoming events");
  await expect(page.locator(".signage-calendar-description")).toContainText("Description text is available");
  await expect(page.locator(".signage-weather-temperature")).toContainText("83°F");

  const sizing = await page.locator(".web-player-signage-zone.calendar").evaluate(element => {
    const copy = element.querySelector<HTMLElement>(".web-player-zone-copy");
    return {
      containerType: getComputedStyle(element).containerType,
      copyStyle: copy?.getAttribute("style") || "",
      calendarWidth: element.getBoundingClientRect().width,
    };
  });
  expect(sizing.containerType).toContain("size");
  expect(sizing.copyStyle).toContain("cqw");
  expect(sizing.copyStyle).toContain("cqh");
  expect(sizing.calendarWidth).toBeGreaterThan(0);
});
