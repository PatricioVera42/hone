import { describe, expect, it } from "vitest";
import { copyName } from "./copy-name.ts";

describe("copyName", () => {
  it("keeps the name when it's free", () => {
    expect(copyName("notes.pdf", "file", () => false)).toBe("notes.pdf");
  });

  it.each([
    ["notes.pdf", "file", "notes (1).pdf"],
    ["notes.v2.pdf", "file", "notes.v2 (1).pdf"],
    ["Week 3", "folder", "Week 3 (1)"],
    ["Week 3.5", "folder", "Week 3.5 (1)"],
    ["README", "file", "README (1)"],
    [".gitignore", "file", ".gitignore (1)"],
    [".env.local", "file", ".env (1).local"],
  ] as const)("numbers %s as a %s: %s", (name, kind, expected) => {
    expect(copyName(name, kind, (candidate) => candidate === name)).toBe(expected);
  });

  it("moves on to (2) when (1) is taken too", () => {
    const taken = new Set(["notes.pdf", "notes (1).pdf"]);
    expect(copyName("notes.pdf", "file", (candidate) => taken.has(candidate))).toBe(
      "notes (2).pdf",
    );
  });
});
