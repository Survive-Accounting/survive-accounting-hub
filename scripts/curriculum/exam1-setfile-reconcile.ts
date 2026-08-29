// EXAM 1 — SET-FILE RECONCILE (bun scripts/curriculum/exam1-setfile-reconcile.ts [--apply])
//
// Fixes the split-brain: my earlier imports wrote parallel scenes the STUDIO never saw
// (it only loads `setFile:true` rows), so Studio + students drifted. This makes ONE system:
//
//   • Upgrades the 25 editorial per-set scenes into real SET FILES (setFile:true, schema 5),
//     so `loadSetPool` (Studio) and the student dedupe both read them.
//   • Refreshes each set to the editorial 274-CEQ batch, MERGING content (prompt/choices/
//     correct/feedback/shorthand) onto REUSED nodes so their film fields (exhibit, callout,
//     geom, takes, masterNotes, …) survive. New questions get bare nodes.
//   • Carries note frames ("Found on your exam"/"Next steps") to the END (stageOrder after
//     every question) — the reported bug.
//   • Archives the OLD set-files + parks every stale deck so nothing old resolves.
//
// DRY-RUN by default. --apply writes (snapshotted first). Idempotent.
// ⚠ LANDMINE: the Studio's "Seed Exam 1 Master" action reloads the OLD data/exam1-master.csv
//   and will revert this. Do NOT run it; the spreadsheet import is the source of truth now.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readImportRows } from "../../src/lib/exam1-starter/workbook";
import { buildPlan, TOPIC_RECONCILIATION, COURSE_ID, type SetPlan } from "../../src/lib/exam1-starter/plan";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(HERE, "snapshots");
const NS = "6f68aacf-8a5a-481b-a44e-5bd2f38ce751";
const WB = join(HERE, "Survive_Exam1_Master_CEQ_Editorial_Pass_v1.xlsx");
const POS = { x: 520, y: 210 };
// film fields that live on a CEQ node and must survive a content refresh of a reused question
const FILM_FIELDS = ["exhibit", "needsExhibit", "masterNotes", "callout", "geom", "geomV", "free", "takes", "scale", "faceDown", "seedNote", "boss", "starred", "suggestedScript", "cardW", "frameMode", "confirmSfx"];
// note frames to carry onto a subtopic (donors whose notes don't auto-map by CEQ id)
const NOTE_DONOR_TO_SUBTOPIC: Record<string, string> = { b9170104: "1.1" }; // "correct order" notes → Accounting cycle order

function uuidv5(name: string): string {
  const ns = (NS.replace(/-/g, "").match(/.{2}/g) || []).map((h) => parseInt(h, 16));
  const h = createHash("sha1"); h.update(Buffer.from(ns)); h.update(Buffer.from(name, "utf8"));
  const d = h.digest(); d[6] = (d[6] & 0x0f) | 0x50; d[8] = (d[8] & 0x3f) | 0x80;
  const b = [...d.subarray(0, 16)].map((x) => x.toString(16).padStart(2, "0"));
  return `${b.slice(0, 4).join("")}-${b.slice(4, 6).join("")}-${b.slice(6, 8).join("")}-${b.slice(8, 10).join("")}-${b.slice(10, 16).join("")}`;
}
const sceneKeyFor = (t: number, s: number) => `exam1-starter/set/${t}.${s}`;
type Db = { from: (t: string) => any };
const log = (...a: unknown[]) => console.log(...a);
const pick = (o: any, keys: string[]) => { const r: any = {}; for (const k of keys) if (o && o[k] !== undefined) r[k] = o[k]; return r; };

