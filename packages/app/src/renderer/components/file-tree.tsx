import {
  appErrorCodes,
  filesChangedNotification,
  filesCreateMethod,
  filesListMethod,
  type FileChange,
  type FileEntry,
} from "@hone/protocol";
import { ArrowRight01Icon, File01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { FieldError } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
} from "@/components/ui/sidebar.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { applyFileChange } from "@/apply-file-change.ts";
import { entryNameError, noteFileName } from "@/entry-name.ts";
import { renamedPath } from "@/entry-path.ts";
import { HostCallError, type HostClient } from "@/host-client.ts";
import { reportError } from "@/report-error.ts";
import { sortEntries } from "@/sort-entries.ts";
import { DeleteEntryDialog } from "./delete-entry-dialog.tsx";

/** What New note, New file and New folder create. A note is a file whose name gets `.md` unless it has an extension. */
type NewEntryKind = "note" | FileEntry["kind"];

/** The row being named in the tree: a new entry in a folder, or an entry being renamed. */
type TreeEdit =
  | { readonly action: "create"; readonly folder: string; readonly kind: NewEntryKind }
  | { readonly action: "rename"; readonly path: string };

interface TreeContextValue {
  readonly client: HostClient;
  /** Called with a file's protocol path when it's clicked or created as a note. */
  readonly onOpenFile: (path: string) => void;
  readonly expandedFolders: ReadonlySet<string>;
  readonly setExpandedFolders: Dispatch<SetStateAction<ReadonlySet<string>>>;
  readonly edit: TreeEdit | undefined;
  readonly setEdit: (edit: TreeEdit | undefined) => void;
  /** Renames an entry, rejecting with a {@link HostCallError} when the host refuses. */
  readonly onRename: (from: string, to: string) => Promise<void>;
}

// Shared by every folder at any depth, which would otherwise pass it all down through each level.
const TreeContext = createContext<TreeContextValue | undefined>(undefined);

function useTree(): TreeContextValue {
  const tree = useContext(TreeContext);
  if (tree === undefined) throw new Error("A tree row was rendered outside the file tree");
  return tree;
}

function childPath(folder: string, name: string): string {
  return folder === "" ? name : `${folder}/${name}`;
}

/** What to show under a row when the host refuses a name. */
function hostErrorMessage(error: HostCallError, name: string): string {
  if (error.code === appErrorCodes.AlreadyExists) return `${name} already exists in this folder.`;
  return error.message;
}

interface NameRowProps {
  readonly kind: FileEntry["kind"];
  /** The name the row starts with: empty for a new entry, the current one for a rename. */
  readonly initialName: string;
  /** Turns what the user typed into the entry's name. */
  readonly toName: (typed: string) => string;
  /** Why a name can't be used, checked as the user types. */
  readonly validate: (name: string) => string | undefined;
  /** Creates or renames the entry, rejecting with a {@link HostCallError} when the host refuses. */
  readonly onSubmit: (name: string) => Promise<void>;
  readonly onCancel: () => void;
}

/**
 * A row's content while its name is being typed, for the caller to place in a row. Enter submits, Escape or
 * leaving it cancels. An error shows under it.
 */
