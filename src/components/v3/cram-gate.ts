// THE CRAM PATH FIRST. Lee, 2026-09-10: "PREVENT me from uploading any offshoots until a cram
// path topic is complete. This will force me to zero in on just the cram path for now."
//
// So post-production for an offshoot or a pitch is a locked door until every cram video in its
// topic is confirmed filmed — every split of every cram set, the same keys /v3/post rows carry.
// Pure: the door reads it, the map reads it, nothing here touches the network.
import { laneOf } from "@/lib/deck-lane";

export interface GateSet { id: string; lane?: string; branchFrom?: string }
export interface GateTake { headId: string; name: string }
export interface GateStatus { filmedAt: string | null }

/** The publish keys of one set's videos: the set's id for a single video (or split 1), then
 *  "<setId>#N" for split N — /v3/post's own keying. */
export function videoKeys(setId: string, takes: readonly GateTake[]): string[] {
  if (takes.length <= 1) return [setId];
  return takes.map((_, i) => (i === 0 ? setId : `${setId}#${i + 1}`));
}

export interface CramGate { done: number; total: number; reason: string }

/** null = the door is open. A cram set is never gated; a branch is gated until its topic's cram
 *  path is filmed end to end. A topic with no cram videos at all gates nothing (there is no path
 *  to finish). */
export function cramPathGate(input: {
  set: GateSet;
  topicSets: readonly GateSet[];
  takesOf: (setId: string) => readonly GateTake[];
  publish: Readonly<Record<string, GateStatus | null | undefined>>;
}): CramGate | null {
  if (laneOf(input.set) === "cram") return null;
  const keys = input.topicSets.filter((s) => laneOf(s) === "cram").flatMap((s) => videoKeys(s.id, input.takesOf(s.id)));
  const total = keys.length;
  if (total === 0) return null;
  const done = keys.filter((k) => !!input.publish[k]?.filmedAt).length;
  if (done >= total) return null;
  return { done, total, reason: `Cram path first — ${done} of ${total} cram videos in this topic are filmed.` };
}
