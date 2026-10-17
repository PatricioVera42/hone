import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, type SelectionRange } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { previewSpans } from "./live-preview.ts";

/**
 * A state whose syntax tree covers all of `doc`. `EditorState.create` parses for only 20 ms, and `ensureSyntaxTree`
 * finishes the parse but leaves `syntaxTree(state)` on the partial tree, which an update brings up to date.
 */
function parsedState(doc: string, selection: SelectionRange[] = [cursor(0)]): EditorState {
  const state = EditorState.create({
    doc,
    extensions: [
      yamlFrontmatter({ content: markdown({ base: markdownLanguage }) }),
      EditorState.allowMultipleSelections.of(true),
    ],
    selection: EditorSelection.create(selection),
  });
  ensureSyntaxTree(state, doc.length, 5000);
  return state.update({}).state;
}

/** What `previewSpans` finds in `doc` with the given selection, which is a cursor at 0 unless given. */
function spans(doc: string, ...selection: SelectionRange[]) {
  return previewSpans(parsedState(doc, selection.length > 0 ? selection : undefined), [
    { from: 0, to: doc.length },
  ]);
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
    const state = parsedState(doc, [cursor(doc.length)]);
    const { hidden } = previewSpans(state, [{ from: 0, to: 9 }]);
    expect(hidden.map((span) => doc.slice(span.from, span.to))).toEqual(["**", "**"]);
    expect(hidden[0]?.from).toBe(0);
  });
});

/** The text of each span, in document order. */
function textOf(doc: string, found: readonly { from: number; to: number }[]): string[] {
  return found.toSorted((a, b) => a.from - b.from).map((span) => doc.slice(span.from, span.to));
}

describe("lists", () => {
  const doc = "intro\n\n- one\n  * nested\n+ plus\n\n1. first\n2) second\n\nend";

  it("draw every kind of bullet marker as a bullet and leave numbers as typed", () => {
    const found = spans(doc, cursor(doc.length));
    expect(textOf(doc, found.bullets)).toEqual(["-", "*", "+"]);
    expect(textOf(doc, found.numbers)).toEqual(["1.", "2)"]);
    expect(found.hidden).toEqual([]);
  });

  it("show a bullet as typed only with the cursor on its marker", () => {
    const at = doc.indexOf("- one");
    expect(textOf(doc, spans(doc, cursor(at)).bullets)).toEqual(["*", "+"]);
    expect(textOf(doc, spans(doc, cursor(at + 1)).bullets)).toEqual(["*", "+"]);
    // The text of the item is not the marker.
    expect(textOf(doc, spans(doc, cursor(at + 3)).bullets)).toEqual(["-", "*", "+"]);
  });

  it("show the markers a selection spans", () => {
    const from = doc.indexOf("one");
    const to = doc.indexOf("plus");
    expect(textOf(doc, spans(doc, range(from, to)).bullets)).toEqual(["-"]);
  });

  it("are not lists inside a code block", () => {
    const note = "```\n- not a list\n1. nor this\n```\n\nend";
    const found = spans(note, cursor(note.length));
    expect(found.bullets).toEqual([]);
    expect(found.numbers).toEqual([]);
  });
});

describe("quotes", () => {
  const doc = "intro\n\n> first\n> second\nlazy\n\n> > deep\n\nend";

  it("hide each `>` with the space after it and give every line of the quote its bar", () => {
    const found = spans(doc, cursor(doc.length));
    expect(textOf(doc, found.hidden)).toEqual(["> ", "> ", "> ", "> "]);
    const barred = found.lines.filter(({ look }) => look === "quote").map(({ at }) => at);
    const starts = ["> first", "> second", "lazy", "> > deep"].map((line) => doc.indexOf(line));
    expect(barred.toSorted((a, b) => a - b)).toEqual(starts);
  });

  it("show the `>` of the line the cursor is on and keep hiding the others", () => {
    const hidden = spans(doc, cursor(doc.indexOf("second") + 2)).hidden;
    expect(hidden.map((span) => span.from)).not.toContain(doc.indexOf("> second"));
    expect(hidden).toHaveLength(3);
  });

  it("show the `>` of every line a selection reaches, the line it ends at the start of included", () => {
    const note = "intro\n\n> first\n> second\n> third\n\nend";
    const from = note.indexOf("first") + 2;
    const to = note.indexOf("> second");
    expect(textOf(note, spans(note, range(from, to)).hidden)).toEqual(["> "]);
    expect(spans(note, range(from, to)).hidden[0]?.from).toBe(note.indexOf("> third"));
  });

  it("hide the `>` of an empty quote line", () => {
    const note = ">\n> text\n\nend";
    expect(textOf(note, spans(note, cursor(note.length)).hidden)).toEqual([">", "> "]);
  });
});

