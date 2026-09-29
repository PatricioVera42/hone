import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectFile } from "./inspect-file.ts";

async function writeTemporary(bytes: string | Buffer): Promise<string> {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "hone-inspect-"));
  const file = path.join(folder, "file");
  await fs.writeFile(file, bytes);
  return file;
}

describe("inspectFile", () => {
  it("reports a small text file as text, with its content and the SHA-256 hex of its bytes as the version", async () => {
    const file = await writeTemporary("hello");
    await expect(inspectFile(file)).resolves.toStrictEqual({
      withinSizeLimit: true,
      text: true,
      version: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      content: "hello",
    });
  });

  it("reports a file with a NUL byte in its first 8 KB as not text", async () => {
    const file = await writeTemporary(Buffer.from([0x61, 0x00, 0x62]));
    await expect(inspectFile(file)).resolves.toMatchObject({ withinSizeLimit: true, text: false });
  });

  it("reports a file whose only NUL byte comes after the first 8 KB as text", async () => {
    const file = await writeTemporary(Buffer.concat([Buffer.alloc(8192, "a"), Buffer.from([0])]));
    await expect(inspectFile(file)).resolves.toMatchObject({ withinSizeLimit: true, text: true });
  });

  it("reports a file that isn't valid UTF-8 as not text, since saving it would lose its bytes", async () => {
    // "café" in Latin-1.
    const file = await writeTemporary(Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    await expect(inspectFile(file)).resolves.toMatchObject({ withinSizeLimit: true, text: false });
  });

  it("keeps a UTF-8 byte order mark in the content, so saving writes it back", async () => {
    const file = await writeTemporary(Buffer.from([0xef, 0xbb, 0xbf, 0x61]));
    await expect(inspectFile(file)).resolves.toMatchObject({ text: true, content: "\uFEFFa" });
  });

  it("accepts a file of exactly 5 MB", async () => {
    const file = await writeTemporary(Buffer.alloc(5 * 1024 * 1024, "a"));
    await expect(inspectFile(file)).resolves.toMatchObject({ withinSizeLimit: true });
  });

  it("reports a file over 5 MB as over the limit", async () => {
    const file = await writeTemporary(Buffer.alloc(5 * 1024 * 1024 + 1, "a"));
    await expect(inspectFile(file)).resolves.toStrictEqual({ withinSizeLimit: false });
  });
});
