import { filesCountFilesMethod, type FileEntry } from "@hone/protocol";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { describeFileCount } from "@/file-count.ts";
import type { HostClient } from "@/host-client.ts";
import { reportError } from "@/report-error.ts";

/** A file or folder to delete, by its protocol path. */
interface DeleteTarget {
  readonly path: string;
  readonly kind: FileEntry["kind"];
}

interface DeleteEntryDialogProps {
  readonly client: HostClient;
  /** What to delete, or `undefined` while the dialog is closed. */
  readonly target: DeleteTarget | undefined;
  readonly onClose: () => void;
  readonly onDelete: (path: string) => Promise<void>;
}

/** Asks before deleting a file or folder for good. For a folder, it says how many files go with it. */
export function DeleteEntryDialog({ client, target, onClose, onDelete }: DeleteEntryDialogProps) {
  return (
    <AlertDialog
      open={target !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        {/* Mounted only while open, so each opening counts the files again. */}
        {target !== undefined && (
          <DeleteEntryContent
            client={client}
            target={target}
            onDelete={() => {
              onClose();
              onDelete(target.path).catch(reportError);
            }}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface DeleteEntryContentProps {
  readonly client: HostClient;
  readonly target: DeleteTarget;
  readonly onDelete: () => void;
}

function DeleteEntryContent({ client, target, onDelete }: DeleteEntryContentProps) {
  const [count, setCount] = useState<number>();
  const name = target.path.slice(target.path.lastIndexOf("/") + 1);

  useEffect(() => {
    if (target.kind !== "folder") return undefined;
    let cancelled = false;
    client
      .call(filesCountFilesMethod, { path: target.path })
      .then((counted) => {
        if (!cancelled) setCount(counted.count);
      })
      .catch((error: unknown) => {
        if (!cancelled) reportError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [client, target]);

  let description = `${name} will be deleted for good. It doesn't go to the trash.`;
  if (target.kind === "folder") {
    const files =
      count === undefined ? "Counting its files…" : `It holds ${describeFileCount(count)}.`;
    description = `${name} and everything inside it will be deleted for good, without going to the trash. ${files}`;
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onDelete}>
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
