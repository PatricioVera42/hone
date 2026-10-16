# Layout and sidebar

The workshop screen is a sidebar with the tree and an editor area of tabs and groups. A fresh workshop shows an empty editor area with a terminal at the bottom. Each workshop's layout (tabs, groups, terminals and their folders) comes back on the next launch or when switching back to it. The sidebar can be collapsed and resized, and its width comes back on relaunch.

## Sub-features

- `layout-default` shows an empty editor area with one terminal in the bottom third or so.
- `layout-restore` restores a workshop's tabs, their places and working terminals after relaunch, skipping files deleted meanwhile.
- `layout-per-workshop` keeps each workshop's layout when switching between them.
- `sidebar-toggle` collapses and expands the sidebar with Ctrl+B or the `Toggle Sidebar` button, keeping expanded folders.
- `sidebar-resize` resizes the sidebar by dragging its edge, between 180 px and half the window, collapsing it when dragged to the far left; the width survives relaunch.

## How to get to it (user POV)

- Open a workshop; open files and terminals; drag tabs between groups.
- Ctrl+B, or the `Toggle Sidebar` button at the top left of the editor area.
- Drag the sidebar's right edge.
- Relaunch the app or switch workshops.

## Driving it with verify.ts

Preconditions:

- `studies` open through `openWorkshop`, seeded with `algebra.md` (`Groups.\n`) and `geometry.md` (`Circles.\n`).

- **Default.** On a fresh workshop `page.getByRole("tab")` has count 1, named `studies`.
- **Restore.** Click `algebra.md` and `geometry.md` in the tree, then `relaunch()`. On the new page `tab "algebra.md"` and `tab "geometry.md"` are visible, `textbox "geometry.md"` contains `Circles.`, and `helpers.runInTerminal(page, "studies", "echo hello", "hello")` passes.
- **Deleted between launches.** Open `algebra.md`, `rm` it, then `relaunch()`: no `tab "algebra.md"` appears.
- **Toggle.** Press `Control+b`: `helpers.workshopMenuButton(page, "studies")` is not in the viewport. Click `button "Toggle Sidebar"`: it's back, and a folder expanded before still has `aria-expanded="true"`.
- **Resize.** The sidebar (`[data-slot="sidebar-container"]`) starts 256 px wide. Drag the center of `separator "Resize sidebar"` with `page.mouse` to `x = 340`: the width becomes 340. `relaunch()` and wait for the workshop's sidebar button: the width is still 340.
- **Proof.** Snap before and after each relaunch or toggle. `record` the sidebar width, and the tabs' names from `page.getByRole("tab").allTextContents()`.

## Gotchas

- After `relaunch()` the old `page` is closed. Use the returned one.
- Tab names repeat: every terminal at the root is a tab named `studies`. Count tabs instead of picking one by name.
- Dragging needs real mouse moves with `steps`, and widths settle after a frame. Measure with `expect.poll`.
- The layout is saved per workshop root in the user data's `state.json`. Each run starts with empty user data, so restore journeys must set the layout up themselves within the run.
