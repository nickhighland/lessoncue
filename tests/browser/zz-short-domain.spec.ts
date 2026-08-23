import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/adminSession";

// The bare root of the short domain is the only path LessonCue answers there.

test.use({ serviceWorkers: "block" });

const authenticate = (page: Page) => signInAsAdmin(page, "Short Domain");

const openSection = async (page: Page) => {
  await page.getByRole("button", { name: /Settings$/ }).click();
  await page.getByRole("button", { name: /Connections/ }).click();
  const panel = page.locator(".settings-panel").filter({ hasText: "URL shortener" });
  await expect(panel.getByRole("heading", { name: "URL shortener" })).toBeVisible({ timeout: 20_000 });
  return panel;
};

test("an administrator sets the short domain and where its root should go", async ({ page }) => {
  await authenticate(page);
  const panel = await openSection(page);

  await panel.getByLabel("Short domain", { exact: true }).fill("go.example.org");
  await panel.getByLabel("Where the shortener is reachable", { exact: true }).fill("http://shlink:8080");
  await panel.getByLabel("Destination", { exact: true }).fill("https://www.example.org");
  await panel.getByRole("button", { name: "Save", exact: true }).click();

  // The domain is shown back, rather than any fixed example.
  await expect(panel).toContainText("go.example.org → https://www.example.org/", { timeout: 20_000 });

  const saved = await page.evaluate(async () => (await fetch("/api/v1/short-domain").then(r => r.json())) as {
    domain: string; rootRedirectUrl: string; permanent: boolean; preserveQuery: boolean; rootRedirectEnabled: boolean;
  });
  expect(saved.domain).toBe("go.example.org");
  expect(saved.rootRedirectUrl).toBe("https://www.example.org/");
  // The safe choices are the defaults.
  expect(saved.permanent).toBe(false);
  expect(saved.preserveQuery).toBe(true);
  expect(saved.rootRedirectEnabled).toBe(true);
});

test("a destination that points back at the short domain is refused", async ({ page }) => {
  await authenticate(page);
  const rejected = await page.evaluate(async () => {
    const response = await fetch("/api/v1/short-domain", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "go.example.org", upstream: "http://shlink:8080",
        rootRedirectUrl: "https://go.example.org", rootRedirectEnabled: true,
      }),
    });
    return { status: response.status, body: await response.text() };
  });
  expect(rejected.status).toBe(400);
  expect(rejected.body).toContain("back to itself");
});

test("a destination that is not a web address is refused", async ({ page }) => {
  await authenticate(page);
  for (const destination of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd"]) {
    const status = await page.evaluate(async url => (await fetch("/api/v1/short-domain", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "go.example.org", upstream: "http://shlink:8080",
        rootRedirectUrl: url, rootRedirectEnabled: true,
      }),
    })).status, destination);
    expect(status, `${destination} must be refused`).toBe(400);
  }
});

test("turning the redirect off offers a choice of what the root does instead", async ({ page }) => {
  await authenticate(page);
  const panel = await openSection(page);
  await panel.getByLabel("Short domain", { exact: true }).fill("go.example.org");
  await panel.getByLabel("Where the shortener is reachable", { exact: true }).fill("http://shlink:8080");

  // With the redirect on there is a destination to fill in and no fallback to
  // pick; with it off, the reverse.
  await expect(panel.getByLabel("Destination", { exact: true })).toBeVisible();
  await expect(panel.getByRole("combobox", { name: "Root-domain behavior" })).toHaveCount(0);

  await panel.getByRole("checkbox", { name: /Redirect the root short domain/ }).setChecked(false);
  const behavior = panel.getByRole("combobox", { name: "Root-domain behavior" });
  await expect(behavior).toBeVisible();
  await expect(panel.getByLabel("Destination", { exact: true })).toHaveCount(0);
  await expect(behavior).toHaveValue("shortener");
  await behavior.selectOption("notfound");
  await expect(behavior).toHaveValue("notfound");
});

test("a saved fallback is what the console reports back", async ({ page }) => {
  await authenticate(page);
  await page.evaluate(async () => {
    await fetch("/api/v1/short-domain", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "go.example.org", upstream: "http://shlink:8080",
        rootRedirectUrl: "", rootRedirectEnabled: false, rootFallback: "notfound",
      }),
    });
  });
  const panel = await openSection(page);
  await expect(panel).toContainText("go.example.org → 404");
  await expect(panel.getByRole("combobox", { name: "Root-domain behavior" })).toHaveValue("notfound");
});
