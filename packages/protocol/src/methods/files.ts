import { z } from "zod";
import type { MethodDefinition } from "../json-rpc.ts";

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
