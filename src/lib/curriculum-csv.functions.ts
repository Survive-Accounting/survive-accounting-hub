// CURRICULUM CSV ROUND-TRIP (Prompt 2B, server) — bulk-draft topics/sets/stems externally and land
// them in ONE confirmed import. One row per CEQ (topic/set fields repeat); a set with no questions
// is one row with a blank ceq; an empty topic is one row with blank set/ceq fields.
//
//   topic_id, unit, topic_order, topic_name, set_id, set_stem, ceq_id, ceq_stem, status
//
// `unit` is informational on export (starter-map exam label) and IGNORED on import. `set_stem` is
// the set's NAME (sets have names, not stems). IMPORT RULES: rows WITH ids update; rows with BLANK
// ids create; import NEVER deletes (rows absent from the file are untouched — deletion is a UI act).
// Validation before apply: duplicate names flagged, unknown ids rejected with row numbers, stems
// over 200ch flagged. Everything is a DIFFED DRY-RUN first; apply only on confirm.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Db = { from: (t: string) => any };
const dbAdmin = async (): Promise<Db> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
};

const esc = (v: string | number | null | undefined): string => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Minimal RFC-4180 parser (quotes, escaped quotes, CRLF). Returns rows of cells. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cell = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

// ---- shared curriculum snapshot (chapters + scene decks + ceq nodes) ---------------------------
type RawDeck = { id: string; name?: string; payloadType?: string; status?: string; topicId?: string | null; courseId?: string | null };
type RawNode = { id?: string; type?: string; data?: { deckId?: string; stageOrder?: number; prompt?: string } };
interface Snapshot {
  courseId: string | null;
  chapters: { id: string; name: string; number: number | null }[];
  scenes: { id: string; nodes_json: { decks?: RawDeck[]; nodes?: RawNode[] } }[];
  deckScene: Map<string, string>; // deck id → scene id
  ceqScene: Map<string, string>;  // ceq node id → scene id
}
async function loadSnapshot(db: Db): Promise<Snapshot> {
  const { data: cs } = await db.from("courses").select("id,course_family").eq("course_family", "intro_1").limit(1);
  const courseId = (cs?.[0] as { id: string } | undefined)?.id ?? null;
  const chapters: Snapshot["chapters"] = [];
  if (courseId) {
    const { data: chs } = await db.from("chapters").select("id,chapter_name,chapter_number,status").eq("course_id", courseId);
    for (const c of (chs ?? []) as { id: string; chapter_name: string | null; chapter_number: number | null; status?: string }[]) {
      if (c.status === "archived") continue;
      chapters.push({ id: c.id, name: (c.chapter_name ?? "").trim(), number: c.chapter_number ?? null });
    }
    chapters.sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
  }
  const { data: scenes, error } = await db.from("canvas_scenes").select("id,nodes_json");
  if (error) throw new Error(error.message);
  const deckScene = new Map<string, string>(), ceqScene = new Map<string, string>();
  const out = (scenes ?? []) as Snapshot["scenes"];
  for (const s of out) {
    for (const d of s.nodes_json?.decks ?? []) if (d.payloadType === "cards") deckScene.set(d.id, s.id);
    for (const n of s.nodes_json?.nodes ?? []) if (n.type === "ceq" && n.id) ceqScene.set(n.id, s.id);
  }
  return { courseId, chapters, scenes: out, deckScene, ceqScene };
}

/** SIMPLE mode (Lee) — the same data path, fewer columns: topic_name, set_name, ceq_stem only.
 *  For reading and sharing the curriculum, NOT for round-tripping: it carries no ids, and import
 *  matches on ids (blank id = "create"), so re-importing a simple file would duplicate everything.
 *  Deliberately one export with a mode rather than a second export tool. */
