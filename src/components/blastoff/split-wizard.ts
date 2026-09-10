// THE SPLIT WIZARD's pure half — cards sorted into splits, and the running order rebuilt.
//
// Lee, 2026-09-10: "a wizard… first thing we do is split it appropriately. All the CEQs on the
// left and splits on the right. I create the splits I want, select one or many and drag them
// into the split I want. Then confirm and it does it." And the shape he wants: "the first one is
// the core explanation, not everything; the next split(s) is just everything else."
//
// A running order is already cut into takes (plan.ts planTakes): each take is an opener (intro ·
// slogan · bio · found), its cards — a card being a ceq frame plus the callouts and inserts that
// follow it — and a sign-off (outro, carrying the cut). This module reads that into UNITS, lets
// the UI move units between named buckets, and writes the order back the same shape, keeping
// every take's own opener and outro (Lee's edits to an intro line survive), minting a standard
// opener only for a split that did not exist before. Nothing here touches the network.
import { filmFrames, planTakes, standardOpener, type BlastFrame } from "./plan";

/** One card as the wizard moves it: the ceq frame and the frames that ride with it. */
export interface CardUnit {
  /** The ceq frame's id — the unit's identity. */
  id: string;
  ceqId: string;
  frames: BlastFrame[];
  /** True when the ceq frame itself is skipped (the unit still moves as one). */
  skipped: boolean;
}

/** A take, as the wizard sees it: its opener, its cards, its sign-off. */
export interface SplitBucket {
  /** The take's head frame id when it already exists; a fresh key (`new-…`) for a new split. */
  key: string;
  name: string;
  units: CardUnit[];
  opener: BlastFrame[];
  closer: BlastFrame[];
}

const isCeq = (f: BlastFrame): boolean => f.kind === "ceq" && typeof f.ceqId === "string" && f.ceqId.length > 0;

/** Read a running order into buckets. Opener = everything before the first card of the run;
 *  closer = the trailing outro frames after the last card (the sign-off, cut mark and all);
 *  anything else after a card rides with that card. A run with no cards keeps its frames as an
 *  opener so nothing is lost if he moves cards into it. */
export function readBuckets(frames: readonly BlastFrame[]): SplitBucket[] {
  // TAKES ARE THE FILMED RUNS — the same planTakes(filmFrames()) the Editor, Film and Post read,
  // so split N here is split N everywhere. A skipped frame carries no cut and names nothing; it
  // rides with whatever filmed frame came before it (the opener, if none has yet).
  const takes = planTakes(filmFrames(frames));
  const buckets: SplitBucket[] = takes.map((t) => ({ key: t.headId || `new-${t.index}`, name: t.name, units: [], opener: [], closer: [] }));
  let ti = 0;
  let cur: CardUnit | null = null;
  for (const f of frames) {
    const b = buckets[Math.min(ti, buckets.length - 1)];
    if (!f.skipped && isCeq(f)) { cur = { id: f.id, ceqId: f.ceqId as string, frames: [f], skipped: false }; b.units.push(cur); }
    else if (f.skipped && isCeq(f) && !cur) { cur = { id: f.id, ceqId: f.ceqId as string, frames: [f], skipped: true }; b.units.push(cur); }
    else if (f.skipped && isCeq(f)) { cur = { id: f.id, ceqId: f.ceqId as string, frames: [f], skipped: true }; b.units.push(cur); }
    else if (!cur) b.opener.push(f);
    else cur.frames.push(f);
    if (!f.skipped && f.cutAfter) { ti += 1; cur = null; }
  }
  for (const b of buckets) {
    // Trailing outros of the last card are the take's sign-off, not the card's.
    const last = b.units[b.units.length - 1];
    if (last) while (last.frames.length > 1 && last.frames[last.frames.length - 1].kind === "outro") b.closer.unshift(last.frames.pop() as BlastFrame);
  }
  return buckets;
}

let mint = 0;
/** A new, empty split. Its opener is minted on write, not here, so a bucket he adds and then
 *  deletes leaves no frames behind. */
