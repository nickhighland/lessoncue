#!/usr/bin/env node
// Scans the game sound-pack tree and records which cues actually exist.
//
// Without this, the client has to discover packs by requesting each cue and
// treating 404 as "absent" — which is correct but logs 20-30 console errors on
// every game load, drowning out real ones. The manifest lets the client skip
// straight to the fallback when nothing is installed.
//
// Run after adding or removing any .mp3 under web-admin/public/assets/games.
import { readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "web-admin/public/assets/games";
const KINDS = ["themes", "sfx"];

const listDir = async (path) => {
  try { return await readdir(path); } catch { return []; }
};

const packs = {};
for (const gameId of (await listDir(ROOT)).sort()) {
  if ((await stat(join(ROOT, gameId)).catch(() => null))?.isDirectory() !== true) continue;
  const cues = [];
  for (const kind of KINDS) {
    for (const file of await listDir(join(ROOT, gameId, "audio", kind))) {
      if (file.endsWith(".mp3")) cues.push(`${kind}/${file}`);
    }
  }
  if (cues.length) packs[gameId] = cues.sort();
}

const manifest = { version: 1, packs };
await writeFile(join(ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const total = Object.values(packs).reduce((sum, cues) => sum + cues.length, 0);
console.log(`Audio manifest: ${Object.keys(packs).length} pack(s), ${total} cue file(s).`);
