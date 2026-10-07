// End-to-end: the sidebar's toggle, width and behavior in narrow windows.
import { expect, test, type Page } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  boxOf,
  launch,
  makeWorkshop,
  openWorkshopWith,
  pickFolderInDialog,
  resizeWindow,
  workshopMenuButton,
} from "./helpers.ts";

test("Ctrl+B collapses and expands the sidebar", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    const header = workshopMenuButton(page, "studies");
    await expect(header).toBeInViewport();

    await page.keyboard.press("Control+b");
    await expect(header).not.toBeInViewport();

    await page.keyboard.press("Control+b");
    await expect(header).toBeInViewport();
  } finally {
    await electronApp.close();
  }
});

test("the sidebar and its file tree stay visible in a narrow window", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    await expect(workshopMenuButton(page, "studies")).toBeInViewport();

    await resizeWindow(electronApp, 600, 600);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThan(768);
    await expect(workshopMenuButton(page, "studies")).toBeInViewport();
    const tree = page.getByRole("navigation", { name: "Files" });
    await expect(tree.getByRole("button", { name: ".hone" })).toBeInViewport();
  } finally {
    await electronApp.close();
  }
});

test("the sidebar toggle hides and shows the sidebar, keeping expanded folders", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  await mkdir(path.join(root, "Math"));
  await writeFile(path.join(root, "Math", "algebra.md"), "");

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    const tree = page.getByRole("navigation", { name: "Files" });
    await tree.getByRole("button", { name: "Math" }).click();
    await expect(tree.getByRole("button", { name: "algebra.md" })).toBeInViewport();

    const toggle = page.getByRole("button", { name: "Toggle Sidebar" });
    await toggle.click();
    await expect(workshopMenuButton(page, "studies")).not.toBeInViewport();

    await toggle.click();
    await expect(workshopMenuButton(page, "studies")).toBeInViewport();
    await expect(tree.getByRole("button", { name: "Math" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(tree.getByRole("button", { name: "algebra.md" })).toBeInViewport();
  } finally {
    await electronApp.close();
  }
});

const sidebarContainer = (page: Page) => page.locator('[data-slot="sidebar-container"]');

async function sidebarWidth(page: Page): Promise<number> {
  return (await boxOf(sidebarContainer(page))).width;
}

/** Drags the sidebar's right edge to `x`, measured from the window's left edge, like a user would. */
async function dragSidebarEdgeTo(page: Page, x: number): Promise<void> {
  const edge = await boxOf(page.getByRole("separator", { name: "Resize sidebar" }));
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, edge.y + edge.height / 2, { steps: 5 });
  await page.mouse.up();
}

test("dragging the sidebar's edge resizes it, and the width comes back after relaunching", async () => {
  const { userData, electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  try {
    await expect.poll(() => sidebarWidth(page)).toBe(256);
    await dragSidebarEdgeTo(page, 340);
    await expect.poll(() => sidebarWidth(page)).toBe(340);
  } finally {
    await electronApp.close();
  }

  const relaunched = await launch(userData);
  try {
    const relaunchedPage = await relaunched.firstWindow();
    await expect(workshopMenuButton(relaunchedPage, "studies")).toBeVisible();
    await expect.poll(() => sidebarWidth(relaunchedPage)).toBe(340);
  } finally {
    await relaunched.close();
  }
});

test("dragging the sidebar's edge to the far left collapses it, and reopening restores its width", async () => {
  const { electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  try {
    const header = workshopMenuButton(page, "studies");
    await dragSidebarEdgeTo(page, 340);
    await expect.poll(() => sidebarWidth(page)).toBe(340);

    await dragSidebarEdgeTo(page, 0);
    await expect(header).not.toBeInViewport();

    await page.keyboard.press("Control+b");
    await expect(header).toBeInViewport();
    await expect.poll(() => sidebarWidth(page)).toBe(340);

    await dragSidebarEdgeTo(page, 0);
    await expect(header).not.toBeInViewport();
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect(header).toBeInViewport();
    await expect.poll(() => sidebarWidth(page)).toBe(340);
  } finally {
    await electronApp.close();
  }
});

test("the sidebar's width stops at 180 px and at half the window's width", async () => {
  const { electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  try {
    await dragSidebarEdgeTo(page, 120);
    await expect.poll(() => sidebarWidth(page)).toBe(180);

    const windowWidth = await page.evaluate(() => window.innerWidth);
    await dragSidebarEdgeTo(page, windowWidth - 20);
    await expect.poll(() => sidebarWidth(page)).toBe(Math.round(windowWidth / 2));

    // A smaller window shows less of the stored width, and a larger one shows all of it again.
    await resizeWindow(electronApp, 700, 600);
    await expect
      .poll(
        async () =>
          (await sidebarWidth(page)) <= (await page.evaluate(() => window.innerWidth)) / 2,
      )
      .toBe(true);
    await resizeWindow(electronApp, 1000, 650);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(windowWidth);
    await expect.poll(() => sidebarWidth(page)).toBe(Math.round(windowWidth / 2));
  } finally {
    await electronApp.close();
  }
});

test("resizing the window across the old mobile width keeps expanded folders", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  await mkdir(path.join(root, "Math"));
  await writeFile(path.join(root, "Math", "algebra.md"), "");

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    const tree = page.getByRole("navigation", { name: "Files" });
    await tree.getByRole("button", { name: "Math" }).click();
    await expect(tree.getByRole("button", { name: "algebra.md" })).toBeInViewport();

    await resizeWindow(electronApp, 600, 600);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThan(768);
    await resizeWindow(electronApp, 1000, 650);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeGreaterThanOrEqual(768);

    await expect(tree.getByRole("button", { name: "Math" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(tree.getByRole("button", { name: "algebra.md" })).toBeInViewport();
  } finally {
    await electronApp.close();
  }
});
