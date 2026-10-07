// Shows an error nothing else handles, so a failed action never ends in silence.
import { toast } from "@/components/ui/toast.tsx";

/** What to tell the user about `error`, which may not be an `Error`. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function reportError(error: unknown): void {
  toast.add({ type: "error", title: "Something went wrong", description: errorMessage(error) });
}
