// App state kept in one JSON file in Electron's `userData`, never in the workshop (ADR 0003).
import { readFile, rename, writeFile } from "node:fs/promises";
import { z } from "zod";

// Loose, so keys this version doesn't know about survive a write.
const appStateSchema = z.looseObject({
  lastWorkshop: z.string().optional(),
  /** Each workshop's editor area layout, by workshop root. The renderer validates it when it loads one. */
  layouts: z.record(z.string(), z.unknown()).optional(),
});

type AppState = z.infer<typeof appStateSchema>;

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export class AppStateFile {
  private readonly file: string;
  // Each access waits for the one before, so two updates at once don't overwrite each other and a read sees
  // every write asked for before it.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
  }

  /** The root of the workshop opened last, if any. */
  async getLastWorkshop(): Promise<string | undefined> {
    return (await this.inTurn(() => this.read())).lastWorkshop;
  }

  setLastWorkshop(root: string): Promise<void> {
    return this.update((state) => ({ ...state, lastWorkshop: root }));
  }

  /** The layout last saved for the workshop at `root`, if any, unvalidated. */
  async getLayout(root: string): Promise<unknown> {
    return (await this.inTurn(() => this.read())).layouts?.[root];
  }

  setLayout(root: string, layout: unknown): Promise<void> {
    return this.update((state) => ({ ...state, layouts: { ...state.layouts, [root]: layout } }));
  }

  private update(change: (state: AppState) => AppState): Promise<void> {
    return this.inTurn(async () => this.write(change(await this.read())));
  }

  private inTurn<T>(access: () => Promise<T>): Promise<T> {
    const result = this.queue.then(access);
    // A failed access is reported to its caller and doesn't stop the ones after it.
    this.queue = result.catch(() => undefined);
    return result;
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
