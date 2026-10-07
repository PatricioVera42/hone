import { filesListMethod, type FileEntry } from "@hone/protocol";
import { Fragment, useEffect, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.tsx";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { ancestorFolders, childPath } from "@/entry-path.ts";
import type { HostClient } from "@/host-client.ts";
import { reportError } from "@/report-error.ts";
import { sortEntries } from "@/sort-entries.ts";

type Listing =
  | { readonly status: "loading" }
  | { readonly status: "listed"; readonly entries: readonly FileEntry[] }
  | { readonly status: "failed"; readonly message: string };

interface FolderEntriesProps {
  readonly client: HostClient;
  readonly folder: string;
  readonly onOpenFile: (path: string) => void;
}

/**
 * The entries of a folder as menu items, listed when it mounts. A menu's content only mounts while it's open, so each
 * opening lists the folder again.
 */
function FolderEntries({ client, folder, onOpenFile }: FolderEntriesProps) {
  const [listing, setListing] = useState<Listing>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    client
      .call(filesListMethod, { path: folder })
      .then((entries) => {
        if (!cancelled) setListing({ status: "listed", entries: sortEntries(entries) });
      })
      .catch((error: unknown) => {
        // A cancelled call was replaced by a newer one (StrictMode runs effects twice), which reports its own error.
        if (cancelled) return;
        reportError(error);
        setListing({
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [client, folder]);

  if (listing.status === "loading") {
    return <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>;
  }
  if (listing.status === "failed") {
    return (
      <p role="alert" className="max-w-64 px-2 py-1 text-xs text-destructive">
        {listing.message}
      </p>
    );
  }
  if (listing.entries.length === 0) {
    return <p className="px-2 py-1 text-xs text-muted-foreground">Empty folder</p>;
  }
  return listing.entries.map((entry) => {
    const path = childPath(folder, entry.name);
    if (entry.kind === "file") {
      return (
        <DropdownMenuItem
          key={entry.name}
          onClick={() => {
            onOpenFile(path);
          }}
        >
          {entry.name}
        </DropdownMenuItem>
      );
    }
    return (
      <DropdownMenuSub key={entry.name}>
        <DropdownMenuSubTrigger>{entry.name}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <FolderEntries client={client} folder={path} onOpenFile={onOpenFile} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  });
}

interface EditorBreadcrumbsProps {
  readonly client: HostClient;
  readonly workshopName: string;
  /** The open file's protocol path, relative to the workshop root. */
  readonly path: string;
  readonly onOpenFile: (path: string) => void;
}

/**
 * The open file's place in the workshop: the workshop, each folder above the file and the file's name. Every segment
 * but the last opens a menu with that folder's entries, to open one of its files.
 */
export function EditorBreadcrumbs({
  client,
  workshopName,
  path,
  onOpenFile,
}: EditorBreadcrumbsProps) {
  const folders = [{ name: workshopName, path: "" }, ...ancestorFolders(path)];
  return (
    <div className="shrink-0 px-3 py-1.5">
      <Breadcrumb>
        <BreadcrumbList>
          {folders.map((folder) => (
            <Fragment key={folder.path}>
              <BreadcrumbItem>
                <DropdownMenu>
                  <BreadcrumbLink render={<DropdownMenuTrigger />}>{folder.name}</BreadcrumbLink>
                  {/* The sub-menu's content, which fits its widest name, unlike the menu's, which is as wide as its trigger. */}
                  <DropdownMenuSubContent side="bottom" sideOffset={4} alignOffset={0}>
                    <FolderEntries client={client} folder={folder.path} onOpenFile={onOpenFile} />
                  </DropdownMenuSubContent>
                </DropdownMenu>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </Fragment>
          ))}
          <BreadcrumbItem>
            <BreadcrumbPage>{path.slice(path.lastIndexOf("/") + 1)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
