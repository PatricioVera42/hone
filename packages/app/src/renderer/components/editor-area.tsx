import {
  DockviewDefaultTab,
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewPanelApi,
  type DockviewReadyEvent,
  type IDockviewPanel,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type SerializedDockview,
} from "dockview-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  editorPanelParamsSchema,
  isRestorableLayout,
  terminalPanelParamsSchema,
  type EditorPanelParams,
  type TerminalPanelParams,
} from "@/editor-layout.ts";
import { entryName, isAtOrInside, renamedPath } from "@/entry-path.ts";
import type { HostClient } from "@/host-client.ts";
import type { LayoutSaver } from "@/layout-saver.ts";
import type { OpenFiles } from "@/open-file.ts";
import { reportError } from "@/report-error.ts";
import { EditorPanel } from "./editor-panel.tsx";
import { TerminalPanel } from "./terminal-panel.tsx";

/** The protocol path of the file a panel shows, from its parameters. */
function panelPath(panel: IDockviewPanel): string | undefined {
  return editorPanelParamsSchema.safeParse(panel.params).data?.path;
}

function isTerminal(panel: IDockviewPanel): boolean {
  return terminalPanelParamsSchema.safeParse(panel.params).success;
}

/** What closing each open editor's tab must run first, by panel id. Each resolves with whether the tab may close. */
type TabCloseGuards = Map<string, () => Promise<boolean>>;

/** Closes a tab, unless it's an editor whose pending edits couldn't be saved: that one stays open with them. */
async function closeTab(tabCloseGuards: TabCloseGuards, panel: DockviewPanelApi): Promise<void> {
  const guard = tabCloseGuards.get(panel.id);
  if (guard === undefined) {
    panel.close();
    return;
  }
  // Unless the tab closed in the meantime, such as when its file was deleted during the save.
  if ((await guard()) && tabCloseGuards.get(panel.id) === guard) panel.close();
}

interface EditorAreaContextValue {
  readonly client: HostClient;
  readonly workshopName: string;
  readonly openFiles: OpenFiles;
  readonly tabCloseGuards: TabCloseGuards;
  readonly openFile: (path: string) => void;
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
      workshopName={context.workshopName}
      openFiles={context.openFiles}
      path={params.path}
      onOpenFile={context.openFile}
      onDeleted={() => api.close()}
      registerTabCloseGuard={(guard) => {
        context.tabCloseGuards.set(api.id, guard);
        return () => context.tabCloseGuards.delete(api.id);
      }}
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
      isActive={() => api.isActive}
      onExit={() => api.close()}
    />
  );
}

const components = { editor: EditorPanelFromLayout, terminal: TerminalPanelFromLayout };

/** Dockview's tab, whose close button and middle click go through {@link closeTab}. */
function Tab(props: IDockviewPanelHeaderProps) {
  const context = useContext(EditorAreaContext);
  if (context === undefined) throw new Error("A tab was rendered outside the editor area");
  return (
    <DockviewDefaultTab
      {...props}
      closeActionOverride={() => void closeTab(context.tabCloseGuards, props.api)}
    />
  );
}

/** Opens a file in the active group, or focuses its tab if it's already open anywhere. */
function openEditorTab(editors: DockviewApi, path: string): void {
  const existing = editors.panels.find((panel) => panelPath(panel) === path);
  if (existing !== undefined) {
    existing.api.setActive();
    return;
  }
  const params: EditorPanelParams = { path };
  // Not the path, which a rename changes while a panel's id stays.
  const id = crypto.randomUUID();
  editors.addPanel({ id, component: "editor", title: entryName(path), params });
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
): IDockviewPanel {
  const params: TerminalPanelParams = { cwd };
  return editors.addPanel({
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
    panel.api.setTitle(entryName(renamed));
  }
}

/** Closes the tabs of the deleted entry at `path`, or of files inside it. */
export function closeEditorTabs(editors: DockviewApi, path: string): void {
  for (const panel of editors.panels) {
    const shown = panelPath(panel);
    if (shown !== undefined && isAtOrInside(shown, path)) panel.api.close();
  }
}

// The share of the height the terminal at the bottom takes in the default layout.
const defaultTerminalHeightShare = 0.3;

/** An empty group for editors, with a terminal at the workshop root below it. */
function showDefaultLayout(editors: DockviewApi, workshopName: string): void {
  const editorGroup = editors.addGroup();
  const terminal = openTerminalTab(editors, "", workshopName, undefined);
  terminal.group.api.setSize({ height: editors.height * defaultTerminalHeightShare });
  // So files open above the terminal, not next to it.
  editorGroup.api.setActive();
}

/** Restores a saved layout, or shows the default one when there's none or dockview can't read it. */
function showLayout(
  editors: DockviewApi,
  saved: SerializedDockview | undefined,
  workshopName: string,
): void {
  if (saved !== undefined) {
    try {
      editors.fromJSON(saved);
      return;
    } catch {
      // A layout that validated but is broken deeper down, in the grid, falls back to the default.
      editors.clear();
    }
  }
  showDefaultLayout(editors, workshopName);
}

type LayoutLoad =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly saved: SerializedDockview | undefined };

