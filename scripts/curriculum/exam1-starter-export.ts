// EXAM 1 GLOBAL STARTER MAP — exporter (bun scripts/curriculum/exam1-starter-export.ts [out.xlsx])
//
// Pulls the LIVE Exam 1 curriculum (deduped, the exact sets students see) and writes an .xlsx
// with the SAME `Claude Import` schema the importer round-trips on — so you can edit it (change
// wording, fix answers, add rows, delete rows) and feed it straight back to
// `curriculum:exam1-starter-import`. A second `Review` sheet is a human-readable view.
//
// Round-trip identity: reused rows keep `Original CEQ ID`; every row keeps its `Question Key`.
// Keep those two columns intact to update in place. NEW rows: leave Original CEQ ID blank and give
// a unique Question Key. Deleting a row deletes that question; dropping every row of a subtopic
// retires that set. Keep Topic Order / Subtopic Order stable to preserve set identity.
import * as XLSX from "xlsx";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TOPIC_RECONCILIATION, DROPPED_FROM_EXAM1_CHAPTER_ID, COURSE_ID } from "../../src/lib/exam1-starter/plan";

const HERE = dirname(fileURLToPath(import.meta.url));
type Db = { from: (t: string) => any };

const IMPORT_HEADERS = ["Topic Order", "Topic", "Subtopic Order", "Subtopic", "Question Text", "Answer Choice #1", "Answer Choice #2", "Answer Choice #3", "Answer Choice #4", "Answer Choice #5", "Correct Answer #?", "Question Key", "Feedback (Text)", "Source", "Original CEQ ID", "Include in Starter Map?"];
const REVIEW_HEADERS = ["Topic", "Subtopic", "#", "Question", "Correct answer", "Other choices", "Feedback", "Reused?", "Question Key"];

