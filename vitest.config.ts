import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A test that asserts nothing fails instead of passing by accident.
    expect: { requireAssertions: true },
  },
});
