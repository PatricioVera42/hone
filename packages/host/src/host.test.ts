import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectToHost,
  spawnHost,
  startTestHost,
  type SpawnedHost,
  type TestHost,
} from "./test-harness.ts";

async function makeWorkshop(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hone-workshop-"));
  await fs.mkdir(path.join(root, ".hone", "generator"), { recursive: true });
  return root;
}

function closeSpawned(spawned: SpawnedHost): Promise<void> {
  spawned.process.stdin.end();
  return new Promise((resolve) => spawned.process.once("exit", () => resolve()));
}

let host: TestHost | undefined;

afterEach(async () => {
  await host?.close();
  host = undefined;
});

describe("authentication", () => {
  it("rejects a connection without a token", async () => {
    const spawned = await spawnHost();
    try {
      await expect(connectToHost(spawned.port, "")).rejects.toThrow();
    } finally {
      await closeSpawned(spawned);
    }
  });

  it("rejects a connection with the wrong token", async () => {
    const spawned = await spawnHost();
    try {
      await expect(connectToHost(spawned.port, "wrong-token")).rejects.toThrow();
    } finally {
      await closeSpawned(spawned);
    }
  });

  it("accepts a connection with the right token", async () => {
    host = await startTestHost();
    expect(host.client.readyState).toBe(host.client.OPEN);
  });
});

describe("malformed and invalid messages", () => {
  it("returns an error for malformed JSON", async () => {
    host = await startTestHost();
    const client = host.client;
    const raw = await new Promise<string>((resolve) => {
      client.once("message", (data: Buffer) => resolve(data.toString()));
      client.send("{not json");
    });
    expect(JSON.parse(raw)).toMatchObject({ error: { code: -32700 } });
  });

  it("returns an error for an invalid request", async () => {
    host = await startTestHost();
    const client = host.client;
    const raw = await new Promise<string>((resolve) => {
      client.once("message", (data: Buffer) => resolve(data.toString()));
      client.send(JSON.stringify({ jsonrpc: "2.0", id: 1 }));
    });
    expect(JSON.parse(raw)).toMatchObject({ id: 1, error: { code: -32600 } });
  });

  it("returns an error for an unknown method", async () => {
    host = await startTestHost();
    await expect(host.call("nope.nope", {})).rejects.toMatchObject({ code: -32601 });
  });

  it("returns an error for invalid params", async () => {
    host = await startTestHost();
    await expect(host.call("workshop.open", { wrong: true })).rejects.toMatchObject({
      code: -32602,
    });
  });
});

describe("workshop.open", () => {
  it("walks up from a nested folder to the workshop root", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    const nested = path.join(root, "a", "b");
    await fs.mkdir(nested, { recursive: true });

    const result = await host.call("workshop.open", { path: nested });
    expect(result).toStrictEqual({ root, name: path.basename(root), onWindowsDisk: false });
  });

  it("fails with NotAWorkshop outside any workshop", async () => {
    host = await startTestHost();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "hone-outside-"));

    await expect(host.call("workshop.open", { path: outside })).rejects.toMatchObject({
      code: -32000,
    });
  });
});

describe("workshop.create", () => {
  it("creates <name>/.hone/generator and opens it", async () => {
    host = await startTestHost();
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "hone-parent-"));

    const result = await host.call("workshop.create", { parent, name: "my-workshop" });
    const root = path.join(parent, "my-workshop");
    expect(result).toStrictEqual({ root, name: "my-workshop", onWindowsDisk: false });
    const stats = await fs.stat(path.join(root, ".hone", "generator"));
    expect(stats.isDirectory()).toBe(true);
  });

  it("fails with NestedWorkshop inside another workshop, creating nothing", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();

    await expect(
      host.call("workshop.create", { parent: root, name: "child" }),
    ).rejects.toMatchObject({
      code: -32001,
    });
    await expect(fs.readdir(root)).resolves.toStrictEqual([".hone"]);
  });

  it("fails with AlreadyExists when the target exists, creating nothing inside it", async () => {
    host = await startTestHost();
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "hone-parent-"));
    await fs.mkdir(path.join(parent, "taken"));

    await expect(host.call("workshop.create", { parent, name: "taken" })).rejects.toMatchObject({
      code: -32002,
    });
    await expect(fs.readdir(path.join(parent, "taken"))).resolves.toStrictEqual([]);
  });

  it("fails with InvalidName for an empty name, creating nothing", async () => {
    host = await startTestHost();
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "hone-parent-"));

    await expect(host.call("workshop.create", { parent, name: "" })).rejects.toMatchObject({
      code: -32009,
    });
    await expect(fs.readdir(parent)).resolves.toStrictEqual([]);
  });
});

