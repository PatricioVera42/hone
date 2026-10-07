import { describe, expect, it } from "vitest";
import { ancestorFolders, isAtOrInside, renamedPath } from "./entry-path.ts";

describe("renamedPath", () => {
  it("gives the renamed entry's new path", () => {
    expect(renamedPath("math/idea.md", "math/idea.md", "math/plan.md")).toBe("math/plan.md");
  });

  it("moves a path inside a renamed folder", () => {
    expect(renamedPath("math/algebra/groups.md", "math", "maths")).toBe("maths/algebra/groups.md");
  });

  it("leaves a sibling whose name only starts the same", () => {
    expect(renamedPath("mathematics/idea.md", "math", "maths")).toBeUndefined();
  });
});

describe("isAtOrInside", () => {
  it("is true for the entry itself and anything inside it", () => {
    expect(isAtOrInside("math", "math")).toBe(true);
    expect(isAtOrInside("math/algebra/groups.md", "math")).toBe(true);
  });

  it("is false for a sibling whose name only starts the same", () => {
    expect(isAtOrInside("mathematics/idea.md", "math")).toBe(false);
  });
});

describe("ancestorFolders", () => {
  it("lists the folders above a file from the workshop root down, each with its own path", () => {
    expect(ancestorFolders("notes/math/algebra.md")).toEqual([
      { name: "notes", path: "notes" },
      { name: "math", path: "notes/math" },
    ]);
  });

  it("is empty for a file at the workshop root", () => {
    expect(ancestorFolders("algebra.md")).toEqual([]);
  });
});
