import { useEffect, useState } from "react";
import { HostLostOverlay } from "./components/host-lost-overlay.tsx";
import { Toaster } from "./components/ui/toast.tsx";
import { WorkshopSwitcher } from "./components/workshop-switcher.tsx";
import { HostClient } from "./host-client.ts";
import { LayoutSaver } from "./layout-saver.ts";
import { OpenFiles } from "./open-file.ts";
import { reportError } from "./report-error.ts";

type HostState =
  | { readonly status: "connecting" }
  | { readonly status: "connected"; readonly client: HostClient }
  | { readonly status: "lost" };

export function App() {
  const [hostState, setHostState] = useState<HostState>({ status: "connecting" });
  const [openFiles] = useState(() => new OpenFiles());
  const [layouts] = useState(
    () =>
      new LayoutSaver((root, layout) => window.hone.saveLayout(root, layout).catch(reportError)),
  );

  useEffect(
    () =>
      window.hone.onFlushSaves(async () => {
        await Promise.all([openFiles.flush(), layouts.flush()]);
        return openFiles.hasPendingEdits();
      }),
    [openFiles, layouts],
  );

  useEffect(() => {
    const client = new HostClient(window.hone.getHostConnection());
    const unsubscribeOpen = client.onOpen(() => setHostState({ status: "connected", client }));
    const unsubscribeClose = client.onClose(() => setHostState({ status: "lost" }));
    return () => {
      unsubscribeOpen();
      unsubscribeClose();
      client.close();
    };
  }, []);

  return (
    <>
      <Toaster />
      {hostState.status === "connected" && (
        <WorkshopSwitcher client={hostState.client} openFiles={openFiles} layouts={layouts} />
      )}
      {hostState.status === "lost" && (
        <HostLostOverlay onRestart={() => void window.hone.restartHost()} />
      )}
    </>
  );
}