function NameRow({ kind, initialName, toName, validate, onSubmit, onCancel }: NameRowProps) {
  const [typed, setTyped] = useState(initialName);
  // An empty name is only an error once the user has typed or submitted, not when the row appears.
  const [touched, setTouched] = useState(false);
  const [hostError, setHostError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const name = toName(typed);
  const error = hostError ?? (touched ? validate(name) : undefined);

  async function submit(): Promise<void> {
    setTouched(true);
    if (validate(name) !== undefined || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(name);
    } catch (submitError) {
      if (!(submitError instanceof HostCallError)) throw submitError;
      setHostError(hostErrorMessage(submitError, name));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-0.5">
        <span aria-hidden className="size-4 shrink-0" />
        <HugeiconsIcon icon={kind === "folder" ? Folder01Icon : File01Icon} strokeWidth={2} />
        <Input
          aria-label="Name"
          autoComplete="off"
          autoFocus
          value={typed}
          aria-invalid={error !== undefined}
          // Not disabled, which would take the focus away from it while the host answers.
          readOnly={submitting}
          onFocus={(event) => {
            // Selects the name without its extension, which a rename usually keeps.
            const dot = initialName.lastIndexOf(".");
            event.target.setSelectionRange(0, dot > 0 ? dot : initialName.length);
          }}
          onChange={(event) => {
            setTyped(event.target.value);
            setTouched(true);
            setHostError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit().catch(reportError);
            if (event.key === "Escape") onCancel();
          }}
          onBlur={() => {
            if (!submitting) onCancel();
          }}
        />
      </div>
      <div className="px-2 pb-1">
        <FieldError>{error}</FieldError>
      </div>
    </>
  );
}

interface NewEntryRowProps {
  readonly folder: string;
  readonly kind: NewEntryKind;
  readonly siblings: readonly FileEntry[];
  readonly onCreated: (entry: FileEntry) => void;
}

function NewEntryRow({ folder, kind, siblings, onCreated }: NewEntryRowProps) {
  const { client, onOpenFile, setEdit } = useTree();
  const entryKind = kind === "folder" ? "folder" : "file";

  return (
    <SidebarMenuItem>
      <NameRow
        kind={entryKind}
        initialName=""
        toName={kind === "note" ? noteFileName : (typed) => typed}
        validate={(name) => entryNameError(name, siblings)}
        onSubmit={async (name) => {
          const path = childPath(folder, name);
          await client.call(filesCreateMethod, { path, kind: entryKind });
          setEdit(undefined);
          onCreated({ name, kind: entryKind });
          if (kind === "note") onOpenFile(path);
        }}
        onCancel={() => setEdit(undefined)}
      />
    </SidebarMenuItem>
  );
}

interface RenameRowProps {
  readonly folder: string;
  readonly entry: FileEntry;
  readonly siblings: readonly FileEntry[];
  readonly onRenamed: (name: string) => void;
}

function RenameRow({ folder, entry, siblings, onRenamed }: RenameRowProps) {
  const { onRename, setEdit, setExpandedFolders } = useTree();

  return (
    <NameRow
      kind={entry.kind}
      initialName={entry.name}
      toName={(typed) => typed}
      validate={(name) => entryNameError(name, siblings, entry.name)}
      onSubmit={async (name) => {
        if (name !== entry.name) {
          const from = childPath(folder, entry.name);
          const to = childPath(folder, name);
          await onRename(from, to);
          onRenamed(name);
          // Keeps a renamed folder, and the folders inside it, expanded as they were.
          setExpandedFolders(
            (current) => new Set([...current].map((path) => renamedPath(path, from, to) ?? path)),
          );
        }
        setEdit(undefined);
      }}
      onCancel={() => setEdit(undefined)}
    />
  );
}

/**
 * Lists one folder when it mounts, so a folder's children are only fetched once it's first expanded, and keeps it
 * up to date with `files.changed` from then on.
 */
function FolderContents({
  path,
  onUnavailable,
}: {
  readonly path: string;
  /** Called with the error's message when the folder can't be listed. The workshop root has no one to tell. */
  readonly onUnavailable?: (message: string) => void;
}) {
  const { client, onOpenFile, edit } = useTree();
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
        // Shows the folder as empty instead of loading forever, until its parent hides it as unavailable.
        setEntries([]);
        onUnavailable?.(error instanceof Error ? error.message : String(error));
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

  // Shown right away rather than once the watcher reports them, the way `files.changed` would.
  function showChanges(...changes: FileChange[]): void {
    setEntries(
      (current) =>
        current && changes.reduce((shown, change) => applyFileChange(path, shown, change), current),
    );
  }

  function renameRow(entry: FileEntry): ReactNode {
    const from = childPath(path, entry.name);
    if (edit?.action !== "rename" || edit.path !== from) return undefined;
    return (
      <RenameRow
        folder={path}
        entry={entry}
        siblings={entries ?? []}
        onRenamed={(name) =>
          showChanges(
            { path: from, change: "deleted", kind: entry.kind },
            { path: childPath(path, name), change: "created", kind: entry.kind },
          )
        }
      />
    );
  }

  return (
    <>
      {edit?.action === "create" && edit.folder === path && (
        <NewEntryRow
          folder={path}
          kind={edit.kind}
          siblings={entries}
          onCreated={(entry) =>
            showChanges({ path: childPath(path, entry.name), change: "created", kind: entry.kind })
          }
        />
      )}
      {entries.map((entry) =>
        entry.kind === "folder" ? (
          <FolderItem
            key={entry.name}
            path={childPath(path, entry.name)}
            name={entry.name}
            renameRow={renameRow(entry)}
          />
        ) : (
          <SidebarMenuItem key={entry.name}>
            {renameRow(entry) ?? (
              <SidebarMenuButton
                data-entry-path={childPath(path, entry.name)}
                data-entry-kind="file"
                onClick={() => onOpenFile(childPath(path, entry.name))}
              >
                {/* Lines the file up with its sibling folders' icons, which follow a chevron. */}
                <span aria-hidden className="size-4 shrink-0" />
                <HugeiconsIcon icon={File01Icon} strokeWidth={2} />
                <span>{entry.name}</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        ),
      )}
    </>
  );
}

interface FolderItemProps {
  readonly path: string;
  readonly name: string;
  /** Shown instead of the folder's button while it's being renamed. */
  readonly renameRow: ReactNode;
}

function FolderItem({ path, name, renameRow }: FolderItemProps) {
  const { expandedFolders, setExpandedFolders } = useTree();
  const expanded = expandedFolders.has(path);
  // Stays mounted once loaded, so collapsing and expanding again keeps the subfolders as they were.
  const [loaded, setLoaded] = useState(expanded);
  // Expanded from elsewhere too, such as by New note on it.
  if (expanded && !loaded) setLoaded(true);
  // The error that made listing the folder fail. It stays unavailable until the tree is rebuilt, so the user isn't
  // told again by every click and nothing retries.
  const [unavailable, setUnavailable] = useState<string>();

  if (unavailable !== undefined && renameRow === undefined) {
    return (
      <Tooltip>
        {/* On the row rather than the button, whose disabled style stops it from receiving the pointer. */}
        <TooltipTrigger render={<SidebarMenuItem />}>
          <SidebarMenuButton aria-disabled data-entry-path={path} data-entry-kind="folder">
            {/* Lines the folder up with the others, whose icons follow a chevron. */}
            <span aria-hidden className="size-4 shrink-0" />
            <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} />
            <span>{name}</span>
          </SidebarMenuButton>
        </TooltipTrigger>
        <TooltipContent side="right">{unavailable}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <SidebarMenuItem>
      {renameRow ?? (
        <SidebarMenuButton
          aria-expanded={expanded}
          data-entry-path={path}
          data-entry-kind="folder"
          onClick={() => {
            setExpandedFolders((current) => {
              const next = new Set(current);
              if (expanded) next.delete(path);
              else next.add(path);
              return next;
            });
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
      )}
      {loaded && unavailable === undefined && (
        <SidebarMenuSub hidden={!expanded}>
          <FolderContents path={path} onUnavailable={setUnavailable} />
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

/** A file or folder row, or the workshop root (`""`) for the tree's empty space. */
interface TreeTarget {
  readonly path: string;
  readonly kind: FileEntry["kind"];
}

const rootTarget: TreeTarget = { path: "", kind: "folder" };

/** The row an event happened on, from the data attributes every row's button carries. */
function targetOf(element: EventTarget): TreeTarget {
  if (!(element instanceof Element)) return rootTarget;
  const row = element.closest<HTMLElement>("[data-entry-path]");
  const path = row?.dataset["entryPath"];
  const kind = row?.dataset["entryKind"];
  if (path === undefined || (kind !== "file" && kind !== "folder")) return rootTarget;
  return { path, kind };
}

interface FileTreeProps {
  readonly client: HostClient;
  readonly onOpenFile: (path: string) => void;
  /** Opens a terminal in the folder at `path`. */
  readonly onOpenTerminal: (path: string) => void;
  /** Renames an entry, rejecting with a {@link HostCallError} when the host refuses. */
  readonly onRename: (from: string, to: string) => Promise<void>;
  /** Deletes an entry, once the user confirmed. */
  readonly onDelete: (path: string) => Promise<void>;
}

/**
 * The open workshop's files and folders. Folders load their children the first time they're expanded, and
 * clicking a file calls `onOpenFile`. Right-clicking a folder, or the empty space for the root, offers to create
 * a note, file or folder inside it, or to open a terminal there; right-clicking a file or folder offers to rename it
 * or delete it, which F2 and the Delete key do too.
 */
export function FileTree({
  client,
  onOpenFile,
  onOpenTerminal,
  onRename,
  onDelete,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(new Set());
  const [edit, setEdit] = useState<TreeEdit>();
  const [menuTarget, setMenuTarget] = useState<TreeTarget>(rootTarget);
  const [deleting, setDeleting] = useState<TreeTarget>();

  function startCreating(kind: NewEntryKind): void {
    const folder = menuTarget.path;
    if (folder !== "") setExpandedFolders((current) => new Set(current).add(folder));
    setEdit({ action: "create", folder, kind });
  }

  function onKeyDown(event: KeyboardEvent): void {
    const target = targetOf(event.target);
    // The root has no row to rename, and a key typed into a row's name belongs to it.
    if (target === rootTarget) return;
    if (event.key === "F2") {
      event.preventDefault();
      setEdit({ action: "rename", path: target.path });
    }
    if (event.key === "Delete") {
      event.preventDefault();
      setDeleting(target);
    }
  }

  return (
    <TreeContext
      value={{ client, onOpenFile, expandedFolders, setExpandedFolders, edit, setEdit, onRename }}
    >
      <ContextMenu>
        {/* Fills the sidebar, so right-clicking below the last row still reaches the root's menu. */}
        <ContextMenuTrigger
          render={<nav aria-label="Files" className="flex-1" />}
          onContextMenu={(event: MouseEvent) => setMenuTarget(targetOf(event.target))}
          onKeyDown={onKeyDown}
        >
          <SidebarGroup>
            <SidebarMenu>
              <FolderContents path="" />
            </SidebarMenu>
          </SidebarGroup>
        </ContextMenuTrigger>
        {/* Leaves focus alone on close, so the row an item starts naming keeps it. */}
        <ContextMenuContent finalFocus={false}>
          {menuTarget.kind === "folder" && (
            <>
              <ContextMenuItem onClick={() => startCreating("note")}>New note</ContextMenuItem>
              <ContextMenuItem onClick={() => startCreating("file")}>New file</ContextMenuItem>
              <ContextMenuItem onClick={() => startCreating("folder")}>New folder</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onOpenTerminal(menuTarget.path)}>
                Open terminal here
              </ContextMenuItem>
            </>
          )}
          {menuTarget.kind === "folder" && menuTarget !== rootTarget && <ContextMenuSeparator />}
          {menuTarget !== rootTarget && (
            <ContextMenuItem onClick={() => setEdit({ action: "rename", path: menuTarget.path })}>
              Rename
              <ContextMenuShortcut>F2</ContextMenuShortcut>
            </ContextMenuItem>
          )}
          {menuTarget !== rootTarget && (
            <ContextMenuItem variant="destructive" onClick={() => setDeleting(menuTarget)}>
              Delete
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <DeleteEntryDialog
        client={client}
        target={deleting}
        onClose={() => setDeleting(undefined)}
        onDelete={onDelete}
      />
    </TreeContext>
  );
}
