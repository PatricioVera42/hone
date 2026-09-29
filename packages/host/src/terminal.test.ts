import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { startTestHost, type TestHost } from "./test-harness.ts";

async function makeWorkshop(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hone-workshop-"));
  await fs.mkdir(path.join(root, ".hone", "generator"), { recursive: true });
  return root;
}

/** The test's environment with an empty home, so the login shell doesn't load the user's profile. */
async function shellEnv(): Promise<NodeJS.ProcessEnv> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "hone-home-"));
  return { ...process.env, HOME: home, SHELL: "/bin/bash" };
}

async function startWithWorkshop(
  env?: NodeJS.ProcessEnv,
): Promise<{ host: TestHost; root: string }> {
  const started = await startTestHost(env ?? (await shellEnv()));
  const root = await makeWorkshop();
  await started.call("workshop.open", { path: root });
  return { host: started, root };
}

const openResultSchema = z.object({ id: z.string() });

async function openTerminal(testHost: TestHost, cwd = ""): Promise<string> {
  const result = await testHost.call("terminal.open", { cwd, cols: 80, rows: 24 });
  return openResultSchema.parse(result).id;
}

const dataSchema = z.object({ id: z.string(), data: z.string() });

/** Everything a terminal has printed so far. */
function output(testHost: TestHost, id: string): string {
  return testHost.notifications
    .filter((notification) => notification.method === "terminal.data")
    .map((notification) => dataSchema.parse(notification.params))
    .filter((params) => params.id === id)
    .map((params) => params.data)
    .join("");
}

/** The `terminal.exit` notifications received so far, as their params. */
function exits(testHost: TestHost): unknown[] {
  return testHost.notifications
    .filter((notification) => notification.method === "terminal.exit")
    .map((notification) => notification.params);
}

// CSI sequences, such as the ones bash sends to turn bracketed paste on and off around each command. Matching
// the escape character is the point.
// oxlint-disable-next-line no-control-regex
const controlSequence = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** A terminal's output so far as lines, without control sequences. An echoed command line includes the command, so it never equals only what the command printed. */
function outputLines(testHost: TestHost, id: string): string[] {
  return output(testHost, id)
    .replaceAll(controlSequence, "")
    .split(/\r\n|\r|\n/);
}

async function expectOutputLine(testHost: TestHost, id: string, line: string): Promise<void> {
  await vi.waitFor(
    () => {
      expect(outputLines(testHost, id)).toContain(line);
    },
    { timeout: 3000 },
  );
}

