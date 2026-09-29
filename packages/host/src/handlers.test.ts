import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createConnection, type Connection } from "./handlers.ts";

async function makeWorkshop(files = 0): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hone-workshop-"));
  await fs.mkdir(path.join(root, ".hone", "generator"), { recursive: true });
  await Promise.all(
    Array.from({ length: files }, (_, index) =>
      fs.writeFile(path.join(root, `file${String(index)}.md`), ""),
    ),
  );
  return root;
}

function openWorkshop(connection: Connection, root: string): Promise<unknown> {
  const handler = connection.handlers.find((candidate) => candidate.name === "workshop.open");
  if (handler === undefined) throw new Error("no workshop.open handler");
  return handler.execute({ path: root });
}

// Longer than the collapsing window and the time a watcher takes to report a write.
const settleMs = 300;

let connection: Connection | undefined;

afterEach(async () => {
  await connection?.close();
  connection = undefined;
});

describe("createConnection", () => {
  it("stops a watcher that becomes ready after the connection closed", async () => {
    const sent: string[] = [];
    connection = createConnection((message) => sent.push(message));
    const root = await makeWorkshop();

    const opening = openWorkshop(connection, root);
    await connection.close();
    await opening;
    await fs.writeFile(path.join(root, "late.md"), "");
    await setTimeout(settleMs);

    expect(sent).toStrictEqual([]);
  });

  it("keeps watching the workshop opened last when an earlier open finishes after it", async () => {
    const sent: string[] = [];
    connection = createConnection((message) => sent.push(message));
    // The first workshop's initial scan takes longer, so its open finishes second.
    const slow = await makeWorkshop(3000);
    const fast = await makeWorkshop();

    const slowOpening = openWorkshop(connection, slow);
    await openWorkshop(connection, fast);
    await slowOpening;
    await fs.writeFile(path.join(slow, "stale.md"), "");
    await fs.writeFile(path.join(fast, "current.md"), "");
    await setTimeout(settleMs);

    expect(sent.join("\n")).toContain("current.md");
    expect(sent.join("\n")).not.toContain("stale.md");
  });
});
