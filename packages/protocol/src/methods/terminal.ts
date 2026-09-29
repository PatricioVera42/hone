import { z } from "zod";
import type { MethodDefinition, NotificationDefinition } from "../json-rpc.ts";

const terminalSizeSchema = { cols: z.number().int().positive(), rows: z.number().int().positive() };

/**
 * Opens a terminal running the user's login shell (`$SHELL -l`, or `/bin/bash -l` when `SHELL` is unset) in the
 * folder at `cwd`, a protocol path relative to the open workshop's root (`""` for the root), sized `cols` by `rows`.
 * The terminal belongs to the connection that opened it: closing the connection or opening another workshop kills it,
 * and a `terminal.exit` follows while the connection is open. Fails with `NoWorkshopOpen`, `OutsideWorkshop` and
 * `NotFound` (also for a file).
 */
export const terminalOpenMethod: MethodDefinition<
  { cwd: string; cols: number; rows: number },
  { id: string }
> = {
  name: "terminal.open",
  params: z.object({ cwd: z.string(), ...terminalSizeSchema }),
  result: z.object({ id: z.string() }),
};

/**
 * Types `data` into a terminal, as keystrokes. Does nothing for a terminal that has exited, which may have happened
 * just before the call arrived.
 */
export const terminalWriteMethod: MethodDefinition<{ id: string; data: string }, null> = {
  name: "terminal.write",
  params: z.object({ id: z.string(), data: z.string() }),
  result: z.null(),
};

/** Resizes a terminal to `cols` by `rows`. Does nothing for a terminal that has exited. */
export const terminalResizeMethod: MethodDefinition<
  { id: string; cols: number; rows: number },
  null
> = {
  name: "terminal.resize",
  params: z.object({ id: z.string(), ...terminalSizeSchema }),
  result: z.null(),
};

/**
 * Kills a terminal's processes. A `terminal.exit` follows, as for any other way it ends. Does nothing for a terminal
 * that has exited.
 */
export const terminalCloseMethod: MethodDefinition<{ id: string }, null> = {
  name: "terminal.close",
  params: z.object({ id: z.string() }),
  result: z.null(),
};

/** Sent by the host with a terminal's output, in order, as it arrives. */
export const terminalDataNotification: NotificationDefinition<{ id: string; data: string }> = {
  name: "terminal.data",
  params: z.object({ id: z.string(), data: z.string() }),
};

/**
 * Sent by the host once a terminal's shell has exited, on its own or because the host killed it. It's the last
 * notification about that terminal.
 */
export const terminalExitNotification: NotificationDefinition<{ id: string; exitCode: number }> = {
  name: "terminal.exit",
  params: z.object({ id: z.string(), exitCode: z.number() }),
};
