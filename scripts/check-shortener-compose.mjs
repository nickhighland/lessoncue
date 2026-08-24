// The shortener stack has security properties that are easy to lose in an
// edit: the database must never be published, the console must carry no
// credentials, and both published ports must stay on loopback so the tunnel is
// the only way in. Checked here rather than trusted to review.
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const compose = readFileSync("compose.yaml", "utf8");
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const section = (name) => {
  const start = compose.indexOf(`\n  ${name}:`);
  if (start < 0) return "";
  const rest = compose.slice(start + 1);
  const next = rest.search(/\n  [a-z][a-z0-9-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next);
};

const db = section("shlink-db");
const shlink = section("shlink");
const client = section("shlink-web-client");

check(db.length > 0 && shlink.length > 0 && client.length > 0, "the shortener services are missing from compose.yaml");
check(!/^\s+ports:/m.test(db), "shlink-db must not publish a port: the database is never reachable from outside");
check(/expose:/.test(db), "shlink-db should expose its port to the compose network only");

// Short links are public through the tunnel, so the shortener itself stays on
// loopback and the tunnel is the way in.
for (const port of shlink.match(/^\s+- "([^"]+)"/gm) ?? [])
  check(port.includes("SHORTENER_BIND:-127.0.0.1"),
    `shlink publishes ${port.trim()} without defaulting to loopback; the tunnel should be the way in unless an operator chooses otherwise`);

// The console is the opposite trade: it arrives holding a key, so it is
// reachable on the local network and must never be routed publicly by default.
for (const port of client.match(/^\s+- "([^"]+)"/gm) ?? [])
  check(port.includes("SHORTENER_UI_BIND"),
    `shlink-web-client should use its own bind setting, not the shortener's`);

// The console is pre-filled on purpose, which is only safe while it stays off
// the public internet. Guard the thing that makes it safe.
// Published on its own hostname, so a key baked in here is a key given away.
check(/SHLINK_SERVER_API_KEY: "\$\{SHORTENER_UI_API_KEY:-\}"/.test(client),
  "shlink-web-client must not carry an API key by default: it is served to any browser that reaches its hostname");
// Matched on a single word: the sentence wraps across comment lines.
check(/Cloudflare/.test(client),
  "the console's comment must keep saying what makes exposing it safe");
// Inside these images localhost resolves to ::1 alone while the servers bind
// IPv4. A healthcheck aimed at localhost reported a working console as down.
for (const [name, service] of [["shlink", shlink], ["shlink-web-client", client]])
  check(!/test:.*localhost/.test(service),
    `${name}'s healthcheck must use 127.0.0.1: localhost is IPv6-only in these images`);

check(/DB_DRIVER: postgres/.test(shlink), "the shortener must run on postgres, not sqlite");
check(/SHORT_URL_MODE: loose/.test(shlink), "loose mode is what makes a code typed in lower case resolve");
check(/_FILE:/.test(shlink), "credentials should reach the shortener as files, not inline values");
check(/profiles: \["shortener"\]/.test(shlink), "the shortener must stay behind its compose profile");

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

    // This compose file also describes LessonCue itself. A bare `up` tries to
    // build it -- there is no build context in the bundle -- and on a native
    // install would then contend for the port the real server is already on.
    const args = existsSync(`${record}.args`) ? readFileSync(`${record}.args`, "utf8") : "";
    const up = args.split("\n").find((line) => line.includes(" up "));
    check(up !== undefined && ["shlink-db", "shlink", "shlink-web-client"].every((s) => up.split(/\s+/).includes(s)),
      `in the ${layout.name} layout the installer must name the shortener services to start, got: ${up ?? "(no up)"}`);
    check(up === undefined || !up.split(/\s+/).includes("lessoncue"),
      `in the ${layout.name} layout the installer must not start LessonCue itself`);

    // Compose bind-mounts these into the container, where only the file's own
    // mode applies. Root-only meant Shlink could not read its own password.
    for (const secret of [join(root, "data", "db-password"),
                          join(root, "lessoncue", "config", "shortener", "integration-key")]) {
      check(existsSync(secret) && (statSync(secret).mode & 0o044) === 0o044,
        `${secret.replace(root, "")} must be readable by the unprivileged user the container runs as`);
    }
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
console.log("Shortener compose valid: database unpublished, ports on loopback, no credentials in the browser client.");
