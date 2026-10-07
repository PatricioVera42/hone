import { describe, expect, it } from "vitest";
import { dragSidebarEdge } from "./sidebar-drag.ts";

describe("dragSidebarEdge", () => {
  it("makes the sidebar as wide as the pointer is far from the window's left edge", () => {
    expect(dragSidebarEdge(300, 1200)).toStrictEqual({ collapsed: false, width: 300 });
  });

  it("stops at 180 px between 90 px and 180 px", () => {
    expect(dragSidebarEdge(120, 1200)).toStrictEqual({ collapsed: false, width: 180 });
    expect(dragSidebarEdge(90, 1200)).toStrictEqual({ collapsed: false, width: 180 });
  });

  it("collapses below 90 px", () => {
    expect(dragSidebarEdge(89, 1200)).toStrictEqual({ collapsed: true });
    expect(dragSidebarEdge(-40, 1200)).toStrictEqual({ collapsed: true });
  });

  it("stops at half the window's width", () => {
    expect(dragSidebarEdge(900, 1200)).toStrictEqual({ collapsed: false, width: 600 });
  });
});
