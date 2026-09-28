// One WebSocket per window to the host, wrapping the protocol's definitions into typed calls and notifications.
import type { MethodDefinition, NotificationDefinition } from "@hone/protocol";
import { z } from "zod";

/** A JSON-RPC error response's `error`, thrown by {@link HostClient.call}. */
export class HostCallError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

const responseSchema = z.union([
  z.object({ jsonrpc: z.literal("2.0"), id: z.number(), result: z.unknown() }),
  z.object({
    jsonrpc: z.literal("2.0"),
    id: z.number(),
    error: z.object({ code: z.number(), message: z.string() }),
  }),
]);

const notificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.unknown().optional(),
});

interface PendingCall {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
}

export class HostClient {
  private readonly socket: WebSocket;
  private readonly pending = new Map<number, PendingCall>();
  private readonly notificationHandlers = new Map<string, Set<(params: unknown) => void>>();
  private readonly outbox: string[] = [];
  private open = false;
  private nextId = 1;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener("open", () => {
      this.open = true;
      for (const message of this.outbox) this.socket.send(message);
      this.outbox.length = 0;
    });
    this.socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      this.handleMessage(event.data);
    });
  }

  /** Sends a request built from a method definition and resolves with its validated, typed result. */
  call<Params, Result>(method: MethodDefinition<Params, Result>, params: Params): Promise<Result> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send(JSON.stringify({ jsonrpc: "2.0", id, method: method.name, params }));
    }).then((result) => method.result.parse(result));
  }

  /** Subscribes to a notification, validating each delivery against its params schema. Returns an unsubscribe function. */
  onNotification<Params>(
    notification: NotificationDefinition<Params>,
    handler: (params: Params) => void,
  ): () => void {
    let handlers = this.notificationHandlers.get(notification.name);
    if (handlers === undefined) {
      handlers = new Set();
      this.notificationHandlers.set(notification.name, handlers);
    }
    const wrapped = (rawParams: unknown): void => {
      handler(notification.params.parse(rawParams));
    };
    handlers.add(wrapped);
    return () => handlers.delete(wrapped);
  }

  /** Calls `handler` once the socket opens. Returns an unsubscribe function. */
  onOpen(handler: () => void): () => void {
    this.socket.addEventListener("open", handler);
    return () => this.socket.removeEventListener("open", handler);
  }

  /** Calls `handler` once the socket closes, such as when the host process dies. Returns an unsubscribe function. */
  onClose(handler: () => void): () => void {
    this.socket.addEventListener("close", handler);
    return () => this.socket.removeEventListener("close", handler);
  }

  close(): void {
    this.socket.close();
  }

  private send(message: string): void {
    if (this.open) this.socket.send(message);
    else this.outbox.push(message);
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") return;
    const parsedJson: unknown = JSON.parse(data);

    const response = responseSchema.safeParse(parsedJson);
    if (response.success) {
      this.handleResponse(response.data);
      return;
    }

    const notification = notificationSchema.safeParse(parsedJson);
    if (notification.success) this.handleNotification(notification.data);
  }

  private handleResponse(response: z.infer<typeof responseSchema>): void {
    const call = this.pending.get(response.id);
    if (call === undefined) return;
    this.pending.delete(response.id);
    if ("error" in response)
      call.reject(new HostCallError(response.error.code, response.error.message));
    else call.resolve(response.result);
  }

  private handleNotification(notification: z.infer<typeof notificationSchema>): void {
    const handlers = this.notificationHandlers.get(notification.method);
    if (handlers === undefined) return;
    for (const handler of handlers) handler(notification.params);
  }
}
