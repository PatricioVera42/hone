# File tree

The sidebar's tree lists the open workshop's files and folders, folders first in natural order (`f2` before `f10`), loading a folder when it's expanded. A user creates notes, files and folders, renames and deletes entries from it, and changes made on disk by an agent show up on their own.

## Sub-features

- `tree-list` lists entries folders first in natural order and expands a folder on click.
- `tree-new-note` creates `<name>.md` (appending `.md`) in the chosen folder and opens it.
- `tree-new-file` and `tree-new-folder` create an entry with the name as typed.
- `tree-name-taken` shows an error under the row when the name exists, and creates nothing.
- `tree-rename` renames an entry on disk and in any open tab.
- `tree-delete` deletes a file or folder after a confirmation that counts a folder's files, and closes their tabs.
- `tree-follow-disk` shows entries created or deleted on disk without a refresh.
- `tree-drop-files` copies files and folders dropped from outside the app into the folder under the pointer, numbering names that are taken.

## How to get to it (user POV)

- Right-click a row: `New note`, `New file`, `New folder` and `Open terminal here` (on folders), `Rename`, `Delete`.
- Right-click the empty space below the last row: the same create items, for the workshop root.
- With a row focused: F2 renames, Delete deletes.
- Drag files or folders from outside the app onto a folder row (copied into it), a file row (into its folder) or the empty space (into the workshop root).

## Driving it with verify.ts

Preconditions:

- `studies` open through `openWorkshop`, seeded with a folder `math` and a note `idea.md` containing `Taken.`

- **List and expand.** Seed `f10.md`, `f2.md` and folder `notes`. The tree's buttons read `.hone`, `math`, `notes` before `f2.md`, `f10.md`, `idea.md`. Click `math`: it gets `aria-expanded="true"`.
- **New note.** `tree.getByRole("button", { name: "math" }).click({ button: "right" })`, then `page.getByRole("menuitem", { name: "New note" }).click()`, fill `tree.getByRole("textbox", { name: "Name" })` with `plan` and press Enter. `tab "plan.md"` and the tree row `plan.md` show, and `math/plan.md` exists and is empty.
- **Root entries.** Right-click the tree at `{ x: 10, y: height - 10 }` (from `tree.boundingBox()`), choose `New folder`, type `archive` and press Enter. `archive/` exists at the root.
- **Name taken.** At the root choose `New file` and type `idea.md`, then press Enter. `tree.getByRole("alert")` reads `idea.md already exists in this folder.`, the textbox stays, and `idea.md` still holds `Taken.` Escape removes the textbox.
- **Rename.** Click `idea.md` to open it, press F2 on its row, fill `Name` with `goal.md` and press Enter (`helpers.renameInTree(page, tree, "idea.md", "goal.md")`). `tab "goal.md"` replaces `idea.md`, and on disk only `goal.md` exists, still with `Taken.`
- **Delete a folder.** Seed `math/groups.md` and `math/algebra/rings.md`, open `groups.md`, then press Delete on `math`'s row. `getByRole("alertdialog")` contains `Delete math?` and the file count. Click `Delete`: the `groups.md` tab closes, the `math` row disappears and `math/` is gone from disk.
- **Follow the disk.** `writeFile` `outside.md` at the root: its row appears. `rm` it: the row disappears.
- **Drop files.** Seed files and folders in `<scratch>/outside`. Playwright has no external drag, and a synthetic `File` has no path, so send the browser's own drag events with real paths: `const session = await page.context().newCDPSession(page)`, then `session.send("Input.dispatchDragEvent", { type, x, y, data: { items: [], files: [paths], dragOperationsMask: 1 } })` for `dragEnter`, `dragOver` and `drop` at the centre of the target row (or empty space in `tree`). After `dragOver`, a folder row has `data-active` and, over empty space, `tree` has `data-drop-target`. After `drop`, `expect.poll` `readdir` of the target folder: copies appear, a taken name gets ` (1)`, and the originals stay. A failure shows one `dialog "Couldn't copy everything"` naming each failed item. Close any listening socket the journey made in a `finally`, or the run never exits.
- **Proof.** Snap the tree before and after each action, and `record` `readdir` of the touched folders.

## Gotchas

- Rows are buttons. A file's row shares its name with its tab and, once open, its editor textbox, so scope to `tree`.
- A folder's children load only after it's expanded. Click the folder before asserting on its children.
- The delete dialog counts files asynchronously (`Counting its files…` first). Assert the count text before clicking `Delete`.
- Hidden files (`.hidden`) count toward a folder's file count but aren't the tree's business to show. Don't assert on them in the tree.
