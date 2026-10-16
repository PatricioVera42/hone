import { describe, expect, it } from "vitest";
import { tabsToClose } from "./tabs-to-close.ts";

const tabs = ["a.md", "b.md", "shell", "c.md", "d.md"];
const isTerminal = (tab: string) => tab === "shell";

describe("tabsToClose", () => {
  it("closes only the clicked tab, even a terminal", () => {
    expect(tabsToClose("close", tabs, "shell", isTerminal)).toStrictEqual(["shell"]);
  });

  it("closes the other tabs but not the terminals", () => {
    expect(tabsToClose("others", tabs, "b.md", isTerminal)).toStrictEqual(["a.md", "c.md", "d.md"]);
  });

  it("closes the tabs to the right, skipping terminals", () => {
    expect(tabsToClose("right", tabs, "b.md", isTerminal)).toStrictEqual(["c.md", "d.md"]);
  });

  it("closes the tabs to the right of a terminal that was clicked", () => {
    expect(tabsToClose("right", tabs, "shell", isTerminal)).toStrictEqual(["c.md", "d.md"]);
  });

  it("closes nothing to the right of the last tab", () => {
    expect(tabsToClose("right", tabs, "d.md", isTerminal)).toStrictEqual([]);
  });

  it("closes every tab but the terminals", () => {
    expect(tabsToClose("all", tabs, "c.md", isTerminal)).toStrictEqual([
      "a.md",
      "b.md",
      "c.md",
      "d.md",
    ]);
  });

  it("closes nothing in a group of only a terminal", () => {
    expect(tabsToClose("all", ["shell"], "shell", isTerminal)).toStrictEqual([]);
    expect(tabsToClose("others", ["shell"], "shell", isTerminal)).toStrictEqual([]);
  });
});
