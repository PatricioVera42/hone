import {
  filesListMethod,
  registerMethod,
  workshopCreateMethod,
  workshopOpenMethod,
  type MethodHandler,
  type WorkshopInfo,
} from "@hone/protocol";
import { listFolder } from "./files.ts";
import { createWorkshop, openWorkshop } from "./workshop.ts";

/** The methods for one connection. Each window has its own connection, so each keeps its own open workshop. */
export function createHandlers(): MethodHandler[] {
  let workshopRoot: string | undefined;

  function remember(workshop: WorkshopInfo): WorkshopInfo {
    workshopRoot = workshop.root;
    return workshop;
  }

  return [
    registerMethod(workshopOpenMethod, async ({ path }) => remember(await openWorkshop(path))),
    registerMethod(workshopCreateMethod, async ({ parent, name }) =>
      remember(await createWorkshop(parent, name)),
    ),
    registerMethod(filesListMethod, ({ path }) => listFolder(workshopRoot, path)),
  ];
}
