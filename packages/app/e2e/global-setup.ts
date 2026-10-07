// Builds the app before every Playwright run, so no way of invoking the tests runs them against a stale build.
import { execFileSync } from "node:child_process";
import path from "node:path";

export default function globalSetup(): void {
  execFileSync("pnpm", ["build"], {
    cwd: path.join(import.meta.dirname, ".."),
    stdio: ["ignore", "ignore", "inherit"],
  });
}
