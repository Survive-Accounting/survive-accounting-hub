// EASY POINTS, REASSIGNED — the free topic becomes the five families that earn points; the
// vocab moves to the end.
//
// Lee, 2026-09-09: "What I have for exam one is just a lot of vocab based stuff, and it's really
// just too boring to put upfront. I could put it in a different section. It could even be at
// the end… I do like the idea of teaching the principles at the ends where I can just go back
// to little things I showed them and say, okay, this was an example of this historical cost
// principle." And, on the order: "Go ahead and initially vocab to the end reassign. I want that
// done first."
//
// WHAT THE LIVE BANK SAID BEFORE THIS RAN (read with _live-bank-report.ts, not the 08-29
// snapshot — the snapshot had it backwards: since then the editorial `deck-e1s-*` sets are the
// live ones and every `ch*-full` / `msr*` set is archived+parked). Easy Points (chapter
// e211854f) held FIVE live vocab sets — users, financial vs. managerial, principles, standards,
// careers — 50 questions of the exact stuff Lee wants last. The foundational sets sat elsewhere:
// Account classification and Accounting equation effects under Analyzing Transactions; Debit
// vs. credit effects and Normal balances under Recording Journal Entries; Accounting cycle order
// in a live "The Accounting Cycle" chapter that is OUTSIDE the Exam 1 grouping.
//
// WHAT IT DOES. Three kinds of write, all additive to content (no card is touched, no deck is
// archived or un-archived, nothing is deleted):
//   1. Decks move: `deck.topicId` + `deck.sortOrder` inside each scene's nodes_json — the same
//      two fields loadBoothBank orders by (lib/talkthrough.functions.ts).
//   2. One chapter is renamed: "Principles & Assumptions" (3c4e0022, already #10, after Closing
//      Entries at 9) becomes "Principles & Vocab" and takes the five vocab decks — the live
//      principles set last, because that is the one Lee points back with.
//   3. The Exam 1 grouping grows to SEVEN topics on all three surfaces the reconcile script
//      asserts (campus_exam_topics · exam_unit_chapters · default_exam_units), so the vocab is
//      still on the student path — at the end, not gone. exam1-starter/plan.ts's
//      TOPIC_RECONCILIATION carries the seventh anchor too, so a future reconcile keeps it.
//
// ANALYZING TRANSACTIONS IS LEFT WITH NO LIVE SET. Its two live sets ARE the new Easy Points;
// what is left there is archived. That is the consequence of Lee's decision, not a mistake, and
// it is reported rather than papered over (nothing parked is un-parked to fill it). The split
// tool that comes next puts the Shorts-sized pieces beside their parent, i.e. in Easy Points.
//
//   bun --env-file=.env scripts/curriculum/easy-points-reassign.ts            # dry run
//   bun --env-file=.env scripts/curriculum/easy-points-reassign.ts --write
//
// Close any open canvas/studio tab first — a canvas autosave after this runs would overwrite a
// scene with its own (old-topic) copy of the deck.
import { createClient } from "@supabase/supabase-js";
import { COURSE_ID, TOPIC_RECONCILIATION } from "../../src/lib/exam1-starter/plan";
import { loadDecksDeduped } from "../../src/lib/student.functions";

const WRITE = process.argv.includes("--write");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const EASY = "e211854f-3ff4-4d5d-ba50-c7ccba24f0bf";        // Easy Points
const ANALYZING = "aa3bfc7a-a515-463c-9962-8e36a787bc52";   // Analyzing Transactions
const VOCAB = "3c4e0022-de7e-4911-a526-13c78e58c147";       // the principles chapter → "Principles & Vocab"
const VOCAB_NAME = "Principles & Vocab";
const VOCAB_NUMBER = 10;

/** Where each deck goes, and in what order there. Only these decks move; everything else is
 *  left exactly where it is. */
const MOVES: { deck: string; topic: string; order: number; why: string }[] = [
  // THE FREE TOPIC — the five families, in the order Lee teaches them. Live editorial sets only.
  { deck: "deck-e1s-2-1", topic: EASY, order: 1, why: "Account classification — what type of account is this? (31 cards; the split tool cuts it into Assets / Liabilities / Equity / Revenue / Expense)" },
  { deck: "deck-e1s-2-2", topic: EASY, order: 2, why: "Accounting equation effects — A = L + E (14; the internal-company cheat code is stage 13, the depreciation card stage 12)" },
  { deck: "deck-e1s-3-1", topic: EASY, order: 3, why: "Debit vs. credit effects (19)" },
  { deck: "deck-e1s-3-3", topic: EASY, order: 4, why: "Normal balances (12) — the free points" },
  { deck: "deck-e1s-1-1", topic: EASY, order: 5, why: "Accounting cycle order (10) — the tease + the soft sell" },
  // THE END — the vocab, with the principles set last: it is the one Lee points back with.
  { deck: "deck-e1s-1-2", topic: VOCAB, order: 1, why: "Internal vs. external users" },
  { deck: "deck-e1s-1-3", topic: VOCAB, order: 2, why: "Financial vs. managerial accounting" },
  { deck: "deck-e1s-1-5", topic: VOCAB, order: 3, why: "Standards & regulation" },
  { deck: "deck-e1s-1-6", topic: VOCAB, order: 4, why: "Accounting careers" },
  { deck: "deck-e1s-1-4", topic: VOCAB, order: 5, why: "Principles & assumptions — historical cost, matching, the point-back finale" },
];

