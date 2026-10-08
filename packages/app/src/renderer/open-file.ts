import {
  appErrorCodes,
  filesReadMethod,
  filesRenameMethod,
  filesWriteMethod,
  type FileChange,
} from "@hone/protocol";
import { isAtOrInside, renamedPath } from "@/entry-path.ts";
import { HostCallError, type HostClient } from "@/host-client.ts";
import { reportError } from "@/report-error.ts";

const saveDelayMs = 500;

/** What an open file knows: the version its editor last loaded or saved, and whether it has unsaved edits. */
interface OpenFileState {
  readonly version: string;
  readonly pendingEdits: boolean;
}

/** Something that can make an open file's editor stale: a `files.changed` for its path, or a save that failed with `VersionConflict`. */
type OpenFileInput =
  | { readonly kind: "change"; readonly change: FileChange }
  | { readonly kind: "saveConflict" };

/**
 * `reload` keeps the cursor at the same offset. `reloadDiscardingEdits` does too, dropping the pending edits and
 * telling the user. `close` closes the file's tab.
 */
type OpenFileAction = "ignore" | "reload" | "reloadDiscardingEdits" | "close";

/**
 * Decides how an open file reacts to an input. The disk always wins: Hone never overwrites a change it didn't
 * make with an older version. Like the tree, it takes each change as the latest word on the path, so a creation
 * of the open file counts as a change.
 */
function decideOpenFileAction(state: OpenFileState, input: OpenFileInput): OpenFileAction {
  if (input.kind === "saveConflict") return "reloadDiscardingEdits";
  const { change } = input;
  if (change.change === "deleted" || change.kind === "folder") return "close";
  // Our own save's echo, or a write that left the bytes as they were.
  if (change.version === state.version) return "ignore";
  return state.pendingEdits ? "reloadDiscardingEdits" : "reload";
}

/** The editor an open file keeps in sync with the disk. */
export interface EditorContent {
  /** The editor's text, with the file's line endings. */
  read(): string;
  /** Replaces the text, keeping the cursor at the same offset, clamped to the new length. */
  replace(content: string): void;
}

interface OpenFileOptions {
  readonly client: Pick<HostClient, "call">;
  /** The file's protocol path when it opened, relative to the workshop root. */
  readonly path: string;
  /** The version the editor's content was read at. */
  readonly version: string;
  readonly editor: EditorContent;
  /** Called when the file is gone from disk, to close its tab. */
  readonly onDeleted: () => void;
  /** Called with the file's name when its pending edits were dropped for the version on disk, to tell the user. */
  readonly onEditsDiscarded: (name: string) => void;
}

function isHostError(error: unknown, code: number): boolean {
  return error instanceof HostCallError && error.code === code;
}

/**
 * One file open in an editor: saves it with `files.write` 500 ms after the last edit, and reacts to its
 * `files.changed` by {@link decideOpenFileAction}'s rules. Saves and changes are handled one at a time, in order, so
 * a change is only weighed once the save before it has answered, and our own save's echo is recognized.
 */
export class OpenFile {
  private readonly options: OpenFileOptions;
  private path: string;
  private version: string;
  private pendingEdits = false;
  /** Whether a save's write hasn't answered yet: its edits aren't on disk until it succeeds. */
  private writing = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  /** How many renames it followed and then moved back from, to tell which changes were reported at their target. */
  private refusedRenames = 0;

  constructor(options: OpenFileOptions) {
    this.options = options;
    this.path = options.path;
    this.version = options.version;
  }

