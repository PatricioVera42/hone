import { syntaxTree } from "@codemirror/language";
import { type EditorSelection, type EditorState, type Range, type Text } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

/** A span of the document, as `from` and `to` offsets. */
export interface Span {
  readonly from: number;
  readonly to: number;
}

/**
 * The reveal rule every live preview element follows: an element shows its Markdown syntax when the cursor or any
 * selection range touches it, the edges included, so a cursor right before `**bold**` already shows its `**`.
 */
function touchesSelection(selection: EditorSelection, element: Span): boolean {
  return selection.ranges.some((range) => range.from <= element.to && range.to >= element.from);
}

/** How a whole line is drawn: a line of a quote has a bar, a horizontal rule is a line, a line of a code block is on a background. */
type LineLook = "quote" | "rule" | "code";

/** What the live preview draws differently in a stretch of the document, for the current selection. */
export interface PreviewSpans {
  /** Syntax that isn't drawn: the `#` of a heading, the `**` of bold, the backticks of code, the brackets and url of a link. */
  readonly hidden: readonly Span[];
  /** Inline code, backticks included, which gets the code look. */
  readonly inlineCode: readonly Span[];
  /** The `-`, `*` or `+` of bullet list items, each drawn as `•`. */
  readonly bullets: readonly Span[];
  /** The `1.` of ordered list items, which stay as typed with the look of a list marker. */
  readonly numbers: readonly Span[];
  /** The lines drawn in a look of their own, as the offset where each starts. */
  readonly lines: readonly { readonly at: number; readonly look: LineLook }[];
}

/** Child nodes holding the syntax of the inline elements that have nothing else to hide. */
const inlineMarks = new Map([
  ["Emphasis", "EmphasisMark"],
  ["StrongEmphasis", "EmphasisMark"],
  ["Strikethrough", "StrikethroughMark"],
  ["InlineCode", "CodeMark"],
]);

/** Where each line touching `from` to `to` starts. */
function* lineStarts(doc: Text, from: number, to: number): Generator<number> {
  for (let at = doc.lineAt(from).from; at <= to; at = doc.lineAt(at).to + 1) yield at;
}

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

/** Decides what a node of the tree hides or restyles, and whether to look inside it. */
type NodeHandler = (node: SyntaxNode, visible: Span) => boolean;

const atxHeading = /^ATXHeading[1-6]$/;

/**
 * Finds what the live preview hides and restyles inside `visible`, so a long note costs only what's on screen. It
 * reads the syntax tree the editor already has and skips an element the selection touches. YAML frontmatter is
 * never touched: its nodes belong to another language, which none of these names match.
 */
export function previewSpans(state: EditorState, visible: readonly Span[]): PreviewSpans {
  const hidden: Span[] = [];
  const inlineCode: Span[] = [];
  const bullets: Span[] = [];
  const numbers: Span[] = [];
  const lines: { at: number; look: LineLook }[] = [];
  // A quote inside a quote covers the same lines, which get their look once.
  const quoteLines = new Set<number>();
  const { doc, selection } = state;

  const hide = (from: number, to: number) => {
    if (from < to) hidden.push({ from, to });
  };

  // Elements inside a heading follow the rule on their own, so only the heading's own marks are decided here.
  const heading: NodeHandler = (node) => {
    if (touchesSelection(selection, node)) return true;
    const marks = node.getChildren("HeaderMark");
    const opening = marks[0];
    if (opening === undefined) return true;
    // The space after the `#`s goes with them, or the heading would start indented.
    const gap = /^[ \t]+/.exec(doc.sliceString(opening.to, node.to))?.[0].length ?? 0;
    const openingEnd = opening.to + gap;
    hide(opening.from, openingEnd);
    // An optional closing run of `#`s, as in `## Title ##`, with the space before it. That space starts no
    // earlier than where the opening hide ends, so the two never overlap, as in `# #`.
    const closing = marks.length > 1 ? marks[marks.length - 1] : undefined;
    if (closing !== undefined) {
      const lead = /[ \t]*$/.exec(doc.sliceString(openingEnd, closing.from))?.[0].length ?? 0;
      hide(closing.from - lead, closing.to);
    }
    return true;
  };

  const link: NodeHandler = (node) => {
    // Only `[text](url)`: a `[text][ref]` or a bare `[text]` has no url to hide.
    const url = node.getChild("URL");
    const marks = node.getChildren("LinkMark");
    const opening = marks[0];
    const closing = marks[1];
    // A replaced range can't cross a line break, so a link that does (a url split in two) stays as typed.
    const oneLine = doc.lineAt(node.from).to >= node.to;
    if (url !== null && opening !== undefined && closing !== undefined && oneLine) {
      if (!touchesSelection(selection, node)) {
        hide(opening.from, opening.to);
        hide(closing.from, node.to);
      }
    }
    return true;
  };

  const inlineFormatting: NodeHandler = (node) => {
    if (node.name === "InlineCode") inlineCode.push({ from: node.from, to: node.to });
    if (!touchesSelection(selection, node)) {
      for (const mark of node.getChildren(inlineMarks.get(node.name) ?? ""))
        hide(mark.from, mark.to);
    }
    return true;
  };

  const listMark: NodeHandler = (node) => {
    const list = node.parent?.parent?.name;
    if (list === "OrderedList") numbers.push({ from: node.from, to: node.to });
    // Only the marker is the element: the cursor on it shows it as typed, anywhere else in the item it stays `•`.
    else if (list === "BulletList" && !touchesSelection(selection, node)) {
      bullets.push({ from: node.from, to: node.to });
    }
    return true;
  };

  const blockquote: NodeHandler = (node, { from, to }) => {
    // A line of the quote that continues the paragraph without a `>` is part of it and has the bar too.
    for (const at of lineStarts(doc, Math.max(node.from, from), Math.min(node.to, to))) {
      if (!quoteLines.has(at)) lines.push({ at, look: "quote" });
      quoteLines.add(at);
    }
    return true;
  };

  const quoteMark: NodeHandler = (node) => {
    // The reveal is per line, not per quote, so a long quote doesn't jump when the cursor enters it.
    if (!touchesSelection(selection, doc.lineAt(node.from))) {
      // The space after the `>` goes with it, or the quoted text would start indented.
      const gap = doc.sliceString(node.to, node.to + 1) === " " ? 1 : 0;
      hide(node.from, node.to + gap);
    }
    return true;
  };

  const horizontalRule: NodeHandler = (node) => {
    if (!touchesSelection(selection, node)) {
      hide(node.from, node.to);
      lines.push({ at: doc.lineAt(node.from).from, look: "rule" });
    }
    return true;
  };

  const fencedCode: NodeHandler = (node, { from, to }) => {
    for (const at of lineStarts(doc, Math.max(node.from, from), Math.min(node.to, to))) {
      lines.push({ at, look: "code" });
    }
    if (!touchesSelection(selection, node)) {
      // The opening fence takes its language with it. A block still open at the end of the note has no closing one.
      const marks = node.getChildren("CodeMark");
      const opening = marks[0];
      const closing = marks.length > 1 ? marks[marks.length - 1] : undefined;
      if (opening !== undefined) hide(opening.from, doc.lineAt(opening.from).to);
      if (closing !== undefined) hide(closing.from, doc.lineAt(closing.from).to);
    }
    // What's inside is code, not Markdown: a list inside it isn't a list.
    return false;
  };

  const handlers = new Map<string, NodeHandler>([
    ["Link", link],
    ["ListMark", listMark],
    ["Blockquote", blockquote],
    ["QuoteMark", quoteMark],
    ["HorizontalRule", horizontalRule],
    ["FencedCode", fencedCode],
    ...[...inlineMarks.keys()].map((name): [string, NodeHandler] => [name, inlineFormatting]),
  ]);

  const tree = syntaxTree(state);
  for (const range of visible) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter(ref) {
        const handle = atxHeading.test(ref.name) ? heading : handlers.get(ref.name);
        return handle === undefined ? true : handle(ref.node, range);
      },
    });
  }

  return { hidden, inlineCode, bullets, numbers, lines };
}

