import { useEffect, useState } from "react";
import { HostLostOverlay } from "./components/host-lost-overlay.tsx";
import { Toaster } from "./components/ui/toast.tsx";
import { WelcomeScreen } from "./components/welcome-screen.tsx";
import { HostClient } from "./host-client.ts";

export function App() {
  const [hostLost, setHostLost] = useState(false);

  useEffect(() => {
    const client = new HostClient(window.hone.getHostConnection());
    return client.onClose(() => setHostLost(true));
  }, []);

  return (
    <>
      <Toaster />
      <WelcomeScreen />
      {hostLost && <HostLostOverlay onRestart={() => void window.hone.restartHost()} />}
    </>
  );
}
