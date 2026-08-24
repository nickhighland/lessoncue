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

test("an API key is shown once and never handed back afterwards", async ({ page }) => {
  await authenticate(page);
  await configure(page, {
    domain: "go.example.org", adminHost: "", upstream: "http://127.0.0.1:9",
    rootRedirectMode: "notfound", enabled: true,
  });

  const issued = await page.evaluate(async () =>
    (await fetch("/api/v1/shortener/keys", { method: "POST" }).then(r => r.json())) as { adminApiKey: string });
  expect(issued.adminApiKey).toMatch(/^[0-9a-f]{64}$/);

  // The status endpoint reports that a key exists, and nothing more.
  const status = await page.evaluate(async () =>
    (await fetch("/api/v1/shortener").then(r => r.text())));
  expect(status).toContain("integrationKeyConfigured");
  expect(status).not.toContain(issued.adminApiKey);
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

test("with the shortener on, a game takes a reserved code and shows the short link", async ({ page }) => {
  await authenticate(page);
  await configure(page, {
    domain: "go.example.org", adminHost: "", upstream: "http://127.0.0.1:9",
    rootRedirectMode: "notfound", enabled: true,
  });

  const run = await page.evaluate(async () => {
    const created = await fetch("/api/v1/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Short Code Game", type: "trivia",
        config: { title: "Short Code Game", questions: [{ id: "q1", prompt: "?", options: ["a", "b"], correctIndex: 1 }] },
      }),
    }).then(r => r.json()) as { id: string };
    return await fetch("/api/v1/activity-runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityDefinitionId: created.id }),
    }).then(r => r.json()) as { runId: string; state: { joinCode: string; joinUrl: string } };
  });

  // Four characters, readable from the back of a room.
  expect(run.state.joinCode).toMatch(/^[A-HJKMNP-Z][2-9][A-HJKMNP-Z][2-9]$/);
  // And the room is pointed at the short domain, which is what the QR encodes.
  expect(run.state.joinUrl).toBe(`https://go.example.org/${run.state.joinCode}`);
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
