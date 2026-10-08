// End-to-end: editing notes and code files, saving them, and following changes on disk.
import { expect, test, type ElectronApplication } from "@playwright/test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { BaseWindow, MessageBoxOptions } from "electron";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  launch,
  makeWorkshop,
  openWorkshopWith,
  pickFolderInDialog,
  renameInTree,
  workshopMenuButton,
} from "./helpers.ts";

test("clicking a note opens it in an editor tab once, and Ctrl+W closes it", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  await writeFile(path.join(root, "algebra.md"), "# Algebra\n\nGroups and rings.\n");

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    const tree = page.getByRole("navigation", { name: "Files" });
    await tree.getByRole("button", { name: "algebra.md" }).click();

    await expect(page.getByRole("tab", { name: "algebra.md" })).toBeVisible();
    const editor = page.getByRole("textbox", { name: "algebra.md" });
    await expect(editor).toContainText("Groups and rings.");

    await tree.getByRole("button", { name: "algebra.md" }).click();
    await expect(page.getByRole("tab", { name: "algebra.md" })).toHaveCount(1);

    await editor.click();
    await page.keyboard.press("Control+w");
    await expect(page.getByRole("tab", { name: "algebra.md" })).toHaveCount(0);
    await expect(editor).toBeHidden();
  } finally {
    await electronApp.close();
  }
});

test("a binary file shows a message instead of an editor", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  await writeFile(path.join(root, "photo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    await page
      .getByRole("navigation", { name: "Files" })
      .getByRole("button", { name: "photo.png" })
      .click();

    await expect(page.getByRole("tab", { name: "photo.png" })).toBeVisible();
    await expect(page.getByText("This file can't be opened in Hone")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "photo.png" })).toBeHidden();
  } finally {
    await electronApp.close();
  }
});

/** Launches the app on a workshop holding one file, and opens it in an editor tab. */
async function openFileInEditor(name: string, content: string) {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  await writeFile(path.join(root, name), content);
  const electronApp = await launch(path.join(temporary, "user-data"));
  const page = await electronApp.firstWindow();
  await pickFolderInDialog(electronApp, root);
  await page.getByRole("button", { name: "Open workshop" }).click();
  await page.getByRole("navigation", { name: "Files" }).getByRole("button", { name }).click();
  const editor = page.getByRole("textbox", { name });
  await expect(editor).toBeVisible();
  return { temporary, root, file: path.join(root, name), electronApp, page, editor };
}

test("typing in a note saves it to disk shortly after", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor("algebra.md", "Groups.\n");
  try {
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Rings.");
    await expect.poll(() => readFile(file, "utf8")).toBe("Groups.\nRings.");
  } finally {
    await electronApp.close();
  }
});

for (const name of ["algebra.md", "algebra.txt"]) {
  test(`in ${name}, Ctrl+Z undoes typing and saves the undo, and Ctrl+Y and Ctrl+Shift+Z each redo it`, async () => {
    const { file, electronApp, page, editor } = await openFileInEditor(name, "Groups.\n");
    try {
      await editor.click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("Rings.");
      await expect.poll(() => readFile(file, "utf8")).toBe("Groups.\nRings.");

      await page.keyboard.press("Control+z");
      await expect(editor).toHaveText("Groups.");
      await expect.poll(() => readFile(file, "utf8")).toBe("Groups.\n");
      await page.keyboard.press("Control+y");
      await expect(editor).toHaveText("Groups.Rings.");
      await expect.poll(() => readFile(file, "utf8")).toBe("Groups.\nRings.");
      await page.keyboard.press("Control+z");
      await expect(editor).toHaveText("Groups.");
      await page.keyboard.press("Control+Shift+z");
      await expect(editor).toHaveText("Groups.Rings.");
    } finally {
      await electronApp.close();
    }
  });
}

test("Ctrl+Z after renaming an open file undoes the edit made before the rename", async () => {
  const { root, electronApp, page, tree } = await openWorkshopWith((workshop) =>
    writeFile(path.join(workshop, "idea.md"), "Groups.\n"),
  );
  try {
    await tree.getByRole("button", { name: "idea.md" }).click();
    await page.getByRole("textbox", { name: "idea.md" }).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Rings.");
    await expect.poll(() => readFile(path.join(root, "idea.md"), "utf8")).toBe("Groups.\nRings.");

    await renameInTree(page, tree, "idea.md", "plan.md");
    const editor = page.getByRole("textbox", { name: "plan.md" });
    await editor.click();
    await page.keyboard.press("Control+z");
    await expect(editor).toHaveText("Groups.");
    await expect.poll(() => readFile(path.join(root, "plan.md"), "utf8")).toBe("Groups.\n");
  } finally {
    await electronApp.close();
  }
});

