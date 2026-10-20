import type { CopyResult } from "@hone/protocol";
import { entryName } from "@/entry-path.ts";

/** A sentence for each failure, so the reason's own full stop isn't doubled. */
function sentence(name: string, reason: string): string {
  return `${name}: ${reason.replace(/\.$/, "")}.`;
}

/**
 * What to tell the user about what a drop could not copy, naming each item: the sources a `files.copy` failed on,
 * and the dropped paths that never reached it because they couldn't be converted to host paths.
 */
export function copyFailureMessage(
  failed: CopyResult["failed"],
  unreachable: readonly string[],
): string {
  return [
    ...failed.map(({ source, reason, partlyCopied }) => {
      const failure = sentence(entryName(source), reason);
      return partlyCopied ? `${failure} Part of it was copied and stays.` : failure;
    }),
    // A Windows path, so its last segment follows a backslash too.
    ...unreachable.map((dropped) =>
      sentence(dropped.split(/[\\/]/).pop() ?? dropped, "the host can't reach it"),
    ),
  ].join(" ");
}
