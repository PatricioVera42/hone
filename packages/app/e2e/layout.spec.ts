// End-to-end: tabs, their layout, and restoring it across workshops and launches.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  boxOf,
  launch,
  makeWorkshop,
  openWorkshopWith,
  pickFolderInDialog,
  runInTerminal,
  workshopMenuButton,
} from "./helpers.ts";

test("opening another workshop closes every editor tab and shows that workshop's layout", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const studies = await makeWorkshop(temporary, "studies");
  const work = await makeWorkshop(temporary, "work");
  await writeFile(path.join(studies, "algebra.md"), "Groups.\n");

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, studies);
    await page.getByRole("button", { name: "Open workshop" }).click();
    await page
      .getByRole("navigation", { name: "Files" })
      .getByRole("button", { name: "algebra.md" })
      .click();
    await expect(page.getByRole("tab", { name: "algebra.md" })).toBeVisible();

    await workshopMenuButton(page, "studies").click();
    await pickFolderInDialog(electronApp, work);
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(workshopMenuButton(page, "work")).toBeVisible();
    await expect(page.getByRole("tab", { name: "algebra.md" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "work" })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

/**
 * Makes the page press `key` (a `code` and a `key`) at the very moment a tab named `tabName` shows. A mutation
 * observer's callback runs as a microtask, before React renders again, so when that tab belongs to a layout that
 * was just built, the press lands before the editor area has re-rendered with it.
 */
function pressWhenTabShows(
  page: Page,
  tabName: string,
  key: { code: string; key: string },
): Promise<void> {
  return page.evaluate(
    ({ tab, pressed }) => {
      const observer = new MutationObserver(() => {
        const shown = [...document.querySelectorAll(".dv-tab")].some(
          (element) => element.textContent === tab,
        );
        if (!shown) return;
        observer.disconnect();
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", {
            ...pressed,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },
    { tab: tabName, pressed: key },
  );
}

test("Ctrl+` pressed as the default layout's terminal tab shows still opens a terminal", async () => {
  const { electronApp, page } = await openWorkshopWith(
    () => Promise.resolve(),
    (opening) => pressWhenTabShows(opening, "studies", { code: "Backquote", key: "`" }),
  );
  try {
    await expect(page.getByRole("tab", { name: "studies" })).toHaveCount(2);
  } finally {
    await electronApp.close();
  }
});

test("Ctrl+W pressed as a restored layout's tabs show still closes the active tab", async () => {
  const { electronApp, page, tree, root } = await openWorkshopWith(async (workshop) => {
    await writeFile(path.join(workshop, "algebra.md"), "Groups.\n");
  });
  const work = await makeWorkshop(await mkdtemp(path.join(tmpdir(), "hone-e2e-")), "work");
  try {
    await tree.getByRole("button", { name: "algebra.md" }).click();
    await expect(page.getByRole("tab", { name: "algebra.md" })).toBeVisible();

    await pickFolderInDialog(electronApp, work);
    await workshopMenuButton(page, "studies").click();
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(page.getByRole("tab", { name: "work" })).toBeVisible();

    await pressWhenTabShows(page, "algebra.md", { code: "KeyW", key: "w" });
    await pickFolderInDialog(electronApp, root);
    await workshopMenuButton(page, "work").click();
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(page.getByRole("tab", { name: "studies" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "algebra.md" })).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});

/** Drags the tab of the terminal titled `title` onto the right edge of `editor`, splitting it off to the editor's right. */
async function moveTerminalRightOf(page: Page, title: string, editor: Locator) {
  const terminal = page.getByRole("region", { name: `Terminal in ${title}` });
  // Retried, since a drag can end before dockview has shown where it would drop.
  await expect(async () => {
    const tab = await boxOf(page.getByRole("tab", { name: title }));
    const editorBox = await boxOf(editor);
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
    await page.mouse.down();
    await page.mouse.move(editorBox.x + editorBox.width - 5, editorBox.y + editorBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    expect((await boxOf(terminal)).x).toBeGreaterThan((await boxOf(editor)).x + 100);
  }).toPass();
}

/** Checks that the terminal titled `title` sits to the right of `editor`, top-aligned with it. */
async function expectTerminalRightOf(page: Page, title: string, editor: Locator) {
  const editorBox = await boxOf(editor);
  const terminal = await boxOf(page.getByRole("region", { name: `Terminal in ${title}` }));
  expect(terminal.x).toBeGreaterThan(editorBox.x + editorBox.width / 2);
  expect(terminal.y).toBeLessThan(editorBox.y + editorBox.height / 2);
}

test("a fresh workshop shows an empty editor area and a terminal at the bottom", async () => {
  const { electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  try {
    // Only the terminal's tab: the editor area above it is empty.
    await expect(page.getByRole("tab")).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "studies" })).toBeVisible();

    const area = await boxOf(page.locator(".hone-editor-area"));
    const terminal = await boxOf(page.getByRole("region", { name: "Terminal in studies" }));
    // The terminal's content ends at the bottom, and with its tab bar it takes about 30% of the height.
    expect(terminal.y + terminal.height).toBeCloseTo(area.y + area.height, -1);
    const terminalTop = (terminal.y - area.y) / area.height;
    expect(terminalTop).toBeGreaterThan(0.6);
    expect(terminalTop).toBeLessThan(0.8);
  } finally {
    await electronApp.close();
  }
});

test("relaunching restores the workshop's tabs and where they were, with a working terminal", async () => {
  const { userData, electronApp, page, tree } = await openWorkshopWith(async (workshop) => {
    await writeFile(path.join(workshop, "algebra.md"), "Groups.\n");
    await writeFile(path.join(workshop, "geometry.md"), "Circles.\n");
  });
  try {
    await tree.getByRole("button", { name: "algebra.md" }).click();
    await tree.getByRole("button", { name: "geometry.md" }).click();
    await moveTerminalRightOf(page, "studies", page.getByRole("textbox", { name: "geometry.md" }));
  } finally {
    await electronApp.close();
  }

  const relaunched = await launch(userData);
  try {
    const relaunchedPage = await relaunched.firstWindow();
    await expect(relaunchedPage.getByRole("tab", { name: "algebra.md" })).toBeVisible();
    await expect(relaunchedPage.getByRole("tab", { name: "geometry.md" })).toBeVisible();
    await expect(relaunchedPage.getByRole("textbox", { name: "geometry.md" })).toContainText(
      "Circles.",
    );
    await expectTerminalRightOf(
      relaunchedPage,
      "studies",
      relaunchedPage.getByRole("textbox", { name: "geometry.md" }),
    );

    await runInTerminal(relaunchedPage, "studies", "echo hello", "hello");
  } finally {
    await relaunched.close();
  }
});

test("a file deleted between launches isn't restored, and no broken tab appears", async () => {
  const { root, userData, electronApp, page, tree } = await openWorkshopWith(async (workshop) => {
    await writeFile(path.join(workshop, "algebra.md"), "Groups.\n");
    await writeFile(path.join(workshop, "geometry.md"), "Circles.\n");
  });
  try {
    await tree.getByRole("button", { name: "algebra.md" }).click();
    await tree.getByRole("button", { name: "geometry.md" }).click();
    await expect(page.getByRole("tab", { name: "geometry.md" })).toBeVisible();
  } finally {
    await electronApp.close();
  }
  await rm(path.join(root, "geometry.md"));

  const relaunched = await launch(userData);
  try {
    const relaunchedPage = await relaunched.firstWindow();
    await expect(relaunchedPage.getByRole("tab", { name: "algebra.md" })).toBeVisible();
    await expect(relaunchedPage.getByRole("tab", { name: "geometry.md" })).toHaveCount(0);
    await expect(relaunchedPage.getByRole("textbox", { name: "algebra.md" })).toContainText(
      "Groups.",
    );
    await expect(relaunchedPage.getByText("Something went wrong")).toBeHidden();
    await expect(relaunchedPage.getByText("couldn't be opened")).toBeHidden();
  } finally {
    await relaunched.close();
  }
});

test("switching workshops keeps each one's layout", async () => {
  const { electronApp, page, tree, root } = await openWorkshopWith(async (workshop) => {
    await writeFile(path.join(workshop, "algebra.md"), "Groups.\n");
  });
  const work = await makeWorkshop(await mkdtemp(path.join(tmpdir(), "hone-e2e-")), "work");
  try {
    await tree.getByRole("button", { name: "algebra.md" }).click();
    const editor = page.getByRole("textbox", { name: "algebra.md" });
    await moveTerminalRightOf(page, "studies", editor);

    await pickFolderInDialog(electronApp, work);
    await workshopMenuButton(page, "studies").click();
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(workshopMenuButton(page, "work")).toBeVisible();
    // The default layout, since this workshop has none saved.
    await expect(page.getByRole("tab")).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "work" })).toBeVisible();

    await pickFolderInDialog(electronApp, root);
    await workshopMenuButton(page, "work").click();
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(page.getByRole("tab", { name: "algebra.md" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "studies" })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expectTerminalRightOf(page, "studies", editor);
  } finally {
    await electronApp.close();
  }
});

/**
 * Whether the page itself scrolls, beyond what scrolls inside it, in any of 60 frames (a second): the window then
 * shows its own scrollbars. Watched over time, since an editor area rounded past the window's edge makes those
 * scrollbars come and go.
 */
function pageScrolls(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        let frames = 0;
        function check(): void {
          const { scrollHeight, scrollWidth, clientHeight, clientWidth } = document.documentElement;
          if (scrollHeight > clientHeight || scrollWidth > clientWidth) resolve(true);
          else if (++frames === 60) resolve(false);
          else requestAnimationFrame(check);
        }
        requestAnimationFrame(check);
      }),
  );
}

test("the workshop screen fits the window, with a terminal, with no tab and with a note open", async () => {
  const { electronApp, page, tree } = await openWorkshopWith((workshop) =>
    writeFile(path.join(workshop, "notes.md"), "A short note.\n"),
  );
  try {
    // Zoomed so a CSS pixel isn't a whole screen pixel, as with Windows display scaling at 150%: the editor area's
    // size then has a fraction, which dockview rounds up past the window's edge.
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1.5);
    });
    await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBe(1.5);
    await page.getByRole("region", { name: "Terminal in studies" }).click();
    expect(await pageScrolls(page)).toBe(false);
    await page.keyboard.type("exit");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab")).toHaveCount(0);
    expect(await pageScrolls(page)).toBe(false);

    await tree.getByRole("button", { name: "notes.md" }).click();
    await expect(page.getByRole("textbox", { name: "notes.md" })).toContainText("A short note.");
    expect(await pageScrolls(page)).toBe(false);
  } finally {
    await electronApp.close();
  }
});
