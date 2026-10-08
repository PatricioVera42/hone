import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  toggleTabFocusMode,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  LanguageDescription,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
  type Extension,
} from "@codemirror/state";
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
import { useEffect, useEffectEvent, useRef } from "react";
import { bracketClosing, noteBracketClosing } from "@/bracket-closing.ts";
import { detectIndentUnit } from "@/detect-indent-unit.ts";
import { indentKeymap } from "@/indent-keymap.ts";
import { createLanguageLoader } from "@/language-loader.ts";
import type { EditorContent } from "@/open-file.ts";
import { reportError } from "@/report-error.ts";

// The background and plain text come from shadcn's variables, so the editor follows the rest of the UI, light or dark.
const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--background)", color: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { caretColor: "var(--foreground)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { backgroundColor: "color-mix(in oklch, var(--ring) 35%, transparent)" },
  ".cm-activeLine": { backgroundColor: "var(--active-line-background)" },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--line-number)",
    border: "none",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
});

// Every color is a --syntax-* variable (index.css), so a theme changes the highlighting by setting them.
const highlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--syntax-heading)", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--syntax-link)", textDecoration: "underline" },
  { tag: tags.monospace, fontFamily: "var(--font-code)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  {
    tag: [tags.meta, tags.processingInstruction, tags.contentSeparator],
    color: "var(--syntax-meta)",
  },
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: "var(--syntax-keyword)" },
  { tag: [tags.string, tags.regexp], color: "var(--syntax-string)" },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: "var(--syntax-number)",
  },
  { tag: [tags.typeName, tags.className], color: "var(--syntax-type)" },
  { tag: tags.function(tags.variableName), color: "var(--syntax-function)" },
  { tag: tags.propertyName, color: "var(--syntax-property)" },
  { tag: tags.invalid, color: "var(--destructive)" },
]);

// Notes read like prose: wrapped, in the UI font, without line numbers.
const noteExtensions: Extension = [
  EditorView.lineWrapping,
  EditorView.theme({
    ".cm-scroller": { fontFamily: "inherit" },
    // The scroller still fills the panel, so the margins beside the column stay clickable. The cap adds the padding
    // because the content box is border-box, and `ch` is the note's font, which `.cm-content` inherits.
    ".cm-content": {
      padding: "1rem",
      maxWidth: "calc(var(--note-max-width) + 2rem)",
      margin: "0 auto",
    },
  }),
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  noteBracketClosing,
];

// Tab, Shift+Tab and Ctrl+L indent and select lines only in code; in a note Tab moves focus, as on a web page.
const codeExtensions: Extension = [
  indentKeymap,
  lineNumbers(),
  highlightActiveLineGutter(),
  EditorView.theme({ ".cm-scroller": { fontFamily: "var(--font-code)" } }),
];

function isNote(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

// Without Ctrl+M's persistent tab-focus mode, which nothing on screen shows: once on, Tab silently stops indenting.
// Escape then Tab still moves focus out of a code file, for that one Tab.
const keymapWithoutTabFocusToggle = defaultKeymap.filter(
  (binding) => binding.run !== toggleTabFocusMode,
);

// Holds the language of a code file, which loads after the view is built.
const languageCompartment = new Compartment();
const modeCompartment = new Compartment();
const labelCompartment = new Compartment();

const noteMode: Extension = noteExtensions;
const codeMode: Extension = [codeExtensions, languageCompartment.of([])];

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
  /**
   * The file's current protocol path, relative to the workshop root, which a rename changes. It picks the editor's
   * accessible name, its language and whether it shows a note or code, without rebuilding the editor.
   */
  readonly path: string;
  /** The content the editor starts with. Later changes come through the {@link EditorContent} given to `connect`. */
  readonly content: string;
  /** Called once the editor is mounted, with a handle to read and replace its content. */
  readonly connect: (editor: EditorContent) => EditorConnection;
}

