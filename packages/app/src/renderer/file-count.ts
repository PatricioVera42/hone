import { maxCountedFiles } from "@hone/protocol";

/** A folder's file count from `files.countFiles` in words, such as "3 files", or "10,000+ files" at the cap. */
export function describeFileCount(count: number): string {
  if (count === 0) return "no files";
  if (count === 1) return "1 file";
  const plus = count >= maxCountedFiles ? "+" : "";
  return `${count.toLocaleString("en-US")}${plus} files`;
}
