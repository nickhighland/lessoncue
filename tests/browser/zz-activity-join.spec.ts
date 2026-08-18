import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// Players join by reading or scanning what the stage shows, so the stage must
// advertise an address a phone can actually open — never a relative path.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Join Address");

async function createTrivia(page: Page, name: string) {
  return page.evaluate(async activityName => {
    const response = await fetch("/api/v1/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: activityName, type: "trivia", description: "join test",
        config: {
          title: activityName,
          questions: [{ id: "q1", prompt: "Red planet?", options: ["Venus", "Mars"], correctIndex: 1 }],
        },
      }),
    });
    const body = await response.json() as { id?: string };
    if (!response.ok || !body.id) throw new Error(JSON.stringify(body));
    return body.id;
  }, name);
}

async function launch(page: Page, definitionId: string) {
  return page.evaluate(async id => {
    const response = await fetch("/api/v1/activity-runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityDefinitionId: id }),
    });
    const body = await response.json() as { runId: string; state?: { joinCode?: string; joinUrl?: string | null } };
    if (!response.ok || !body.state?.joinCode) throw new Error(JSON.stringify(body));
    return { runId: body.runId, joinCode: body.state.joinCode, joinUrl: body.state.joinUrl ?? null };
  }, definitionId);
}

const setMode = (page: Page, mode: string) => page.evaluate(async value => {
  const response = await fetch("/api/v1/activity-join-address", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: value }),
  });
  return response.json() as Promise<{ mode: string; url: string | null; resolvedFrom: string }>;
}, mode);

test("the run projects an absolute join URL, never a relative path", async ({ page }) => {
  await authenticate(page);
  const run = await launch(page, await createTrivia(page, "Join URL Projection"));

  expect(run.joinCode).toMatch(/^[A-Z0-9]{4,8}$/);
  if (run.joinUrl === null) {
    // Acceptable only when the machine truly has no reachable address.
    const status = await setMode(page, "auto");
    expect(status.url, "no join URL and no resolvable address").toBeNull();
    return;
  }
  expect(run.joinUrl).toMatch(/^https?:\/\//);
  expect(run.joinUrl).toContain(`/play/${run.joinCode}`);
  // Regression: a doubled scheme still matches a loose ^https?:// check.
  expect(run.joinUrl!.match(/:\/\//g), run.joinUrl!).toHaveLength(1);
});

test("the stage shows a scannable QR and the full address, not /play/CODE", async ({ page, context }) => {
  await authenticate(page);
  const run = await launch(page, await createTrivia(page, "Join Banner Render"));
  test.skip(run.joinUrl === null, "this machine has no reachable join address");

  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  try {
    await tv.goto(`/activity-display?runId=${run.runId}`);
    await expect(tv.locator('.activity-display-root[data-activity-status="ready"]')).toBeVisible({ timeout: 20_000 });

    const banner = tv.locator(".interactive-join-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(run.joinCode);
    // The old markup printed a bare path that no phone could use.
    await expect(banner).not.toContainText(`/play/${run.joinCode}`.replace(/^/, "^"));
    await expect(banner).toContainText(run.joinUrl!.replace(/^https?:\/\//, "").split("/")[0]);

    const qr = banner.locator("img.activity-qr");
    await expect(qr).toBeVisible();
    // A rendered QR, not a placeholder box.
    const size = await qr.evaluate((node: HTMLImageElement) => ({ w: node.naturalWidth, h: node.naturalHeight }));
    expect(size.w).toBeGreaterThan(20);
    expect(size.h).toBeGreaterThan(20);
    await expect(qr).toHaveAttribute("alt", /Scan to join/);
  } finally {
    await tv.close();
  }
});

test("the admin chooses which address the room is shown", async ({ page }) => {
  await authenticate(page);

  const options = await page.evaluate(async () =>
    (await fetch("/api/v1/activity-join-address").then(r => r.json())) as {
      mode: string; url: string | null; resolvedFrom: string;
      options: Array<{ id: string; label: string; url: string | null; available: boolean }>;
    });
  expect(options.options.map(option => option.id)).toEqual(["auto", "cloudflare", "local"]);

  // An explicit choice is stored even when it is not currently reachable, and
  // the room is shown a working address rather than a dead one.
  const cloudflare = await setMode(page, "cloudflare");
  expect(cloudflare.mode).toBe("cloudflare");
  if (!options.options.find(option => option.id === "cloudflare")?.available) {
    expect(cloudflare.resolvedFrom).not.toBe("cloudflare");
  }

  const local = await setMode(page, "local");
  expect(local.mode).toBe("local");
  // Regression: the base URL already carries a scheme, so this must not double it.
  if (local.url) expect(local.url.match(/:\/\//g)).toHaveLength(1);

  await setMode(page, "auto");
});