describe("horizontal rules", () => {
  const doc = "above\n\n---\n\n***\n\nbelow";

  it("hide their text and draw their line", () => {
    const found = spans(doc, cursor(doc.length));
    expect(textOf(doc, found.hidden)).toEqual(["---", "***"]);
    expect(found.lines.map(({ at }) => at)).toEqual([doc.indexOf("---"), doc.indexOf("***")]);
  });

  it("show their text with the cursor on them", () => {
    const found = spans(doc, cursor(doc.indexOf("---") + 1));
    expect(textOf(doc, found.hidden)).toEqual(["***"]);
  });

  it("are not made from the line under a paragraph, which is a heading", () => {
    const note = "Title\n---\n\nend";
    expect(spans(note, cursor(note.length)).lines).toEqual([]);
  });

  it("are not made from a frontmatter's fences", () => {
    const note = "---\nname: x\n---\n\nend";
    expect(spans(note, cursor(note.length)).lines).toEqual([]);
  });
});

describe("code blocks", () => {
  const doc = "intro\n\n```ts\nconst x = 1;\n\nlet y;\n```\n\nend";

  it("hide both fences, the language included, and put every line on the code background", () => {
    const found = spans(doc, cursor(doc.length));
    expect(textOf(doc, found.hidden)).toEqual(["```ts", "```"]);
    const code = found.lines.filter(({ look }) => look === "code").map(({ at }) => at);
    expect(code).toHaveLength(5);
    expect(code[0]).toBe(doc.indexOf("```ts"));
  });

  it("show both fences with the cursor anywhere in the block, edges included", () => {
    for (const at of [doc.indexOf("```ts"), doc.indexOf("const"), doc.indexOf("\n\nend")]) {
      const found = spans(doc, cursor(at));
      expect(found.hidden).toEqual([]);
      expect(found.lines.filter(({ look }) => look === "code")).toHaveLength(5);
    }
  });

  it("show the fences of a block one cursor is in without revealing what another cursor is outside of", () => {
    const note = "**b**\n\n```\ncode\n```\n\nend";
    const found = spans(note, cursor(note.indexOf("code")), cursor(note.length));
    expect(textOf(note, found.hidden)).toEqual(["**", "**"]);
  });

  it("hide the `>` of every line of a block inside a quote, the fences too", () => {
    const note = "> ```js\n> let a;\n> ```\n\nend";
    expect(textOf(note, spans(note, cursor(note.length)).hidden)).toEqual([
      "> ",
      "```js",
      "> ",
      "> ",
      "```",
    ]);
  });

  it("hide only the opening fence of a block still open at the end of the note", () => {
    const note = "intro\n\n```\ncode";
    expect(textOf(note, spans(note, cursor(0)).hidden)).toEqual(["```"]);
  });

  it("leave Markdown inside as it is", () => {
    const note = "```md\n**bold** and [a](b)\n```\n\nend";
    const found = spans(note, cursor(note.length));
    expect(textOf(note, found.hidden)).toEqual(["```md", "```"]);
  });

  it("give only the visible lines their background", () => {
    const state = parsedState(doc);
    const { lines } = previewSpans(state, [
      { from: doc.indexOf("const"), to: doc.indexOf("const") + 3 },
    ]);
    expect(lines).toEqual([{ at: doc.indexOf("const"), look: "code" }]);
  });
});
