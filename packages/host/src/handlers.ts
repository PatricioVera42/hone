import { registerMethod, workshopCreateMethod, workshopOpenMethod } from "@hone/protocol";
import { createWorkshop, openWorkshop } from "./workshop.ts";

export const handlers = [
  registerMethod(workshopOpenMethod, ({ path }) => openWorkshop(path)),
  registerMethod(workshopCreateMethod, ({ parent, name }) => createWorkshop(parent, name)),
];
