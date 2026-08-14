// SHARED CEQ SELECTION (Studio Consolidation D) — the left outline owns the CEQ rows now, so the
// selection they build must be visible outside that component tree: the outline renders the
// checkboxes + bulk bar, and the Studio's keyboard flow / any future set-scoped op reads the same
// set. A tiny external store (same pattern as the mapper's armed source file) rather than context,
// because the two consumers live in sibling trees that only share the route.
import { useSyncExternalStore } from "react";

let sel: Set<string> = new Set();
const subs = new Set<() => void>();

export const getCeqSel = (): Set<string> => sel;
export const setCeqSel = (next: Set<string>): void => { sel = next; subs.forEach((f) => f()); };
export const clearCeqSel = (): void => setCeqSel(new Set());

/** Reactive read — re-renders the caller whenever the selection changes. */
export function useCeqSel(): Set<string> {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => sel,
    () => sel,
  );
}
