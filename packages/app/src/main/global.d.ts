// Lets Playwright's `electronApp.evaluate` reach the running host process from outside, without a preload API.
import type { ChildProcessWithoutNullStreams } from "node:child_process";

declare global {
  var honeHostProcess: ChildProcessWithoutNullStreams | undefined;
}
