// EXAM 1 GLOBAL STARTER MAP — validator (bun scripts/curriculum/exam1-starter-validate.ts)
//
// Post-apply automated validation. Reads the LIVE DB + the workbook and asserts every invariant
// from the spec (§13) plus the global resolution tests (§14). Exits non-zero on any failure.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readImportRows } from "../../src/lib/exam1-starter/workbook";
import { buildPlan, TOPIC_RECONCILIATION, DROPPED_FROM_EXAM1_CHAPTER_ID, COURSE_ID } from "../../src/lib/exam1-starter/plan";

const HERE = dirname(fileURLToPath(import.meta.url));
type Db = { from: (t: string) => any };
const anchorIds = TOPIC_RECONCILIATION.map((t) => t.anchorChapterId);

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { (ok ? pass++ : fail++); console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`); };

// Replica of the resolver's exam-resolution (professor → campus → starter, all-or-nothing).
async function resolveExam1TopicIds(db: Db, campusId: string | null, professorId: string | null): Promise<{ level: string; topicIds: string[] }> {
  const at = async (c: string | null, p: string | null): Promise<{ topicIds: string[] } | null> => {
    let q = db.from("campus_exams").select("id,name").eq("course_id", COURSE_ID).eq("status", "active");
    q = c ? q.eq("campus_id", c) : q.is("campus_id", null);
    q = p ? q.eq("professor_id", p) : q.is("professor_id", null);
    const { data: exams } = await q; if (!exams?.length) return null;
    const e1 = exams.find((e: any) => /exam\s*1|^1$/i.test(e.name)) ?? null;
    if (!e1) return { topicIds: [] };
    const { data: t } = await db.from("campus_exam_topics").select("chapter_id,position").eq("campus_exam_id", e1.id).order("position");
    return { topicIds: (t ?? []).map((x: any) => x.chapter_id) };
  };
  if (campusId && professorId) { const r = await at(campusId, professorId); if (r) return { level: "professor", topicIds: r.topicIds }; }
  if (campusId) { const r = await at(campusId, null); if (r) return { level: "campus", topicIds: r.topicIds }; }
  const r = await at(null, null); if (r) return { level: "starter", topicIds: r.topicIds };
  return { level: "none", topicIds: [] };
}

async function main() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log("✗ env not set"); process.exit(1); }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key) as unknown as Db;
  const plan = buildPlan(readImportRows(join(HERE, "Survive_Exam1_Global_Starter_Map.xlsx")).rows);

  console.log("\n━━━ VALIDATION ━━━\n[workbook plan]");
  check("plan errors == 0", plan.errors.length === 0, plan.errors.slice(0, 3).join("; "));
  check("topics == 6", plan.topics.length === 6);
  check("subtopic sets == 25", plan.sets.length === 25, `got ${plan.sets.length}`);
  check("CEQs == 280", plan.ceqCount === 280, `got ${plan.ceqCount}`);

  console.log("[live scenes / dedupe]");
  const scenes = (await db.from("canvas_scenes").select("id,updated_at,nodes_json").order("updated_at", { ascending: false })).data ?? [];
  // replicate loadDecksDeduped: per-set (1 card) scenes win, then updated_at desc
  const cardCount = (s: any) => (s.nodes_json?.decks ?? []).filter((d: any) => d.payloadType === "cards").length;
  const ordered = scenes.slice().sort((a: any, b: any) => (cardCount(a) === 1 ? 0 : 1) - (cardCount(b) === 1 ? 0 : 1));
  const owned = new Map<string, any>();
  for (const s of ordered) for (const d of (s.nodes_json?.decks ?? [])) { if (d.payloadType !== "cards" || owned.has(d.id)) continue; owned.set(d.id, { deck: d, sceneId: s.id, nodes: (s.nodes_json?.nodes ?? []).filter((n: any) => n.type === "ceq" && n.data?.deckId === d.id) }); }
  const liveOnTargets = [...owned.values()].filter((o) => o.deck.status === "live" && o.deck.parked !== true && anchorIds.includes(o.deck.topicId));
  check("exactly 25 live sets on the 6 topics", liveOnTargets.length === 25, `got ${liveOnTargets.length}`);
  const newDeckIds = new Set(plan.sets.map((s) => s.deckId));
  check("all 25 live sets are the new canonical decks", liveOnTargets.every((o) => newDeckIds.has(o.deck.id)));
  // winning-scene uniqueness: each new deck resolves to exactly one scene
  const dupWinning = plan.sets.filter((s) => { const sc = [...owned.values()].find((o) => o.deck.id === s.deckId); return !sc; });
  check("every canonical deck has a winning scene", dupWinning.length === 0, dupWinning.map((d) => d.deckId).join(","));
  // count CEQs across the 25 winning sets, excluding noteOnly
  let liveCeq = 0, noteOnly = 0, badChoice = 0, badCorrect = 0;
  for (const o of liveOnTargets) { for (const n of o.nodes) { if (n.data?.noteOnly) { noteOnly++; continue; } liveCeq++; const ch = n.data?.choices ?? []; if (ch.length < 2 || ch.length > 5) badChoice++; if (ch.filter((c: any) => c.correct).length !== 1) badCorrect++; } }
  check("live CEQs across 25 sets == 280", liveCeq === 280, `got ${liveCeq}`);
  check("no noteOnly nodes counted", noteOnly === 0, `${noteOnly} noteOnly present`);
  check("every live CEQ has 2–5 choices", badChoice === 0, `${badChoice} bad`);
  check("every live CEQ has exactly one correct", badCorrect === 0, `${badCorrect} bad`);
  // dup ceq ids / prompts within a set
  const allIds = new Set<string>(); let dupId = 0; let dupPrompt = 0;
  for (const o of liveOnTargets) { const seen = new Set<string>(); for (const n of o.nodes) { if (n.data?.noteOnly) continue; if (allIds.has(n.id)) dupId++; allIds.add(n.id); const p = (n.data?.prompt ?? "").toLowerCase(); if (seen.has(p)) dupPrompt++; seen.add(p); } }
  check("no duplicate CEQ node ids", dupId === 0, `${dupId}`);
  check("no duplicate prompts within a set", dupPrompt === 0, `${dupPrompt}`);

  console.log("[maps]");
  const starter = (await db.from("campus_exams").select("id").is("campus_id", null).is("professor_id", null).eq("course_id", COURSE_ID).eq("status", "active").ilike("name", "Exam 1")).data?.[0];
  const starterTopics = starter ? ((await db.from("campus_exam_topics").select("chapter_id,position").eq("campus_exam_id", starter.id).order("position")).data ?? []) : [];
  check("Starter Map has the 6 canonical topics in order", JSON.stringify(starterTopics.map((t: any) => t.chapter_id)) === JSON.stringify(anchorIds), starterTopics.map((t: any) => t.chapter_id.slice(0, 8)).join(","));
  check("Trial Balances NOT in Starter Map", !starterTopics.some((t: any) => t.chapter_id === DROPPED_FROM_EXAM1_CHAPTER_ID));
  const eu = (await db.from("exam_units").select("id").eq("course_id", COURSE_ID).eq("status", "active").ilike("name", "Exam 1")).data?.[0];
  if (eu) { const euc = (await db.from("exam_unit_chapters").select("chapter_id").eq("exam_unit_id", eu.id)).data ?? []; check("/learn exam_unit has the 6 topics (no Trial Balances)", euc.length === 6 && !euc.some((x: any) => x.chapter_id === DROPPED_FROM_EXAM1_CHAPTER_ID), `${euc.length} members`); }

  console.log("[overrides — §13]");
  const activeCampusE1 = (await db.from("campus_exams").select("id,campus_id,name,status").eq("course_id", COURSE_ID).eq("status", "active").not("campus_id", "is", null).ilike("name", "Exam 1")).data ?? [];
  check("0 active campus-specific Intro1 Exam1 overrides", activeCampusE1.length === 0, `${activeCampusE1.length} left`);
  const activeProfE1 = (await db.from("campus_exams").select("id").eq("course_id", COURSE_ID).eq("status", "active").not("professor_id", "is", null)).data ?? [];
  check("0 active professor-specific Intro1 overrides", activeProfE1.length === 0, `${activeProfE1.length} left`);

  console.log("[global resolution — §14]");
  const campusesToTest = ["University of Mississippi", "Auburn University", "University of Florida", "University of Georgia"];
  for (const name of campusesToTest) {
    const c = (await db.from("campuses").select("id,name").ilike("name", name)).data?.[0];
    if (!c) { check(`resolve ${name}`, true, "campus row not found (skipped)"); continue; }
    const r = await resolveExam1TopicIds(db, c.id, null);
    check(`${name} → Starter (6 canonical topics)`, r.level === "starter" && JSON.stringify(r.topicIds) === JSON.stringify(anchorIds), `level=${r.level} topics=${r.topicIds.length}`);
  }
  const generic = await resolveExam1TopicIds(db, null, null);
  check("generic / no-campus → Starter (6 canonical)", generic.level === "starter" && JSON.stringify(generic.topicIds) === JSON.stringify(anchorIds), `level=${generic.level}`);
  // explicit: Ole Miss no longer resolves its old 3-topic testing map
  const om = (await db.from("campuses").select("id").ilike("name", "University of Mississippi")).data?.[0];
  if (om) { const r = await resolveExam1TopicIds(db, om.id, null); check("Ole Miss no longer resolves its old testing map", r.level === "starter" && r.topicIds.length === 6); }

  console.log(`\n━━━ ${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed ━━━`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("✗ validate failed:", e?.message ?? e); process.exit(1); });
