import { AppError } from "@hone/protocol";
import { promises as fs } from "node:fs";
import path from "node:path";

function isInside(folder: string, candidate: string): boolean {
  const relative = path.relative(folder, candidate);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
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
  if (path.isAbsolute(protocolPath)) throw outside;

  const realRoot = await realPathOrNotFound(workshopRoot, protocolPath);
  // Checked before touching the disk too, so `../x` fails the same way whether or not `x` exists.
  if (!isInside(realRoot, path.resolve(realRoot, protocolPath))) throw outside;
  const realPath = await realPathOrNotFound(path.join(realRoot, protocolPath), protocolPath);
  if (!isInside(realRoot, realPath)) throw outside;
  return realPath;
}
