import type { FileEntry } from "@hone/protocol";

const byName = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** The file tree's order: folders first, then files, each in natural ordering ignoring case. Returns a new array. */
export function sortEntries(entries: readonly FileEntry[]): FileEntry[] {
  return entries.toSorted((first, second) => {
    if (first.kind !== second.kind) return first.kind === "folder" ? -1 : 1;
    return byName.compare(first.name, second.name);
  });
}
