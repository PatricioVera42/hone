import { defaultKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  LanguageDescription,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { detectIndentUnit } from "@/detect-indent-unit.ts";
import { reportError } from "@/report-error.ts";

// Colors come from shadcn's variables, so the editor follows the rest of the UI, light or dark.
const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--background)", color: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { caretColor: "var(--foreground)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { backgroundColor: "color-mix(in oklch, var(--ring) 35%, transparent)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--accent) 60%, transparent)" },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
    border: "none",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
});

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--primary)", textDecoration: "underline" },
  { tag: tags.monospace, fontFamily: "var(--font-code)" },
  {
    tag: [tags.comment, tags.meta, tags.processingInstruction, tags.contentSeparator],
    color: "var(--muted-foreground)",
  },
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier],
    color: "var(--primary)",
    fontWeight: "600",
  },
  {
    tag: [tags.string, tags.regexp, tags.number, tags.bool, tags.null, tags.atom],
    color: "var(--chart-2)",
  },
  {
    tag: [tags.function(tags.variableName), tags.typeName, tags.className, tags.propertyName],
    color: "var(--chart-3)",
  },
  { tag: tags.invalid, color: "var(--destructive)" },
]);

// Notes read like prose: wrapped, in the UI font, without line numbers.
const noteExtensions: Extension = [
  EditorView.lineWrapping,
  EditorView.theme({
    ".cm-scroller": { fontFamily: "inherit" },
    ".cm-content": { padding: "1rem" },
  }),
  markdown({ base: markdownLanguage, codeLanguages: languages }),
];

const codeExtensions: Extension = [
  lineNumbers(),
  highlightActiveLineGutter(),
  EditorView.theme({ ".cm-scroller": { fontFamily: "var(--font-code)" } }),
];

function isNote(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

interface CodeEditorProps {
  /** The file's protocol path, relative to the workshop root. */
  readonly path: string;
  readonly content: string;
}

/**
 * A read-only CodeMirror editor for a file's content. A note gets Markdown with GFM; any other file gets the
 * language `@codemirror/language-data` matches by name or extension, loaded on demand, or plain text.
 */
export function CodeEditor({ path, content }: CodeEditorProps) {
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (parent.current === null) return undefined;
    const language = new Compartment();
    const note = isNote(path);
    const view = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          EditorState.readOnly.of(true),
          // Kept as the file had them, so saving writes the same line endings back.
          content.includes("\r\n") ? EditorState.lineSeparator.of("\r\n") : [],
          indentUnit.of(detectIndentUnit(content)),
          EditorView.contentAttributes.of({ "aria-label": path }),
          highlightSpecialChars(),
          drawSelection(),
          highlightActiveLine(),
          keymap.of(defaultKeymap),
          syntaxHighlighting(highlightStyle),
          theme,
          note ? noteExtensions : [codeExtensions, language.of([])],
        ],
      }),
    });

    const fileName = path.slice(path.lastIndexOf("/") + 1);
    const description = note ? null : LanguageDescription.matchFilename(languages, fileName);
    let destroyed = false;
    description
      ?.load()
      .then((support) => {
        if (!destroyed) view.dispatch({ effects: language.reconfigure(support) });
      })
      // The file stays readable as plain text.
      .catch(reportError);
    return () => {
      destroyed = true;
      view.destroy();
    };
  }, [path, content]);

  return <div ref={parent} className="h-full" />;
}
