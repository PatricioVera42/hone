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