/** The shell's process id, which it prints itself. */
async function shellPid(testHost: TestHost, id: string): Promise<number> {
  await testHost.call("terminal.write", { id, data: "echo pid=$$\r" });
  let pid: number | undefined;
  await vi.waitFor(
    () => {
      const line = outputLines(testHost, id).find((candidate) => /^pid=\d+$/.test(candidate));
      expect(line).toBeDefined();
      pid = Number(line?.slice("pid=".length));
    },
    { timeout: 3000 },
  );
  if (pid === undefined) throw new Error("the shell printed no pid");
  return pid;
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function expectGone(pid: number): Promise<void> {
  await vi.waitFor(
    () => {
      expect(isRunning(pid)).toBe(false);
    },
    { timeout: 3000 },
  );
}

let host: TestHost | undefined;

afterEach(async () => {
  await host?.close();
  host = undefined;
});

describe("terminal.open", () => {
  it("runs a shell whose output arrives as terminal.data", async () => {
    ({ host } = await startWithWorkshop());
    const id = await openTerminal(host);

    await host.call("terminal.write", { id, data: "echo hi\r" });

    await expectOutputLine(host, id, "hi");
  });

  it("starts in the folder at cwd, relative to the workshop root", async () => {
    let root: string;
    ({ host, root } = await startWithWorkshop());
    await fs.mkdir(path.join(root, "math"));
    const id = await openTerminal(host, "math");

    await host.call("terminal.write", { id, data: "pwd\r" });

    await expectOutputLine(host, id, path.join(await fs.realpath(root), "math"));
  });

  it("sets TERM to xterm-256color", async () => {
    ({ host } = await startWithWorkshop());
    const id = await openTerminal(host);

    await host.call("terminal.write", { id, data: 'echo "[$TERM]"\r' });

    await expectOutputLine(host, id, "[xterm-256color]");
  });

  it("runs $SHELL as a login shell", async () => {
    ({ host } = await startWithWorkshop({ ...(await shellEnv()), SHELL: "/bin/sh" }));
    const id = await openTerminal(host);

    await host.call("terminal.write", { id, data: 'echo "[$0]"\r' });

    // sh doesn't start a new line after the echoed command, so the output follows its prompt.
    const testHost = host;
    await vi.waitFor(() => {
      expect(outputLines(testHost, id)).toContainEqual(expect.stringMatching(/\[\/bin\/sh\]$/));
    });
  });

  it("falls back to /bin/bash when SHELL is unset", async () => {
    const { SHELL: _shell, ...withoutShell } = await shellEnv();
    ({ host } = await startWithWorkshop(withoutShell));
    const id = await openTerminal(host);

    await host.call("terminal.write", { id, data: 'echo "[$0]"\r' });

    await expectOutputLine(host, id, "[/bin/bash]");
  });

  it("fails with NoWorkshopOpen before a workshop is open", async () => {
    host = await startTestHost(await shellEnv());

    await expect(openTerminal(host)).rejects.toMatchObject({ code: -32008 });
  });

  it("fails with OutsideWorkshop for a folder outside the workshop", async () => {
    ({ host } = await startWithWorkshop());

    await expect(openTerminal(host, "..")).rejects.toMatchObject({ code: -32004 });
  });

  it("fails with NotFound for a file", async () => {
    let root: string;
    ({ host, root } = await startWithWorkshop());
    await fs.writeFile(path.join(root, "note.md"), "");

    await expect(openTerminal(host, "note.md")).rejects.toMatchObject({ code: -32003 });
  });
});

describe("terminal.resize", () => {
  it("resizes the terminal the shell sees", async () => {
    ({ host } = await startWithWorkshop());
    const id = await openTerminal(host);

    await host.call("terminal.resize", { id, cols: 100, rows: 30 });
    await host.call("terminal.write", { id, data: "stty size\r" });

    await expectOutputLine(host, id, "30 100");
  });
});

describe("terminal.exit", () => {
  it("is sent with the exit code when the shell exits", async () => {
    ({ host } = await startWithWorkshop());
    const id = await openTerminal(host);

    await host.call("terminal.write", { id, data: "exit 3\r" });

    const testHost = host;
    await vi.waitFor(() => {
      expect(exits(testHost)).toStrictEqual([{ id, exitCode: 3 }]);
    });
  });
});

describe("terminal.close", () => {
  it("kills the shell and sends terminal.exit", async () => {
    ({ host } = await startWithWorkshop());
    const id = await openTerminal(host);
    const pid = await shellPid(host, id);

    await host.call("terminal.close", { id });

    await expectGone(pid);
    const testHost = host;
    await vi.waitFor(() => {
      expect(exits(testHost)).toContainEqual(expect.objectContaining({ id }));
    });
  });

  it("does nothing for a terminal that has already exited", async () => {
    ({ host } = await startWithWorkshop());
    const id = await openTerminal(host);
    await host.call("terminal.write", { id, data: "exit\r" });
    const testHost = host;
    await vi.waitFor(() => {
      expect(exits(testHost)).toHaveLength(1);
    });

    await expect(host.call("terminal.close", { id })).resolves.toBeNull();
    await expect(host.call("terminal.write", { id, data: "x" })).resolves.toBeNull();
    await expect(host.call("terminal.resize", { id, cols: 10, rows: 10 })).resolves.toBeNull();
  });
});

describe("terminal ownership", () => {
  it("kills a connection's terminals when it disconnects", async () => {
    ({ host } = await startWithWorkshop());
    const id = await openTerminal(host);
    const pid = await shellPid(host, id);

    host.client.close();

    await expectGone(pid);
  });

  it("kills the terminals when the host exits", async () => {
    ({ host } = await startWithWorkshop());
    const id = await openTerminal(host);
    const pid = await shellPid(host, id);

    const hostProcess = host.process;
    // Closed here instead, since the host is already gone.
    host.client.close();
    host = undefined;
    const exited = new Promise<void>((resolve) => hostProcess.once("exit", () => resolve()));
    hostProcess.stdin.end();
    await exited;

    await expectGone(pid);
  });

  it("kills the terminals when another workshop is opened, sending terminal.exit", async () => {
    ({ host } = await startWithWorkshop());
    const id = await openTerminal(host);
    const pid = await shellPid(host, id);

    await host.call("workshop.open", { path: await makeWorkshop() });

    await expectGone(pid);
    const testHost = host;
    await vi.waitFor(() => {
      expect(exits(testHost)).toContainEqual(expect.objectContaining({ id }));
    });
  });

  it("keeps other connections' terminals", async () => {
    ({ host } = await startWithWorkshop());
    const id = await openTerminal(host);
    const pid = await shellPid(host, id);

    const other = await startTestHost(await shellEnv());
    await other.call("workshop.open", { path: await makeWorkshop() });
    await other.close();

    expect(isRunning(pid)).toBe(true);
  });
});