  /** Records a user edit, and saves once edits stop for a moment. */
  edited(): void {
    this.pendingEdits = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), saveDelayMs);
  }

  /** Saves pending edits now. Resolves once the save, and anything queued before it, is done. */
  flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    return this.enqueue(() => this.save());
  }

  /** Whether it has edits not saved yet, such as after a save that failed or while a save is writing. */
  hasPendingEdits(): boolean {
    return this.pendingEdits || this.writing;
  }

  /** Handles a `files.changed`, ignoring changes to other paths. */
  receive(change: FileChange): void {
    if (change.path !== this.path) return;
    const { refusedRenames } = this;
    void this.enqueue(async () => {
      // Reported at the target of a rename the host then refused, so it's about another entry.
      if (refusedRenames !== this.refusedRenames) return;
      await this.apply(decideOpenFileAction(this.state(), { kind: "change", change }));
    });
  }

  /**
   * Follows a rename of the file or a folder above it, so later saves and changes use its new path. Its saves and
   * changes wait until `answered` settles. If it rejects, the file moves back to the path it had, and the changes
   * reported at the new path meanwhile are ignored.
   */
  renamed(from: string, to: string, answered: Promise<unknown>): void {
    const moved = renamedPath(this.path, from, to);
    if (moved === undefined) return;
    const original = this.path;
    this.path = moved;
    void this.enqueue(async () => {
      try {
        await answered;
      } catch {
        // The rename's caller handles its error; here it only means the file stayed where it was.
        this.path = original;
        this.refusedRenames += 1;
      }
    });
  }

  /** Drops pending edits if the file, or a folder above it, was deleted: there's nothing left to save them to. */
  deleted(path: string): void {
    if (isAtOrInside(this.path, path)) this.dropPendingEdits();
  }

  /**
   * Saves pending edits, for when its tab closes, and then stops touching the editor. Resolves with whether it closed:
   * it stays open when edits are still pending, such as after a failed save, so its tab should too, and the edits are
   * never lost without the user seeing them.
   */
  async closeIfSaved(): Promise<boolean> {
    await this.flush();
    if (this.hasPendingEdits()) return false;
    this.closed = true;
    return true;
  }

  /** Stops touching the editor, for when its tab is gone, and saves any edits still pending. */
  disconnect(): Promise<void> {
    const flushed = this.flush();
    this.closed = true;
    return flushed;
  }

  private state() {
    return { version: this.version, pendingEdits: this.pendingEdits };
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task).catch(reportError);
    return this.queue;
  }

  private dropPendingEdits(): void {
    clearTimeout(this.saveTimer);
    this.pendingEdits = false;
  }

  private async save(): Promise<void> {
    if (!this.pendingEdits) return;
    const { client, editor } = this.options;
    const { path } = this;
    const content = editor.read();
    this.pendingEdits = false;
    this.writing = true;
    try {
      const saved = await client.call(filesWriteMethod, {
        path,
        content,
        baseVersion: this.version,
      });
      this.version = saved.version;
    } catch (error) {
      // Kept until they're saved or replaced by the disk's version, so the next edit or flush tries again.
      this.pendingEdits = true;
      if (!isHostError(error, appErrorCodes.VersionConflict)) throw error;
      await this.apply(decideOpenFileAction(this.state(), { kind: "saveConflict" }));
    } finally {
      this.writing = false;
    }
  }

  private async apply(action: OpenFileAction): Promise<void> {
    if (action === "ignore") return;
    if (action === "close") {
      this.dropPendingEdits();
      if (!this.closed) this.options.onDeleted();
      return;
    }
    let discarded = action === "reloadDiscardingEdits";
    const { client, editor } = this.options;
    const { path } = this;
    let file;
    try {
      file = await client.call(filesReadMethod, { path });
    } catch (error) {
      // Deleted since the change: the deletion's own notification closes the tab.
      if (isHostError(error, appErrorCodes.NotFound)) return;
      throw error;
    }
    // Edits typed while it was reading get replaced too.
    discarded ||= this.pendingEdits;
    this.dropPendingEdits();
    this.version = file.version;
    if (!this.closed) editor.replace(file.content);
    if (discarded) this.options.onEditsDiscarded(path.slice(path.lastIndexOf("/") + 1));
  }
}

/**
 * Every file open in the window's editors, so their pending edits can be saved before a workshop switch or the window
 * closes, and so they follow a rename.
 */
export class OpenFiles {
  private readonly files = new Set<OpenFile>();
  /** The last rename asked for, settled either way, so the next one starts after it. */
  private renaming: Promise<void> = Promise.resolve();

  /** Tracks a file until the returned function is called. */
  add(file: OpenFile): () => void {
    this.files.add(file);
    return () => this.files.delete(file);
  }

  /**
   * Renames the entry at `from` to `to` on the host, saving every file first and having those at or inside it follow,
   * or stay where they were if the host refuses. Their saves wait for the answer. Renames run one at a time, each
   * after the one before has answered.
   */
  rename(client: Pick<HostClient, "call">, from: string, to: string): Promise<void> {
    const renamed = this.renaming.then(() => this.renameNow(client, from, to));
    // So a refused rename can't move files back over a later one. Its caller gets the error through `renamed`.
    this.renaming = renamed.catch(() => undefined);
    return renamed;
  }

  /** Tells every file that the entry at `path` was deleted. */
  deleted(path: string): void {
    for (const file of this.files) file.deleted(path);
  }

  /** Saves every file's pending edits. Resolves once all the saves are done. */
  async flush(): Promise<void> {
    await Promise.all([...this.files].map((file) => file.flush()));
  }

  /** Whether any file has edits not saved yet, such as after a flush whose saves failed. */
  hasPendingEdits(): boolean {
    return [...this.files].some((file) => file.hasPendingEdits());
  }

  private async renameNow(
    client: Pick<HostClient, "call">,
    from: string,
    to: string,
  ): Promise<void> {
    // Saved first, so no save is on its way to the old path while the file moves.
    await this.flush();
    const answered = client.call(filesRenameMethod, { from, to });
    // Before the host answers, since the watcher can report the old paths as deleted first, which would close their tabs.
    for (const file of this.files) file.renamed(from, to, answered);
    await answered;
  }
}
