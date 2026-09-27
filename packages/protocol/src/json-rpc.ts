import { z } from "zod";
import { AppError } from "./errors.ts";

/** The JSON-RPC 2.0 standard error codes, for parse errors, invalid requests and the like. */
export const jsonRpcErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

/** A method or notification's shared definition: both sides derive their types and validation from it. */
export interface MethodDefinition<Params = unknown, Result = unknown> {
  readonly name: string;
  readonly params: z.ZodType<Params>;
  readonly result: z.ZodType<Result>;
}

export interface MethodHandler {
  readonly name: string;
  readonly execute: (rawParams: unknown) => Promise<unknown>;
}

class InvalidParamsError extends Error {}

/** Binds a method definition to its implementation, validating params before calling it. */
export function registerMethod<Params, Result>(
  method: MethodDefinition<Params, Result>,
  handle: (params: Params) => Result | Promise<Result>,
): MethodHandler {
  return {
    name: method.name,
    execute: async (rawParams) => {
      const parsed = method.params.safeParse(rawParams);
      if (!parsed.success) throw new InvalidParamsError();
      return handle(parsed.data);
    },
  };
}

const jsonRpcIdSchema = z.union([z.string(), z.number()]);

const requestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: jsonRpcIdSchema,
  method: z.string(),
  params: z.unknown().optional(),
});

const idOnlySchema = z.object({ id: jsonRpcIdSchema.optional() });

function extractId(value: unknown): string | number | null {
  const result = idOnlySchema.safeParse(value);
  return result.success && result.data.id !== undefined ? result.data.id : null;
}

function errorResponse(id: string | number | null, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

/** Parses and dispatches one incoming JSON-RPC request, returning the JSON text of its response. */
export async function handleJsonRpcMessage(
  raw: string,
  handlers: readonly MethodHandler[],
): Promise<string> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return errorResponse(null, jsonRpcErrorCodes.ParseError, "Parse error");
  }

  const requestResult = requestSchema.safeParse(parsedJson);
  if (!requestResult.success) {
    return errorResponse(
      extractId(parsedJson),
      jsonRpcErrorCodes.InvalidRequest,
      "Invalid Request",
    );
  }
  const request = requestResult.data;

  const handler = handlers.find((candidate) => candidate.name === request.method);
  if (handler === undefined) {
    return errorResponse(
      request.id,
      jsonRpcErrorCodes.MethodNotFound,
      `Method not found: ${request.method}`,
    );
  }

  try {
    const result = await handler.execute(request.params);
    return JSON.stringify({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    if (error instanceof InvalidParamsError) {
      return errorResponse(request.id, jsonRpcErrorCodes.InvalidParams, "Invalid params");
    }
    if (error instanceof AppError) {
      return errorResponse(request.id, error.code, error.message);
    }
    return errorResponse(request.id, jsonRpcErrorCodes.InternalError, "Internal error");
  }
}
