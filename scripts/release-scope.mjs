import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// These are the code and contract surfaces whose changes can require a new
// television client artifact. Server/web/admin changes remain server-only.
export const TV_APP_PATHS = [
  /^android-tv\//,
  /^vega-tv\//,
  /^protocol\//,
];

export function classifyReleasePaths(paths) {
  const tvPaths = paths.filter((path) => TV_APP_PATHS.some((pattern) => pattern.test(path)));
  return {
    tvAppRequired: tvPaths.length > 0,
    tvPaths,
  };
}

export function changedPaths(base, head = "HEAD") {
  const output = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], {
    encoding: "utf8",
  });
  return output.split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , base, head = "HEAD"] = process.argv;
  if (!base) {
    console.error("Usage: node scripts/release-scope.mjs <base-ref> [head-ref]");
    process.exit(64);
  }
  const paths = changedPaths(base, head);
  const classification = classifyReleasePaths(paths);
  console.log(JSON.stringify({ base, head, changedPaths: paths, ...classification }));
}
