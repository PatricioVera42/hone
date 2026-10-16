import { describe, expect, it } from "vitest";
import { chooseStartFolder } from "./start-folder.ts";

const existing = new Set(["/home/u/work", "/home/u"]);

function sources(overrides: Partial<Parameters<typeof chooseStartFolder>[0]> = {}) {
  return {
    lastWorkshop: undefined,
    home: () => Promise.resolve("/home/u"),
    toDialogPath: (linuxPath: string) => Promise.resolve(`WIN:${linuxPath}`),
    isFolder: (dialogPath: string) =>
      Promise.resolve(existing.has(dialogPath.slice("WIN:".length))),
    ...overrides,
  };
}

describe("chooseStartFolder", () => {
  it("starts in the parent of the last workshop", async () => {
    const start = await chooseStartFolder(sources({ lastWorkshop: "/home/u/work/studies" }));
    expect(start).toBe("WIN:/home/u/work");
  });

  it("starts in the home when there is no last workshop", async () => {
    expect(await chooseStartFolder(sources())).toBe("WIN:/home/u");
  });

  it("starts in the home when the last workshop's parent no longer exists", async () => {
    const start = await chooseStartFolder(sources({ lastWorkshop: "/home/u/gone/studies" }));
    expect(start).toBe("WIN:/home/u");
  });

  it("starts in the home when converting the parent fails", async () => {
    const start = await chooseStartFolder(
      sources({
        lastWorkshop: "/home/u/work/studies",
        toDialogPath: (linuxPath) =>
          linuxPath === "/home/u" ? Promise.resolve("WIN:/home/u") : Promise.reject(new Error("x")),
      }),
    );
    expect(start).toBe("WIN:/home/u");
  });

  it("gives no start folder when the home can't be converted", async () => {
    const start = await chooseStartFolder(
      sources({ toDialogPath: () => Promise.reject(new Error("wsl.exe failed")) }),
    );
    expect(start).toBeUndefined();
  });

  it("gives no start folder when the home can't be found", async () => {
    const start = await chooseStartFolder(sources({ home: () => Promise.reject(new Error("x")) }));
    expect(start).toBeUndefined();
  });
});
