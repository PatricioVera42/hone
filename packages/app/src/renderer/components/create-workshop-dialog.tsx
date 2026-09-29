import {
  appErrorCodes,
  validateName,
  workshopCreateMethod,
  type WorkshopInfo,
} from "@hone/protocol";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { HostCallError, type HostClient } from "@/host-client.ts";
import { reportError } from "@/report-error.ts";

interface CreateWorkshopDialogProps {
  readonly client: HostClient;
  readonly open: boolean;
  /** Preselected parent folder, such as the folder that turned out not to be inside a workshop. */
  readonly initialParent: string | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (workshop: WorkshopInfo) => void;
}

export function CreateWorkshopDialog({
  client,
  open,
  initialParent,
  onOpenChange,
  onCreated,
}: CreateWorkshopDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workshop</DialogTitle>
          <DialogDescription>Hone creates a new folder with this name.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while the dialog is open, so every opening starts from a clean form. */}
        <CreateWorkshopForm client={client} initialParent={initialParent} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}

interface CreateWorkshopFormProps {
  readonly client: HostClient;
  readonly initialParent: string | undefined;
  readonly onCreated: (workshop: WorkshopInfo) => void;
}

function CreateWorkshopForm({ client, initialParent, onCreated }: CreateWorkshopFormProps) {
  const [parent, setParent] = useState(initialParent);
  const [name, setName] = useState("");
  // An empty name is only an error once the user has typed something, not when the dialog opens.
  const [nameEdited, setNameEdited] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const validation = validateName(name);
  const nameError = nameEdited && !validation.valid ? validation.reason : undefined;

  async function chooseParent(): Promise<void> {
    const folder = await window.hone.pickFolder();
    if (folder === undefined) return;
    setParent(folder);
    setSubmitError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (parent === undefined || !validation.valid) return;
    setSubmitting(true);
    try {
      onCreated(await client.call(workshopCreateMethod, { parent, name }));
    } catch (error) {
      if (!(error instanceof HostCallError)) throw error;
      setSubmitError(createErrorMessage(error, parent, name));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event).catch(reportError)}>
      <FieldGroup>
        <Field>
          <FieldLabel>Parent folder</FieldLabel>
          <FieldDescription>
            <span className="block truncate">{parent ?? "No folder chosen."}</span>
          </FieldDescription>
          <Button
            type="button"
            variant="outline"
            onClick={() => void chooseParent().catch(reportError)}
          >
            Choose folder…
          </Button>
        </Field>
        <Field data-invalid={nameError !== undefined}>
          <FieldLabel htmlFor="workshop-name">Name</FieldLabel>
          <Input
            id="workshop-name"
            autoComplete="off"
            value={name}
            aria-invalid={nameError !== undefined}
            onChange={(event) => {
              setName(event.target.value);
              setNameEdited(true);
              setSubmitError(undefined);
            }}
          />
          <FieldError>{nameError}</FieldError>
        </Field>
        <FieldError>{submitError}</FieldError>
        <DialogFooter>
          <Button type="submit" disabled={parent === undefined || !validation.valid || submitting}>
            Create
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}

function createErrorMessage(error: HostCallError, parent: string, name: string): string {
  switch (error.code) {
    case appErrorCodes.NestedWorkshop:
      return `${parent} is inside another workshop, and a workshop can't be created inside another.`;
    case appErrorCodes.AlreadyExists:
      return `${parent}/${name} already exists. Choose another name.`;
    default:
      return error.message;
  }
}
