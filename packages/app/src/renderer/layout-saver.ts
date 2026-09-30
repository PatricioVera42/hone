/** How long the layout must stay unchanged before it's saved, so dragging a sash doesn't save on every step. */
export const layoutSaveDelayMs = 500;

interface PendingSave {
  readonly root: string;
  readonly layout: unknown;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Saves a workshop's layout shortly after its last change, or at once when flushed. */
export class LayoutSaver {
  private readonly save: (root: string, layout: unknown) => Promise<void>;
  private pending: PendingSave | undefined;

  /** `save` stores a layout for the workshop at `root`, reporting its own failures: it never rejects. */
  constructor(save: (root: string, layout: unknown) => Promise<void>) {
    this.save = save;
  }

  /** Records that the layout of the workshop at `root` is now `layout`, replacing a change not saved yet. */
  changed(root: string, layout: unknown): void {
    this.discard();
    const timer = setTimeout(() => void this.flush(), layoutSaveDelayMs);
    this.pending = { root, layout, timer };
  }

  /** Saves the change not saved yet, if any. Resolves once it's saved. */
  async flush(): Promise<void> {
    const { pending } = this;
    if (pending === undefined) return;
    this.discard();
    await this.save(pending.root, pending.layout);
  }

  /** Drops the change not saved yet, if any. */
  discard(): void {
    if (this.pending !== undefined) clearTimeout(this.pending.timer);
    this.pending = undefined;
  }
}
