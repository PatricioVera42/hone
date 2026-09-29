import type { WorkshopInfo } from "@hone/protocol";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Sidebar,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar.tsx";

interface WorkshopScreenProps {
  readonly workshop: WorkshopInfo;
  readonly onOpenWorkshop: () => void;
  readonly onCreateWorkshop: () => void;
}

/** The open workshop: a fixed left sidebar (Ctrl+B toggles it) whose header menu switches workshops. */
export function WorkshopScreen({
  workshop,
  onOpenWorkshop,
  onCreateWorkshop,
}: WorkshopScreenProps) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuButton />}>
                  <span className="truncate font-medium">{workshop.name}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={onOpenWorkshop}>Open workshop…</DropdownMenuItem>
                    <DropdownMenuItem onClick={onCreateWorkshop}>Create workshop…</DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
      </Sidebar>
      <SidebarInset />
    </SidebarProvider>
  );
}
