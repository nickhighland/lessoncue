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

for (const [name, body] of [["shlink", shlink], ["shlink-web-client", client]]) {
  const ports = body.match(/^\s+- "([^"]+)"/gm) ?? [];
  for (const port of ports)
    check(port.includes("127.0.0.1:"), `${name} publishes ${port.trim()} on all interfaces; bind it to 127.0.0.1`);
}

check(!/API_KEY/i.test(client) && !/servers\.json/i.test(client),
  "shlink-web-client must not be given an API key or a server list: it is served to a browser");
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
