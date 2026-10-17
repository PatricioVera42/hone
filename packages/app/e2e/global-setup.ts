// Before every Playwright run, installs the Linux Electron if missing and builds the app, so no way of invoking the tests
// runs them without a binary or against a stale build.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { ensureLinuxElectron } from "../scripts/linux-electron.ts";

export default function globalSetup(): void {
  const appDir = path.join(import.meta.dirname, "..");
  ensureLinuxElectron(appDir);
  execFileSync("pnpm", ["build"], {
    cwd: appDir,
    stdio: ["ignore", "ignore", "inherit"],
  });
}
