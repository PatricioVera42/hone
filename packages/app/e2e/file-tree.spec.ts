// End-to-end: the file tree, and creating, renaming and deleting files and folders from it.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { launch, makeWorkshop, openWorkshopWith, pickFolderInDialog } from "./helpers.ts";

test("the sidebar lists the workshop's files, folders first, and loads a folder when it's expanded", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  await writeFile(path.join(root, "Agenda.md"), "");
  await mkdir(path.join(root, "physics"));
  await mkdir(path.join(root, "Math"));
  await writeFile(path.join(root, "biology.md"), "");
  await mkdir(path.join(root, "node_modules"));

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    const tree = page.getByRole("navigation", { name: "Files" });
    // `node_modules` is left out of the exact list: the host omits it.
    await expect(tree.getByRole("button")).toHaveText([
      ".hone",
      "Math",
      "physics",
      "Agenda.md",
      "biology.md",
    ]);

    // Written after the tree loaded the root, so it only shows up if expanding lists the folder then.
    await writeFile(path.join(root, "Math", "algebra.md"), "");
    const math = tree.getByRole("button", { name: "Math" });
    await expect(math).toHaveAttribute("aria-expanded", "false");
    await math.click();
    await expect(math).toHaveAttribute("aria-expanded", "true");
    await expect(tree.getByRole("button", { name: "algebra.md" })).toBeVisible();

    await math.click();
    await expect(tree.getByRole("button", { name: "algebra.md" })).toBeHidden();
  } finally {
    await electronApp.close();
  }
});

test("files created and deleted on disk show up in the tree on their own", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  await mkdir(path.join(root, "Math"));
  await writeFile(path.join(root, "Math", "old.md"), "");

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    const tree = page.getByRole("navigation", { name: "Files" });
    await tree.getByRole("button", { name: "Math" }).click();
    await expect(tree.getByRole("button", { name: "old.md" })).toBeVisible();

    await writeFile(path.join(root, "Math", "algebra.md"), "");
    await expect(tree.getByRole("button", { name: "algebra.md" })).toBeVisible();

    await rm(path.join(root, "Math", "old.md"));
    await expect(tree.getByRole("button", { name: "old.md" })).toBeHidden();
  } finally {
    await electronApp.close();
  }
});

test("a folder that can't be listed shows an error once, then shows as unavailable", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  const outside = path.join(temporary, "outside");
  await mkdir(outside);
  await symlink(outside, path.join(root, "escape"));
  await mkdir(path.join(root, "Math"));
  await writeFile(path.join(root, "Math", "algebra.md"), "");

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    const tree = page.getByRole("navigation", { name: "Files" });
    const escape = tree.getByRole("button", { name: "escape" });
    await escape.click();

    const toast = page.getByText("escape is outside the workshop");
    await expect(toast).toBeVisible();
    await expect(tree.locator('[data-sidebar="menu-skeleton"]')).toHaveCount(0);
    await expect(escape).toBeDisabled();
    await expect(escape).not.toHaveAttribute("aria-expanded");
    // Only the folder icon is left: the chevron is gone.
    await expect(escape.locator("svg")).toHaveCount(1);
    await expect(escape).toHaveAccessibleDescription("escape is outside the workshop");

    await escape.click({ force: true });
    // The mouse can't reach the button, but the keyboard can.
    await escape.press("Enter");
    // A folder that lists fine still opens, and by then a second toast would have shown up.
    await tree.getByRole("button", { name: "Math" }).click();
    await expect(tree.getByRole("button", { name: "algebra.md" })).toBeVisible();
    await expect(toast).toHaveCount(1);

    // The button ignores the pointer, so the row under it is what the mouse reaches.
    await escape.hover({ force: true });
    await expect(page.locator("[data-slot=tooltip-content]")).toHaveText(
      "escape is outside the workshop",
    );
  } finally {
    await electronApp.close();
  }
});

test("New note on a folder creates the note with .md appended and opens it", async () => {
  const { root, electronApp, page, tree } = await openWorkshopWith((workshop) =>
    mkdir(path.join(workshop, "math")),
  );
  try {
    await tree.getByRole("button", { name: "math" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "New note" }).click();
    await tree.getByRole("textbox", { name: "Name" }).fill("idea");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("tab", { name: "idea.md" })).toBeVisible();
    await expect(tree.getByRole("button", { name: "idea.md" })).toBeVisible();
    await expect(readFile(path.join(root, "math", "idea.md"), "utf8")).resolves.toBe("");
  } finally {
    await electronApp.close();
  }
});

test("a name that already exists shows an error under the row and creates nothing", async () => {
  const { root, electronApp, page, tree } = await openWorkshopWith((workshop) =>
    writeFile(path.join(workshop, "idea.md"), "Taken."),
  );
  try {
    // The empty space below the last row stands for the workshop root.
    const box = await tree.boundingBox();
    await tree.click({ button: "right", position: { x: 10, y: (box?.height ?? 0) - 10 } });
    await page.getByRole("menuitem", { name: "New file" }).click();
    const name = tree.getByRole("textbox", { name: "Name" });
    await name.fill("idea.md");
    await name.press("Enter");

    await expect(tree.getByRole("alert")).toHaveText("idea.md already exists in this folder.");
    await expect(name).toBeVisible();
    await expect(readFile(path.join(root, "idea.md"), "utf8")).resolves.toBe("Taken.");

    await name.press("Escape");
    await expect(name).toBeHidden();
    await expect(readdir(root)).resolves.toHaveLength(2);
  } finally {
    await electronApp.close();
  }
});

