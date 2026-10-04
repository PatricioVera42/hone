import { promises as fs } from "node:fs";
import path from "node:path";

// The host always runs from the repo's source, so the folders to seed sit at the repo root.
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const generatorSource = path.join(repoRoot, "generator");
const defaultLibrarySource = path.join(repoRoot, "library-default");

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Replaces `<root>/.hone/generator/` with the repo's `generator/` and writes the permission files
 * (ADR 0002) that let the generator work across the workshop. `root` must be absolute: OpenCode's
 * relative patterns aren't confirmed to work.
 */
export async function seedGenerator(root: string): Promise<void> {
  const target = path.join(root, ".hone", "generator");
  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(generatorSource, target, { recursive: true });
  await writeJson(path.join(target, ".claude", "settings.json"), {
    permissions: { additionalDirectories: [root] },
  });
  await writeJson(path.join(target, "opencode.json"), {
    $schema: "https://opencode.ai/config.json",
    permission: { external_directory: { [`${root}/**`]: "allow" } },
  });
}

/** Copies each top-level item of the repo's `library-default/` into `<root>/library/`, replacing an item of the same name and leaving the others alone. */
export async function seedLibrary(root: string): Promise<void> {
  const library = path.join(root, "library");
  await fs.mkdir(library, { recursive: true });
  const items = await fs.readdir(defaultLibrarySource);
  await Promise.all(
    items.map(async (item) => {
      const target = path.join(library, item);
      await fs.rm(target, { recursive: true, force: true });
      await fs.cp(path.join(defaultLibrarySource, item), target, { recursive: true });
    }),
  );
}
