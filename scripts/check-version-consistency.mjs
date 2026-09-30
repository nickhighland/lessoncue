#!/usr/bin/env node
// One version, declared in three places, checked here.
//
// The web player reports its version to the server, which is what an
// administrator sees against a screen in the device list. That number is a
// hand-maintained constant, and nothing has ever checked it, so it has drifted
// twice: twelve releases behind at v0.46.0, corrected there, and eleven behind
// again by v0.46.27. Both times the screens in a classroom were reporting a
// version the product had not been for months.
//
// package.json drifts the same way and for the same reason.
//
// The server's csproj is the source of truth because it is the version the
// release workflow tags and publishes. This does not compare against git tags:
// a pull request legitimately precedes its own tag, and a CI checkout may have
// no tags at all.
//
//   npm run test:version
import { readFile } from "node:fs/promises";

const CSPROJ = "server/LessonCue.Server/LessonCue.Server.csproj";
const PACKAGE = "package.json";
const PLAYER = "web-admin/src/WebPlayer.tsx";

const read = async (path) => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
};

/** Pull one value out, and say which file failed rather than returning null. */
function extract(contents, pattern, path, what) {
  const found = contents.match(pattern);
  if (!found) throw new Error(`Could not find ${what} in ${path}`);
  return found[1];
}

const csproj = await read(CSPROJ);
const pkg = await read(PACKAGE);
const player = await read(PLAYER);

const expected = extract(csproj, /<Version>([^<]+)<\/Version>/, CSPROJ, "<Version>");
const declared = [
  {
    path: PACKAGE,
    what: '"version"',
    value: extract(pkg, /"version":\s*"([^"]+)"/, PACKAGE, '"version"'),
    fix: `set "version" to "${expected}"`,
  },
  {
    path: PLAYER,
    what: "APP_VERSION",
    value: extract(player, /APP_VERSION\s*=\s*"([^"]+)"/, PLAYER, "APP_VERSION"),
    fix: `set APP_VERSION to "${expected}" — this is the version classroom screens report`,
  },
];

const drifted = declared.filter(entry => entry.value !== expected);
if (drifted.length) {
  console.error(`Version mismatch. ${CSPROJ} declares ${expected}:`);
  for (const entry of drifted) {
    console.error(`  - ${entry.path}: ${entry.what} is ${entry.value} — ${entry.fix}`);
  }
  console.error("\nEvery release bumps all three. Bump the ones above to match.");
  process.exit(1);
}

console.log(`Version consistent at ${expected} across `
  + `${[CSPROJ, ...declared.map(entry => entry.path)].length} files.`);
