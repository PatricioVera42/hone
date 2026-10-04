import { AppError, validateName, type WorkshopInfo } from "@hone/protocol";
import { promises as fs } from "node:fs";
import path from "node:path";
import { seedGenerator, seedLibrary } from "./seed-workshop.ts";

const generatorMarker = path.join(".hone", "generator");

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    const stats = await fs.stat(candidate);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.stat(candidate);
    return true;
  } catch {
    return false;
  }
}

/** A folder is a workshop root when it has `.hone/generator/` directly inside it. */
export function isWorkshopRoot(candidate: string): Promise<boolean> {
  return isDirectory(path.join(candidate, generatorMarker));
}

async function findWorkshopRoot(current: string): Promise<string | undefined> {
  if (await isWorkshopRoot(current)) return current;
  const parent = path.dirname(current);
  if (parent === current) return undefined;
  return findWorkshopRoot(parent);
}

function toWorkshopInfo(root: string): WorkshopInfo {
  return {
    root,
    name: path.basename(root),
    onWindowsDisk: root === "/mnt" || root.startsWith("/mnt/"),
  };
}

export async function openWorkshop(absolutePath: string): Promise<WorkshopInfo> {
  const root = await findWorkshopRoot(absolutePath);
  if (root === undefined) {
    throw new AppError("NotAWorkshop", `No workshop found above ${absolutePath}`);
  }
  return toWorkshopInfo(root);
}

export async function createWorkshop(absoluteParent: string, name: string): Promise<WorkshopInfo> {
  const validation = validateName(name);
  if (!validation.valid) throw new AppError("InvalidName", validation.reason);

  const nestedIn = await findWorkshopRoot(absoluteParent);
  if (nestedIn !== undefined) {
    throw new AppError(
      "NestedWorkshop",
      `${absoluteParent} is already inside the workshop at ${nestedIn}`,
    );
  }

  const root = path.join(absoluteParent, name);
  if (await pathExists(root)) {
    throw new AppError("AlreadyExists", `${root} already exists`);
  }

  await seedGenerator(root);
  await seedLibrary(root);
  return toWorkshopInfo(root);
}
