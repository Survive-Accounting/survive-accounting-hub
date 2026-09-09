// UNSHUFFLE — put every card the answer-shuffle moved back the way it was.
//
// Lee, 2026-09-08: "UNSHUFFLE THE CHOICES!" — and, the same evening, on the account-type set:
// "Types of accounts needs the same A, B, C, D, E / Asset / Liability / Equity / Revenue /
// Expense." Both are the same complaint. scripts/shuffle-answers.ts (2026-09-06, "scramble
// answer choices more. Too many A correct") reordered the choice array on every live card so
// the correct answer landed on a dealt position. For a set whose five options are the SAME five
// on every card, that is exactly wrong: the letters stop meaning anything and Lee has to read
// all five out every time instead of building muscle memory.
//
// THIS IS AN EXACT UNDO, not a re-sort. The shuffle pushed the pre-shuffle choice array onto
// `data.editHistory` (the same shape applyCeqEdit writes) and stamped `data.editedVia =
// "answer-shuffle"`. So this walks that back, card by card: restore the array from the history
// entry, drop the entry, clear the stamp. Choice OBJECTS are never rebuilt — ids, text,
// feedback and chain edges travel with their choice exactly as they did on the way in, so CEQ
// chains and practice_events.choice_id keep their meaning.
//
// IT REFUSES TO TOUCH ANYTHING LEE HAS EDITED SINCE. A card whose `editedVia` is no longer
// "answer-shuffle" was saved by hand (or by the Editor) after the shuffle ran; its top history
// entry is that edit's, not the shuffle's, and restoring it would throw Lee's own work away.
// Those are reported and skipped.
//
//   bun --env-file=.env scripts/unshuffle-answers.ts                 # dry run: the report only
//   bun --env-file=.env scripts/unshuffle-answers.ts --write         # writes canvas_scenes
//   bun --env-file=.env scripts/unshuffle-answers.ts --deck <id>     # one deck (repeatable)
//
// Close any open canvas/studio tab first — a canvas autosave after this runs would overwrite
// the scene with its own (shuffled) copy.
import { createClient } from "@supabase/supabase-js";
import { loadDecksDeduped, liveDecks } from "../src/lib/student.functions";

const WRITE = process.argv.includes("--write");
const ONLY = process.argv.reduce<string[]>((acc, a, i) => (a === "--deck" && process.argv[i + 1] ? [...acc, process.argv[i + 1]] : acc), []);
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const L = "ABCDEFGH";

type Choice = { id?: string; text?: string; correct?: boolean };
type HistEntry = { at?: string; prompt?: unknown; choices?: unknown };
type Node = { id: string; type?: string; data?: Record<string, unknown> };

const owned = await loadDecksDeduped(db as never);
const byScene = new Map<string, { deck: string; nodeIds: string[] }>();
let shuffled = 0, restorable = 0, editedSince = 0, noHistory = 0;

for (const o of liveDecks(owned)) {
  const deck = o.deck as { id?: string; name?: string };
  if (ONLY.length && !ONLY.includes(String(deck.id ?? ""))) continue;
  const ids: string[] = [];
  for (const node of o.nodes as Node[]) {
    const d = node.data ?? {};
    if (d.editedVia !== "answer-shuffle") continue;
    shuffled++;
    const hist = Array.isArray(d.editHistory) ? (d.editHistory as HistEntry[]) : [];
    const last = hist[hist.length - 1];
    if (!last || !Array.isArray(last.choices) || (last.choices as Choice[]).length < 2) { noHistory++; console.log(`  no history to restore: ${String(d.prompt ?? node.id).slice(0, 68)}`); continue; }
    const now = (d.choices as Choice[]) ?? [];
    const was = last.choices as Choice[];
    if (was.length !== now.length) { noHistory++; console.log(`  history length differs, skipping: ${String(d.prompt ?? node.id).slice(0, 60)}`); continue; }
    restorable++;
    ids.push(node.id);
    const from = now.findIndex((c) => c.correct), to = was.findIndex((c) => c.correct);
    console.log(`  ${L[from] ?? "?"} → ${L[to] ?? "?"}  ${String(d.prompt ?? "").slice(0, 62)}`);
  }
  // A card edited after the shuffle keeps the stamp only until its next save, so count the
  // ones that clearly WERE shuffled and now carry someone else's stamp.
  for (const node of o.nodes as Node[]) {
    const d = node.data ?? {};
    if (d.editedVia && d.editedVia !== "answer-shuffle" && Array.isArray(d.editHistory) && (d.editHistory as HistEntry[]).length > 1) editedSince++;
  }
  if (ids.length) { byScene.set(o.sceneId, { deck: deck.name ?? o.sceneId, nodeIds: ids }); console.log(`${String(ids.length).padStart(3)} to restore  ${deck.name ?? o.sceneId}`); }
}

console.log(`\nstill stamped by the shuffle: ${shuffled} · restorable: ${restorable} · no usable history: ${noHistory}`);
console.log(`(cards edited since the shuffle and therefore left alone: ~${editedSince})`);

if (!WRITE) { console.log("\nDRY RUN — nothing written. Re-run with --write."); process.exit(0); }

let scenesWritten = 0, applied = 0;
for (const [sceneId, entry] of byScene) {
  const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", sceneId).single();
  if (error || !row) { console.error("read failed", sceneId, error?.message); continue; }
  const j = row.nodes_json as { nodes?: Node[] };
  let n = 0;
  for (const id of entry.nodeIds) {
    const node = (j.nodes ?? []).find((x) => x.id === id);
    const d = node?.data;
    // Re-check under the row we are about to write: the dry run read a cached copy, and a card
    // saved between then and now must keep its new words.
    if (!d || d.editedVia !== "answer-shuffle") { console.warn("  changed underneath, skipping", id); continue; }
    const hist = Array.isArray(d.editHistory) ? (d.editHistory as HistEntry[]) : [];
    const last = hist[hist.length - 1];
    if (!last || !Array.isArray(last.choices)) { console.warn("  no history, skipping", id); continue; }
    d.choices = last.choices;
    d.editHistory = hist.slice(0, -1);
    d.editedVia = "answer-unshuffle";
    d.editedAt = new Date().toISOString();
    n++;
  }
  const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", sceneId);
  if (up.error) { console.error("write failed", sceneId, up.error.message); continue; }
  scenesWritten++; applied += n;
  console.log(`wrote ${entry.deck}: ${n} cards`);
}
console.log(`\ndone — ${applied} cards restored across ${scenesWritten} scenes`);
