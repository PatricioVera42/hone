import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { Prec, type Extension, type StateCommand } from "@codemirror/state";
import { keymap } from "@codemirror/view";

/** Closes `(`, `[`, `{` and the quotes the file's language names as they are typed, in every file. */
export const bracketClosing: Extension = [
  closeBrackets(),
  // Ahead of `defaultKeymap`, whose Backspace would delete only one character of a pair.
  Prec.high(keymap.of(closeBracketsKeymap)),
];

const fence = "```";

/**
 * Enter on a fence's opening line with the closing fence right after the cursor, which `closeBrackets` leaves on the
 * same line, puts the cursor on an empty line between the two fences.
 */
export const splitCodeFence: StateCommand = ({ state, dispatch }) => {
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  const before = line.text.slice(0, main.head - line.from);
  const after = line.text.slice(main.head - line.from);
  if (after !== fence || !before.trimStart().startsWith(fence)) return false;
  const indentation = /^\s*/.exec(line.text)?.[0] ?? "";
  dispatch(
    state.update({
      changes: { from: main.head, to: line.to, insert: `\n${indentation}\n${indentation}${fence}` },
      selection: { anchor: main.head + 1 + indentation.length },
      userEvent: "input",
      scrollIntoView: true,
    }),
  );
  return true;
};

/**
 * What a note adds to {@link bracketClosing}: the backtick and the code fence as pairs, which make the quote after a
 * letter in `don't` stay a lone apostrophe, and the Enter that splits a fence.
 */
export const noteBracketClosing: Extension = [
  markdownLanguage.data.of({ closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`", fence] } }),
  Prec.highest(keymap.of([{ key: "Enter", run: splitCodeFence }])),
];
