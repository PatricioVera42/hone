import { indentLess } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { EditorSelection, EditorState, type StateCommand } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { indentWithTabStops, selectWholeLines } from "./indent-keymap.ts";

/**
 * An editor state with no view. The document is written with `|` for a cursor and `[` `]` around a selection, which
 * `text` writes back the same way.
 */
function editor(marked: string, unit = "    ") {
  const ranges: { from: number; to: number }[] = [];
  let doc = "";
  let open = -1;
  for (const character of marked) {
    if (character === "|") ranges.push({ from: doc.length, to: doc.length });
    else if (character === "[") open = doc.length;
    else if (character === "]") ranges.push({ from: open, to: doc.length });
    else doc += character;
  }
  let state = EditorState.create({
    doc,
    extensions: [indentUnit.of(unit), EditorState.allowMultipleSelections.of(true)],
    selection: EditorSelection.create(
      ranges.map(({ from, to }) => EditorSelection.range(from, to)),
    ),
  });
  return {
    run(command: StateCommand) {
      command({
        state,
        dispatch: (transaction) => {
          state = transaction.state;
        },
      });
    },
    get text() {
      let result = state.doc.toString();
      for (const range of state.selection.ranges.toReversed()) {
        result = range.empty
          ? `${result.slice(0, range.from)}|${result.slice(range.from)}`
          : `${result.slice(0, range.from)}[${result.slice(range.from, range.to)}]${result.slice(range.to)}`;
      }
      return result;
    },
  };
}

describe("Tab", () => {
  it.each([
    ["ab|c", "ab  |c"],
    ["|abc", "    |abc"],
    ["  |abc", "    |abc"],
    ["    |abc", "        |abc"],
    ["|", "    |"],
  ])("with the cursor in %j inserts up to the next indent stop: %j", (before, after) => {
    const code = editor(before);
    code.run(indentWithTabStops);
    expect(code.text).toBe(after);
  });

  it("inserts a tab where the file is indented with tabs", () => {
    const code = editor("ab|c", "\t");
    code.run(indentWithTabStops);
    expect(code.text).toBe("ab\t|c");
  });

  it("counts a tab before the cursor as the tab size when measuring the column", () => {
    const code = editor("\ta|b");
    code.run(indentWithTabStops);
    expect(code.text).toBe("\ta   |b");
  });

  it("replaces a selection inside a line with the text up to the next indent stop", () => {
    const code = editor("a[b]c");
    code.run(indentWithTabStops);
    expect(code.text).toBe("a   |c");
  });

  it("indents a line selected from its start to its end, keeping it selected", () => {
    const code = editor("x\n[abc]\ny");
    code.run(indentWithTabStops);
    expect(code.text).toBe("x\n    [abc]\ny");
  });

  it("indents every line of a selection spanning two, keeping the same text selected", () => {
    const code = editor("a[b\ncd]e\nf");
    code.run(indentWithTabStops);
    expect(code.text).toBe("    a[b\n    cd]e\nf");
  });

  it("leaves a last line alone when the selection only touches its start", () => {
    const code = editor("a\n[b\n]c");
    code.run(indentWithTabStops);
    expect(code.text).toBe("a\n    [b\n]c");
  });

  it("applies each of several selections on its own, indenting a line once", () => {
    const code = editor("a|b\ncd|e\n[f\ng]h\ni|j");
    code.run(indentWithTabStops);
    expect(code.text).toBe("a   |b\ncd  |e\n    [f\n    g]h\ni   |j");
  });
});

describe("Shift+Tab", () => {
  it("removes one indent unit from the line, wherever the cursor is on it", () => {
    const code = editor("        ab|c");
    code.run(indentLess);
    expect(code.text).toBe("    ab|c");
  });

  it("changes nothing on a line without indentation", () => {
    const code = editor("ab|c");
    code.run(indentLess);
    expect(code.text).toBe("ab|c");
  });
});

describe("Ctrl+L", () => {
  it("selects the cursor's line with its line break, and Tab then indents only that line", () => {
    const code = editor("a\nb|b\nc");
    code.run(selectWholeLines);
    expect(code.text).toBe("a\n[bb\n]c");
    code.run(indentWithTabStops);
    expect(code.text).toBe("a\n    [bb\n]c");
  });

  it("adds the next line on each further press, up to the end of the document", () => {
    const code = editor("|a\nb\nc");
    code.run(selectWholeLines);
    expect(code.text).toBe("[a\n]b\nc");
    code.run(selectWholeLines);
    expect(code.text).toBe("[a\nb\n]c");
    code.run(selectWholeLines);
    expect(code.text).toBe("[a\nb\nc]");
  });

  it("selects both lines of a selection from the middle of one to the middle of the next", () => {
    const code = editor("a[b\nc]d\ne");
    code.run(selectWholeLines);
    expect(code.text).toBe("[ab\ncd\n]e");
  });
});
