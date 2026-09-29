// Preload: the renderer's only way to reach main: the host connection, the native folder dialog and app state.
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
});
