import { appErrorCodes, filesReadMethod, filesWriteMethod, type FileChange } from "@hone/protocol";
import { toast } from "@/components/ui/toast.tsx";
import { decideOpenFileAction, type OpenFileAction } from "@/decide-open-file-action.ts";
import { isAtOrInside, renamedPath } from "@/entry-path.ts";
import { HostCallError, type HostClient } from "@/host-client.ts";
import { reportError } from "@/report-error.ts";

const saveDelayMs = 500;

/** The editor an open file keeps in sync with the disk. */
export interface EditorContent {
  /** The editor's text, with the file's line endings. */
  read(): string;
  /** Replaces the text, keeping the cursor at the same offset, clamped to the new length. */
  replace(content: string): void;
}

interface OpenFileOptions {
  readonly client: HostClient;
  /** The file's protocol path when it opened, relative to the workshop root. */
  readonly path: string;
  /** The version the editor's content was read at. */
  readonly version: string;
  readonly editor: EditorContent;
  /** Called when the file is gone from disk, to close its tab. */
  readonly onDeleted: () => void;
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
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;

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

  /** Whether it has edits not saved yet, such as after a save that failed. */
  hasPendingEdits(): boolean {
    return this.pendingEdits;
  }

  /** Handles a `files.changed`, ignoring changes to other paths. */
  receive(change: FileChange): void {
    if (change.path !== this.path) return;
    void this.enqueue(() =>
      this.apply(decideOpenFileAction(this.state(), { kind: "change", change })),
    );
  }

  /** Follows a rename of the file or a folder above it, so later saves and changes use its new path. */
  renamed(from: string, to: string): void {
    this.path = renamedPath(this.path, from, to) ?? this.path;
  }

  /** Drops pending edits if the file, or a folder above it, was deleted: there's nothing left to save them to. */
  deleted(path: string): void {
    if (isAtOrInside(this.path, path)) this.dropPendingEdits();
  }

  /** Saves pending edits and stops touching the editor, for when its tab closes. */
  close(): Promise<void> {
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
    try {
      const saved = await client.call(filesWriteMethod, {
        path,
        content,
        baseVersion: this.version,
      });
      this.version = saved.version;
    } catch (error) {
      if (!isHostError(error, appErrorCodes.VersionConflict)) {
        // Kept, so the next edit or flush tries again.
        this.pendingEdits = true;
        throw error;
      }
      await this.apply(decideOpenFileAction(this.state(), { kind: "saveConflict" }));
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
    if (discarded) this.dropPendingEdits();
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
    if (discarded) {
      const name = path.slice(path.lastIndexOf("/") + 1);
      toast.add({
        type: "warning",
        title: `${name} changed on disk; your latest edits were discarded.`,
      });
    }
  }
}

/** Every file open in the window's editors, so their pending edits can be saved before a workshop switch or the window closes. */
export class OpenFiles {
  private readonly files = new Set<OpenFile>();

  /** Tracks a file until the returned function is called. */
  add(file: OpenFile): () => void {
    this.files.add(file);
    return () => this.files.delete(file);
  }

  /** Tells every file that the entry at `from` was renamed to `to`. */
  renamed(from: string, to: string): void {
    for (const file of this.files) file.renamed(from, to);
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
}