export function newBucket(name: string): SplitBucket {
  mint += 1;
  return { key: `new-${Date.now().toString(36)}-${mint}`, name: name.trim(), units: [], opener: [], closer: [] };
}

/** Move units (by id, in the order they appear now) into a bucket at `index`. Units keep their
 *  relative order. Moving into the bucket they are already in reorders them. */
export function moveUnits(buckets: readonly SplitBucket[], ids: readonly string[], toKey: string, index: number): SplitBucket[] {
  const want = new Set(ids);
  const moving: CardUnit[] = [];
  for (const b of buckets) for (const u of b.units) if (want.has(u.id)) moving.push(u);
  if (!moving.length) return [...buckets];
  return buckets.map((b) => {
    const kept = b.units.filter((u) => !want.has(u.id));
    if (b.key !== toKey) return { ...b, units: kept };
    const at = Math.max(0, Math.min(index, kept.length));
    return { ...b, units: [...kept.slice(0, at), ...moving, ...kept.slice(at)] };
  });
}

export function renameBucket(buckets: readonly SplitBucket[], key: string, name: string): SplitBucket[] {
  return buckets.map((b) => (b.key === key ? { ...b, name: name.trim().slice(0, 80) } : b));
}

export function moveBucket(buckets: readonly SplitBucket[], key: string, dir: -1 | 1): SplitBucket[] {
  const i = buckets.findIndex((b) => b.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= buckets.length) return [...buckets];
  const next = [...buckets];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Remove an empty bucket. A bucket with cards is never removed — move them first. */
export function removeBucket(buckets: readonly SplitBucket[], key: string): SplitBucket[] {
  return buckets.filter((b) => b.key !== key || b.units.length > 0);
}

/** What stops a confirm: nothing to write, or a split with no cards (an empty take is the trap
 *  plan.ts emptyTakes exists to catch — the wizard refuses to make one). */
export function splitProblem(buckets: readonly SplitBucket[]): string | null {
  if (!buckets.length) return "Nothing to split.";
  const empty = buckets.filter((b) => b.units.length === 0);
  if (empty.length) return `${empty.length === 1 ? "A split has" : `${empty.length} splits have`} no cards — move some in or remove ${empty.length === 1 ? "it" : "them"}.`;
  if (!buckets.some((b) => b.units.length)) return "No cards to arrange.";
  const ghost = buckets.filter((b) => b.units.every((u) => u.skipped));
  if (ghost.length) return `${ghost.map((b) => b.name || "a split").join(", ")}: every card is skipped, so nothing would film — un-skip one or move a live card in.`;
  return null;
}

/** THE RUNNING ORDER, rebuilt. Bucket by bucket: its opener (its own, or a standard one minted
 *  for a new split), its cards, its sign-off — the sign-off carries the cut on every split but
 *  the last, and the head frame carries the split's name. The cram line for a minted opener is
 *  `cram`. Frames of a split he removed are gone; frames of every card are kept whole. */
export function writeBuckets(buckets: readonly SplitBucket[], cram: string): BlastFrame[] {
  const out: BlastFrame[] = [];
  const live = buckets.filter((b) => b.units.length > 0);
  live.forEach((b, i) => {
    const last = i === live.length - 1;
    const opener = b.opener.length ? b.opener : standardOpener(b.name || `Split ${i + 1}`, cram);
    const closer = b.closer.length ? b.closer : [{ id: `bf-outro-${Date.now().toString(36)}-${i}`, kind: "outro" as const }];
    const run: BlastFrame[] = [...opener, ...b.units.flatMap((u) => u.frames), ...closer].map((f) => ({ ...f, cutAfter: undefined, takeName: undefined }));
    if (!run.length) return;
    // The film view reads names and cuts off FILMED frames only (planTakes(filmFrames())).
    const head = run.findIndex((f) => !f.skipped);
    let tail = run.length - 1;
    while (tail > 0 && run[tail].skipped) tail -= 1;
    if (head >= 0) run[head] = { ...run[head], takeName: b.name.trim() || undefined };
    if (!last && tail >= 0) run[tail] = { ...run[tail], cutAfter: true as const };
    out.push(...run);
  });
  return out;
}
