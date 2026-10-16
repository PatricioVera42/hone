import { Button } from "@/components/ui/button.tsx";
import type { RecentWorkshop } from "./workshop-switcher.tsx";

interface WelcomeScreenProps {
  readonly recentWorkshops: readonly RecentWorkshop[];
  readonly onOpenRecentWorkshop: (recent: RecentWorkshop) => void;
  readonly onOpenWorkshop: () => void;
  readonly onCreateWorkshop: () => void;
}

export function WelcomeScreen({
  recentWorkshops,
  onOpenRecentWorkshop,
  onOpenWorkshop,
  onCreateWorkshop,
}: WelcomeScreenProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-lg font-medium">Hone</h1>
      <div className="flex gap-2">
        <Button onClick={onOpenWorkshop}>Open workshop</Button>
        <Button variant="outline" onClick={onCreateWorkshop}>
          Create workshop
        </Button>
      </div>
      {recentWorkshops.length > 0 && (
        <section
          aria-labelledby="recent-workshops"
          className="flex w-64 flex-col items-center gap-1"
        >
          <h2 id="recent-workshops" className="text-xs text-muted-foreground">
            Recent workshops
          </h2>
          {recentWorkshops.map((recent) => (
            <Button
              key={recent.root}
              variant="ghost"
              size="sm"
              title={recent.root}
              onClick={() => onOpenRecentWorkshop(recent)}
            >
              <span className="truncate">{recent.name}</span>
            </Button>
          ))}
        </section>
      )}
    </div>
  );
}
