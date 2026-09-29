import type { FileChange } from "@hone/protocol";
import { watch } from "chokidar";
import { promises as fs } from "node:fs";
import path from "node:path";
import { collapseChanges, type PathEvent } from "./collapse-changes.ts";
import { inspectFile } from "./inspect-file.ts";
import { resolveWorkshopPath } from "./workshop-path.ts";

// One agent save arrives as several events a few milliseconds apart (research/spike-04-file-watching.md).
const collapseWindowMs = 20;

const pathEvents: Partial<Record<string, PathEvent>> = {
  add: { change: "created", kind: "file" },
  addDir: { change: "created", kind: "folder" },
  change: { change: "changed", kind: "file" },
  unlink: { change: "deleted", kind: "file" },
  unlinkDir: { change: "deleted", kind: "folder" },
};

/** Tool internals, and the temporary files agents write before renaming them onto their target. */
function isIgnored(protocolPath: string): boolean {
  return (
    /(^|\/)(node_modules|\.git)(\/|$)/.test(protocolPath) || /\.tmp\.[^/]*$/.test(protocolPath)
  );
}

// Chokidar reports a symlink as a file, but files.list gives it its target's kind, and so must changes.
async function kindOnDisk(
  absolutePath: string,
  eventKind: FileChange["kind"],
): Promise<FileChange["kind"]> {
  try {
    return (await fs.stat(absolutePath)).isDirectory() ? "folder" : "file";
  } catch {
    // Gone again, or a broken symlink, which files.list shows as a file just like the event does.
    return eventKind;
  }
}

async function versionOf(workshopRoot: string, protocolPath: string): Promise<string | undefined> {
  try {
    const inspection = await inspectFile(await resolveWorkshopPath(workshopRoot, protocolPath));
    return inspection.withinSizeLimit && inspection.text ? inspection.version : undefined;
  } catch {
    // Gone again, a symlink out of the workshop or to a folder, or unreadable: there's no version to give.
    return undefined;
  }
}

export interface WorkshopWatcher {
  /** Stops watching. Nothing is reported after it's called, not even changes already seen. */
  close(): Promise<void>;
}

interface PendingPath {
  readonly events: [PathEvent, ...PathEvent[]];
  readonly timer: NodeJS.Timeout;
}

/**
 * Watches the workshop at `workshopRoot` and calls `onChange` once per path whose events settle within a short
 * window, collapsed with {@link collapseChanges}, with a symlink taking its target's kind. Resolves once the initial scan is done, so every change made
 * afterwards gets reported. Ignores `node_modules`, `.git` and `*.tmp.*` names, and doesn't follow symlinks.
 */
export async function watchWorkshop(
  workshopRoot: string,
  onChange: (change: FileChange) => void,
): Promise<WorkshopWatcher> {
  const pending = new Map<string, PendingPath>();
  let closed = false;
  // Reported one after another, so a slow version read can't let a later change to the same path overtake it.
  let reporting = Promise.resolve();

  async function report(protocolPath: string, events: PendingPath["events"]): Promise<void> {
    const collapsed = collapseChanges(events);
    if (collapsed === undefined) return;
    const change: FileChange = { path: protocolPath, ...collapsed };
    if (change.change !== "deleted") {
      change.kind = await kindOnDisk(path.join(workshopRoot, protocolPath), change.kind);
    }
    if (change.kind === "file" && change.change !== "deleted") {
      const version = await versionOf(workshopRoot, protocolPath);
      if (version !== undefined) change.version = version;
    }
    if (!closed) onChange(change);
  }

  function record(protocolPath: string, event: PathEvent): void {
    const existing = pending.get(protocolPath);
    if (existing !== undefined) {
      existing.events.push(event);
      return;
    }
    const timer = setTimeout(() => {
      const settled = pending.get(protocolPath);
      pending.delete(protocolPath);
      if (settled === undefined) return;
      reporting = reporting.then(() => report(protocolPath, settled.events));
    }, collapseWindowMs);
    pending.set(protocolPath, { events: [event], timer });
  }

  const watcher = watch(workshopRoot, {
    ignoreInitial: true,
    // Chokidar's atomic mode delays deletions by 100 ms; ignoring `*.tmp.*` covers agents' atomic saves instead.
    atomic: false,
    // A symlink out of the workshop would otherwise get its target watched.
    followSymlinks: false,
    ignored: (absolutePath) => isIgnored(path.relative(workshopRoot, absolutePath)),
  });
  watcher.on("all", (eventName, absolutePath) => {
    const event = pathEvents[eventName];
    const protocolPath = path.relative(workshopRoot, absolutePath);
    if (event !== undefined && protocolPath !== "") record(protocolPath, event);
  });
  // A folder it can't read just goes unwatched; without a listener the error would take the host down.
  watcher.on("error", () => undefined);
  await new Promise<void>((resolve) => watcher.once("ready", () => resolve()));

  return {
    close: () => {
      closed = true;
      for (const { timer } of pending.values()) clearTimeout(timer);
      pending.clear();
      return watcher.close();
    },
  };
}
