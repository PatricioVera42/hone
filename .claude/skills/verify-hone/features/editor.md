# Editor

Clicking a file in the tree opens it in an editor tab: notes (`.md`) get note settings, other text files code settings with line numbers, and binary files a message instead. Edits save to disk shortly after typing, undo and redo work and are saved too, and a file changed or deleted on disk updates or closes its tab. A note reads formatted, with its Markdown syntax hidden except where the cursor is, and can be switched to its text as typed. Breadcrumbs above the editor show the workshop and folders, each a menu of its entries.

## Sub-features

- `ed-open` opens a file in one tab per file; clicking it again focuses that tab.
- `ed-close` closes the active tab with Ctrl+W.
- `ed-close-menu` closes tabs from a tab's right-click menu (Close, Close Others, Close to the Right, Close All), only in that tab's group and never terminals in bulk.
- `ed-autosave` writes typed text to disk shortly after, keeping CRLF line endings.
- `ed-undo` undoes with Ctrl+Z and redoes with Ctrl+Y or Ctrl+Shift+Z, saving each.
- `ed-disk-change` shows a file rewritten on disk, and says pending edits were discarded when there were some.
- `ed-disk-delete` closes the tab of a file deleted on disk.
- `ed-live-preview` draws a note's headings (own size per level), bold, italic, strikethrough, inline code and `[text](url)` links without their syntax; the syntax of an element shows while the cursor or a selection touches it; frontmatter stays YAML; code files are untouched.
- `ed-live-preview-blocks` draws bullet items with `•`, ordered items with their numbers, quotes with a bar instead of `>`, horizontal rules as a line, and fenced code blocks on a background without their fences; the syntax shows where the cursor touches.
- `ed-preview-toggle` switches a note's tab between live preview and text with a button at the right of the breadcrumbs or Ctrl+E; per tab, never remembered, absent for code files.
- `ed-link-open` opens an `http`/`https` link of a note in the system browser on Ctrl+click, with a hand while Ctrl is held over an `http(s)` link; a plain click only places the cursor.
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
- **Tab menu.** `page.getByRole("tab", { name, exact: true }).click({ button: "right" })` opens a `menu` with `menuitem`s `Close`, `Close Others`, `Close to the Right` and `Close All` (match with `exact: true`, since `Close` is a prefix of the rest). Each acts on the right-clicked tab's group only and skips terminal tabs, except `Close`. Items with nothing to close are disabled. A group is `page.getByRole("tablist").nth(i)`, in layout order; check its tabs with `getByRole("tab")` and `toHaveText([...])`, and the focus with `aria-selected="true"`. After `Close Others` or `Close to the Right` closes the active tab, the right-clicked tab is selected. If the active tab's save fails, it stays open and selected: `chmod(root, 0o555)` makes the save fail (restore `0o755` in a `finally`), and `Something went wrong` shows.
- **Live preview.** Seed a note with `# H1`, `## H2`, a line with `**bold**`, `*italic*`, `~~struck~~`, a `` `code` `` span and `[text](https://…)`, and one starting with `---\nname: x\n---` frontmatter. Open it, click in the editor and press `Control+End` (cursor outside every element): `getByRole("textbox", { name })` `not.toContainText` `**`, `` ` ``, `# ` or `](https`. Click the text of the bold, the link, the code or a heading: its syntax shows (`toContainText("**bold**")`, the whole `[text](url)`, `## H2`) while the other elements stay hidden. `Control+a` shows everything. The frontmatter note shows `name: x` and `---` with no heading drawn, and `readFile` gives back exactly the seeded text. A `.ts` file containing `**x**` shows it as typed. Heading sizes come from `--heading-1-size` to `--heading-6-size`; judge them in the screenshots (ARIA doesn't carry size).
- **Live preview blocks.** Seed a note with `- tokens`, a nested `  - nested token`, `* grammar`, `+ parse tree`, `1. lexer`, `2. parser`, a two-line quote `> A grammar…` / `> It generates…`, a `---` line, and a fenced `` ```ts `` block with two code lines. Open it, click in the editor and press `Control+End`: the editor `toContainText("• tokens")` and `not.toContainText` `- tokens`, `* grammar`, `>`, `---` and ```` ``` ````, keeps `1. lexer`, and shows the code. Put the cursor on the marker of the first item (`Control+Home`, `ArrowDown`, `Home`): `- tokens` shows and `• grammar` stays. Click a quote line's text (`.cm-line` with `hasText`): that line shows `> `, the other quote line stays hidden. `ArrowDown` onto the rule shows `---`. Click a code line: both fences show (```` ```ts ```` and a closing ```` ``` ````). `Control+a` shows all of it. `readFile` gives back exactly the seeded text. Bars, rule, background and bullets are drawn, not text: judge them in the screenshots, outside and inside each element.
- **Switch live preview and text.** Seed two notes with `# Title` and `Some **bold** text.`, and `code.ts`. Open both notes, click each editor and press `Control+End` (the cursor on the first line would show its `# `). The button is named for its action: `page.getByRole("button", { name: "Switch to text", exact: true })` is visible while the note is in live preview, and the editor `not.toContainText` `**`. Type `X` after `Title`, click the button: it is named `Switch to live preview` now, the editor has the focus back (`toBeFocused`), and it `toContainText("# TitleX")` and `**bold**`. The other note's tab still has `Switch to text`. `Control+e` with focus in the editor switches back, and the next typed character lands where the cursor was. `Control+z` after switching both ways undoes the earlier edits, and `readFile` gives back the original text. Focus the button and press `Enter`: it switches, the editor has the focus, and `Control+e` works right away without a click. `code.ts` has neither button, and `Control+e` there does nothing. After `relaunch()` the notes are in live preview again. The visible label shows the mode (`Live preview` or `Text`), which ARIA doesn't carry (the name is the action); heading size and syntax colors are visual too: judge them in the screenshots.
- **Open a link.** Seed a note with one link per line: `[paper](https://example.com/p.pdf)`, a bare `https://example.com/bare`, `<https://example.com/auto>`, `[rel](material/a.pdf)`, `[js](javascript:alert(1))`, `[file](file:///etc/passwd)`, a plain line, `[https://a.b/shown](https://evil.c/real)` and `[mail](mailto:a@b.c)`. Before opening it, replace `shell.openExternal` through `app.evaluate(({ shell }) => { shell.openExternal = (url) => { globalThis.opened.push(url); return Promise.resolve(); }; })` (a test seam, so no real browser opens; say so in the evidence) and read the list back with another `app.evaluate`. Click the editor and press `Control+End` so every link's syntax is hidden. `line.click({ position, modifiers: ["Control"] })` on the first three adds their URLs, and the text still hides the syntax (the cursor didn't move). On the text of `[https://a.b/shown](https://evil.c/real)` it adds `https://evil.c/real`, the destination and not the text. On the relative, `javascript:` and `file:` ones it adds nothing, because main refuses them; end with a valid link and check the list has only the valid ones. A plain click on the link text only reveals `[paper](https://…)` and opens nothing. With `page.keyboard.down("Control")` and a `hover` over a link, `getComputedStyle(textbox).cursor` is `pointer`; over plain text, a relative or `mailto:` link, or after `keyboard.up`, it is not.
- **Open a link in text mode.** With the same `shell.openExternal` seam, a note in text mode (`Switch to live preview` visible) shows `[paper](https://…)` as typed, and Ctrl+click on its text still adds the URL to the list, as in live preview.
- **Proof.** Snap after opening, after typing and after each disk change. `record` the file content after autosave and after undo.

