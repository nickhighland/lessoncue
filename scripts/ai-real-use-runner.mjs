#!/usr/bin/env node

/**
 * Safe orchestration entry point for docs/ai-real-use-stress-test-playbook.md.
 *
 * The runner owns evidence and command boundaries. It does not use a shell,
 * does not accept credentials as arguments, and never runs destructive/full
 * profiles against a remote target unless the operator explicitly confirms a
 * disposable environment.
 */

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { platform, release } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const playbookPath = join(root, "docs", "ai-real-use-stress-test-playbook.md");
const argv = process.argv.slice(2);

function valueFor(name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function has(name) { return argv.includes(name); }

const profile = valueFor("--profile", "smoke");
const runId = valueFor("--run-id", `LC-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)}-AI`);
const output = resolve(valueFor("--output", join(root, "test-runs", runId)));
const target = valueFor("--target", "local");
const baseUrl = valueFor("--base-url", process.env.PLAYWRIGHT_BASE_URL ?? "");
const includeAndroid = has("--include-android");
const allExtensions = has("--all-extensions");
const confirm = valueFor("--confirm", process.env.LESSONCUE_AI_CONFIRM ?? "");
const e2eSuffix = runId.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 48);

const profiles = new Set(["inventory", "fixtures", "smoke", "browser", "full"]);
if (!profiles.has(profile)) throw new Error(`Unknown profile '${profile}'. Choose inventory, fixtures, smoke, browser, or full.`);
if (target !== "local" && !baseUrl) throw new Error("A non-local target requires --base-url.");
if (baseUrl && target === "local") throw new Error("--base-url requires --target remote and --confirm DISPOSABLE; the runner will not assume an external host is local.");
if (target !== "local" && confirm !== "DISPOSABLE") {
  throw new Error("Remote targets require --confirm DISPOSABLE. The runner refuses to mutate an unconfirmed host.");
}
if (profile === "full" && confirm !== "DISPOSABLE") {
  throw new Error("The full profile requires --confirm DISPOSABLE, even for a local target.");
}

await mkdir(join(output, "evidence", "logs"), { recursive: true });
await mkdir(join(output, "evidence", "screenshots"), { recursive: true });
await mkdir(join(output, "evidence", "network"), { recursive: true });
await mkdir(join(output, "findings"), { recursive: true });

const timeline = [];
const commandResults = [];
const now = () => new Date().toISOString();
const log = message => {
  const line = `[${now()}] ${message}`;
  timeline.push(line);
  console.log(line);
};

function commandText(command, args) {
  return [command, ...args].map(value => /\s/.test(value) ? JSON.stringify(value) : value).join(" ");
}

function syncCapture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 20_000, maxBuffer: 1_000_000 });
  return result.status === 0 ? (result.stdout ?? "").trim() : `unavailable (${result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`})`;
}

async function runCommand(name, command, args, ids = [], options = {}) {
  const logName = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.log`;
  const logPath = join(output, "evidence", "logs", logName);
  if (options.blockedReason) {
    await writeFile(logPath, `BLOCKED: ${options.blockedReason}\n`);
    const result = {
      id: `AUTO-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
      name,
      command: commandText(command, args),
      result: "BLOCKED",
      exitCode: null,
      durationMs: 0,
      log: logPath,
      ids,
      note: options.blockedReason,
    };
    commandResults.push(result);
    log(`BLOCKED ${name}: ${options.blockedReason}; log=${logPath}`);
    return result;
  }
  const logStream = createWriteStream(logPath, { flags: "w" });
  const started = Date.now();
  log(`START ${name}: ${commandText(command, args)}`);
  const child = spawn(command, args, {
    cwd: root,
    env: {
      ...process.env,
      LESSONCUE_AI_RUN_ID: runId,
      ...(baseUrl ? { PLAYWRIGHT_BASE_URL: baseUrl } : {}),
      ...(options.env ?? {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", chunk => { logStream.write(chunk); process.stdout.write(chunk); });
  child.stderr.on("data", chunk => { logStream.write(chunk); process.stderr.write(chunk); });
  const exitCode = await new Promise(resolveExit => {
    child.on("error", error => { logStream.write(`${error.stack ?? error}\n`); resolveExit(127); });
    child.on("close", code => resolveExit(code ?? 1));
  });
  logStream.end();
  const result = {
    id: `AUTO-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
    name,
    command: commandText(command, args),
    result: exitCode === 0 ? "PASS" : "FAIL",
    exitCode,
    durationMs: Date.now() - started,
    log: logPath,
    ids,
    note: options.note ?? "",
  };
  commandResults.push(result);
  log(`${result.result} ${name} (${result.durationMs} ms); log=${logPath}`);
  return result;
}

