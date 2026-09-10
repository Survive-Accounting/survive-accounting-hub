// PUBLISH ROWS FOLLOW THEIR SPLIT, NOT THEIR SEAT NUMBER.
//
// set_publish_status keys a set's videos POSITIONALLY: split 1 = "<setId>", split N = "<setId>#N"
// (src/routes/v3.post.tsx, cram-gate.ts videoKeys). A split itself is a run of filmed frames
// between cuts (plan.ts planTakes(filmFrames())), anchored on a stable HEAD frame id. So when Lee
// cuts BEFORE an already-filmed split, or the split wizard reorders / removes splits, every later
// split's seat number shifts and its filmed / posted flags now describe the wrong video (2026-09-10:
// "my Revenues split became Expenses"). This module diffs the head ids before and after a plan
// change and names the row moves that keep each row on the video it was written for. Pure — the
// only network is in rekeyAfterPlanChange, behind a dynamic import so the tests never load it.
import { filmFrames, planTakes, type BlastFrame } from "../blastoff/plan";

/** The one spelling of a split's publish key: split 1 is the set id, split N is "<setId>#N". */
export function publishKey(setId: string, index: number): string {
  return index === 0 ? setId : `${setId}#${index + 1}`;
}

/** The head frame id of every split, in running order — the same planTakes(filmFrames()) the
 *  Editor, Film, Post and the wizard read. An empty plan's one take has no head ("") and is
 *  dropped: it never had a video to key. */
export function headsOf(frames: readonly BlastFrame[]): string[] {
  return planTakes(filmFrames(frames)).map((t) => t.headId).filter((id) => id.length > 0);
}

export interface RekeyMove { from: string; to: string }

/** Every split present both before and after whose seat changed: the move from its old key to
 *  its new one. A head only in `before` (a split removed) produces NO move — its row is left
 *  behind as an orphan under the old key, on purpose: nothing it described exists any more, and
 *  the server side overwrites it if a surviving split lands on that key. A head only in `after`
 *  (a new split) has no row to move. A no-op reorder returns [].
 *
 *  ORDER: moves are emitted so that a caller applying them ONE AT A TIME never overwrites a row
 *  it still needs — a move into key K comes after the move out of K. That is always possible
 *  except for a cycle (two splits swapping seats), which no sequential order can satisfy; the
 *  server (rekeyPublishRows) therefore applies the whole list AS A SET — reads every source row
 *  first, then writes — so the order is a courtesy, not a requirement. */
export function rekeyMoves(setId: string, beforeHeads: readonly string[], afterHeads: readonly string[]): RekeyMove[] {
  const after = new Map<string, number>();
  afterHeads.forEach((h, i) => { if (h && !after.has(h)) after.set(h, i); });
  let pending: RekeyMove[] = [];
  beforeHeads.forEach((h, i) => {
    const j = after.get(h);
    if (j === undefined || j === i) return;
    pending.push({ from: publishKey(setId, i), to: publishKey(setId, j) });
  });
  // Topological: a move may go once nothing still pending is moving OUT of its destination.
  const out: RekeyMove[] = [];
  while (pending.length) {
    const vacated = new Set(pending.map((m) => m.from));
    const ready = pending.filter((m) => !vacated.has(m.to));
    if (!ready.length) { out.push(...pending); break; } // a cycle — the server handles it as a set
    out.push(...ready);
    pending = pending.filter((m) => !ready.includes(m));
  }
  return out;
}

/** After a cut / uncut / wizard confirm: move the set's publish rows to follow their splits.
 *  Returns how many rows actually moved (0 when nothing shifted, or no row existed to move).
 *  Errors are NOT swallowed — a rekey that fails is a queue that lies, and the caller should
 *  say so. The server fn is imported lazily so this module stays free of the server-fn graph
 *  for tests. */
export async function rekeyAfterPlanChange(setId: string, before: readonly BlastFrame[], after: readonly BlastFrame[]): Promise<number> {
  const moves = rekeyMoves(setId, headsOf(before), headsOf(after));
  if (!moves.length) return 0;
  const { rekeyPublishRows } = await import("@/lib/publish-queue.functions");
  const res = await rekeyPublishRows({ data: { setId, moves } });
  return res.moved;
}
