import { describe, expect, it } from "vitest";
import { detectIndentUnit } from "./detect-indent-unit.ts";

describe("detectIndentUnit", () => {
  it("detects tabs", () => {
    expect(detectIndentUnit("if (a) {\n\tb();\n\tif (c) {\n\t\td();\n\t}\n}\n")).toBe("\t");
  });

  it("detects 2 spaces, even with deeper lines indented by 4", () => {
    expect(detectIndentUnit("a:\n  b:\n    c: 1\n  d: 2\n")).toBe("  ");
  });

  it("detects 4 spaces", () => {
    expect(detectIndentUnit("def f():\n    if x:\n        return 1\n    return 2\n")).toBe("    ");
  });

  it("goes with what most of the first indented lines use when tabs and spaces are mixed", () => {
    expect(detectIndentUnit("a\n\tb\n    c\n\td\n\te\n")).toBe("\t");
    expect(detectIndentUnit("a\n    b\n\tc\n    d\n        e\n")).toBe("    ");
  });

  it("defaults to 2 spaces when no line is indented", () => {
    expect(detectIndentUnit("# Title\n\nSome text.\n")).toBe("  ");
    expect(detectIndentUnit("")).toBe("  ");
  });

  it("ignores blank lines and single-space indents such as a comment block's", () => {
    expect(detectIndentUnit("/**\n * Docs.\n */\nf() {\n    \n    g();\n}\n")).toBe("    ");
  });

  it("reads CRLF line endings the same way", () => {
    expect(detectIndentUnit("a\r\n    b\r\n        c\r\n")).toBe("    ");
  });
});
