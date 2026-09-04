// THE REVIEW PLAN IS WHAT /learn SERVES (Lee, 2026-09-04: "whatever questions
// get pushed to the final video we film from, THOSE questions/slides are what
// we will push to /learn").
//
// Lee reviews a set on /v3/…/blast-off/results: the running order, the detour
// slides he inserted (memorize this / cheat code / deeper idea) and the set
// cards he SKIPPED. That plan is saved on the set (`deck.blastOff` in the scene
// JSON) the moment he edits it — and he films from /film straight off it,
// WITHOUT pressing "Send to film". So the canvas nodes (`filmSkip`, the
// provenance "blast-off" note frames) that the send would write are not a
// reliable picture of the final edit any more; the plan is.
//
// These are the selection rules, pure and tested. student.functions.ts calls
// them and falls back to its node-based reading when a set has no plan.
import { BLAST_FRAME_KINDS, frameBullets, insertStem, type BlastFrame, type BlastPlan } from "@/components/blastoff/plan";

/** Read `deck.blastOff` as stored — tolerant of the field being absent, but a
 *  malformed plan reads as NO plan (same stance as loadBlastPlan, which
 *  regenerates rather than throws) so /learn falls back to the nodes. */
export function readLearnPlan(raw: unknown): BlastPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const frames = (raw as { frames?: unknown }).frames;
  if (!Array.isArray(frames) || frames.length === 0) return null;
  const kinds = new Set<string>(BLAST_FRAME_KINDS);
  const out: BlastFrame[] = [];
  for (const f of frames) {
    if (!f || typeof f !== "object") return null;
    const { id, kind } = f as { id?: unknown; kind?: unknown };
    if (typeof id !== "string" || !id || typeof kind !== "string" || !kinds.has(kind)) return null;
    out.push(f as BlastFrame);
  }
  return { frames: out, updatedAt: String((raw as { updatedAt?: unknown }).updatedAt ?? "") };
}

/** PRACTICE from the plan: the CEQ node ids of the plan's non-skipped `ceq`
 *  frames, in PLAN order. null = the set has no plan (or a plan with no set
 *  cards in it) — serve the nodes as before. A frame duplicated for a callback
 *  films twice but is one question, so ids are deduped on first appearance. */
export function practiceIdsFromPlan(plan: BlastPlan | null | undefined): string[] | null {
  if (!plan?.frames?.length) return null;
  const ceq = plan.frames.filter((f) => f.kind === "ceq" && !!f.ceqId);
  if (!ceq.length) return null;
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const f of ceq) {
    if (f.skipped || seen.has(f.ceqId!)) continue;
    seen.add(f.ceqId!);
    ids.push(f.ceqId!);
  }
  return ids;
}

/** The shape /learn's cram deck reads — structurally the CramCard of
 *  student.functions.ts, kept here so this module stays pure. */
export interface LearnCramCard { id: string; kind: "phrase" | "cheat" | "tip"; text: string; bullets: string[] }
const CRAM_KINDS = new Set<string>(["phrase", "cheat", "tip"]);

/** CRAM CARDS from the plan: its non-skipped memorize-this / cheat-code /
 *  deeper-idea frames in plan order. `text` and `bullets` are what the film
 *  card shows (insertStem / frameBullets — a cheat code's body is its first
 *  line); `id` is the node id "Send to film" would write for the frame, so
 *  anything keyed on it stays stable whether or not Lee ever sends. null = no
 *  plan — read the nodes as before. */
export function cramCardsFromPlan(plan: BlastPlan | null | undefined): LearnCramCard[] | null {
  if (!plan?.frames?.length) return null;
  return plan.frames
    .filter((f) => CRAM_KINDS.has(f.kind) && !f.skipped)
    .map((f) => ({ id: `blast-${f.id}`, kind: f.kind as LearnCramCard["kind"], text: insertStem(f), bullets: frameBullets(f) }))
    .filter((c) => c.text);
}