describe("files.list", () => {
  it("fails with NoWorkshopOpen before a workshop is open", async () => {
    host = await startTestHost();

    await expect(host.call("files.list", { path: "" })).rejects.toMatchObject({
      code: -32008,
    });
  });

  it("lists the root's files and folders, a symlink taking its target's kind", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "note.md"), "");
    await fs.mkdir(path.join(root, "project"));
    await fs.symlink(path.join(root, "project"), path.join(root, "project-link"));
    await fs.symlink(path.join(root, "missing"), path.join(root, "broken-link"));
    await host.call("workshop.open", { path: root });

    const entries = await host.call("files.list", { path: "" });
    expect(entries).toHaveLength(5);
    expect(entries).toStrictEqual(
      expect.arrayContaining([
        { name: ".hone", kind: "folder" },
        { name: "note.md", kind: "file" },
        { name: "project", kind: "folder" },
        { name: "project-link", kind: "folder" },
        { name: "broken-link", kind: "file" },
      ]),
    );
  });

  it("omits .git and node_modules at any depth, but not other dot folders", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.mkdir(path.join(root, ".git"));
    await fs.mkdir(path.join(root, ".claude"));
    await fs.mkdir(path.join(root, "project", "node_modules"), { recursive: true });
    await fs.writeFile(path.join(root, "project", "package.json"), "");
    await host.call("workshop.open", { path: root });

    const rootEntries = await host.call("files.list", { path: "" });
    expect(rootEntries).toHaveLength(3);
    expect(rootEntries).toStrictEqual(
      expect.arrayContaining([
        { name: ".hone", kind: "folder" },
        { name: ".claude", kind: "folder" },
        { name: "project", kind: "folder" },
      ]),
    );
    await expect(host.call("files.list", { path: "project" })).resolves.toStrictEqual([
      { name: "package.json", kind: "file" },
    ]);
  });

  it("lists a nested folder by its path relative to the root", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.mkdir(path.join(root, "a", "b"), { recursive: true });
    await fs.writeFile(path.join(root, "a", "b", "note.md"), "");
    await host.call("workshop.open", { path: root });

    await expect(host.call("files.list", { path: "a/b" })).resolves.toStrictEqual([
      { name: "note.md", kind: "file" },
    ]);
  });

  it("fails with NotFound for a folder that doesn't exist", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await host.call("workshop.open", { path: root });

    await expect(host.call("files.list", { path: "missing" })).rejects.toMatchObject({
      code: -32003,
    });
  });

  it("fails with NotFound for a file", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "note.md"), "");
    await host.call("workshop.open", { path: root });

    await expect(host.call("files.list", { path: "note.md" })).rejects.toMatchObject({
      code: -32003,
    });
  });

  it.each(["..", "a/../..", "/etc"])(
    "fails with OutsideWorkshop for %j, even if it exists",
    async (outsidePath) => {
      host = await startTestHost();
      const root = await makeWorkshop();
      await fs.mkdir(path.join(root, "a"));
      await host.call("workshop.open", { path: root });

      await expect(host.call("files.list", { path: outsidePath })).rejects.toMatchObject({
        code: -32004,
      });
    },
  );

  it("fails with OutsideWorkshop through a symlink to a folder outside the workshop", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "hone-outside-"));
    await fs.symlink(outside, path.join(root, "escape"));
    await host.call("workshop.open", { path: root });

    await expect(host.call("files.list", { path: "escape" })).rejects.toMatchObject({
      code: -32004,
    });
  });

  it("lists a workshop the connection just created", async () => {
    host = await startTestHost();
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "hone-parent-"));
    await host.call("workshop.create", { parent, name: "fresh" });

    await expect(host.call("files.list", { path: "" })).resolves.toStrictEqual([
      { name: ".hone", kind: "folder" },
    ]);
  });

  it("lists the workshop that the connection opened last", async () => {
    host = await startTestHost();
    const first = await makeWorkshop();
    const second = await makeWorkshop();
    await fs.writeFile(path.join(second, "note.md"), "");
    await host.call("workshop.open", { path: first });
    await host.call("workshop.open", { path: second });

    await expect(host.call("files.list", { path: "" })).resolves.toContainEqual({
      name: "note.md",
      kind: "file",
    });
  });
});

