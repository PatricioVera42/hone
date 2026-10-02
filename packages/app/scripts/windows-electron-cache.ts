import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Copies the Windows Electron in `electronDir` (the `electron` package) to `cacheDir`, unless the cache already holds
 * `electron.exe`. The copy goes to a sibling folder that is renamed to `cacheDir` once complete, so an interrupted copy
 * never leaves a `cacheDir` that looks finished. `installElectron` runs `install-electron`, for Windows when given `"win32"` and for the current
 * platform otherwise. The package is left holding the current platform's binary, so end-to-end tests still run.
 */
export function fillWindowsElectronCache(
  electronDir: string,
  cacheDir: string,
  installElectron: (platform?: "win32") => void,
): void {
  if (existsSync(path.join(cacheDir, "electron.exe"))) return;
  // install-electron extracts over dist without clearing it, so each platform starts from an empty one.
  clearInstall(electronDir);
  installElectron("win32");
  process.stdout.write(`copying Electron to ${cacheDir}\n`);
  const partialDir = `${cacheDir}.partial`;
  rmSync(partialDir, { recursive: true, force: true });
  cpSync(path.join(electronDir, "dist"), partialDir, { recursive: true });
  renameSync(partialDir, cacheDir);
  clearInstall(electronDir);
  installElectron();
}

function clearInstall(electronDir: string): void {
  rmSync(path.join(electronDir, "dist"), { recursive: true, force: true });
  rmSync(path.join(electronDir, "path.txt"), { force: true });
}
