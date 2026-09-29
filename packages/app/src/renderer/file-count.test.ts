import { describe, expect, it } from "vitest";
import { describeFileCount } from "./file-count.ts";

describe("describeFileCount", () => {
  it("says one file in the singular", () => {
    expect(describeFileCount(1)).toBe("1 file");
  });

  it("groups the thousands of a larger count", () => {
    expect(describeFileCount(1234)).toBe("1,234 files");
  });

  it("says no files for an empty folder", () => {
    expect(describeFileCount(0)).toBe("no files");
  });

  it("says 10,000+ at the host's cap, where it stopped counting", () => {
    expect(describeFileCount(10_000)).toBe("10,000+ files");
  });
});
