import { z } from "zod";
import type { MethodDefinition, NotificationDefinition } from "../json-rpc.ts";

const fileEntrySchema = z.object({
  name: z.string(),
  kind: z.enum(["file", "folder"]),
});

/** One child of a folder. A symlink takes its target's kind, and a broken one is a `file`. */
export type FileEntry = z.infer<typeof fileEntrySchema>;

/**
 * Lists a folder's children, unsorted and without `.git` or `node_modules`. `path` is relative to the open workshop's root, `""` for the root itself.
 * Fails with `NoWorkshopOpen`, `OutsideWorkshop` or `NotFound`.
 */
export const filesListMethod: MethodDefinition<{ path: string }, FileEntry[]> = {
  name: "files.list",
  params: z.object({ path: z.string() }),
  result: z.array(fileEntrySchema),
};

const fileChangeSchema = z.object({
  path: z.string(),
  change: z.enum(["created", "changed", "deleted"]),
  kind: z.enum(["file", "folder"]),
  version: z.string().optional(),
});

/** One path's change on disk, after the host collapsed the events it saw for it over a short window. */
export type FileChange = z.infer<typeof fileChangeSchema>;

/**
 * Sent by the host when something created, changed or deleted a path in the open workshop, one per path.
 * `path` is relative to the workshop's root. `version` (SHA-256 hex of the bytes) is only there for a created
 * or changed text file of at most 5 MB. A move arrives as a deletion plus a creation. An earlier event may have
 * been lost or collapsed, so receivers treat each one as the latest word on its path rather than a diff.
 */
export const filesChangedNotification: NotificationDefinition<FileChange> = {
  name: "files.changed",
  params: fileChangeSchema,
};

const fileContentSchema = z.object({ content: z.string(), version: z.string() });

/** A text file's content and the version it was read at. */
export type FileContent = z.infer<typeof fileContentSchema>;

/**
 * Reads a text file as UTF-8, keeping its line endings. `version` is the SHA-256 hex of its bytes, as in `files.changed`.
 * Fails with `NoWorkshopOpen`, `OutsideWorkshop`, `NotFound` (also for a folder), `TooLarge` above 5 MB and `NotText`
 * when its first 8 KB contain a NUL byte or it isn't valid UTF-8 (saving it would lose the bytes of another encoding).
 */
export const filesReadMethod: MethodDefinition<{ path: string }, FileContent> = {
  name: "files.read",
  params: z.object({ path: z.string() }),
  result: fileContentSchema,
};

/**
 * Replaces an existing text file's content, written as UTF-8 exactly as given (line endings included), if the file
 * is still at `baseVersion`. It writes a temporary sibling `<name>.tmp.hone.<random>`, which the watcher ignores,
 * then renames it onto the file, so readers never see half a file. Returns the new version.
 * Fails with `NoWorkshopOpen`, `OutsideWorkshop`, `NotFound` (also for a folder; it never creates files),
 * `TooLarge` when `content` is over 5 MB as UTF-8, and `VersionConflict` when the file on disk is at another version.
 * A failed write leaves the file untouched.
 */
export const filesWriteMethod: MethodDefinition<
  { path: string; content: string; baseVersion: string },
  { version: string }
> = {
  name: "files.write",
  params: z.object({ path: z.string(), content: z.string(), baseVersion: z.string() }),
  result: z.object({ version: z.string() }),
};

/**
 * Creates an empty file or a folder at `path`, inside a folder that already exists. Its last segment follows
 * `validateName`. Fails with `NoWorkshopOpen`, `OutsideWorkshop`, `NotFound` when the parent folder doesn't exist,
 * `InvalidName` and `AlreadyExists` when anything, even a broken symlink, is already there.
 */
export const filesCreateMethod: MethodDefinition<{ path: string; kind: FileEntry["kind"] }, null> =
  {
    name: "files.create",
    params: z.object({ path: z.string(), kind: fileEntrySchema.shape.kind }),
    result: z.null(),
  };

/**
 * Renames a file or folder, or a symlink itself rather than its target. `to`'s last segment follows `validateName`,
 * and its parent folder must exist. Fails with `NoWorkshopOpen`, `OutsideWorkshop`, `NotFound` when `from` or `to`'s
 * parent folder doesn't exist, `InvalidName` (also for the workshop root as `from`) and `AlreadyExists` when
 * something else is already at `to`. A change of case alone is allowed on a case-insensitive disk.
 */
export const filesRenameMethod: MethodDefinition<{ from: string; to: string }, null> = {
  name: "files.rename",
  params: z.object({ from: z.string(), to: z.string() }),
  result: z.null(),
};

/**
 * Deletes a file, or a folder with everything inside it, for good: there is no trash. A symlink is removed, not its
 * target. Fails with `NoWorkshopOpen`, `OutsideWorkshop`, `NotFound` and `InvalidName` for the workshop root.
 */
export const filesDeleteMethod: MethodDefinition<{ path: string }, null> = {
  name: "files.delete",
  params: z.object({ path: z.string() }),
  result: z.null(),
};

/** The most files {@link filesCountFilesMethod} counts before it stops. */
export const maxCountedFiles = 10_000;

/**
 * Counts the files inside a folder at any depth, hidden ones, `.git` and `node_modules` included, and symlinks
 * without following them, so the user knows what deleting it removes. Stops at {@link maxCountedFiles}.
 * Fails with `NoWorkshopOpen`, `OutsideWorkshop` and `NotFound` (also for a file).
 */
export const filesCountFilesMethod: MethodDefinition<{ path: string }, { count: number }> = {
  name: "files.countFiles",
  params: z.object({ path: z.string() }),
  result: z.object({ count: z.number() }),
};
