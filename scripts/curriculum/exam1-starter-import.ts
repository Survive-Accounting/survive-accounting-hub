// EXAM 1 GLOBAL STARTER MAP — importer (bun scripts/curriculum/exam1-starter-import.ts <xlsx>)
//
//   DRY-RUN by default. Pass --apply to write. Idempotent: deterministic ids mean a second
//   --apply produces the same 6 topics / 25 sets / 280 CEQs with no duplicates.
//
// What --apply does, in order (all snapshotted to scripts/curriculum/snapshots/ first):
//   1. Rename/ensure the 6 reused topic chapters to their canonical names.
//   2. Park every OLD Exam-1 card deck (across all scenes incl. the workspace archive) so the
//      student loader stops resolving stale sets.
//   3. Upsert 25 per-set scenes (1 deck + its CEQ nodes each) — the winning scene students read.
//   4. Rewrite the Starter Map (campus_exam_topics), the /learn grouping (exam_unit_chapters),
//      and the legacy mirror (default_exam_units) to the canonical 6 topics.
//   5. Archive Ole Miss's campus Exam 1/2/3 overrides so every campus falls through to Starter.
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment (.env is auto-loaded by bun).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readImportRows } from "../../src/lib/exam1-starter/workbook";
import { buildPlan, TOPIC_RECONCILIATION, DROPPED_FROM_EXAM1_CHAPTER_ID, COURSE_ID, STARTER_EXAM_NAME, type Plan } from "../../src/lib/exam1-starter/plan";
import { buildSetScene } from "../../src/lib/exam1-starter/scene";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(HERE, "snapshots");
const NS = "6f68aacf-8a5a-481b-a44e-5bd2f38ce751"; // scene-uuid namespace (the Starter Exam 1 id)

function uuidv5(name: string): string {
  const ns = (NS.replace(/-/g, "").match(/.{2}/g) || []).map((h) => parseInt(h, 16));
  const h = createHash("sha1"); h.update(Buffer.from(ns)); h.update(Buffer.from(name, "utf8"));
  const d = h.digest(); d[6] = (d[6] & 0x0f) | 0x50; d[8] = (d[8] & 0x3f) | 0x80;
  const b = [...d.subarray(0, 16)].map((x) => x.toString(16).padStart(2, "0"));
  return `${b.slice(0, 4).join("")}-${b.slice(4, 6).join("")}-${b.slice(6, 8).join("")}-${b.slice(8, 10).join("")}-${b.slice(10, 16).join("")}`;
}

