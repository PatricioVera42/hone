// Development command: `pnpm sync-workshop <path>` copies the repo's generator and default library into an existing workshop.
import path from "node:path";
import { seedGenerator, seedLibrary } from "./seed-workshop.ts";
import { isWorkshopRoot } from "./workshop.ts";

const argument = process.argv[2];
if (argument === undefined) {
  process.stderr.write("Usage: pnpm sync-workshop <path-to-workshop>\n");
  process.exit(1);
}

const root = path.resolve(argument);
if (!(await isWorkshopRoot(root))) {
  process.stderr.write(`${root} is not a workshop root: it has no .hone/generator/ inside it\n`);
  process.exit(1);
}

await seedGenerator(root);
await seedLibrary(root);
