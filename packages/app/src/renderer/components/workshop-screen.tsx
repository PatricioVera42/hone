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
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar.tsx";
import type { HostClient } from "@/host-client.ts";
import { FileTree } from "./file-tree.tsx";

interface WorkshopScreenProps {
  readonly client: HostClient;
  readonly workshop: WorkshopInfo;
  readonly onOpenWorkshop: () => void;
  readonly onCreateWorkshop: () => void;
}

/** The open workshop: a fixed left sidebar (Ctrl+B toggles it) with the file tree, whose header menu switches workshops. */
export function WorkshopScreen({
  client,
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
        <SidebarContent>
          <SidebarGroup>
            {/* Keyed by root, so opening another workshop starts a fresh tree with nothing expanded. */}
            <FileTree key={workshop.root} client={client} />
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset />
    </SidebarProvider>
  );
}
