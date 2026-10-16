# Editor

Clicking a file in the tree opens it in an editor tab: notes (`.md`) get note settings, other text files code settings with line numbers, and binary files a message instead. Edits save to disk shortly after typing, undo and redo work and are saved too, and a file changed or deleted on disk updates or closes its tab. Breadcrumbs above the editor show the workshop and folders, each a menu of its entries.

## Sub-features

- `ed-open` opens a file in one tab per file; clicking it again focuses that tab.
- `ed-close` closes the active tab with Ctrl+W.
- `ed-close-menu` closes tabs from a tab's right-click menu (Close, Close Others, Close to the Right, Close All), only in that tab's group and never terminals in bulk.
- `ed-autosave` writes typed text to disk shortly after, keeping CRLF line endings.
- `ed-undo` undoes with Ctrl+Z and redoes with Ctrl+Y or Ctrl+Shift+Z, saving each.
- `ed-disk-change` shows a file rewritten on disk, and says pending edits were discarded when there were some.
- `ed-disk-delete` closes the tab of a file deleted on disk.
- `ed-binary` shows `This file can't be opened in Hone` for a binary file.
- `ed-breadcrumbs` shows workshop, folders and file name; a folder segment's menu lists its entries and opens files.
- `ed-close-window` saves pending edits on window close, and asks before discarding unsaved ones.

## How to get to it (user POV)

- Click a file row in the tree, or a file in a breadcrumb segment's menu.
- Right-click a tab (editor or terminal).
- Type in the editor; Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Ctrl+W.
- Change the file from outside Hone (an agent in a terminal, another editor).

## Driving it with verify.ts

Preconditions:

- `studies` open through `openWorkshop`, seeded with `algebra.md` containing `Groups.\n` and `notes/math/groups.md`.

- **Open once.** Click the tree row `algebra.md` twice. `page.getByRole("tab", { name: "algebra.md" })` has count 1 and `getByRole("textbox", { name: "algebra.md" })` contains `Groups.`
- **Autosave.** Click the editor, press `Control+End`, type `Rings.`. `expect.poll(() => readFile(file, "utf8")).toBe("Groups.\nRings.")`.
- **Undo and redo.** Press `Control+z`: the file goes back to `Groups.\n`. Press `Control+y`: it reads `Groups.\nRings.` again.
- **Changed on disk.** `writeFile` `Fields.\n` over `algebra.md` with no pending edits: the editor contains `Fields.` Type, then `writeFile` again right away: the editor shows the disk version and `getByText("algebra.md changed on disk; your latest edits were discarded.")` is visible.
- **Deleted on disk.** `rm` the open file: its tab count goes to 0.
- **Binary.** Seed `photo.png` with bytes `89 50 4E 47 00 01` and click it. `tab "photo.png"` shows `This file can't be opened in Hone`, and no `textbox "photo.png"` exists.
- **Breadcrumbs.** Open `notes/math/groups.md`. `page.getByRole("navigation", { name: "breadcrumb" }).getByRole("listitem")` reads `studies`, `notes`, `math`, `groups.md`. Click the `notes` segment: `getByRole("menu")` lists its entries, folders first, and choosing a file opens or focuses its tab.
- **Close tab.** Click in the editor and press `Control+w`: the tab and the textbox are gone.
- **Tab menu.** `page.getByRole("tab", { name, exact: true }).click({ button: "right" })` opens a `menu` with `menuitem`s `Close`, `Close Others`, `Close to the Right` and `Close All` (match with `exact: true`, since `Close` is a prefix of the rest). Each acts on the right-clicked tab's group only and skips terminal tabs, except `Close`. Items with nothing to close are disabled. A group is `page.getByRole("tablist").nth(i)`, in layout order; check its tabs with `getByRole("tab")` and `toHaveText([...])`, and the focus with `aria-selected="true"`. After `Close Others` or `Close to the Right` closes the active tab, the right-clicked tab is selected.
- **Proof.** Snap after opening, after typing and after each disk change. `record` the file content after autosave and after undo.

## Gotchas

- The editor textbox is named by the path relative to the workshop (`notes/math/groups.md`), while the tab is named by the file name.
- Saving is debounced. Poll the file; reading it right after typing sees the old content.
- Ctrl+W acts on the focused group. Click inside the editor first, or it may close a terminal tab.
- Building two groups with a terminal in the top one takes a real drag: open a terminal from a folder's menu (it joins the last terminal's group) and drag its tab onto the other group's tab strip, retrying inside `toPass`.
- Closing the window with unsaved edits opens a native message box, which Playwright can't click. `ed-close-window`'s discard branch needs `dialog.showMessageBox` replaced through `app.evaluate`, like the folder dialog. Treat it as a test seam and say so in the evidence.
