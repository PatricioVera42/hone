// Config for the end-to-end tests that drive the built app (README: "End-to-end tests").
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  forbidOnly: !!process.env["CI"],
  reporter: "list",
});
