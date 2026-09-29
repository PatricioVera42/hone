import {
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanel,
  type IDockviewPanelProps,
} from "dockview-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { isAtOrInside, renamedPath } from "@/entry-path.ts";
import type { HostClient } from "@/host-client.ts";
import type { OpenFiles } from "@/open-file.ts";
import { EditorPanel } from "./editor-panel.tsx";

const editorPanelParamsSchema = z.object({
  /** The file's protocol path, relative to the workshop root. It changes when the file or a folder above it is renamed. */
  path: z.string(),
});

/** An editor panel's parameters in the layout, which is what gets saved when the layout is. */
type EditorPanelParams = z.infer<typeof editorPanelParamsSchema>;

/** The protocol path of the file a panel shows, from its parameters. */
function panelPath(panel: IDockviewPanel): string | undefined {
  return editorPanelParamsSchema.safeParse(panel.params).data?.path;
}

interface EditorAreaContextValue {
  readonly client: HostClient;
  readonly openFiles: OpenFiles;
}

// Panels are built by dockview from a component name, so what they share reaches them through context, not params.
const EditorAreaContext = createContext<EditorAreaContextValue | undefined>(undefined);

function EditorPanelFromLayout({ api, params }: IDockviewPanelProps<EditorPanelParams>) {
  const context = useContext(EditorAreaContext);
  if (context === undefined)
    throw new Error("An editor panel was rendered outside the editor area");
  return (
    <EditorPanel
      client={context.client}
      openFiles={context.openFiles}
      path={params.path}
      onDeleted={() => api.close()}
    />
  );
}

const components = { editor: EditorPanelFromLayout };

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Opens a file in the active group, or focuses its tab if it's already open anywhere. */
export function openEditorTab(editors: DockviewApi, path: string): void {
  const existing = editors.panels.find((panel) => panelPath(panel) === path);
  if (existing !== undefined) {
    existing.api.setActive();
    return;
  }
  const params: EditorPanelParams = { path };
  // Not the path, which a rename changes while a panel's id stays.
  const id = crypto.randomUUID();
  editors.addPanel({ id, component: "editor", title: fileName(path), params });
}

/** Points the tabs of the entry renamed from `from`, or of files inside it, at their new paths. */
export function renameEditorTabs(editors: DockviewApi, from: string, to: string): void {
  for (const panel of editors.panels) {
    const path = panelPath(panel);
    const renamed = path === undefined ? undefined : renamedPath(path, from, to);
    if (renamed === undefined) continue;
    const params: EditorPanelParams = { path: renamed };
    panel.api.updateParameters(params);
    panel.api.setTitle(fileName(renamed));
  }
}

/** Closes the tabs of the deleted entry at `path`, or of files inside it. */
export function closeEditorTabs(editors: DockviewApi, path: string): void {
  for (const panel of editors.panels) {
    const shown = panelPath(panel);
    if (shown !== undefined && isAtOrInside(shown, path)) panel.api.close();
  }
}

interface EditorAreaProps {
  readonly client: HostClient;
  readonly openFiles: OpenFiles;
  readonly onReady: (editors: DockviewApi) => void;
}

/** The dockview layout that holds editor tabs. Ctrl+W closes the active tab. */
export function EditorArea({ client, openFiles, onReady }: EditorAreaProps) {
  const [editors, setEditors] = useState<DockviewApi>();
  const context = useMemo(() => ({ client, openFiles }), [client, openFiles]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.ctrlKey || event.shiftKey || event.altKey || event.key.toLowerCase() !== "w") {
        return;
      }
      event.preventDefault();
      editors?.activePanel?.api.close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editors]);

  function handleReady(event: DockviewReadyEvent): void {
    setEditors(event.api);
    onReady(event.api);
  }

  return (
    <EditorAreaContext value={context}>
      {/* Scopes the theme overrides in index.css, which map dockview's variables onto shadcn's. */}
      <div className="hone-editor-area h-full">
        <DockviewReact components={components} theme={themeLight} onReady={handleReady} />
      </div>
    </EditorAreaContext>
  );
}
