import { AppError, type FileEntry } from "@hone/protocol";
import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import { resolveWorkshopPath } from "./workshop-path.ts";

// Tool internals nobody browses, and big enough to swamp the tree.
const hiddenNames = new Set([".git", "node_modules"]);

async function entryKind(folder: string, entry: Dirent): Promise<FileEntry["kind"]> {
  if (!entry.isSymbolicLink()) return entry.isDirectory() ? "folder" : "file";
  try {
    const target = await fs.stat(path.join(folder, entry.name));
    return target.isDirectory() ? "folder" : "file";
  } catch {
    // A symlink whose target doesn't exist still shows up, as a file.
    return "file";
  }
}

async function readFolder(folder: string, protocolPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOTDIR") {
      throw new AppError("NotFound", `${protocolPath} is not a folder`);
    }
    throw error;
  }
}

/** Lists a folder of the open workshop, unsorted and without `.git` or `node_modules`. Fails like {@link resolveWorkshopPath}, and with `NotFound` for a file. */
export async function listFolder(
  workshopRoot: string | undefined,
  protocolPath: string,
): Promise<FileEntry[]> {
  const folder = await resolveWorkshopPath(workshopRoot, protocolPath);
  const entries = await readFolder(folder, protocolPath);
  return Promise.all(
    entries
      .filter((entry) => !hiddenNames.has(entry.name))
      .map(async (entry) => ({ name: entry.name, kind: await entryKind(folder, entry) })),
  );
}
