import type { FileEntry } from "@hone/protocol";
import { describe, expect, it } from "vitest";
import { applyFileChange } from "./apply-file-change.ts";

const entries: readonly FileEntry[] = [
  { name: "physics", kind: "folder" },
  { name: "agenda.md", kind: "file" },
  { name: "notes.md", kind: "file" },
];

describe("applyFileChange", () => {
  it("adds a created file in the folder, in the tree's order", () => {
    expect(
      applyFileChange("", entries, { path: "biology.md", change: "created", kind: "file" }),
    ).toStrictEqual([
      { name: "physics", kind: "folder" },
      { name: "agenda.md", kind: "file" },
      { name: "biology.md", kind: "file" },
      { name: "notes.md", kind: "file" },
    ]);
  });

  it("adds a created file to a nested folder by its name", () => {
    expect(
      applyFileChange("physics", [], { path: "physics/waves.md", change: "created", kind: "file" }),
    ).toStrictEqual([{ name: "waves.md", kind: "file" }]);
  });

  it("leaves the entries as they were for a path in another folder", () => {
    expect(
      applyFileChange("", entries, { path: "physics/waves.md", change: "created", kind: "file" }),
    ).toBe(entries);
  });

  it("treats a creation of a path already shown as a change, taking its new kind", () => {
    expect(
      applyFileChange("", entries, { path: "notes.md", change: "created", kind: "folder" }),
    ).toStrictEqual([
      { name: "notes.md", kind: "folder" },
      { name: "physics", kind: "folder" },
      { name: "agenda.md", kind: "file" },
    ]);
  });

  it("leaves the entries as they were for a change to a path shown with the same kind", () => {
    expect(
      applyFileChange("", entries, {
        path: "notes.md",
        change: "changed",
        kind: "file",
        version: "abc",
      }),
    ).toBe(entries);
  });

  it("adds a changed path the folder didn't show", () => {
    expect(
      applyFileChange("", entries, { path: "biology.md", change: "changed", kind: "file" }),
    ).toContainEqual({ name: "biology.md", kind: "file" });
  });

  it("removes a deleted path", () => {
    expect(
      applyFileChange("", entries, { path: "physics", change: "deleted", kind: "folder" }),
    ).toStrictEqual([
      { name: "agenda.md", kind: "file" },
      { name: "notes.md", kind: "file" },
    ]);
  });

  it("ignores a deletion of a path it doesn't show", () => {
    expect(
      applyFileChange("", entries, { path: "unknown.md", change: "deleted", kind: "file" }),
    ).toBe(entries);
  });
});
