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
    /** The roots of the last 5 workshops opened, most recent first, kept in Electron's `userData`. */
    getRecentWorkshops(): Promise<string[]>;
    /** Moves `root` to the front of the recent workshops. Resolves with the new list. */
    addRecentWorkshop(root: string): Promise<string[]>;
    /** Drops `root` from the recent workshops. Resolves with the new list. */
    removeRecentWorkshop(root: string): Promise<string[]>;
    /** The sidebar's width in pixels, kept in Electron's `userData`. `undefined` if the user never resized it. */
    getSidebarWidth(): Promise<number | undefined>;
    setSidebarWidth(width: number): Promise<void>;
    /** The layout last saved for the workshop at `root`, kept in Electron's `userData`. Unvalidated. */
    loadLayout(root: string): Promise<unknown>;
    saveLayout(root: string, layout: unknown): Promise<void>;
    /** Asks main to open `url` in the system's default browser. Main ignores it unless the protocol is `http:` or `https:`. */
    openExternal(url: string): Promise<void>;
    /**
     * The paths of files and folders dropped on the window, as Linux paths the host can read. Skips those that
     * aren't on the disk, such as an image dragged from a web page.
     */
    getDroppedPaths(files: File[]): Promise<string[]>;
    /**
     * Registers what main runs before the window closes, which resolves with whether edits are still pending. Main
     * closes the window once it settles without pending edits, or after 2 seconds; with pending edits, it asks
     * whether to discard them. Returns a function that unregisters it.
     */
    onFlushSaves(flush: () => Promise<boolean>): () => void;
  };
}