function parsePlaybookIds(markdown) {
  const rows = [];
  const seen = new Set();
  for (const match of markdown.matchAll(/^###\s+([A-Z][A-Z0-9]*-\d+)\s+—\s+(.+)$/gm)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, title: match[2], result: "NOT RUN", evidence: "", note: "" });
  }
  return rows;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeCoverage(markdown, rows) {
  const signageStart = markdown.indexOf("### SIGN-003");
  const signageEnd = markdown.indexOf("### SIGN-004", signageStart);
  const signageElements = signageStart >= 0 && signageEnd > signageStart
    ? [...markdown.slice(signageStart, signageEnd).matchAll(/^\|\s*([^|]+?)\s*\|/gm)]
      .map(match => match[1]).filter(value => value !== "Zone" && !/^---+$/.test(value))
    : [];
  const lines = [
    `# AI stress coverage — ${runId}`,
    "",
    `Generated: ${now()}`,
    `Profile: ${profile}`,
    `Target: ${target}${baseUrl ? ` (${baseUrl})` : ""}`,
    "",
    `The playbook yielded ${rows.length} executable procedure rows and ${signageElements.length} focused signage-element rows.`,
    "",
    "| Test ID | Procedure | Result | Evidence | Notes |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(row => `| ${row.id} | ${row.title.replaceAll("|", "\\|")} | ${row.result} | ${row.evidence || ""} | ${row.note || ""} |`),
    "",
    "Automated command results are listed separately in `results.csv`. A passing build or browser test does not automatically mark every manual, physical-device, visual, or load procedure as passed.",
  ];
  await writeFile(join(output, "coverage.md"), lines.join("\n") + "\n");
}

async function writeEnvironment(markdown) {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const lines = [
    `# Environment — ${runId}`,
    "",
    `- Run ID: ${runId}`,
    `- Started: ${timeline[0]?.slice(1, 25) ?? now()}`,
    `- Profile: ${profile}`,
    `- Target: ${target}`,
    `- Base URL: ${baseUrl || "local Playwright server"}`,
    `- Repository: ${root}`,
    `- Commit: ${syncCapture("git", ["rev-parse", "HEAD"])}`,
    `- Branch: ${syncCapture("git", ["branch", "--show-current"])}`,
    `- Dirty worktree: ${syncCapture("git", ["status", "--short"]) || "no"}`,
    `- Node: ${process.version}`,
    `- npm: ${syncCapture("npm", ["--version"])}`,
    `- OS: ${platform()} ${release()}`,
    `- Package version: ${packageJson.version}`,
    `- Playbook bytes: ${Buffer.byteLength(markdown)}`,
    `- ffmpeg: ${syncCapture("ffmpeg", ["-version"]).split("\n")[0]}`,
    `- ffprobe: ${syncCapture("ffprobe", ["-version"]).split("\n")[0]}`,
    `- Android SDK/emulator: ${process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "not declared"}`,
    "",
    "Secrets are intentionally not collected. Add sanitized server/device/network details manually when a run is authorized to include them.",
  ];
  await writeFile(join(output, "environment.md"), lines.join("\n") + "\n");
}

async function writeResults(rows) {
  const headers = ["test_id", "journey", "persona", "client", "start_time", "end_time", "result", "observed", "expected", "evidence", "issue_id", "notes"];
  const lines = [headers.join(",")];
  for (const row of rows) lines.push([
    row.id, "playbook coverage", "AI operator", "not run", "", "", row.result, "", row.title,
    row.evidence, "", row.note,
  ].map(csvCell).join(","));
  for (const result of commandResults) lines.push([
    result.id, "automated command", "AI runner", "repository", "", "", result.result,
    `exit=${result.exitCode}; duration_ms=${result.durationMs}`, "command completed with exit 0",
    result.log, "", `${result.command}; mapped coverage: ${result.ids.join(" ")}`,
  ].map(csvCell).join(","));
  await writeFile(join(output, "results.csv"), lines.join("\n") + "\n");
}

async function writeSummary(rows) {
  const commandFailures = commandResults.filter(result => result.result === "FAIL");
  const commandBlocked = commandResults.filter(result => result.result === "BLOCKED");
  const warningLines = [];
  for (const result of commandResults) {
    const text = await readFile(result.log, "utf8").catch(() => "");
    for (const line of text.split("\n")) {
      if (/HTTP request returned a failure status|Unhandled exception|\bANR\b|\b(crash|corruption|secret)\b/i.test(line)) warningLines.push(`${basename(result.log)}: ${line.trim()}`);
    }
  }
  const generated = rows.filter(row => row.result === "PASS").length;
  const lines = [
    `# AI real-use stress run — ${runId}`,
    "",
    `Profile **${profile}** completed against **${target}** at ${now()}.`,
    "",
    "## Outcome",
    "",
    commandFailures.length
      ? `Automated command failures: **${commandFailures.length}**. See command logs before attempting repair.`
      : commandBlocked.length
        ? `Automated commands passed where runnable; **${commandBlocked.length}** command(s) are BLOCKED by recorded prerequisites.`
        : "All selected automated commands passed.",
    `Playbook procedures explicitly passed: **${generated}**; remaining procedures are intentionally **NOT RUN** until their client, fixture, device, or safety prerequisite is provisioned.`,
    "",
    "## Automated commands",
    "",
    ...commandResults.map(result => `- ${result.result}: **${result.name}** — [log](${result.log.replace(`${output}/`, "")})`),
    "",
    "## Log observations",
    "",
    ...(warningLines.length
      ? warningLines.slice(0, 80).map(line => `- ${line}`)
      : ["- No matching warning patterns were found in command logs."]),
    "",
    "## Product-critic handoff",
    "",
    "Review each real journey using the observation template in the playbook. Do not convert a passing command into a product-quality recommendation without screenshot, timing, accessibility, or user-journey evidence.",
    "",
    "## Explicit limits",
    "",
    "- This runner does not claim physical TV-panel, physical-remote, venue-audio, or public-network results.",
    "- Destructive, load, update, restore, and remote-target profiles require explicit disposable confirmation and remain separately reviewable.",
    "- A clean automated browser server is not evidence that an installed VM has every prerequisite.",
    "",
    `Full evidence: [coverage](coverage.md), [environment](environment.md), [results](results.csv), [timeline](timeline.md).`,
  ];
  await writeFile(join(output, "run-summary.md"), lines.join("\n") + "\n");
  await writeFile(join(output, "product-review.md"), [
    `# Product review — ${runId}`,
    "",
    "Use this file after each journey. Keep observations evidence-linked and separate confirmed defects from feature ideas.",
    "",
    "```text",
    "USER GOAL:",
    "FIRST VISIBLE NEXT STEP:",
    "STEPS / PAGE CHANGES / WAITS:",
    "HESITATIONS OR WRONG TURNS:",
    "WHAT THE PRODUCT COMMUNICATED WELL:",
    "WHAT WAS UNCLEAR OR CONVOLUTED:",
    "ERROR PREVENTION AND RECOVERY:",
    "VISUAL AND ACCESSIBILITY OBSERVATIONS:",
    "MISSING CAPABILITY OR AUTOMATION:",
    "EVIDENCE:",
    "RECOMMENDATION CLASS / SCORE / ACCEPTANCE CRITERIA:",
    "```",
    "",
    "Rank recommendations by user impact, reach, confidence, effort, and risk reduction. Include rejected ideas and why they should not be built yet.",
  ].join("\n") + "\n");
}

const markdown = await readFile(playbookPath, "utf8");
const rows = parsePlaybookIds(markdown);
log(`Created run ${runId}; profile=${profile}; output=${output}`);
await writeEnvironment(markdown);
await writeCoverage(markdown, rows);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const fixtureArgs = ["scripts/ai-real-use-fixtures.mjs", "--run-id", runId, "--output", join(output, "fixtures"), ...(allExtensions ? ["--all-extensions"] : [])];
const playwrightArgs = (...specs) => ["exec", "--", "playwright", "test", "--output", join(output, "evidence", "playwright"), ...specs];

if (profile === "inventory") {
  log("Inventory only: no application or fixture mutation was requested.");
} else if (profile === "fixtures") {
  await runCommand("fixture generation", process.execPath, fixtureArgs, ["MEDIA-001", "MEDIA-004"]);
} else {
  await runCommand("fixture generation", process.execPath, fixtureArgs, ["MEDIA-001", "MEDIA-004"]);
  await runCommand("protocol contract", npm, ["run", "test:protocol"], ["PRE-004"]);
  await runCommand("admin typecheck and build", npm, ["test"], ["PRE-004"]);
  if (profile === "smoke") {
    await runCommand("display and signage conformance", npm, playwrightArgs("tests/browser/display-conformance.spec.ts", "tests/browser/signage-relative-sizing.spec.ts"), ["SIGN-003", "SIGN-009", "SCREEN-005"]);
    await runCommand("accessibility automation", npm, playwrightArgs("tests/browser/zz-accessibility.spec.ts"), ["A11Y-001", "A11Y-002", "A11Y-003"]);
  }
  if (profile === "browser" || profile === "full") {
    const note = baseUrl ? "External target supplied; ensure it is the disposable installation and that the test account is already provisioned." : "Playwright owns an isolated local server/data path.";
    await runCommand("browser real-use workflow", npm, playwrightArgs(), ["AUTH-001", "CLASS-001", "LES-001", "MEDIA-001", "SCREEN-001", "CTRL-001", "AUD-001", "SIGN-001", "SIGN-009"], {
      note,
      env: baseUrl ? {} : { LESSONCUE_E2E_DATA_PATH: `/tmp/lessoncue-e2e-${e2eSuffix}`, LESSONCUE_E2E_PORT: "5117" },
    });
  }
  if (profile === "full" && includeAndroid) {
    const gradle = existsSync(join(root, "android-tv", "gradlew"))
      ? (process.platform === "win32" ? "gradlew.bat" : "./gradlew")
      : "gradle";
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    await runCommand("Android TV unit tests", gradle, ["-p", "android-tv", ":app:testSideloadDebugUnitTest", ":app:testStoreDebugUnitTest"], ["REMOTE-001", "REMOTE-002", "UPDATE-002"], {
      note: "Physical/instrumentation tests remain separate and are never inferred from JVM tests.",
      blockedReason: sdk ? "" : "ANDROID_HOME or ANDROID_SDK_ROOT is not configured; Android unit/instrumentation tests are BLOCKED.",
    });
  }
}

await writeFile(join(output, "timeline.md"), `# Timeline — ${runId}\n\n${timeline.join("\n")}\n`);
await writeResults(rows);
await writeSummary(rows);

const failed = commandResults.filter(result => result.result === "FAIL");
console.log(`Evidence written to ${output}`);
if (failed.length) process.exitCode = 1;