async function main() {
  const outPath = process.argv.slice(2).find((a) => !a.startsWith("--")) || join(HERE, `Survive_Exam1_Live_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set."); process.exit(1); }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key) as unknown as Db;

  // order/name for each of the 6 topics, keyed by chapter id
  const topicByChapter = new Map(TOPIC_RECONCILIATION.map((t) => [t.anchorChapterId, t]));

  // dedupe live scenes exactly like the student loader (per-set 1-deck scenes win, then updated_at)
  const scenes = (await db.from("canvas_scenes").select("id,updated_at,nodes_json").order("updated_at", { ascending: false })).data ?? [];
  const cardCount = (s: any) => (s.nodes_json?.decks ?? []).filter((d: any) => d.payloadType === "cards").length;
  const ordered = scenes.slice().sort((a: any, b: any) => (cardCount(a) === 1 ? 0 : 1) - (cardCount(b) === 1 ? 0 : 1));
  const owned = new Map<string, any>();
  for (const s of ordered) for (const d of (s.nodes_json?.decks ?? [])) {
    if (d.payloadType !== "cards" || owned.has(d.id)) continue;
    owned.set(d.id, { deck: d, nodes: (s.nodes_json?.nodes ?? []).filter((n: any) => n.type === "ceq" && n.data?.deckId === d.id) });
  }

  // the live Exam-1 sets = live, unparked card decks on the 6 canonical topics
  const sets = [...owned.values()]
    .filter((o) => o.deck.status === "live" && o.deck.parked !== true && topicByChapter.has(o.deck.topicId))
    .map((o) => ({ ...o, topic: topicByChapter.get(o.deck.topicId)! }))
    .sort((a, b) => a.topic.order - b.topic.order || (a.deck.sortOrder ?? 1e9) - (b.deck.sortOrder ?? 1e9) || String(a.deck.name).localeCompare(String(b.deck.name)));

  const importRows: (string | number)[][] = [IMPORT_HEADERS];
  const reviewRows: (string | number)[][] = [REVIEW_HEADERS];
  let nSets = 0, nCeq = 0;

  for (const s of sets) {
    nSets++;
    const subtopicOrder = s.deck.sortOrder ?? nSets;
    const qs = (s.nodes as any[]).filter((n) => !n.data?.noteOnly).sort((a, b) => (a.data?.stageOrder ?? 0) - (b.data?.stageOrder ?? 0));
    for (const n of qs) {
      nCeq++;
      const d = n.data ?? {};
      const choices: any[] = d.choices ?? [];
      const cText = [0, 1, 2, 3, 4].map((i) => (choices[i]?.text ?? "").toString());
      const correctIdx = choices.findIndex((c) => c.correct) + 1; // 1-based
      const correct = choices.find((c: any) => c.correct);
      const feedback = (correct?.feedback ?? "").toString();
      const key = (d.sourceKey ?? "").toString();
      const originalId = (d.originalCeqId ?? "").toString();
      const source = (d.provenance ?? (originalId ? "Existing — cleaned/reused" : "New")).toString();
      importRows.push([s.topic.order, s.topic.canonicalName, subtopicOrder, s.deck.name, (d.prompt ?? "").toString(), ...cText, correctIdx, key, feedback, source, originalId, "YES"]);
      reviewRows.push([s.topic.canonicalName, s.deck.name, nCeq, (d.prompt ?? "").toString(), correct?.text ?? "", choices.filter((c: any) => !c.correct).map((c: any) => c.text).join(" | "), feedback, originalId ? "reused" : "new", key]);
    }
  }

  const wb = XLSX.utils.book_new();
  // Instructions sheet
  const notes = [
    ["Exam 1 Global Starter Map — LIVE EXPORT"],
    [`Pulled ${new Date().toISOString()} from the live site.`],
    [`${nSets} subtopic sets · ${nCeq} CEQs across 6 topics.`],
    [""],
    ["HOW TO USE:"],
    ["1. Edit the 'Claude Import' sheet (it's the machine sheet the importer reads)."],
    ["2. Edit wording / choices / correct answer / feedback in place — keep Question Key + Original CEQ ID."],
    ["3. Add a row for a new question: fill Topic Order/Topic/Subtopic Order/Subtopic, the question, 2–5 choices,"],
    ["   Correct Answer #? (1–5), a UNIQUE Question Key, optional Feedback. Leave Original CEQ ID blank. Include? = YES."],
    ["4. Delete a row to remove that question. Remove all rows of a subtopic to retire that set."],
    ["5. Keep Topic Order (1–6) and Subtopic Order stable so set identity is preserved."],
    ["6. Send the file back — it re-imports idempotently (dry-run first, then apply)."],
    [""],
    ["Correct Answer #? = the NUMBER (1–5) of the correct Answer Choice column."],
    ["Feedback shows when a student picks the correct answer."],
    ["The 6 topics: 1 Easy Points · 2 Analyzing Transactions · 3 Recording Journal Entries ·"],
    ["  4 Adjusting Entries & Trial Balance · 5 Financial Statements · 6 Closing Entries."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(notes), "Read me");
  const importWs = XLSX.utils.aoa_to_sheet(importRows);
  importWs["!cols"] = [{ wch: 6 }, { wch: 22 }, { wch: 8 }, { wch: 26 }, { wch: 60 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 8 }, { wch: 16 }, { wch: 50 }, { wch: 22 }, { wch: 18 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, importWs, "Claude Import");
  const reviewWs = XLSX.utils.aoa_to_sheet(reviewRows);
  reviewWs["!cols"] = [{ wch: 22 }, { wch: 26 }, { wch: 5 }, { wch: 60 }, { wch: 26 }, { wch: 50 }, { wch: 50 }, { wch: 8 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, reviewWs, "Review");

  XLSX.writeFile(wb, outPath);
  console.log(`✓ exported ${nSets} sets · ${nCeq} CEQs → ${outPath}`);
  // sanity
  if (nSets !== 25 || nCeq !== 280) console.log(`⚠ NOTE: live counts are ${nSets}/${nCeq}, not 25/280 — the live map may have changed since the last import.`);
}
main().catch((e) => { console.error("✗ export failed:", e?.message ?? e); process.exit(1); });
