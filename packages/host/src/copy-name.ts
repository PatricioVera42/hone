import type { FileEntry } from "@hone/protocol";

/**
 * The name a copy of `name` gets in a folder where `isTaken` says which names are in use: `name` itself if it's
 * free, otherwise the first free `(1)`, `(2)`, … A file gets it before its last extension, so `notes.v2.pdf`
 * becomes `notes.v2 (1).pdf`. A folder, a name without a dot and a dotfile (`.gitignore`) get it at the end.
 */
export function copyName(
  name: string,
  kind: FileEntry["kind"],
  isTaken: (candidate: string) => boolean,
): string {
  const dot = name.lastIndexOf(".");
  // A dot at the start is part of a dotfile's name, not the start of an extension.
  const splitAt = kind === "file" && dot > 0 ? dot : name.length;
  for (let number = 0; ; number += 1) {
    const candidate =
      number === 0 ? name : `${name.slice(0, splitAt)} (${String(number)})${name.slice(splitAt)}`;
    if (!isTaken(candidate)) return candidate;
  }
}
