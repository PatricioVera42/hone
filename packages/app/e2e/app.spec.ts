// End-to-end: drives the built app with Playwright (README: "End-to-end tests").
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
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
    await expect(page.getByRole("button", { name: "studies" })).toBeVisible();
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
    const header = page.getByRole("button", { name: "studies" });
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

    await expect(page.getByRole("button", { name: "studies" })).toBeVisible();
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
    await expect(page.getByRole("button", { name: "studies" })).toBeVisible();
  } finally {
    await first.close();
  }

  const second = await launch(userData);
  try {
    const page = await second.firstWindow();
    await expect(page.getByRole("button", { name: "studies" })).toBeVisible();
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
    await page.getByRole("button", { name: "studies" }).click();

    await pickFolderInDialog(electronApp, work);
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(page.getByRole("button", { name: "work" })).toBeVisible();
    await expect(page.getByRole("button", { name: "studies" })).toBeHidden();
  } finally {
    await electronApp.close();
  }
});
