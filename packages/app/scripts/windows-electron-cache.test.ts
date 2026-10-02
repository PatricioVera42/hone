import type * as fs from "node:fs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fillWindowsElectronCache } from "./windows-electron-cache.ts";

const interruption = vi.hoisted(() => ({ armed: false }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    // Like a Ctrl+C partway through the copy: electron.exe is copied, the rest isn't.
    cpSync: (
      source: string,
      destination: string,
      options?: Parameters<typeof actual.cpSync>[2],
    ) => {
      if (!interruption.armed) {
        actual.cpSync(source, destination, options);
        return;
      }
      interruption.armed = false;
      actual.mkdirSync(destination, { recursive: true });
      actual.copyFileSync(
        path.join(source, "electron.exe"),
        path.join(destination, "electron.exe"),
      );
      throw new Error("interrupted");
    },
  };
});

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "hone-windows-electron-"));
}

/** Behaves like `install-electron`: skips when path.txt already names an existing binary, otherwise extracts over `dist` without clearing it. */
function fakeInstaller(electronDir: string, calls: ("win32" | undefined)[]) {
  return (platform?: "win32"): void => {
    calls.push(platform);
    const binary = platform === "win32" ? "electron.exe" : "electron";
    const pathFile = path.join(electronDir, "path.txt");
    if (
      existsSync(pathFile) &&
      readFileSync(pathFile, "utf8") === binary &&
      existsSync(path.join(electronDir, "dist", binary))
    ) {
      return;
    }
    mkdirSync(path.join(electronDir, "dist"), { recursive: true });
    writeFileSync(path.join(electronDir, "dist", binary), `${binary} binary`);
    writeFileSync(pathFile, binary);
  };
}

async function linuxElectron(): Promise<string> {
  const electronDir = await tempDir();
  await mkdir(path.join(electronDir, "dist"));
  await writeFile(path.join(electronDir, "dist", "electron"), "electron binary");
  await writeFile(path.join(electronDir, "path.txt"), "electron");
  return electronDir;
}

describe("fillWindowsElectronCache", () => {
  it("fills an empty cache with the Windows binary and leaves the Linux one in node_modules", async () => {
    const electronDir = await linuxElectron();
    const cacheDir = path.join(await tempDir(), "electron-44.4.5");
    const calls: ("win32" | undefined)[] = [];

    fillWindowsElectronCache(electronDir, cacheDir, fakeInstaller(electronDir, calls));

    expect(existsSync(path.join(cacheDir, "electron.exe"))).toBe(true);
    expect(existsSync(path.join(cacheDir, "electron"))).toBe(false);
    await expect(readFile(path.join(electronDir, "path.txt"), "utf8")).resolves.toBe("electron");
    expect(existsSync(path.join(electronDir, "dist", "electron"))).toBe(true);
    expect(existsSync(path.join(electronDir, "dist", "electron.exe"))).toBe(false);
  });

  it("doesn't install anything when the cache already holds electron.exe", async () => {
    const electronDir = await linuxElectron();
    const cacheDir = await tempDir();
    await writeFile(path.join(cacheDir, "electron.exe"), "electron.exe binary");
    const calls: ("win32" | undefined)[] = [];

    fillWindowsElectronCache(electronDir, cacheDir, fakeInstaller(electronDir, calls));

    expect(calls).toStrictEqual([]);
    await expect(readFile(path.join(electronDir, "path.txt"), "utf8")).resolves.toBe("electron");
  });

  it("doesn't count an interrupted copy as a cache, and copies again on the next call", async () => {
    const electronDir = await linuxElectron();
    const cacheDir = path.join(await tempDir(), "electron-44.4.5");
    const calls: ("win32" | undefined)[] = [];
    interruption.armed = true;

    expect(() =>
      fillWindowsElectronCache(electronDir, cacheDir, fakeInstaller(electronDir, calls)),
    ).toThrow("interrupted");
    expect(existsSync(cacheDir)).toBe(false);

    fillWindowsElectronCache(electronDir, cacheDir, fakeInstaller(electronDir, calls));

    expect(existsSync(path.join(cacheDir, "electron.exe"))).toBe(true);
    expect(existsSync(`${cacheDir}.partial`)).toBe(false);
  });

  it("discards a temporary folder left by an earlier interrupted run", async () => {
    const electronDir = await linuxElectron();
    const cacheDir = path.join(await tempDir(), "electron-44.4.5");
    await mkdir(`${cacheDir}.partial`);
    await writeFile(path.join(`${cacheDir}.partial`, "stale.dll"), "left over");
    const calls: ("win32" | undefined)[] = [];

    fillWindowsElectronCache(electronDir, cacheDir, fakeInstaller(electronDir, calls));

    expect(existsSync(path.join(cacheDir, "electron.exe"))).toBe(true);
    expect(existsSync(path.join(cacheDir, "stale.dll"))).toBe(false);
  });
});
