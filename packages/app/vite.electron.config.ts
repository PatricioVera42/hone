// Electron main bundle, as CommonJS.
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist-electron",
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: { main: "src/main/main.ts" },
      formats: ["cjs"],
      fileName: (_format, name) => `${name}.cjs`,
    },
    rollupOptions: { external: ["electron", /^node:/] },
  },
});
