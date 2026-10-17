/** Whether the file at `path` is a note, which the editor shows as Markdown, rather than code. */
export function isNote(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}
