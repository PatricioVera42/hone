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

interface NotAWorkshopDialogProps {
  /** The folder the user picked, or `undefined` while the dialog is closed. */
  readonly folder: string | undefined;
  readonly onClose: () => void;
  readonly onCreateWorkshop: () => void;
}

export function NotAWorkshopDialog({ folder, onClose, onCreateWorkshop }: NotAWorkshopDialogProps) {
  return (
    <AlertDialog
      open={folder !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Not a workshop</AlertDialogTitle>
          <AlertDialogDescription>
            {folder} isn't inside a workshop. Pick a folder inside one, or create a new workshop.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onCreateWorkshop}>Create workshop</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
