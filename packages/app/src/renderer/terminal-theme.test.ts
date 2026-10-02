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

  it("sets the three scrollbar slider colors from --scrollbar-thumb*, as rgba() because xterm drops a translucent color it can't parse as hex or rgba()", () => {
    // How Chromium reports a 22%, 35% and 50% mix of #c0caf5 with transparency.
    const computed: Record<string, string> = {
      "var(--scrollbar-thumb)": "color(srgb 0.752941 0.792157 0.960784 / 0.22)",
      "var(--scrollbar-thumb-hover)": "color(srgb 0.752941 0.792157 0.960784 / 0.35)",
      "var(--scrollbar-thumb-active)": "color(srgb 0.752941 0.792157 0.960784 / 0.5)",
    };
    const theme = computeTerminalTheme((color) => computed[color] ?? color);
    expect(theme).toMatchObject({
      scrollbarSliderBackground: "rgba(192, 202, 245, 0.22)",
      scrollbarSliderHoverBackground: "rgba(192, 202, 245, 0.35)",
      scrollbarSliderActiveBackground: "rgba(192, 202, 245, 0.5)",
    });
  });
});
