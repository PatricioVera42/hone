// End-to-end: drives the built app with Playwright (README: "End-to-end tests").
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// The spec's policy. Inline styles are allowed because xterm injects <style> elements (xtermjs/xterm.js#4445).
const contentSecurityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*";
const mainPath = path.join(import.meta.dirname, "..", "dist-electron", "main.cjs");

async function temporaryUserData(): Promise<string> {
  return path.join(await mkdtemp(path.join(tmpdir(), "hone-e2e-")), "user-data");
}

/** Launches the app with its own `userData` folder, so the last workshop never leaks between tests. */
function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({ args: [mainPath, "--no-sandbox", `--user-data-dir=${userData}`] });
}

/** Replaces the native folder dialog, which Playwright can't drive, so it picks `folder` (ADR 0013). */
async function pickFolderInDialog(electronApp: ElectronApplication, folder: string): Promise<void> {
  await electronApp.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [picked] });
  }, folder);
}

async function makeWorkshop(parent: string, name: string): Promise<string> {
  const root = path.join(parent, name);
  await mkdir(path.join(root, ".hone", "generator"), { recursive: true });
  return root;
}

test("renderer has no Node globals and a Content Security Policy", async () => {
  const electronApp = await launch(await temporaryUserData());
  try {
    const page = await electronApp.firstWindow();
    expect(await page.evaluate(() => typeof window.process)).toBe("undefined");
    expect(await page.evaluate(() => typeof window.require)).toBe("undefined");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toBe(contentSecurityPolicy);
  } finally {
    await electronApp.close();
  }
});

test("shows the welcome screen", async () => {
  const electronApp = await launch(await temporaryUserData());
  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByRole("button", { name: "Open workshop" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create workshop" })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test("recovers from a lost host", async () => {
  const electronApp = await launch(await temporaryUserData());
  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByRole("button", { name: "Open workshop" })).toBeVisible();

    // Reach the host process through main, the way #4's brief says to: no preload API just for this.
    await electronApp.evaluate(() => globalThis.honeHostProcess?.kill());
    await expect(page.getByText("Connection to the host was lost.")).toBeVisible();

    await page.getByRole("button", { name: "Restart" }).click();
    // The welcome screen only renders once the new host's socket is open.
    await expect(page.getByText("Connection to the host was lost.")).toBeHidden();
    await expect(page.getByRole("button", { name: "Open workshop" })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test("opens a workshop from a folder nested inside it", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  const nested = path.join(root, "math", "algebra");
  await mkdir(nested, { recursive: true });

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, nested);
    await page.getByRole("button", { name: "Open workshop" }).click();
    await expect(page.getByRole("button", { name: "studies", exact: true })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test("Ctrl+B collapses and expands the sidebar", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    const header = page.getByRole("button", { name: "studies", exact: true });
    await expect(header).toBeInViewport();

    await page.keyboard.press("Control+b");
    await expect(header).not.toBeInViewport();

    await page.keyboard.press("Control+b");
    await expect(header).toBeInViewport();
  } finally {
    await electronApp.close();
  }
});

test("opening a folder outside any workshop offers to create one", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const loose = path.join(temporary, "loose");
  await mkdir(loose);

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, loose);
    await page.getByRole("button", { name: "Open workshop" }).click();
    const error = page.getByRole("alertdialog");
    await expect(error).toContainText(`${loose} isn't inside a workshop.`);
    await expect(error.getByRole("button", { name: "Create workshop" })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test("creates a workshop and opens it", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Create workshop" }).click();
    const dialog = page.getByRole("dialog");
    await pickFolderInDialog(electronApp, temporary);
    await dialog.getByRole("button", { name: "Choose folder…" }).click();
    await expect(dialog).toContainText(temporary);
    await dialog.getByLabel("Name").fill("studies");
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByRole("button", { name: "studies", exact: true })).toBeVisible();
    const generator = await stat(path.join(temporary, "studies", ".hone", "generator"));
    expect(generator.isDirectory()).toBe(true);
  } finally {
    await electronApp.close();
  }
});

test("the create dialog validates the name as it's typed and reports an existing folder", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  await mkdir(path.join(temporary, "taken"));

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Create workshop" }).click();
    const dialog = page.getByRole("dialog");
    await pickFolderInDialog(electronApp, temporary);
    await dialog.getByRole("button", { name: "Choose folder…" }).click();

    await dialog.getByLabel("Name").fill("a/b");
    await expect(dialog.getByRole("alert")).toHaveText('The name can\'t contain "/".');
    await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();

    await dialog.getByLabel("Name").fill("taken");
    await expect(dialog.getByRole("alert")).toBeHidden();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      `${path.join(temporary, "taken")} already exists. Choose another name.`,
    );
  } finally {
    await electronApp.close();
  }
});

