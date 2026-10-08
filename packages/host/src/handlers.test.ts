import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnection, type Connection } from "./handlers.ts";
import { watchWorkshop } from "./watch-workshop.ts";

// The real watcher, wrapped so a test can hold one open's watcher back and so decide which open finishes first.
vi.mock(import("./watch-workshop.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, watchWorkshop: vi.fn(actual.watchWorkshop) };
});

const { watchWorkshop: realWatchWorkshop } = await vi.importActual<{
  watchWorkshop: typeof watchWorkshop;
}>("./watch-workshop.ts");

async function makeWorkshop(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hone-workshop-"));
  await fs.mkdir(path.join(root, ".hone", "generator"), { recursive: true });
  return root;
}

/**
 * Makes the next `watchWorkshop` call hold its watcher back once the initial scan is done, until `release` is
 * called. `ready` resolves when the watcher is being held.
 */
function holdNextWatcher(): { ready: Promise<void>; release: () => void } {
  const ready = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  vi.mocked(watchWorkshop).mockImplementationOnce(async (root, onChange) => {
    const watcher = await realWatchWorkshop(root, onChange);
    ready.resolve();
    await released.promise;
    return watcher;
  });
  return { ready: ready.promise, release: () => released.resolve() };
}

function execute(connection: Connection, method: string, params: unknown): Promise<unknown> {
  const handler = connection.handlers.find((candidate) => candidate.name === method);
  if (handler === undefined) throw new Error(`no ${method} handler`);
  return handler.execute(params);
}

function openWorkshop(connection: Connection, root: string): Promise<unknown> {
  return execute(connection, "workshop.open", { path: root });
}

/** Makes `SHELL` a shell that appends its process id to the returned file, so a test can find shells it has no id for. */
async function stubRecordingShell(): Promise<string> {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "hone-shell-"));
  const pidsFile = path.join(folder, "pids");
  const shell = path.join(folder, "shell.sh");
  await fs.writeFile(shell, `#!/bin/sh\necho $$ >> '${pidsFile}'\nexec /bin/bash "$@"\n`, {
    mode: 0o755,
  });
  vi.stubEnv("SHELL", shell);
  return pidsFile;
}

// Longer than the collapsing window and the time a watcher takes to report a write.
const settleMs = 300;

let connection: Connection | undefined;

afterEach(async () => {
  await connection?.close();
  connection = undefined;
  vi.unstubAllEnvs();
});

describe("createConnection", () => {
  it("stops a watcher that becomes ready after the connection closed", async () => {
    const sent: string[] = [];
    connection = createConnection((message) => sent.push(message));
    const root = await makeWorkshop();

    const opening = openWorkshop(connection, root);
    await connection.close();
    await opening;
    await fs.writeFile(path.join(root, "late.md"), "");
    await setTimeout(settleMs);

    expect(sent).toStrictEqual([]);
  });

  it("keeps watching the workshop opened last when an earlier open finishes after it", async () => {
    const sent: string[] = [];
    const currentReported = Promise.withResolvers<void>();
    connection = createConnection((message) => {
      sent.push(message);
      if (message.includes("current.md")) currentReported.resolve();
    });
    const earlier = await makeWorkshop();
    const later = await makeWorkshop();

    const held = holdNextWatcher();
    const earlierOpening = openWorkshop(connection, earlier);
    await held.ready;
    await openWorkshop(connection, later);
    held.release();
    await earlierOpening;
    await fs.writeFile(path.join(earlier, "stale.md"), "");
    await fs.writeFile(path.join(later, "current.md"), "");
    // Keeping the earlier workshop's watcher instead of the later one means current.md never arrives. Keeping both
    // would most likely report stale.md first, as it's written first, but nothing orders two watchers' reports.
    await currentReported.promise;

    expect(sent.join("\n")).not.toContain("stale.md");
  });

  it("starts no shell for a terminal.open still resolving its folder when the connection closes", async () => {
    const pidsFile = await stubRecordingShell();
    connection = createConnection(() => undefined);
    await openWorkshop(connection, await makeWorkshop());

    const opening = execute(connection, "terminal.open", { cwd: "", cols: 80, rows: 24 });
    await connection.close();

    await expect(opening).rejects.toMatchObject({ name: "NoWorkshopOpen" });
    // Long enough for a shell started anyway to record itself.
    await setTimeout(settleMs);
    await expect(fs.readFile(pidsFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