type Db = { from: (t: string) => any };
const log = (...a: unknown[]) => console.log(...a);

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const reportIdx = args.indexOf("--report");
  const reportPath = reportIdx >= 0 ? args[reportIdx + 1] : join(HERE, "..", "..", "EXAM1_GLOBAL_STARTER_MAP_REPORT.md");
  // the workbook = first bare arg that isn't a flag OR a flag's value (e.g. the --report path)
  const xlsxPath = args.find((a, i) => !a.startsWith("--") && i !== reportIdx + 1) || join(HERE, "Survive_Exam1_Master_CEQ_Editorial_Pass_v1.xlsx");

  log(`\n━━━ EXAM 1 GLOBAL STARTER MAP ${apply ? "APPLY" : "DRY-RUN"} ━━━`);
  log(`workbook: ${xlsxPath}`);

  // ---- 1. parse + plan + validate --------------------------------------------------------------
  const { rows, sheetNames } = readImportRows(xlsxPath);
  log(`sheets: ${sheetNames.join(", ")}`);
  const plan = buildPlan(rows);
  log(`plan: ${plan.topics.length} topics · ${plan.sets.length} sets · ${plan.ceqCount} CEQs`);
  if (plan.errors.length) { log(`\n✗ PLAN VALIDATION FAILED (${plan.errors.length}):`); plan.errors.slice(0, 40).forEach((e) => log("  - " + e)); process.exit(1); }
  log("✓ plan validation clean (counts + choices + correct + unique keys/ids + no dup prompts)");

  // ---- 2. connect + resolve live ids -----------------------------------------------------------
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { log("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set."); process.exit(1); }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key) as unknown as Db;

  const starterExam = (await db.from("campus_exams").select("id,name").is("campus_id", null).is("professor_id", null).eq("course_id", COURSE_ID).eq("status", "active").ilike("name", STARTER_EXAM_NAME)).data?.[0];
  if (!starterExam) throw new Error("Starter Exam 1 (campus/professor NULL) not found.");
  const examUnit = (await db.from("exam_units").select("id,name").eq("course_id", COURSE_ID).eq("status", "active").ilike("name", "Exam 1")).data?.[0];
  const oleMiss = (await db.from("campuses").select("id,name").ilike("name", "University of Mississippi")).data?.[0];
  const oleMissExams = oleMiss ? ((await db.from("campus_exams").select("id,name,status").eq("campus_id", oleMiss.id).eq("course_id", COURSE_ID).eq("status", "active")).data ?? []) : [];

  // resolve the 6 topic chapters by anchor id (survives rename)
  const anchorIds = TOPIC_RECONCILIATION.map((t) => t.anchorChapterId);
  const liveChapters = (await db.from("chapters").select("id,chapter_name,chapter_number,status,parked").in("id", anchorIds)).data ?? [];
  const chById = new Map(liveChapters.map((c: any) => [c.id, c]));
  const topicIdByOrder = new Map(TOPIC_RECONCILIATION.map((t) => [t.order, t.anchorChapterId]));
  const missing = TOPIC_RECONCILIATION.filter((t) => !chById.has(t.anchorChapterId));
  if (missing.length) throw new Error("Missing anchor chapters: " + missing.map((m) => `${m.canonicalName} (${m.anchorChapterId})`).join(", "));

  log(`\nresolved: starterExam=${starterExam.id.slice(0, 8)} examUnit=${examUnit ? examUnit.id.slice(0, 8) : "NONE"} oleMiss=${oleMiss ? oleMiss.id.slice(0, 8) : "NONE"} (${oleMissExams.length} active exams)`);

  // ---- 3. load current state for diff + snapshot -----------------------------------------------
  const scenes = (await db.from("canvas_scenes").select("id,name,chapter_id,nodes_json").order("updated_at", { ascending: false })).data ?? [];
  const targetTopicSet = new Set<string>([...anchorIds, DROPPED_FROM_EXAM1_CHAPTER_ID]);
  const newDeckIds = new Set(plan.sets.map((s) => s.deckId));
  const newSceneIdByKey = new Map(plan.sets.map((s) => [s.sceneKey, uuidv5(s.sceneKey)]));

  // old decks to park: live card decks on a target topic that are NOT one of our new decks
  const oldDeckHits: { sceneId: string; deckId: string; topicId: string; name: string }[] = [];
  for (const s of scenes) for (const d of (s.nodes_json?.decks ?? [])) {
    if (d.payloadType !== "cards" || !d.topicId || !targetTopicSet.has(d.topicId)) continue;
    if (newDeckIds.has(d.id)) continue;
    if (d.parked === true) continue; // already parked — nothing to do
    oldDeckHits.push({ sceneId: s.id, deckId: d.id, topicId: d.topicId, name: d.name ?? "" });
  }
  const existingNewScenes = new Set(scenes.filter((s: any) => [...newSceneIdByKey.values()].includes(s.id)).map((s: any) => s.id));

  const renames = TOPIC_RECONCILIATION.filter((t) => (chById.get(t.anchorChapterId) as any)?.chapter_name !== t.canonicalName);

  // ---- 4. DIFF report --------------------------------------------------------------------------
  log(`\n── DIFF ──`);
  log(`topics: reuse 6 chapters; rename ${renames.length} → ${renames.map((r) => `"${(chById.get(r.anchorChapterId) as any)?.chapter_name}"→"${r.canonicalName}"`).join(", ") || "(none)"}`);
  log(`sets: ${plan.sets.length} per-set scenes (${existingNewScenes.size} already exist → update, ${plan.sets.length - existingNewScenes.size} new)`);
  log(`ceqs: ${plan.ceqCount} (reused ${plan.sets.reduce((a, s) => a + s.ceqs.filter((c) => c.reused).length, 0)} / new ${plan.sets.reduce((a, s) => a + s.ceqs.filter((c) => !c.reused).length, 0)})`);
  log(`old decks to PARK: ${oldDeckHits.length} across ${new Set(oldDeckHits.map((h) => h.sceneId)).size} scenes`);
  log(`Starter Map (campus_exam_topics): set to 6 topics in order`);
  log(`/learn grouping (exam_unit_chapters): ${examUnit ? "set to 6 topics (drop Trial Balances)" : "NO exam_unit found — skipped"}`);
  log(`legacy default_exam_units: mirror Exam 1 = 6 topics`);
  log(`Ole Miss overrides to ARCHIVE: ${oleMissExams.map((e: any) => e.name).join(", ") || "(none)"}`);
  for (const t of plan.topics) log(`  [${t.order}] ${t.canonicalName}: ${t.sets.length} sets, ${t.sets.reduce((a, s) => a + s.ceqs.length, 0)} CEQ`);

  if (!apply) { log(`\nDRY-RUN complete — no writes. Re-run with --apply to commit.`); return; }

  // ---- 5. SNAPSHOT (reversible audit artifact) -------------------------------------------------
  mkdirSync(SNAP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapPath = join(SNAP_DIR, `pre-apply-${stamp}.json`);
  const affectedSceneIds = new Set<string>([...oldDeckHits.map((h) => h.sceneId), ...newSceneIdByKey.values()]);
  const snapshot = {
    takenAt: new Date().toISOString(), course: COURSE_ID,
    chapters: liveChapters,
    starterExam, starterExamTopics: (await db.from("campus_exam_topics").select("*").eq("campus_exam_id", starterExam.id)).data,
    examUnit, examUnitChapters: examUnit ? (await db.from("exam_unit_chapters").select("*").eq("exam_unit_id", examUnit.id)).data : [],
    defaultExamUnits: (await db.from("default_exam_units").select("*")).data,
    oleMiss, oleMissExams,
    oleMissExamTopics: oleMissExams.length ? (await db.from("campus_exam_topics").select("*").in("campus_exam_id", oleMissExams.map((e: any) => e.id))).data : [],
    oleMissMapMeta: oleMiss ? (await db.from("map_meta").select("*").eq("campus_id", oleMiss.id)).data : [],
    scenes: scenes.filter((s: any) => affectedSceneIds.has(s.id)),
  };
  writeFileSync(snapPath, JSON.stringify(snapshot, null, 1));
  log(`\n✓ snapshot → ${snapPath}`);

  // ---- 6. APPLY --------------------------------------------------------------------------------
  // 6a. topic renames / ensure active+unparked
  for (const t of TOPIC_RECONCILIATION) {
    const { error } = await db.from("chapters").update({ chapter_name: t.canonicalName, status: "active", parked: false }).eq("id", t.anchorChapterId);
    if (error) throw new Error(`rename topic ${t.canonicalName}: ${error.message}`);
  }
  log(`✓ 6 topic chapters set to canonical names`);

  // 6b. upsert 25 per-set scenes FIRST (new sets go live before old are hidden → never an empty
  //     Exam 1 mid-apply; a brief old+new overlap is safe). Include all NOT-NULL cols.
  const SCENE_STAMP = "2026-08-25T00:00:00.000Z";
  const sceneRows = plan.sets.map((s) => ({
    id: newSceneIdByKey.get(s.sceneKey)!, name: `Exam 1 · ${s.name}`, chapter_id: null,
    nodes_json: buildSetScene(s, topicIdByOrder.get(s.topicOrder)!),
    viewport_json: { x: 0, y: 0, zoom: 1 }, bg: "grid",
    created_at: SCENE_STAMP, updated_at: SCENE_STAMP,
  }));
  const { error: upErr } = await db.from("canvas_scenes").upsert(sceneRows, { onConflict: "id" });
  if (upErr) throw new Error(`upsert scenes: ${upErr.message}`);
  log(`✓ upserted ${sceneRows.length} per-set scenes`);

  // 6c. park old decks (group writes per scene) — now that the new sets exist
  const byScene = new Map<string, any>();
  for (const s of scenes) byScene.set(s.id, s);
  const touched = new Set<string>();
  for (const h of oldDeckHits) {
    const s = byScene.get(h.sceneId); const d = (s.nodes_json?.decks ?? []).find((x: any) => x.id === h.deckId);
    if (d) { d.parked = true; d.status = "archived"; touched.add(s.id); }
  }
  for (const sid of touched) { const s = byScene.get(sid); const { error } = await db.from("canvas_scenes").update({ nodes_json: s.nodes_json }).eq("id", sid); if (error) throw new Error(`park decks in ${sid}: ${error.message}`); }
  log(`✓ parked ${oldDeckHits.length} old decks across ${touched.size} scenes`);

  // 6d. Starter Map + /learn grouping + legacy mirror
  await db.from("campus_exam_topics").delete().eq("campus_exam_id", starterExam.id);
  { const { error } = await db.from("campus_exam_topics").insert(TOPIC_RECONCILIATION.map((t) => ({ campus_exam_id: starterExam.id, chapter_id: t.anchorChapterId, position: t.order }))); if (error) throw new Error(`starter topics: ${error.message}`); }
  log(`✓ Starter Map campus_exam_topics = 6 topics`);
  if (examUnit) {
    await db.from("exam_unit_chapters").delete().eq("exam_unit_id", examUnit.id);
    const { error } = await db.from("exam_unit_chapters").insert(TOPIC_RECONCILIATION.map((t) => ({ exam_unit_id: examUnit.id, chapter_id: t.anchorChapterId })));
    if (error) throw new Error(`exam_unit_chapters: ${error.message}`);
    log(`✓ exam_unit_chapters = 6 topics`);
  }
  await db.from("default_exam_units").delete().eq("exam_number", 1);
  { const { error } = await db.from("default_exam_units").insert(TOPIC_RECONCILIATION.map((t) => ({ unit_id: t.anchorChapterId, exam_number: 1, sort_order: t.order, is_foundations: false }))); if (error) throw new Error(`default_exam_units: ${error.message}`); }
  log(`✓ default_exam_units Exam 1 mirror = 6 topics`);

  // 6e. archive Ole Miss overrides (full inherit)
  if (oleMissExams.length) {
    const { error } = await db.from("campus_exams").update({ status: "archived" }).in("id", oleMissExams.map((e: any) => e.id));
    if (error) throw new Error(`archive Ole Miss: ${error.message}`);
    log(`✓ archived Ole Miss overrides: ${oleMissExams.map((e: any) => e.name).join(", ")}`);
  }

  writeReport(reportPath, plan, { renames, oldDeckHits, oleMissExams, snapPath, starterExam, examUnit });
  log(`\n✓ APPLY complete. Report → ${reportPath}`);
  log(`  Next: run  bun scripts/curriculum/exam1-starter-validate.ts`);
}