test("typing { in a code file closes it, Backspace removes the pair and Enter splits it", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor("notes.txt", "x\n");
  try {
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("{");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("y{");
    await page.keyboard.press("Enter");
    await expect.poll(() => readFile(file, "utf8")).toBe("x\ny{\n\n}");
  } finally {
    await electronApp.close();
  }
});

test("Tab indents in a code file and Shift+Tab dedents, and Ctrl+L then Tab indents the line", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor(
    "greet.ts",
    "function greet() {\n    return 1;\n}\n",
  );
  try {
    await editor.click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Tab");
    await expect
      .poll(() => readFile(file, "utf8"))
      .toBe("    function greet() {\n    return 1;\n}\n");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Control+l");
    await page.keyboard.press("Tab");
    await expect
      .poll(() => readFile(file, "utf8"))
      .toBe("function greet() {\n        return 1;\n}\n");
  } finally {
    await electronApp.close();
  }
});

test("in a note Tab moves focus out of the editor instead of indenting", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor("algebra.md", "- Groups.\n");
  try {
    await editor.click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Tab");
    await expect(editor).not.toBeFocused();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("x");
    await expect.poll(() => readFile(file, "utf8")).toBe("- Groups.\nx");
  } finally {
    await electronApp.close();
  }
});

test("in a code file Escape then Tab moves focus out of the editor, and Tab indents again once another key is pressed", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor("greet.ts", "x\n");
  try {
    await editor.click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await expect(editor).not.toBeFocused();
    await editor.click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Tab");
    await expect(editor).toBeFocused();
    await expect.poll(() => readFile(file, "utf8")).toBe("  x\n");
  } finally {
    await electronApp.close();
  }
});

test("in a code file Ctrl+M does nothing, and Tab after it still indents", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor("greet.ts", "x\n");
  try {
    await editor.click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Control+m");
    await page.keyboard.type("y");
    await expect.poll(() => readFile(file, "utf8")).toBe("yx\n");
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Tab");
    await expect(editor).toBeFocused();
    await expect.poll(() => readFile(file, "utf8")).toBe("  yx\n");
  } finally {
    await electronApp.close();
  }
});

test("typing a code fence in a note closes it, and Enter after the language splits it", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor("algebra.md", "x\n\n");
  try {
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("```js");
    await page.keyboard.press("Enter");
    await page.keyboard.type("1");
    await expect.poll(() => readFile(file, "utf8")).toBe("x\n\n```js\n1\n```");
  } finally {
    await electronApp.close();
  }
});

test("a note rewritten on disk shows its new content in the editor", async () => {
  const { file, electronApp, editor } = await openFileInEditor("algebra.md", "Groups.\n");
  try {
    await expect(editor).toContainText("Groups.");
    await writeFile(file, "Fields.\n");
    await expect(editor).toContainText("Fields.");
    await expect(editor).not.toContainText("Groups.");
  } finally {
    await electronApp.close();
  }
});

test("Ctrl+Z after a note is rewritten on disk changes neither the editor nor the file", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor("algebra.md", "Groups.\n");
  try {
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Rings.");
    await expect.poll(() => readFile(file, "utf8")).toBe("Groups.\nRings.");
    await writeFile(file, "Fields.\n");
    await expect(editor).toHaveText("Fields.");

    await editor.click();
    await page.keyboard.press("Control+z");
    // Long enough for an undo to reach the editor and be saved, if it happened.
    await page.waitForTimeout(1000);
    await expect(editor).toHaveText("Fields.");
    await expect(readFile(file, "utf8")).resolves.toBe("Fields.\n");
  } finally {
    await electronApp.close();
  }
});

test("Ctrl+Y after a note is rewritten on disk doesn't redo an edit undone before it", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor("algebra.md", "Groups.\n");
  try {
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Rings.");
    await expect.poll(() => readFile(file, "utf8")).toBe("Groups.\nRings.");
    await page.keyboard.press("Control+z");
    await expect.poll(() => readFile(file, "utf8")).toBe("Groups.\n");
    await writeFile(file, "Fields.\n");
    await expect(editor).toHaveText("Fields.");

    await editor.click();
    await page.keyboard.press("Control+y");
    // Long enough for a redo to reach the editor and be saved, if it happened.
    await page.waitForTimeout(1000);
    await expect(editor).toHaveText("Fields.");
    await expect(readFile(file, "utf8")).resolves.toBe("Fields.\n");
  } finally {
    await electronApp.close();
  }
});

test("a note rewritten on disk while edits are pending shows the disk version and says the edits were discarded", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor("algebra.md", "Groups.\n");
  try {
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Rings.");
    // Well within the save delay, so the edits are still pending when the change arrives.
    await writeFile(file, "Fields.\n");

    await expect(editor).toContainText("Fields.");
    await expect(editor).not.toContainText("Rings.");
    await expect(
      page.getByText("algebra.md changed on disk; your latest edits were discarded."),
    ).toBeVisible();
    // Nothing overwrites the disk version later on.
    await page.waitForTimeout(1000);
    await expect(readFile(file, "utf8")).resolves.toBe("Fields.\n");
  } finally {
    await electronApp.close();
  }
});