class BulletWidget extends WidgetType {
  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "cm-list-bullet";
    bullet.textContent = "•";
    return bullet;
  }
}

const hiddenSyntax = Decoration.replace({});
const inlineCodeLook = Decoration.mark({ class: "cm-inline-code" });
const bulletLook = Decoration.replace({ widget: new BulletWidget() });
const numberLook = Decoration.mark({ class: "cm-list-number" });
const lineLooks: Readonly<Record<LineLook, Decoration>> = {
  quote: Decoration.line({ class: "cm-quote-line" }),
  rule: Decoration.line({ class: "cm-rule-line" }),
  code: Decoration.line({ class: "cm-code-block-line" }),
};

function previewDecorations(view: EditorView): DecorationSet {
  const { hidden, inlineCode, bullets, numbers, lines } = previewSpans(
    view.state,
    view.visibleRanges,
  );
  const decorations: Range<Decoration>[] = [
    ...hidden.map((span) => hiddenSyntax.range(span.from, span.to)),
    ...inlineCode.map((span) => inlineCodeLook.range(span.from, span.to)),
    ...bullets.map((span) => bulletLook.range(span.from, span.to)),
    ...numbers.map((span) => numberLook.range(span.from, span.to)),
    ...lines.map(({ at, look }) => lineLooks[look].range(at)),
  ];
  return Decoration.set(decorations, true);
}

/**
 * Draws a note's Markdown as formatted text: its syntax is hidden except in the elements the selection touches. It
 * only changes how the editor draws, never the document.
 */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = previewDecorations(view);
    }
    update(update: ViewUpdate) {
      // The tree changes without an edit while a long note is still being parsed or its language loads.
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = previewDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** The look of the elements the preview restyles, which the highlight style can't tell apart from similar ones. */
export const livePreviewTheme = EditorView.theme({
  ".cm-inline-code": {
    fontFamily: "var(--font-code)",
    backgroundColor: "var(--muted)",
    borderRadius: "0.25rem",
    padding: "0.1em 0.25em",
  },
  ".cm-list-bullet, .cm-list-number": { color: "var(--list-marker)" },
  // So the text of `1.` and `10.` items lines up as far as the digits go.
  ".cm-list-number": { fontVariantNumeric: "tabular-nums" },
  ".cm-quote-line": {
    borderLeft: "var(--quote-bar-width) solid var(--quote-bar)",
    paddingLeft: "var(--quote-indent)",
  },
  // A rule is its line's own height with a 1px line across the middle, so it doesn't change how the note flows.
  ".cm-rule-line": {
    backgroundImage: "linear-gradient(var(--rule), var(--rule))",
    backgroundSize: "100% 1px",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  },
  ".cm-code-block-line": {
    fontFamily: "var(--font-code)",
    backgroundColor: "var(--muted)",
    padding: "0 var(--code-block-padding)",
  },
});