function writeReport(path: string, plan: Plan, ctx: any) {
  const reused = plan.sets.reduce((a, s) => a + s.ceqs.filter((c) => c.reused).length, 0);
  const neu = plan.ceqCount - reused;
  const lines = [
    `# EXAM 1 GLOBAL STARTER MAP — Apply Report`, ``,
    `Applied ${new Date().toISOString()} · branch curriculum/exam1-global-starter-map-v1`, ``,
    `## AFTER`, `- Topics: ${plan.topics.length}`, `- Subtopic sets: ${plan.sets.length}`, `- CEQs: ${plan.ceqCount} (reused ${reused} · new ${neu})`,
    `- Old decks parked: ${ctx.oldDeckHits.length}`, `- Ole Miss overrides archived: ${ctx.oleMissExams.map((e: any) => e.name).join(", ") || "none"}`,
    `- Snapshot: ${ctx.snapPath}`, ``,
    `## Topics → subtopic sets`,
    ...plan.topics.flatMap((t) => [`### ${t.order}. ${t.canonicalName}`, ...t.sets.map((s) => `- ${s.name} (${s.ceqs.length} CEQ)`)]),
  ];
  writeFileSync(path, lines.join("\n"));
}

main().catch((e) => { console.error("\n✗ FAILED:", e?.message ?? e); process.exit(1); });
