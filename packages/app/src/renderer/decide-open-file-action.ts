import type { FileChange } from "@hone/protocol";

/** What an open file knows: the version its editor last loaded or saved, and whether it has unsaved edits. */
export interface OpenFileState {
  readonly version: string;
  readonly pendingEdits: boolean;
}

/** Something that can make an open file's editor stale: a `files.changed` for its path, or a save that failed with `VersionConflict`. */
export type OpenFileInput =
  | { readonly kind: "change"; readonly change: FileChange }
  | { readonly kind: "saveConflict" };

/**
 * `reload` keeps the cursor at the same offset. `reloadDiscardingEdits` does too, dropping the pending edits and
 * telling the user. `close` closes the file's tab.
 */
export type OpenFileAction = "ignore" | "reload" | "reloadDiscardingEdits" | "close";

/**
 * Decides how an open file reacts to an input. The disk always wins: Hone never overwrites a change it didn't
 * make with an older version. Like the tree, it takes each change as the latest word on the path, so a creation
 * of the open file counts as a change.
 */
export function decideOpenFileAction(state: OpenFileState, input: OpenFileInput): OpenFileAction {
  if (input.kind === "saveConflict") return "reloadDiscardingEdits";
  const { change } = input;
  if (change.change === "deleted" || change.kind === "folder") return "close";
  // Our own save's echo, or a write that left the bytes as they were.
  if (change.version === state.version) return "ignore";
  return state.pendingEdits ? "reloadDiscardingEdits" : "reload";
}
