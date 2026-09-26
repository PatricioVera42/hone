import { hostReadyLine } from "@hone/protocol";

process.stdout.write(`${hostReadyLine}\n`);
// Stay alive until the app closes our stdin.
process.stdin.resume();
