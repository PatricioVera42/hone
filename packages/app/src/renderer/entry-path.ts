/** Whether `path` is the entry at `entry` or inside it, for protocol paths relative to the workshop root. */
export function isAtOrInside(path: string, entry: string): boolean {
  return path === entry || path.startsWith(`${entry}/`);
}

/** Where `path` is once the entry at `from` is renamed to `to`, or `undefined` when the rename leaves it alone. */
export function renamedPath(path: string, from: string, to: string): string | undefined {
  return isAtOrInside(path, from) ? to + path.slice(from.length) : undefined;
}

/** The protocol path of the entry called `name` inside the folder at `folder`, where "" is the workshop root. */
export function childPath(folder: string, name: string): string {
  return folder === "" ? name : `${folder}/${name}`;
}

/** The folders above the file at `path`, from the workshop root down, each with its own path. */
export function ancestorFolders(path: string): { name: string; path: string }[] {
  const names = path.split("/").slice(0, -1);
  return names.map((name, index) => ({ name, path: names.slice(0, index + 1).join("/") }));
}
