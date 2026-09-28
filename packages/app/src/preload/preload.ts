// Preload: the renderer's only way to reach the host, via a synchronous IPC round trip to main.
import { contextBridge, ipcRenderer } from "electron";

function asString(value: unknown): string {
  if (typeof value !== "string") throw new Error("host connection IPC returned a non-string value");
  return value;
}

contextBridge.exposeInMainWorld("hone", {
  getHostConnection: (): string => asString(ipcRenderer.sendSync("host:connection")),
  restartHost: async (): Promise<void> => {
    await ipcRenderer.invoke("host:restart");
  },
});
