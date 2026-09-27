import type { RawData } from "ws";

/** Decodes a WebSocket message payload as UTF-8 text, regardless of which of `ws`'s frame shapes it arrived as. */
export function rawDataToText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString();
  if (Array.isArray(data)) return Buffer.concat(data).toString();
  return Buffer.from(data).toString();
}
