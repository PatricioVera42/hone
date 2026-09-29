import { Button } from "@/components/ui/button.tsx";

interface WelcomeScreenProps {
  readonly onOpenWorkshop: () => void;
  readonly onCreateWorkshop: () => void;
}

export function WelcomeScreen({ onOpenWorkshop, onCreateWorkshop }: WelcomeScreenProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-lg font-medium">Hone</h1>
      <div className="flex gap-2">
        <Button onClick={onOpenWorkshop}>Open workshop</Button>
        <Button variant="outline" onClick={onCreateWorkshop}>
          Create workshop
        </Button>
      </div>
    </div>
  );
}