describe("files.read", () => {
  it("returns the content with its original line endings, and the SHA-256 hex of its bytes as the version", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.mkdir(path.join(root, "notes"));
    await fs.writeFile(path.join(root, "notes", "hello.md"), "hello\r\nworld\r\n");
    await host.call("workshop.open", { path: root });

    await expect(host.call("files.read", { path: "notes/hello.md" })).resolves.toStrictEqual({
      content: "hello\r\nworld\r\n",
      version: "8f9e99332aa14be2fd8e6e7052c0a42ecedf771020a3293170dfefa344da59ac",
    });
  });

  it("fails with TooLarge for a file over 5 MB", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "big.txt"), Buffer.alloc(5 * 1024 * 1024 + 1, "a"));
    await host.call("workshop.open", { path: root });

    await expect(host.call("files.read", { path: "big.txt" })).rejects.toMatchObject({
      code: -32007,
    });
  });

  it("fails with NotText for a file with a NUL byte in its first 8 KB", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "image.png"), Buffer.from([0x89, 0x50, 0x00, 0x47]));
    await host.call("workshop.open", { path: root });

    await expect(host.call("files.read", { path: "image.png" })).rejects.toMatchObject({
      code: -32006,
    });
  });

  it("fails with NotFound for a file that doesn't exist", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await host.call("workshop.open", { path: root });

    await expect(host.call("files.read", { path: "missing.md" })).rejects.toMatchObject({
      code: -32003,
    });
  });

  it("fails with NotFound for a folder", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.mkdir(path.join(root, "notes"));
    await host.call("workshop.open", { path: root });

    await expect(host.call("files.read", { path: "notes" })).rejects.toMatchObject({
      code: -32003,
    });
  });

  it.each(["../secret.md", "/etc/hostname"])(
    "fails with OutsideWorkshop for %j",
    async (outsidePath) => {
      host = await startTestHost();
      const root = await makeWorkshop();
      await host.call("workshop.open", { path: root });

      await expect(host.call("files.read", { path: outsidePath })).rejects.toMatchObject({
        code: -32004,
      });
    },
  );

  it("fails with OutsideWorkshop through a symlink to a file outside the workshop", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "hone-outside-"));
    await fs.writeFile(path.join(outside, "secret.md"), "secret");
    await fs.symlink(path.join(outside, "secret.md"), path.join(root, "escape.md"));
    await host.call("workshop.open", { path: root });

    await expect(host.call("files.read", { path: "escape.md" })).rejects.toMatchObject({
      code: -32004,
    });
  });
});

