import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const runner = fileURLToPath(new URL("../scripts/ai-real-use-runner.mjs", import.meta.url));
const fixtures = fileURLToPath(new URL("../scripts/ai-real-use-fixtures.mjs", import.meta.url));

test("inventory profile creates a complete, non-mutating coverage package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lessoncue-ai-runner-test-"));
  try {
    execFileSync(process.execPath, [runner, "--profile", "inventory", "--run-id", "LC-TEST-INVENTORY", "--output", directory], { cwd: root, stdio: "pipe" });
    const [coverage, results, summary] = await Promise.all([
      readFile(join(directory, "coverage.md"), "utf8"),
      readFile(join(directory, "results.csv"), "utf8").catch(() => ""),
      readFile(join(directory, "run-summary.md"), "utf8"),
    ]);
    assert.match(coverage, /AUTH-001/);
    assert.match(coverage, /SIGN-011/);
    assert.match(summary, /Profile \*\*inventory\*\*/);
    assert.match(results, /test_id,journey/);
    assert.match(results, /AUTH-001/);
    assert.match(results, /,NOT RUN,/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fixture generator records positive, negative, and blocked rows without touching app data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lessoncue-ai-fixture-test-"));
  try {
    execFileSync(process.execPath, [fixtures, "--run-id", "LC-TEST-FIXTURES", "--output", directory], { cwd: root, stdio: "pipe" });
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    const names = new Set(manifest.rows.map(row => row.fileName));
    assert(names.has("STEREO-D.wav"));
    assert(names.has("THREE-SLIDE.pdf"));
    assert(names.has("INVALID-zero-byte.png"));
    assert(manifest.rows.some(row => row.status === "generated"));
    assert(manifest.rows.some(row => row.status === "negative-fixture"));
    assert.equal(manifest.output, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
