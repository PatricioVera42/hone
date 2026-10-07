// Electron main: starts the host (WSL on Windows, a local `node` on Linux), then opens the window.
import { hostReadyLine } from "@hone/protocol";
import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import {
  execFile,
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { AppStateFile } from "./app-state.ts";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function resolveNodeInWsl(): string {
  // nvm only puts node on PATH in interactive shells, so ask one once and use the absolute path.
  const output = execFileSync("wsl.exe", ["-e", "bash", "-ic", "command -v node"], {
    encoding: "utf8",
  });
  const line = output.split(/\r?\n/).find((candidate) => candidate.startsWith("/"));
  if (line === undefined) throw new Error(`node not found in WSL: ${output}`);
  return line.trim();
}

function spawnHost(): ChildProcessWithoutNullStreams {
  if (process.platform === "win32") {
    const repo = argValue("repo");
    if (repo === undefined) throw new Error("missing --repo=<path to the repo in WSL>");
    return spawn("wsl.exe", ["-e", resolveNodeInWsl(), `${repo}/packages/host/src/main.ts`]);
  }
  return spawn("node", [path.join(__dirname, "../../host/src/main.ts")]);
}

function waitForReadyPort(host: ChildProcessWithoutNullStreams): Promise<number> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    function onData(chunk: Buffer): void {
      buffer += String(chunk);
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) return;
      host.stdout.off("data", onData);
      const line = buffer.slice(0, newlineIndex);
      if (!line.startsWith(`${hostReadyLine} `)) {
        reject(new Error(`unexpected line on the host's stdout: ${line}`));
        return;
      }
      const port = Number(line.slice(hostReadyLine.length + 1));
      if (!Number.isInteger(port)) {
        reject(new Error(`ready line has no port: ${line}`));
        return;
      }
      resolve(port);
    }
    host.stdout.on("data", onData);
    host.on("exit", (code) => reject(new Error(`host exited with ${String(code)}`)));
  });
}

/** Converts a path from the Windows folder dialog (`\\wsl.localhost\...`, `\\wsl$\...` or a drive path) to the Linux path the host uses, so a drive path becomes `/mnt/<drive>/...`. */
function toLinuxPath(dialogPath: string): Promise<string> {
  if (process.platform !== "win32") return Promise.resolve(dialogPath);
  return new Promise((resolve, reject) => {
    execFile("wsl.exe", ["-e", "wslpath", "-u", dialogPath], (error, stdout) => {
      if (error === null) resolve(stdout.trim());
      else reject(error);
    });
  });
}

async function pickFolder(window: BrowserWindow): Promise<string | undefined> {
  const result = await dialog.showOpenDialog(window, { properties: ["openDirectory"] });
  const [folder] = result.filePaths;
  if (result.canceled || folder === undefined) return undefined;
  return toLinuxPath(folder);
}

interface RunningHost {
  readonly connection: string;
  kill(): void;
}

async function startHost(): Promise<RunningHost> {
  const token = randomBytes(32).toString("hex");
  const host = spawnHost();
  // The token never goes on a command line or in an environment variable, only on stdin.
  host.stdin.write(`${token}\n`);
  host.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`[host] ${String(chunk)}`);
  });
  const port = await waitForReadyPort(host);
  globalThis.honeHostProcess = host;
  return {
    connection: `ws://127.0.0.1:${String(port)}/?token=${token}`,
    kill: () => host.kill(),
  };
}

// Long enough for a save to reach the host, short enough that a hung renderer doesn't keep the window open.
const flushTimeoutMs = 2000;

/** Asks the renderer to save pending edits. Resolves with whether some are still pending, or `false` after 2 seconds. */
function flushSaves(window: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    ipcMain.once("window:saves-flushed", (_event, pendingEdits: unknown) =>
      resolve(pendingEdits === true),
    );
    setTimeout(() => resolve(false), flushTimeoutMs);
    window.webContents.send("window:flush-saves");
  });
}

/** Asks whether to close the window, discarding edits that aren't saved yet. */
async function confirmDiscardingEdits(window: BrowserWindow): Promise<boolean> {
  const { response } = await dialog.showMessageBox(window, {
    type: "warning",
    title: "Hone",
    message: "Some edits aren't saved yet.",
    detail:
      "Closing now discards them. Cancel keeps the window open, with the edits in their tabs.",
    buttons: ["Discard and close", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    // Otherwise Windows shows "Discard and close" as a link instead of a button.
    noLink: true,
  });
  return response === 0;
}

/**
 * Asks the renderer to save pending edits when the window is about to close, and closes it once they're saved, or
 * after 2 seconds. When some aren't saved yet, it asks whether to discard them; cancelling keeps the window open,
 * and a later close tries saving again.
 */
function flushSavesBeforeClosing(window: BrowserWindow): void {
  let flushing = false;
  let closing = false;
  window.on("close", (event) => {
    if (closing) return;
    event.preventDefault();
    if (flushing) return;
    flushing = true;
    void (async () => {
      const pendingEdits = await flushSaves(window);
      if (pendingEdits && !window.isDestroyed() && !(await confirmDiscardingEdits(window))) {
        flushing = false;
        return;
      }
      closing = true;
      if (!window.isDestroyed()) window.close();
    })();
  });
}

async function start(): Promise<void> {
  Menu.setApplicationMenu(null);
  const host = { current: await startHost() };
  app.on("quit", () => host.current.kill());

  const window = new BrowserWindow({
    width: 1000,
    height: 650,
    webPreferences: { preload: path.join(__dirname, "preload.cjs") },
  });

  flushSavesBeforeClosing(window);

  ipcMain.on("host:connection", (event) => {
    event.returnValue = host.current.connection;
  });
  ipcMain.handle("host:restart", async () => {
    host.current.kill();
    host.current = await startHost();
    window.webContents.reload();
  });

  ipcMain.handle("dialog:pick-folder", () => pickFolder(window));

  const appState = new AppStateFile(path.join(app.getPath("userData"), "state.json"));
  ipcMain.handle("state:get-last-workshop", () => appState.getLastWorkshop());
  ipcMain.handle("state:set-last-workshop", (_event, root: unknown) => {
    if (typeof root !== "string") throw new Error("setLastWorkshop needs a string root");
    return appState.setLastWorkshop(root);
  });
  ipcMain.handle("state:get-sidebar-width", () => appState.getSidebarWidth());
  ipcMain.handle("state:set-sidebar-width", (_event, width: unknown) => {
    // The state file reads a width that isn't a positive number as unset, so one would erase the saved width.
    if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) {
      throw new Error("setSidebarWidth needs a positive width");
    }
    return appState.setSidebarWidth(width);
  });
  ipcMain.handle("state:load-layout", (_event, root: unknown) => {
    if (typeof root !== "string") throw new Error("loadLayout needs a string root");
    return appState.getLayout(root);
  });
  ipcMain.handle("state:save-layout", (_event, root: unknown, layout: unknown) => {
    if (typeof root !== "string") throw new Error("saveLayout needs a string root");
    return appState.setLayout(root, layout);
  });

  const devServer = argValue("dev-server");
  if (devServer === undefined) {
    await window.loadFile(path.join(__dirname, "../dist/renderer/index.html"));
  } else {
    await window.loadURL(devServer);
  }
}

app.on("window-all-closed", () => app.quit());
app
  .whenReady()
  .then(start)
  .catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    app.exit(1);
  });