export const exportCurriculumCsv = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ simple: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<{ csv: string }> => {
  const simple = !!data.simple;
  const db = await dbAdmin();
  const snap = await loadSnapshot(db);
  // starter-map exam label per topic (informational `unit` column)
  const unitByTopic = new Map<string, string>();
  try {
    const { data: se } = await db.from("campus_exams").select("id,name").is("campus_id", null).is("professor_id", null).eq("status", "active");
    for (const e of (se ?? []) as { id: string; name: string }[]) {
      const { data: t } = await db.from("campus_exam_topics").select("chapter_id").eq("campus_exam_id", e.id);
      for (const r of (t ?? []) as { chapter_id: string }[]) if (!unitByTopic.has(r.chapter_id)) unitByTopic.set(r.chapter_id, e.name);
    }
  } catch { /* pre-0113 — unit column stays blank */ }
  const decksByTopic = new Map<string, RawDeck[]>();
  const ceqsByDeck = new Map<string, { id: string; prompt: string; order: number }[]>();
  for (const s of snap.scenes) {
    for (const d of s.nodes_json?.decks ?? []) {
      if (d.payloadType !== "cards" || !d.topicId) continue;
      const l = decksByTopic.get(d.topicId) ?? []; l.push(d); decksByTopic.set(d.topicId, l);
    }
    for (const n of s.nodes_json?.nodes ?? []) {
      if (n.type !== "ceq" || !n.id || !n.data?.deckId) continue;
      const l = ceqsByDeck.get(n.data.deckId) ?? []; l.push({ id: n.id, prompt: (n.data.prompt ?? "").trim(), order: n.data.stageOrder ?? 0 }); ceqsByDeck.set(n.data.deckId, l);
    }
  }
  const lines: string[] = [simple
    ? "topic_name,set_name,ceq_stem"
    : "topic_id,unit,topic_order,topic_name,set_id,set_stem,ceq_id,ceq_stem,status"];
  for (const ch of snap.chapters) {
    const decks = decksByTopic.get(ch.id) ?? [];
    if (!decks.length) {
      lines.push(simple
        ? [ch.name, "", ""].map(esc).join(",")
        : [ch.id, unitByTopic.get(ch.id) ?? "", ch.number ?? "", ch.name, "", "", "", "", ""].map(esc).join(","));
      continue;
    }
    for (const d of decks) {
      const ceqs = (ceqsByDeck.get(d.id) ?? []).sort((a, b) => a.order - b.order);
      const status = d.status === "live" ? "live" : "draft";
      if (!ceqs.length) {
        lines.push(simple
          ? [ch.name, d.name ?? "Set", ""].map(esc).join(",")
          : [ch.id, unitByTopic.get(ch.id) ?? "", ch.number ?? "", ch.name, d.id, d.name ?? "Set", "", "", status].map(esc).join(","));
        continue;
      }
      for (const q of ceqs) lines.push(simple
        ? [ch.name, d.name ?? "Set", q.prompt].map(esc).join(",")
        : [ch.id, unitByTopic.get(ch.id) ?? "", ch.number ?? "", ch.name, d.id, d.name ?? "Set", q.id, q.prompt, status].map(esc).join(","));
    }
  }
  return { csv: lines.join("\n") };
});

export interface CsvImportDiff {
  newTopics: number; renamedTopics: number; newSets: number; renamedSets: number;
  newCeqs: number; changedStems: number; deleted: 0;
  samples: string[];                 // human lines for the dry-run panel ("+ topic Adjusting Entries (row 14)")
  flags: string[];                   // warnings (duplicates, long stems)
  rejected: string[];                // hard errors (unknown ids w/ row numbers) — block apply
  applied: boolean;
}

