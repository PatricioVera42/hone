import {
  File01Icon,
  FileImageIcon,
  FileTextIcon,
  HtmlFile01Icon,
  Pdf01Icon,
  PythonIcon,
  Txt01Icon,
  Typescript01Icon,
} from "@hugeicons/core-free-icons";

const iconByExtension: ReadonlyMap<string, typeof File01Icon> = new Map([
  ["md", FileTextIcon],
  ["pdf", Pdf01Icon],
  ["py", PythonIcon],
  ["ts", Typescript01Icon],
  ["tsx", Typescript01Icon],
  ["txt", Txt01Icon],
  ["png", FileImageIcon],
  ["jpg", FileImageIcon],
  ["jpeg", FileImageIcon],
  ["gif", FileImageIcon],
  ["svg", FileImageIcon],
  ["webp", FileImageIcon],
  ["html", HtmlFile01Icon],
]);

/**
 * The icon for a file name, from its extension: what follows the last dot, matched in lowercase only. A name
 * without a dot, or whose only dot is its first (`.gitignore`), has no extension.
 */
export function fileIcon(name: string): typeof File01Icon {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? iconByExtension.get(name.slice(dot + 1)) : undefined) ?? File01Icon;
}
