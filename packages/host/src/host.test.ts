import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
