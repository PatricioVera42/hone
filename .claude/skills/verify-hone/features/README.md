# Hone verification map

This folder is the maintained source for verifying Hone's user-facing behavior. Read this index, then the feature file you're proving, and turn its bullets into a journey for `pnpm verify run` (see `../SKILL.md`).

## Baseline preconditions

- `pnpm verify doctor` prints only `ok` lines.
- Each journey starts on the welcome screen of a fresh launch: empty user data, no workshop open, a window of 1000 × 650.
- Seed workshops with `makeWorkshop(name)` and `fs` writes before `openWorkshop(root)`. Name the main one `studies`, as the feature files assume.
- Never drive an instance this run didn't start.

## Driving conventions

- Locate by ARIA role and accessible name. The tree is `navigation "Files"` and its rows are `button`s named after the entry. A tab is a `tab` named after the file or the terminal's folder. An editor is a `textbox` named by its path relative to the workshop. A terminal is a `region "Terminal in <folder>"`.
- Keyboard shortcuts go through `page.keyboard.press` with focus where a user would have it: the tree row for F2 and Delete, the editor or terminal for Ctrl+W and Ctrl+`.
- Replace the native folder dialog only through `openWorkshop` or `helpers.pickFolderInDialog`, right before the click that opens it.
- Simulate an agent or another editor changing files with `fs` calls on the workshop.

## Proof and skip reporting

- Snap before and after the action under test, and `record` every file the action wrote, renamed or deleted.
- Persistence proof is a `relaunch()` that shows the state again.
- Report a path you couldn't drive as failed, with the step and the unmet precondition. Never report it as verified through another entry point.

## Feature entry contract

Each feature file starts with an H1 title and a paragraph describing the user-visible behavior, then exactly four H2 sections in this order: `Sub-features` (short IDs, one line each), `How to get to it (user POV)` (every entry point), `Driving it with verify.ts` (starts with `Preconditions:`, then labeled bullets pairing an action, its Playwright call and the observable result), and `Gotchas`. Keep implementation details out; name user paths, handles, required state and proof.

## Features

- [Workshops](./workshops.md): welcome screen, creating, opening, switching and reopening workshops.
- [File tree](./file-tree.md): browsing, creating, renaming and deleting entries, and following the disk.
- [Editor](./editor.md): opening files in tabs, autosave, undo, changes on disk, binary files and breadcrumbs.
- [Terminals](./terminals.md): opening shells at the root or a folder, running commands, closing them.
- [Layout and sidebar](./layout.md): the default layout, restoring it on relaunch, and the sidebar's toggle and width.

## Not mapped

- The agent loop (`/onboard`, `/create`, `/refine`, `/close` in Claude Code or OpenCode inside a terminal) needs an installed, logged-in agent CLI and spends real model calls. Verify it by hand in `pnpm dev`. The map covers only what Hone itself does: seeding `.hone/generator/` and `library/` (Workshops) and the terminal the agent runs in (Terminals).
- Recovering from a lost host has no user entry point: the host only dies by accident. The e2e test kills it through main.
