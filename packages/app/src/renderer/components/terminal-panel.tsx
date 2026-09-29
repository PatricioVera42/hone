import {
  terminalCloseMethod,
  terminalDataNotification,
  terminalExitNotification,
  terminalOpenMethod,
  terminalResizeMethod,
  terminalWriteMethod,
} from "@hone/protocol";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import { useEffect, useEffectEvent, useRef } from "react";
import type { HostClient } from "@/host-client.ts";
import { reportError } from "@/report-error.ts";

const fontSize = 13;

/**
 * xterm's theme, from shadcn's variables where the terminal is, like the code editors' colors. xterm can't resolve
 * `var()`, so each one is computed first.
 */
function computeTheme(element: HTMLElement): ITheme {
  const probe = document.createElement("span");
  element.append(probe);
  function compute(color: string): string {
    probe.style.color = color;
    return getComputedStyle(probe).color;
  }
  const theme: ITheme = {
    background: compute("var(--background)"),
    foreground: compute("var(--foreground)"),
    cursor: compute("var(--foreground)"),
    cursorAccent: compute("var(--background)"),
    // Opaque, since xterm drops a translucent color it can't parse as hex or rgba(), and gives an opaque one its
    // own transparency.
    selectionBackground: compute("var(--ring)"),
  };
  probe.remove();
  return theme;
}

interface TerminalPanelProps {
  readonly client: HostClient;
  /** The folder the shell starts in, as a protocol path relative to the workshop root. */
  readonly cwd: string;
  /** The terminal's accessible name. */
  readonly label: string;
  /** Called once the shell has exited, or couldn't start. */
  readonly onExit: () => void;
}

/**
 * An xterm running a shell in the host, in the code editors' font. It opens the host's terminal once mounted and
 * closes it when unmounted, unless the shell has already exited.
 */
export function TerminalPanel({ client, cwd, label, onExit }: TerminalPanelProps) {
  const container = useRef<HTMLDivElement>(null);
  const shellExitedEvent = useEffectEvent(onExit);

  useEffect(() => {
    const element = container.current;
    if (element === null) return undefined;
    let unmounted = false;
    // A call, so the check after each await isn't narrowed away by the one before it.
    const isUnmounted = (): boolean => unmounted;
    let terminal: Terminal | undefined;
    let id: string | undefined;
    let shellExited = false;
    const cleanups: (() => void)[] = [];

    async function start(parent: HTMLDivElement): Promise<void> {
      const fontFamily = getComputedStyle(parent).getPropertyValue("--font-code");
      // xterm measures its glyphs when it opens, so the font must be ready by then.
      await Promise.all([
        document.fonts.load(`${String(fontSize)}px ${fontFamily}`),
        document.fonts.load(`bold ${String(fontSize)}px ${fontFamily}`),
      ]);
      if (isUnmounted()) return;

      const opened = new Terminal({
        fontFamily,
        fontSize,
        theme: computeTheme(parent),
        // Exposes the rows as an accessible list, for screen readers and for tests to read.
        screenReaderMode: true,
      });
      terminal = opened;
      const fit = new FitAddon();
      opened.loadAddon(fit);
      opened.open(parent);
      fit.fit();
      // dockview shows a new panel kept in the page in its next animation frame, and a hidden one can't take focus.
      const focusing = requestAnimationFrame(() => opened.focus());
      cleanups.push(() => cancelAnimationFrame(focusing));

      // Typed before the host's terminal exists, then sent once it does.
      const typedEarly: string[] = [];
      const typing = opened.onData((data) => {
        if (id === undefined) typedEarly.push(data);
        else client.call(terminalWriteMethod, { id, data }).catch(reportError);
      });
      cleanups.push(() => typing.dispose());

      const result = await client.call(terminalOpenMethod, {
        cwd,
        cols: opened.cols,
        rows: opened.rows,
      });
      const openedId = result.id;
      if (isUnmounted()) {
        await client.call(terminalCloseMethod, { id: openedId });
        return;
      }
      id = openedId;

      cleanups.push(
        client.onNotification(terminalDataNotification, (params) => {
          if (params.id === openedId) opened.write(params.data);
        }),
        client.onNotification(terminalExitNotification, (params) => {
          if (params.id !== openedId) return;
          shellExited = true;
          shellExitedEvent();
        }),
      );
      for (const data of typedEarly) {
        client.call(terminalWriteMethod, { id: openedId, data }).catch(reportError);
      }

      const resizing = opened.onResize(({ cols, rows }) => {
        client.call(terminalResizeMethod, { id: openedId, cols, rows }).catch(reportError);
      });
      cleanups.push(() => resizing.dispose());
      // Sized to its panel whenever the panel changes size, but not while it's hidden and has no size.
      const observer = new ResizeObserver(() => {
        if (parent.clientWidth > 0 && parent.clientHeight > 0) fit.fit();
      });
      observer.observe(parent);
      cleanups.push(() => observer.disconnect());
    }

    start(element).catch((error: unknown) => {
      reportError(error);
      // No shell will ever run in this panel.
      if (!isUnmounted() && id === undefined) shellExitedEvent();
    });
    return () => {
      unmounted = true;
      for (const cleanup of cleanups) cleanup();
      terminal?.dispose();
      if (id !== undefined && !shellExited) {
        client.call(terminalCloseMethod, { id }).catch(reportError);
      }
    };
  }, [client, cwd]);

  return <div ref={container} role="region" aria-label={label} className="h-full" />;
}
