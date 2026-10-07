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

  it("has no layout for a workshop whose layout was never saved", async () => {
    const state = new AppStateFile(await stateFilePath());
    await state.setLayout("/home/user/studies", { grid: "studies" });
    await expect(state.getLayout("/home/user/work")).resolves.toBeUndefined();
  });

  it("returns each workshop's own saved layout, across instances", async () => {
    const file = await stateFilePath();
    await new AppStateFile(file).setLayout("/home/user/studies", { grid: "studies" });
    await new AppStateFile(file).setLayout("/home/user/work", { grid: "work" });
    const state = new AppStateFile(file);
    await expect(state.getLayout("/home/user/studies")).resolves.toStrictEqual({ grid: "studies" });
    await expect(state.getLayout("/home/user/work")).resolves.toStrictEqual({ grid: "work" });
  });

  it("loses no change when a layout and the last workshop are set at the same time", async () => {
    // A layout save can still be on its way when the app records the workshop it switched to.
    const file = await stateFilePath();
    const state = new AppStateFile(file);
    await Promise.all([
      state.setLayout("/home/user/studies", { grid: "studies" }),
      state.setLastWorkshop("/home/user/work"),
    ]);
    const reread = new AppStateFile(file);
    await expect(reread.getLayout("/home/user/studies")).resolves.toStrictEqual({
      grid: "studies",
    });
    await expect(reread.getLastWorkshop()).resolves.toBe("/home/user/work");
  });

  it("has no sidebar width before one is set", async () => {
    const state = new AppStateFile(await stateFilePath());
    await expect(state.getSidebarWidth()).resolves.toBeUndefined();
  });

  it("returns the sidebar width set, across instances", async () => {
    const file = await stateFilePath();
    await new AppStateFile(file).setSidebarWidth(312);
    await expect(new AppStateFile(file).getSidebarWidth()).resolves.toBe(312);
  });

  it("ignores an invalid sidebar width without losing the rest of the state", async () => {
    const file = await stateFilePath();
    await writeFile(
      file,
      JSON.stringify({ lastWorkshop: "/home/user/studies", sidebarWidth: "wide" }),
    );
    const state = new AppStateFile(file);
    await expect(state.getSidebarWidth()).resolves.toBeUndefined();
    await expect(state.getLastWorkshop()).resolves.toBe("/home/user/studies");
  });

  it("ignores a sidebar width that isn't positive", async () => {
    const file = await stateFilePath();
    await writeFile(file, JSON.stringify({ sidebarWidth: -20 }));
    await expect(new AppStateFile(file).getSidebarWidth()).resolves.toBeUndefined();
  });
});
