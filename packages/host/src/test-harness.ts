import { hostReadyLine } from "@hone/protocol";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { WebSocket, type RawData } from "ws";
import { rawDataToText } from "./raw-data-text.ts";

const hostEntry = path.join(import.meta.dirname, "main.ts");

/** A JSON-RPC error response's `error`, thrown by {@link TestHost.call} so tests can assert on its code. */
class RpcCallError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export interface TestHost {
  readonly process: ChildProcessWithoutNullStreams;
  readonly client: WebSocket;
  /** Sends a JSON-RPC request and resolves with its result, or rejects with a {@link RpcCallError}. */
  call(method: string, params: unknown): Promise<unknown>;
  /** Closes the socket and the host's stdin, and waits for the process to exit. */
  close(): Promise<void>;
}

function readReadyPort(child: ChildProcessWithoutNullStreams): Promise<number> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    function onData(chunk: Buffer): void {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) return;
      child.stdout.off("data", onData);
      const line = buffer.slice(0, newlineIndex);
      if (!line.startsWith(`${hostReadyLine} `)) {
        reject(new Error(`unexpected line on the host's stdout: ${line}`));
        return;
      }
      const port = Number(line.slice(hostReadyLine.length + 1));
      if (!Number.isInteger(port)) {
        reject(new Error(`ready line has no port: ${line}`));
        return;
      }
      resolve(port);
    }
    child.stdout.on("data", onData);
    child.once("exit", (code) => {
      reject(new Error(`host exited before printing the ready line (code ${String(code)})`));
    });
  });
}

const responseSchema = z.union([
  z.object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]),
    result: z.unknown(),
  }),
  z.object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number(), z.null()]),
    error: z.object({ code: z.number(), message: z.string() }),
  }),
]);

/** Connects to a running host's WebSocket server with the given token, resolving once open or rejecting on error. */
export function connectToHost(port: number, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${String(port)}/?token=${token}`);
    client.once("open", () => resolve(client));
    client.once("error", reject);
  });
}

export interface SpawnedHost {
  readonly process: ChildProcessWithoutNullStreams;
  readonly port: number;
  readonly token: string;
}

/** Spawns the real host, the way the app will: token on stdin, port from the ready line. Doesn't connect. */
export async function spawnHost(): Promise<SpawnedHost> {
  const token = randomBytes(32).toString("hex");
  const child = spawn(process.execPath, [hostEntry], { stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.write(`${token}\n`);
  const port = await readReadyPort(child);
  return { process: child, port, token };
}

/** Spawns the real host and connects a client with the right token. */
export async function startTestHost(): Promise<TestHost> {
  const { process: child, port, token } = await spawnHost();
  const client = await connectToHost(port, token);

  let nextId = 1;
  function call(method: string, params: unknown): Promise<unknown> {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      function onMessage(data: RawData): void {
        const parsedJson: unknown = JSON.parse(rawDataToText(data));
        const parsed = responseSchema.safeParse(parsedJson);
        if (!parsed.success || parsed.data.id !== id) return;
        client.off("message", onMessage);
        if ("error" in parsed.data)
          reject(new RpcCallError(parsed.data.error.code, parsed.data.error.message));
        else resolve(parsed.data.result);
      }
      client.on("message", onMessage);
      client.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  return {
    process: child,
    client,
    call,
    close: async () => {
      client.close();
      child.stdin.end();
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    },
  };
}
