import {
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanel,
  type IDockviewPanelProps,
} from "dockview-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { isAtOrInside, renamedPath } from "@/entry-path.ts";
import type { HostClient } from "@/host-client.ts";
import type { OpenFiles } from "@/open-file.ts";
import { EditorPanel } from "./editor-panel.tsx";
import { TerminalPanel } from "./terminal-panel.tsx";

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

const terminalPanelParamsSchema = z.object({
  /** The folder the terminal's shell started in, as a protocol path relative to the workshop root. */
  cwd: z.string(),
});

/** A terminal panel's parameters in the layout. */
type TerminalPanelParams = z.infer<typeof terminalPanelParamsSchema>;

function isTerminal(panel: IDockviewPanel): boolean {
  return terminalPanelParamsSchema.safeParse(panel.params).success;
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

function TerminalPanelFromLayout({ api, params }: IDockviewPanelProps<TerminalPanelParams>) {
  const context = useContext(EditorAreaContext);
  if (context === undefined)
    throw new Error("A terminal panel was rendered outside the editor area");
  return (
    <TerminalPanel
      client={context.client}
      cwd={params.cwd}
      label={`Terminal in ${api.title ?? params.cwd}`}
      onExit={() => api.close()}
    />
  );
}

const components = { editor: EditorPanelFromLayout, terminal: TerminalPanelFromLayout };

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

/**
 * Opens a terminal in the folder at `cwd`, titled `title`, in `group` when given, or else in a new group at the
 * bottom.
 */
function openTerminalTab(
  editors: DockviewApi,
  cwd: string,
  title: string,
  group: IDockviewPanel["group"] | undefined,
): void {
  const params: TerminalPanelParams = { cwd };
  editors.addPanel({
    id: crypto.randomUUID(),
    component: "terminal",
    title,
    params,
    // Kept in the page while hidden, so xterm doesn't lose its size and scroll position.
    renderer: "always",
    position: group === undefined ? { direction: "below" } : { referenceGroup: group },
  });
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
  /** Titles a terminal at the workshop root. */
  readonly workshopName: string;
  readonly openFiles: OpenFiles;
  readonly onReady: (editors: DockviewApi) => void;
}

/**
 * The dockview layout that holds editor and terminal tabs. Ctrl+W closes the active tab. Ctrl+`, even inside a
 * terminal, opens a terminal at the workshop root, in the group of the last terminal that was active, or else in a
 * new group at the bottom.
 */
export function EditorArea({ client, workshopName, openFiles, onReady }: EditorAreaProps) {
  const [editors, setEditors] = useState<DockviewApi>();
  const context = useMemo(() => ({ client, openFiles }), [client, openFiles]);
  const lastTerminal = useRef<IDockviewPanel>(undefined);

  useEffect(() => {
    if (editors === undefined) return undefined;
    const activated = editors.onDidActivePanelChange(({ panel }) => {
      if (panel !== undefined && isTerminal(panel)) lastTerminal.current = panel;
    });
    const removed = editors.onDidRemovePanel((panel) => {
      if (panel === lastTerminal.current) lastTerminal.current = undefined;
    });
    return () => {
      activated.dispose();
      removed.dispose();
    };
  }, [editors]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.ctrlKey || event.shiftKey || event.altKey || event.code !== "Backquote") return;
      // Before xterm sees it, which would type it into the shell.
      event.preventDefault();
      event.stopPropagation();
      if (editors !== undefined)
        openTerminalTab(editors, "", workshopName, lastTerminal.current?.group);
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [editors, workshopName]);

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
