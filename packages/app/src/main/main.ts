// Electron main: starts the host inside WSL, then opens the window.
import { hostReadyLine } from "@hone/protocol";
import { app, BrowserWindow } from "electron";
import { execFileSync, spawn } from "node:child_process";
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

function startHost(repo: string): Promise<void> {
  const host = spawn("wsl.exe", ["-e", resolveNodeInWsl(), `${repo}/packages/host/src/main.ts`]);
  // The token never goes on a command line or in an environment variable, only on stdin.
  host.stdin.write(`${randomBytes(32).toString("hex")}\n`);
  app.on("quit", () => host.kill());
  host.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`[host] ${String(chunk)}`);
  });
  return new Promise((resolve, reject) => {
    host.stdout.on("data", (chunk: Buffer) => {
      if (String(chunk).includes(hostReadyLine)) resolve();
    });
    host.on("exit", (code) => reject(new Error(`host exited with ${String(code)}`)));
  });
}

async function start(): Promise<void> {
  const repo = argValue("repo");
  if (repo === undefined) throw new Error("missing --repo=<path to the repo in WSL>");
  await startHost(repo);
  const window = new BrowserWindow({ width: 1000, height: 650 });
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
