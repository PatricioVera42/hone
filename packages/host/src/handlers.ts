import {
  encodeNotification,
  filesChangedNotification,
  filesListMethod,
  registerMethod,
  workshopCreateMethod,
  workshopOpenMethod,
  type MethodHandler,
  type WorkshopInfo,
} from "@hone/protocol";
import { listFolder } from "./files.ts";
import { watchWorkshop, type WorkshopWatcher } from "./watch-workshop.ts";
import { createWorkshop, openWorkshop } from "./workshop.ts";

export interface Connection {
  readonly handlers: MethodHandler[];
  /** Stops watching the open workshop, for when the socket closes. */
  close(): Promise<void>;
}

/**
 * The state for one connection. Each window has its own, so each keeps its own open workshop, watched for
 * changes that `send` delivers as `files.changed` notifications.
 */
export function createConnection(send: (message: string) => void): Connection {
  let workshopRoot: string | undefined;
  let watcher: WorkshopWatcher | undefined;

  // Replies only once the watcher is ready, so the app sees every change made after the workshop opened.
  async function open(workshop: WorkshopInfo): Promise<WorkshopInfo> {
    const next = await watchWorkshop(workshop.root, (change) => {
      send(encodeNotification(filesChangedNotification, change));
    });
    const previous = watcher;
    watcher = next;
    workshopRoot = workshop.root;
    await previous?.close();
    return workshop;
  }

  return {
    handlers: [
      registerMethod(workshopOpenMethod, async ({ path }) => open(await openWorkshop(path))),
      registerMethod(workshopCreateMethod, async ({ parent, name }) =>
        open(await createWorkshop(parent, name)),
      ),
      registerMethod(filesListMethod, ({ path }) => listFolder(workshopRoot, path)),
    ],
    close: async () => {
      await watcher?.close();
      watcher = undefined;
    },
  };
}
