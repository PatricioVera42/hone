import { describe, expect, it } from "vitest";
import { sortEntries } from "./sort-entries.ts";

describe("sortEntries", () => {
  it("puts folders first, then files, ignoring case", () => {
    const sorted = sortEntries([
      { name: "b.md", kind: "file" },
      { name: "Zeta", kind: "folder" },
      { name: "A.md", kind: "file" },
      { name: "alpha", kind: "folder" },
      { name: "c.md", kind: "file" },
    ]);
    expect(sorted).toStrictEqual([
      { name: "alpha", kind: "folder" },
      { name: "Zeta", kind: "folder" },
      { name: "A.md", kind: "file" },
      { name: "b.md", kind: "file" },
      { name: "c.md", kind: "file" },
    ]);
  });

  it("leaves the list it was given untouched", () => {
    const entries = [
      { name: "b.md", kind: "file" },
      { name: "a", kind: "folder" },
    ] as const;
    const copy = [...entries];
    sortEntries(entries);
    expect(entries).toStrictEqual(copy);
  });

  it("respects the natural order", () => {
    const sorted = sortEntries([
      { name: "f2.md", kind: "file" },
      { name: "f10.md", kind: "file" },
      { name: "f1.md", kind: "file" },
    ]);
    expect(sorted).toStrictEqual([
      { name: "f1.md", kind: "file" },
      { name: "f2.md", kind: "file" },
      { name: "f10.md", kind: "file" },
    ]);
  });
});
