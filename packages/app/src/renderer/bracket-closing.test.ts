import { insertBracket, deleteBracketPair } from "@codemirror/autocomplete";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { insertNewlineContinueMarkup, markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, type Extension, type StateCommand } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { bracketClosing, noteBracketClosing, splitCodeFence } from "./bracket-closing.ts";

const codeExtensions: Extension = bracketClosing;
const noteExtensions: Extension = [
  bracketClosing,
  noteBracketClosing,
  markdown({ base: markdownLanguage }),
];

/** An editor state with no view, driven the way CodeMirror drives it: a typed character goes to `insertBracket` first. */
function editor(extensions: Extension, doc = "") {
  let state = EditorState.create({ doc, extensions, selection: { anchor: doc.length } });
  const apply = (next: EditorState) => {
    state = next;
  };
  const run = (command: StateCommand) => command({ state, dispatch: (tr) => apply(tr.state) });
  return {
    select(anchor: number, head: number) {
      state = state.update({ selection: EditorSelection.single(anchor, head) }).state;
    },
    type(text: string) {
      for (const character of text) {
        const transaction = insertBracket(state, character);
        apply(
          transaction === null
            ? state.update(state.replaceSelection(character), { userEvent: "input.type" }).state
            : transaction.state,
        );
      }
    },
    backspace() {
      run(deleteBracketPair);
    },
    /** Enter as a note binds it: the code fence command, then the Markdown newline, then `defaultKeymap`'s. */
    enter() {
      for (const command of [splitCodeFence, insertNewlineContinueMarkup, insertNewlineAndIndent]) {
        if (run(command)) return;
      }
    },
    /** Enter as a code file binds it. */
    enterInCode() {
      run(insertNewlineAndIndent);
    },
    /** The document with `|` where the cursor is. */
    get text() {
      const { head } = state.selection.main;
      const text = state.doc.toString();
      return `${text.slice(0, head)}|${text.slice(head)}`;
    },
  };
}

describe("closing brackets in a code file", () => {
  it.each([
    ["{", "{|}"],
    ["(", "(|)"],
    ["[", "[|]"],
  ])("typing %s closes it with the cursor between", (opening, expected) => {
    const code = editor(codeExtensions);
    code.type(opening);
    expect(code.text).toBe(expected);
  });

  it("types only the opening character right before a word", () => {
    const code = editor(codeExtensions, "word");
    code.select(0, 0);
    code.type("(");
    expect(code.text).toBe("(|word");
  });

  it("moves over the closing character it inserted instead of typing another", () => {
    const code = editor(codeExtensions);
    code.type("{}");
    expect(code.text).toBe("{}|");
  });

  it("deletes both characters when Backspace follows the opening one", () => {
    const code = editor(codeExtensions, "a ");
    code.type("{");
    code.backspace();
    expect(code.text).toBe("a |");
  });

  it("wraps the selection", () => {
    const code = editor(codeExtensions, "abc");
    code.select(0, 3);
    code.type("(");
    expect(code.text).toBe("(abc|)");
  });

  it("puts the closing character on its own line on Enter between a pair", () => {
    const code = editor(codeExtensions);
    code.type("{");
    code.enterInCode();
    expect(code.text).toBe("{\n|\n}");
  });
});

describe("closing brackets in a note", () => {
  it("leaves an apostrophe after a letter alone", () => {
    const note = editor(noteExtensions);
    note.type("don't");
    expect(note.text).toBe("don't|");
  });

  it("types a task list marker as it is", () => {
    const note = editor(noteExtensions);
    note.type("- [ ]");
    expect(note.text).toBe("- [ ]|");
  });

  it("closes inline code", () => {
    const note = editor(noteExtensions);
    note.type("`x`");
    expect(note.text).toBe("`x`|");
  });

  it("closes a code fence typed on an empty line", () => {
    const note = editor(noteExtensions);
    note.type("```");
    expect(note.text).toBe("```|```");
  });

  it("puts the closing fence on its own line on Enter after the language", () => {
    const note = editor(noteExtensions);
    note.type("```js");
    note.enter();
    expect(note.text).toBe("```js\n|\n```");
  });

  it("keeps the fence's indentation when it splits", () => {
    const note = editor(noteExtensions);
    note.type("  ```");
    note.enter();
    expect(note.text).toBe("  ```\n  |\n  ```");
  });

  it("leaves Enter alone after a closing fence with nothing after the cursor", () => {
    const note = editor(noteExtensions, "```js\ncode\n```");
    note.enter();
    expect(note.text).toBe("```js\ncode\n```\n|");
  });

  it("leaves Enter alone in a list item", () => {
    const note = editor(noteExtensions, "- item");
    note.enter();
    expect(note.text).toBe("- item\n- |");
  });

  it("leaves Enter alone in prose", () => {
    const note = editor(noteExtensions, "Groups");
    note.enter();
    expect(note.text).toBe("Groups\n|");
  });
});
