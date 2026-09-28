import type { MethodDefinition, NotificationDefinition } from "@hone/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import { z } from "zod";
import { HostCallError, HostClient } from "./host-client.ts";

const echoMethod: MethodDefinition<{ value: string }, { value: string }> = {
  name: "test.echo",
  params: z.object({ value: z.string() }),
  result: z.object({ value: z.string() }),
};

const pingNotification: NotificationDefinition<{ count: number }> = {
  name: "test.ping",
  params: z.object({ count: z.number() }),
};

interface FakeHost {
  readonly url: string;
  readonly connection: Promise<ServerSocket>;
  close(): Promise<void>;
}

function startFakeHost(): Promise<FakeHost> {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    server.once("listening", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("fake host has no port"));
        return;
      }
      let connectedSocket: ServerSocket | undefined;
      let resolveConnection: (socket: ServerSocket) => void;
      const connection = new Promise<ServerSocket>((res) => {
        resolveConnection = res;
      });
      server.on("connection", (socket) => {
        connectedSocket = socket;
        resolveConnection(socket);
      });
      resolve({
        url: `ws://127.0.0.1:${String(address.port)}`,
        connection,
        close: () =>
          new Promise((res, rej) => {
            connectedSocket?.close();
            server.close((error) => (error ? rej(error) : res()));
          }),
      });
    });
    server.once("error", reject);
  });
}

let fakeHost: FakeHost | undefined;

afterEach(async () => {
  await fakeHost?.close();
  fakeHost = undefined;
});

describe("call", () => {
  it("resolves with the validated, typed result", async () => {
    fakeHost = await startFakeHost();
    const client = new HostClient(fakeHost.url);
    const socket = await fakeHost.connection;
    socket.on("message", () => {
      socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: "echoed" } }));
    });

    await expect(client.call(echoMethod, { value: "hi" })).resolves.toStrictEqual({
      value: "echoed",
    });
  });

  it("rejects with a HostCallError built from the error response", async () => {
    fakeHost = await startFakeHost();
    const client = new HostClient(fakeHost.url);
    const socket = await fakeHost.connection;
    socket.on("message", () => {
      socket.send(
        JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "nope" } }),
      );
    });

    await expect(client.call(echoMethod, { value: "hi" })).rejects.toMatchObject(
      new HostCallError(-32601, "nope"),
    );
  });
});

describe("onNotification", () => {
  it("delivers validated, typed params to subscribers", async () => {
    fakeHost = await startFakeHost();
    const client = new HostClient(fakeHost.url);
    const socket = await fakeHost.connection;

    const received: number[] = [];
    client.onNotification(pingNotification, (params) => received.push(params.count));
    socket.send(JSON.stringify({ jsonrpc: "2.0", method: "test.ping", params: { count: 1 } }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toStrictEqual([1]);
  });

  it("stops delivering once unsubscribed", async () => {
    fakeHost = await startFakeHost();
    const client = new HostClient(fakeHost.url);
    const socket = await fakeHost.connection;

    const received: number[] = [];
    const unsubscribe = client.onNotification(pingNotification, (params) =>
      received.push(params.count),
    );
    unsubscribe();
    socket.send(JSON.stringify({ jsonrpc: "2.0", method: "test.ping", params: { count: 1 } }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toStrictEqual([]);
  });
});

describe("onClose", () => {
  it("calls the handler once the socket closes", async () => {
    fakeHost = await startFakeHost();
    const client = new HostClient(fakeHost.url);
    await fakeHost.connection;

    const closed = new Promise<void>((resolve) => client.onClose(() => resolve()));
    await fakeHost.close();
    fakeHost = undefined;

    await expect(closed).resolves.toBeUndefined();
  });

  it("stops calling the handler once unsubscribed", async () => {
    fakeHost = await startFakeHost();
    const client = new HostClient(fakeHost.url);
    await fakeHost.connection;

    let calls = 0;
    const unsubscribe = client.onClose(() => (calls += 1));
    unsubscribe();
    await fakeHost.close();
    fakeHost = undefined;

    expect(calls).toBe(0);
  });
});
