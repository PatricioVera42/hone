import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A test that asserts nothing fails instead of passing by accident.
    expect: { requireAssertions: true },
    // Playwright end-to-end specs run through `playwright test`, not Vitest.
    exclude: [...configDefaults.exclude, "**/e2e/**"],
  },
});
