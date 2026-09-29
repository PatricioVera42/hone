import type { WorkshopInfo } from "@hone/protocol";
import type { DockviewApi } from "dockview-react";
import { useRef } from "react";
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
import type { OpenFiles } from "@/open-file.ts";
import { EditorArea, openEditorTab } from "./editor-area.tsx";
import { FileTree } from "./file-tree.tsx";

interface WorkshopScreenProps {
  readonly client: HostClient;
  readonly workshop: WorkshopInfo;
  readonly openFiles: OpenFiles;
  readonly onOpenWorkshop: () => void;
  readonly onCreateWorkshop: () => void;
}

/**
 * The open workshop: a fixed left sidebar with the file tree, whose header menu switches workshops, and the editor
 * area to its right. The toggle button in the bar above the editor area, or Ctrl+B, opens and closes the sidebar.
 */
export function WorkshopScreen({
  client,
  workshop,
  openFiles,
  onOpenWorkshop,
  onCreateWorkshop,
}: WorkshopScreenProps) {
  const editors = useRef<DockviewApi>(undefined);

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
            <FileTree
              key={workshop.root}
              client={client}
              onOpenFile={(path) => {
                if (editors.current !== undefined) openEditorTab(editors.current, path);
              }}
            />
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        {/* Stays visible with the sidebar closed, so there's always a way to reopen it besides Ctrl+B. */}
        <header className="flex h-10 shrink-0 items-center px-2">
          <SidebarTrigger />
        </header>
        <div className="min-h-0 flex-1">
          {/* Keyed by root, so opening another workshop closes every editor tab. */}
          <EditorArea
            key={workshop.root}
            client={client}
            openFiles={openFiles}
            onReady={(api) => {
              editors.current = api;
            }}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
