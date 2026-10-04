import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { readTree } from "./test-harness.ts";

const run = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const script = path.join(import.meta.dirname, "sync-workshop.ts");

async function makeWorkshop(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hone-sync-"));
  await fs.mkdir(path.join(root, ".hone", "generator"), { recursive: true });
  return root;
}

async function sync(target: string, cwd = repoRoot): Promise<void> {
  await run(process.execPath, [script, target], { cwd });
}

async function readPermissionFiles(root: string): Promise<unknown[]> {
  const generator = path.join(root, ".hone", "generator");
  const texts = await Promise.all([
    fs.readFile(path.join(generator, ".claude", "settings.json"), "utf8"),
    fs.readFile(path.join(generator, "opencode.json"), "utf8"),
  ]);
  return texts.map((text): unknown => JSON.parse(text));
}

function permissionFilesFor(root: string): unknown[] {
  return [
    { permissions: { additionalDirectories: [root] } },
    {
      $schema: "https://opencode.ai/config.json",
      permission: { external_directory: { [`${root}/**`]: "allow" } },
    },
  ];
}

describe("sync-workshop", () => {
  it("replaces the generator and the default library items, and touches nothing else", async () => {
    const root = await makeWorkshop();
    const generator = path.join(root, ".hone", "generator");
    await fs.writeFile(path.join(generator, "stale.md"), "old");
    const library = path.join(root, "library");
    const [defaultItem] = await fs.readdir(path.join(repoRoot, "library-default"));
    if (defaultItem === undefined) throw new Error("library-default/ is empty");
    await fs.mkdir(path.join(library, defaultItem), { recursive: true });
    await fs.writeFile(path.join(library, defaultItem, "edited.md"), "mine");
    await fs.writeFile(path.join(library, "my-skill.md"), "mine");
    await fs.writeFile(path.join(root, "note.md"), "mine");

    await sync(root);

    await expect(fs.stat(path.join(generator, "stale.md"))).rejects.toThrow();
    const seeded = await readTree(generator);
    seeded.delete(path.join(".claude", "settings.json"));
    seeded.delete("opencode.json");
    expect(seeded).toStrictEqual(await readTree(path.join(repoRoot, "generator")));
    expect(await readPermissionFiles(root)).toStrictEqual(permissionFilesFor(root));
    const libraryTree = await readTree(library);
    expect(libraryTree.has(path.join(defaultItem, "edited.md"))).toBe(false);
    expect(libraryTree.get("my-skill.md")).toBe("mine");
    await expect(fs.readFile(path.join(root, "note.md"), "utf8")).resolves.toBe("mine");
  });

  it("writes the absolute root into the permission files when given a relative path", async () => {
    const root = await makeWorkshop();

    await sync(path.basename(root), path.dirname(root));

    // The temporary directory may be reached through a symlink, so compare resolved paths.
    const realRoot = await fs.realpath(root);
    expect(await readPermissionFiles(root)).toStrictEqual(permissionFilesFor(realRoot));
  });

  it("refuses a path that isn't a workshop root, changing nothing", async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "hone-not-workshop-"));
    await fs.mkdir(path.join(folder, "inner", ".hone", "generator"), { recursive: true });

    await expect(sync(folder)).rejects.toMatchObject({ code: 1 });
    await expect(sync(path.join(folder, "missing"))).rejects.toMatchObject({ code: 1 });
    await expect(fs.readdir(folder)).resolves.toStrictEqual(["inner"]);
  });
});
