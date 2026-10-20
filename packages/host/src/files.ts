import {
  AppError,
  maxCountedFiles,
  validateName,
  type CopyResult,
  type FileContent,
  type FileEntry,
} from "@hone/protocol";
import { createHash, randomBytes } from "node:crypto";
import { promises as fs, type Dirent, type Stats } from "node:fs";
import path from "node:path";
import { copyName } from "./copy-name.ts";
import { inspectFile, maxBytes } from "./inspect-file.ts";
import {
  isInside,
  resolveWorkshopEntryPath,
  resolveWorkshopFolder,
  resolveWorkshopPath,
} from "./workshop-path.ts";

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

/**
 * Reads a text file of the open workshop as UTF-8, keeping its line endings. Fails like {@link resolveWorkshopPath},
 * with `NotFound` for a folder, `TooLarge` above 5 MB and `NotText` for a binary file, by {@link inspectFile}'s rules.
 */
export async function readFile(
  workshopRoot: string | undefined,
  protocolPath: string,
): Promise<FileContent> {
  const file = await resolveWorkshopPath(workshopRoot, protocolPath);
  if (!(await fs.stat(file)).isFile()) {
    throw new AppError("NotFound", `${protocolPath} is not a file`);
  }
  const inspection = await inspectFile(file);
  if (!inspection.withinSizeLimit) {
    throw new AppError("TooLarge", `${protocolPath} is larger than 5 MB`);
  }
  if (!inspection.text) throw new AppError("NotText", `${protocolPath} is not a text file`);
  return { content: inspection.content, version: inspection.version };
}

/**
 * Replaces a text file of the open workshop with `content` as UTF-8 if it's still at `baseVersion`, through a
 * temporary sibling renamed onto it, keeping its mode. A symlink keeps pointing at the file, which gets the content.
 * Fails like {@link resolveWorkshopPath}, with `NotFound` for a folder, `VersionConflict` when the file on disk
 * is at another version and `TooLarge` when `content` is over 5 MB. Returns the new version.
 */
