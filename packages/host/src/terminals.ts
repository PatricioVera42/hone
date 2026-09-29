import { randomUUID } from "node:crypto";
import { spawn, type IPty } from "node-pty";

/** Where a {@link Terminals} set reports what its terminals do. */
export interface TerminalEvents {
  data(id: string, data: string): void;
  exit(id: string, exitCode: number): void;
}

/** The terminals one connection opened, keyed by id. */
export class Terminals {
  private readonly running = new Map<string, IPty>();
  private readonly events: TerminalEvents;

  constructor(events: TerminalEvents) {
    this.events = events;
  }

  /** Starts `$SHELL -l` (`/bin/bash -l` when `SHELL` is unset) in the absolute folder `cwd`, and returns its id. */
  open(cwd: string, cols: number, rows: number): string {
    const id = randomUUID();
    const shell = process.env["SHELL"] ?? "/bin/bash";
    const pty = spawn(shell, ["-l"], {
      name: "xterm-256color",
      cwd,
      cols,
      rows,
      env: { ...process.env, TERM: "xterm-256color" },
    });
    this.running.set(id, pty);
    pty.onData((data) => this.events.data(id, data));
    pty.onExit(({ exitCode }) => {
      this.running.delete(id);
      this.events.exit(id, exitCode);
    });
    return id;
  }

  write(id: string, data: string): void {
    this.running.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.running.get(id)?.resize(cols, rows);
  }

  /** Kills a terminal's shell. Its exit is reported once it's gone. */
  close(id: string): void {
    this.running.get(id)?.kill();
  }

  /** Kills every terminal's shell. */
  closeAll(): void {
    for (const pty of this.running.values()) pty.kill();
  }
}
