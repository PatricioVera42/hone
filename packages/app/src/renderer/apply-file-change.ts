import type { FileChange, FileEntry } from "@hone/protocol";
import { sortEntries } from "./sort-entries.ts";

function splitPath(protocolPath: string): { readonly folder: string; readonly name: string } {
  const slash = protocolPath.lastIndexOf("/");
  if (slash === -1) return { folder: "", name: protocolPath };
  return { folder: protocolPath.slice(0, slash), name: protocolPath.slice(slash + 1) };
}

/**
 * Applies a `files.changed` to the entries of the loaded folder at `folder`, returning the same array when
 * nothing about them changes. An earlier event may have been lost or collapsed, so it never assumes it saw
 * them all: a creation of a path already shown counts as a change, a change to a path it doesn't show adds it,
 * and a deletion of a path it doesn't show is ignored. Changes outside this folder leave it as it was.
 */
export function applyFileChange(
  folder: string,
  entries: readonly FileEntry[],
  change: FileChange,
): readonly FileEntry[] {
  const { folder: changedFolder, name } = splitPath(change.path);
  if (changedFolder !== folder) return entries;
  const shown = entries.find((entry) => entry.name === name);
  if (change.change === "deleted") {
    return shown === undefined ? entries : entries.filter((entry) => entry !== shown);
  }
  if (shown?.kind === change.kind) return entries;
  const others = entries.filter((entry) => entry !== shown);
  return sortEntries([...others, { name, kind: change.kind }]);
}
