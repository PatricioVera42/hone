import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";

const maxBytes = 5 * 1024 * 1024;
// The same heuristic Git uses: a NUL byte near the start means binary.
const textSniffBytes = 8 * 1024;
// Fatal, because decoding another encoding would turn its bytes into U+FFFD and saving would write those back.
// Keeps a byte order mark in the content, so saving writes it back too.
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function decodeUtf8(bytes: Buffer): string | undefined {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * Result of {@link inspectFile}. A file over the limit isn't read, so it has neither `text` nor `version`.
 * Only a text file comes with its `content`, decoded as UTF-8.
 */
export type FileInspection =
  | { readonly withinSizeLimit: false }
  | { readonly withinSizeLimit: true; readonly text: false; readonly version: string }
  | {
      readonly withinSizeLimit: true;
      readonly text: true;
      readonly version: string;
      readonly content: string;
    };

/**
 * Tells whether a file is at most 5 MB, whether it's text (valid UTF-8 without a NUL byte in its first 8 KB) and its version
 * (SHA-256 hex of its bytes). The one place those rules live, for `files.changed` and `files.read` alike.
 */
export async function inspectFile(absolutePath: string): Promise<FileInspection> {
  const { size } = await fs.stat(absolutePath);
  if (size > maxBytes) return { withinSizeLimit: false };
  const bytes = await fs.readFile(absolutePath);
  // The file may have grown between the stat and the read.
  if (bytes.length > maxBytes) return { withinSizeLimit: false };
  const version = createHash("sha256").update(bytes).digest("hex");
  const content = bytes.subarray(0, textSniffBytes).includes(0) ? undefined : decodeUtf8(bytes);
  if (content === undefined) return { withinSizeLimit: true, text: false, version };
  return { withinSizeLimit: true, text: true, version, content };
}
