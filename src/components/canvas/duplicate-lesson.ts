// LESSON DUPLICATION helpers (pure) — the bits specific to copying a whole lesson
// cell: (1) picking an empty destination cell in the region grid, and (2) cloning
// the lesson's NAMED DECKS so the copy's decks reference the copy's cards. The
// deep node/edge copy itself is the shared cloneNodeSet in duplicate-frame.ts.
import { REGION, lessonCellSize, regionLayout } from "./frames";
import type { DeckDef } from "./types";

/** The next FREE region-grid cell for a duplicated lesson. Lays a reading-order
 *  grid over the current lessons' bounding origin and returns the first slot no
 *  existing lesson already occupies (within half a cell). Falls to a fresh row
 *  below the grid when every slot is taken. The copy "lands unplaced" here — Lee
 *  drags it wherever he wants afterward. */
export function nextRegionCell(
  lessons: { x: number; y: number }[],
  cell: { w: number; h: number } = lessonCellSize(),
): { x: number; y: number } {
  if (lessons.length === 0) return { x: 0, y: 0 };
  const originX = Math.min(...lessons.map((l) => l.x));
  const originY = Math.min(...lessons.map((l) => l.y));
  const rl = regionLayout(lessons.length + 1, originX, originY, false, cell);
  const tolX = cell.w / 2;
  const tolY = cell.h / 2;
  const occupied = (slot: { x: number; y: number }) =>
    lessons.some((l) => Math.abs(l.x - slot.x) < tolX && Math.abs(l.y - slot.y) < tolY);
  const free = rl.cells.find((s) => !occupied(s));
  return free ?? { x: originX, y: originY + rl.gridH + REGION.gutterY };
}

/** The decks that belong to the lesson being duplicated: attached to the lesson
 *  directly (lessonId) or to one of its frames (frameId ∈ frameIds). Global decks
 *  (unattached) are NOT copied. */
export function decksOfLesson(decks: DeckDef[], lessonId: string, frameIds: Set<string>): DeckDef[] {
  return decks.filter((d) => d.lessonId === lessonId || (!!d.frameId && frameIds.has(d.frameId)));
}

/** Mint a fresh deck id for each source deck → old→new map. Minted BEFORE the
 *  node copy so cloneNodeSet's deckIdMap can re-home members in the same pass
 *  (deck ids are independent of node ids, so this can run first). */
export function mintDeckIds(srcDecks: DeckDef[], mkDeckId: () => string): Map<string, string> {
  const deckIdMap = new Map<string, string>();
  for (const d of srcDecks) deckIdMap.set(d.id, mkDeckId());
  return deckIdMap;
}

/** Build copies of a lesson's decks using a PRE-MINTED deckIdMap: "<name> (copy)",
 *  lessonId/frameId re-homed through the node id map, slots deep-cloned. Runs
 *  AFTER cloneNodeSet so `idMap` (old→new node ids) is available. */
export function duplicateLessonDecks(
  srcDecks: DeckDef[],
  idMap: Map<string, string>,
  deckIdMap: Map<string, string>,
  now: string = new Date().toISOString(),
): DeckDef[] {
  return srcDecks.map((d) => ({
    ...structuredClone(d),
    id: deckIdMap.get(d.id)!,
    name: `${d.name} (copy)`,
    lessonId: d.lessonId != null ? (idMap.get(d.lessonId) ?? d.lessonId) : d.lessonId,
    frameId: d.frameId != null ? (idMap.get(d.frameId) ?? null) : d.frameId,
    slots: structuredClone(d.slots ?? []), // deep — never share slot objects with the source
    createdAt: now,
    updatedAt: now,
  }));
}
