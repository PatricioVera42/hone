import { File01Icon, Pdf01Icon, Typescript01Icon } from "@hugeicons/core-free-icons";
import { describe, expect, it } from "vitest";
import { fileIcon } from "./file-icon.ts";

describe("fileIcon", () => {
  it("takes the extension after the last dot", () => {
    expect(fileIcon("notes.v2.pdf")).toBe(Pdf01Icon);
    expect(fileIcon("app.test.tsx")).toBe(Typescript01Icon);
  });

  it("matches lowercase extensions only", () => {
    expect(fileIcon("notes.PDF")).toBe(File01Icon);
  });

  it("gives the generic icon to names without an extension", () => {
    expect(fileIcon("README")).toBe(File01Icon);
    expect(fileIcon(".gitignore")).toBe(File01Icon);
    expect(fileIcon(".pdf")).toBe(File01Icon);
    expect(fileIcon("archive.")).toBe(File01Icon);
  });
});
