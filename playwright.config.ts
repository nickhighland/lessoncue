import { defineConfig } from "@playwright/test";

const e2eDataPath = "/tmp/lessoncue-e2e";
const runServerAsRoot = process.env.LESSONCUE_E2E_RUN_AS_ROOT === "1";
const prepareData = runServerAsRoot
  ? `sudo -n rm -rf ${e2eDataPath} && sudo -n mkdir -p ${e2eDataPath}/media/originals ${e2eDataPath}/media/thumbnails ${e2eDataPath}/media/compatibility ${e2eDataPath}/media/temporary && sudo -n chmod 0777 ${e2eDataPath}/media/thumbnails ${e2eDataPath}/media/compatibility ${e2eDataPath}/media/temporary`
  : `rm -rf ${e2eDataPath}`;
const launchServer = runServerAsRoot
  ? `sudo -n env LESSONCUE_DATA_PATH=${e2eDataPath} ASPNETCORE_URLS=http://127.0.0.1:5117 DOTNET_CLI_TELEMETRY_OPTOUT=1 dotnet run --project server/LessonCue.Server/LessonCue.Server.csproj --configuration Release`
  : `LESSONCUE_DATA_PATH=${e2eDataPath} ASPNETCORE_URLS=http://127.0.0.1:5117 DOTNET_CLI_TELEMETRY_OPTOUT=1 dotnet run --project server/LessonCue.Server/LessonCue.Server.csproj --configuration Release`;

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 10_000 },
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:5117",
    actionTimeout: 10_000,
    trace: "retain-on-failure",
  },
  webServer: {
    // GitHub-hosted Linux runners do not grant the unprivileged job enough
    // capability to configure Bubblewrap's isolated loopback network. The
    // CI-only root launch keeps the production service path unchanged while
    // exercising the same media worker and sandbox in a disposable data path.
    command: `${prepareData} && ${launchServer}`,
    url: "http://127.0.0.1:5117/health",
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
