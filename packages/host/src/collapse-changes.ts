import type { FileChange } from "@hone/protocol";

/** One event the watcher saw for a path, before collapsing. */
export type PathEvent = Pick<FileChange, "change" | "kind">;

/**
 * Collapses the events one path got within its window into the single change to report, or `undefined` if the
 * path neither existed before nor exists after. Only whether the path existed at the start (from the first event)
 * and exists at the end (from the last) matters, so a burst like an atomic save reads as one change.
 * The kind comes from the last event.
 */
export function collapseChanges(
  events: readonly [PathEvent, ...PathEvent[]],
): PathEvent | undefined {
  const [first] = events;
  const last = events.at(-1) ?? first;
  const existedBefore = first.change !== "created";
  const existsAfter = last.change !== "deleted";
  if (existedBefore && existsAfter) return { change: "changed", kind: last.kind };
  if (existsAfter) return { change: "created", kind: last.kind };
  if (existedBefore) return { change: "deleted", kind: last.kind };
  return undefined;
}
