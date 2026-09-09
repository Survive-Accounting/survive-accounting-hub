// STANDARDIZE THE CHOICES — same options, same order, same letters, every card in a set.
//
// Lee, 2026-09-08: "Types of accounts needs the same A, B, C, D, E / Asset / Liability / Equity
// / Revenue / Expense." And, 2026-09-09, as one of the five questions a brainstorm must answer:
// "Can the answer choices be standardized, or do they need to be shuffled?"
//
// THE DATA ANSWERS IT PER SET, and it is not the same answer everywhere:
//
//   Account classification      27 of 31 cards share ONE set of five  → standardize
//   Normal balances             10 of 12 share ONE set of four        → standardize
//   Debit vs. credit effects    two families (10 + 7)                 → standardize each
//   Accounting equation effects 9 distinct sets across 14 cards       → leave shuffled
//   Accounting cycle order      10 distinct sets across 10 cards      → leave shuffled
//
// Where every card asks the same question of a different account, fixed letters are the whole
// point: Lee reads "A" and the student already knows it means Asset, so the cram works. Where
// each card carries its own distractors the letters mean nothing and a fixed order would only
// park the answer somewhere predictable.
//
// WHY THIS IS NOT `unshuffle-answers.ts`. That script restores what was there before the 09-06
// shuffle. For Account classification the original WAS the standard order (assets→A,
// liabilities→B, equity→C, revenue→D, expense→E), so restoring it was exactly right. For Normal
// balances the original had the CORRECT ANSWER FIRST on every card — restoring it would put
// every answer at A, which is the very thing the shuffle was asked to fix. Standardizing is the
// third option and the correct one: the same four options in the same order every time, so the
// answer falls where it falls.
//
// SAFETY. Only cards whose choice TEXTS are exactly the canonical set are touched — a card with
// its own distractors is reported and left alone. Choice OBJECTS are reordered, never rebuilt,
// so ids, feedback and chain edges travel with their choice. Each card gets an editHistory
// entry first (the shape applyCeqEdit writes), so revertCeqEdit can undo it one card at a time.
//
//   bun --env-file=.env scripts/curriculum/standardize-choices.ts             # dry run, all
//   bun --env-file=.env scripts/curriculum/standardize-choices.ts --deck <id> # one set
//   bun --env-file=.env scripts/curriculum/standardize-choices.ts --write
//
// Close any open canvas/studio tab first — a canvas autosave would write the old order back.
import { createClient } from "@supabase/supabase-js";
import { loadDecksDeduped } from "../../src/lib/student.functions";

const WRITE = process.argv.includes("--write");
const ONLY = process.argv.reduce<string[]>((acc, a, i) => (a === "--deck" && process.argv[i + 1] ? [...acc, process.argv[i + 1]] : acc), []);
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const L = "ABCDEFGH";

/** The canonical orders, in the words the cards already use. A set may have more than one
 *  family (Debit vs. credit effects asks two different questions); a card matches at most one. */
const CANON: { deck: string; name: string; orders: string[][] }[] = [
  {
    deck: "deck-e1s-2-1", name: "Account classification",
    // Lee's own five, in the order he teaches them.
    orders: [["Asset", "Liability", "Equity", "Revenue", "Expense"]],
  },
  {
    deck: "deck-e1s-3-3", name: "Normal balances",
    orders: [["Debit", "Credit", "Either", "Zero"]],
  },
  {
    deck: "deck-e1s-3-1", name: "Debit vs. credit effects",
    orders: [["Debit", "Credit", "Either", "Neither"], ["Increase", "Decrease"]],
  },
];

type Choice = { id?: string; text?: string; correct?: boolean };
type Node = { id: string; data?: Record<string, unknown> };

const norm = (s: string) => s.trim().toLowerCase();
const key = (texts: string[]) => texts.map(norm).slice().sort().join(" | ");

const owned = await loadDecksDeduped(db as never);
const plan = new Map<string, { deck: string; name: string; moves: { id: string; order: string[] }[] }>();
let matched = 0, already = 0, ownDistractors = 0;

for (const spec of CANON) {
  if (ONLY.length && !ONLY.includes(spec.deck)) continue;
  const o = owned.get(spec.deck);
  if (!o) { console.log(`✗ ${spec.deck} not found`); continue; }
  const byKey = new Map(spec.orders.map((ord) => [key(ord), ord]));
  const moves: { id: string; order: string[] }[] = [];
  console.log(`\n${spec.name}  (${spec.deck})`);
  for (const node of o.nodes as Node[]) {
    const d = node.data ?? {};
    if (d.noteOnly || d.draft || d.bankArchived) continue;
    const ch = (Array.isArray(d.choices) ? d.choices : []) as Choice[];
    const texts = ch.map((c) => String(c.text ?? ""));
    const canon = byKey.get(key(texts));
    if (!canon) { ownDistractors++; console.log(`   · own distractors, left alone: ${String(d.prompt ?? node.id).slice(0, 58)}`); continue; }
    matched++;
    const want = canon.map((t) => norm(t));
    const now = texts.map(norm);
    if (want.every((t, i) => t === now[i])) { already++; continue; }
    const from = ch.findIndex((c) => c.correct);
    const to = want.indexOf(norm(String(ch[from]?.text ?? "")));
    moves.push({ id: node.id, order: want });
    console.log(`   ${L[from] ?? "?"} → ${L[to] ?? "?"}  ${String(d.prompt ?? "").slice(0, 58)}`);
  }
  if (moves.length) plan.set(o.sceneId, { deck: spec.deck, name: spec.name, moves: [...(plan.get(o.sceneId)?.moves ?? []), ...moves] });
  console.log(`   ${moves.length} to reorder · ${already} already right · matched ${matched}`);
  matched = 0; already = 0;
}

console.log(`\ncards with their own distractors, untouched: ${ownDistractors}`);
if (!WRITE) { console.log("\nDRY RUN — nothing written. Re-run with --write."); process.exit(0); }

let scenes = 0, applied = 0;
for (const [sceneId, entry] of plan) {
  const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", sceneId).single();
  if (error || !row) { console.error("read failed", sceneId, error?.message); continue; }
  const j = row.nodes_json as { nodes?: Node[] };
  const now = new Date().toISOString();
  for (const mv of entry.moves) {
    const node = (j.nodes ?? []).find((n) => n.id === mv.id);
    const d = node?.data;
    if (!d) { console.warn("  vanished, skipping", mv.id); continue; }
    const ch = (Array.isArray(d.choices) ? d.choices : []) as Choice[];
    if (key(ch.map((c) => String(c.text ?? ""))) !== key(mv.order)) { console.warn("  changed underneath, skipping", mv.id); continue; }
    const hist = Array.isArray(d.editHistory) ? (d.editHistory as unknown[]) : [];
    d.editHistory = [...hist, { at: now, prompt: d.prompt ?? "", choices: ch }].slice(-10);
    // Reorder the OBJECTS — ids, feedback and chain edges travel with their choice.
    d.choices = mv.order.map((t) => ch.find((c) => norm(String(c.text ?? "")) === t)!).filter(Boolean);
    d.editedVia = "standardize-choices";
    d.editedAt = now;
    applied++;
  }
  const up = await db.from("canvas_scenes").update({ nodes_json: j, updated_at: now }).eq("id", sceneId);
  if (up.error) { console.error("write failed", sceneId, up.error.message); continue; }
  scenes++;
  console.log(`wrote ${entry.name}`);
}
console.log(`\n✓ ${applied} cards standardized across ${scenes} scenes`);
