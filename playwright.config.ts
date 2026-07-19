import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:5117",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "rm -rf /tmp/lessoncue-e2e && LESSONCUE_DATA_PATH=/tmp/lessoncue-e2e ASPNETCORE_URLS=http://127.0.0.1:5117 DOTNET_CLI_TELEMETRY_OPTOUT=1 dotnet run --project server/LessonCue.Server/LessonCue.Server.csproj --configuration Release",
    url: "http://127.0.0.1:5117/health",
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
