import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// Vite's configured output is the server's static root, so the same check
// runs against the exact files that ship in the release image.
const assetDir = "server/LessonCue.Server/wwwroot/assets";
const files = await readdir(assetDir);
const js = [];
for (const file of files.filter((name) => name.endsWith(".js"))) {
  const info = await stat(join(assetDir, file));
  js.push({ file, bytes: info.size });
}
const initial = js.find(({ file }) => /index[-.]/.test(file)) || js.sort((a, b) => b.bytes - a.bytes)[0];
const total = js.reduce((sum, item) => sum + item.bytes, 0);
const maxInitial = 420_000;
const maxTotal = 2_000_000;
console.log(`Bundle budget: initial ${initial.file} ${(initial.bytes / 1024).toFixed(1)} KiB; JavaScript total ${(total / 1024).toFixed(1)} KiB.`);
if (initial.bytes > maxInitial || total > maxTotal) {
  console.error(`Bundle budget exceeded (initial <= ${maxInitial} bytes, total <= ${maxTotal} bytes).`);
  process.exit(1);
}
