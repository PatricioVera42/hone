import { Button } from "@/components/ui/button.tsx";

export function WelcomeScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-lg font-medium">Hone</h1>
      <div className="flex gap-2">
        <Button>Open workshop</Button>
        <Button variant="outline">Create workshop</Button>
      </div>
    </div>
  );
}
