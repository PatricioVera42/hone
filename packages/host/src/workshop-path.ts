import { AppError, validateName } from "@hone/protocol";
import { promises as fs } from "node:fs";
import path from "node:path";

function isInside(folder: string, candidate: string): boolean {
  const relative = path.relative(folder, candidate);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isLexicallyInside(realRoot: string, protocolPath: string): boolean {
  return !path.isAbsolute(protocolPath) && isInside(realRoot, path.resolve(realRoot, protocolPath));
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

async function realPathOrNotFound(candidate: string, protocolPath: string): Promise<string> {
  try {
    return await fs.realpath(candidate);
  } catch (error) {
    if (isMissingPathError(error)) {
      throw new AppError("NotFound", `${protocolPath} doesn't exist in the workshop`);
    }
    throw error;
  }
}

/**
 * Turns a protocol path (relative to the open workshop's root, `""` for the root) into the real path it points to,
 * with every symlink resolved. Every file and terminal method goes through it, so none can reach outside the workshop.
 * Fails with `NoWorkshopOpen`, with `OutsideWorkshop` if the path or a symlink along it leads out of the workshop,
 * and with `NotFound` if nothing exists there.
 */
export async function resolveWorkshopPath(
  workshopRoot: string | undefined,
  protocolPath: string,
): Promise<string> {
  if (workshopRoot === undefined) {
    throw new AppError("NoWorkshopOpen", `No workshop is open to resolve ${protocolPath}`);
  }
  const outside = new AppError("OutsideWorkshop", `${protocolPath} is outside the workshop`);
  const realRoot = await realPathOrNotFound(workshopRoot, protocolPath);
  // Checked before touching the disk too, so `../x` fails the same way whether or not `x` exists.
  if (!isLexicallyInside(realRoot, protocolPath)) throw outside;
  const realPath = await realPathOrNotFound(path.join(realRoot, protocolPath), protocolPath);
  if (!isInside(realRoot, realPath)) throw outside;
  return realPath;
}

/** Like {@link resolveWorkshopPath}, and fails with `NotFound` when the path isn't a folder. */
export async function resolveWorkshopFolder(
  workshopRoot: string | undefined,
  protocolPath: string,
): Promise<string> {
  const folder = await resolveWorkshopPath(workshopRoot, protocolPath);
  if (!(await fs.stat(folder)).isDirectory()) {
    throw new AppError("NotFound", `${protocolPath} is not a folder`);
  }
  return folder;
}

/**
 * Like {@link resolveWorkshopPath}, but resolves only the parent folder, so a symlink at the path itself is left as
 * it is, and whatever is there doesn't need to exist: for creating, renaming and deleting. Fails like
 * {@link resolveWorkshopPath} for the parent folder, and with `InvalidName` when the last segment isn't a valid
 * name by `validateName`, which includes the workshop root itself.
 */
export async function resolveWorkshopEntryPath(
  workshopRoot: string | undefined,
  protocolPath: string,
): Promise<string> {
  // Checked on the whole path, since the parent folder alone can look inside: `""` for `/tmp` or `..`.
  if (workshopRoot !== undefined && !isLexicallyInside(workshopRoot, protocolPath)) {
    throw new AppError("OutsideWorkshop", `${protocolPath} is outside the workshop`);
  }
  const slash = protocolPath.lastIndexOf("/");
  const name = protocolPath.slice(slash + 1);
  const folder = await resolveWorkshopPath(
    workshopRoot,
    slash === -1 ? "" : protocolPath.slice(0, slash),
  );
  const validation = validateName(name);
  if (!validation.valid) throw new AppError("InvalidName", validation.reason);
  return path.join(folder, name);
}
