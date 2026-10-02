// Hone's own Oxlint rules, loaded through `jsPlugins` in .oxlintrc.json.
import type { Plugin } from "@oxlint/plugins";
import { electronSecurity } from "./electron-security.ts";
import { noThrowInBareCatch } from "./no-throw-in-bare-catch.ts";

const plugin: Plugin = {
  meta: { name: "hone" },
  rules: {
    "electron-security": electronSecurity,
    "no-throw-in-bare-catch": noThrowInBareCatch,
  },
};

export default plugin;
