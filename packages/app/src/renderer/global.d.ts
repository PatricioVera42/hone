// The API the preload exposes through contextBridge.
interface Window {
  hone: {
    getHostConnection(): string;
  };
}
