// Pure deck logic (PROMPT C: lesson-scoped decks). The deck is ONE roster,
// grouped by the LESSON each entry belongs to (deckLessonId, stamped when the
// card joins while parented to a lesson). Entries with no lesson form the
// "Loose" group, always LAST. Groups order by the lesson's teaching pathOrder
// (unordered lessons after ordered ones, stable by label). Unit-tested in
// deck-logic.test.ts; Deck.tsx and the route consume these.
import { isContainerType, isElementKind, type CardBase, type CardData } from "./types";

export type DeckNode = { id: string; type?: string; parentId?: string; data: Record<string, unknown> };

// ELEMENTS never deck (belt: load-migration strips them; braces: excluded here)
export const isMember = (d: CardBase) => !isElementKind(d.kind) && (!!d.deckMember || !!d.staged || !!d.minimized);
export const isTucked = (d: CardBase) => (d.deckMember ? !!d.tucked : !!d.staged || !!d.minimized);

/** Category stamp stored on deck entry (future filtering hook). */
export function categoryOf(d: CardData): string {
  return d.kind === "je" ? `je:${(d as { entryType?: string }).entryType ?? "standard"}` : d.kind;
}

/** ALL deck members in deal order. Container path_order (region/zone OR lesson)
 *  wins when set; within a container — and for loose cards — stageOrder rules. */
export function deckMembers(nodes: DeckNode[]) {
  const containerPath = new Map<string, number>();
  for (const n of nodes) {
    if (isContainerType(n.type)) {
      const p = (n.data as { pathOrder?: number | null }).pathOrder;
      if (typeof p === "number") containerPath.set(n.id, p);
    }
  }
  const pathOf = (n: { parentId?: string }) => (n.parentId != null && containerPath.has(n.parentId) ? containerPath.get(n.parentId)! : Number.MAX_SAFE_INTEGER);
  return nodes
    .filter((n) => !isContainerType(n.type) && isMember(n.data as unknown as CardBase))
    .sort(
      (a, b) =>
        pathOf(a) - pathOf(b) ||
        ((a.data as unknown as CardBase).stageOrder ?? 0) - ((b.data as unknown as CardBase).stageOrder ?? 0) ||
        a.id.localeCompare(b.id),
    );
}

/** Next card the show key deals GLOBALLY: first TUCKED member in order. */
export function nextTucked(nodes: DeckNode[]) {
  return deckMembers(nodes).find((n) => isTucked(n.data as unknown as CardBase));
}

/** An entry's lesson: the explicit stamp wins; a member parented to a lesson
 *  falls back to that (pre-stamp entries heal without migration). */
export function lessonIdOf(n: DeckNode, nodes: DeckNode[]): string | null {
  const stamped = (n.data as { deckLessonId?: string | null }).deckLessonId;
  if (stamped !== undefined) return stamped;
  if (n.parentId && nodes.some((x) => x.id === n.parentId && x.type === "lesson")) return n.parentId;
  return null;
}

export interface DeckGroup {
  lessonId: string | null; // null = Loose
  label: string;
  pathOrder: number; // MAX_SAFE_INTEGER when unordered; Loose sorts last regardless
  members: DeckNode[];
}

/** Deck grouped by lesson, groups in teaching path order, Loose LAST. EVERY
 *  lesson appears — including empty ones (0/0): that's where "Import from
 *  lessons…" lives, and the Wrap-up import targets a lesson whose deck is
 *  empty by definition. Loose only shows when it has entries. */
export function lessonGroups(nodes: DeckNode[]): DeckGroup[] {
  const members = deckMembers(nodes);
  const lessons = new Map(nodes.filter((n) => n.type === "lesson").map((n) => [n.id, n]));
  const buckets = new Map<string | null, DeckNode[]>();
  for (const lid of lessons.keys()) buckets.set(lid, []);
  for (const m of members) {
    const lid = lessonIdOf(m, nodes);
    const key = lid !== null && lessons.has(lid) ? lid : null; // dangling lesson ids read Loose
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(m);
  }
  const groups: DeckGroup[] = [];
  for (const [lid, ms] of buckets) {
    if (lid === null) continue;
    const lesson = lessons.get(lid)!;
    const d = lesson.data as { label?: string; pathOrder?: number | null };
    groups.push({
      lessonId: lid,
      label: d.label || "Lesson",
      pathOrder: typeof d.pathOrder === "number" ? d.pathOrder : Number.MAX_SAFE_INTEGER,
      members: ms,
    });
  }
  groups.sort((a, b) => a.pathOrder - b.pathOrder || a.label.localeCompare(b.label));
  const loose = buckets.get(null);
  if (loose && loose.length > 0) groups.push({ lessonId: null, label: "Loose", pathOrder: Number.MAX_SAFE_INTEGER, members: loose });
  return groups;
}

/** SPACE-WALK ACROSS LESSONS (PROMPT C): the next tucked entry starting from
 *  `currentLessonId`'s group — when that lesson's deck is exhausted, advance
 *  through the FOLLOWING groups in path order (wrapping to earlier groups
 *  last, Loose at the end). null current = start at the first group. */
export function nextTuckedCross(nodes: DeckNode[], currentLessonId: string | null | undefined): DeckNode | undefined {
  const groups = lessonGroups(nodes);
  if (groups.length === 0) return undefined;
  const startIdx = currentLessonId !== undefined ? groups.findIndex((g) => g.lessonId === (currentLessonId ?? null)) : -1;
  const order = startIdx >= 0
    ? [...groups.slice(startIdx), ...groups.slice(0, startIdx)]
    : groups;
  for (const g of order) {
    const hit = g.members.find((m) => isTucked(m.data as unknown as CardBase));
    if (hit) return hit;
  }
  return undefined;
}
