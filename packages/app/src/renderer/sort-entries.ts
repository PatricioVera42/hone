import type { FileEntry } from "@hone/protocol";

const byName = new Intl.Collator(undefined, { sensitivity: "base" });

/** The file tree's order: folders first, then files, each alphabetical ignoring case. Returns a new array. */
export function sortEntries(entries: readonly FileEntry[]): FileEntry[] {
  return entries.toSorted((first, second) => {
    if (first.kind !== second.kind) return first.kind === "folder" ? -1 : 1;
    return byName.compare(first.name, second.name);
  });
}
