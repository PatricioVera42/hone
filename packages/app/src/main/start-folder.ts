import path from "node:path";

interface StartFolderSources {
  /** The root of the workshop opened last, as a Linux path, if any. */
  readonly lastWorkshop: string | undefined;
  /** The user's home in WSL, as a Linux path. */
  home(): Promise<string>;
  /** Converts a Linux path to the form the folder dialog takes: a Windows path on Windows, the same path on Linux. */
  toDialogPath(linuxPath: string): Promise<string>;
  /** Whether `dialogPath` is an existing folder. */
  isFolder(dialogPath: string): Promise<boolean>;
}

async function lastWorkshopParent(sources: StartFolderSources): Promise<string | undefined> {
  if (sources.lastWorkshop === undefined) return undefined;
  try {
    // Stored paths are Linux paths, whatever platform main runs on.
    const parent = await sources.toDialogPath(path.posix.dirname(sources.lastWorkshop));
    return (await sources.isFolder(parent)) ? parent : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The folder the native folder dialog starts in: the parent of the last workshop if it still exists, otherwise the
 * WSL home. Undefined when neither can be worked out, so a failure here never blocks picking a folder.
 */
export async function chooseStartFolder(sources: StartFolderSources): Promise<string | undefined> {
  const parent = await lastWorkshopParent(sources);
  if (parent !== undefined) return parent;
  try {
    return await sources.toDialogPath(await sources.home());
  } catch {
    return undefined;
  }
}
