# Workshops

A workshop is a folder with `.hone/generator/` inside. From the welcome screen or the sidebar's workshop menu, a user creates one (Hone seeds the generator and the default library) or opens one, even from a folder nested inside it. A folder outside any workshop offers to create one, and the next launch reopens the last workshop unless it was deleted.

## Sub-features

- `ws-welcome` shows `Open workshop` and `Create workshop` on a launch with no last workshop.
- `ws-create` creates `<parent>/<name>/` with `.hone/generator/` and `library/` seeded, and opens it.
- `ws-create-validate` rejects names with `/` as they're typed and reports an existing folder on submit.
- `ws-open` opens a workshop from its root or from any folder inside it.
- `ws-not-a-workshop` offers `Create workshop` when the picked folder isn't inside one.
- `ws-switch` opens another workshop from the sidebar menu, replacing the open one.
- `ws-reopen` reopens the last workshop on launch, and shows the welcome screen when it was deleted.

## How to get to it (user POV)

- Welcome screen: the `Open workshop` and `Create workshop` buttons.
- Sidebar header: the button named after the open workshop opens a menu with `Open workshop…` and `Create workshop…`.
- Relaunching the app.

## Driving it with verify.ts

Preconditions:

- A fresh launch on the welcome screen.

- **Welcome.** `await expect(page.getByRole("button", { name: "Open workshop" })).toBeVisible()`, and the same for `Create workshop`.
- **Create.** Click `Create workshop`, then `helpers.pickFolderInDialog(app, scratch)` and click the dialog's `Choose folder…`. The dialog (`getByRole("dialog")`) shows the scratch path. Fill `getByLabel("Name")` with `studies` and click `Create`. `helpers.workshopMenuButton(page, "studies")` is visible, the tree lists `.hone` and `library`, and on disk `.hone/generator/` holds `AGENTS.md`, `opencode.json`, `.claude` and `templates`, while `library/` holds `close`, `quick-close` and `study`.
- **Validate the name.** In the create dialog, fill `a/b`: `dialog.getByRole("alert")` reads `The name can't contain "/".` and `Create` is disabled. Fill the name of an existing folder and click `Create`: the alert reads `<parent>/<name> already exists. Choose another name.`
- **Open from a nested folder.** `makeWorkshop("studies")`, `mkdir` `studies/math/algebra`, `pickFolderInDialog` on that nested folder, then click `Open workshop`. The sidebar button `studies` is visible.
- **Not a workshop.** Pick a plain folder in the scratch and click `Open workshop`. `getByRole("alertdialog")` contains `<folder> isn't inside a workshop.` and a `Create workshop` button.
- **Switch.** With `studies` open, click `workshopMenuButton(page, "studies")`, `pickFolderInDialog` on a second workshop `work`, then click `menuitem "Open workshop…"`. The sidebar button reads `work`, and `studies`'s tabs are gone.
- **Reopen.** Open `studies`, then `relaunch()`. On the new page `workshopMenuButton(page, "studies")` is visible with no click. `rm` the workshop and `relaunch()` again: the welcome screen's `Open workshop` is back.
- **Proof.** Snap the welcome screen, the filled dialog and the opened workshop. `record` the `readdir` of the new root, `.hone/generator` and `library`.

## Gotchas

- `Create workshop` exists twice once the create dialog is open: the welcome screen's button and the dialog's title. Scope clicks to `getByRole("dialog")`.
- The create dialog's close animation keeps it in the ARIA tree briefly. Wait for `dialog` to be hidden before snapping the opened workshop.
- The breadcrumbs of an open file start with a button named after the workshop too. `helpers.workshopMenuButton` scopes to the sidebar header.
- The seeded generator comes from the repo's `generator/` and `library-default/`, so the expected listing changes when they do. Assert that they're not empty, and record the listing instead of hardcoding it.
