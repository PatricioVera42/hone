// Electron main: starts the host (WSL on Windows, a local `node` on Linux), then opens the window.
import { hostReadyLine } from "@hone/protocol";
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

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

async function start(): Promise<void> {
  Menu.setApplicationMenu(null);
  const host = { current: await startHost() };
  app.on("quit", () => host.current.kill());

  const window = new BrowserWindow({
    width: 1000,
    height: 650,
    webPreferences: { preload: path.join(__dirname, "preload.cjs") },
  });

  ipcMain.on("host:connection", (event) => {
    event.returnValue = host.current.connection;
  });
  ipcMain.handle("host:restart", async () => {
    host.current.kill();
    host.current = await startHost();
    window.webContents.reload();
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
