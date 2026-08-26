import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// The shortener is optional, and nothing about it assumes a particular domain.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Shortener");

const openSection = async (page: Page) => {
  await page.getByRole("button", { name: /Settings$/ }).click();
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
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
  const shortenerLayout = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".settings-shortener");
    const grid = panel?.parentElement?.getBoundingClientRect();
    const facts = [...document.querySelectorAll<HTMLElement>(".settings-shortener .shortener-facts > .definition")]
      .map(item => item.getBoundingClientRect());
    return {
      panel: panel?.getBoundingClientRect(),
      grid,
      facts: facts.map(item => ({ top: item.top, left: item.left, width: item.width })),
    };
  });
  expect(shortenerLayout.panel).not.toBeNull();
  expect(shortenerLayout.grid).not.toBeNull();
  expect(shortenerLayout.panel!.width).toBeGreaterThan(shortenerLayout.grid!.width * 0.95);
  expect(shortenerLayout.facts.length).toBeGreaterThanOrEqual(2);
  expect(Math.abs(shortenerLayout.facts[0].top - shortenerLayout.facts[1].top)).toBeLessThan(1);
  expect(shortenerLayout.facts[1].left).toBeGreaterThan(shortenerLayout.facts[0].left);

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

test("the reachable address is offered rather than left to guesswork", async ({ page }) => {
  await authenticate(page);
  const suggested = await page.evaluate(async () =>
    (await fetch("/api/v1/shortener").then(r => r.json())) as { suggestedUpstream: string });

  // Whichever shape this installation is, the suggestion is a usable address.
  expect(suggested.suggestedUpstream).toMatch(/^http:\/\/(shlink:8080|127\.0\.0\.1:\d+)$/);

  // Saved blank, it takes the suggestion rather than storing nothing.
  const saved = await page.evaluate(async () => {
    await fetch("/api/v1/shortener", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "go.example.org", adminHost: "", upstream: "", rootRedirectMode: "notfound", enabled: true }),
    });
    return await fetch("/api/v1/shortener").then(r => r.json()) as { upstream: string; suggestedUpstream: string };
  });
  expect(saved.upstream).toBe(saved.suggestedUpstream);
});


test("the console explains the Cloudflare routes before a domain is even chosen", async ({ page }) => {
  await authenticate(page);
  await configure(page, { domain: "", adminHost: "", upstream: "", rootRedirectMode: "notfound", enabled: false });

  const plan = await page.evaluate(async () =>
    (await fetch("/api/v1/shortener/tunnel").then(r => r.json())) as { instructions: string[]; routes: unknown[] });

  // No routes to name yet, but the shape and the trap are worth knowing early.
  expect(plan.routes).toHaveLength(0);
  expect(plan.instructions.length).toBeGreaterThan(3);
  expect(plan.instructions.some(step => step.includes("Redirect Rule"))).toBe(true);
  expect(plan.instructions.some(step => step.includes("already serving LessonCue"))).toBe(true);
});

test("the settings arrive filled in rather than blank", async ({ page }) => {
  await authenticate(page);
  await configure(page, { domain: "", adminHost: "", upstream: "", rootRedirectMode: "notfound", enabled: false });

  // The suggestion is what the console fills in, and what a blank save stores.
  const suggested = await page.evaluate(async () =>
    (await fetch("/api/v1/shortener").then(r => r.json())) as { suggestedUpstream: string; suggestedAdminHost: string });
  expect(suggested.suggestedUpstream).toMatch(/^http:\/\/(shlink:8080|127\.0\.0\.1:\d+)$/);

  const saved = await page.evaluate(async () => {
    await fetch("/api/v1/shortener", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "go.example.org", adminHost: "", upstream: "", rootRedirectMode: "notfound", enabled: true }),
    });
    return await fetch("/api/v1/shortener").then(r => r.json()) as { upstream: string; adminHost: string };
  });
  expect(saved.upstream).toBe(suggested.suggestedUpstream);
  expect(saved.adminHost).toBe("short.go.example.org");
});

test("the tunnel routes name a concrete address and the ports in use", async ({ page }) => {
  await authenticate(page);
  await configure(page, {
    domain: "chroc.cc", adminHost: "", upstream: "http://127.0.0.1:9",
    rootRedirectMode: "notfound", enabled: true,
  });

  const plan = await page.evaluate(async () =>
    (await fetch("/api/v1/shortener/tunnel").then(r => r.json())) as {
      routes: { hostname: string; service: string }[];
      shortenerPort: number; consolePort: number; serverHost: string | null;
    });

  // The short domain to the shortener, the console to the web client, each on
  // its own port — the two lines an operator copies into Cloudflare.
  expect(plan.routes.map(r => r.hostname)).toEqual(["chroc.cc", "short.chroc.cc"]);
  expect(plan.routes[0].service).toContain(`:${plan.shortenerPort}`);
  expect(plan.routes[1].service).toContain(`:${plan.consolePort}`);
  expect(plan.shortenerPort).not.toBe(plan.consolePort);
});

