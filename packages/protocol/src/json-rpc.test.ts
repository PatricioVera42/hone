import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "./errors.ts";
import {
  encodeNotification,
  handleJsonRpcMessage,
  jsonRpcErrorCodes,
  registerMethod,
  type NotificationDefinition,
} from "./json-rpc.ts";

const echoMethod = {
  name: "test.echo",
  params: z.object({ text: z.string() }),
  result: z.object({ text: z.string() }),
};

const failMethod = {
  name: "test.fail",
  params: z.object({}),
  result: z.unknown(),
};

const handlers = [
  registerMethod(echoMethod, ({ text }) => ({ text })),
  registerMethod(failMethod, () => {
    throw new AppError("NotFound", "nope");
  }),
];

async function parseResponse(raw: string): Promise<unknown> {
  const response = await handleJsonRpcMessage(raw, handlers);
  return JSON.parse(response);
}

describe("handleJsonRpcMessage", () => {
  it("returns a ParseError for malformed JSON", async () => {
    const response = await parseResponse("{not json");
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: null,
      error: { code: jsonRpcErrorCodes.ParseError },
    });
  });

  it("returns an InvalidRequest error when the envelope is wrong", async () => {
    const response = await parseResponse(JSON.stringify({ jsonrpc: "2.0", id: 1 }));
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: { code: jsonRpcErrorCodes.InvalidRequest },
    });
  });

  it("returns a MethodNotFound error for an unknown method", async () => {
    const response = await parseResponse(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "test.unknown", params: {} }),
    );
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: { code: jsonRpcErrorCodes.MethodNotFound },
    });
  });

  it("returns an InvalidParams error when params don't match the schema", async () => {
    const response = await parseResponse(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "test.echo", params: { text: 1 } }),
    );
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: { code: jsonRpcErrorCodes.InvalidParams },
    });
  });

  it("returns the handler's result for a valid call", async () => {
    const response = await parseResponse(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "test.echo", params: { text: "hi" } }),
    );
    expect(response).toStrictEqual({ jsonrpc: "2.0", id: 1, result: { text: "hi" } });
  });

  it("turns a thrown AppError into its application error code", async () => {
    const response = await parseResponse(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "test.fail", params: {} }),
    );
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32003, message: "nope" },
    });
  });
});

describe("encodeNotification", () => {
  const pingNotification: NotificationDefinition<{ count: number }> = {
    name: "test.ping",
    params: z.object({ count: z.number() }),
  };

  it("builds a JSON-RPC notification, with no id", () => {
    expect(JSON.parse(encodeNotification(pingNotification, { count: 1 }))).toStrictEqual({
      jsonrpc: "2.0",
      method: "test.ping",
      params: { count: 1 },
    });
  });
});