async function main() {
  const apply = process.argv.includes("--apply");
  log(`\n━━━ EXAM 1 SET-FILE RECONCILE ${apply ? "APPLY" : "DRY-RUN"} ━━━`);
  const plan = buildPlan(readImportRows(WB).rows);
  if (plan.errors.length) { log("✗ plan errors:", plan.errors.slice(0, 5)); process.exit(1); }
  const topicIdByOrder = new Map(TOPIC_RECONCILIATION.map((t) => [t.order, t.anchorChapterId]));

  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { log("✗ env not set"); process.exit(1); }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key) as unknown as Db;

  const scenes = (await db.from("canvas_scenes").select("id,name,updated_at,nodes_json").order("updated_at", { ascending: false })).data ?? [];
  const sceneById = new Map(scenes.map((s: any) => [s.id, s]));

  // global film-node index: nodeId → old ceq node (prefer set-file/live copies for freshest film work)
  const oldNodeById = new Map<string, any>();
  const setFileScenes = scenes.filter((s: any) => s.nodes_json?.setFile && !s.nodes_json?.archived);
  const restScenes = scenes.filter((s: any) => !(s.nodes_json?.setFile && !s.nodes_json?.archived));
  for (const s of [...setFileScenes, ...restScenes]) for (const n of (s.nodes_json?.nodes ?? [])) {
    if (n.type === "ceq" && n.id && !oldNodeById.has(n.id)) oldNodeById.set(n.id, n);
  }
  // notes to carry, grouped by target subtopic key
  const notesBySub = new Map<string, any[]>();
  for (const [rowPrefix, subKey] of Object.entries(NOTE_DONOR_TO_SUBTOPIC)) {
    const s = scenes.find((x: any) => x.id.startsWith(rowPrefix));
    const notes = s ? (s.nodes_json?.nodes ?? []).filter((n: any) => n.type === "ceq" && n.data?.noteOnly) : [];
    if (notes.length) notesBySub.set(subKey, notes);
  }

  // BUILD the 25 set-file rows (reuse my existing deck-e1s scene rows by deterministic uuid)
  const newSceneIdByKey = new Map(plan.sets.map((s) => [s.sceneKey, uuidv5(s.sceneKey)]));
  const targetRowIds = new Set<string>([...newSceneIdByKey.values()]);
  let reusedWithFilm = 0, reusedNoFilm = 0, fresh = 0, notesCarried = 0;

  const buildSetFileJson = (set: SetPlan) => {
    const topicId = topicIdByOrder.get(set.topicOrder)!;
    const deckId = `deck-e1s-${set.topicOrder}-${set.subtopicOrder}`;
    const nodes: any[] = [];
    set.ceqs.forEach((c, i) => {
      const old = c.reused ? oldNodeById.get(c.ceqId) : undefined;
      const film = old ? pick(old.data ?? {}, FILM_FIELDS) : {};
      if (c.reused) { if (Object.keys(film).length) reusedWithFilm++; else reusedNoFilm++; } else fresh++;
      nodes.push({
        id: c.ceqId, type: "ceq", position: old?.position ?? { ...POS }, selected: false,
        data: {
          ...film, kind: "ceq", title: set.name, prompt: c.prompt,
          choices: c.choices.map((ch) => ({ id: ch.id, text: ch.text, correct: ch.correct, ...(ch.feedback ? { feedback: ch.feedback } : {}) })),
          deckId, deckMember: true, tucked: true, stageOrder: i, slotIndex: i, deckCategory: "ceq:studio", deckPos: { ...POS },
          ...(c.shorthand ? { shorthand: c.shorthand } : {}),
          sourceKey: c.questionKey, provenance: c.source, ...(c.reused ? { originalCeqId: c.ceqId } : {}),
        },
      });
    });
    // notes appended AFTER every question (fixes the ordering bug)
    const carried = notesBySub.get(`${set.topicOrder}.${set.subtopicOrder}`) ?? [];
    carried.forEach((nt, j) => {
      notesCarried++;
      nodes.push({ ...nt, id: nt.id, type: "ceq", data: { ...nt.data, deckId, deckMember: true, stageOrder: set.ceqs.length + j, slotIndex: set.ceqs.length + j } });
    });
    const deck = {
      id: deckId, name: set.name, slots: [], access: "free", filter: null, status: "live",
      runMode: "sequence", topicId, courseId: COURSE_ID, lessonId: null, parked: false,
      sortOrder: set.sortOrder, payloadType: "cards", showSkeletons: true,
      createdAt: "2026-08-25T00:00:00.000Z", updatedAt: new Date().toISOString(), publications: [],
    };
    return { setFile: true, schema_version: 5, decks: [deck], nodes, edges: [] };
  };

  const rows = plan.sets.map((set) => ({ set, rowId: newSceneIdByKey.get(set.sceneKey)!, json: buildSetFileJson(set) }));

  // old set-files to ARCHIVE (any live setFile row that is NOT one of our 25 target rows)
  const oldSetFiles = setFileScenes.filter((s: any) => !targetRowIds.has(s.id));
  // stale decks to PARK across all scenes (live card decks NOT one of our 25 new deck ids)
  const newDeckIds = new Set(rows.map((r) => `deck-e1s-${r.set.topicOrder}-${r.set.subtopicOrder}`));
  const staleDeckHits: { sceneId: string; deckId: string }[] = [];
  for (const s of scenes) for (const d of (s.nodes_json?.decks ?? [])) {
    if (d.payloadType !== "cards" || newDeckIds.has(d.id) || d.parked === true) continue;
    staleDeckHits.push({ sceneId: s.id, deckId: d.id });
  }

  log(`\n── DIFF ──`);
  log(`25 editorial set-files (setFile:true) ← reuse existing rows`);
  log(`  questions: reused+film ${reusedWithFilm} · reused(no film) ${reusedNoFilm} · new ${fresh}  (total ${plan.ceqCount})`);
  log(`  notes carried to END: ${notesCarried}`);
  log(`old set-files to ARCHIVE: ${oldSetFiles.length}`);
  log(`stale decks to PARK: ${staleDeckHits.length} across ${new Set(staleDeckHits.map((h) => h.sceneId)).size} scenes`);
  for (const t of plan.topics) log(`  [${t.order}] ${t.canonicalName}: ${t.sets.length} sets, ${t.sets.reduce((a, s) => a + s.ceqs.length, 0)} CEQ`);

  if (!apply) { log(`\nDRY-RUN — no writes. Re-run with --apply.`); return; }

  // SNAPSHOT
  mkdirSync(SNAP_DIR, { recursive: true });
  const snapPath = join(SNAP_DIR, `setfile-reconcile-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const affected = new Set<string>([...targetRowIds, ...oldSetFiles.map((s: any) => s.id), ...staleDeckHits.map((h) => h.sceneId)]);
  writeFileSync(snapPath, JSON.stringify({ takenAt: new Date().toISOString(), scenes: scenes.filter((s: any) => affected.has(s.id)) }, null, 1));
  log(`\n✓ snapshot → ${snapPath}`);

  // 1) write the 25 set-files (upsert by row id — reuses existing rows)
  const upserts = rows.map((r) => ({ id: r.rowId, name: `Exam 1 · ${r.set.name}`, chapter_id: null, nodes_json: r.json, viewport_json: { x: 0, y: 0, zoom: 1 }, bg: "flat", created_at: "2026-08-25T00:00:00.000Z", updated_at: new Date().toISOString() }));
  const { error: upErr } = await db.from("canvas_scenes").upsert(upserts, { onConflict: "id" });
  if (upErr) throw new Error(`upsert set-files: ${upErr.message}`);
  log(`✓ wrote 25 editorial set-files`);

  // 2) archive old set-files (flag + park their decks so neither loader surfaces them)
  for (const s of oldSetFiles) {
    const j = s.nodes_json; for (const d of (j.decks ?? [])) { d.parked = true; d.status = "archived"; }
    const { error } = await db.from("canvas_scenes").update({ nodes_json: { ...j, archived: true }, updated_at: new Date().toISOString() }).eq("id", s.id);
    if (error) throw new Error(`archive set-file ${s.id}: ${error.message}`);
  }
  log(`✓ archived ${oldSetFiles.length} old set-files`);

  // 2b) de-collide: any deck-e1s-* id living in a NON-canonical row (a Studio copy) contends
  //     with our live deck in the student dedupe (both 1-card) → rename it so only the canonical
  //     row owns the id. This is what silently hid a set on the first run.
  let decollided = 0;
  const refreshed = (await db.from("canvas_scenes").select("id,nodes_json").order("updated_at", { ascending: false })).data ?? [];
  for (const s of refreshed) {
    let dirty = false;
    for (const d of (s.nodes_json?.decks ?? [])) {
      if (typeof d.id === "string" && d.id.startsWith("deck-e1s-") && newSceneIdByKey.get(`exam1-starter/set/${d.id.slice(8).replace("-", ".")}`) !== s.id) {
        const oldId = d.id; d.id = `${oldId}-arch`;
        for (const n of (s.nodes_json?.nodes ?? [])) if (n.data?.deckId === oldId) n.data.deckId = d.id;
        dirty = true;
      }
    }
    if (dirty) { const { error } = await db.from("canvas_scenes").update({ nodes_json: s.nodes_json }).eq("id", s.id); if (error) throw new Error(`de-collide ${s.id}: ${error.message}`); decollided++; }
  }
  log(`✓ de-collided ${decollided} stray deck-e1s copies`);

  // 3) park stale decks (workspace + parallel + anything not our 25)
  const touched = new Set<string>();
  for (const h of staleDeckHits) { if (targetRowIds.has(h.sceneId)) continue; const s = sceneById.get(h.sceneId); const d = (s.nodes_json?.decks ?? []).find((x: any) => x.id === h.deckId); if (d) { d.parked = true; d.status = "archived"; touched.add(h.sceneId); } }
  for (const sid of touched) { if (oldSetFiles.some((s: any) => s.id === sid)) continue; const s = sceneById.get(sid); const { error } = await db.from("canvas_scenes").update({ nodes_json: s.nodes_json, updated_at: new Date().toISOString() }).eq("id", sid); if (error) throw new Error(`park ${sid}: ${error.message}`); }
  log(`✓ parked stale decks across ${touched.size} scenes`);

  // 4) re-assert the 6-topic grouping on all three surfaces (they drift when the Studio re-seeds):
  //    campus_exam_topics (starter/landing), exam_unit_chapters (/learn), default_exam_units (legacy).
  const anchors = TOPIC_RECONCILIATION.map((t) => t.anchorChapterId);
  const starter = (await db.from("campus_exams").select("id").is("campus_id", null).is("professor_id", null).eq("course_id", COURSE_ID).eq("status", "active").ilike("name", "Exam 1")).data?.[0];
  const examUnit = (await db.from("exam_units").select("id").eq("course_id", COURSE_ID).eq("status", "active").ilike("name", "Exam 1")).data?.[0];
  if (starter) { await db.from("campus_exam_topics").delete().eq("campus_exam_id", starter.id); await db.from("campus_exam_topics").insert(anchors.map((c, i) => ({ campus_exam_id: starter.id, chapter_id: c, position: i + 1 }))); }
  if (examUnit) { await db.from("exam_unit_chapters").delete().eq("exam_unit_id", examUnit.id); await db.from("exam_unit_chapters").insert(anchors.map((c, i) => ({ exam_unit_id: examUnit.id, chapter_id: c, position: i + 1 }))); }
  await db.from("default_exam_units").delete().eq("exam_number", 1); await db.from("default_exam_units").insert(anchors.map((c, i) => ({ unit_id: c, exam_number: 1, sort_order: i + 1, is_foundations: false })));
  log(`✓ re-asserted 6-topic grouping (starter + /learn + legacy)`);
  log(`\n✓ RECONCILE complete. Studio + students now read the same 25 editorial set-files.`);
  log(`  Verify: bun scripts/curriculum/exam1-starter-validate.ts`);
}
main().catch((e) => { console.error("✗ FAILED:", e?.message ?? e); process.exit(1); });