describe("files.write", () => {
  const helloVersion = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

  it("writes the content when the base version matches, and returns the new version", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "note.md"), "hello");
    await host.call("workshop.open", { path: root });

    await expect(
      host.call("files.write", { path: "note.md", content: "world", baseVersion: helloVersion }),
    ).resolves.toStrictEqual({
      version: "486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7",
    });
    await expect(fs.readFile(path.join(root, "note.md"), "utf8")).resolves.toBe("world");
  });

  it("fails with VersionConflict for a stale base version, leaving the file untouched", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "note.md"), "changed by an agent");
    await host.call("workshop.open", { path: root });

    await expect(
      host.call("files.write", { path: "note.md", content: "world", baseVersion: helloVersion }),
    ).rejects.toMatchObject({ code: -32005 });
    await expect(fs.readFile(path.join(root, "note.md"), "utf8")).resolves.toBe(
      "changed by an agent",
    );
  });

  it("reports the write as one change to the target, never to its temporary", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "note.md"), "hello");
    await host.call("workshop.open", { path: root });

    await host.call("files.write", {
      path: "note.md",
      content: "world",
      baseVersion: helloVersion,
    });

    const testHost = host;
    await vi.waitFor(() => {
      expect(fileChanges(testHost)).not.toStrictEqual([]);
    });
    // Leaves time for any stray notification after the first to arrive.
    await setTimeout(200);
    expect(fileChanges(testHost)).toStrictEqual([
      {
        path: "note.md",
        change: "changed",
        kind: "file",
        version: "486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7",
      },
    ]);
    await expect(fs.readdir(root)).resolves.toStrictEqual([".hone", "note.md"]);
  });

  it("keeps the file's mode", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "run.sh"), "hello", { mode: 0o755 });
    await host.call("workshop.open", { path: root });

    await host.call("files.write", { path: "run.sh", content: "world", baseVersion: helloVersion });

    expect((await fs.stat(path.join(root, "run.sh"))).mode & 0o777).toBe(0o755);
  });

  it("writes through a symlink onto its target, keeping the symlink", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "note.md"), "hello");
    await fs.symlink("note.md", path.join(root, "link.md"));
    await host.call("workshop.open", { path: root });

    await host.call("files.write", {
      path: "link.md",
      content: "world",
      baseVersion: helloVersion,
    });

    expect((await fs.lstat(path.join(root, "link.md"))).isSymbolicLink()).toBe(true);
    await expect(fs.readFile(path.join(root, "note.md"), "utf8")).resolves.toBe("world");
  });

  it("fails with TooLarge for content over 5 MB, leaving the file untouched", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "note.md"), "hello");
    await host.call("workshop.open", { path: root });

    await expect(
      host.call("files.write", {
        path: "note.md",
        content: "a".repeat(5 * 1024 * 1024 + 1),
        baseVersion: helloVersion,
      }),
    ).rejects.toMatchObject({ code: -32007 });
    await expect(fs.readFile(path.join(root, "note.md"), "utf8")).resolves.toBe("hello");
  });

  it("fails with NotFound for a file that doesn't exist, creating nothing", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await host.call("workshop.open", { path: root });

    await expect(
      host.call("files.write", { path: "missing.md", content: "world", baseVersion: helloVersion }),
    ).rejects.toMatchObject({ code: -32003 });
    await expect(fs.readdir(root)).resolves.toStrictEqual([".hone"]);
  });

  it("fails with NotFound for a folder", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.mkdir(path.join(root, "notes"));
    await host.call("workshop.open", { path: root });

    await expect(
      host.call("files.write", { path: "notes", content: "world", baseVersion: helloVersion }),
    ).rejects.toMatchObject({ code: -32003 });
  });

  it("fails with OutsideWorkshop for a path outside the workshop", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await host.call("workshop.open", { path: root });

    await expect(
      host.call("files.write", { path: "../note.md", content: "world", baseVersion: helloVersion }),
    ).rejects.toMatchObject({ code: -32004 });
  });
});

/** The `files.changed` notifications received so far, as their params. */
function fileChanges(testHost: TestHost): unknown[] {
  return testHost.notifications
    .filter((notification) => notification.method === "files.changed")
    .map((notification) => notification.params);
}

/** Runs a shell command in another process, the way a terminal or an agent would touch the workshop. */
function runShell(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("sh", ["-c", command], { cwd }, (error) => {
      if (error === null) resolve();
      else reject(error);
    });
  });
}

