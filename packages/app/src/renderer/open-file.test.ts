import {
  appErrorCodes,
  filesReadMethod,
  filesWriteMethod,
  type FileChange,
  type MethodDefinition,
} from "@hone/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/toast.tsx";
import { HostCallError } from "./host-client.ts";
import { OpenFile } from "./open-file.ts";

interface RecordedCall {
  readonly method: string;
  readonly params: unknown;
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
}

/** Records each call and leaves it pending until the test answers it. */
function recordingClient() {
  const calls: RecordedCall[] = [];
  const client = {
    call<Params, Result>(
      method: MethodDefinition<Params, Result>,
      params: Params,
    ): Promise<Result> {
      return new Promise<Result>((resolve, reject) => {
        calls.push({
          method: method.name,
          params,
          resolve: (result) => resolve(method.result.parse(result)),
          reject,
        });
      });
    },
  };
  return { client, calls };
}

function openFile(path = "notes/a.md") {
  const { client, calls } = recordingClient();
  const editor = {
    content: "opened",
    read() {
      return this.content;
    },
    replace(content: string) {
      this.content = content;
    },
  };
  const onDeleted = vi.fn<() => void>();
  const onEditsDiscarded = vi.fn<(name: string) => void>();
  const file = new OpenFile({ client, path, version: "v1", editor, onDeleted, onEditsDiscarded });
  /** Types into the editor. */
  function type(content: string): void {
    editor.content = content;
    file.edited();
  }
  return { file, calls, editor, type, onDeleted, onEditsDiscarded };
}

/** The calls made so far, without their answers. */
function made(calls: readonly RecordedCall[]) {
  return calls.map(({ method, params }) => ({ method, params }));
}

function changed(version: string): FileChange {
  return { path: "notes/a.md", change: "changed", kind: "file", version };
}

