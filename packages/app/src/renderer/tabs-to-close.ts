/** What a tab's context menu can close. */
export type CloseAction = "close" | "others" | "right" | "all";

/**
 * The tabs of one group that `action` closes when invoked from `clicked`, in tab order. Only Close touches a terminal
 * tab, so a bulk action never kills a running shell.
 */
export function tabsToClose<T>(
  action: CloseAction,
  tabs: readonly T[],
  clicked: T,
  isTerminal: (tab: T) => boolean,
): T[] {
  if (action === "close") return [clicked];
  const clickedIndex = tabs.indexOf(clicked);
  return tabs.filter((tab, index) => {
    if (isTerminal(tab)) return false;
    if (action === "others") return tab !== clicked;
    if (action === "right") return index > clickedIndex;
    return true;
  });
}