describe("files.changed", () => {
  it("reports a file written by another process, with the SHA-256 of its bytes as the version", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await host.call("workshop.open", { path: root });

    await runShell("printf hello > note.md", root);

    const testHost = host;
    await vi.waitFor(() => {
      expect(fileChanges(testHost)).toContainEqual({
        path: "note.md",
        change: "created",
        kind: "file",
        version: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      });
    });
  });

  it("reports an atomic save (a temporary written, then renamed onto the target) as one change to the target", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "note.md"), "hello");
    await host.call("workshop.open", { path: root });

    // The way Claude Code's Write and Edit tools save (research/spike-04-file-watching.md). The pause outlasts
    // the collapsing window, so the temporary would get its own notifications if it weren't ignored.
    await runShell(
      "printf world > note.md.tmp.4242.a1b2c3 && sleep 0.1 && mv note.md.tmp.4242.a1b2c3 note.md",
      root,
    );

    const testHost = host;
    await vi.waitFor(() => {
      expect(fileChanges(testHost)).not.toStrictEqual([]);
    });
    // Leaves time for any stray notification after the first to arrive.
    await setTimeout(200);
    expect(fileChanges(testHost)).toStrictEqual([
      {
        path: "note.md",
        change: "changed",
        kind: "file",
        version: "486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7",
      },
    ]);
  });

  it("reports a deleted file, and a new folder with a file inside", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.writeFile(path.join(root, "old.md"), "");
    await host.call("workshop.open", { path: root });

    await runShell("rm old.md && mkdir project && printf '' > project/notes.md", root);

    const testHost = host;
    await vi.waitFor(() => {
      const changes = fileChanges(testHost);
      expect(changes).toContainEqual({ path: "old.md", change: "deleted", kind: "file" });
      expect(changes).toContainEqual({ path: "project", change: "created", kind: "folder" });
      expect(changes).toContainEqual({
        path: "project/notes.md",
        change: "created",
        kind: "file",
        version: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      });
    });
  });

  it("reports a symlink with its target's kind, the way files.list does", async () => {
    host = await startTestHost();
    const root = await makeWorkshop();
    await fs.mkdir(path.join(root, "project"));
    await host.call("workshop.open", { path: root });

    await fs.symlink(path.join(root, "project"), path.join(root, "project-link"));

    const testHost = host;
    await vi.waitFor(() => {
      expect(fileChanges(testHost)).toContainEqual({
        path: "project-link",
        change: "created",
        kind: "folder",
      });
    });
  });

  it("stops watching the previous workshop once another one is opened", async () => {
    host = await startTestHost();
    const first = await makeWorkshop();
    const second = await makeWorkshop();
    await host.call("workshop.open", { path: first });
    await host.call("workshop.open", { path: second });

    await fs.writeFile(path.join(first, "first.md"), "");
    await fs.writeFile(path.join(second, "second.md"), "");

    const testHost = host;
    // Both writes happen together, so by the time the second workshop's arrives the first's would have too.
    await vi.waitFor(() => {
      expect(fileChanges(testHost)).toContainEqual(expect.objectContaining({ path: "second.md" }));
    });
    expect(fileChanges(testHost)).not.toContainEqual(expect.objectContaining({ path: "first.md" }));
  });
  // Root reads any folder regardless of its mode, so there'd be no error to report.
  it.skipIf(process.getuid?.() === 0)(
    "writes a watcher error to stderr instead of dropping it",
    async () => {
      host = await startTestHost();
      const root = await makeWorkshop();
      const locked = path.join(root, "locked");
      await fs.mkdir(locked);
      await fs.chmod(locked, 0o000);
      let stderr = "";
      host.process.stderr.on("data", (chunk: Buffer) => {
        stderr += String(chunk);
      });
      try {
        await host.call("workshop.open", { path: root });

        await vi.waitFor(() => {
          expect(stderr).toContain("EACCES");
        });
      } finally {
        await fs.chmod(locked, 0o755);
      }
    },
  );
});

describe("lifecycle", () => {
  it("exits when its stdin closes", async () => {
    const spawned = await spawnHost();
    const exit = new Promise<number | null>((resolve) =>
      spawned.process.once("exit", (code) => resolve(code)),
    );
    spawned.process.stdin.end();
    await expect(exit).resolves.toBe(0);
  });
});
