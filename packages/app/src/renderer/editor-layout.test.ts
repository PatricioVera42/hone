import { describe, expect, it } from "vitest";
import { isRestorableLayout } from "./editor-layout.ts";

/** A layout as dockview's `toJSON` writes it: a file above a terminal. */
function savedLayout(panels: Record<string, unknown>) {
  return {
    grid: {
      root: {
        type: "branch",
        data: [
          { type: "leaf", data: { views: ["file"], activeView: "file", id: "1" }, size: 420 },
          {
            type: "leaf",
            data: { views: ["terminal"], activeView: "terminal", id: "2" },
            size: 180,
          },
        ],
        size: 800,
      },
      width: 800,
      height: 600,
      orientation: "VERTICAL",
    },
    panels,
    activeGroup: "1",
  };
}

describe("isRestorableLayout", () => {
  it("accepts a saved layout of editor and terminal panels", () => {
    const layout = savedLayout({
      file: {
        id: "file",
        contentComponent: "editor",
        title: "algebra.md",
        params: { path: "algebra.md" },
      },
      terminal: {
        id: "terminal",
        contentComponent: "terminal",
        title: "studies",
        renderer: "always",
        params: { cwd: "" },
      },
    });
    expect(isRestorableLayout(layout)).toBe(true);
  });

  it("rejects what isn't a layout", () => {
    expect(isRestorableLayout(undefined)).toBe(false);
    expect(isRestorableLayout("layout")).toBe(false);
    expect(isRestorableLayout({ panels: {} })).toBe(false);
  });

  it("rejects a layout with a panel it couldn't reopen", () => {
    const withoutPath = savedLayout({
      file: { id: "file", contentComponent: "editor", title: "algebra.md", params: {} },
    });
    const unknownComponent = savedLayout({
      file: { id: "file", contentComponent: "browser", title: "web", params: { path: "a" } },
    });
    expect(isRestorableLayout(withoutPath)).toBe(false);
    expect(isRestorableLayout(unknownComponent)).toBe(false);
  });
});
