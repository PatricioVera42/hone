/** Whether `path` is the entry at `entry` or inside it, for protocol paths relative to the workshop root. */
export function isAtOrInside(path: string, entry: string): boolean {
  return path === entry || path.startsWith(`${entry}/`);
}

/** Where `path` is once the entry at `from` is renamed to `to`, or `undefined` when the rename leaves it alone. */
export function renamedPath(path: string, from: string, to: string): string | undefined {
  return isAtOrInside(path, from) ? to + path.slice(from.length) : undefined;
}