## Gotchas

- A quote's `>` shows per line, not per quote: only the line the cursor is on. A code block's fences show for the whole block. The window is small, so the note scrolls: snap after moving the cursor, or the element under test may be off screen.
- The real browser opening on Windows is not driven here; the replaced `shell.openExternal` is the proof, so a manual check with `pnpm dev` stays pending.
- Put the link at the start of its line and click a few pixels in (`position: { x: 10, y: 8 }`). The visible text of `[x](url)` is only `x`, so a click farther right lands on nothing.
- The live preview changes only how text is drawn, so assert on the editor's text (`toContainText`) and snap to see sizes. Click the element's own text to put the cursor in it; the click lands inside the element only if its syntax is hidden at that moment, which is the point.
- The editor textbox is named by the path relative to the workshop (`notes/math/groups.md`), while the tab is named by the file name.
- Saving is debounced. Poll the file; reading it right after typing sees the old content.
- Ctrl+W acts on the focused group. Click inside the editor first, or it may close a terminal tab.
- Building two groups with a terminal in the top one takes a real drag: open a terminal from a folder's menu (it joins the last terminal's group) and drag its tab onto the other group's tab strip, retrying inside `toPass`.
- Closing the window with unsaved edits opens a native message box, which Playwright can't click. `ed-close-window`'s discard branch needs `dialog.showMessageBox` replaced through `app.evaluate`, like the folder dialog. Treat it as a test seam and say so in the evidence.
