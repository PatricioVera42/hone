import { handleJsonRpcMessage, hostReadyLine, type MethodHandler } from "@hone/protocol";
import { createServer } from "node:http";
import readline from "node:readline";
import { URL } from "node:url";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { createConnection, type Connection } from "./handlers.ts";
import { rawDataToText } from "./raw-data-text.ts";

function readToken(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    rl.once("line", (line) => {
      rl.close();
      resolve(line);
    });
  });
}

async function respond(
  socket: WebSocket,
  handlers: readonly MethodHandler[],
  data: RawData,
): Promise<void> {
  const response = await handleJsonRpcMessage(rawDataToText(data), handlers);
  socket.send(response);
}

async function main(): Promise<void> {
  const token = await readToken();
  const connections = new Set<Connection>();
  process.stdin.resume();
  process.stdin.on("end", () => {
    // Closed first, so no terminal outlives the host.
    void Promise.all([...connections].map((connection) => connection.close())).finally(() =>
      process.exit(0),
    );
  });

  const httpServer = createServer();
  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info, callback) => {
      const url = new URL(info.req.url ?? "", "http://localhost");
      callback(url.searchParams.get("token") === token, 401);
    },
  });

  wss.on("connection", (socket) => {
    const connection = createConnection((message) => socket.send(message));
    connections.add(connection);
    socket.on("message", (data: RawData) => {
      void respond(socket, connection.handlers, data);
    });
    socket.on("close", () => {
      connections.delete(connection);
      void connection.close();
    });
  });

  httpServer.listen(0, "127.0.0.1", () => {
    const address = httpServer.address();
    if (address === null || typeof address === "string") {
      throw new Error("host server has no port");
    }
    process.stdout.write(`${hostReadyLine} ${String(address.port)}\n`);
  });
}

void main();
