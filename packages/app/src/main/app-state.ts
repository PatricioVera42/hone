// App state kept in one JSON file in Electron's `userData`, never in the workshop (ADR 0003).
import { readFile, rename, writeFile } from "node:fs/promises";
import { z } from "zod";

// Loose, so keys this version doesn't know about (such as layouts) survive a write.
const appStateSchema = z.looseObject({ lastWorkshop: z.string().optional() });

type AppState = z.infer<typeof appStateSchema>;

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export class AppStateFile {
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  /** The root of the workshop opened last, if any. */
  async getLastWorkshop(): Promise<string | undefined> {
    return (await this.read()).lastWorkshop;
  }

  async setLastWorkshop(root: string): Promise<void> {
    await this.write({ ...(await this.read()), lastWorkshop: root });
  }

  private async read(): Promise<AppState> {
    let text: string;
    try {
      text = await readFile(this.file, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) return {};
      throw error;
    }
    // A file that isn't valid JSON or has the wrong shape starts over empty, so it never blocks the launch.
    try {
      const parsed = appStateSchema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data : {};
    } catch {
      return {};
    }
  }

  private async write(state: AppState): Promise<void> {
    // Write then rename, so a crash mid-write never leaves a truncated file.
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, JSON.stringify(state, undefined, 2));
    await rename(temporary, this.file);
  }
}