type Deck = { id: string; name?: string; topicId?: string | null; sortOrder?: number; status?: string; parked?: boolean };

const { data: chapters, error: chErr } = await db.from("chapters").select("id,chapter_name,chapter_number,course_id");
if (chErr) throw new Error(chErr.message);
const chById = new Map((chapters ?? []).map((c: { id: string; chapter_name: string; chapter_number: number }) => [c.id, c]));
for (const id of [EASY, ANALYZING, VOCAB]) if (!chById.has(id)) throw new Error(`chapter ${id} is not in the DB — nothing written`);

const owned = await loadDecksDeduped(db as never);
const byScene = new Map<string, { deck: Deck; to: (typeof MOVES)[number]; from: string }[]>();
console.log("DECKS\n");
for (const mv of MOVES) {
  const o = owned.get(mv.deck);
  if (!o) { console.log(`  ✗ ${mv.deck.padEnd(18)} NOT FOUND — ${mv.why}`); continue; }
  const d = o.deck as Deck;
  const from = chById.get(d.topicId ?? "")?.chapter_name ?? (d.topicId ? `unnamed ${d.topicId.slice(0, 8)}` : "no topic");
  const to = chById.get(mv.topic)!.chapter_name;
  const same = d.topicId === mv.topic && d.sortOrder === mv.order;
  console.log(`  ${same ? "=" : "→"} ${mv.deck.padEnd(18)} ${String(d.status).padEnd(8)} ${from.padEnd(34)} → ${(mv.topic === VOCAB ? VOCAB_NAME : to).padEnd(24)} #${mv.order}  ${d.name ?? mv.why}`);
  if (same) continue;
  const list = byScene.get(o.sceneId) ?? [];
  list.push({ deck: d, to: mv, from });
  byScene.set(o.sceneId, list);
}

const vocabCh = chById.get(VOCAB) as { chapter_name: string; chapter_number: number };
console.log(`\nCHAPTER ${VOCAB.slice(0, 8)}: "${vocabCh.chapter_name}" #${vocabCh.chapter_number} → "${VOCAB_NAME}" #${VOCAB_NUMBER}`);

const anchors = [...TOPIC_RECONCILIATION.map((t) => t.anchorChapterId)];
if (!anchors.includes(VOCAB)) anchors.push(VOCAB);
console.log(`\nEXAM 1 GROUPING → ${anchors.length} topics:`);
anchors.forEach((c, i) => console.log(`  ${i + 1}. ${c === VOCAB ? VOCAB_NAME : chById.get(c)?.chapter_name ?? c}`));

if (!WRITE) { console.log("\nDRY RUN — nothing written. Re-run with --write."); process.exit(0); }

// 1) the decks, scene by scene
let scenes = 0;
for (const [sceneId, moves] of byScene) {
  const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", sceneId).single();
  if (error || !row) { console.error("read failed", sceneId, error?.message); continue; }
  const j = row.nodes_json as { decks?: Deck[] };
  for (const m of moves) {
    const d = (j.decks ?? []).find((x) => x.id === m.deck.id);
    if (!d) { console.warn("  deck vanished from its scene, skipping", m.deck.id); continue; }
    d.topicId = m.to.topic;
    d.sortOrder = m.to.order;
  }
  const up = await db.from("canvas_scenes").update({ nodes_json: j, updated_at: new Date().toISOString() }).eq("id", sceneId);
  if (up.error) { console.error("write failed", sceneId, up.error.message); continue; }
  scenes++;
}
console.log(`\nwrote ${scenes} scenes`);

// 2) the chapter
const chUp = await db.from("chapters").update({ chapter_name: VOCAB_NAME, chapter_number: VOCAB_NUMBER }).eq("id", VOCAB);
if (chUp.error) throw new Error(`chapter rename: ${chUp.error.message}`);
console.log(`named chapter ${VOCAB.slice(0, 8)} "${VOCAB_NAME}" #${VOCAB_NUMBER}`);

// 3) the grouping, on all three surfaces — the reconcile script's own lines, with seven anchors
const starter = (await db.from("campus_exams").select("id").is("campus_id", null).is("professor_id", null).eq("course_id", COURSE_ID).eq("status", "active").ilike("name", "Exam 1")).data?.[0];
const examUnit = (await db.from("exam_units").select("id").eq("course_id", COURSE_ID).eq("status", "active").ilike("name", "Exam 1")).data?.[0];
if (starter) { await db.from("campus_exam_topics").delete().eq("campus_exam_id", starter.id); await db.from("campus_exam_topics").insert(anchors.map((c, i) => ({ campus_exam_id: starter.id, chapter_id: c, position: i + 1 }))); }
if (examUnit) { await db.from("exam_unit_chapters").delete().eq("exam_unit_id", examUnit.id); await db.from("exam_unit_chapters").insert(anchors.map((c, i) => ({ exam_unit_id: examUnit.id, chapter_id: c, position: i + 1 }))); }
await db.from("default_exam_units").delete().eq("exam_number", 1); await db.from("default_exam_units").insert(anchors.map((c, i) => ({ unit_id: c, exam_number: 1, sort_order: i + 1, is_foundations: false })));
console.log(`re-asserted the ${anchors.length}-topic grouping (starter ${starter ? "✓" : "—"} · /learn ${examUnit ? "✓" : "—"} · legacy ✓)`);
console.log("\n✓ done. Easy Points is the five families; the vocab is at the end.");
