export const minSidebarWidth = 180;

/** What dragging the sidebar's edge to `pointerX`, measured from the window's left edge, does to the sidebar. */
export function dragSidebarEdge(
  pointerX: number,
  windowWidth: number,
): { readonly collapsed: true } | { readonly collapsed: false; readonly width: number } {
  // Like VS Code: dragging past half the minimum collapses, anything between that and the minimum stays at it.
  if (pointerX < minSidebarWidth / 2) return { collapsed: true };
  const maxWidth = Math.max(minSidebarWidth, windowWidth / 2);
  return {
    collapsed: false,
    width: Math.round(Math.min(Math.max(pointerX, minSidebarWidth), maxWidth)),
  };
}
