import { describe, expect, it } from "vitest";
import { browserUrl } from "./external-url.ts";

describe("browserUrl", () => {
  it("accepts http and https URLs", () => {
    expect(browserUrl("https://example.com/a.pdf")).toBe("https://example.com/a.pdf");
    expect(browserUrl("http://example.com")).toBe("http://example.com/");
  });

  it("ignores the case of the protocol", () => {
    expect(browserUrl("HTTPS://example.com/")).toBe("https://example.com/");
  });

  it("refuses protocols other than http and https", () => {
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://example.com/a",
      "vscode://settings",
      "mailto:a@example.com",
      "ms-msdt:/id PCWDiagnostic",
    ]) {
      expect(browserUrl(url), url).toBeUndefined();
    }
  });

  it("refuses what is not an absolute URL", () => {
    for (const url of ["", "material/a.pdf", "/etc/passwd", "//example.com", "http://", "https:"]) {
      expect(browserUrl(url), url).toBeUndefined();
    }
  });

  it("refuses values that are not strings", () => {
    for (const value of [
      undefined,
      null,
      42,
      {},
      ["https://example.com"],
      new URL("https://a.b"),
    ]) {
      expect(browserUrl(value)).toBeUndefined();
    }
  });

  it("does not let leading whitespace or control characters hide another protocol", () => {
    expect(browserUrl(" javascript:alert(1)")).toBeUndefined();
    expect(browserUrl("java\tscript:alert(1)")).toBeUndefined();
  });
});
