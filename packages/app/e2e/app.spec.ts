// End-to-end: drives the built app with Playwright (README: "End-to-end tests").
import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";

const mainPath = path.join(import.meta.dirname, "..", "dist-electron", "main.cjs");

test("renderer has no Node globals and a Content Security Policy", async () => {
  const electronApp = await electron.launch({ args: [mainPath, "--no-sandbox"] });
  try {
    const page = await electronApp.firstWindow();
    expect(await page.evaluate(() => typeof window.process)).toBe("undefined");
    expect(await page.evaluate(() => typeof window.require)).toBe("undefined");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toBeTruthy();
  } finally {
    await electronApp.close();
  }
});

test("connects to the host", async () => {
  const electronApp = await electron.launch({ args: [mainPath, "--no-sandbox"] });
  try {
    const page = await electronApp.firstWindow();
    await expect(page.locator("body")).toHaveText("Connected to host");
  } finally {
    await electronApp.close();
  }
});
