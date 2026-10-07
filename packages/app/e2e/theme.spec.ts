// End-to-end: colors, scrollbars and the editor's text appearance.
import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { boxOf, openWorkshopWith, resizeWindow, runInTerminal } from "./helpers.ts";

test("syntax colors come from Tokyo Night: in a TypeScript file and in a note", async () => {
  const { electronApp, page, tree } = await openWorkshopWith(async (workshop) => {
    await writeFile(
      path.join(workshop, "greet.ts"),
      'const answer: number = 42;\nconst greeting = "hello"; // say hi\ntype Name = string;\n',
    );
    await writeFile(path.join(workshop, "algebra.md"), "# Algebra\n");
  });
  try {
    await tree.getByRole("button", { name: "greet.ts" }).click();
    const code = page.getByRole("textbox", { name: "greet.ts" });
    const token = (text: RegExp) => code.locator("span").filter({ hasText: text }).last();
    await expect(token(/^const$/).first()).toHaveCSS("color", "rgb(187, 154, 247)");
    await expect(token(/^"hello"$/)).toHaveCSS("color", "rgb(158, 206, 106)");
    await expect(token(/^42$/)).toHaveCSS("color", "rgb(255, 158, 100)");
    await expect(token(/^Name$/)).toHaveCSS("color", "rgb(42, 195, 222)");
    await expect(token(/^\/\/ say hi$/)).toHaveCSS("color", "rgb(86, 95, 137)");

    await tree.getByRole("button", { name: "algebra.md" }).click();
    const note = page.getByRole("textbox", { name: "algebra.md" });
    await expect(note.locator("span").filter({ hasText: /^#$/ })).toHaveCSS(
      "color",
      "rgb(86, 95, 137)",
    );
    await expect(note.locator("span").filter({ hasText: /^\s*Algebra$/ })).toHaveCSS(
      "color",
      "rgb(122, 162, 247)",
    );
  } finally {
    await electronApp.close();
  }
});

test("the dark theme is Tokyo Night across the app, with dim line numbers", async () => {
  const { electronApp, page, tree } = await openWorkshopWith(async (workshop) => {
    await writeFile(path.join(workshop, "notes.txt"), "Groups.\nRings.\n");
  });
  try {
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(26, 27, 38)");
    await expect(page.locator("body")).toHaveCSS("color", "rgb(192, 202, 245)");
    await tree.getByRole("button", { name: "notes.txt" }).click();
    // The cursor starts on the first line, so the second line's number is the dim one.
    const lineNumbers = page.locator(".cm-lineNumbers .cm-gutterElement");
    await expect(lineNumbers.getByText("2")).toHaveCSS("color", "rgb(59, 66, 97)");
    await expect(lineNumbers.getByText("1")).toHaveCSS("color", "rgb(192, 202, 245)");
  } finally {
    await electronApp.close();
  }
});

/** The computed value of a CSS declaration, which is how the browser would paint `value` in the editor's context. */
function computedBackground(page: Page, value: string): Promise<string> {
  return page.evaluate((background) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = background;
    document.body.append(probe);
    const computed = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return computed;
  }, value);
}

test("a code editor scrolled both ways has thin sliders without arrow buttons", async () => {
  const { electronApp, page, tree } = await openWorkshopWith(async (workshop) => {
    const lines = Array.from({ length: 200 }, () => "word ".repeat(100));
    await writeFile(path.join(workshop, "long.txt"), lines.join("\n"));
  });
  try {
    await tree.getByRole("button", { name: "long.txt" }).click();
    const scroller = page.locator(".cm-scroller");
    await expect(scroller).toBeVisible();
    // Both scrollbars take room in the scroller only if it overflows both ways.
    await expect
      .poll(() =>
        scroller.evaluate((element) => [
          element.scrollHeight > element.clientHeight,
          element.scrollWidth > element.clientWidth,
        ]),
      )
      .toEqual([true, true]);
    const style = await scroller.evaluate((element) => ({
      width: getComputedStyle(element, "::-webkit-scrollbar").width,
      height: getComputedStyle(element, "::-webkit-scrollbar").height,
      button: getComputedStyle(element, "::-webkit-scrollbar-button").display,
      thumb: getComputedStyle(element, "::-webkit-scrollbar-thumb").backgroundColor,
    }));
    expect(style).toEqual({
      width: "10px",
      height: "10px",
      button: "none",
      thumb: await computedBackground(page, "var(--scrollbar-thumb)"),
    });
  } finally {
    await electronApp.close();
  }
});

test("a terminal's scrollbar slider is the foreground at 22% at rest, 35% on hover and 50% while dragged", async () => {
  const { electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  try {
    await runInTerminal(page, "studies", "seq 1 300", "300");
    const slider = page.getByRole("region", { name: "Terminal in studies" }).locator(".slider");
    const visibleSlider = slider.and(page.locator(":not(.invisible) > .slider"));
    await expect(visibleSlider).toHaveCSS("background-color", "rgba(192, 202, 245, 0.22)");

    const box = await boxOf(visibleSlider);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(visibleSlider).toHaveCSS("background-color", "rgba(192, 202, 245, 0.35)");
    await page.mouse.down();
    await expect(visibleSlider).toHaveCSS("background-color", "rgba(192, 202, 245, 0.5)");
    await page.mouse.up();
  } finally {
    await electronApp.close();
  }
});

test("dockview's scrollbar is colored by the same variable as the sliders", async () => {
  const { electronApp, page } = await openWorkshopWith(() => Promise.resolve());
  try {
    const expected = await computedBackground(page, "var(--scrollbar-thumb)");
    const dockview = page.locator(".hone-editor-area .dockview-theme-light").first();
    await expect
      .poll(() =>
        dockview.evaluate((element) => {
          const probe = document.createElement("div");
          element.append(probe);
          probe.style.backgroundColor = "var(--dv-scrollbar-background-color)";
          const computed = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return computed;
        }),
      )
      .toBe(expected);
  } finally {
    await electronApp.close();
  }
});

test("a note's text is at most 80 characters wide and centered in a wide window, and a code file's isn't capped", async () => {
  const { electronApp, page, tree } = await openWorkshopWith(async (workshop) => {
    await writeFile(path.join(workshop, "notes.md"), `${"word ".repeat(80)}\n`);
    await writeFile(path.join(workshop, "wide.txt"), `${"word ".repeat(80)}\n`);
  });
  try {
    await resizeWindow(electronApp, 1800, 900);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeGreaterThan(1500);

    await tree.getByRole("button", { name: "notes.md" }).click();
    const note = page.getByRole("textbox", { name: "notes.md" });
    await expect(note).toContainText("word");
    const measure = () =>
      note.evaluate((content) => {
        const editor = content.closest(".cm-editor");
        if (editor === null) throw new Error("The note has no editor around it.");
        const probe = document.createElement("div");
        probe.style.width = "80ch";
        content.append(probe);
        const eightyCharacters = probe.getBoundingClientRect().width;
        probe.remove();
        const contentBox = content.getBoundingClientRect();
        const editorBox = editor.getBoundingClientRect();
        return {
          contentWidth: contentBox.width,
          editorWidth: editorBox.width,
          // The note's padding is 1rem on each side.
          allowedWidth:
            eightyCharacters +
            2 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
          offCenter:
            contentBox.left + contentBox.width / 2 - (editorBox.left + editorBox.width / 2),
        };
      });
    await expect.poll(async () => (await measure()).editorWidth).toBeGreaterThan(1000);
    const { contentWidth, allowedWidth, offCenter } = await measure();
    expect(contentWidth).toBeLessThanOrEqual(allowedWidth + 1);
    expect(contentWidth).toBeGreaterThan(allowedWidth - 40);
    expect(Math.abs(offCenter)).toBeLessThan(1);

    await tree.getByRole("button", { name: "wide.txt" }).click();
    const code = page.getByRole("textbox", { name: "wide.txt" });
    await expect(code).toContainText("word");
    const codeBox = await code.evaluate((content) => ({
      contentWidth: content.getBoundingClientRect().width,
      editorWidth: content.closest(".cm-editor")?.getBoundingClientRect().width ?? 0,
    }));
    expect(codeBox.contentWidth).toBeGreaterThan(codeBox.editorWidth - 100);
  } finally {
    await electronApp.close();
  }
});

test("the active line is marked with a 70% mix of the accent, in a note and in code", async () => {
  const { electronApp, page, tree } = await openWorkshopWith(async (workshop) => {
    await writeFile(path.join(workshop, "notes.md"), "Groups.\n");
    await writeFile(path.join(workshop, "notes.txt"), "Groups.\n");
  });
  try {
    const expected = await computedBackground(
      page,
      "color-mix(in oklch, var(--accent) 70%, transparent)",
    );
    await tree.getByRole("button", { name: "notes.md" }).click();
    await page.getByRole("textbox", { name: "notes.md" }).click();
    await expect(page.locator(".cm-activeLine")).toHaveCSS("background-color", expected);

    await tree.getByRole("button", { name: "notes.txt" }).click();
    await page.getByRole("textbox", { name: "notes.txt" }).click();
    await expect(page.locator(".cm-activeLine")).toHaveCSS("background-color", expected);
  } finally {
    await electronApp.close();
  }
});
