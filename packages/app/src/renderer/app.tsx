import { useEffect, useState } from "react";
import { HostLostOverlay } from "./components/host-lost-overlay.tsx";
import { Toaster } from "./components/ui/toast.tsx";
import { WelcomeScreen } from "./components/welcome-screen.tsx";
import { HostClient } from "./host-client.ts";

type HostState = "connecting" | "connected" | "lost";

export function App() {
  const [hostState, setHostState] = useState<HostState>("connecting");

  useEffect(() => {
    const client = new HostClient(window.hone.getHostConnection());
    const unsubscribeOpen = client.onOpen(() => setHostState("connected"));
    const unsubscribeClose = client.onClose(() => setHostState("lost"));
    return () => {
      unsubscribeOpen();
      unsubscribeClose();
      client.close();
    };
  }, []);

  return (
    <>
      <Toaster />
      {hostState === "connected" && <WelcomeScreen />}
      {hostState === "lost" && <HostLostOverlay onRestart={() => void window.hone.restartHost()} />}
    </>
  );
}
