import { z } from "zod";
import type { MethodDefinition } from "../json-rpc.ts";

const workshopInfoSchema = z.object({
  root: z.string(),
  name: z.string(),
  onWindowsDisk: z.boolean(),
});

export type WorkshopInfo = z.infer<typeof workshopInfoSchema>;

/** Walks up from an absolute path to the workshop that contains it. Fails with `NotAWorkshop`. */
export const workshopOpenMethod: MethodDefinition<{ path: string }, WorkshopInfo> = {
  name: "workshop.open",
  params: z.object({ path: z.string() }),
  result: workshopInfoSchema,
};

/** Creates `<parent>/<name>/.hone/generator/` and opens it. Fails with `InvalidName`, `NestedWorkshop` or `AlreadyExists`. */
export const workshopCreateMethod: MethodDefinition<
  { parent: string; name: string },
  WorkshopInfo
> = {
  name: "workshop.create",
  params: z.object({ parent: z.string(), name: z.string() }),
  result: workshopInfoSchema,
};
