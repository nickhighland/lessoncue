// The shortener stack has security properties that are easy to lose in an
// edit: the database must never be published, the console must carry no
// credentials, and both published ports must stay on loopback so the tunnel is
// the only way in. Checked here rather than trusted to review.
import { readFileSync } from "node:fs";

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
check(/DB_DRIVER: postgres/.test(shlink), "the shortener must run on postgres, not sqlite");
check(/SHORT_URL_MODE: loose/.test(shlink), "loose mode is what makes a code typed in lower case resolve");
check(/_FILE:/.test(shlink), "credentials should reach the shortener as files, not inline values");
check(/profiles: \["shortener"\]/.test(shlink), "the shortener must stay behind its compose profile");

// No installation's domain belongs in a file everyone ships.
for (const domain of ["chroc.cc", "cityhope"])
  check(!compose.toLowerCase().includes(domain), `compose.yaml must not name ${domain}: the short domain is configuration`);

if (failures.length) {
  console.error("Shortener compose check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Shortener compose valid: database unpublished, ports on loopback, no credentials in the browser client.");
