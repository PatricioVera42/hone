import { defaultKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  LanguageDescription,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { Annotation, Compartment, EditorState, type Extension } from "@codemirror/state";
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
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { detectIndentUnit } from "@/detect-indent-unit.ts";
import type { EditorContent } from "@/open-file.ts";
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

// Kept as the file has them, so saving writes the same line endings back.
function lineSeparatorFor(content: string): Extension {
  return content.includes("\r\n") ? EditorState.lineSeparator.of("\r\n") : [];
}

// Marks a replacement with the file's content on disk, which isn't an edit to save.
const fromDisk = Annotation.define<boolean>();

/** What a mounted editor tells whoever keeps its file in sync, returned by {@link CodeEditorProps.connect}. */
export interface EditorConnection {
  /** Called after each edit the user makes. */
  edited(): void;
  /** Called when the editor unmounts. */
  disconnect(): void;
}

interface CodeEditorProps {
  /** The file's protocol path when it was opened, relative to the workshop root, which picks its language. */
  readonly path: string;
  /** The editor's accessible name: the file's current protocol path, which a rename changes. */
  readonly label: string;
  /** The content the editor starts with. Later changes come through the {@link EditorContent} given to `connect`. */
  readonly content: string;
  /** Called once the editor is mounted, with a handle to read and replace its content. */
  readonly connect: (editor: EditorContent) => EditorConnection;
}

/**
 * A CodeMirror editor for a file's content. A note gets Markdown with GFM; any other file gets the language
 * `@codemirror/language-data` matches by name or extension, loaded on demand, or plain text.
 */
export function CodeEditor({ path, label, content, connect }: CodeEditorProps) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(undefined);
  const [labelCompartment] = useState(() => new Compartment());
  // Read once when the view is built; later labels come through the compartment.
  const initialLabel = useEffectEvent(() => label);
  // Not a dependency of the view's effect: a new callback mustn't rebuild the view and lose what's in it.
  const connectEditor = useEffectEvent(connect);

  useEffect(() => {
    if (parent.current === null) return undefined;
    const language = new Compartment();
    const lineSeparator = new Compartment();
    const note = isNote(path);
    // Assigned once the view exists, which its listener only needs after the first edit.
    let connection: EditorConnection | undefined;
    const editorView = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          lineSeparator.of(lineSeparatorFor(content)),
          EditorView.updateListener.of((update) => {
            const edited = update.transactions.some(
              (transaction) => transaction.docChanged && !transaction.annotation(fromDisk),
            );
            if (edited) connection?.edited();
          }),
          indentUnit.of(detectIndentUnit(content)),
          labelCompartment.of(EditorView.contentAttributes.of({ "aria-label": initialLabel() })),
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

    connection = connectEditor({
      // `sliceDoc` joins lines with the line separator, where `doc.toString()` would always use `\n`.
      read: () => editorView.state.sliceDoc(),
      replace: (next) => {
        // Reconfigured first, so the new content is split into lines by its own line endings.
        editorView.dispatch({ effects: lineSeparator.reconfigure(lineSeparatorFor(next)) });
        const nextLength = editorView.state.toText(next).length;
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: next },
          selection: { anchor: Math.min(editorView.state.selection.main.head, nextLength) },
          annotations: fromDisk.of(true),
        });
      },
    });

    const fileName = path.slice(path.lastIndexOf("/") + 1);
    const description = note ? null : LanguageDescription.matchFilename(languages, fileName);
    let destroyed = false;
    description
      ?.load()
      .then((support) => {
        if (!destroyed) editorView.dispatch({ effects: language.reconfigure(support) });
      })
      // The file stays readable as plain text.
      .catch(reportError);
    view.current = editorView;
    return () => {
      view.current = undefined;
      destroyed = true;
      connection.disconnect();
      editorView.destroy();
    };
  }, [path, content]);

  useEffect(() => {
    view.current?.dispatch({
      effects: labelCompartment.reconfigure(
        EditorView.contentAttributes.of({ "aria-label": label }),
      ),
    });
  }, [labelCompartment, label]);

  return <div ref={parent} className="h-full" />;
}