/**
 * A CodeMirror editor for a file's content. A note gets Markdown with GFM; any other file gets the language
 * `@codemirror/language-data` matches by name or extension, loaded on demand, or plain text.
 */
export function CodeEditor({ path, content, connect }: CodeEditorProps) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(undefined);
  const languageLoader = useRef<ReturnType<typeof createLanguageLoader>>(undefined);
  // Read once when the view is built; later paths come through the compartments.
  const initialPath = useEffectEvent(() => path);
  // Not a dependency of the view's effect: a new callback mustn't rebuild the view and lose what's in it.
  const connectEditor = useEffectEvent(connect);

  useEffect(() => {
    if (parent.current === null) return undefined;
    const lineSeparator = new Compartment();
    // Emptied and filled again to clear the undo history when the content is replaced from disk.
    const undoHistory = new Compartment();
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
          labelCompartment.of(EditorView.contentAttributes.of({ "aria-label": initialPath() })),
          highlightSpecialChars(),
          drawSelection(),
          highlightActiveLine(),
          bracketClosing,
          undoHistory.of(history()),
          keymap.of([
            ...keymapWithoutTabFocusToggle,
            ...historyKeymap,
            // historyKeymap binds Ctrl+Shift+Z to redo only on Linux.
            { win: "Ctrl-Shift-z", run: redo, preventDefault: true },
          ]),
          syntaxHighlighting(highlightStyle),
          theme,
          modeCompartment.of(isNote(initialPath()) ? noteMode : codeMode),
        ],
      }),
    });

    connection = connectEditor({
      // `sliceDoc` joins lines with the line separator, where `doc.toString()` would always use `\n`.
      read: () => editorView.state.sliceDoc(),
      replace: (next) => {
        // Reconfigured first, so the new content is split into lines by its own line endings. The history is dropped
        // here and comes back empty below, so Ctrl+Z can't bring back the old content and save it over the new one.
        editorView.dispatch({
          effects: [lineSeparator.reconfigure(lineSeparatorFor(next)), undoHistory.reconfigure([])],
        });
        const nextLength = editorView.state.toText(next).length;
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: next },
          selection: { anchor: Math.min(editorView.state.selection.main.head, nextLength) },
          // A history added by a transaction would otherwise record that transaction's own change.
          annotations: [fromDisk.of(true), Transaction.addToHistory.of(false)],
          effects: undoHistory.reconfigure(history()),
        });
      },
    });

    view.current = editorView;
    languageLoader.current = createLanguageLoader((support) => {
      editorView.dispatch({ effects: languageCompartment.reconfigure(support) });
    });
    return () => {
      languageLoader.current?.cancel();
      languageLoader.current = undefined;
      view.current = undefined;
      connection.disconnect();
      editorView.destroy();
    };
  }, [content]);

  // Runs after the view is built too, which is how a code file's language gets loaded the first time.
  useEffect(() => {
    const editorView = view.current;
    if (editorView === undefined) return;
    const note = isNote(path);
    const mode = note ? noteMode : codeMode;
    const fileName = path.slice(path.lastIndexOf("/") + 1);
    const description = note ? null : LanguageDescription.matchFilename(languages, fileName);
    editorView.dispatch({
      effects: [
        labelCompartment.reconfigure(EditorView.contentAttributes.of({ "aria-label": path })),
        // Swapping the mode would empty the language compartment, so a rename that keeps it leaves it be.
        ...(modeCompartment.get(editorView.state) === mode
          ? []
          : [modeCompartment.reconfigure(mode)]),
        // A file with no language known is plain text, which the new mode has already made it unless it was code.
        ...(!note && description === null ? [languageCompartment.reconfigure([])] : []),
      ],
    });
    // A language that fails to load leaves the file readable as plain text.
    languageLoader.current?.load(description).catch(reportError);
  }, [path, content]);

  return <div ref={parent} className="h-full" />;
}
