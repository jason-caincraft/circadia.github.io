import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const optionalBrowsers = process.env.E2E_ALL_BROWSERS === "1";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5178",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(optionalBrowsers
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : []),
  ],
  webServer: [
    {
      name: "Fixture API",
      command:
        "dotnet run --no-build --no-restore --no-launch-profile --project tests/OutdoorExplorer.E2eHost",
      cwd: projectRoot,
      url: "http://127.0.0.1:5088/health",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DOTNET_ENVIRONMENT: "Testing",
        NPS_API_KEY: "",
        NPS_LIVE_SMOKE: "0",
      },
    },
    {
      name: "React web",
      command: "npm run dev -- --host 127.0.0.1 --port 5178 --strictPort",
      cwd: fileURLToPath(new URL("../../src/web/", import.meta.url)),
      url: "http://127.0.0.1:5178",
      reuseExistingServer: false,
      env: { VITE_API_BASE_URL: "http://127.0.0.1:5088" },
    },
  ],
});
