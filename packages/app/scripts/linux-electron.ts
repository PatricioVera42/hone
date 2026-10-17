import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { clearInstall } from "./windows-electron-cache.ts";

/**
 * Whether the `electron` package holds the Linux binary: `path.txt` names `electron`, which `install-electron` writes,
 * and the binary exists, since an interrupted `clearInstall` can leave `path.txt` without `dist`.
 */
export function hasLinuxElectron(electronDir: string): boolean {
  const pathFile = path.join(electronDir, "path.txt");
  return (
    existsSync(pathFile) &&
    readFileSync(pathFile, "utf8").trim() === "electron" &&
    existsSync(path.join(electronDir, "dist", "electron"))
  );
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
  // install-electron exits 0 without installing when ELECTRON_OVERRIDE_DIST_PATH points at an existing binary.
  if (!hasLinuxElectron(electronDir)) {
    throw new Error(
      `install-electron finished but ${electronDir} has no Linux Electron (is ELECTRON_OVERRIDE_DIST_PATH set?)`,
    );
  }
}