/** Lets every pending promise callback run. */
function settled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OpenFile", () => {
  it("saves once, 500 ms after the last of several edits, based on the version it opened at", async () => {
    const { calls, type } = openFile();
    type("first");
    vi.advanceTimersByTime(499);
    type("second");
    vi.advanceTimersByTime(499);
    await settled();
    expect(calls).toStrictEqual([]);

    vi.advanceTimersByTime(1);
    await settled();
    expect(made(calls)).toStrictEqual([
      {
        method: filesWriteMethod.name,
        params: { path: "notes/a.md", content: "second", baseVersion: "v1" },
      },
    ]);
  });

  it("weighs a change that arrives during a save once the save answers, recognizing the save's echo", async () => {
    const { file, calls, editor, type } = openFile();
    type("saved");
    const flushed = file.flush();
    await settled();
    file.receive(changed("v2"));
    await settled();
    calls[0]?.resolve({ version: "v2" });
    await flushed;
    await settled();

    expect(made(calls).map(({ method }) => method)).toStrictEqual([filesWriteMethod.name]);
    expect(editor.content).toBe("saved");
  });

  it("reloads an external change without pending edits, without a warning", async () => {
    const { file, calls, editor, type, onEditsDiscarded } = openFile();
    file.receive(changed("v2"));
    await settled();
    expect(made(calls)).toStrictEqual([
      { method: filesReadMethod.name, params: { path: "notes/a.md" } },
    ]);
    calls[0]?.resolve({ content: "from disk", version: "v2" });
    await settled();
    expect(editor.content).toBe("from disk");
    expect(onEditsDiscarded).not.toHaveBeenCalled();

    // Later saves are based on the version it reloaded.
    type("edited");
    void file.flush();
    await settled();
    expect(calls[1]?.params).toStrictEqual({
      path: "notes/a.md",
      content: "edited",
      baseVersion: "v2",
    });
  });

  it("reloads an external change over pending edits, and says they were discarded", async () => {
    const { file, calls, editor, type, onEditsDiscarded } = openFile();
    type("unsaved");
    file.receive(changed("v2"));
    await settled();
    calls[0]?.resolve({ content: "from disk", version: "v2" });
    await settled();

    expect(editor.content).toBe("from disk");
    expect(onEditsDiscarded).toHaveBeenCalledExactlyOnceWith("a.md");
    expect(file.hasPendingEdits()).toBe(false);
    vi.advanceTimersByTime(500);
    await settled();
    expect(calls).toHaveLength(1);
  });

  it("keeps the edits of a failed save pending, and retries them on the next flush", async () => {
    const { file, calls, type } = openFile();
    type("unsaved");
    const flushed = file.flush();
    await settled();
    calls[0]?.reject(new HostCallError(appErrorCodes.NoWorkshopOpen, "No workshop is open."));
    await flushed;
    expect(file.hasPendingEdits()).toBe(true);

    void file.flush();
    await settled();
    expect(made(calls)).toStrictEqual([
      {
        method: filesWriteMethod.name,
        params: { path: "notes/a.md", content: "unsaved", baseVersion: "v1" },
      },
      {
        method: filesWriteMethod.name,
        params: { path: "notes/a.md", content: "unsaved", baseVersion: "v1" },
      },
    ]);
  });

  it("reports its edits as pending until their write succeeds", async () => {
    const { file, calls, type } = openFile();
    type("unsaved");
    const flushed = file.flush();
    await settled();
    expect(file.hasPendingEdits()).toBe(true);

    calls[0]?.resolve({ version: "v2" });
    await flushed;
    expect(file.hasPendingEdits()).toBe(false);
  });

  it("reloads, discarding the edits, when a save fails with VersionConflict", async () => {
    const { file, calls, editor, type, onEditsDiscarded } = openFile();
    type("unsaved");
    void file.flush();
    await settled();
    calls[0]?.reject(new HostCallError(appErrorCodes.VersionConflict, "The file changed."));
    await settled();
    expect(calls[1]?.method).toBe(filesReadMethod.name);
    calls[1]?.resolve({ content: "from disk", version: "v2" });
    await settled();

    expect(editor.content).toBe("from disk");
    expect(onEditsDiscarded).toHaveBeenCalledExactlyOnceWith("a.md");
    expect(file.hasPendingEdits()).toBe(false);
  });

  it.each<[string, FileChange]>([
    ["is deleted", { path: "notes/a.md", change: "deleted", kind: "file" }],
    ["turns into a folder", { path: "notes/a.md", change: "created", kind: "folder" }],
  ])("closes when the file %s", async (_, change) => {
    const { file, calls, onDeleted } = openFile();
    file.receive(change);
    await settled();
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(calls).toStrictEqual([]);
  });

  it("closes once its pending edits are saved", async () => {
    const { file, calls, type } = openFile();
    type("unsaved");
    const closed = file.close();
    await settled();
    calls[0]?.resolve({ version: "v2" });

    await expect(closed).resolves.toBe(true);
  });

  it("stays open with its edits when the save fails as its tab closes, and still follows the disk", async () => {
    const { file, calls, editor, type } = openFile();
    type("unsaved");
    const closed = file.close();
    await settled();
    calls[0]?.reject(new HostCallError(appErrorCodes.NoWorkshopOpen, "No workshop is open."));

    await expect(closed).resolves.toBe(false);
    expect(file.hasPendingEdits()).toBe(true);
    file.receive(changed("v2"));
    await settled();
    calls[1]?.resolve({ content: "from disk", version: "v2" });
    await settled();
    expect(editor.content).toBe("from disk");
  });

  it("doesn't ask to close once closed", async () => {
    const { file, onDeleted } = openFile();
    await expect(file.close()).resolves.toBe(true);
    file.receive({ path: "notes/a.md", change: "deleted", kind: "file" });
    await settled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("discards edits typed while the file is being re-read, and says so", async () => {
    const { file, calls, editor, type, onEditsDiscarded } = openFile();
    file.receive(changed("v2"));
    await settled();
    type("typed during the read");
    calls[0]?.resolve({ content: "from disk", version: "v2" });
    await settled();

    expect(editor.content).toBe("from disk");
    expect(onEditsDiscarded).toHaveBeenCalledExactlyOnceWith("a.md");
    expect(file.hasPendingEdits()).toBe(false);
    vi.advanceTimersByTime(500);
    await settled();
    expect(calls).toHaveLength(1);
  });

  it("saves to the new path after a rename of a folder above it", async () => {
    const { file, calls, type } = openFile();
    file.renamed("notes", "archive");
    type("moved");
    void file.flush();
    await settled();
    expect(calls[0]?.params).toStrictEqual({
      path: "archive/a.md",
      content: "moved",
      baseVersion: "v1",
    });
  });

  it("does nothing when the re-read finds the file gone, leaving the deletion's own change to close it", async () => {
    const shown = vi.spyOn(toast, "add");
    const { file, calls, editor, onDeleted, onEditsDiscarded } = openFile();
    file.receive(changed("v2"));
    await settled();
    calls[0]?.reject(new HostCallError(appErrorCodes.NotFound, "Not found."));
    await settled();

    expect(editor.content).toBe("opened");
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onEditsDiscarded).not.toHaveBeenCalled();
    expect(shown).not.toHaveBeenCalled();
  });
});
