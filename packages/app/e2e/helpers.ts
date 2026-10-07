// Helpers the end-to-end specs share. A helper used by one spec stays in that spec.
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const mainPath = path.join(import.meta.dirname, "..", "dist-electron", "main.cjs");

export async function temporaryUserData(): Promise<string> {
  return path.join(await mkdtemp(path.join(tmpdir(), "hone-e2e-")), "user-data");
}

/** Launches the app with its own `userData` folder, so the last workshop never leaks between tests. */
export function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({ args: [mainPath, "--no-sandbox", `--user-data-dir=${userData}`] });
}

/** Replaces the native folder dialog, which Playwright can't drive, so it picks `folder` (ADR 0013). */
export async function pickFolderInDialog(
  electronApp: ElectronApplication,
  folder: string,
): Promise<void> {
  await electronApp.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [picked] });
  }, folder);
}

export async function makeWorkshop(parent: string, name: string): Promise<string> {
  const root = path.join(parent, name);
  await mkdir(path.join(root, ".hone", "generator"), { recursive: true });
  return root;
}

/**
 * The sidebar header's button named after the workshop, which opens the workshop menu. An open file's breadcrumbs
 * start with a button of the same name.
 */
export function workshopMenuButton(page: Page, name: string): Locator {
  return page.locator('[data-sidebar="header"]').getByRole("button", { name, exact: true });
}

/** Resizes the app's window from main, the way a user snapping it to half a screen would. */
export async function resizeWindow(
  electronApp: ElectronApplication,
  width: number,
  height: number,
) {
  await electronApp.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height);
    },
    { width, height },
  );
}

/** Launches the app on a new workshop that `setUp` fills first, and opens it. */
export async function openWorkshopWith(
  setUp: (root: string) => Promise<void>,
  beforeOpening: (page: Page) => Promise<void> = () => Promise.resolve(),
) {
  const temporary = await mkdtemp(path.join(tmpdir(), "hone-e2e-"));
  const root = await makeWorkshop(temporary, "studies");
  await setUp(root);
  const userData = path.join(temporary, "user-data");
  const electronApp = await launch(userData);
  const page = await electronApp.firstWindow();
  await beforeOpening(page);
  await pickFolderInDialog(electronApp, root);
  await page.getByRole("button", { name: "Open workshop" }).click();
  const tree = page.getByRole("navigation", { name: "Files" });
  await expect(tree.getByRole("button", { name: ".hone" })).toBeVisible();
  return { root, userData, electronApp, page, tree };
}

/**
 * The rows of the terminals titled `title`, read through xterm's accessibility tree, which exists once xterm has
 * opened: from then on, what's typed reaches the shell. A terminal hidden behind another tab has none.
 */
export function terminals(page: Page, title: string) {
  return page.getByRole("region", { name: `Terminal in ${title}` }).getByRole("list");
}

/** The rows of the terminals titled `title` that are exactly `text`. */
export function terminalRowsExactly(page: Page, title: string, text: string) {
  return terminals(page, title)
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`^\\s*${text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) });
}

/** Where `locator` is on the page, once it's visible. */
export async function boxOf(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (box === null) throw new Error("the element has no bounding box");
  return box;
}

/** Types `command` into the terminal titled `title` and waits for a row that is exactly `output`. */
export async function runInTerminal(page: Page, title: string, command: string, output: string) {
  await page.getByRole("region", { name: `Terminal in ${title}` }).click();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
  await expect(terminalRowsExactly(page, title, output)).toHaveCount(1);
}
