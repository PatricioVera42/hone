// Preload: the renderer's only way to reach main: the host connection, the native folder dialog, app state (the
// last workshop and each workshop's layout) and saving pending edits before the window closes.
import { contextBridge, ipcRenderer } from "electron";

function asString(value: unknown): string {
  if (typeof value !== "string") throw new Error("host connection IPC returned a non-string value");
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error("IPC returned a value that is neither a string nor undefined");
  }
  return value;
}

contextBridge.exposeInMainWorld("hone", {
  getHostConnection: (): string => asString(ipcRenderer.sendSync("host:connection")),
  restartHost: async (): Promise<void> => {
    await ipcRenderer.invoke("host:restart");
  },
  pickFolder: async (): Promise<string | undefined> =>
    asOptionalString(await ipcRenderer.invoke("dialog:pick-folder")),
  getLastWorkshop: async (): Promise<string | undefined> =>
    asOptionalString(await ipcRenderer.invoke("state:get-last-workshop")),
  setLastWorkshop: async (root: string): Promise<void> => {
    await ipcRenderer.invoke("state:set-last-workshop", root);
  },
  loadLayout: (root: string): Promise<unknown> => ipcRenderer.invoke("state:load-layout", root),
  saveLayout: async (root: string, layout: unknown): Promise<void> => {
    await ipcRenderer.invoke("state:save-layout", root, layout);
  },
  onFlushSaves: (flush: () => Promise<void>): (() => void) => {
    function onRequest(): void {
      // Answers even when a save fails, so main doesn't wait out its timeout; the failure is already reported.
      void flush().finally(() => ipcRenderer.send("window:saves-flushed"));
    }
    ipcRenderer.on("window:flush-saves", onRequest);
    return () => ipcRenderer.off("window:flush-saves", onRequest);
  },
});