test("relaunching reopens the last workshop, unless it was deleted", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  const userData = path.join(temporary, "user-data");

  const first = await launch(userData);
  try {
    const page = await first.firstWindow();
    await pickFolderInDialog(first, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    await expect(page.getByRole("button", { name: "studies", exact: true })).toBeVisible();
  } finally {
    await first.close();
  }

  const second = await launch(userData);
  try {
    const page = await second.firstWindow();
    await expect(page.getByRole("button", { name: "studies", exact: true })).toBeVisible();
  } finally {
    await second.close();
  }

  await rm(root, { recursive: true });
  const third = await launch(userData);
  try {
    const page = await third.firstWindow();
    await expect(page.getByRole("button", { name: "Open workshop" })).toBeVisible();
  } finally {
    await third.close();
  }
});

test("opening another workshop from the sidebar menu replaces the open one", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const studies = await makeWorkshop(temporary, "studies");
  const work = await makeWorkshop(temporary, "work");

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, studies);
    await page.getByRole("button", { name: "Open workshop" }).click();
    await page.getByRole("button", { name: "studies", exact: true }).click();

    await pickFolderInDialog(electronApp, work);
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(page.getByRole("button", { name: "work", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "studies", exact: true })).toBeHidden();
  } finally {
    await electronApp.close();
  }
});

test("an unexpected error while opening a workshop shows up as a toast", async () => {
  const electronApp = await launch(await temporaryUserData());
  try {
    const page = await electronApp.firstWindow();
    // Stands in for a failure the user can't see otherwise, such as `wslpath` failing on Windows.
    await electronApp.evaluate(({ dialog }) => {
      dialog.showOpenDialog = () => Promise.reject(new Error("the folder dialog broke"));
    });
    await page.getByRole("button", { name: "Open workshop" }).click();
    await expect(page.getByText("the folder dialog broke")).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

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

test("a folder that can't be listed shows an error and stops loading", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  const outside = path.join(temporary, "outside");
  await mkdir(outside);
  await symlink(outside, path.join(root, "escape"));

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    const tree = page.getByRole("navigation", { name: "Files" });
    await tree.getByRole("button", { name: "escape" }).click();

    await expect(page.getByText("escape is outside the workshop")).toBeVisible();
    await expect(tree.locator('[data-sidebar="menu-skeleton"]')).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});

/** Resizes the app's window from main, the way a user snapping it to half a screen would. */
async function resizeWindow(electronApp: ElectronApplication, width: number, height: number) {
  await electronApp.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height);
    },
    { width, height },
  );
}