test("F2 on an open file renames it on disk and in its tab", async () => {
  const { root, electronApp, page, tree } = await openWorkshopWith((workshop) =>
    writeFile(path.join(workshop, "idea.md"), "Groups.\n"),
  );
  try {
    await tree.getByRole("button", { name: "idea.md" }).click();
    await expect(page.getByRole("tab", { name: "idea.md" })).toBeVisible();

    await tree.getByRole("button", { name: "idea.md" }).press("F2");
    const name = tree.getByRole("textbox", { name: "Name" });
    await expect(name).toHaveValue("idea.md");
    await name.fill("plan.md");
    await name.press("Enter");

    await expect(page.getByRole("tab", { name: "plan.md" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "idea.md" })).toHaveCount(0);
    await expect(tree.getByRole("button", { name: "plan.md" })).toBeVisible();
    await expect(readdir(root)).resolves.not.toContain("idea.md");
    await expect(readFile(path.join(root, "plan.md"), "utf8")).resolves.toBe("Groups.\n");
  } finally {
    await electronApp.close();
  }
});

/** Renames the file `from` in the tree, which is open in an editor tab, to `to`. */
async function renameInTree(page: Page, tree: Locator, from: string, to: string): Promise<void> {
  await tree.getByRole("button", { name: from }).press("F2");
  const name = tree.getByRole("textbox", { name: "Name" });
  await name.fill(to);
  await name.press("Enter");
  await expect(tree.getByRole("button", { name: to })).toBeVisible();
  await expect(page.getByRole("tab", { name: to })).toBeVisible();
}

test("renaming an open file switches its editor between code and note settings, keeping what's typed", async () => {
  const { root, electronApp, page, tree } = await openWorkshopWith((workshop) =>
    writeFile(path.join(workshop, "notes.txt"), "Groups.\n"),
  );
  try {
    await tree.getByRole("button", { name: "notes.txt" }).click();
    const editor = page.getByRole("textbox", { name: "notes.txt" });
    const lineNumbers = page.locator(".cm-lineNumbers");
    await expect(lineNumbers).toBeVisible();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Rings.");

    await renameInTree(page, tree, "notes.txt", "notes.md");
    await expect(page.getByRole("textbox", { name: "notes.md" })).toHaveText("Groups.Rings.");
    await expect(lineNumbers).toBeHidden();
    // The typed text is saved to the renamed file.
    await page.getByRole("textbox", { name: "notes.md" }).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Fields.");
    await expect
      .poll(() => readFile(path.join(root, "notes.md"), "utf8"))
      .toBe("Groups.\nRings.Fields.");

    await renameInTree(page, tree, "notes.md", "notes.txt");
    await expect(page.getByRole("textbox", { name: "notes.txt" })).toHaveText(
      "Groups.Rings.Fields.",
    );
    await expect(lineNumbers).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test("renaming a folder keeps its open files' tabs, saving to their new paths", async () => {
  const { root, electronApp, page, tree } = await openWorkshopWith(async (workshop) => {
    await mkdir(path.join(workshop, "math"));
    await writeFile(path.join(workshop, "math", "algebra.md"), "Groups.\n");
  });
  try {
    await tree.getByRole("button", { name: "math" }).click();
    await tree.getByRole("button", { name: "algebra.md" }).click();
    await expect(page.getByRole("tab", { name: "algebra.md" })).toBeVisible();

    await tree.getByRole("button", { name: "math" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const name = tree.getByRole("textbox", { name: "Name" });
    await name.fill("maths");
    await name.press("Enter");
    await expect(tree.getByRole("button", { name: "maths" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(tree.getByRole("button", { name: "algebra.md" })).toBeVisible();

    // Leaves time for the watcher's deletion of the old paths, which mustn't close the tab.
    await page.waitForTimeout(500);
    await expect(page.getByRole("tab", { name: "algebra.md" })).toBeVisible();
    await page.getByRole("textbox", { name: "maths/algebra.md" }).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("Rings.");
    await expect
      .poll(() => readFile(path.join(root, "maths", "algebra.md"), "utf8"))
      .toBe("Groups.\nRings.");
    await expect(readdir(root)).resolves.not.toContain("math");
  } finally {
    await electronApp.close();
  }
});

test("deleting a folder says how many files it holds, and confirming removes it and closes its tabs", async () => {
  const { root, electronApp, page, tree } = await openWorkshopWith(async (workshop) => {
    await mkdir(path.join(workshop, "math", "algebra"), { recursive: true });
    await writeFile(path.join(workshop, "math", "groups.md"), "Groups.\n");
    await writeFile(path.join(workshop, "math", ".hidden"), "");
    await writeFile(path.join(workshop, "math", "algebra", "rings.md"), "");
    await writeFile(path.join(workshop, "other.md"), "");
  });
  try {
    await tree.getByRole("button", { name: "math" }).click();
    await tree.getByRole("button", { name: "groups.md" }).click();
    await tree.getByRole("button", { name: "other.md" }).click();
    await expect(page.getByRole("tab", { name: "groups.md" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "other.md" })).toBeVisible();

    await tree.getByRole("button", { name: "math" }).press("Delete");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("3 files");
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByRole("tab", { name: "groups.md" })).toBeHidden();
    await expect(page.getByRole("tab", { name: "other.md" })).toBeVisible();
    await expect(tree.getByRole("button", { name: "math" })).toBeHidden();
    await expect(readdir(root)).resolves.not.toContain("math");
  } finally {
    await electronApp.close();
  }
});
