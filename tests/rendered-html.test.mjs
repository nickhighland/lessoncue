import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("ships the product-specific social card and removes the starter preview", async () => {
  const [layout, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  assert.match(layout, /openGraph/);
  assert.match(layout, /summary_large_image/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("includes phase-two deployment reliability workflows", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Pair a television/);
  assert.match(page, /Stored local schedule/);
  assert.match(page, /Backups/);
  assert.match(page, /Users & permissions/);
  assert.match(page, /Audit log/);
  assert.match(page, /Network readiness/);
});

test("includes phases three through six", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /FFmpeg workers/);
  assert.match(page, /Analyzing loudness/);
  assert.match(page, /Rendering 14 slides/);
  assert.match(page, /Emergency announcement/);
  assert.match(page, /Burn-in shift active/);
  assert.match(page, /Native tvOS client/);
  assert.match(page, /Shared LessonCue protocol/);
  assert.match(page, /Security readiness gates/);
  assert.match(page, /Enable secure relay/);
  assert.match(page, /does not download from third-party streaming services/);
});
