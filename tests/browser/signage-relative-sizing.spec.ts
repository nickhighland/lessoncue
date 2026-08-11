import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ serviceWorkers: "block" });

function zone(id: string, type: string, overrides: Record<string, unknown> = {}) {
  return {
    id, type, title: type, content: "", sourceUrl: null,
    x: 0, y: 0, width: 100, height: 100, backgroundColor: "#063d4b", textColor: "#ffffff", accentColor: "#ffab28",
    refreshMinutes: 15, rotation: 0, zIndex: 1, opacity: 100, fit: "cover", locked: false, hidden: false,
    flipX: false, flipY: false, fontFamily: "system-ui", fontSize: 48, fontScalePercent: 10, fontWeight: 600,
    italic: false, underline: false, lineHeightPercent: 120, textAlign: "left", cornerRadius: 0,
    weatherFields: "icon,temperature,conditions,precipitation,high,low,wind", weatherLayout: "icon-left",
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
        title: "Upcoming events", x: 80, y: 0, width: 20, height: 80, lineHeightPercent: 180,
        cached: { zoneId: "fixture-calendar", title: "Upcoming events", text: "", items: [], refreshedAt: "2026-08-01T12:00:00Z", events: [{
          title: "Event Title That Wraps Across the Calendar Column", description: "Description text is available when enabled.", location: "Community room",
          startsAt: "2026-08-01T19:00:00Z", endsAt: "2026-08-01T22:00:00Z", allDay: false,
        }] },
      }),
      zone("fixture-weather", "weather", {
        title: "Rochester, NY", x: 0, y: 80, width: 20, height: 20,
        cached: { zoneId: "fixture-weather", title: "Rochester, NY", text: "☀️ 83°F", items: [], refreshedAt: "2026-08-01T12:00:00Z", icon: "☀️", weather: {
          temperature: 83, high: 85, low: 67, humidity: 50, precipitation: 20, wind: 5, windText: "NW 5 mph", temperatureUnit: "°F", windUnit: "mph", conditions: "Sunny",
        } },
      }),
      zone("fixture-wifi", "wifi", {
        title: "Guest Wi-Fi", x: 20, y: 80, width: 20, height: 20, qrValue: "WIFI:T:WPA;S:Guest;P:password;;",
        qrPlacement: "left", qrLabelRight: "Guest Wifi", lineHeightPercent: 150,
      }),
      zone("fixture-qr", "qr", {
        title: "Support our mission", x: 80, y: 80, width: 20, height: 20, qrValue: "https://lessoncue.local",
        qrPlacement: "left", qrLabelRight: "Support our Mission",
      }),
    ],
  }];
  await page.route("**/api/v1/screens/relative-signage/manifest", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/api/v1/screens/relative-signage/control**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ changed: false, version: 0, action: "none" }) }));
  await page.route("**/api/v1/screens/relative-signage/status", route => route.fulfill({ status: 204, body: "" }));

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/display?screenId=relative-signage&token=test-token&name=Relative%20signage&kiosk=1");
  await expect(page.locator(".web-player-signage-layout")).toBeVisible();
  await expect(page.locator(".signage-calendar-heading")).toContainText("Upcoming events");
  await expect(page.locator(".signage-calendar-list time span").first()).toContainText("August");
  await expect(page.locator(".signage-calendar-description")).toContainText("Description text is available");
  await expect(page.locator(".signage-weather-temperature")).toContainText("83°");
  await expect(page.locator(".signage-weather-title")).toContainText("Rochester, NY");
  await expect(page.locator(".signage-weather-details")).toContainText("20%");
  await expect(page.locator(".signage-weather-details")).toContainText("H85/L67");
  await expect(page.locator(".signage-weather-details")).toContainText("5 MPH");
  await expect(page.locator(".signage-weather-wind-direction")).toContainText("NW");
  await expect(page.locator(".signage-weather-details")).not.toContainText("Humidity");
  await expect(page.locator(".signage-weather-icon .weather-sun-artwork")).toBeVisible();
  await expect(page.locator(".web-player-signage-zone.wifi .signage-qr")).toBeVisible();
  await expect(page.locator(".web-player-signage-zone.wifi .signage-qr-label.right")).toContainText("Guest Wifi");
  await expect(page.locator(".web-player-signage-zone.qr .signage-qr-label.right")).toContainText("Support our Mission");

  const sizing = await page.locator(".web-player-signage-zone.calendar").evaluate(element => {
    const copy = element.querySelector<HTMLElement>(".web-player-zone-copy");
    return {
      containerType: getComputedStyle(element).containerType,
      copyStyle: copy?.getAttribute("style") || "",
      lineHeight: getComputedStyle(element).getPropertyValue("--signage-line-height"),
      calendarWidth: element.getBoundingClientRect().width,
    };
  });
  expect(sizing.containerType).toContain("size");
  expect(sizing.copyStyle).toContain("cqw");
  expect(sizing.copyStyle).toContain("cqh");
  expect(sizing.lineHeight).toBe("1.8");
  const qrSizing = await page.locator(".web-player-signage-zone.wifi .signage-qr-layout").evaluate(element => ({
    fontSize: element.getAttribute("style") || "",
    lineHeight: getComputedStyle(element).lineHeight,
    lineHeightSetting: getComputedStyle(element.parentElement!).getPropertyValue("--signage-line-height"),
  }));
  expect(qrSizing.fontSize).toContain("cqw");
  expect(qrSizing.fontSize).toContain("cqh");
  expect(Number.parseFloat(qrSizing.lineHeight)).toBeGreaterThan(0);
  expect(qrSizing.lineHeightSetting).toBe("1.5");
  expect(sizing.calendarWidth).toBeGreaterThan(0);
  await expect(page.locator(".signage-calendar-list li > b").first()).toHaveCSS("white-space", "normal");

  const weatherGeometry = await page.locator(".signage-weather").evaluate(card => {
    const bounds = (selector: string) => card.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
    const overlaps = (first?: DOMRect, second?: DOMRect) => Boolean(first && second
      && first.left < second.right - 0.5 && first.right > second.left + 0.5
      && first.top < second.bottom - 0.5 && first.bottom > second.top + 0.5);
    const cardBounds = card.getBoundingClientRect();
    const title = bounds(".signage-weather-title");
    const icon = bounds(".signage-weather-icon");
    const temperature = bounds(".signage-weather-temperature");
    const conditions = bounds(".signage-weather-conditions");
    const details = bounds(".signage-weather-details");
    const reading = bounds(".signage-weather-reading");
    return {
      card: { width: cardBounds.width, height: cardBounds.height },
      iconTemperatureOverlap: overlaps(icon, temperature),
      titleMainOverlap: overlaps(title, icon) || overlaps(title, temperature),
      temperatureConditionsOverlap: overlaps(temperature, conditions),
      mainDetailsOverlap: overlaps(icon, details) || overlaps(temperature, details) || overlaps(conditions, details),
      temperatureClipped: Boolean(temperature && reading
        && (temperature.left < reading.left - 0.5 || temperature.right > reading.right + 0.5
          || temperature.top < reading.top - 0.5 || temperature.bottom > reading.bottom + 0.5)),
      temperatureInsideCard: Boolean(temperature
        && temperature.left >= cardBounds.left - 0.5 && temperature.right <= cardBounds.right + 0.5
        && temperature.top >= cardBounds.top - 0.5 && temperature.bottom <= cardBounds.bottom + 0.5),
      detailsClipped: Array.from(card.querySelectorAll<HTMLElement>(".signage-weather-details li"))
        .some(element => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1),
    };
  });
  expect(weatherGeometry.card.width).toBeGreaterThan(150);
  expect(weatherGeometry.card.height).toBeGreaterThan(90);
  expect(weatherGeometry.iconTemperatureOverlap).toBe(false);
  expect(weatherGeometry.titleMainOverlap).toBe(false);
  expect(weatherGeometry.temperatureConditionsOverlap).toBe(false);
  expect(weatherGeometry.mainDetailsOverlap).toBe(false);
  expect(weatherGeometry.temperatureClipped).toBe(false);
  expect(weatherGeometry.temperatureInsideCard).toBe(true);
  expect(weatherGeometry.detailsClipped).toBe(false);
});
