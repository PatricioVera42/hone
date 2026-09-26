import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vitest";
import { electronSecurity } from "./electron-security.ts";

RuleTester.describe = describe;
// RuleTester checks with node:assert, which `requireAssertions` doesn't count, so assert that it doesn't throw.
RuleTester.it = (text, fn) => {
  it(text, () => {
    expect(fn).not.toThrow();
  });
};

const ruleTester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

ruleTester.run("electron-security", electronSecurity, {
  valid: [
    "new BrowserWindow({ webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });",
    "new BrowserWindow({ width: 800 });",
    // Same key names outside Electron, with values that aren't the unsafe literal.
    "createSandbox({ sandbox: docker() });",
    "const flags = { webSecurity: 'strict' };",
  ],
  invalid: [
    { code: "({ nodeIntegration: true });", errors: [{ messageId: "unsafe" }] },
    { code: "({ contextIsolation: false });", errors: [{ messageId: "unsafe" }] },
    { code: "({ sandbox: false });", errors: [{ messageId: "unsafe" }] },
    { code: "({ webSecurity: false });", errors: [{ messageId: "unsafe" }] },
    { code: "({ allowRunningInsecureContent: true });", errors: [{ messageId: "unsafe" }] },
    { code: "({ 'nodeIntegration': true });", errors: [{ messageId: "unsafe" }] },
    {
      code: "new BrowserWindow({ webPreferences: { nodeIntegration: true, sandbox: false } });",
      errors: [{ messageId: "unsafe" }, { messageId: "unsafe" }],
    },
  ],
});
