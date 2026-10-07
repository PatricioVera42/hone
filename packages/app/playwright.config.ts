// Config for the end-to-end tests that drive the built app (README: "End-to-end tests").
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  // The specs ran in one file, one test at a time. In parallel the breadcrumbs menu tests time out under load (#106).
  workers: 1,
  forbidOnly: !!process.env["CI"],
  reporter: "list",
  // Agents debug from text (assertions, the list reporter, ariaSnapshot), never from images.
  use: { screenshot: "off", video: "off", trace: "off" },
});
