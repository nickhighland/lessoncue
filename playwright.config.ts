import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const e2ePort = process.env.LESSONCUE_E2E_PORT ?? "5117";
const e2eDataPath = process.env.LESSONCUE_E2E_DATA_PATH ?? "/tmp/lessoncue-e2e";

if (!/^\d{2,5}$/.test(e2ePort)) throw new Error("LESSONCUE_E2E_PORT must be a numeric port.");
if (!/^\/tmp\/lessoncue-e2e(?:-[A-Za-z0-9_.-]+)?$/.test(e2eDataPath)) {
  throw new Error("LESSONCUE_E2E_DATA_PATH must be a dedicated /tmp/lessoncue-e2e[-suffix] path.");
}

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 10_000 },
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  use: {
    baseURL: externalBaseUrl ?? `http://127.0.0.1:${e2ePort}`,
    actionTimeout: 10_000,
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl ? undefined : {
    command: `${JSON.stringify(process.execPath)} scripts/prepare-e2e-data.mjs ${e2eDataPath} && env LESSONCUE_DATA_PATH=${e2eDataPath} ASPNETCORE_URLS=http://127.0.0.1:${e2ePort} DOTNET_CLI_TELEMETRY_OPTOUT=1 dotnet run --project server/LessonCue.Server/LessonCue.Server.csproj --configuration Release`,
    url: `http://127.0.0.1:${e2ePort}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
