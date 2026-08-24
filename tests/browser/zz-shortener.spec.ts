import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// The shortener is optional, and nothing about it assumes a particular domain.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Shortener");

const openSection = async (page: Page) => {
  await page.getByRole("button", { name: /Settings$/ }).click();
  await page.getByRole("button", { name: /Connections/ }).click();
  const panel = page.locator(".settings-panel").filter({ hasText: "URL shortener" });
  await expect(panel.getByRole("heading", { name: "URL shortener" })).toBeVisible({ timeout: 20_000 });
  return panel;
};

const configure = (page: Page, body: Record<string, unknown>) => page.evaluate(async input => {
  const response = await fetch("/api/v1/shortener", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  return { status: response.status, body: await response.text() };
}, body);

test("an installation with no shortener says so and still works", async ({ page }) => {
  await authenticate(page);
  await configure(page, { domain: "", adminHost: "", upstream: "", rootRedirectMode: "notfound", enabled: false });
  const panel = await openSection(page);
  await expect(panel).toContainText("Not installed");
});

test("the management address is derived from whichever domain is given", async ({ page }) => {
  await authenticate(page);
  // Two unrelated domains, to show nothing is baked in.
  for (const domain of ["go.example.org", "links.school.edu"]) {
    const saved = await page.evaluate(async input => {
      await fetch("/api/v1/shortener", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: input, adminHost: "", upstream: "http://shlink:8080", rootRedirectMode: "notfound", enabled: true }),
      });
      return await fetch("/api/v1/shortener").then(r => r.json()) as { domain: string; adminHost: string; publicUrl: string; adminUrl: string };
    }, domain);

    expect(saved.domain).toBe(domain);
    expect(saved.adminHost).toBe(`short.${domain}`);
    expect(saved.publicUrl).toBe(`https://${domain}`);
    // Short links live on the domain, never on the console's hostname.
    expect(saved.adminUrl).toBe(`https://short.${domain}`);
  }
});

test("the management address can be overridden but cannot be the short domain", async ({ page }) => {
  await authenticate(page);
  const overridden = await configure(page, {
    domain: "go.example.org", adminHost: "admin.elsewhere.net",
    upstream: "http://shlink:8080", rootRedirectMode: "notfound", enabled: true,
  });
  expect(overridden.status).toBe(200);

  const clash = await configure(page, {
    domain: "go.example.org", adminHost: "go.example.org",
    upstream: "http://shlink:8080", rootRedirectMode: "notfound", enabled: true,
  });
  expect(clash.status).toBe(400);
  expect(clash.body).toContain("differ from the short domain");
});

test("a root destination that is unsafe or circular is refused", async ({ page }) => {
  await authenticate(page);
  for (const url of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd"]) {
    const result = await configure(page, {
      domain: "go.example.org", adminHost: "", upstream: "http://shlink:8080",
      rootRedirectMode: "custom", rootRedirectUrl: url, enabled: true,
    });
    expect(result.status, `${url} must be refused`).toBe(400);
  }

  const loop = await configure(page, {
    domain: "go.example.org", adminHost: "", upstream: "http://shlink:8080",
    rootRedirectMode: "custom", rootRedirectUrl: "https://go.example.org", enabled: true,
  });
  expect(loop.status).toBe(400);
  expect(loop.body).toContain("back to itself");
});

test("the console shows the reserved pool and the tunnel routes to add", async ({ page }) => {
  await authenticate(page);
  await configure(page, {
    domain: "go.example.org", adminHost: "", upstream: "http://127.0.0.1:9",
    rootRedirectMode: "notfound", enabled: true,
  });

  const panel = await openSection(page);
  await expect(panel).toContainText("https://go.example.org");
  await expect(panel).toContainText("https://short.go.example.org");
  await expect(panel).toContainText("/ 100 in the shortener");

  const tunnel = await page.evaluate(async () =>
    (await fetch("/api/v1/shortener/tunnel").then(r => r.json())) as {
      routes: { hostname: string; service: string }[]; instructions: string[];
    });
  expect(tunnel.routes.map(route => route.hostname)).toEqual(["go.example.org", "short.go.example.org"]);
  // The warning that stops someone breaking every short link at the edge.
  expect(tunnel.instructions.some(step => step.includes("Redirect Rule"))).toBe(true);
});

test("LessonCue records the shortener's key rather than inventing one", async ({ page }) => {
  await authenticate(page);
  await configure(page, {
    domain: "go.example.org", adminHost: "", upstream: "http://127.0.0.1:9",
    rootRedirectMode: "notfound", enabled: true,
  });

  // The shortener has no way to register a key LessonCue made up, so this
  // endpoint takes the one it was started with.
  const tooShort = await page.evaluate(async () => {
    const response = await fetch("/api/v1/shortener/key", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "short" }),
    });
    return response.status;
  });
  expect(tooShort).toBe(400);

  const recorded = await page.evaluate(async () => {
    await fetch("/api/v1/shortener/key", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "0123456789abcdef0123456789abcdef" }),
    });
    return await fetch("/api/v1/shortener").then(r => r.text());
  });

  // Reported as configured, and the key itself never comes back.
  expect(recorded).toContain('"integrationKeyConfigured":true');
  expect(recorded).not.toContain("0123456789abcdef");
});

