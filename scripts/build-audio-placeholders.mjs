#!/usr/bin/env node
// Keeps the sound-pack placeholders' coverage sections true.
//
// Every .txt under web-admin/public/assets/games documents one cue file that a
// deployment may drop in. What it could not say, written by hand, is which
// games actually reach it: that depends on the preset catalogue and on which
// packs already supply an .mp3, and both move. So the hand-written parts of
// each placeholder (role, timing, character, spec) are left exactly as they
// are, and only the three generated sections are rewritten:
//
//   COVERS              which games use this file
//   DOES NOT COVER      which games do not, and where they go instead
//   IF THIS FILE IS ABSENT   the next step in the cascade, per tier
//
// Run after adding an engine folder, a named preset, or any .mp3:
//   npm run audio:placeholders
//
// Idempotent: running it twice produces the same bytes.
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "web-admin/public/assets/games";
const REGISTRY = "web-admin/src/activities/activityPresetRegistry.ts";
const SHARED = "shared";
const KINDS = ["themes", "sfx"];
const WIDTH = 78;

const listDir = async (path) => {
  try { return await readdir(path); } catch { return []; }
};
const isDir = async (path) =>
  (await stat(path).catch(() => null))?.isDirectory() === true;

/** Wrap to the width the rest of the file uses, at a fixed indent. */
function wrap(text, indent = "  ") {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = indent;
  for (const word of words) {
    if (line.length > indent.length && line.length + 1 + word.length > WIDTH) {
      lines.push(line);
      line = indent + word;
    } else {
      line = line.length > indent.length ? `${line} ${word}` : indent + word;
    }
  }
  if (line.trim()) lines.push(line);
  return lines.join("\n");
}

/**
 * Named games per engine, read from the catalogue rather than duplicated here.
 *
 * The catalogue is TypeScript that imports the palette module, so importing it
 * would drag the browser build into a build script. The two shapes it is
 * written in are stable and checked below: a miscount fails loudly rather than
 * silently writing "0 named games" into 400 files.
 */
