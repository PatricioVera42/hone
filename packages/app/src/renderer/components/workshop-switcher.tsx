import { appErrorCodes, workshopOpenMethod, type WorkshopInfo } from "@hone/protocol";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/toast.tsx";
import { HostCallError, type HostClient } from "@/host-client.ts";
import { reportError } from "@/report-error.ts";
import { CreateWorkshopDialog } from "./create-workshop-dialog.tsx";
import { NotAWorkshopDialog } from "./not-a-workshop-dialog.tsx";
import { WelcomeScreen } from "./welcome-screen.tsx";
import { WorkshopScreen } from "./workshop-screen.tsx";

interface WorkshopSwitcherProps {
  readonly client: HostClient;
}

interface CreateDialogState {
  readonly open: boolean;
  readonly initialParent: string | undefined;
}

const closedCreateDialog: CreateDialogState = { open: false, initialParent: undefined };

function isNotAWorkshop(error: unknown): boolean {
  return error instanceof HostCallError && error.code === appErrorCodes.NotAWorkshop;
}

/** The host can't watch files on the Windows disk from WSL, so changes made outside Hone go unnoticed there. */
function warnIfOnWindowsDisk(workshop: WorkshopInfo): void {
  if (!workshop.onWindowsDisk) return;
  toast.add({
    type: "warning",
    title: "This workshop is on the Windows disk",
    description:
      "Changes made outside Hone, such as by an agent in a terminal, won't show up. Move the workshop to the WSL disk to fix this.",
    // Stays until dismissed: the user can keep working, but shouldn't miss why the tree goes stale.
    timeout: 0,
  });
}

/** Reopens the last workshop. `undefined` if there is none, or it was deleted or is no longer a workshop. */
async function reopenLastWorkshop(client: HostClient): Promise<WorkshopInfo | undefined> {
  const root = await window.hone.getLastWorkshop();
  if (root === undefined) return undefined;
  try {
    const reopened = await client.call(workshopOpenMethod, { path: root });
    // Walking up from a folder that stopped being a workshop could find another one above it.
    return reopened.root === root ? reopened : undefined;
  } catch (error) {
    if (!isNotAWorkshop(error)) throw error;
    return undefined;
  }
}

/** Holds the open workshop, if any, and opens or creates another in its place. */
export function WorkshopSwitcher({ client }: WorkshopSwitcherProps) {
  const [restoring, setRestoring] = useState(true);
  const [workshop, setWorkshop] = useState<WorkshopInfo>();
  const [notAWorkshopFolder, setNotAWorkshopFolder] = useState<string>();
  const [createDialog, setCreateDialog] = useState<CreateDialogState>(closedCreateDialog);

  useEffect(() => {
    let cancelled = false;
    void reopenLastWorkshop(client)
      .catch((error: unknown) => {
        // Falls back to the welcome screen, so an unexpected failure never leaves the window blank.
        reportError(error);
        return undefined;
      })
      .then((reopened) => {
        if (cancelled) return;
        if (reopened !== undefined) warnIfOnWindowsDisk(reopened);
        setWorkshop(reopened);
        setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  function show(opened: WorkshopInfo): void {
    setWorkshop(opened);
    warnIfOnWindowsDisk(opened);
    void window.hone.setLastWorkshop(opened.root);
  }

  async function openWorkshop(): Promise<void> {
    const folder = await window.hone.pickFolder();
    if (folder === undefined) return;
    try {
      show(await client.call(workshopOpenMethod, { path: folder }));
    } catch (error) {
      if (!isNotAWorkshop(error)) throw error;
      setNotAWorkshopFolder(folder);
    }
  }

  function createWorkshop(): void {
    setCreateDialog({ open: true, initialParent: undefined });
  }

  // Render nothing until the last workshop is back, so the welcome screen doesn't flash first.
  if (restoring) return null;

  return (
    <>
      {workshop === undefined ? (
        <WelcomeScreen
          onOpenWorkshop={() => void openWorkshop().catch(reportError)}
          onCreateWorkshop={createWorkshop}
        />
      ) : (
        <WorkshopScreen
          workshop={workshop}
          onOpenWorkshop={() => void openWorkshop().catch(reportError)}
          onCreateWorkshop={createWorkshop}
        />
      )}
      <NotAWorkshopDialog
        folder={notAWorkshopFolder}
        onClose={() => setNotAWorkshopFolder(undefined)}
        onCreateWorkshop={() => {
          setNotAWorkshopFolder(undefined);
          setCreateDialog({ open: true, initialParent: notAWorkshopFolder });
        }}
      />
      <CreateWorkshopDialog
        client={client}
        open={createDialog.open}
        initialParent={createDialog.initialParent}
        onOpenChange={(open) => setCreateDialog({ ...createDialog, open })}
        onCreated={(created) => {
          setCreateDialog(closedCreateDialog);
          show(created);
        }}
      />
    </>
  );
}
