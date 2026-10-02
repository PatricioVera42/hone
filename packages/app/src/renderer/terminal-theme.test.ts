import { describe, expect, it } from "vitest";
import { computeTerminalTheme } from "./terminal-theme.ts";

/** Resolves `var(--name)` to `resolved(name)`, as the browser would resolve the variable to a color. */
function resolveVariables(css: string): string {
  const match = /^var\(--(.+)\)$/.exec(css);
  return match === null ? css : `resolved(${match[1]})`;
}

describe("computeTerminalTheme", () => {
  it("resolves the 16 ANSI colors from the --terminal-* variables", () => {
    const theme = computeTerminalTheme(resolveVariables);
    const colors = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;
    const ansi = Object.fromEntries(
      colors.flatMap((color) => {
        const bright = `bright${color[0]?.toUpperCase()}${color.slice(1)}` as const;
        return [
          [color, `resolved(terminal-${color})`],
          [bright, `resolved(terminal-bright-${color})`],
        ];
      }),
    );
    expect(theme).toMatchObject(ansi);
  });

  it("takes the background and text from shadcn's variables", () => {
    expect(computeTerminalTheme(resolveVariables)).toMatchObject({
      background: "resolved(background)",
      foreground: "resolved(foreground)",
    });
  });
});
