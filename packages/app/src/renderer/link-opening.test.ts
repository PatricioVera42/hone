import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { linkUrlAt } from "./link-opening.ts";

/** The URL `linkUrlAt` finds at the first occurrence of `at` in `doc`, one character into it. */
function urlAt(doc: string, at: string): string | undefined {
  const state = EditorState.create({
    doc,
    extensions: [yamlFrontmatter({ content: markdown({ base: markdownLanguage }) })],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  return linkUrlAt(state, doc.indexOf(at) + 1);
}

describe("linkUrlAt", () => {
  it("finds the url of a [text](url) link from its text and from its url", () => {
    const doc = "See [the paper](https://example.com/p.pdf) now";
    expect(urlAt(doc, "the paper")).toBe("https://example.com/p.pdf");
    expect(urlAt(doc, "example.com")).toBe("https://example.com/p.pdf");
  });

  it("finds an autolink and a bare url", () => {
    expect(urlAt("a <https://example.com/x> b", "example")).toBe("https://example.com/x");
    expect(urlAt("a https://example.com/y b", "example")).toBe("https://example.com/y");
  });

  it("gives a relative link as typed, for main to refuse", () => {
    expect(urlAt("[x](material/a.pdf)", "x]")).toBe("material/a.pdf");
  });

  it("finds nothing outside a link", () => {
    expect(urlAt("plain text [x](https://a.b) after", "plain")).toBeUndefined();
    expect(urlAt("plain text [x](https://a.b) after", "after")).toBeUndefined();
  });

  it("finds nothing in an image or a link with no url", () => {
    expect(urlAt("![alt](https://a.b/i.png)", "alt")).toBeUndefined();
    expect(urlAt("[text][ref]\n\n[ref]: https://a.b", "text")).toBeUndefined();
  });
});
