import { syntaxTree } from "@codemirror/language";
import { type EditorState } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";

// @lezer/common isn't a dependency of the app, so the node type comes from the tree.
type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]>;

/**
 * The URL of the link at `pos`, as typed, or `undefined` when `pos` isn't in one. That is a `[text](url)` link (its
 * text counts as well as its url), an `<https://…>` autolink or a bare URL. Images and `[text][ref]` links are not
 * links here. It doesn't check the protocol: main does, because it decides what is safe to open.
 */
export function linkUrlAt(state: EditorState, pos: number): string | undefined {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node.parent; node = node.parent) {
    let url: SyntaxNode | null = null;
    if (node.name === "URL") {
      if (node.parent.name === "Image") return undefined;
      // Inside a link, a URL node is the link's text (or its autolink's own URL), which the wrapping node decides.
      if (node.parent.name === "Link") continue;
      url = node;
    } else if (node.name === "Autolink") {
      url = node.getChild("URL");
    } else if (node.name === "Link") {
      // The destination is the last URL, after the `(`: a link whose text is itself a URL has an earlier one.
      const open = node.getChildren("LinkMark")[2];
      if (open === undefined || state.sliceDoc(open.from, open.to) !== "(") continue;
      url = node.getChildren("URL").findLast((child) => child.from >= open.to) ?? null;
    }
    if (url === null) continue;
    return state.sliceDoc(url.from, url.to).replace(/^<(.*)>$/, "$1");
  }
  return undefined;
}

/** Whether the hand is worth showing: only `http(s)` links open. Cosmetic; main decides what really opens. */
const looksOpenable = /^https?:\/\//i;

/**
 * Opens the link under a Ctrl+click through `open`, without moving the cursor, and shows a hand over links while
 * Ctrl is held. A plain click does what it always does.
 */
export function linkOpening(open: (url: string) => void) {
  return ViewPlugin.define(
    (view) => {
      let pointer: { x: number; y: number } | undefined;
      let ctrl = false;

      const urlUnder = (at: { x: number; y: number }): string | undefined => {
        const pos = view.posAtCoords(at);
        return pos === null ? undefined : linkUrlAt(view.state, pos);
      };
      const showHand = () => {
        const url = ctrl && pointer !== undefined ? urlUnder(pointer) : undefined;
        const hand = url !== undefined && looksOpenable.test(url);
        view.contentDOM.style.cursor = hand ? "pointer" : "";
      };
      const track = (event: MouseEvent | KeyboardEvent) => {
        ctrl = event.ctrlKey;
        if (event instanceof MouseEvent) pointer = { x: event.clientX, y: event.clientY };
        showHand();
      };
      const release = () => {
        // Forgotten, or every editor, hidden tabs included, would look up the old position on each Ctrl key event.
        pointer = undefined;
        ctrl = false;
        showHand();
      };

      // Ctrl can go down or up with the pointer standing still, and the editor needn't have focus for the hand.
      window.addEventListener("keydown", track);
      window.addEventListener("keyup", track);
      window.addEventListener("blur", release);
      return {
        track,
        release,
        urlUnder,
        destroy() {
          window.removeEventListener("keydown", track);
          window.removeEventListener("keyup", track);
          window.removeEventListener("blur", release);
        },
      };
    },
    {
      eventHandlers: {
        mousemove(event: MouseEvent) {
          this.track(event);
        },
        mouseleave() {
          this.release();
        },
        mousedown(event: MouseEvent) {
          if (!event.ctrlKey || event.button !== 0) return false;
          const url = this.urlUnder({ x: event.clientX, y: event.clientY });
          if (url === undefined) return false;
          open(url);
          // Handled: the editor doesn't move the cursor or start a selection.
          return true;
        },
      },
    },
  );
}
