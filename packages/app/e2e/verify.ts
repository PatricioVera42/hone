// Verification runner for the verify-hone skill: builds the app, drives it through one journey under xvfb, and keeps
// the evidence in `.verify-runs/<run>/evidence/` (.claude/skills/verify-hone/SKILL.md).
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { z } from "zod";
import { ensureLinuxElectron, hasLinuxElectron } from "../scripts/linux-electron.ts";
import * as helpers from "./helpers.ts";

const appDir = path.join(import.meta.dirname, "..");
const repo = path.join(appDir, "..", "..");
const runsDir = path.join(repo, ".verify-runs");
const mainPath = path.join(appDir, "dist-electron", "main.cjs");
const underXvfbMarker = "HONE_VERIFY_UNDER_XVFB";

/** What the `journey` function a journey module exports receives. */
export interface JourneyContext {
  readonly app: ElectronApplication;
  readonly page: Page;
  readonly expect: typeof expect;
  /** The e2e helpers, the same the specs use. */
  readonly helpers: typeof helpers;
  /** This run's disposable folder for workshops and other files, outside the repo. Removed by cleanup. */
  readonly scratch: string;
  /** Creates `<scratch>/<name>/` with `.hone/generator/` inside, so it's a workshop root, and returns its path. */
  makeWorkshop(name: string): Promise<string>;
  /** Picks `root` with the welcome screen's `Open workshop` and returns the `Files` tree once it shows. */
  openWorkshop(root: string): Promise<Locator>;
  /** Logs a user action or check to `steps.log`. */
  step(text: string): Promise<void>;
  /** Saves an ARIA snapshot and a screenshot of the window as numbered evidence. */
  snap(name: string): Promise<void>;
  /** Saves `text` (a file's content, a folder listing) as numbered evidence. */
  record(name: string, text: string): Promise<void>;
  /** Closes the app and launches it again on the same user data, the way a user relaunching it would. */
  relaunch(): Promise<{ app: ElectronApplication; page: Page }>;
}

const trackedProcessSchema = z.object({ pid: z.number(), startTime: z.string() });

type TrackedProcess = z.infer<typeof trackedProcessSchema>;

/** `<run>/run.json`: what cleanup needs to undo a run, written as soon as the run starts anything. */
const runStateSchema = z.object({ scratch: z.string(), processes: z.array(trackedProcessSchema) });

type RunState = z.infer<typeof runStateSchema>;

const scratchPrefix = path.join(tmpdir(), "hone-verify-");

/** The process's start time from `/proc`, which tells a live process from a later one that reused its pid. */
function startTimeOf(pid: number): string | undefined {
  try {
    const stat = readFileSync(`/proc/${String(pid)}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  } catch {
    return undefined;
  }
}

function isAlive(tracked: TrackedProcess): boolean {
  return startTimeOf(tracked.pid) === tracked.startTime;
}

function readRunState(runDir: string): RunState | undefined {
  const file = path.join(runDir, "run.json");
  if (!existsSync(file)) return undefined;
  return runStateSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

async function existingRuns(): Promise<string[]> {
  if (!existsSync(runsDir)) return [];
  const entries = await readdir(runsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== "journeys")
    .map((entry) => path.join(runsDir, entry.name));
}

function check(ok: boolean, label: string, fix: string): boolean {
  process.stdout.write(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` (${fix})`}\n`);
  return ok;
}

/** Read-only: whether this machine can run a verification now. */
async function doctor(): Promise<boolean> {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  let xvfb = true;
  try {
    execFileSync("which", ["xvfb-run"], { stdio: "ignore" });
  } catch {
    xvfb = false;
  }
  const leftovers = (await existingRuns())
    .filter((runDir) => readRunState(runDir)?.processes.some(isAlive))
    .map((runDir) => path.basename(runDir));
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).trim();
  const results = [
    check(nodeMajor >= 24, `Node ${process.versions.node}`, "needs Node 24 or later"),
    check(xvfb, "xvfb-run on PATH", "sudo apt install xvfb"),
    check(
      hasLinuxElectron(path.join(appDir, "node_modules", "electron")),
      "Linux Electron installed",
      "missing, or the Windows one that pnpm dev leaves; pnpm verify run installs it",
    ),
    check(
      leftovers.length === 0,
      `no live processes from earlier runs${leftovers.length > 0 ? `: ${leftovers.join(", ")}` : ""}`,
      "pnpm verify cleanup --all",
    ),
  ];
  process.stdout.write(`info commit ${commit}, runs in ${runsDir}\n`);
  const uncleaned = (await existingRuns()).filter((runDir) => readRunState(runDir) !== undefined);
  if (uncleaned.length > 0) {
    process.stdout.write(
      `info ${String(uncleaned.length)} run(s) kept scratch folders (--keep or a crash); pnpm verify cleanup --all removes them\n`,
    );
  }
  return results.every(Boolean);
}

