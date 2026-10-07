import { appErrorCodes, filesChangedNotification, filesReadMethod } from "@hone/protocol";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "@/components/ui/toast.tsx";
import { HostCallError, type HostClient } from "@/host-client.ts";
import { OpenFile, type EditorContent, type OpenFiles } from "@/open-file.ts";
import { reportError } from "@/report-error.ts";
import { EditorBreadcrumbs } from "./editor-breadcrumbs.tsx";
import { CodeEditor, type EditorConnection } from "./code-editor.tsx";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly content: string; readonly version: string }
  | { readonly status: "unopenable"; readonly message: string };

/** What to tell the user about a file that can't be shown in an editor. */
function unopenableMessage(error: unknown): string {
  if (error instanceof HostCallError && error.code === appErrorCodes.NotText) {
    return "This file can't be opened in Hone.";
  }
  if (error instanceof HostCallError && error.code === appErrorCodes.TooLarge) {
    return "This file is too large to open in Hone. The limit is 5 MB.";
  }
  // Anything else is unexpected, so it gets a toast too.
  reportError(error);
  return "This file couldn't be opened.";
}

interface EditorPanelProps {
  readonly client: HostClient;
  /** Shown first in the breadcrumbs, for the workshop's root. */
  readonly workshopName: string;
  readonly openFiles: OpenFiles;
  /** The file's protocol path, relative to the workshop root. A rename changes it while the tab stays open. */
  readonly path: string;
  /** Opens a file from the breadcrumbs' menus, the way the file tree does. */
  readonly onOpenFile: (path: string) => void;
  /** Closes the panel's tab, for when the file is deleted, or was already gone when the tab opened. */
  readonly onDeleted: () => void;
  /**
   * Called once the editor is up with what closing its tab must run first, which resolves with whether the tab may
   * close. Returns a function that unregisters it.
   */
  readonly registerTabCloseGuard: (guard: () => Promise<boolean>) => () => void;
}

/**
 * One editor tab's content: the file in an editor that saves itself and follows changes on disk, or a message when
 * it can't be shown. A file that's gone, such as one deleted since its tab was saved in the layout, closes the tab
 * without a message.
 */
export function EditorPanel({
  client,
  workshopName,
  openFiles,
  path,
  onOpenFile,
  onDeleted,
  registerTabCloseGuard,
}: EditorPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  // Read once, from where the file was when its tab opened: a rename moves the open file along instead.
  const [openedPath] = useState(path);
  const fileMissingEvent = useEffectEvent(onDeleted);

  useEffect(() => {
    let cancelled = false;
    client
      .call(filesReadMethod, { path: openedPath })
      .then(({ content, version }) => {
        if (!cancelled) setState({ status: "loaded", content, version });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof HostCallError && error.code === appErrorCodes.NotFound) {
          fileMissingEvent();
          return;
        }
        setState({ status: "unopenable", message: unopenableMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [client, openedPath]);

  if (state.status === "loading") return null;
  if (state.status === "unopenable") {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {state.message}
      </div>
    );
  }
  const { version } = state;
  function connect(editor: EditorContent): EditorConnection {
    const file = new OpenFile({
      client,
      path: openedPath,
      version,
      editor,
      onDeleted,
      onEditsDiscarded: (name) => {
        toast.add({
          type: "warning",
          title: `${name} changed on disk; your latest edits were discarded.`,
        });
      },
    });
    const unsubscribe = client.onNotification(filesChangedNotification, (change) => {
      file.receive(change);
    });
    const untrack = openFiles.add(file);
    // Closing the tab saves its pending edits first, and keeps it open if that fails.
    const unregister = registerTabCloseGuard(() => file.closeIfSaved());
    return {
      edited: () => file.edited(),
      disconnect: () => {
        unsubscribe();
        unregister();
        // Usually there's nothing left to save by now. Tracked until the save is done, so a workshop switch or the
        // window closing right after waits for it.
        void file.disconnect().then(untrack);
      },
    };
  }
  return (
    <div className="flex h-full flex-col">
      <EditorBreadcrumbs
        client={client}
        workshopName={workshopName}
        path={path}
        onOpenFile={onOpenFile}
      />
      <div className="min-h-0 flex-1">
        <CodeEditor path={path} content={state.content} connect={connect} />
      </div>
    </div>
  );
}
