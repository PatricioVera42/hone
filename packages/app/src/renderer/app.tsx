import { useEffect, useState } from "react";
import { HostLostOverlay } from "./components/host-lost-overlay.tsx";
import { Toaster } from "./components/ui/toast.tsx";
import { WorkshopSwitcher } from "./components/workshop-switcher.tsx";
import { HostClient } from "./host-client.ts";
import { OpenFiles } from "./open-file.ts";

type HostState =
  | { readonly status: "connecting" }
  | { readonly status: "connected"; readonly client: HostClient }
  | { readonly status: "lost" };

export function App() {
  const [hostState, setHostState] = useState<HostState>({ status: "connecting" });
  const [openFiles] = useState(() => new OpenFiles());

  useEffect(() => window.hone.onFlushSaves(() => openFiles.flush()), [openFiles]);

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
        <WorkshopSwitcher client={hostState.client} openFiles={openFiles} />
      )}
      {hostState.status === "lost" && (
        <HostLostOverlay onRestart={() => void window.hone.restartHost()} />
      )}
    </>
  );
}
