// Dev loop: Vite dev server and a watch build of main in WSL, Windows Electron pointed at them.
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { build, createServer } from "vite";

const appDir = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(appDir, "../..");

function electronVersion(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(appDir, "node_modules/electron/package.json"), "utf8"),
  );
  if (typeof manifest === "object" && manifest !== null && "version" in manifest) {
    if (typeof manifest.version === "string") return manifest.version;
  }
  throw new Error("can't read the Electron version from node_modules/electron/package.json");
}

function toWslPath(windowsPath: string): string {
  return execFileSync("wslpath", ["-u", windowsPath], { encoding: "utf8" }).trim();
}

function toWindowsPath(wslPath: string): string {
  return execFileSync("wslpath", ["-w", wslPath], { encoding: "utf8" }).trim();
}

// Chromium's GPU process fails when electron.exe itself lives on \\wsl.localhost, so run a copy from the Windows disk.
function windowsElectron(): string {
  const version = electronVersion();
  const localAppData = execFileSync("cmd.exe", ["/c", "echo %LOCALAPPDATA%"], {
    encoding: "utf8",
    cwd: "/mnt/c",
  }).trim();
  const cacheDir = path.join(toWslPath(localAppData), "hone-dev", `electron-${version}`);
  if (!existsSync(path.join(cacheDir, "electron.exe"))) {
    // Electron downloads its binary on demand; ask for the Windows one even though we run in WSL.
    if (!existsSync(path.join(appDir, "node_modules/electron/dist/electron.exe"))) {
      execFileSync("pnpm", ["exec", "install-electron", "--no"], {
        cwd: appDir,
        env: { ...process.env, ELECTRON_INSTALL_PLATFORM: "win32" },
        stdio: "inherit",
      });
    }
    process.stdout.write(`copying Electron ${version} to ${cacheDir}\n`);
    cpSync(path.join(appDir, "node_modules/electron/dist"), cacheDir, { recursive: true });
  }
  return path.join(cacheDir, "electron.exe");
}

const server = await createServer({
  configFile: path.join(appDir, "vite.config.ts"),
  root: appDir,
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
await server.listen();

await new Promise<void>((resolve, reject) => {
  build({
    configFile: path.join(appDir, "vite.electron.config.ts"),
    root: appDir,
    build: { watch: {} },
    plugins: [{ name: "first-build", closeBundle: () => resolve() }],
  }).catch(reject);
});

const electron = windowsElectron();
const child = spawn(
  electron,
  [toWindowsPath(appDir), "--dev-server=http://127.0.0.1:5173/", `--repo=${repo}`],
  { stdio: "inherit" },
);
child.on("exit", () => {
  server
    .close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});