export async function writeFile(
  workshopRoot: string | undefined,
  protocolPath: string,
  content: string,
  baseVersion: string,
): Promise<{ version: string }> {
  const file = await resolveWorkshopPath(workshopRoot, protocolPath);
  const stats = await fs.stat(file);
  if (!stats.isFile()) throw new AppError("NotFound", `${protocolPath} is not a file`);
  const inspection = await inspectFile(file);
  if (!inspection.withinSizeLimit || inspection.version !== baseVersion) {
    throw new AppError("VersionConflict", `${protocolPath} changed on disk`);
  }
  const bytes = Buffer.from(content, "utf8");
  // Otherwise Hone couldn't read the file back.
  if (bytes.length > maxBytes) throw new AppError("TooLarge", `${protocolPath} would be over 5 MB`);
  // The watcher ignores `*.tmp.*` names, so only the rename onto the file gets reported.
  const temporary = `${file}.tmp.hone.${randomBytes(6).toString("hex")}`;
  try {
    await fs.writeFile(temporary, bytes);
    // Set apart from the write, which the umask would otherwise trim.
    await fs.chmod(temporary, stats.mode);
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return { version: createHash("sha256").update(bytes).digest("hex") };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/** Creates an empty file or a folder in the open workshop. Fails like {@link resolveWorkshopEntryPath}, and with `AlreadyExists`. */
export async function createEntry(
  workshopRoot: string | undefined,
  protocolPath: string,
  kind: FileEntry["kind"],
): Promise<null> {
  const target = await resolveWorkshopEntryPath(workshopRoot, protocolPath);
  try {
    if (kind === "folder") await fs.mkdir(target);
    // `wx` fails rather than truncating whatever is already there.
    else await fs.writeFile(target, "", { flag: "wx" });
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) {
      throw new AppError("AlreadyExists", `${protocolPath} already exists`);
    }
    throw error;
  }
  return null;
}

/** The entry at a path itself, a symlink rather than its target, or `undefined` when nothing is there. */
async function statEntry(entryPath: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(entryPath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

/**
 * Renames a file or folder of the open workshop, or a symlink itself. Fails like {@link resolveWorkshopEntryPath}
 * for either path, with `NotFound` when nothing is at `from` and `AlreadyExists` when something else is at `to`.
 */
export async function renameEntry(
  workshopRoot: string | undefined,
  from: string,
  to: string,
): Promise<null> {
  const source = await resolveWorkshopEntryPath(workshopRoot, from);
  const target = await resolveWorkshopEntryPath(workshopRoot, to);
  const sourceStats = await statEntry(source);
  if (sourceStats === undefined) throw new AppError("NotFound", `${from} doesn't exist`);
  const targetStats = await statEntry(target);
  // The same entry under another case, on a case-insensitive disk such as a Windows drive.
  const caseChange =
    targetStats?.ino === sourceStats.ino &&
    targetStats.dev === sourceStats.dev &&
    path.basename(source).toLowerCase() === path.basename(target).toLowerCase();
  if (targetStats !== undefined && !caseChange) {
    throw new AppError("AlreadyExists", `${to} already exists`);
  }
  await fs.rename(source, target);
  return null;
}

/**
 * Deletes a file, or a folder with everything inside it, of the open workshop. A symlink is removed, not its
 * target. Fails like {@link resolveWorkshopEntryPath}, and with `NotFound` when nothing is there.
 */
export async function deleteEntry(
  workshopRoot: string | undefined,
  protocolPath: string,
): Promise<null> {
  const entry = await resolveWorkshopEntryPath(workshopRoot, protocolPath);
  if ((await statEntry(entry)) === undefined) {
    throw new AppError("NotFound", `${protocolPath} doesn't exist`);
  }
  await fs.rm(entry, { recursive: true });
  return null;
}

/** Adds the files inside `folder` at any depth to `counted`, stopping once it reaches {@link maxCountedFiles}. */
async function countInside(
  folder: string,
  protocolPath: string,
  counted: { count: number },
): Promise<void> {
  const entries = await readFolder(folder, protocolPath);
  const subfolders = entries.filter((entry) => entry.isDirectory());
  counted.count += entries.length - subfolders.length;
  if (counted.count >= maxCountedFiles) return;
  await Promise.all(
    subfolders.map((entry) => countInside(path.join(folder, entry.name), protocolPath, counted)),
  );
}

/**
 * Counts the files inside a folder of the open workshop at any depth, hidden ones included, and symlinks without
 * following them. Stops at {@link maxCountedFiles}. Fails like {@link resolveWorkshopPath}, and with `NotFound`
 * for a file.
 */
export async function countFiles(
  workshopRoot: string | undefined,
  protocolPath: string,
): Promise<{ count: number }> {
  const counted = { count: 0 };
  await countInside(await resolveWorkshopPath(workshopRoot, protocolPath), protocolPath, counted);
  return { count: Math.min(counted.count, maxCountedFiles) };
}

/** Why a copy failed, in words for the user. */
function copyFailureReason(error: unknown): string {
  if (hasErrorCode(error, "ENOENT")) return "it doesn't exist";
  if (hasErrorCode(error, "EACCES") || hasErrorCode(error, "EPERM")) return "permission denied";
  if (hasErrorCode(error, "EBUSY")) return "it's locked by another program";
  if (hasErrorCode(error, "ENOSPC")) return "the disk is full";
  return error instanceof Error ? error.message : String(error);
}

/** A source that can be copied and what it is, or why it can't. */
type Inspection =
  | { readonly source: string; readonly kind: FileEntry["kind"] }
  | { readonly source: string; readonly error: unknown };

/** Finds what `source` is, and rules out the sources that can't be copied into `folder` before any name is claimed. */
async function inspectSource(source: string, folder: string): Promise<Inspection> {
  try {
    if (!path.isAbsolute(source)) throw new Error("it isn't an absolute path");
    // `..` and `.` are what `path.basename` gives for a source ending in them, and a copy named so would land outside `folder`.
    const validation = validateName(path.basename(source));
    if (!validation.valid) throw new Error(validation.reason);
    const kind = (await fs.lstat(source)).isDirectory() ? "folder" : "file";
    if (kind === "folder" && isInside(await fs.realpath(source), folder)) {
      throw new Error("a folder can't be copied into itself");
    }
    return { source, kind };
  } catch (error) {
    return { source, error };
  }
}

type CopyOutcome = CopyResult["copied"][number] | CopyResult["failed"][number];

function failedCopy(source: string, error: unknown, partlyCopied: boolean): CopyOutcome {
  return { source, reason: copyFailureReason(error), partlyCopied };
}

/** Copies `source` to `copy`, a path in the workshop whose name is already claimed, and says how it went. */
async function copyOne(
  source: string,
  kind: FileEntry["kind"],
  copy: string,
): Promise<CopyOutcome> {
  try {
    // Never overwrites: the name is free, and a copy that appeared since would fail rather than be replaced.
    await fs.cp(source, copy, { recursive: true, force: false, errorOnExist: true });
    return { source, name: path.basename(copy) };
  } catch (error) {
    // A folder that failed halfway stays partly copied.
    return failedCopy(source, error, kind === "folder" && (await statEntry(copy)) !== undefined);
  }
}

/**
 * Copies files and folders from anywhere on the disk into a folder of the open workshop, naming each by
 * {@link copyName}. A source that fails doesn't stop the rest. Fails like {@link resolveWorkshopFolder}.
 */
export async function copyInto(
  workshopRoot: string | undefined,
  sources: readonly string[],
  target: string,
): Promise<CopyResult> {
  const folder = await resolveWorkshopFolder(workshopRoot, target);
  const taken = new Set(await fs.readdir(folder));
  const inspections = await Promise.all(sources.map((source) => inspectSource(source, folder)));
  const outcomes = await Promise.all(
    inspections.map((inspection) => {
      if ("error" in inspection) {
        return Promise.resolve(failedCopy(inspection.source, inspection.error, false));
      }
      // Claimed here, one source after the other and before any copy starts, so the names follow the order of the sources.
      const name = copyName(path.basename(inspection.source), inspection.kind, (candidate) =>
        taken.has(candidate),
      );
      taken.add(name);
      return copyOne(inspection.source, inspection.kind, path.join(folder, name));
    }),
  );
  const result: CopyResult = { copied: [], failed: [] };
  for (const outcome of outcomes) {
    if ("name" in outcome) result.copied.push(outcome);
    else result.failed.push(outcome);
  }
  return result;
}
