import { filesDeleteMethod, filesRenameMethod, type WorkshopInfo } from "@hone/protocol";
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
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar.tsx";
import type { HostClient } from "@/host-client.ts";
import type { LayoutSaver } from "@/layout-saver.ts";
import type { OpenFiles } from "@/open-file.ts";
import {
  closeEditorTabs,
  EditorArea,
  openEditorTab,
  renameEditorTabs,
  type Editors,
} from "./editor-area.tsx";
import { FileTree } from "./file-tree.tsx";

interface WorkshopScreenProps {
  readonly client: HostClient;
  readonly workshop: WorkshopInfo;
  readonly openFiles: OpenFiles;
  readonly layouts: LayoutSaver;
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
  layouts,
  onOpenWorkshop,
  onCreateWorkshop,
}: WorkshopScreenProps) {
  const editors = useRef<Editors>(undefined);

  async function renameEntry(from: string, to: string): Promise<void> {
    // Saved first, so no save is on its way to the old path while the file moves.
    await openFiles.flush();
    await client.call(filesRenameMethod, { from, to });
    // Before the watcher reports the old paths as deleted, which would otherwise close their tabs.
    openFiles.renamed(from, to);
    if (editors.current !== undefined) renameEditorTabs(editors.current.api, from, to);
  }

  async function deleteEntry(path: string): Promise<void> {
    await client.call(filesDeleteMethod, { path });
    // Dropped first, so closing the tabs doesn't try to save them to files that are gone.
    openFiles.deleted(path);
    if (editors.current !== undefined) closeEditorTabs(editors.current.api, path);
  }

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
          {/* Keyed by root, so opening another workshop starts a fresh tree with nothing expanded. */}
          <FileTree
            key={workshop.root}
            client={client}
            onOpenFile={(path) => {
              if (editors.current !== undefined) openEditorTab(editors.current.api, path);
            }}
            onOpenTerminal={(path) => {
              const title = path === "" ? workshop.name : path.slice(path.lastIndexOf("/") + 1);
              editors.current?.openTerminal(path, title);
            }}
            onRename={renameEntry}
            onDelete={deleteEntry}
          />
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        {/* Stays visible with the sidebar closed, so there's always a way to reopen it besides Ctrl+B. */}
        <header className="flex h-10 shrink-0 items-center px-2">
          <SidebarTrigger />
        </header>
        {/* Clips dockview, which rounds this box's size to whole pixels: with a fraction of a pixel, as under display
            scaling, it rounds past the window's edge and the page grows scrollbars that come and go. */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {/* Keyed by root, so opening another workshop closes every tab and opens that workshop's layout. */}
          <EditorArea
            key={workshop.root}
            client={client}
            workshopRoot={workshop.root}
            workshopName={workshop.name}
            openFiles={openFiles}
            layouts={layouts}
            onReady={(api) => {
              editors.current = api;
            }}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
