import {
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import { createContext, useContext, useEffect, useState } from "react";
import type { HostClient } from "@/host-client.ts";
import { EditorPanel } from "./editor-panel.tsx";

/** An editor panel's parameters in the layout, which is what gets saved when the layout is. */
interface EditorPanelParams {
  /** The file's protocol path, relative to the workshop root. */
  readonly path: string;
}

// Panels are built by dockview from a component name, so the client reaches them through context, not params.
const HostClientContext = createContext<HostClient | undefined>(undefined);

function EditorPanelFromLayout({ params }: IDockviewPanelProps<EditorPanelParams>) {
  const client = useContext(HostClientContext);
  if (client === undefined) throw new Error("An editor panel was rendered outside the editor area");
  return <EditorPanel client={client} path={params.path} />;
}

const components = { editor: EditorPanelFromLayout };

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Opens a file in the active group, or focuses its tab if it's already open anywhere. */
export function openEditorTab(editors: DockviewApi, path: string): void {
  // A file's path is its panel's id, which is what keeps it to one tab.
  const existing = editors.getPanel(path);
  if (existing !== undefined) {
    existing.api.setActive();
    return;
  }
  const params: EditorPanelParams = { path };
  editors.addPanel({ id: path, component: "editor", title: fileName(path), params });
}

interface EditorAreaProps {
  readonly client: HostClient;
  readonly onReady: (editors: DockviewApi) => void;
}

/** The dockview layout that holds editor tabs. Ctrl+W closes the active tab. */
export function EditorArea({ client, onReady }: EditorAreaProps) {
  const [editors, setEditors] = useState<DockviewApi>();

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
    <HostClientContext value={client}>
      {/* Scopes the theme overrides in index.css, which map dockview's variables onto shadcn's. */}
      <div className="hone-editor-area h-full">
        <DockviewReact components={components} theme={themeLight} onReady={handleReady} />
      </div>
    </HostClientContext>
  );
}
