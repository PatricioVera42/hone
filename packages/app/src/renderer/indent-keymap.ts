import { indentLess } from "@codemirror/commands";
import { getIndentUnit, indentUnit } from "@codemirror/language";
import {
  EditorSelection,
  countColumn,
  type EditorState,
  type Extension,
  type SelectionRange,
  type StateCommand,
} from "@codemirror/state";
import { keymap } from "@codemirror/view";

// VS Code's rule for a Tab that doesn't indent lines: type what reaches the next indent stop.
function textToNextIndentStop(state: EditorState, position: number): string {
  const unit = state.facet(indentUnit);
  if (unit === "\t") return unit;
  const line = state.doc.lineAt(position);
  const column = countColumn(line.text.slice(0, position - line.from), state.tabSize);
  const width = getIndentUnit(state);
  return " ".repeat(width - (column % width));
}

// A selection that reaches into a second line, or covers all of one, indents lines; anything smaller is replaced.
function indentsLines(state: EditorState, range: SelectionRange): boolean {
  if (range.empty) return false;
  const first = state.doc.lineAt(range.from);
  return range.to > first.to || (range.from === first.from && range.to === first.to);
}

/**
 * Tab as VS Code has it: for each selection, lines that are selected whole or in part across several get one indent
 * unit at their start, and any other selection is replaced by the text up to the next indent stop.
 */
export const indentWithTabStops: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  // Ranges don't overlap, but two of them can touch the same line, which is still indented once.
  let lastIndentedLine = 0;
  dispatch(
    state.update(
      state.changeByRange((range) => {
        if (!indentsLines(state, range)) {
          const insert = textToNextIndentStop(state, range.from);
          return {
            changes: { from: range.from, to: range.to, insert },
            range: EditorSelection.cursor(range.from + insert.length),
          };
        }
        const changes = [];
        for (let position = range.from; position <= range.to;) {
          const line = state.doc.lineAt(position);
          // A selection ending right after a line break doesn't touch the next line.
          if (line.number > lastIndentedLine && range.to > line.from) {
            changes.push({ from: line.from, insert: state.facet(indentUnit) });
            lastIndentedLine = line.number;
          }
          position = line.to + 1;
        }
        const changeSet = state.changes(changes);
        return {
          changes,
          range: EditorSelection.range(
            changeSet.mapPos(range.anchor, 1),
            changeSet.mapPos(range.head, 1),
          ),
        };
      }),
      { userEvent: "input.indent", scrollIntoView: true },
    ),
  );
  return true;
};

/**
 * Selects the whole lines each selection touches, from the start of the first to the start of the line after the last
 * (the end of the document for the last line), as VS Code's Ctrl+L does. Pressed again, the selection ends at the
 * start of a line, which counts as touching it, so each press adds the next line.
 */
export const selectWholeLines: StateCommand = ({ state, dispatch }) => {
  const ranges = state.selection.ranges.map((range) => {
    const first = state.doc.lineAt(range.from);
    const last = state.doc.lineAt(range.to);
    const end = last.number < state.doc.lines ? last.to + 1 : state.doc.length;
    return EditorSelection.range(first.from, end);
  });
  dispatch(state.update({ selection: EditorSelection.create(ranges), userEvent: "select" }));
  return true;
};

/**
 * Tab and Shift+Tab indent and dedent, and Ctrl+L selects whole lines. `defaultKeymap` leaves Tab unbound so a
 * keyboard user isn't trapped, which CodeMirror's tab-focus mode (Escape then Tab, or Ctrl+M) still covers.
 */
export const indentKeymap: Extension = keymap.of([
  { key: "Tab", run: indentWithTabStops },
  { key: "Shift-Tab", run: indentLess },
  { key: "Mod-l", run: selectWholeLines },
]);
