import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, type SelectionRange } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { previewSpans } from "./live-preview.ts";

/** The text `previewSpans` hides in `doc` with the given selection, which is a cursor at 0 unless given. */
function spans(doc: string, ...selection: SelectionRange[]) {
  const state = EditorState.create({
    doc,
    extensions: [
      yamlFrontmatter({ content: markdown({ base: markdownLanguage }) }),
      EditorState.allowMultipleSelections.of(true),
    ],
    selection: selection.length > 0 ? EditorSelection.create(selection) : { anchor: 0 },
  });
  ensureSyntaxTree(state, doc.length, 5000);
  return previewSpans(state, [{ from: 0, to: doc.length }]);
}

function hiddenText(doc: string, ...selection: SelectionRange[]): string[] {
  return spans(doc, ...selection).hidden.map((span) => doc.slice(span.from, span.to));
}

const cursor = (at: number) => EditorSelection.cursor(at);
const range = (anchor: number, head: number) => EditorSelection.range(anchor, head);

describe("headings", () => {
  const doc = "plain\n## Title\nafter";

  it("hide their marks and the space after them", () => {
    expect(hiddenText(doc, cursor(0))).toEqual(["## "]);
  });

  it("show their marks with the cursor anywhere on the line, edges included", () => {
    expect(hiddenText(doc, cursor(doc.indexOf("##")))).toEqual([]);
    expect(hiddenText(doc, cursor(doc.indexOf("Title") + 2))).toEqual([]);
    expect(hiddenText(doc, cursor(doc.indexOf("\nafter")))).toEqual([]);
  });

  it("hide the closing marks of a heading with the space before them", () => {
    expect(hiddenText("x\n\n# Title ##", cursor(0))).toEqual(["# ", " ##"]);
  });

  it("never hide the same text twice when the closing marks follow the opening ones", () => {
    for (const heading of ["# #", "## ##", "# # #"]) {
      const note = `x\n\n${heading}`;
      const { hidden } = spans(note, cursor(0));
      const sorted = hidden.toSorted((a, b) => a.from - b.from);
      for (const [i, span] of sorted.entries()) {
        expect(span.from).toBeGreaterThanOrEqual(sorted[i - 1]?.to ?? 0);
      }
    }
  });

  it("keep the syntax of formatting inside a heading hidden while the cursor is elsewhere in it", () => {
    const heading = "# a **b** c";
    expect(hiddenText(heading, cursor(heading.indexOf("a")))).toEqual(["**", "**"]);
  });

  it("are not made from a frontmatter's closing line", () => {
    const note = "---\nname: x\n---\n\n# Real\n\nend";
    expect(hiddenText(note, cursor(note.length))).toEqual(["# "]);
  });
});

describe("inline formatting", () => {
  it("hides the marks of bold, italic, strikethrough and code", () => {
    const doc = "**b** *i* _u_ ~~s~~ `c`\n\nend";
    expect(hiddenText(doc, cursor(doc.length))).toEqual([
      "**",
      "**",
      "*",
      "*",
      "_",
      "_",
      "~~",
      "~~",
      "`",
      "`",
    ]);
  });

  it("shows only the element the cursor touches", () => {
    const doc = "a **bold** and *italic*";
    const inBold = hiddenText(doc, cursor(doc.indexOf("old")));
    expect(inBold).toEqual(["*", "*"]);
  });

  it("shows an element with the cursor right at its edge, and not one character away", () => {
    const doc = "a **bold** b";
    expect(hiddenText(doc, cursor(doc.indexOf("**")))).toEqual([]);
    expect(hiddenText(doc, cursor(doc.indexOf("**") - 1))).toEqual(["**", "**"]);
    expect(hiddenText(doc, cursor(doc.lastIndexOf("**") + 2))).toEqual([]);
    expect(hiddenText(doc, cursor(doc.lastIndexOf("**") + 3))).toEqual(["**", "**"]);
  });

  it("hides the marks of nested formatting separately", () => {
    const doc = "***both*** end";
    const { hidden } = spans(doc, cursor(doc.length));
    const sorted = hidden.toSorted((a, b) => a.from - b.from);
    expect(sorted.map((span) => doc.slice(span.from, span.to))).toEqual(["*", "**", "**", "*"]);
  });

  it("leaves an unclosed mark alone", () => {
    expect(hiddenText("a **bold and *loose", cursor(0))).toEqual([]);
  });
});

describe("links", () => {
  const doc = "see [Jurafsky](https://example.com/7.pdf) now";

  it("hide the brackets and the url, keeping the text", () => {
    expect(hiddenText(doc, cursor(doc.length))).toEqual(["[", "](https://example.com/7.pdf)"]);
  });

  it("show everything with the cursor in the link, url included", () => {
    expect(hiddenText(doc, cursor(doc.indexOf("Juraf")))).toEqual([]);
    expect(hiddenText(doc, cursor(doc.indexOf("example")))).toEqual([]);
  });

  it("stay as typed when the url is split over two lines", () => {
    const note = "see [text](https://example.com/a\nb) now";
    expect(hiddenText(note, cursor(note.length))).toEqual([]);
  });

  it("leave a reference link and wikilinks as typed", () => {
    const note = "[text][ref] and [[note]]\n\n[ref]: https://x.org";
    expect(hiddenText(note, cursor(note.length))).toEqual([]);
  });
});

describe("selections", () => {
  const doc = "**a** and *b* and `c`";

  it("show every element a selection spans, and only those", () => {
    const from = doc.indexOf("a");
    const to = doc.indexOf("b") + 1;
    expect(hiddenText(doc, range(from, to))).toEqual(["`", "`"]);
  });

  it("show the elements of each cursor of a multiple selection", () => {
    expect(hiddenText(doc, cursor(doc.indexOf("a")), cursor(doc.indexOf("c")))).toEqual(["*", "*"]);
  });
});

describe("the visible part", () => {
  it("is the only part computed", () => {
    const doc = "**first**\n\n**second**";
    const state = EditorState.create({
      doc,
      extensions: markdown({ base: markdownLanguage }),
      selection: { anchor: doc.length },
    });
    ensureSyntaxTree(state, doc.length, 5000);
    const { hidden } = previewSpans(state, [{ from: 0, to: 9 }]);
    expect(hidden.map((span) => doc.slice(span.from, span.to))).toEqual(["**", "**"]);
    expect(hidden[0]?.from).toBe(0);
  });
});
