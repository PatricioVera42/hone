import { describe, expect, it } from "vitest";
import { collapseChanges } from "./collapse-changes.ts";

describe("collapseChanges", () => {
  it("passes a single event through", () => {
    expect(collapseChanges([{ change: "deleted", kind: "folder" }])).toStrictEqual({
      change: "deleted",
      kind: "folder",
    });
  });

  it("keeps a creation followed by a change as a creation", () => {
    expect(
      collapseChanges([
        { change: "created", kind: "file" },
        { change: "changed", kind: "file" },
      ]),
    ).toStrictEqual({ change: "created", kind: "file" });
  });

  it("drops a creation followed by a deletion", () => {
    expect(
      collapseChanges([
        { change: "created", kind: "file" },
        { change: "deleted", kind: "file" },
      ]),
    ).toBeUndefined();
  });

  it("turns a deletion followed by a creation into a change, with the last event's kind", () => {
    expect(
      collapseChanges([
        { change: "deleted", kind: "file" },
        { change: "created", kind: "folder" },
      ]),
    ).toStrictEqual({ change: "changed", kind: "folder" });
  });

  it("turns a change followed by a deletion into a deletion", () => {
    expect(
      collapseChanges([
        { change: "changed", kind: "file" },
        { change: "deleted", kind: "file" },
      ]),
    ).toStrictEqual({ change: "deleted", kind: "file" });
  });

  it("only looks at the first and last events", () => {
    expect(
      collapseChanges([
        { change: "created", kind: "file" },
        { change: "deleted", kind: "file" },
        { change: "created", kind: "file" },
        { change: "changed", kind: "file" },
      ]),
    ).toStrictEqual({ change: "created", kind: "file" });
  });
});
