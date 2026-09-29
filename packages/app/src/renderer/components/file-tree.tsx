import { filesChangedNotification, filesListMethod, type FileEntry } from "@hone/protocol";
import { ArrowRight01Icon, File01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
} from "@/components/ui/sidebar.tsx";
import { applyFileChange } from "@/apply-file-change.ts";
import type { HostClient } from "@/host-client.ts";
import { reportError } from "@/report-error.ts";
import { sortEntries } from "@/sort-entries.ts";

interface FolderContentsProps {
  readonly client: HostClient;
  /** The folder's protocol path, relative to the workshop root. */
  readonly path: string;
  /** Called with a file's protocol path when it's clicked. */
  readonly onOpenFile: (path: string) => void;
}

function childPath(folder: string, name: string): string {
  return folder === "" ? name : `${folder}/${name}`;
}

/**
 * Lists one folder when it mounts, so a folder's children are only fetched once it's first expanded, and keeps it
 * up to date with `files.changed` from then on.
 */
function FolderContents({ client, path, onOpenFile }: FolderContentsProps) {
  const [entries, setEntries] = useState<readonly FileEntry[]>();

  useEffect(
    () =>
      client.onNotification(filesChangedNotification, (change) => {
        // A folder whose listing hasn't arrived isn't loaded yet, so it ignores changes until then.
        setEntries((current) => current && applyFileChange(path, current, change));
      }),
    [client, path],
  );

  useEffect(() => {
    let cancelled = false;
    client
      .call(filesListMethod, { path })
      .then((listed) => {
        if (!cancelled) setEntries(sortEntries(listed));
      })
      .catch((error: unknown) => {
        // A cancelled call was replaced by a newer one (StrictMode runs effects twice), which reports its own error.
        if (cancelled) return;
        reportError(error);
        // Shows the folder as empty instead of loading forever.
        setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, path]);

  if (entries === undefined) {
    return (
      <SidebarMenuItem>
        <SidebarMenuSkeleton />
      </SidebarMenuItem>
    );
  }
  return entries.map((entry) =>
    entry.kind === "folder" ? (
      <FolderItem
        key={entry.name}
        client={client}
        path={childPath(path, entry.name)}
        name={entry.name}
        onOpenFile={onOpenFile}
      />
    ) : (
      <SidebarMenuItem key={entry.name}>
        <SidebarMenuButton onClick={() => onOpenFile(childPath(path, entry.name))}>
          {/* Lines the file up with its sibling folders' icons, which follow a chevron. */}
          <span aria-hidden className="size-4 shrink-0" />
          <HugeiconsIcon icon={File01Icon} strokeWidth={2} />
          <span>{entry.name}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ),
  );
}

interface FolderItemProps extends FolderContentsProps {
  readonly name: string;
}

function FolderItem({ client, path, name, onOpenFile }: FolderItemProps) {
  const [expanded, setExpanded] = useState(false);
  // Stays mounted once loaded, so collapsing and expanding again keeps the subfolders as they were.
  const [loaded, setLoaded] = useState(false);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
          setLoaded(true);
        }}
      >
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className={expanded ? "rotate-90 transition-transform" : "transition-transform"}
        />
        <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} />
        <span>{name}</span>
      </SidebarMenuButton>
      {loaded && (
        <SidebarMenuSub hidden={!expanded}>
          <FolderContents client={client} path={path} onOpenFile={onOpenFile} />
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

type FileTreeProps = Omit<FolderContentsProps, "path">;

/**
 * The open workshop's files and folders. Folders load their children the first time they're expanded, and
 * clicking a file calls `onOpenFile`.
 */
export function FileTree({ client, onOpenFile }: FileTreeProps) {
  return (
    <nav aria-label="Files">
      <SidebarMenu>
        <FolderContents client={client} path="" onOpenFile={onOpenFile} />
      </SidebarMenu>
    </nav>
  );
}