/** The editor area, once ready, for acting on its tabs from outside. */
export interface Editors {
  readonly api: DockviewApi;
  /** Opens the file at `path` in a tab, or focuses its tab if it's already open anywhere. */
  openFile(path: string): void;
  /** Opens a terminal in the folder at `cwd`, titled `title`, where Ctrl+` would open one. */
  openTerminal(cwd: string, title: string): void;
}

interface EditorAreaProps {
  readonly client: HostClient;
  /** The workshop's root, which its layout is saved under. */
  readonly workshopRoot: string;
  /** Titles a terminal at the workshop root. */
  readonly workshopName: string;
  readonly openFiles: OpenFiles;
  readonly layouts: LayoutSaver;
  readonly onReady: (editors: Editors) => void;
}

/**
 * The dockview layout that holds editor and terminal tabs. It opens with the workshop's saved layout, or with an
 * empty editor group above a terminal at the workshop root, and saves the layout as it changes. Before the host
 * switches workshops, `layouts` must be paused: what changes after that is dropped. Ctrl+W closes the active tab.
 * Ctrl+`, even inside a terminal, opens a terminal at the workshop root, in the group of the last terminal that was
 * active, or else in a new group at the bottom.
 */
export function EditorArea({
  client,
  workshopRoot,
  workshopName,
  openFiles,
  layouts,
  onReady,
}: EditorAreaProps) {
  const [layoutLoad, setLayoutLoad] = useState<LayoutLoad>({ status: "loading" });
  const [editors, setEditors] = useState<DockviewApi>();
  const [tabCloseGuards] = useState<TabCloseGuards>(() => new Map());
  // Set in handleReady, ahead of the render that sets `editors`, so a shortcut pressed in between still finds them.
  const readyEditors = useRef<DockviewApi>(undefined);
  const context = useMemo(
    () => ({
      client,
      workshopName,
      openFiles,
      tabCloseGuards,
      openFile: (path: string) => {
        if (readyEditors.current !== undefined) openEditorTab(readyEditors.current, path);
      },
    }),
    [client, workshopName, openFiles, tabCloseGuards],
  );
  const lastTerminal = useRef<IDockviewPanel>(undefined);

  useEffect(() => {
    let cancelled = false;
    void window.hone
      .loadLayout(workshopRoot)
      .catch((error: unknown) => {
        // Opens with the default layout, so a failure never leaves the editor area blank.
        reportError(error);
        return undefined;
      })
      .then((saved) => {
        if (cancelled) return;
        setLayoutLoad({ status: "loaded", saved: isRestorableLayout(saved) ? saved : undefined });
      });
    return () => {
      cancelled = true;
    };
  }, [workshopRoot]);

  useEffect(() => {
    if (editors === undefined) return undefined;
    const changed = editors.onDidLayoutChange(() => {
      layouts.changed(workshopRoot, editors.toJSON());
    });
    return () => changed.dispose();
  }, [editors, layouts, workshopRoot]);

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
      if (readyEditors.current !== undefined) {
        openTerminalTab(readyEditors.current, "", workshopName, lastTerminal.current?.group);
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [workshopName]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.ctrlKey || event.shiftKey || event.altKey || event.key.toLowerCase() !== "w") {
        return;
      }
      event.preventDefault();
      const panel = readyEditors.current?.activePanel;
      if (panel !== undefined) void closeTab(tabCloseGuards, panel.api);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tabCloseGuards]);

  function handleReady(event: DockviewReadyEvent): void {
    const { api } = event;
    if (layoutLoad.status === "loaded") showLayout(api, layoutLoad.saved, workshopName);
    // Shown before the effect that tracks the last active terminal starts, so Ctrl+` joins one from the layout.
    lastTerminal.current = api.panels.find(isTerminal);
    readyEditors.current = api;
    setEditors(api);
    onReady({
      api,
      openFile: context.openFile,
      openTerminal: (cwd, title) => {
        openTerminalTab(api, cwd, title, lastTerminal.current?.group);
      },
    });
  }

  // Dockview starts once the saved layout is in, so it never shows the default layout first.
  if (layoutLoad.status === "loading") return null;

  return (
    <EditorAreaContext value={context}>
      {/* Scopes the theme overrides in index.css, which map dockview's variables onto shadcn's. */}
      <div className="hone-editor-area h-full">
        <DockviewReact
          components={components}
          defaultTabComponent={Tab}
          theme={themeLight}
          onReady={handleReady}
        />
      </div>
    </EditorAreaContext>
  );
}