test("removing the integration clears LessonCue's settings", async ({ page }) => {
  await authenticate(page);
  await configure(page, {
    domain: "go.example.org", adminHost: "", upstream: "http://127.0.0.1:9",
    rootRedirectMode: "notfound", enabled: true,
  });

  const after = await page.evaluate(async () => {
    await fetch("/api/v1/shortener/lifecycle", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "uninstall", confirm: true }),
    });
    return await fetch("/api/v1/shortener").then(r => r.json()) as { state: string; domain: string; enabled: boolean };
  });

  expect(after.state).toBe("NotInstalled");
  expect(after.domain).toBe("");
  expect(after.enabled).toBe(false);
});

test("uninstalling without confirmation is refused", async ({ page }) => {
  await authenticate(page);
  const refused = await page.evaluate(async () => {
    const response = await fetch("/api/v1/shortener/lifecycle", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "uninstall", confirm: false }),
    });
    return response.status;
  });
  expect(refused).toBe(400);
});

test("a shortener that has not been proved to work does not get used", async ({ page }) => {
  await authenticate(page);
  // Enabled, but nothing is listening and the reserved codes have never been
  // provisioned. A four-character code would be a dead link on a wall.
  await configure(page, {
    domain: "go.example.org", adminHost: "", upstream: "http://127.0.0.1:9",
    rootRedirectMode: "notfound", enabled: true,
  });

  const run = await page.evaluate(async () => {
    const created = await fetch("/api/v1/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Unverified Shortener", type: "trivia",
        config: { title: "Unverified Shortener", questions: [{ id: "q1", prompt: "?", options: ["a", "b"], correctIndex: 1 }] },
      }),
    }).then(r => r.json()) as { id: string };
    return await fetch("/api/v1/activity-runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityDefinitionId: created.id }),
    }).then(r => r.json()) as { state: { joinCode: string; joinUrl: string | null } };
  });

  // Ordinary code, LessonCue's own address: longer, and it works.
  expect(run.state.joinCode).toHaveLength(6);
  expect(run.state.joinUrl ?? "").not.toContain("go.example.org");
});

test("with the shortener off, games keep LessonCue's own join address", async ({ page }) => {
  await authenticate(page);
  await configure(page, { domain: "", adminHost: "", upstream: "", rootRedirectMode: "notfound", enabled: false });

  const run = await page.evaluate(async () => {
    const created = await fetch("/api/v1/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Plain Game", type: "trivia",
        config: { title: "Plain Game", questions: [{ id: "q1", prompt: "?", options: ["a", "b"], correctIndex: 1 }] },
      }),
    }).then(r => r.json()) as { id: string };
    return await fetch("/api/v1/activity-runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityDefinitionId: created.id }),
    }).then(r => r.json()) as { runId: string; state: { joinCode: string; joinUrl: string | null } };
  });

  // The shortener is not a dependency: no short domain, ordinary code, and a
  // join address that still works.
  expect(run.state.joinCode).toHaveLength(6);
  expect(run.state.joinUrl ?? "").not.toContain("go.example.org");
});

test("testing the configuration checks each hostname separately", async ({ page }) => {
  await authenticate(page);
  await configure(page, {
    // Nothing is listening on either, so every check should fail honestly
    // rather than the whole thing erroring.
    domain: "go.invalid", adminHost: "short.go.invalid", upstream: "http://127.0.0.1:9",
    rootRedirectMode: "notfound", enabled: true,
  });

  const result = await page.evaluate(async () =>
    (await fetch("/api/v1/shortener/test", { method: "POST" }).then(r => r.json())) as {
      passed: boolean; checks: { name: string; passed: boolean; detail: string }[];
    });

  expect(result.passed).toBe(false);
  // Local reachability, the short domain, the console, and a game code: four
  // separate answers, because each can be wrong on its own.
  expect(result.checks.length).toBeGreaterThanOrEqual(4);
  expect(result.checks.some(check => check.name.includes("go.invalid"))).toBe(true);
  expect(result.checks.some(check => check.name.includes("short.go.invalid"))).toBe(true);
  expect(result.checks.every(check => check.detail.length > 0)).toBe(true);
});

test("an unconfigured shortener says what to do rather than erroring", async ({ page }) => {
  await authenticate(page);
  await configure(page, { domain: "", adminHost: "", upstream: "", rootRedirectMode: "notfound", enabled: false });

  const result = await page.evaluate(async () =>
    (await fetch("/api/v1/shortener/test", { method: "POST" }).then(r => r.json())) as {
      passed: boolean; checks: { name: string; detail: string }[];
    });

  expect(result.passed).toBe(false);
  expect(result.checks[0].detail).toContain("Set the short domain");
});
