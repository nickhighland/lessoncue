// The shortener stack has security properties that are easy to lose in an
// edit: the database must never be published, the companion must keep the API
// key server-side, and both published ports must stay on loopback so the tunnel
// is the normal way in. Checked here rather than trusted to review.
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const compose = readFileSync("compose.yaml", "utf8");
const installer = readFileSync("scripts/shortener-install.sh", "utf8");
const updater = readFileSync("scripts/shortener-update.sh", "utf8");
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const section = (name) => {
  const start = compose.indexOf(`\n  ${name}:`);
  if (start < 0) return "";
  const rest = compose.slice(start + 1);
  const next = rest.search(/\n  [a-z][a-z0-9-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next);
};

const publishedPorts = (service) => {
  const start = service.search(/^\s+ports:\s*$/m);
  if (start < 0) return [];
  const rest = service.slice(start).split("\n").slice(1);
  const ports = [];
  for (const line of rest) {
    if (/^\s+#/.test(line)) continue;
    const item = line.match(/^\s+- "?([^"]+)"?\s*$/);
    if (!item) break;
    ports.push(item[1]);
  }
  return ports;
};

const db = section("shlink-db");
const shlink = section("shlink");
const client = section("shlink-web-client");

check(db.length > 0 && shlink.length > 0 && client.length > 0, "the shortener services are missing from compose.yaml");
check(!/^\s+ports:/m.test(db), "shlink-db must not publish a port: the database is never reachable from outside");
check(/expose:/.test(db), "shlink-db should expose its port to the compose network only");

// Short links are public through the tunnel, so the shortener itself stays on
// loopback and the tunnel is the way in.
for (const port of publishedPorts(shlink))
  check(port.includes("SHORTENER_BIND:-127.0.0.1"),
    `shlink publishes ${port.trim()} without defaulting to loopback; the tunnel should be the way in unless an operator chooses otherwise`);

// The companion has its own login and is published directly for the
// management hostname. It still binds to loopback so the tunnel remains the
// normal public route.
check(publishedPorts(client).length === 1,
  "the companion must publish exactly one management port");
for (const port of publishedPorts(client))
  check(port.includes("SHORTENER_UI_BIND:-127.0.0.1"),
    "the companion must publish on loopback, so the tunnel stays the way in");
check(/build:\s*\n\s+context: \.\/shortener-companion/.test(client),
  "the management service must build from the pinned LessonCue companion source");
check(/SHLINK_API_URL: "http:\/\/shlink:8080\/rest\/v3"/.test(client),
  "the companion must call Shlink over the private compose network");
check(/SHLINK_API_KEY_FILE: \/run\/secrets\/shortener_console_key/.test(client),
  "the Shlink API key must reach the companion through a secret file");
check(!/SHLINK_SERVER_API_KEY|SHORTENER_UI_API_KEY|SHLINK_API_KEY:/.test(client),
  "the browser client must not receive an inline Shlink API key");
check(/COMPANION_PASSWORD_RESET_FILE: \/var\/lib\/companion-control\/password-reset/.test(client),
  "the companion must expose the LessonCue password reset control path");
check(/\/var\/www\/companion\/data/.test(client) && /\/var\/lib\/companion-control/.test(client),
  "the companion must persist UI data and mount its private control directory");
check(/secrets:\s*\n\s+- shortener_console_key/.test(client),
  "the companion must consume the scoped console key as a Compose secret");
// Inside these images localhost resolves to ::1 alone while the servers bind
// IPv4. A healthcheck aimed at localhost reported a working console as down.
for (const [name, service] of [["shlink", shlink], ["shlink-web-client", client]])
  check(!/test:.*localhost/.test(service),
    `${name}'s healthcheck must use 127.0.0.1: localhost is IPv6-only in these images`);

check(/DB_DRIVER: postgres/.test(shlink), "the shortener must run on postgres, not sqlite");
check(/SHORT_URL_MODE: loose/.test(shlink), "loose mode is what makes a code typed in lower case resolve");
check(/_FILE:/.test(shlink), "credentials should reach the shortener as files, not inline values");
check(/profiles: \["shortener"\]/.test(shlink), "the shortener must stay behind its compose profile");
check(!section("shlink-web-gate"), "the old unauthenticated web client gate must not return");
check(/shortener_console_key:\s*\n\s+file:/.test(compose), "compose must declare the companion API-key secret");
check(/docker rm -f lessoncue-shlink-gate/.test(installer) && /docker rm -f lessoncue-shlink-gate/.test(updater),
  "the install and update paths must remove the obsolete v0.45.1 management gate before binding its port");
check(/ui_health/.test(updater), "the shortener updater must wait for the Companion as well as Shlink");

// No installation's domain belongs in a file everyone ships.
for (const domain of ["chroc.cc", "cityhope"])
  check(!compose.toLowerCase().includes(domain), `compose.yaml must not name ${domain}: the short domain is configuration`);

// The release bundle flattens these scripts next to compose.yaml, while the
// repository keeps them in scripts/ with compose.yaml a level up. A script that
// assumed one layout ran in the wrong directory on every real server, found no
// compose file, and reported only that the shortener had not started. Checked
// by running them, because reading the line is exactly what missed it.
const layouts = [
  { name: "release bundle", script: (root) => root },
  { name: "repository", script: (root) => join(root, "scripts") },
];

// Run the installer with a stub docker that records the directory it was
// called from. Reading the cd line is exactly what missed this the first time,
// so the check asks where compose actually ran.
for (const layout of layouts) {
  const root = mkdtempSync(join(tmpdir(), "shortener-layout-"));
  try {
    const here = layout.script(root);
    mkdirSync(here, { recursive: true });
    mkdirSync(join(root, "bin"), { recursive: true });
    cpSync("compose.yaml", join(root, "compose.yaml"));
    cpSync("shortener-companion", join(root, "shortener-companion"), { recursive: true });
    cpSync(join("scripts", "shortener-install.sh"), join(here, "install.sh"));

    const record = join(root, "where");
    writeFileSync(join(root, "bin", "docker"),
      `#!/bin/sh\npwd > ${record}\necho "$@" >> ${record}.args\nexit 1\n`);
    chmodSync(join(root, "bin", "docker"), 0o755);

    spawnSync("bash", [join(here, "install.sh"), "short.example.test"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${join(root, "bin")}:${process.env.PATH}`,
        SHORTENER_DATA_DIR: join(root, "data"),
        LESSONCUE_DATA_PATH: join(root, "lessoncue"),
      },
    });

    const ran = existsSync(record) ? readFileSync(record, "utf8").trim() : "(docker was never reached)";
    check(existsSync(join(ran, "compose.yaml")),
      `in the ${layout.name} layout the installer ran docker in ${ran}, which has no compose.yaml`);

    // The domain has to outlive this one shell: every later compose command
    // runs without it, and reads it from here.
    const env = existsSync(join(ran, ".env")) ? readFileSync(join(ran, ".env"), "utf8") : "";
    check(/^SHORT_DOMAIN=short\.example\.test$/m.test(env),
      `in the ${layout.name} layout the installer did not record SHORT_DOMAIN where compose reads it`);

    // This compose file also describes LessonCue itself. The installer must
    // start only the database and Shlink first, then the companion after its
    // scoped key exists -- never build LessonCue itself on a native install.
    const args = existsSync(`${record}.args`) ? readFileSync(`${record}.args`, "utf8") : "";
    const ups = args.split("\n").filter((line) => line.includes(" up "));
    const firstUp = ups[0];
    check(firstUp !== undefined && ["shlink-db", "shlink"].every((s) => firstUp.split(/\s+/).includes(s)),
      `in the ${layout.name} layout the installer must start Shlink before the companion, got: ${firstUp ?? "(no up)"}`);
    check(ups.every((line) => !line.split(/\s+/).includes("lessoncue")),
      `in the ${layout.name} layout the installer must not start LessonCue itself`);

    // The first `up` fails in this test stub, so these are the files that must
    // already exist before Compose is asked to start anything. The reset file
    // is intentionally private; the two API keys are readable by containers.
    const reset = join(root, "lessoncue", "config", "shortener", "companion-control", "password-reset");
    const companionData = join(root, "lessoncue", "config", "shortener", "companion-data");
    check(existsSync(reset),
      `in the ${layout.name} layout the installer must create the companion reset file before compose runs`);
    check(existsSync(companionData),
      `in the ${layout.name} layout the installer must create the companion data directory before compose runs`);

    for (const secret of [join(root, "data", "db-password"),
                          join(root, "lessoncue", "config", "shortener", "integration-key"),
                          join(root, "lessoncue", "config", "shortener", "console-key")]) {
      check(existsSync(secret) && (statSync(secret).mode & 0o044) === 0o044,
        `${secret.replace(root, "")} must be readable by the unprivileged user the container runs as`);
    }
    check(existsSync(reset) && (statSync(reset).mode & 0o400) === 0o400 && (statSync(reset).mode & 0o077) === 0,
      `${reset.replace(root, "")} must be private to the LessonCue/companion account`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// And it must still say so plainly when the compose file really is absent,
// rather than running somewhere unexpected.
for (const script of ["shortener-install.sh", "shortener-update.sh"]) {
  const orphan = mkdtempSync(join(tmpdir(), "shortener-orphan-"));
  try {
    cpSync(join("scripts", script), join(orphan, script));
    const run = spawnSync("bash", [join(orphan, script)], { encoding: "utf8" });
    check(run.status === 1 && `${run.stderr}`.includes("Cannot find compose.yaml"),
      `${script} must report a missing compose.yaml rather than run in the wrong directory`);
  } finally {
    rmSync(orphan, { recursive: true, force: true });
  }
}

if (failures.length) {
  console.error("Shortener compose check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Shortener compose valid: database unpublished, ports on loopback, companion API key server-side.");