test("the API key is only handed over when explicitly asked for", async ({ page }) => {
  await authenticate(page);
  await configure(page, {
    domain: "chroc.cc", adminHost: "", upstream: "http://127.0.0.1:9",
    rootRedirectMode: "notfound", enabled: true,
  });
  await page.evaluate(async () => {
    await fetch("/api/v1/shortener/key", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "abcdef0123456789abcdef0123456789" }),
    });
  });

  // Never in the status the console polls.
  const status = await page.evaluate(async () => await fetch("/api/v1/shortener").then(r => r.text()));
  expect(status).not.toContain("abcdef0123456789");

  // Only from the endpoint that exists to reveal it.
  const revealed = await page.evaluate(async () =>
    (await fetch("/api/v1/shortener/key/reveal", { method: "POST" }).then(r => r.json())) as { apiKey: string });
  expect(revealed.apiKey).toBe("abcdef0123456789abcdef0123456789");
});

test("a server can ask for the shortener without touching the command line", async ({ page }) => {
  await authenticate(page);
  await configure(page, {
    domain: "chroc.cc", adminHost: "", upstream: "http://127.0.0.1:9",
    rootRedirectMode: "notfound", enabled: false,
  });

  const asked = await page.evaluate(async () => {
    await fetch("/api/v1/shortener/install", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested: true }),
    });
    return await fetch("/api/v1/shortener").then(r => r.json()) as { installRequestedFor: string | null };
  });

  // Recorded for the domain that is configured, which is what ticking the box
  // means once one is set.
  expect(asked.installRequestedFor).toBe("chroc.cc");

  const withdrawn = await page.evaluate(async () => {
    await fetch("/api/v1/shortener/install", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested: false }),
    });
    return await fetch("/api/v1/shortener").then(r => r.json()) as { installRequestedFor: string | null };
  });
  expect(withdrawn.installRequestedFor).toBeNull();
});

test("an install request is refused without a domain to install for", async ({ page }) => {
  await authenticate(page);
  await configure(page, { domain: "", adminHost: "", upstream: "", rootRedirectMode: "notfound", enabled: false });

  const status = await page.evaluate(async () => {
    const response = await fetch("/api/v1/shortener/install", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested: true }),
    });
    return response.status;
  });
  expect(status).toBe(400);
});

test("the way to install it stays on screen until it is actually running", async ({ page }) => {
  await authenticate(page);
  // A domain saved but nothing installed is exactly when somebody needs the
  // switch, and keying it on "not installed" made it disappear at that point.
  await configure(page, {
    domain: "chroc.cc", adminHost: "", upstream: "http://127.0.0.1:9",
    rootRedirectMode: "notfound", enabled: true,
  });

  const panel = await openSection(page);
  await expect(panel.getByText("Install it on this server")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Install the URL shortener" })).toBeVisible();
  // And exactly one place to type the domain, not two.
  await expect(panel.getByLabel(/^Short domain/)).toHaveCount(1);
});

test("turning it on settles every setting that follows from the domain", async ({ page }) => {
  await authenticate(page);
  await configure(page, { domain: "", adminHost: "", upstream: "", rootRedirectMode: "notfound", enabled: false });

  const after = await page.evaluate(async () => {
    await fetch("/api/v1/shortener/install", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested: true, domain: "chroc.cc" }),
    });
    return await fetch("/api/v1/shortener").then(r => r.json()) as {
      domain: string; adminHost: string; upstream: string; enabled: boolean; installRequestedFor: string | null;
    };
  });

  // Nothing left for an administrator to fill in by hand.
  expect(after.domain).toBe("chroc.cc");
  expect(after.adminHost).toBe("short.chroc.cc");
  expect(after.upstream).not.toBe("");
  expect(after.enabled).toBe(true);
  expect(after.installRequestedFor).toBe("chroc.cc");
});

test("a domain that is not a domain is refused before anything is recorded", async ({ page }) => {
  await authenticate(page);
  const result = await page.evaluate(async () => {
    // Start from nothing recorded, so this is about the refusal and not about
    // whatever an earlier test left behind.
    await fetch("/api/v1/shortener/install", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested: false }),
    });
    const response = await fetch("/api/v1/shortener/install", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested: true, domain: "not a domain" }),
    });
    const status = response.status;
    const state = await fetch("/api/v1/shortener").then(r => r.json()) as { installRequestedFor: string | null };
    return { status, requested: state.installRequestedFor };
  });
  expect(result.status).toBe(400);
  expect(result.requested).toBeNull();
});
