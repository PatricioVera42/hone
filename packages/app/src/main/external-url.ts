/**
 * The URL to hand to the system browser, or `undefined` when `value` isn't an `http:` or `https:` URL. The renderer
 * isn't trusted to filter, since notes are often written by agents: `file:`, `javascript:` and custom schemes would run
 * programs or leak files if passed on to the system. Returns the normalized form, not the caller's string.
 */
export function browserUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
}
