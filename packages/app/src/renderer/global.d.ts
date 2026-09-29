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
  };
}
