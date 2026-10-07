// End-to-end: terminals, their keyboard shortcuts, clipboard and working folder.
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  boxOf,
  launch,
  makeWorkshop,
  openWorkshopWith,
  pickFolderInDialog,
  runInTerminal,
  terminalRowsExactly,
  terminals,
  workshopMenuButton,
} from "./helpers.ts";

/** The rows of the terminals titled `title` that echo an interrupt (^C). */
function interruptEchoes(page: Page, title: string) {
  return terminals(page, title).getByRole("listitem").filter({ hasText: "^C" });
}

/** The highlighted selection of the terminal titled `title`, drawn by xterm: empty when nothing is selected. */
function terminalSelection(page: Page, title: string) {
  return page.getByRole("region", { name: `Terminal in ${title}` }).locator(".xterm-selection div");
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

/** Prints `text` in the terminal titled `title` and selects it by double-clicking its row. */
async function printAndSelect(page: Page, title: string, text: string) {
  await runInTerminal(page, title, `echo ${text}`, text);
  // The accessibility rows sit on top of the screen, so the click goes to the terminal's own row at the same place.
  const box = await boxOf(terminalRowsExactly(page, title, text));
  await page.mouse.dblclick(box.x + 4, box.y + box.height / 2);
  await expect(terminalSelection(page, title)).not.toHaveCount(0);
}

function readClipboard(electronApp: ElectronApplication): Promise<string> {
  return electronApp.evaluate(({ clipboard }) => clipboard.readText());
}

function writeClipboard(electronApp: ElectronApplication, text: string): Promise<void> {
  return electronApp.evaluate(({ clipboard }, written) => clipboard.writeText(written), text);
}

for (const copyKey of ["Control+C", "Control+Shift+C"]) {
  test(`${copyKey} in a terminal copies the selection and clears it`, async () => {
    const { electronApp, page } = await openWorkshopWith(() => Promise.resolve());
    try {
      await writeClipboard(electronApp, "before");
      await printAndSelect(page, "studies", "copyme");
      await page.keyboard.press(copyKey);
      await expect.poll(() => readClipboard(electronApp)).toBe("copyme");
      await expect(terminalSelection(page, "studies")).toHaveCount(0);
      // Nothing reached the shell: the prompt line has no interrupt echo (^C) in it.
      await runInTerminal(page, "studies", "echo after", "after");
      await expect(interruptEchoes(page, "studies")).toHaveCount(0);
    } finally {
      await electronApp.close();
    }
  });
}

test("Ctrl+C in a terminal with no selection interrupts the running command", async () => {
  const { root, electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  try {
    await page.getByRole("region", { name: "Terminal in studies" }).click();
    await page.keyboard.type("echo started; sleep 100; echo done > interrupted.txt");
    await page.keyboard.press("Enter");
    // Once "started" is printed, the sleep is what's running.
    await expect(terminalRowsExactly(page, "studies", "started")).toHaveCount(1);
    await page.keyboard.press("Control+C");
    await expect(interruptEchoes(page, "studies")).toHaveCount(1);
    // The interrupt ended the sleep, so the prompt is back and takes the next command.
    await runInTerminal(page, "studies", "echo prompt-is-back", "prompt-is-back");
    await expect(stat(path.join(root, "interrupted.txt"))).rejects.toThrow();
  } finally {
    await electronApp.close();
  }
});

test("Ctrl+Shift+C in a terminal with no selection doesn't interrupt the running command", async () => {
  const { electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  try {
    await page.getByRole("region", { name: "Terminal in studies" }).click();
    await page.keyboard.type("echo started; sleep 3; echo slept-through");
    await page.keyboard.press("Enter");
    // Once "started" is printed, the sleep is what's running.
    await expect(terminalRowsExactly(page, "studies", "started")).toHaveCount(1);
    await page.keyboard.press("Control+Shift+C");
    // The sleep ran to its end, so it wasn't interrupted.
    await expect(terminalRowsExactly(page, "studies", "slept-through")).toHaveCount(1, {
      timeout: 10_000,
    });
    await expect(interruptEchoes(page, "studies")).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});

for (const pasteKey of ["Control+V", "Control+Shift+V"]) {
  test(`${pasteKey} in a terminal pastes the clipboard once`, async () => {
    const { electronApp, page } = await openWorkshopWith(() => Promise.resolve());
    try {
      await writeClipboard(electronApp, "echo pasted-text");
      await page.getByRole("region", { name: "Terminal in studies" }).click();
      await page.keyboard.press(pasteKey);
      // Not sent: the pasted text sits on the command line until Enter, and only once.
      await expect(
        terminals(page, "studies")
          .getByRole("listitem")
          .filter({ hasText: /echo pasted-text/ }),
      ).toHaveCount(1);
      await page.keyboard.press("Enter");
      await expect(terminalRowsExactly(page, "studies", "pasted-text")).toHaveCount(1);
    } finally {
      await electronApp.close();
    }
  });
}

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
    await workshopMenuButton(page, "studies").click();
    await page.getByRole("menuitem", { name: "Open workshop…" }).click();
    await expect(workshopMenuButton(page, "work")).toBeVisible();
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
