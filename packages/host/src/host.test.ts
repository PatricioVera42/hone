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
