import {
  AppError,
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
  terminalCloseMethod,
  terminalDataNotification,
  terminalExitNotification,
  terminalOpenMethod,
  terminalResizeMethod,
  terminalWriteMethod,
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
import { Terminals } from "./terminals.ts";
import { watchWorkshop, type WorkshopWatcher } from "./watch-workshop.ts";
import { createWorkshop, openWorkshop } from "./workshop.ts";
import { resolveWorkshopFolder } from "./workshop-path.ts";

export interface Connection {
  readonly handlers: MethodHandler[];
  /** Stops watching the open workshop and kills the connection's terminals, for when the socket closes. */
  close(): Promise<void>;
}

/**
 * The state for one connection. Each window has its own, so each keeps its own open workshop, watched for
 * changes that `send` delivers as `files.changed` notifications, and its own terminals.
 */
export function createConnection(send: (message: string) => void): Connection {
  let workshopRoot: string | undefined;
  let watcher: WorkshopWatcher | undefined;
  let opens = 0;
  let closed = false;
  const terminals = new Terminals({
    data: (id, data) => send(encodeNotification(terminalDataNotification, { id, data })),
    // Also for terminals killed because the socket closed, while it's still open enough to send.
    exit: (id, exitCode) => send(encodeNotification(terminalExitNotification, { id, exitCode })),
  });

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
    // Their folders belong to the workshop that's no longer open.
    terminals.closeAll();
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
      registerMethod(terminalOpenMethod, async ({ cwd, cols, rows }) => {
        const folder = await resolveWorkshopFolder(workshopRoot, cwd);
        // The socket closed while the folder was resolving, so its terminals are already killed and this one wouldn't be.
        if (closed) throw new AppError("NoWorkshopOpen", "The connection closed");
        return { id: terminals.open(folder, cols, rows) };
      }),
      registerMethod(terminalWriteMethod, ({ id, data }) => {
        terminals.write(id, data);
        return null;
      }),
      registerMethod(terminalResizeMethod, ({ id, cols, rows }) => {
        terminals.resize(id, cols, rows);
        return null;
      }),
      registerMethod(terminalCloseMethod, ({ id }) => {
        terminals.close(id);
        return null;
      }),
    ],
    close: async () => {
      closed = true;
      terminals.closeAll();
      await watcher?.close();
      watcher = undefined;
    },
  };
}
