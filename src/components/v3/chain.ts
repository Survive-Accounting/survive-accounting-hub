// THE CHAIN (D) — every video planned for a topic, one list, in play order.
//
// Lee, 2026-09-13: "With the offshoots, I think I want to view them as a whole in the chain we're
// building. I want to have a full length chain that shows ALL the videos we're planning for a given
// topic. Then, I'll go in and only make the ones that are most needed." And: "the theory here is
// showing ALL the possible videos. Getting all the ideas out, then prioritizing which ones for now or
// later or to skip."
//
// The map (lane-map.ts) already knows the play order set by set. This unfolds it VIDEO by video: a
// cram set becomes its splits, and each split is followed by the offshoots and pitches Lee hung off
// it — so the chain reads the way a student would watch it. A set with no plan yet is still one line
// ("not planned yet"): an idea he hasn't built is exactly what the list is for.
//
// Pure: no React, no network.
import type { DeckLane } from "@/lib/deck-lane";

import type { LaneLayout, LaneNode } from "./lane-map";

export interface ChainTake { headId: string; name: string; content: number; about: string }

export interface ChainEntry {
  /** "<setId>|<headFrameId>" — or "<setId>|set" for a set with no plan. The video_plans key. */
  key: string;
  setId: string;
  setName: string;
  lane: DeckLane;
  /** The split within its own set, 0-based; null when the set has no plan. */
  takeIndex: number | null;
  /** How many splits its set has (0 = not planned). */
  splits: number;
  headId: string | null;
  /** His name for the video: the split's name, else (a single-video branch) the set's. "" = unnamed. */
  name: string;
  /** What it's about, when unnamed: its starred / first callout. */
  about: string;
  /** Content frames (reel.ts), null when not planned. */
  content: number | null;
  /** For an offshoot or pitch: what it hangs off. */
  parent: { setName: string; takeName: string | null } | null;
  /** 1-based, in play order; orphans (branches off nothing) come last. */
  order: number;
  orphan: boolean;
}

export const videoKey = (setId: string, headId: string | null | undefined): string => `${setId}|${headId || "set"}`;

/** What the list calls a video: his name, else what it's about, else "Split N" / the set. */
export function chainTitle(e: Pick<ChainEntry, "name" | "about" | "takeIndex" | "splits" | "setName" | "lane">): string {
  if (e.name.trim()) return e.name.trim();
  if (e.about.trim()) return e.about.trim();
  if (e.lane === "cram" && e.takeIndex !== null && e.splits > 1) return `Split ${e.takeIndex + 1}`;
  return e.setName;
}

function phaseOf(n: LaneNode, splits: number): number {
  if (n.takeMissing) return 2 + 2 * splits + (n.lane === "offshoot" ? 1 : 2);
  if (n.lane === "pitch") return n.take ? 3 + 2 * n.take.index : 0;
  return n.take ? 2 + 2 * n.take.index : 2 + 2 * splits;
}

export function buildChain(layout: LaneLayout, nameOf: (setId: string) => string, takesOf: (setId: string) => readonly ChainTake[]): ChainEntry[] {
  const out: Omit<ChainEntry, "order">[] = [];
  const expand = (n: LaneNode, parent: ChainEntry["parent"]) => {
    const takes = takesOf(n.id);
    const setName = nameOf(n.id) || n.name;
    if (!takes.length) {
      out.push({ key: videoKey(n.id, null), setId: n.id, setName, lane: n.lane, takeIndex: null, splits: 0, headId: null, name: n.lane === "cram" ? "" : setName, about: "", content: null, parent, orphan: n.orphan });
      return;
    }
    takes.forEach((t, i) => {
      out.push({
        key: videoKey(n.id, t.headId), setId: n.id, setName, lane: n.lane, takeIndex: i, splits: takes.length, headId: t.headId || null,
        // A one-video offshoot or pitch is called by its set's name unless the split has its own.
        name: t.name || (n.lane !== "cram" && takes.length === 1 ? setName : ""),
        about: t.about, content: t.content, parent, orphan: n.orphan,
      });
    });
  };

  for (let row = 0; row < layout.rows; row++) {
    const cram = layout.nodes.find((n) => n.col === 1 && n.row === row && !n.orphan);
    if (!cram) continue;
    const cramTakes = takesOf(cram.id);
    const splits = cramTakes.length;
    type Slot = { phase: number; sub: number; run: () => void };
    const slots: Slot[] = [];
    if (!splits) slots.push({ phase: 1.5, sub: 0, run: () => expand(cram, null) });
    else cramTakes.forEach((t, i) => slots.push({ phase: 1.5 + 2 * i, sub: 0, run: () => {
      const setName = nameOf(cram.id) || cram.name;
      out.push({ key: videoKey(cram.id, t.headId), setId: cram.id, setName, lane: "cram", takeIndex: i, splits, headId: t.headId || null, name: t.name, about: t.about, content: t.content, parent: null, orphan: false });
    } }));
    for (const b of layout.nodes.filter((n) => n.row === row && n.col !== 1 && !n.orphan)) {
      const parent = { setName: nameOf(cram.id) || cram.name, takeName: b.take ? (b.take.name || `Split ${b.take.index + 1}`) : null };
      slots.push({ phase: phaseOf(b, splits), sub: b.sub + (b.lane === "pitch" ? 0.5 : 0), run: () => expand(b, parent) });
    }
    slots.sort((a, b) => a.phase - b.phase || a.sub - b.sub);
    for (const s of slots) s.run();
  }
  for (const o of layout.nodes.filter((n) => n.orphan)) expand(o, null);

  let n = 1;
  return out.map((e) => ({ ...e, order: e.orphan ? 0 : n++ }));
}

export type ChainStatus = "now" | "later" | "skip" | "undecided";

/** The counts the page leads with. */
export function chainCounts(entries: readonly ChainEntry[], statusOf: (key: string) => ChainStatus): Record<ChainStatus, number> {
  const c: Record<ChainStatus, number> = { now: 0, later: 0, skip: 0, undecided: 0 };
  for (const e of entries) c[statusOf(e.key)] += 1;
  return c;
}
