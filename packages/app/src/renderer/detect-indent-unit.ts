/** How one level of indentation is written: a tab, 2 spaces or 4 spaces. */
export type IndentUnit = "\t" | "  " | "    ";

// Enough to see the file's habit without scanning a 5 MB file.
const sampledLines = 20;

/**
 * Detects a file's indent unit from its first indented lines: tabs if most of them start with a tab, otherwise
 * 4 spaces if every space indent is a multiple of 4, otherwise 2 spaces. With no indented line, 2 spaces.
 * Blank lines and 1-space indents (a comment block's ` *`) don't count.
 */
export function detectIndentUnit(content: string): IndentUnit {
  let tabLines = 0;
  const spaceWidths: number[] = [];
  for (const line of content.split("\n")) {
    if (tabLines + spaceWidths.length >= sampledLines) break;
    if (line.trim() === "") continue;
    if (line.startsWith("\t")) {
      tabLines += 1;
      continue;
    }
    const width = line.length - line.trimStart().length;
    if (width >= 2) spaceWidths.push(width);
  }
  if (tabLines === 0 && spaceWidths.length === 0) return "  ";
  if (tabLines > spaceWidths.length) return "\t";
  return spaceWidths.every((width) => width % 4 === 0) ? "    " : "  ";
}
