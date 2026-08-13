// Drag-selection invariant (#1) — the ONE rule for what a node drag moves.
//
// React Flow's drag set is `selected ∪ grabbed`: dragging a card sweeps along
// every OTHER still-selected card too. That's correct for an explicit
// multi-selection, but a stray leftover selection would make a LONE card drag
// move a whole group. The rule: a group move happens ONLY with an explicit
// multi-selection — ≥2 cards selected AND the grabbed card among them.
// Otherwise the drag moves the grabbed card alone.
//
// Pure + tiny so the route can enforce it and the invariant is unit-tested.

/** True when this drag is a genuine group move: ≥2 non-container cards are
 *  selected and the grabbed card is one of them. */
export function isExplicitGroupDrag(selectedNonContainerIds: string[], grabbedId: string): boolean {
  return selectedNonContainerIds.length >= 2 && selectedNonContainerIds.includes(grabbedId);
}

/** The ids that should actually move for this drag. For an explicit group drag
 *  it's the whole React-Flow drag set (deduped, grabbed guaranteed present);
 *  otherwise it's just the grabbed card — any other card RF started dragging
 *  must be snapped back by the caller. */
export function intendedDragIds(selectedNonContainerIds: string[], grabbedId: string, rfDraggedIds: string[]): string[] {
  if (isExplicitGroupDrag(selectedNonContainerIds, grabbedId)) {
    return [...new Set([...rfDraggedIds, grabbedId])];
  }
  return [grabbedId];
}