function isJourney(value: unknown): value is (context: JourneyContext) => Promise<void> {
  return typeof value === "function";
}

async function loadJourney(file: string): Promise<(context: JourneyContext) => Promise<void>> {
  const module: unknown = await import(pathToFileURL(path.resolve(file)).href);
  if (typeof module !== "object" || module === null || !("journey" in module)) {
    throw new Error(`${file} doesn't export a journey function`);
  }
  const { journey } = module;
  if (!isJourney(journey)) throw new Error(`${file}'s journey export isn't a function`);
  return journey;
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

/** Runs `journey` in a new run folder. Returns the process exit code. */
async function runJourney(journeyFile: string, keep: boolean): Promise<number> {
  ensureLinuxElectron(appDir);
  if (!(await doctor())) return 1;
  const journey = await loadJourney(journeyFile);
  execFileSync("pnpm", ["build"], { cwd: appDir, stdio: ["ignore", "ignore", "inherit"] });

  const runDir = path.join(runsDir, `${path.basename(journeyFile, ".ts")}-${timestamp()}`);
  const evidence = path.join(runDir, "evidence");
  await mkdir(evidence, { recursive: true });
  // Outside the repo, so a terminal in a workshop isn't inside Hone's git checkout and agents don't load its AGENTS.md.
  const scratch = await mkdtemp(scratchPrefix);
  const state: RunState = { scratch, processes: [] };
  const saveState = () => writeFile(path.join(runDir, "run.json"), JSON.stringify(state));
  await saveState();
  await copyFile(journeyFile, path.join(evidence, "journey.ts"));
  const userData = path.join(scratch, "user-data");
  const started = Date.now();
  let counter = 0;
  const numbered = (name: string) => `${String(++counter).padStart(2, "0")}-${name}`;
  const log = (file: string, line: string) => appendFile(path.join(evidence, file), `${line}\n`);

  async function launchApp() {
    const app = await electron.launch({
      args: [mainPath, "--no-sandbox", `--user-data-dir=${userData}`],
    });
    app
      .process()
      .stderr?.on("data", (chunk: Buffer) => void log("app.log", String(chunk).trimEnd()));
    const page = await app.firstWindow();
    page.on(
      "console",
      (message) => void log("app.log", `[renderer ${message.type()}] ${message.text()}`),
    );
    const pids = [app.process().pid, await app.evaluate(() => globalThis.honeHostProcess?.pid)];
    for (const pid of pids) {
      const startTime = pid === undefined ? undefined : startTimeOf(pid);
      if (pid !== undefined && startTime !== undefined) state.processes.push({ pid, startTime });
    }
    await saveState();
    return { app, page };
  }

  let current: { app?: ElectronApplication; page?: Page } = {};
  let failure: unknown;
  try {
    const launched = await launchApp();
    current = launched;
    const context: JourneyContext = {
      ...launched,
      expect,
      helpers,
      scratch,
      makeWorkshop: (name) => helpers.makeWorkshop(scratch, name),
      openWorkshop: async (root) => {
        if (current.app === undefined || current.page === undefined)
          throw new Error("the app isn't running");
        await helpers.pickFolderInDialog(current.app, root);
        await current.page.getByRole("button", { name: "Open workshop" }).click();
        const tree = current.page.getByRole("navigation", { name: "Files" });
        await expect(tree.getByRole("button", { name: ".hone" })).toBeVisible();
        return tree;
      },
      step: async (text) => {
        process.stdout.write(`step ${text}\n`);
        await log("steps.log", `[+${String(Date.now() - started)} ms] ${text}`);
      },
      snap: async (name) => {
        if (current.page === undefined) throw new Error("the app isn't running");
        const base = path.join(evidence, numbered(name));
        await writeFile(`${base}.aria.yml`, await current.page.locator("body").ariaSnapshot());
        await current.page.screenshot({ path: `${base}.png` });
      },
      record: (name, text) => writeFile(path.join(evidence, `${numbered(name)}.txt`), text),
      relaunch: async () => {
        await current.app?.close();
        const relaunched = await launchApp();
        current = relaunched;
        return relaunched;
      },
    };
    await journey(context);
  } catch (error) {
    failure = error;
    const base = path.join(evidence, numbered("failure"));
    try {
      if (current.page !== undefined && !current.page.isClosed()) {
        await writeFile(`${base}.aria.yml`, await current.page.locator("body").ariaSnapshot());
        await current.page.screenshot({ path: `${base}.png` });
      }
    } catch {
      // The window crashed or closed; result.json still records the failure.
    }
  } finally {
    await current.app?.close().catch(() => {});
  }

  const commit = execFileSync("git", ["describe", "--always", "--dirty"], {
    cwd: repo,
    encoding: "utf8",
  }).trim();
  const result = {
    status: failure === undefined ? "passed" : "failed",
    error: failure === undefined ? undefined : inspect(failure),
    journey: path.resolve(journeyFile),
    commit,
    durationMs: Date.now() - started,
  };
  await writeFile(path.join(evidence, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  if (!keep) await cleanup(runDir);
  process.stdout.write(`${result.status}: evidence in ${evidence}\n`);
  if (result.error !== undefined) process.stdout.write(`${result.error}\n`);
  return failure === undefined ? 0 : 1;
}

/** Resolves once none of `processes` is alive, or at `deadline`. */
async function waitForExit(processes: readonly TrackedProcess[], deadline: number): Promise<void> {
  if (!processes.some(isAlive) || Date.now() >= deadline) return;
  await new Promise((resolve) => setTimeout(resolve, 100));
  await waitForExit(processes, deadline);
}

/** Stops the processes `runJourney` started and removes its scratch folder, keeping the evidence. */
async function cleanup(runDir: string): Promise<void> {
  const state = readRunState(runDir);
  if (state === undefined) return;
  const alive = state.processes.filter(isAlive);
  for (const tracked of alive) process.kill(tracked.pid, "SIGTERM");
  await waitForExit(alive, Date.now() + 3000);
  for (const tracked of alive.filter(isAlive)) process.kill(tracked.pid, "SIGKILL");
  // Only a folder this script created, whatever run.json says.
  if (state.scratch.startsWith(scratchPrefix)) {
    await rm(state.scratch, { recursive: true, force: true });
  }
  await rm(path.join(runDir, "run.json"));
}

/** Runs this script again under xvfb, never on the real display, with Electron's Node mode off. */
function reexecUnderXvfb(args: readonly string[]): Promise<number> {
  const env: NodeJS.ProcessEnv = { ...process.env, [underXvfbMarker]: "1" };
  delete env["WAYLAND_DISPLAY"];
  delete env["ELECTRON_RUN_AS_NODE"];
  const child = spawn("xvfb-run", ["-a", process.execPath, import.meta.filename, ...args], {
    env,
    stdio: "inherit",
  });
  return new Promise((resolve) => child.on("exit", (code) => resolve(code ?? 1)));
}

const usage = `usage:
  pnpm verify doctor
  pnpm verify run <journey.ts> [--keep]
  pnpm verify cleanup <run folder> | --all
`;

async function main(args: readonly string[]): Promise<number> {
  const [command, target, flag] = args;
  if (command === "doctor") return (await doctor()) ? 0 : 1;
  if (command === "run" && target !== undefined) {
    if (process.env[underXvfbMarker] !== "1") return reexecUnderXvfb(args);
    return runJourney(target, flag === "--keep");
  }
  if (command === "cleanup" && target !== undefined) {
    const runs = target === "--all" ? await existingRuns() : [path.resolve(target)];
    await Promise.all(runs.map(cleanup));
    process.stdout.write(`cleaned ${String(runs.length)} run(s); evidence kept\n`);
    return 0;
  }
  process.stderr.write(usage);
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