test("the sidebar and its file tree stay visible in a narrow window", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");

  const electronApp = await launch(path.join(temporary, "user-data"));
  try {
    const page = await electronApp.firstWindow();
    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "Open workshop" }).click();
    await expect(page.getByRole("button", { name: "studies", exact: true })).toBeInViewport();

    await resizeWindow(electronApp, 600, 600);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThan(768);
    await expect(page.getByRole("button", { name: "studies", exact: true })).toBeInViewport();
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
    await expect(page.getByRole("button", { name: "studies", exact: true })).not.toBeInViewport();

    await toggle.click();
    await expect(page.getByRole("button", { name: "studies", exact: true })).toBeInViewport();
    await expect(tree.getByRole("button", { name: "Math" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(tree.getByRole("button", { name: "algebra.md" })).toBeInViewport();
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

    await page.getByRole("button", { name: "studies", exact: true }).click();
    await pickFolderInDialog(electronApp, work);
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(page.getByRole("button", { name: "work", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "algebra.md" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "work" })).toBeVisible();
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
    await page.getByRole("button", { name: "studies", exact: true }).click();
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();

    await expect(page.getByRole("button", { name: "work", exact: true })).toBeVisible();
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

/** Launches the app on a new workshop that `setUp` fills first, and opens it. */
async function openWorkshopWith(setUp: (root: string) => Promise<void>) {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  await setUp(root);
  const userData = path.join(temporary, "user-data");
  const electronApp = await launch(userData);
  const page = await electronApp.firstWindow();
  await pickFolderInDialog(electronApp, root);
  await page.getByRole("button", { name: "Open workshop" }).click();
  const tree = page.getByRole("navigation", { name: "Files" });
  await expect(tree.getByRole("button", { name: ".hone" })).toBeVisible();
  return { root, userData, electronApp, page, tree };
}

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

/**
 * The rows of the terminals titled `title`, read through xterm's accessibility tree, which exists once xterm has
 * opened: from then on, what's typed reaches the shell. A terminal hidden behind another tab has none.
 */
function terminals(page: Page, title: string) {
  return page.getByRole("region", { name: `Terminal in ${title}` }).getByRole("list");
}

/** Where `locator` is on the page, once it's visible. */
async function boxOf(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (box === null) throw new Error("the element has no bounding box");
  return box;
}

/** Types `command` into the terminal titled `title` and waits for a row that is exactly `output`. */
async function runInTerminal(page: Page, title: string, command: string, output: string) {
  await page.getByRole("region", { name: `Terminal in ${title}` }).click();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
  await expect(
    terminals(page, title)
      .getByRole("listitem")
      .filter({
        hasText: new RegExp(`^\\s*${output.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`),
      }),
  ).toHaveCount(1);
}

test("Ctrl+` opens a terminal at the workshop root that runs commands", async () => {
  const { root, electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  try {
    // The default layout's terminal.
    await expect(page.getByRole("tab", { name: "studies" })).toHaveCount(1);
    await page.keyboard.press("Control+Backquote");
    await expect(page.getByRole("tab", { name: "studies" })).toHaveCount(2);
    // The default layout's terminal is hidden behind the new one's tab.
    await expect(terminals(page, "studies")).toBeVisible();

    await page.keyboard.type("echo hello | tee greeting.txt");
    await page.keyboard.press("Enter");

    await expect(
      terminals(page, "studies")
        .getByRole("listitem")
        .filter({ hasText: /^\s*hello\s*$/ }),
    ).toHaveCount(1);
    await expect.poll(() => readFile(path.join(root, "greeting.txt"), "utf8")).toBe("hello\n");
  } finally {
    await electronApp.close();
  }
});

test("Ctrl+` inside a terminal opens another in its group, and exit closes a terminal's tab", async () => {
  const { electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  try {
    // The default layout's terminal, which Ctrl+` inside it opens the new one next to.
    await page.getByRole("region", { name: "Terminal in studies" }).click();
    await page.keyboard.press("Control+Backquote");
    await expect(page.getByRole("tab", { name: "studies" })).toHaveCount(2);
    await expect(
      page.getByRole("tablist").filter({ has: page.getByRole("tab", { name: "studies" }) }),
    ).toHaveCount(1);

    // The first terminal is hidden behind the second's tab, so only the second's rows are visible.
    await expect(terminals(page, "studies")).toBeVisible();

    await page.keyboard.type("exit");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: "studies" })).toHaveCount(1);
  } finally {
    await electronApp.close();
  }
});

test("opening another workshop closes the terminals", async () => {
  const { electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  const other = await makeWorkshop(await mkdtemp(path.join(tmpdir(), "hone-e2e-")), "work");
  try {
    await expect(page.getByRole("tab", { name: "studies" })).toBeVisible();

    await pickFolderInDialog(electronApp, other);
    await page.getByRole("button", { name: "studies", exact: true }).click();
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(page.getByRole("button", { name: "work", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "studies" })).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});

test("a terminal whose shell can't start closes its tab and shows the error", async () => {
  const { root, electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  try {
    // The default layout's terminal, whose shell starts before the folder goes away.
    await runInTerminal(page, "studies", "echo started", "started");
    // The folder it would start in is gone, so terminal.open fails with NotFound. The file tree can fail the same way,
    // so the error alone doesn't prove the tab opened and closed; without the fix the tab stays open, which this catches.
    await rm(root, { recursive: true });
    await page.keyboard.press("Control+Backquote");

    await expect(page.getByText("Something went wrong").first()).toBeVisible();
    await expect(page.getByRole("tab", { name: "studies" })).toHaveCount(1);
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
    await page.getByRole("button", { name: "studies", exact: true }).click();
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(page.getByRole("button", { name: "work", exact: true })).toBeVisible();
    // The default layout, since this workshop has none saved.
    await expect(page.getByRole("tab")).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "work" })).toBeVisible();

    await pickFolderInDialog(electronApp, root);
    await page.getByRole("button", { name: "work", exact: true }).click();
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(page.getByRole("tab", { name: "algebra.md" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "studies" })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expectTerminalRightOf(page, "studies", editor);
  } finally {
    await electronApp.close();
  }
});

test("Open terminal here on a folder opens a terminal in that folder", async () => {
  const { root, electronApp, page, tree } = await openWorkshopWith(async (workshop) => {
    await mkdir(path.join(workshop, "math"));
  });
  try {
    await tree.getByRole("button", { name: "math" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Open terminal here" }).click();
    await expect(page.getByRole("tab", { name: "math" })).toBeVisible();

    await runInTerminal(page, "math", "pwd", await realpath(path.join(root, "math")));
  } finally {
    await electronApp.close();
  }
});

test("relaunching restores a terminal in the folder it was opened in", async () => {
  const { root, userData, electronApp, page, tree } = await openWorkshopWith(async (workshop) => {
    await mkdir(path.join(workshop, "math"));
  });
  try {
    await tree.getByRole("button", { name: "math" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Open terminal here" }).click();
    await expect(page.getByRole("tab", { name: "math" })).toBeVisible();
  } finally {
    await electronApp.close();
  }

  const relaunched = await launch(userData);
  try {
    const relaunchedPage = await relaunched.firstWindow();
    await runInTerminal(relaunchedPage, "math", "pwd", await realpath(path.join(root, "math")));
  } finally {
    await relaunched.close();
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

test("the workshop screen fits the window, with no tab and with a note open", async () => {
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
