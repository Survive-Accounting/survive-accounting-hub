// SHUFFLE THE CORRECT ANSWERS — Lee, 2026-09-06: "scramble answer choices more. Too many A
// correct. Do this globally across all CEQ sets." (At the time: 248 of 274 live questions had
// the answer at A.)
//
// What it does: for every LIVE, unparked card deck, every non-note CEQ with exactly one correct
// choice gets its choice ARRAY reordered so the correct one lands on a target position. Targets
// are dealt per set, balanced — a 12-question set gets three each of A/B/C/D — and never the
// same position three times running. Choice OBJECTS are untouched (ids, text, feedback, chains
// all travel with their choice), so CEQ chain edges, practice_events.choice_id and per-choice
// feedback keep their meaning. Every card that moves gets an editHistory entry first — the same
// shape applyCeqEdit writes — so revertCeqEdit can put the old order back, one card at a time.
//
// Skips: note-only cards, cards with 0/2+ correct, cards with fewer than 2 choices, and any
// card whose choice text refers to another choice ("all of the above", "both A and B" …).
//
//   bun --env-file=.env scripts/shuffle-answers.ts            # dry run: the report only
//   bun --env-file=.env scripts/shuffle-answers.ts --write    # writes canvas_scenes.nodes_json
//
// Close any open canvas/studio tab first — a canvas autosave after this runs would overwrite
// the scene with its own (old-order) copy.
import { createClient } from "@supabase/supabase-js";
import { loadDecksDeduped, liveDecks } from "../src/lib/student.functions";

const WRITE = process.argv.includes("--write");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const CROSS = /\b(all|none|both|neither|either) of (the|these)\b|\b(above|below)\b|\b[A-F] (and|or|&) [A-F]\b|\bboth [A-F]\b/i;
const L = "ABCDEFGH";

// A seeded PRNG so a dry run and the write it precedes deal the same targets.
let seed = 0x5eed2026;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
const shuffle = <T,>(a: T[]): T[] => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/** Deal balanced target positions for one set: cycle through a fresh shuffled permutation of
 *  [0..n-1] per "lap", re-shuffling when a lap would repeat the last position thrice. */
function dealTargets(counts: number[]): number[] {
  const out: number[] = [];
  let lap: number[] = [];
  for (const n of counts) {
    if (!lap.length) lap = shuffle([...Array(n).keys()]);
    // choice counts differ within a set (2/4/5): keep only positions this card actually has
    let pick = lap.find((p) => p < n);
    if (pick === undefined) { lap = shuffle([...Array(n).keys()]); pick = lap[0]; }
    const last2 = out.slice(-2);
    if (last2.length === 2 && last2[0] === pick && last2[1] === pick) {
      const alt = shuffle([...Array(n).keys()]).find((p) => p !== pick);
      if (alt !== undefined) pick = alt;
    }
    lap = lap.filter((p) => p !== pick);
    out.push(pick);
  }
  return out;
}

const owned = await loadDecksDeduped(db as never);
type Node = { id: string; type?: string; data?: Record<string, unknown> };
const byScene = new Map<string, { nodeIds: Set<string>; moves: { id: string; from: number; to: number }[] }>();
let cards = 0, moved = 0, skipped = 0;
const afterPos = new Map<number, number>();
for (const o of liveDecks(owned)) {
  const eligible: { node: Node; k: number; n: number }[] = [];
  for (const node of o.nodes as Node[]) {
    const d = node.data ?? {};
    if (d.bankArchived || d.provenance === "blast-off" || d.noteOnly) continue;
    const ch = Array.isArray(d.choices) ? (d.choices as { text?: string; correct?: boolean }[]) : [];
    const k = ch.findIndex((c) => c.correct);
    if (ch.length < 2 || ch.filter((c) => c.correct).length !== 1) { skipped++; continue; }
    if (ch.some((c) => CROSS.test(String(c.text ?? "")))) { skipped++; console.log(`  skip (cross-ref): ${String(d.prompt ?? "").slice(0, 70)}`); continue; }
    cards++;
    eligible.push({ node, k, n: ch.length });
  }
  const targets = dealTargets(eligible.map((e) => e.n));
  const entry = byScene.get(o.sceneId) ?? { nodeIds: new Set<string>(), moves: [] };
  eligible.forEach((e, i) => {
    const to = targets[i];
    afterPos.set(to, (afterPos.get(to) ?? 0) + 1);
    if (to === e.k) return;
    moved++;
    entry.nodeIds.add(e.node.id);
    entry.moves.push({ id: e.node.id, from: e.k, to });
  });
  byScene.set(o.sceneId, entry);
  const line = eligible.map((e, i) => L[targets[i]]).join("");
  console.log(`${String(eligible.length).padStart(2)} q  ${(o.deck as { name?: string }).name?.padEnd(46)}  ${line}`);
}
console.log(`\ncards: ${cards} · will move: ${moved} · skipped: ${skipped}`);
console.log("after:", [...afterPos].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${L[k]}=${v}`).join("  "));

if (!WRITE) { console.log("\nDRY RUN — nothing written. Re-run with --write."); process.exit(0); }

let scenesWritten = 0;
for (const [sceneId, entry] of byScene) {
  if (!entry.moves.length) continue;
  const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", sceneId).single();
  if (error || !row) { console.error("read failed", sceneId, error?.message); continue; }
  const j = row.nodes_json as { nodes?: Node[] };
  const now = new Date().toISOString();
  let applied = 0;
  for (const mv of entry.moves) {
    const node = (j.nodes ?? []).find((n) => n.id === mv.id);
    if (!node?.data) continue;
    const ch = node.data.choices as unknown[];
    if (!Array.isArray(ch) || ch.findIndex((c) => (c as { correct?: boolean }).correct) !== mv.from) { console.warn("  changed underneath, skipping", mv.id); continue; }
    const hist = Array.isArray(node.data.editHistory) ? (node.data.editHistory as unknown[]) : [];
    node.data.editHistory = [...hist, { at: now, prompt: node.data.prompt ?? "", choices: ch }].slice(-10);
    const next = ch.slice();
    const [correct] = next.splice(mv.from, 1);
    next.splice(mv.to, 0, correct);
    node.data.choices = next;
    node.data.editedVia = "answer-shuffle";
    node.data.editedAt = now;
    applied++;
  }
  const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", sceneId);
  if (up.error) { console.error("write failed", sceneId, up.error.message); continue; }
  scenesWritten++;
  console.log(`wrote scene ${sceneId}: ${applied} cards`);
}
console.log(`\ndone — ${scenesWritten} scenes written`);
