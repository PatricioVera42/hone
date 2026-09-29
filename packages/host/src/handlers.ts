import {
  encodeNotification,
  filesChangedNotification,
  filesCountFilesMethod,
  filesCreateMethod,
  filesDeleteMethod,
  filesListMethod,
  filesReadMethod,
  filesRenameMethod,
  filesWriteMethod,
  registerMethod,
  workshopCreateMethod,
  workshopOpenMethod,
  type MethodHandler,
  type WorkshopInfo,
} from "@hone/protocol";
import {
  countFiles,
  createEntry,
  deleteEntry,
  listFolder,
  readFile,
  renameEntry,
  writeFile,
} from "./files.ts";
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
  let opens = 0;
  let closed = false;

  // Replies only once the watcher is ready, so the app sees every change made after the workshop opened.
  async function open(workshop: WorkshopInfo): Promise<WorkshopInfo> {
    opens += 1;
    const ticket = opens;
    const next = await watchWorkshop(workshop.root, (change) => {
      send(encodeNotification(filesChangedNotification, change));
    });
    // The socket closed, or a later open took over, while this watcher was starting: keeping it would leak it.
    if (closed || ticket !== opens) {
      await next.close();
      return workshop;
    }
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
      registerMethod(filesReadMethod, ({ path }) => readFile(workshopRoot, path)),
      registerMethod(filesCountFilesMethod, ({ path }) => countFiles(workshopRoot, path)),
      registerMethod(filesCreateMethod, ({ path, kind }) => createEntry(workshopRoot, path, kind)),
      registerMethod(filesDeleteMethod, ({ path }) => deleteEntry(workshopRoot, path)),
      registerMethod(filesRenameMethod, ({ from, to }) => renameEntry(workshopRoot, from, to)),
      registerMethod(filesWriteMethod, ({ path, content, baseVersion }) =>
        writeFile(workshopRoot, path, content, baseVersion),
      ),
    ],
    close: async () => {
      closed = true;
      await watcher?.close();
      watcher = undefined;
    },
  };
}
