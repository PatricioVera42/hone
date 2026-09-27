import { describe, expect, it } from "vitest";
import { validateName } from "./name.ts";

describe("validateName", () => {
  it("rejects an empty name", () => {
    expect(validateName("").valid).toBe(false);
  });

  it("rejects a name with a slash", () => {
    expect(validateName("a/b").valid).toBe(false);
  });

  it("rejects a name with a NUL byte", () => {
    expect(validateName("a\0b").valid).toBe(false);
  });

  it("rejects '.'", () => {
    expect(validateName(".").valid).toBe(false);
  });

  it("rejects '..'", () => {
    expect(validateName("..").valid).toBe(false);
  });

  it("gives a reason when a name is invalid", () => {
    const result = validateName("");
    expect(result.valid ? undefined : result.reason).toBeTruthy();
  });

  it("accepts an ordinary name", () => {
    expect(validateName("my-project").valid).toBe(true);
  });

  it("accepts a name containing a dot that isn't '.' or '..'", () => {
    expect(validateName("v1.2").valid).toBe(true);
  });
});