test("deleting an open file on disk closes its tab", async () => {
  const { file, electronApp, page } = await openFileInEditor("algebra.md", "Groups.\n");
  try {
    await expect(page.getByRole("tab", { name: "algebra.md" })).toBeVisible();
    await rm(file);
    await expect(page.getByRole("tab", { name: "algebra.md" })).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});

test("a file with CRLF line endings keeps them after an edit", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor(
    "algebra.md",
    "Groups.\r\nRings.\r\n",
  );
  try {
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Fields.");
    await page.keyboard.press("Enter");
    await expect.poll(() => readFile(file, "utf8")).toBe("Groups.\r\nRings.\r\nFields.\r\n");
  } finally {
    await electronApp.close();
  }
});

test("switching workshops right after typing saves the edits first", async () => {
  const { temporary, file, electronApp, page, editor } = await openFileInEditor(
    "algebra.md",
    "Groups.\n",
  );
  const work = await makeWorkshop(temporary, "work");
  try {
    await pickFolderInDialog(electronApp, work);
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Rings.");
    await workshopMenuButton(page, "studies").click();
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();

    await expect(workshopMenuButton(page, "work")).toBeVisible();
    await expect(readFile(file, "utf8")).resolves.toBe("Groups.\nRings.");
  } finally {
    await electronApp.close();
  }
});

test("closing the window right after typing saves the edits first", async () => {
  const { file, electronApp, page, editor } = await openFileInEditor("algebra.md", "Groups.\n");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Rings.");
  await electronApp.close();

  await expect(readFile(file, "utf8")).resolves.toBe("Groups.\nRings.");
});

test("closing a tab whose save fails keeps it open with the edits, and closing it once saving works saves them", async () => {
  const { root, file, electronApp, page, editor } = await openFileInEditor(
    "algebra.md",
    "Groups.\n",
  );
  try {
    // The save writes a temporary sibling first, which a read-only folder refuses.
    await chmod(root, 0o555);
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Rings.");
    await page.keyboard.press("Control+w");

    await expect(page.getByText("Something went wrong")).toBeVisible();
    await expect(page.getByRole("tab", { name: "algebra.md" })).toBeVisible();
    await expect(editor).toContainText("Rings.");

    await chmod(root, 0o755);
    await editor.click();
    await page.keyboard.press("Control+w");
    await expect(page.getByRole("tab", { name: "algebra.md" })).toHaveCount(0);
    await expect(readFile(file, "utf8")).resolves.toBe("Groups.\nRings.");
  } finally {
    await chmod(root, 0o755);
    await electronApp.close();
  }
});

declare global {
  // The messages of the message boxes answerMessageBoxes answered, kept in main.
  var honeMessageBoxes: string[] | undefined;
}

/**
 * Replaces the native message box, which Playwright can't drive, so it answers with the button labelled `answer`
 * and records its message for {@link messageBoxesShown}.
 */
async function answerMessageBoxes(electronApp: ElectronApplication, answer: string): Promise<void> {
  await electronApp.evaluate(({ dialog }, button) => {
    globalThis.honeMessageBoxes ??= [];
    dialog.showMessageBox = (...args: [BaseWindow, MessageBoxOptions] | [MessageBoxOptions]) => {
      const options = args.length === 2 ? args[1] : args[0];
      globalThis.honeMessageBoxes?.push(options.message);
      const response = options.buttons?.indexOf(button) ?? -1;
      return Promise.resolve({ response, checkboxChecked: false });
    };
  }, answer);
}

function messageBoxesShown(electronApp: ElectronApplication): Promise<string[] | undefined> {
  return electronApp.evaluate(() => globalThis.honeMessageBoxes);
}

/** Closes the window the way its close button would. */
async function closeWindow(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
}

test("closing the window with edits that aren't saved yet asks first: Cancel keeps it open, Discard closes it", async () => {
  const { root, file, electronApp, page, editor } = await openFileInEditor(
    "algebra.md",
    "Groups.\n",
  );
  try {
    await chmod(root, 0o555);
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Rings.");

    await answerMessageBoxes(electronApp, "Cancel");
    await closeWindow(electronApp);
    await expect
      .poll(() => messageBoxesShown(electronApp))
      .toStrictEqual(["Some edits aren't saved yet."]);
    await expect(editor).toContainText("Rings.");
    expect(page.isClosed()).toBe(false);

    await answerMessageBoxes(electronApp, "Discard and close");
    const closed = electronApp.waitForEvent("close");
    await closeWindow(electronApp);
    await closed;
    await expect(readFile(file, "utf8")).resolves.toBe("Groups.\n");
  } finally {
    await chmod(root, 0o755);
    await electronApp.close();
  }
});
