// /v3/learn's CARDS — pure. One card per CRAM VIDEO, and which offshoots hang under which card.
//
// Lee, 2026-09-10: "the horizontal view of each topic starting with Easy Points… the cram version
// of Equity is here, but now here's common stock, dividends, retained earnings." A cram SET is not
// one video once it has splits: each named split is its own short, so each is its own card.
//
// THE KEY is the publish key /v3/post and /v3/map's Videos block already use — a set's id for its
// first (or only) video, "<setId>#N" for its N-th split — so the ticks here are the ticks there.
//
// Deterministic: no Date, no random, no network.
import type { LaneTake } from "@/components/v3/lane-map";

export interface CramCard {
  /** The publish key: setId, or `${setId}#${n}` for split n (1-based, n ≥ 2). */
  key: string;
  title: string;
  setId: string;
  /** 0-based index into the set's takes; 0 for a set with no splits. */
  takeIndex: number;
  /** The split's head frame id — what an offshoot's branchTakeHead points at. "" when unknown. */
  headId: string;
}

/** The publish key for split `takeIndex` (0-based) of a set. */
export function videoKey(setId: string, takeIndex: number): string {
  return takeIndex === 0 ? setId : `${setId}#${takeIndex + 1}`;
}

/** The cram cards of one set: one per split when the plan has cuts, else the set itself. A split
 *  with no name is "<set> · part N" — never blank, never a bare number. */
export function cramCardsOf(set: { id: string; name: string }, takes: readonly LaneTake[]): CramCard[] {
  if (takes.length <= 1) {
    return [{ key: set.id, title: set.name, setId: set.id, takeIndex: 0, headId: takes[0]?.headId ?? "" }];
  }
  return takes.map((t, i) => ({
    key: videoKey(set.id, i),
    title: t.name.trim() || `${set.name} · part ${i + 1}`,
    setId: set.id,
    takeIndex: i,
    headId: t.headId,
  }));
}

export interface OffshootRef {
  id: string;
  /** The parent's split head this hangs off; null = the whole set. */
  headId: string | null;
}

export interface HungOffshoot<T extends OffshootRef> {
  item: T;
  /** True when it hangs off the whole set (or a split the plan no longer has) rather than this
   *  card's split — the card shows "anywhere in <set>" for these. */
  whole: boolean;
}

/** Group a set's offshoots under its cards, by card key. An offshoot whose headId matches a card
 *  goes under that card; one with no headId — or a headId no card has — goes under the FIRST
 *  card, flagged `whole`. Input order is kept within each card (it is already Lee's arrangement).
 *  Every card gets an entry, even an empty one, so callers never null-check. */
export function offshootsUnderCard<T extends OffshootRef>(cards: readonly CramCard[], offshoots: readonly T[]): Map<string, HungOffshoot<T>[]> {
  const out = new Map<string, HungOffshoot<T>[]>();
  for (const c of cards) out.set(c.key, []);
  const first = cards[0];
  if (!first) return out;
  const byHead = new Map<string, string>();
  for (const c of cards) if (c.headId) byHead.set(c.headId, c.key);
  for (const o of offshoots) {
    const key = o.headId ? byHead.get(o.headId) : undefined;
    if (key) out.get(key)!.push({ item: o, whole: false });
    else out.get(first.key)!.push({ item: o, whole: cards.length > 1 });
  }
  return out;
}
