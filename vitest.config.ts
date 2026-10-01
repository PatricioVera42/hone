import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // The renderer's import alias, as in packages/app/vite.config.ts.
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "packages/app/src/renderer") } },
  test: {
    // A test that asserts nothing fails instead of passing by accident.
    expect: { requireAssertions: true },
    // Playwright end-to-end specs run through `playwright test`, not Vitest.
    exclude: [...configDefaults.exclude, "**/e2e/**"],
  },
});
