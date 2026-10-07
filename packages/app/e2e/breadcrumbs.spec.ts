// End-to-end: the breadcrumbs above each editor and their folder menus.
import { expect, test } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { openWorkshopWith } from "./helpers.ts";

/** Launches the app on a workshop with `notes/math/algebra.md` open in a tab, through the tree. */
async function openNestedNote() {
  const opened = await openWorkshopWith(async (workshop) => {
    await mkdir(path.join(workshop, "notes", "math"), { recursive: true });
    await mkdir(path.join(workshop, "notes", "archive"));
    await writeFile(path.join(workshop, "notes", "index.md"), "Index.\n");
    await writeFile(path.join(workshop, "notes", "math", "algebra.md"), "Groups.\n");
    await writeFile(path.join(workshop, "notes", "math", "groups.md"), "Rings.\n");
    await writeFile(path.join(workshop, "top.md"), "Top.\n");
  });
  const { page, tree } = opened;
  await tree.getByRole("button", { name: "notes" }).click();
  await tree.getByRole("button", { name: "math" }).click();
  await tree.getByRole("button", { name: "algebra.md" }).click();
  const breadcrumbs = page.getByRole("navigation", { name: "breadcrumb" });
  await expect(breadcrumbs).toBeVisible();
  return { ...opened, breadcrumbs };
}

test("an open file's breadcrumbs show the workshop, its folders and the file's name", async () => {
  const { electronApp, breadcrumbs } = await openNestedNote();
  try {
    await expect(breadcrumbs.getByRole("listitem")).toHaveText([
      "studies",
      "notes",
      "math",
      "algebra.md",
    ]);
    await expect(breadcrumbs.getByRole("button")).toHaveText(["studies", "notes", "math"]);
  } finally {
    await electronApp.close();
  }
});

test("a folder segment's menu lists its entries, folders first, and opens files in tabs or focuses them", async () => {
  const { electronApp, page, breadcrumbs } = await openNestedNote();
  try {
    await breadcrumbs.getByRole("button", { name: "notes" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText(["archive", "math", "index.md"]);

    await menu.getByRole("menuitem", { name: "math" }).click();
    const submenu = page
      .getByRole("menu")
      .filter({ has: page.getByRole("menuitem", { name: "groups.md" }) });
    await expect(submenu.getByRole("menuitem")).toHaveText(["algebra.md", "groups.md"]);
    await submenu.getByRole("menuitem", { name: "groups.md" }).click();
    await expect(page.getByRole("tab", { name: "groups.md" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "notes/math/groups.md" })).toContainText(
      "Rings.",
    );
    await expect(page.getByRole("tab", { name: "algebra.md" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    await breadcrumbs.getByRole("button", { name: "math" }).click();
    await page.getByRole("menuitem", { name: "algebra.md" }).click();
    await expect(page.getByRole("tab", { name: "algebra.md" })).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "algebra.md" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  } finally {
    await electronApp.close();
  }
});

test("a folder's submenu says when the folder is empty, and shows the error when it can't be listed, toasting it once", async () => {
  const { root, electronApp, page, breadcrumbs } = await openNestedNote();
  try {
    await breadcrumbs.getByRole("button", { name: "notes" }).click();
    await page.getByRole("menuitem", { name: "archive" }).click();
    const archive = page.getByRole("menu", { name: "archive" });
    await expect(archive.getByText("Empty folder")).toBeVisible();

    // The first closes the submenu, the second the menu.
    await page.keyboard.press("Escape");
    await expect(archive).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "notes" })).toBeHidden();

    await breadcrumbs.getByRole("button", { name: "notes" }).click();
    await expect(page.getByRole("menuitem", { name: "archive" })).toBeVisible();
    // Gone after the menu listed it, so its submenu lists a folder that no longer exists.
    await rm(path.join(root, "notes", "archive"), { recursive: true });
    await page.getByRole("menuitem", { name: "archive" }).press("ArrowRight");
    await expect(archive.getByRole("alert")).toHaveText(/\S/);

    // Opening it again lists it again and shows the error in the menu, but by then a second toast would have shown up.
    await page.keyboard.press("Escape");
    await expect(archive).toBeHidden();
    await page.getByRole("menuitem", { name: "archive" }).press("ArrowRight");
    await expect(archive.getByRole("alert")).toHaveText(/\S/);
    await expect(page.getByText("Something went wrong")).toHaveCount(1);
  } finally {
    await electronApp.close();
  }
});

test("the workshop segment's menu lists the workshop root's entries", async () => {
  const { electronApp, page, breadcrumbs } = await openNestedNote();
  try {
    await breadcrumbs.getByRole("button", { name: "studies" }).click();
    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
      ".hone",
      "notes",
      "top.md",
    ]);
  } finally {
    await electronApp.close();
  }
});

test("renaming a folder above the open file from the tree renames its breadcrumb segment", async () => {
  const { electronApp, page, tree, breadcrumbs } = await openNestedNote();
  try {
    await tree.getByRole("button", { name: "math" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const name = tree.getByRole("textbox", { name: "Name" });
    await name.fill("maths");
    await name.press("Enter");

    await expect(breadcrumbs.getByRole("listitem")).toHaveText([
      "studies",
      "notes",
      "maths",
      "algebra.md",
    ]);
  } finally {
    await electronApp.close();
  }
});

test("a file created on disk after the editor opened shows up the next time its folder's menu opens", async () => {
  const { root, electronApp, page, breadcrumbs } = await openNestedNote();
  try {
    await breadcrumbs.getByRole("button", { name: "math" }).click();
    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
      "algebra.md",
      "groups.md",
    ]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();

    await writeFile(path.join(root, "notes", "math", "fields.md"), "Fields.\n");
    await breadcrumbs.getByRole("button", { name: "math" }).click();
    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
      "algebra.md",
      "fields.md",
      "groups.md",
    ]);
  } finally {
    await electronApp.close();
  }
});
