// What the editor area's panels carry in dockview's layout, which is what gets saved per workshop.
import type { SerializedDockview } from "dockview-react";
import { z } from "zod";

export const editorPanelParamsSchema = z.object({
  /** The file's protocol path, relative to the workshop root. It changes when the file or a folder above it is renamed. */
  path: z.string(),
});

/** An editor panel's parameters in the layout. */
export type EditorPanelParams = z.infer<typeof editorPanelParamsSchema>;

export const terminalPanelParamsSchema = z.object({
  /** The folder the terminal's shell started in, as a protocol path relative to the workshop root. */
  cwd: z.string(),
});

/** A terminal panel's parameters in the layout. */
export type TerminalPanelParams = z.infer<typeof terminalPanelParamsSchema>;

const savedPanelSchema = z.discriminatedUnion("contentComponent", [
  z.looseObject({ contentComponent: z.literal("editor"), params: editorPanelParamsSchema }),
  z.looseObject({ contentComponent: z.literal("terminal"), params: terminalPanelParamsSchema }),
]);

// Checks what the editor area relies on; dockview's `fromJSON` rejects a grid that's broken deeper down.
const savedLayoutSchema = z.looseObject({
  grid: z.looseObject({
    root: z.looseObject({ type: z.enum(["branch", "leaf"]) }),
    width: z.number(),
    height: z.number(),
    orientation: z.enum(["HORIZONTAL", "VERTICAL"]),
  }),
  panels: z.record(z.string(), savedPanelSchema),
});

/** Whether a layout loaded from app state can be handed to dockview, with only panels the editor area can reopen. */
export function isRestorableLayout(value: unknown): value is SerializedDockview {
  return savedLayoutSchema.safeParse(value).success;
}
