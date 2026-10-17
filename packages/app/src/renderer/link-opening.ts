import { syntaxTree } from "@codemirror/language";
import { type EditorState } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";

/**
 * The URL of the link at `pos`, as typed, or `undefined` when `pos` isn't in one. That is a `[text](url)` link (its
 * text counts as well as its url), an `<https://…>` autolink or a bare URL. Images and `[text][ref]` links are not
 * links here. It doesn't check the protocol: main does, because it decides what is safe to open.
 */
export function linkUrlAt(state: EditorState, pos: number): string | undefined {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node.parent; node = node.parent) {
    // A bare URL is a URL node of its own; in a link or an autolink the URL is a child of the node that wraps it.
    const url =
      node.name === "URL"
        ? node
        : node.name === "Link" || node.name === "Autolink"
          ? node.getChild("URL")
          : null;
    if (url === null) continue;
    if (node.parent.name === "Image") return undefined;
    return state.sliceDoc(url.from, url.to).replace(/^<(.*)>$/, "$1");
  }
  return undefined;
}

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
        const hand = ctrl && pointer !== undefined && urlUnder(pointer) !== undefined;
        view.contentDOM.style.cursor = hand ? "pointer" : "";
      };
      const track = (event: MouseEvent | KeyboardEvent) => {
        ctrl = event.ctrlKey;
        if (event instanceof MouseEvent) pointer = { x: event.clientX, y: event.clientY };
        showHand();
      };
      const release = () => {
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
        mousedown(event: MouseEvent, _view: EditorView) {
          if (!event.ctrlKey || event.button !== 0) return false;
          const url = this.urlUnder({ x: event.clientX, y: event.clientY });
          if (url === undefined) return false;
          // Stops the editor from moving the cursor or starting a selection.
          open(url);
          return true;
        },
      },
    },
  );
}
