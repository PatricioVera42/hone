import { syntaxTree } from "@codemirror/language";
import { type EditorSelection, type EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
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

/** What the live preview draws differently in a stretch of the document, for the current selection. */
export interface PreviewSpans {
  /** Syntax that isn't drawn: the `#` of a heading, the `**` of bold, the backticks of code, the brackets and url of a link. */
  readonly hidden: readonly Span[];
  /** Inline code, backticks included, which gets the code look. */
  readonly inlineCode: readonly Span[];
}

/** Child nodes holding the syntax of the inline elements that have nothing else to hide. */
const inlineMarks: Readonly<Record<string, string>> = {
  Emphasis: "EmphasisMark",
  StrongEmphasis: "EmphasisMark",
  Strikethrough: "StrikethroughMark",
  InlineCode: "CodeMark",
};

const atxHeading = /^ATXHeading[1-6]$/;

/**
 * Finds what the live preview hides and restyles inside `visible`, so a long note costs only what's on screen. It
 * reads the syntax tree the editor already has and skips an element the selection touches. YAML frontmatter is
 * never touched: its nodes belong to another language, which none of these names match.
 */
export function previewSpans(state: EditorState, visible: readonly Span[]): PreviewSpans {
  const hidden: Span[] = [];
  const inlineCode: Span[] = [];
  const tree = syntaxTree(state);
  const { doc, selection } = state;

  // A replaced range may not cross a line break, so one that does (a link title over two lines) stays shown.
  const hide = (from: number, to: number) => {
    if (from < to && doc.lineAt(from).to >= to) hidden.push({ from, to });
  };

  for (const { from, to } of visible) {
    tree.iterate({
      from,
      to,
      enter(node) {
        const element = { from: node.from, to: node.to };
        if (atxHeading.test(node.name)) {
          // Elements inside the heading follow the rule on their own, so only the heading's own marks are decided here.
          if (touchesSelection(selection, element)) return true;
          const marks = node.node.getChildren("HeaderMark");
          const opening = marks[0];
          if (opening === undefined) return true;
          // The space after the `#`s goes with them, or the heading would start indented.
          const gap = /^[ \t]+/.exec(doc.sliceString(opening.to, node.to))?.[0].length ?? 0;
          hide(opening.from, opening.to + gap);
          // An optional closing run of `#`s, as in `## Title ##`, with the space before it.
          const closing = marks.length > 1 ? marks[marks.length - 1] : undefined;
          if (closing !== undefined) {
            const lead = /[ \t]*$/.exec(doc.sliceString(opening.to, closing.from))?.[0].length ?? 0;
            hide(closing.from - lead, closing.to);
          }
          return true;
        }
        if (node.name === "Link") {
          // Only `[text](url)`: a `[text][ref]` or a bare `[text]` has no url to hide.
          const url = node.node.getChild("URL");
          const marks = node.node.getChildren("LinkMark");
          const opening = marks[0];
          const closing = marks[1];
          if (url !== null && opening !== undefined && closing !== undefined) {
            if (!touchesSelection(selection, element)) {
              hide(opening.from, opening.to);
              hide(closing.from, node.to);
            }
          }
          return true;
        }
        const markName = inlineMarks[node.name];
        if (markName === undefined) return true;
        if (node.name === "InlineCode") inlineCode.push(element);
        if (!touchesSelection(selection, element)) {
          for (const mark of node.node.getChildren(markName)) hide(mark.from, mark.to);
        }
        return true;
      },
    });
  }

  // Two visible ranges around a fold both reach an element that spans them, so it is found twice.
  const unique = (spans: readonly Span[]) => {
    const sorted = spans.toSorted((a, b) => a.from - b.from || a.to - b.to);
    return sorted.filter(
      (span, i) => i === 0 || span.from !== sorted[i - 1]?.from || span.to !== sorted[i - 1]?.to,
    );
  };
  return { hidden: unique(hidden), inlineCode: unique(inlineCode) };
}

const hiddenSyntax = Decoration.replace({});
const inlineCodeLook = Decoration.mark({ class: "cm-inline-code" });

function previewDecorations(view: EditorView): DecorationSet {
  const { hidden, inlineCode } = previewSpans(view.state, view.visibleRanges);
  const decorations: Range<Decoration>[] = [
    ...hidden.map((span) => hiddenSyntax.range(span.from, span.to)),
    ...inlineCode.map((span) => inlineCodeLook.range(span.from, span.to)),
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
});
