import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";

const maxBytes = 5 * 1024 * 1024;
// The same heuristic Git uses: a NUL byte near the start means binary.
const textSniffBytes = 8 * 1024;

/** Result of {@link inspectFile}. A file over the limit isn't read, so it has neither `text` nor `version`. */
export type FileInspection =
  | { readonly withinSizeLimit: false }
  | { readonly withinSizeLimit: true; readonly text: boolean; readonly version: string };

/**
 * Tells whether a file is at most 5 MB, whether it's text (no NUL byte in its first 8 KB) and its version
 * (SHA-256 hex of its bytes). The one place those rules live, for `files.changed` and file reads alike.
 */
export async function inspectFile(absolutePath: string): Promise<FileInspection> {
  const { size } = await fs.stat(absolutePath);
  if (size > maxBytes) return { withinSizeLimit: false };
  const bytes = await fs.readFile(absolutePath);
  // The file may have grown between the stat and the read.
  if (bytes.length > maxBytes) return { withinSizeLimit: false };
  return {
    withinSizeLimit: true,
    text: !bytes.subarray(0, textSniffBytes).includes(0),
    version: createHash("sha256").update(bytes).digest("hex"),
  };
}