export const importCurriculumCsv = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ csv: z.string().min(1).max(2_000_000), apply: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<CsvImportDiff> => {
    const db = await dbAdmin();
    const snap = await loadSnapshot(db);
    if (!snap.courseId) throw new Error("Intro 1 course not found.");
    const rows = parseCsv(data.csv);
    const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const iTopicId = col("topic_id"), iTopicName = col("topic_name"), iSetId = col("set_id"), iSetName = col("set_stem"), iCeqId = col("ceq_id"), iCeqStem = col("ceq_stem"), iStatus = col("status");
    if (iTopicName < 0) throw new Error("Missing required column: topic_name.");

    const chapterById = new Map(snap.chapters.map((c) => [c.id, c]));
    const chapterByName = new Map(snap.chapters.map((c) => [c.name.toLowerCase(), c]));
    const diff: CsvImportDiff = { newTopics: 0, renamedTopics: 0, newSets: 0, renamedSets: 0, newCeqs: 0, changedStems: 0, deleted: 0, samples: [], flags: [], rejected: [], applied: false };
    const sample = (s: string) => { if (diff.samples.length < 8) diff.samples.push(s); };

    // planned operations (computed once, executed on apply)
    const topicCreates = new Map<string, { name: string; row: number }>();          // key = lowercase name
    const topicRenames: { id: string; name: string; row: number }[] = [];
    const setCreates: { key: string; name: string; topicRef: { id?: string; newName?: string }; status: string; row: number }[] = [];
    const setRenames: { id: string; name: string; row: number }[] = [];
    const ceqCreates: { setRef: { id?: string; newKey?: string }; stem: string; row: number }[] = [];
    const stemChanges: { id: string; stem: string; row: number }[] = [];
    const seenTopicNames = new Map<string, number>();
    const newSetKeyByRow = new Map<number, string>(); // groups blank-set rows: topic+setName → one new set

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const rowNo = r + 1;
      const topicId = (iTopicId >= 0 ? cells[iTopicId] : "")?.trim() ?? "";
      const topicName = (cells[iTopicName] ?? "").trim();
      const setId = (iSetId >= 0 ? cells[iSetId] : "")?.trim() ?? "";
      const setName = (iSetName >= 0 ? cells[iSetName] : "")?.trim() ?? "";
      const ceqId = (iCeqId >= 0 ? cells[iCeqId] : "")?.trim() ?? "";
      const ceqStem = (iCeqStem >= 0 ? cells[iCeqStem] : "")?.trim() ?? "";
      const status = ((iStatus >= 0 ? cells[iStatus] : "") ?? "").trim().toLowerCase();

      // ---- topic ----
      let topicRef: { id?: string; newName?: string } | null = null;
      if (topicId) {
        const ch = chapterById.get(topicId);
        if (!ch) { diff.rejected.push(`row ${rowNo}: unknown topic_id ${topicId.slice(0, 8)}…`); continue; }
        topicRef = { id: ch.id };
        if (topicName && topicName !== ch.name && !topicRenames.some((t) => t.id === ch.id)) {
          topicRenames.push({ id: ch.id, name: topicName, row: rowNo });
          sample(`~ rename "${ch.name}" → "${topicName}" (row ${rowNo})`);
        }
      } else if (topicName) {
        const existing = chapterByName.get(topicName.toLowerCase());
        if (existing) topicRef = { id: existing.id }; // blank id but the name exists → treat as that topic
        else {
          if (!topicCreates.has(topicName.toLowerCase())) { topicCreates.set(topicName.toLowerCase(), { name: topicName, row: rowNo }); sample(`+ topic ${topicName} (row ${rowNo})`); }
          topicRef = { newName: topicName };
        }
      } else { diff.rejected.push(`row ${rowNo}: no topic_id or topic_name`); continue; }
      const cnt = (seenTopicNames.get(topicName.toLowerCase()) ?? 0) + 1;
      if (topicName) seenTopicNames.set(topicName.toLowerCase(), cnt);

      // ---- set ----
      let setRef: { id?: string; newKey?: string } | null = null;
      if (setId) {
        if (!snap.deckScene.has(setId)) { diff.rejected.push(`row ${rowNo}: unknown set_id ${setId.slice(0, 12)}…`); continue; }
        setRef = { id: setId };
        const home = snap.scenes.find((s) => s.id === snap.deckScene.get(setId));
        const deck = home?.nodes_json.decks?.find((d) => d.id === setId);
        if (setName && deck && (deck.name ?? "") !== setName && !setRenames.some((x) => x.id === setId)) {
          setRenames.push({ id: setId, name: setName, row: rowNo });
          sample(`~ rename set "${deck.name}" → "${setName}" (row ${rowNo})`);
        }
      } else if (setName) {
        const key = `${topicRef.id ?? topicRef.newName}::${setName.toLowerCase()}`;
        if (![...newSetKeyByRow.values()].includes(key)) { setCreates.push({ key, name: setName, topicRef, status: status === "live" ? "live" : "draft", row: rowNo }); sample(`+ set ${setName} (row ${rowNo})`); }
        newSetKeyByRow.set(rowNo, key);
        setRef = { newKey: key };
      }

      // ---- ceq ----
      if (ceqId) {
        if (!snap.ceqScene.has(ceqId)) { diff.rejected.push(`row ${rowNo}: unknown ceq_id ${ceqId.slice(0, 12)}…`); continue; }
        if (ceqStem) {
          const home = snap.scenes.find((s) => s.id === snap.ceqScene.get(ceqId));
          const node = home?.nodes_json.nodes?.find((n) => n.id === ceqId);
          if (node && (node.data?.prompt ?? "").trim() !== ceqStem) { stemChanges.push({ id: ceqId, stem: ceqStem, row: rowNo }); sample(`~ stem (row ${rowNo}) "${ceqStem.slice(0, 40)}…"`); }
        }
      } else if (ceqStem) {
        if (!setRef) { diff.rejected.push(`row ${rowNo}: question with no set`); continue; }
        ceqCreates.push({ setRef, stem: ceqStem, row: rowNo });
        if (diff.newCeqs < 3) sample(`+ question "${ceqStem.slice(0, 40)}…" (row ${rowNo})`);
        diff.newCeqs++;
      }
      if (ceqStem.length > 200) diff.flags.push(`row ${rowNo}: stem over 200ch (${ceqStem.length})`);
    }
    // duplicate names (in-file usage across different topic identities, or vs existing when creating)
    for (const [nameLc, info] of topicCreates) if (chapterByName.has(nameLc)) diff.flags.push(`duplicate topic name "${info.name}" (exists already)`);

    diff.newTopics = topicCreates.size;
    diff.renamedTopics = topicRenames.length;
    diff.newSets = setCreates.length;
    diff.renamedSets = setRenames.length;
    diff.changedStems = stemChanges.length;

    if (!data.apply || diff.rejected.length) return diff;

    // ================================ APPLY (never deletes) ======================================
    // topics first (creates + renames)
    const topicIdByNewName = new Map<string, string>();
    let nextNum = Math.max(0, ...snap.chapters.map((c) => c.number ?? 0));
    for (const [, t] of topicCreates) {
      nextNum += 1;
      const { data: ins, error } = await db.from("chapters").insert({ course_id: snap.courseId, chapter_number: nextNum, chapter_name: t.name, status: "active", je_only_mode: false, target_lessons: 0, topics_locked: false }).select("id").single();
      if (error) throw new Error(`create topic "${t.name}": ${error.message}`);
      topicIdByNewName.set(t.name, (ins as { id: string }).id);
    }
    for (const t of topicRenames) {
      const { error } = await db.from("chapters").update({ chapter_name: t.name }).eq("id", t.id);
      if (error) throw new Error(`rename topic: ${error.message}`);
    }
    // scene edits — group by scene; NEW sets/CEQs land in the WORKING SCENE (most card decks)
    const working = snap.scenes.slice().sort((a, b) => (b.nodes_json.decks?.length ?? 0) - (a.nodes_json.decks?.length ?? 0))[0];
    if (!working && (setCreates.length || ceqCreates.length)) throw new Error("No scene exists to hold new sets/questions.");
    const touched = new Set<string>();
    const sceneById = new Map(snap.scenes.map((s) => [s.id, s]));
    const rand = () => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const deckIdByKey = new Map<string, string>();
    for (const sc of setCreates) {
      const topicId = sc.topicRef.id ?? topicIdByNewName.get(sc.topicRef.newName ?? "") ?? null;
      const id = `deck-${rand()}`;
      const now = new Date().toISOString();
      working.nodes_json.decks = working.nodes_json.decks ?? [];
      working.nodes_json.decks.push({ id, name: sc.name, payloadType: "cards", status: sc.status, topicId, courseId: snap.courseId, ...( { filter: null, runMode: "sequence", lessonId: null, slots: [], showSkeletons: true, access: "free", createdAt: now, updatedAt: now } as object) } as RawDeck);
      deckIdByKey.set(sc.key, id);
      touched.add(working.id);
    }
    for (const sr of setRenames) {
      const s = sceneById.get(snap.deckScene.get(sr.id)!);
      const d = s?.nodes_json.decks?.find((x) => x.id === sr.id);
      if (d && s) { d.name = sr.name; touched.add(s.id); }
    }
    // stage orders per deck for appended CEQs
    const maxOrderByDeck = new Map<string, number>();
    for (const s of snap.scenes) for (const n of s.nodes_json.nodes ?? []) if (n.type === "ceq" && n.data?.deckId) maxOrderByDeck.set(n.data.deckId, Math.max(maxOrderByDeck.get(n.data.deckId) ?? 0, n.data.stageOrder ?? 0));
    for (const qc of ceqCreates) {
      const deckId = qc.setRef.id ?? deckIdByKey.get(qc.setRef.newKey ?? "");
      if (!deckId) continue;
      const home = qc.setRef.id ? sceneById.get(snap.deckScene.get(deckId)!) : working;
      if (!home) continue;
      const order = (maxOrderByDeck.get(deckId) ?? 0) + 1;
      maxOrderByDeck.set(deckId, order);
      const id = `ceq-${rand()}`;
      const pos = { x: 80, y: 80 + order * 40 };
      home.nodes_json.nodes = home.nodes_json.nodes ?? [];
      // same shape the Studio's addQuestion builds — tucked deck member with two starter choices
      (home.nodes_json.nodes as unknown[]).push({ id, type: "ceq", position: pos, selected: false, data: { kind: "ceq", title: "", prompt: qc.stem, choices: [{ id: `ch-${rand()}`, text: "Choice A", correct: true }, { id: `ch-${rand()}`, text: "Choice B" }], deckId, deckMember: true, tucked: true, stageOrder: order, slotIndex: order, deckCategory: "ceq:studio", deckPos: pos } });
      touched.add(home.id);
    }
    for (const st of stemChanges) {
      const s = sceneById.get(snap.ceqScene.get(st.id)!);
      const n = s?.nodes_json.nodes?.find((x) => x.id === st.id);
      if (n && s) { n.data = { ...(n.data ?? {}), prompt: st.stem }; touched.add(s.id); }
    }
    for (const sid of touched) {
      const s = sceneById.get(sid)!;
      const { error } = await db.from("canvas_scenes").update({ nodes_json: s.nodes_json }).eq("id", sid);
      if (error) throw new Error(`scene write failed: ${error.message}`);
    }
    diff.applied = true;
    return diff;
  });
