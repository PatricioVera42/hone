import { appErrorCodes, workshopOpenMethod, type WorkshopInfo } from "@hone/protocol";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/toast.tsx";
import { HostCallError, type HostClient } from "@/host-client.ts";
import type { LayoutSaver } from "@/layout-saver.ts";
import type { OpenFiles } from "@/open-file.ts";
import { reportError } from "@/report-error.ts";
import { CreateWorkshopDialog } from "./create-workshop-dialog.tsx";
import { NotAWorkshopDialog } from "./not-a-workshop-dialog.tsx";
import { WelcomeScreen } from "./welcome-screen.tsx";
import { WorkshopScreen } from "./workshop-screen.tsx";

interface WorkshopSwitcherProps {
  readonly client: HostClient;
  readonly openFiles: OpenFiles;
  readonly layouts: LayoutSaver;
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

/** What `promise` resolves to, or `undefined` once it fails, after reporting why. */
function undefinedOnFailure<T>(promise: Promise<T>): Promise<T | undefined> {
  return promise.catch((error: unknown) => {
    reportError(error);
    return undefined;
  });
}

/**
 * Holds the open workshop, if any, and opens or creates another in its place, saving pending edits and pausing
 * layout saves before the host switches: once it has, a late save would land on the same path in the other
 * workshop, and the layout loses its terminals as the host kills their shells. Layout saves resume once the
 * workshop shown has changed, or the switch didn't happen.
 */
export function WorkshopSwitcher({ client, openFiles, layouts }: WorkshopSwitcherProps) {
  const [restoring, setRestoring] = useState(true);
  const [workshop, setWorkshop] = useState<WorkshopInfo>();
  // Kept here, above the workshop screen, so going to the welcome screen and back doesn't lose it.
  const [sidebarWidth, setSidebarWidth] = useState<number>();
  const [notAWorkshopFolder, setNotAWorkshopFolder] = useState<string>();
  const [createDialog, setCreateDialog] = useState<CreateDialogState>(closedCreateDialog);

  // After the children's effects, so the old workshop's editor area has stopped reporting layout changes.
  useEffect(() => layouts.resume(), [layouts, workshop]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      // Falls back to the welcome screen, so an unexpected failure never leaves the window blank.
      undefinedOnFailure(reopenLastWorkshop(client)),
      // Falls back to the default width, and each failure leaves the other result alone.
      undefinedOnFailure(window.hone.getSidebarWidth()),
    ]).then(([reopened, savedWidth]) => {
      if (cancelled) return;
      setSidebarWidth(savedWidth);
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
    await openFiles.flush();
    // A save failed and its error toast is showing; switching would drop those edits.
    if (openFiles.hasPendingEdits()) return;
    await layouts.pause();
    try {
      show(await client.call(workshopOpenMethod, { path: folder }));
    } catch (error) {
      layouts.resume();
      if (!isNotAWorkshop(error)) throw error;
      setNotAWorkshopFolder(folder);
    }
  }

  function showCreateDialog(initialParent: string | undefined): void {
    // The dialog is modal, so no edit or layout change can happen between these saves and the host switching
    // workshops.
    void openFiles.flush();
    void layouts.pause();
    setCreateDialog({ open: true, initialParent });
  }

  function createWorkshop(): void {
    showCreateDialog(undefined);
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
          client={client}
          workshop={workshop}
          openFiles={openFiles}
          layouts={layouts}
          sidebarWidth={sidebarWidth}
          onSidebarWidthChange={(width) => {
            setSidebarWidth(width);
            window.hone.setSidebarWidth(width).catch(reportError);
          }}
          onOpenWorkshop={() => void openWorkshop().catch(reportError)}
          onCreateWorkshop={createWorkshop}
        />
      )}
      <NotAWorkshopDialog
        folder={notAWorkshopFolder}
        onClose={() => setNotAWorkshopFolder(undefined)}
        onCreateWorkshop={() => {
          setNotAWorkshopFolder(undefined);
          showCreateDialog(notAWorkshopFolder);
        }}
      />
      <CreateWorkshopDialog
        client={client}
        open={createDialog.open}
        initialParent={createDialog.initialParent}
        onOpenChange={(open) => {
          if (!open) layouts.resume();
          setCreateDialog({ ...createDialog, open });
        }}
        onCreated={(created) => {
          setCreateDialog(closedCreateDialog);
          show(created);
        }}
      />
    </>
  );
}
