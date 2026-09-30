import { classifyReleasePaths } from "./release-scope.mjs";

const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

const serverOnly = classifyReleasePaths([
  "server/LessonCue.Server/TroubleshootingEmailService.cs",
  "web-admin/src/admin/views/Users.tsx",
  ".github/workflows/release.yml",
]);
check(!serverOnly.tvAppRequired, "server/admin changes must remain server-only");

for (const path of [
  "android-tv/app/src/main/java/org/lessoncue/tv/MainActivity.kt",
  "vega-tv/src/serverAddress.ts",
  "protocol/openapi.yaml",
]) {
  check(classifyReleasePaths([path]).tvAppRequired, `${path} must require a TV artifact`);
}

console.log("Release scope valid: server-only changes do not package or publish TV artifacts.");