async function presetsByEngine() {
  const source = await readFile(REGISTRY, "utf8");
  const groups = [...source.matchAll(/catalogFrom\((\w+),\s*'([^']+)'/g)]
    .map(([, group, type]) => ({ group, type }));
  if (!groups.length) throw new Error(`No catalogFrom() calls found in ${REGISTRY}`);

  const byEngine = new Map();
  for (const { group, type } of groups) {
    const body = source.match(
      new RegExp(`export const ${group}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`),
    );
    if (!body) throw new Error(`Could not read the body of ${group}`);
    const labels = [...body[1].matchAll(
      /id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*description:/g,
    )].map(([, , label]) => label);
    if (!labels.length) throw new Error(`No presets parsed out of ${group}`);
    byEngine.set(type, (byEngine.get(type) ?? []).concat(labels));
  }
  return byEngine;
}

/** The display name each pack already uses, taken from its own first line. */
function packLabel(contents, fallback) {
  const dash = contents.split("\n")[0].split(" — ")[1];
  return dash?.trim() || fallback;
}

const listFor = (labels, limit = 6) => labels.length <= limit
  ? labels.join(", ")
  : `${labels.slice(0, limit).join(", ")}, and ${labels.length - limit} more`;

function coversSection({ pack, cue, kind, labels, engines, overrides, label }) {
  const path = `${kind}/${cue}.mp3`;



  if (pack === SHARED) {
    const total = [...engines.values()].reduce((sum, list) => sum + list.length, 0);
    const covers = wrap(
      `Every game on every engine — all ${total} named games in the catalogue, plus `
      + `anything a teacher builds from blank — except where a more specific pack `
      + `supplies its own ${path}. This is the only pack consulted for every `
      + `activity in LessonCue, so it is the one to author first.`,
    );

    const notCovered = overrides.length === 0
      ? wrap(
        `Nothing. No engine or preset pack supplies its own ${path}, so every game `
        + `in LessonCue reaches this file for this cue.`,
      )
      : [wrap(
        overrides.length === 1
          ? `One pack supplies its own ${path} and never reaches this file:`
          : `${overrides.length} packs supply their own ${path} and never reach this file:`,
      ), ...overrides.map((owner) => {
        const named = engines.get(owner) ?? [];
        const detail = named.length
          ? `${named.length} named game${named.length === 1 ? "" : "s"}: ${listFor(named, 4)}`
          : "no named games; reached by building from blank";
        // Indented one step further than the sentence above it, and wrapped, so
        // a pack with twenty games does not run off the side of the file.
        return wrap(`${owner} — ${detail}`, "    ");
      }), "", wrap("Every other game still falls through to this file.")].join("\n");

    return `COVERS\n${covers}\n\nDOES NOT COVER\n${notCovered}\n`;
  }

  const covers = labels.length
    ? [
      wrap(`The ${labels.length} named game${labels.length === 1 ? "" : "s"} built on the `
        + `${pack} engine — ${label}:`),
      wrap(labels.join(", "), "    "),
      "",
      wrap(`…and any activity a teacher builds on this engine from blank.`),
    ].join("\n")
    : wrap(
      `Activities built on the ${pack} engine — ${label}. This engine has no named `
      + `games in the catalogue — it is reached by building from blank — so this `
      + `pack exists for deployments that use it that way.`,
    );

  const notCovered = [
    wrap(
      `Games on the other ${engines.size - 1} engines. They use their own engine pack `
      + `when it supplies this cue, and otherwise `
      + `assets/games/${SHARED}/audio/${path}.`,
    ),
    "",
    wrap(
      `One named game can also override this file on its own by adding `
      + `assets/games/<presetId>/audio/${path}; everything it omits keeps falling `
      + `through to this pack.`,
    ),
  ].join("\n");

  return `COVERS\n${covers}\n\nDOES NOT COVER\n${notCovered}\n`;
}

function absentSection({ pack, cue, kind }) {
  // What happens when the search runs out differs by cue type: every effect has
  // an original synthesized stand-in, and no theme does, so a missing bed is
  // silence rather than a substitute.
  const outcome = kind === "themes"
    ? "no music plays for this cue. LessonCue synthesizes effects but not music, "
      + "so an absent bed or sting simply means silence. That is the shipped "
      + "default and is not an error."
    : "LessonCue plays its original synthesized cue from "
      + "web-admin/src/activities/effects.ts. That is the shipped default.";

  // The shared pack IS the end of the cascade. Saying it falls back to itself is
  // what the hand-written files used to do.
  const body = pack === SHARED
    ? `This is the last folder searched. If the file is missing here too, ${outcome}`
    : `Lookup cascades preset → engine → shared. If this file is absent, LessonCue `
      + `tries assets/games/${SHARED}/audio/${kind}/${cue}.mp3, and if that is also `
      + `absent, ${outcome}`;

  return `IF THIS FILE IS ABSENT\n${wrap(body)}\n`;
}

const GENERATED = /\n(?:COVERS\n[\s\S]*?\n\n)?(?:DOES NOT COVER\n[\s\S]*?\n\n)?IF THIS FILE IS ABSENT\n[\s\S]*?(?=\nLICENSING\n)/;

async function main() {
  const engines = await presetsByEngine();
  const packs = [];
  for (const name of (await listDir(ROOT)).sort()) {
    if (await isDir(join(ROOT, name))) packs.push(name);
  }
  if (!packs.includes(SHARED)) throw new Error(`No ${SHARED} pack under ${ROOT}`);

  // Engine folders with no named presets still belong in the count the shared
  // pack quotes, so record them with an empty list rather than dropping them.
  for (const pack of packs) if (!engines.has(pack)) engines.set(pack, []);
  engines.delete(SHARED);

  // Which packs already supply a real file, per cue — that is what makes a
  // placeholder "overridden" rather than merely present.
  const overridesFor = new Map();
  for (const pack of packs) {
    for (const kind of KINDS) {
      for (const file of await listDir(join(ROOT, pack, "audio", kind))) {
        if (!file.endsWith(".mp3")) continue;
        const key = `${kind}/${file.replace(/\.mp3$/, "")}`;
        overridesFor.set(key, (overridesFor.get(key) ?? []).concat(pack));
      }
    }
  }

  let written = 0;
  let skipped = 0;
  for (const pack of packs) {
    for (const kind of KINDS) {
      for (const file of (await listDir(join(ROOT, pack, "audio", kind))).sort()) {
        if (!file.endsWith(".txt")) continue;
        const cue = file.replace(/\.txt$/, "");
        const path = join(ROOT, pack, "audio", kind, file);
        const before = await readFile(path, "utf8");
        if (!GENERATED.test(before)) {
          console.warn(`  ! ${path}: no IF THIS FILE IS ABSENT section, left alone`);
          skipped += 1;
          continue;
        }
        const sections = "\n"
          + coversSection({
            pack,
            cue,
            kind,
            label: packLabel(before, pack),
            labels: engines.get(pack) ?? [],
            engines,
            overrides: (overridesFor.get(`${kind}/${cue}`) ?? []).filter(o => o !== pack).sort(),
          })
          + "\n" + absentSection({ pack, cue, kind });
        const after = before.replace(GENERATED, sections);
        if (after !== before) {
          await writeFile(path, after);
          written += 1;
        }
      }
    }
  }
  console.log(`Audio placeholders: ${written} rewritten across ${packs.length} pack(s)`
    + `${skipped ? `, ${skipped} skipped` : ""}.`);
}

await main();
