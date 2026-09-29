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
  SidebarTrigger,
} from "@/components/ui/sidebar.tsx";
import type { HostClient } from "@/host-client.ts";
import { FileTree } from "./file-tree.tsx";

interface WorkshopScreenProps {
  readonly client: HostClient;
  readonly workshop: WorkshopInfo;
  readonly onOpenWorkshop: () => void;
  readonly onCreateWorkshop: () => void;
}

/**
 * The open workshop: a fixed left sidebar with the file tree, whose header menu switches workshops.
 * The toggle button in the bar above the content area, or Ctrl+B, opens and closes it.
 */
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
      <SidebarInset>
        {/* Stays visible with the sidebar closed, so there's always a way to reopen it besides Ctrl+B. */}
        <header className="flex h-10 shrink-0 items-center px-2">
          <SidebarTrigger />
        </header>
      </SidebarInset>
    </SidebarProvider>
  );
}
