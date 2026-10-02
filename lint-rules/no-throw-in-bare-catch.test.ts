import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vitest";
import { noThrowInBareCatch } from "./no-throw-in-bare-catch.ts";

RuleTester.describe = describe;
// RuleTester checks with node:assert, which `requireAssertions` doesn't count, so assert that it doesn't throw.
RuleTester.it = (text, fn) => {
  it(text, () => {
    expect(fn).not.toThrow();
  });
};

const ruleTester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

ruleTester.run("no-throw-in-bare-catch", noThrowInBareCatch, {
  valid: [
    "try { run(); } catch { return false; }",
    "try { run(); } catch (error) { if (isMissing(error)) throw new AppError('NotFound', 'x'); throw error; }",
    "try { run(); } catch { items.forEach(() => { throw new Error('x'); }); }",
    "try { run(); } catch { function fail() { throw new Error('x'); } }",
    "try { run(); } catch { const fail = function () { throw new Error('x'); }; }",
    "try { run(); } catch (error) { try { retry(); } catch (inner) { throw inner; } }",
    "try { run(); } catch { cleanup(); } throw new Error('x');",
  ],
  invalid: [
    {
      code: "try { run(); } catch { throw new AppError('NotFound', 'x'); }",
      errors: [{ messageId: "bareCatchThrows" }],
    },
    {
      code: "try { run(); } catch { if (strict) { throw new AppError('NotFound', 'x'); } }",
      errors: [{ messageId: "bareCatchThrows" }],
    },
    {
      // A function inside the catch doesn't hide a throw outside it.
      code: "try { run(); } catch { items.forEach(() => {}); throw new Error('x'); }",
      errors: [{ messageId: "bareCatchThrows" }],
    },
    {
      // A bare catch nested in a function is still checked.
      code: "function f() { try { run(); } catch { throw new Error('x'); } }",
      errors: [{ messageId: "bareCatchThrows" }],
    },
    {
      code: "try { run(); } catch (error) { try { retry(); } catch { throw new Error('x'); } }",
      errors: [{ messageId: "bareCatchThrows" }],
    },
  ],
});
