// Hone's own Oxlint rules, loaded through `jsPlugins` in .oxlintrc.json.
import type { Plugin } from "@oxlint/plugins";
import { electronSecurity } from "./electron-security.ts";

const plugin: Plugin = {
  meta: { name: "hone" },
  rules: { "electron-security": electronSecurity },
};

export default plugin;
