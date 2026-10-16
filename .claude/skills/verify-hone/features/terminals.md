# Terminals

Terminals run the user's login shell in panels next to the editors. A workshop's default layout has one at the root, Ctrl+` opens another, and `Open terminal here` opens one in a folder. Typing `exit` closes a terminal's tab, and opening another workshop closes them all. This is where the user runs Claude Code or OpenCode.

## Sub-features

- `term-default` shows a terminal titled after the workshop at the bottom of a fresh workshop.
- `term-open` opens a terminal at the workshop root with Ctrl+`, next to the focused terminal when one has focus.
- `term-here` opens a terminal titled after a folder, working in that folder.
- `term-run` runs commands, whose output and files show up.
- `term-exit` closes the tab when the shell exits.
- `term-copy-paste` copies a selection with Ctrl+C or Ctrl+Shift+C and pastes once with Ctrl+V or Ctrl+Shift+V; Ctrl+C with no selection interrupts.
- `term-start-error` closes the tab and shows `Something went wrong` when the shell can't start.

## How to get to it (user POV)

- Ctrl+` anywhere in the workshop screen.
- Right-click a folder in the tree, `Open terminal here`.
- Type in the terminal; `exit` closes it.

## Driving it with verify.ts

Preconditions:

- `studies` open through `openWorkshop`, seeded with a folder `math`.

- **Default terminal.** `page.getByRole("tab", { name: "studies" })` has count 1, and `region "Terminal in studies"` is visible.
- **Run a command.** `helpers.runInTerminal(page, "studies", "echo hello | tee greeting.txt", "hello")` clicks the terminal, types and waits for a row that is exactly `hello`. `expect.poll` on `greeting.txt` reads `hello\n`.
- **Open another.** Press `Control+Backquote`: the `studies` tab count becomes 2.
- **Here.** Right-click `math` in the tree, choose `menuitem "Open terminal here"`. `tab "math"` is visible, and `runInTerminal(page, "math", "pwd", <realpath of math>)` passes.
- **Exit.** In the second `studies` terminal type `exit` and press Enter: the `studies` tab count drops by one.
- **Paste.** `app.evaluate(({ clipboard }, text) => clipboard.writeText(text), "echo pasted")`, click the terminal, press `Control+v` and Enter: one row reads exactly `pasted`.
- **Proof.** Snap after each command's output shows. `record` the files commands wrote.

## Gotchas

- The shell is the user's real `$SHELL -l` with their real `HOME`, started in the scratch workshop. Type only commands confined to it (`echo`, `pwd`, `ls`, `cat`).
- Terminal rows reach the ARIA tree through xterm's accessibility list, and only for the visible tab. Use `helpers.terminals(page, title)` or `helpers.terminalRowsExactly`, and switch tabs before reading a hidden one.
- The shell prompt appears asynchronously after the tab opens. `runInTerminal` waits for the output row, so don't assert on the prompt.
- Paths under `/tmp` may differ through symlinks. Compare `pwd` with `realpath`.
- Clipboard reads and writes go through main (`app.evaluate`), since xvfb has no clipboard manager. Treat that as a test seam.
