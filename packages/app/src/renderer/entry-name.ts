import { validateName, type FileEntry } from "@hone/protocol";

/**
 * The file name a new note gets: `.md` is appended unless the name has an extension, which is a `.` anywhere but
 * at its start. So `idea` becomes `idea.md`, and `notes.txt` stays as typed.
 */
export function noteFileName(name: string): string {
  return name === "" || name.lastIndexOf(".") > 0 ? name : `${name}.md`;
}

/**
 * Why a name can't be given to a new or renamed entry among a folder's loaded `siblings`, or `undefined` when it
 * can. `ownName` is the renamed entry's current name, which it may keep. The host still has the final word, since
 * the loaded entries can lag behind the disk.
 */
export function entryNameError(
  name: string,
  siblings: readonly FileEntry[],
  ownName?: string,
): string | undefined {
  const validation = validateName(name);
  if (!validation.valid) return validation.reason;
  if (name !== ownName && siblings.some((sibling) => sibling.name === name)) {
    return `${name} already exists in this folder.`;
  }
  return undefined;
}
