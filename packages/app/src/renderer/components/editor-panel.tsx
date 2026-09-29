import { appErrorCodes, filesReadMethod } from "@hone/protocol";
import { useEffect, useState } from "react";
import { HostCallError, type HostClient } from "@/host-client.ts";
import { reportError } from "@/report-error.ts";
import { CodeEditor } from "./code-editor.tsx";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly content: string }
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
  /** The file's protocol path, relative to the workshop root. */
  readonly path: string;
}

/** One editor tab's content: the file in a read-only editor, or a message when it can't be shown. */
export function EditorPanel({ client, path }: EditorPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    client
      .call(filesReadMethod, { path })
      .then(({ content }) => {
        if (!cancelled) setState({ status: "loaded", content });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "unopenable", message: unopenableMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [client, path]);

  if (state.status === "loading") return null;
  if (state.status === "unopenable") {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {state.message}
      </div>
    );
  }
  return <CodeEditor path={path} content={state.content} />;
}
