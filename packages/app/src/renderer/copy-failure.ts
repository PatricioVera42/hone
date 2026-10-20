import type { CopyResult } from "@hone/protocol";
import { entryName } from "@/entry-path.ts";

/** What to tell the user about the sources a `files.copy` could not copy, naming each one. */
export function copyFailureMessage(failed: CopyResult["failed"]): string {
  return failed
    .map(({ source, reason, partlyCopied }) => {
      const failure = `${entryName(source)}: ${reason}.`;
      return partlyCopied ? `${failure} Part of it was copied and stays.` : failure;
    })
    .join(" ");
}
