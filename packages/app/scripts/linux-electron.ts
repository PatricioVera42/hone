import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { clearInstall } from "./windows-electron-cache.ts";

/** Whether `path.txt` in the `electron` package names the Linux binary, which `install-electron` writes as `electron`. */
export function hasLinuxElectron(electronDir: string): boolean {
  const pathFile = path.join(electronDir, "path.txt");
  return existsSync(pathFile) && readFileSync(pathFile, "utf8").trim() === "electron";
}

/**
 * Installs the Linux Electron when the package holds none, or the Windows one that `pnpm dev` leaves behind. Electron 44
 * has no install script, so a fresh checkout has no binary. `install-electron` skips when `path.txt` already names an
 * existing binary, hence the clearing first.
 */
export function ensureLinuxElectron(appDir: string): void {
  const electronDir = path.join(appDir, "node_modules", "electron");
  if (hasLinuxElectron(electronDir)) return;
  clearInstall(electronDir);
  // Always set, so an override inherited from the shell can't pick another platform.
  execFileSync("pnpm", ["exec", "install-electron", "--no"], {
    cwd: appDir,
    env: { ...process.env, ELECTRON_INSTALL_PLATFORM: "linux" },
    stdio: "inherit",
  });
}
