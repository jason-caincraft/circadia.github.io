import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
// Explicitly exclude live tests even when the caller has opted in elsewhere.
const env = { ...process.env, NPS_LIVE_SMOKE: "0", NPS_API_KEY: "" };
for (const [command, args] of [
  ["dotnet", ["restore", "OutdoorExplorer.slnx", "--locked-mode"]],
  ["dotnet", ["build", "OutdoorExplorer.slnx", "--no-restore"]],
  [
    "dotnet",
    [
      "test",
      "OutdoorExplorer.slnx",
      "--no-build",
      "--filter",
      "Category!=Live",
    ],
  ],
  [
    process.execPath,
    [
      fileURLToPath(
        new URL("node_modules/@playwright/test/cli.js", import.meta.url),
      ),
      "test",
      "--config",
      fileURLToPath(new URL("playwright.config.ts", import.meta.url)),
    ],
  ],
]) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
