import type { ITheme } from "@xterm/xterm";

/**
 * xterm's theme, from the CSS variables where the terminal is, like the code editors' colors. xterm can't resolve
 * `var()`, so `resolve` turns each color into one it can parse.
 */
export function computeTerminalTheme(resolve: (color: string) => string): ITheme {
  return {
    background: resolve("var(--background)"),
    foreground: resolve("var(--foreground)"),
    cursor: resolve("var(--foreground)"),
    cursorAccent: resolve("var(--background)"),
    // Opaque, since xterm drops a translucent color it can't parse as hex or rgba(), and gives an opaque one its
    // own transparency.
    selectionBackground: resolve("var(--foreground)"),
    black: resolve("var(--terminal-black)"),
    red: resolve("var(--terminal-red)"),
    green: resolve("var(--terminal-green)"),
    yellow: resolve("var(--terminal-yellow)"),
    blue: resolve("var(--terminal-blue)"),
    magenta: resolve("var(--terminal-magenta)"),
    cyan: resolve("var(--terminal-cyan)"),
    white: resolve("var(--terminal-white)"),
    brightBlack: resolve("var(--terminal-bright-black)"),
    brightRed: resolve("var(--terminal-bright-red)"),
    brightGreen: resolve("var(--terminal-bright-green)"),
    brightYellow: resolve("var(--terminal-bright-yellow)"),
    brightBlue: resolve("var(--terminal-bright-blue)"),
    brightMagenta: resolve("var(--terminal-bright-magenta)"),
    brightCyan: resolve("var(--terminal-bright-cyan)"),
    brightWhite: resolve("var(--terminal-bright-white)"),
  };
}
