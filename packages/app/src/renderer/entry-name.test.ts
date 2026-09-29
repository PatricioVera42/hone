import { describe, expect, it } from "vitest";
import { entryNameError, noteFileName } from "./entry-name.ts";

describe("noteFileName", () => {
  it("appends .md to a name without an extension", () => {
    expect(noteFileName("idea")).toBe("idea.md");
  });

  it("keeps a name with an extension as typed", () => {
    expect(noteFileName("notes.txt")).toBe("notes.txt");
  });

  it("appends .md when the only dot is the first character", () => {
    expect(noteFileName(".gitignore")).toBe(".gitignore.md");
  });

  it("leaves an empty name empty, so it's still reported as empty", () => {
    expect(noteFileName("")).toBe("");
  });
});

describe("entryNameError", () => {
  const siblings = [
    { name: "math", kind: "folder" },
    { name: "idea.md", kind: "file" },
  ] as const;

  it("accepts a new name", () => {
    expect(entryNameError("plan.md", siblings)).toBeUndefined();
  });

  it("rejects a name the protocol rejects, with its reason", () => {
    expect(entryNameError("a/b", siblings)).toBe('The name can\'t contain "/".');
  });

  it("rejects a name already in the folder, of either kind", () => {
    expect(entryNameError("math", siblings)).toBe("math already exists in this folder.");
    expect(entryNameError("idea.md", siblings)).toBe("idea.md already exists in this folder.");
  });

  it("accepts the entry's own name, for a rename that keeps it", () => {
    expect(entryNameError("idea.md", siblings, "idea.md")).toBeUndefined();
  });
});
