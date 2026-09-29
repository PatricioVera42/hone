// Shows an error nothing else handles, so a failed action never ends in silence.
import { toast } from "@/components/ui/toast.tsx";

export function reportError(error: unknown): void {
  toast.add({
    type: "error",
    title: "Something went wrong",
    description: error instanceof Error ? error.message : String(error),
  });
}
