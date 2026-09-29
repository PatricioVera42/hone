import { describe, expect, it } from "vitest";
import { decideOpenFileAction } from "./decide-open-file-action.ts";

const known = "v1";

describe("decideOpenFileAction", () => {
  it("ignores the echo of our own save", () => {
    const input = {
      kind: "change",
      change: { path: "a.md", change: "changed", kind: "file", version: known },
    } as const;
    expect(decideOpenFileAction({ version: known, pendingEdits: false }, input)).toBe("ignore");
    expect(decideOpenFileAction({ version: known, pendingEdits: true }, input)).toBe("ignore");
  });

  it("reloads, keeping the cursor, on a change without pending edits", () => {
    expect(
      decideOpenFileAction(
        { version: known, pendingEdits: false },
        {
          kind: "change",
          change: { path: "a.md", change: "changed", kind: "file", version: "v2" },
        },
      ),
    ).toBe("reload");
  });

  it("reloads discarding the edits on a change while edits are pending", () => {
    expect(
      decideOpenFileAction(
        { version: known, pendingEdits: true },
        {
          kind: "change",
          change: { path: "a.md", change: "changed", kind: "file", version: "v2" },
        },
      ),
    ).toBe("reloadDiscardingEdits");
  });

  it("treats a change without a version, such as a file that stopped being text, as a different version", () => {
    expect(
      decideOpenFileAction(
        { version: known, pendingEdits: false },
        { kind: "change", change: { path: "a.md", change: "changed", kind: "file" } },
      ),
    ).toBe("reload");
  });

  it("reloads discarding the edits when a save fails with VersionConflict", () => {
    expect(
      decideOpenFileAction({ version: known, pendingEdits: true }, { kind: "saveConflict" }),
    ).toBe("reloadDiscardingEdits");
  });

  it("closes the tab when the file is deleted", () => {
    expect(
      decideOpenFileAction(
        { version: known, pendingEdits: true },
        { kind: "change", change: { path: "a.md", change: "deleted", kind: "file" } },
      ),
    ).toBe("close");
  });

  it("handles a creation of the open file like a change, since an earlier event may have been lost", () => {
    const state = { version: known, pendingEdits: false };
    expect(
      decideOpenFileAction(state, {
        kind: "change",
        change: { path: "a.md", change: "created", kind: "file", version: known },
      }),
    ).toBe("ignore");
    expect(
      decideOpenFileAction(state, {
        kind: "change",
        change: { path: "a.md", change: "created", kind: "file", version: "v2" },
      }),
    ).toBe("reload");
  });

  it("closes the tab when a folder takes the file's place", () => {
    expect(
      decideOpenFileAction(
        { version: known, pendingEdits: false },
        { kind: "change", change: { path: "a.md", change: "created", kind: "folder" } },
      ),
    ).toBe("close");
  });
});
