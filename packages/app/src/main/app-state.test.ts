import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppStateFile } from "./app-state.ts";

async function stateFilePath(): Promise<string> {
  return path.join(await mkdtemp(path.join(tmpdir(), "hone-app-state-")), "state.json");
}

describe("AppStateFile", () => {
  it("has no last workshop before one is set", async () => {
    const state = new AppStateFile(await stateFilePath());
    await expect(state.getLastWorkshop()).resolves.toBeUndefined();
  });

  it("returns the last workshop set, across instances", async () => {
    const file = await stateFilePath();
    await new AppStateFile(file).setLastWorkshop("/home/user/studies");
    await expect(new AppStateFile(file).getLastWorkshop()).resolves.toBe("/home/user/studies");
  });

  it("treats an unreadable file as empty state instead of failing the launch", async () => {
    const file = await stateFilePath();
    await writeFile(file, "{ not json");
    await expect(new AppStateFile(file).getLastWorkshop()).resolves.toBeUndefined();
  });

  it("keeps other keys in the file when setting the last workshop", async () => {
    const file = await stateFilePath();
    await writeFile(file, JSON.stringify({ layouts: { "/a": "saved" } }));
    await new AppStateFile(file).setLastWorkshop("/home/user/studies");
    const saved: unknown = JSON.parse(await readFile(file, "utf8"));
    expect(saved).toStrictEqual({
      layouts: { "/a": "saved" },
      lastWorkshop: "/home/user/studies",
    });
  });
});
