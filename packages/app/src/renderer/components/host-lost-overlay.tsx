import { Button } from "@/components/ui/button.tsx";

interface HostLostOverlayProps {
  readonly onRestart: () => void;
}

export function HostLostOverlay({ onRestart }: HostLostOverlayProps) {
  return (
    <div className="bg-background/95 fixed inset-0 z-50 flex flex-col items-center justify-center gap-4">
      <p className="text-foreground text-sm">Connection to the host was lost.</p>
      <Button onClick={onRestart}>Restart</Button>
    </div>
  );
}
