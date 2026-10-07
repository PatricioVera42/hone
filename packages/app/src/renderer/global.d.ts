// The API the preload exposes through contextBridge.
interface Window {
  hone: {
    getHostConnection(): string;
    restartHost(): Promise<void>;
    /** Opens the native folder dialog. Resolves with the chosen folder as a Linux path, or `undefined` if cancelled. */
    pickFolder(): Promise<string | undefined>;
    /** The root of the workshop opened last, kept in Electron's `userData`. */
    getLastWorkshop(): Promise<string | undefined>;
    setLastWorkshop(root: string): Promise<void>;
    /** The sidebar's width in pixels, kept in Electron's `userData`. `undefined` if the user never resized it. */
    getSidebarWidth(): Promise<number | undefined>;
    setSidebarWidth(width: number): Promise<void>;
    /** The layout last saved for the workshop at `root`, kept in Electron's `userData`. Unvalidated. */
    loadLayout(root: string): Promise<unknown>;
    saveLayout(root: string, layout: unknown): Promise<void>;
    /**
     * Registers what main runs before the window closes, which resolves with whether edits are still pending. Main
     * closes the window once it settles without pending edits, or after 2 seconds; with pending edits, it asks
     * whether to discard them. Returns a function that unregisters it.
     */
    onFlushSaves(flush: () => Promise<boolean>): () => void;
  };
}
