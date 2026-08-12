// MAP SYSTEM OPERATIONS (mapper-side, server) — the ONLY writers of map_meta / starter rows /
// verification links / textbooks. Copy-on-write lives here: copyResolvedIntoLevel materializes the
// resolved map at a level right before its first edit; revertMapToInherited drops a level's rows so
// resolution falls back up the chain (professor → campus → Starter Map). All service-role.
// Reads degrade gracefully pre-0113 (tables absent → empty lists); writes fail loud naming 0113.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { MapLevel, MapStatus, ResolvedExam } from "@/lib/map-resolver.functions";

type Db = { from: (t: string) => any };
const dbAdmin = async (): Promise<Db> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
};

export interface MapScope { courseId: string; campusId: string | null; professorId: string | null }
const scopeSchema = z.object({ courseId: z.string().uuid(), campusId: z.string().uuid().nullable(), professorId: z.string().uuid().nullable() });
const scopeFilter = (q: any, s: MapScope) => {
  q = q.eq("course_id", s.courseId);
  q = s.campusId ? q.eq("campus_id", s.campusId) : q.is("campus_id", null);
  q = s.professorId ? q.eq("professor_id", s.professorId) : q.is("professor_id", null);
  return q;
};
const examNum = (name: string): number => {
  const d = (name.match(/\d+/) ?? [])[0];
  if (d) return parseInt(d, 10);
  return /final|review/i.test(name) ? 99 : 999;
};

/** Exam rows (+ ordered topics) at ONE level; null when the level has no active rows. */
async function examsAt(db: Db, s: MapScope): Promise<ResolvedExam[] | null> {
  const { data: exams, error } = await scopeFilter(db.from("campus_exams").select("id,name,status,coverage_pct").eq("status", "active"), s);
  if (error) throw new Error(error.message);
  if (!exams?.length) return null;
  const ids = (exams as { id: string }[]).map((e) => e.id);
  const { data: topics } = await db.from("campus_exam_topics").select("campus_exam_id,chapter_id,position").in("campus_exam_id", ids);
  const byExam = new Map<string, { chapter_id: string; position: number | null }[]>();
  for (const t of (topics ?? []) as { campus_exam_id: string; chapter_id: string; position: number | null }[]) {
    const l = byExam.get(t.campus_exam_id) ?? []; l.push(t); byExam.set(t.campus_exam_id, l);
  }
  return (exams as { id: string; name: string; coverage_pct: number | null }[])
    .map((e) => ({ id: e.id, num: examNum(e.name), label: e.name, chapterIds: (byExam.get(e.id) ?? []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((t) => t.chapter_id), coveragePct: e.coverage_pct ?? 80 }))
    .sort((a, b) => a.num - b.num);
}
async function legacyDefault(db: Db): Promise<ResolvedExam[]> {
  const { data } = await db.from("default_exam_units").select("unit_id,exam_number,sort_order").order("exam_number").order("sort_order");
  const byNum = new Map<number, string[]>();
  for (const r of (data ?? []) as { unit_id: string; exam_number: number }[]) { const l = byNum.get(r.exam_number) ?? []; l.push(r.unit_id); byNum.set(r.exam_number, l); }
  return [...byNum.entries()].map(([num, chapterIds]) => ({ id: null, num, label: num === 99 ? "Final" : `Exam ${num}`, chapterIds, coveragePct: 80 })).sort((a, b) => a.num - b.num);
}

export interface MapMetaInfo {
  metaId: string | null;
  /** DISPLAY status: 'inherited' when the level has no own exam rows, else the stored status. */
  status: MapStatus;
  hasOwnRows: boolean;
  textbookId: string | null;
  chapterLabelsOn: boolean;
  verifiedFiles: { id: string; name: string }[];
}

/** ONE level's own meta + own-row check (no resolution — the mapper's view of that level). */
export const getMapMeta = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => scopeSchema.parse(d))
  .handler(async ({ data }): Promise<MapMetaInfo> => {
    const db = await dbAdmin();
    let hasOwnRows = false;
    try {
      const { data: rows, error } = await scopeFilter(db.from("campus_exams").select("id").eq("status", "active"), data);
      if (error) throw new Error(error.message);
      hasOwnRows = !!rows?.length;
    } catch {
      // pre-0113 the professor_id filter throws — retry campus-only so a MAPPED campus still reads
      // 'edited' (never mislabeled inherited just because the migration isn't applied yet).
      if (data.campusId && !data.professorId) {
        try {
          const { data: rows } = await db.from("campus_exams").select("id").eq("course_id", data.courseId).eq("campus_id", data.campusId).eq("status", "active");
          hasOwnRows = !!rows?.length;
        } catch { /* keep false */ }
      }
    }
    let metaId: string | null = null, status: MapStatus = hasOwnRows ? "edited" : "inherited", textbookId: string | null = null, chapterLabelsOn = false;
    const verifiedFiles: { id: string; name: string }[] = [];
    try {
      const { data: m } = await scopeFilter(db.from("map_meta").select("id,status,textbook_id,chapter_labels_on"), data).limit(1);
      const meta = m?.[0] as { id: string; status: "edited" | "verified"; textbook_id: string | null; chapter_labels_on: boolean } | undefined;
      if (meta) {
        metaId = meta.id; textbookId = meta.textbook_id; chapterLabelsOn = meta.chapter_labels_on;
        if (hasOwnRows) status = meta.status; // no own rows ⇒ display 'inherited' regardless of stored value
        const { data: vf } = await db.from("map_verification_files").select("inbound_file_id").eq("map_meta_id", meta.id);
        const fids = (vf ?? []).map((r: { inbound_file_id: string }) => r.inbound_file_id);
        if (fids.length) {
          const { data: files } = await db.from("inbound_files").select("id,files,campus_name").in("id", fids);
          for (const f of (files ?? []) as { id: string; files: { name?: string }[]; campus_name: string | null }[]) {
            verifiedFiles.push({ id: f.id, name: f.files?.[0]?.name ?? f.campus_name ?? f.id.slice(0, 8) });
          }
        }
      }
    } catch { /* map_meta absent pre-0113 */ }
    return { metaId, status, hasOwnRows, textbookId, chapterLabelsOn, verifiedFiles };
  });

const ensureMeta = async (db: Db, s: MapScope): Promise<string> => {
  const { data: m } = await scopeFilter(db.from("map_meta").select("id"), s).limit(1);
  if (m?.[0]) return (m[0] as { id: string }).id;
  const { data: ins, error } = await db.from("map_meta").insert({ course_id: s.courseId, campus_id: s.campusId, professor_id: s.professorId, status: "edited" }).select("id").single();
  if (error) throw new Error(`map_meta write failed (apply 0113_map_resolution.sql?): ${error.message}`);
  return (ins as { id: string }).id;
};

/** Register a level in the mapper WITHOUT creating exam rows — the copy-on-write entry point:
 *  an added campus shows as INHERITED (resolves to the Starter Map) until its first edit. */
export const registerMapLevel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => scopeSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await dbAdmin();
    await ensureMeta(db, data);
    return { ok: true };
  });

/** Set a map's status. VERIFIED is manual-only and REQUIRES >=1 linked inbound file. */
export const setMapStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => scopeSchema.extend({ status: z.enum(["edited", "verified"]) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await dbAdmin();
    const metaId = await ensureMeta(db, data);
    if (data.status === "verified") {
      const { data: vf } = await db.from("map_verification_files").select("id").eq("map_meta_id", metaId).limit(1);
      if (!vf?.length) throw new Error("Verified requires at least one linked inbound file — link the syllabus first.");
    }
    const { error } = await db.from("map_meta").update({ status: data.status, updated_at: new Date().toISOString() }).eq("id", metaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Link an inbound file to a map — the "verified from this PDF" trail. */
export const linkVerificationFile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => scopeSchema.extend({ inboundFileId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await dbAdmin();
    const metaId = await ensureMeta(db, data);
    const { error } = await db.from("map_verification_files").insert({ map_meta_id: metaId, inbound_file_id: data.inboundFileId });
    if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

/** Chapter-label toggle — the student side only renders labels when verified AND on. */
export const setChapterLabelsOn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => scopeSchema.extend({ on: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await dbAdmin();
    const metaId = await ensureMeta(db, data);
    const { error } = await db.from("map_meta").update({ chapter_labels_on: data.on, updated_at: new Date().toISOString() }).eq("id", metaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Assign a textbook at a level. Campus-level IS "save and apply to all" via resolution. */
export const setMapTextbook = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => scopeSchema.extend({ textbookId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await dbAdmin();
    const metaId = await ensureMeta(db, data);
    const { error } = await db.from("map_meta").update({ textbook_id: data.textbookId, updated_at: new Date().toISOString() }).eq("id", metaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** COPY-ON-WRITE — materialize the RESOLVED map into this level's own rows (called once, right
 *  before the first edit of an inherited map). No-op when the level already has rows. */
export const copyResolvedIntoLevel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => scopeSchema.parse(d))
  .handler(async ({ data }): Promise<{ copied: boolean; examIds: string[] }> => {
    const db = await dbAdmin();
    const own = await examsAt(db, data).catch(() => null);
    if (own?.length) return { copied: false, examIds: own.map((e) => e.id).filter((x): x is string => !!x) };
    // SOURCE: professor level copies from campus → starter; campus level from starter.
    let source: ResolvedExam[] | null = null;
    if (data.professorId && data.campusId) source = await examsAt(db, { ...data, professorId: null }).catch(() => null);
    if (!source) source = await examsAt(db, { courseId: data.courseId, campusId: null, professorId: null }).catch(() => null);
    if (!source || !source.length) source = await legacyDefault(db);
    if (!source.length) throw new Error("Nothing to copy — the Starter Map is empty.");
    const examIds: string[] = [];
    for (const e of source) {
      const { data: ins, error } = await db.from("campus_exams").insert({ campus_id: data.campusId, professor_id: data.professorId, course_id: data.courseId, name: e.label, status: "active", coverage_pct: e.coveragePct }).select("id").single();
      if (error) throw new Error(`copy failed (apply 0113_map_resolution.sql?): ${error.message}`);
      const id = (ins as { id: string }).id;
      examIds.push(id);
      if (e.chapterIds.length) {
        const rows = e.chapterIds.map((cid, i) => ({ campus_exam_id: id, chapter_id: cid, position: i + 1 }));
        const { error: tErr } = await db.from("campus_exam_topics").insert(rows);
        if (tErr) throw new Error(tErr.message);
      }
    }
    await ensureMeta(db, data).catch(() => null);
    return { copied: true, examIds };
  });

export interface RevertDiff { before: { label: string; topics: number }[]; after: { label: string; topics: number }[]; afterLevel: MapLevel }
/** "Revert to inherited" — `apply:false` previews what the student side will change to; `apply:true`
 *  drops the level's rows so resolution falls back up. Meta stays (it carries the textbook). */
export const revertMapToInherited = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => scopeSchema.extend({ apply: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<RevertDiff> => {
    const db = await dbAdmin();
    const own = (await examsAt(db, data).catch(() => null)) ?? [];
    let fallback: ResolvedExam[] | null = null;
    let afterLevel: MapLevel = "starter";
    if (data.professorId && data.campusId) { fallback = await examsAt(db, { ...data, professorId: null }).catch(() => null); if (fallback) afterLevel = "campus"; }
    if (!fallback) { fallback = await examsAt(db, { courseId: data.courseId, campusId: null, professorId: null }).catch(() => null); afterLevel = "starter"; }
    if (!fallback || !fallback.length) { fallback = await legacyDefault(db); afterLevel = "starter"; }
    const diff: RevertDiff = {
      before: own.map((e) => ({ label: e.label, topics: e.chapterIds.length })),
      after: fallback.map((e) => ({ label: e.label, topics: e.chapterIds.length })),
      afterLevel,
    };
    if (data.apply && own.length) {
      const ids = own.map((e) => e.id).filter((x): x is string => !!x);
      if (ids.length) {
        await db.from("campus_exam_topics").delete().in("campus_exam_id", ids);
        const { error } = await db.from("campus_exams").delete().in("id", ids);
        if (error) throw new Error(error.message);
      }
    }
    return diff;
  });

// ---- TEXTBOOKS (manager modal CRUD) ------------------------------------------------------------
export interface TextbookRow { id: string; title: string; edition: string | null; chapters: { chapter_key: string; number: number; title: string }[] }
export const listTextbooks = createServerFn({ method: "GET" }).handler(async (): Promise<TextbookRow[]> => {
  const db = await dbAdmin();
  try {
    const { data: books, error } = await db.from("textbooks").select("id,title,edition").order("title");
    if (error) throw error;
    const ids = (books ?? []).map((b: { id: string }) => b.id);
    const byBook = new Map<string, { chapter_key: string; number: number; title: string }[]>();
    if (ids.length) {
      const { data: chs } = await db.from("textbook_chapters").select("textbook_id,chapter_key,number,title,position").in("textbook_id", ids).order("position");
      for (const c of (chs ?? []) as { textbook_id: string; chapter_key: string; number: number; title: string }[]) {
        const l = byBook.get(c.textbook_id) ?? []; l.push({ chapter_key: c.chapter_key, number: c.number, title: c.title }); byBook.set(c.textbook_id, l);
      }
    }
    return (books ?? []).map((b: { id: string; title: string; edition: string | null }) => ({ ...b, chapters: byBook.get(b.id) ?? [] }));
  } catch { return []; } // 0113 not applied yet
});

export const saveTextbook = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().nullable(),
    title: z.string().trim().min(1).max(200),
    edition: z.string().trim().max(80).nullable(),
    chapters: z.array(z.object({ chapter_key: z.string().trim().min(1).max(80), number: z.number().int(), title: z.string().trim().max(200) })).max(80),
  }).parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const db = await dbAdmin();
    let id = data.id;
    if (id) {
      const { error } = await db.from("textbooks").update({ title: data.title, edition: data.edition }).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await db.from("textbooks").insert({ title: data.title, edition: data.edition }).select("id").single();
      if (error) throw new Error(`textbooks write failed (apply 0113_map_resolution.sql?): ${error.message}`);
      id = (ins as { id: string }).id;
    }
    // full-replace the ordered chapter list — chapter_key is the stable identity across editions
    await db.from("textbook_chapters").delete().eq("textbook_id", id);
    if (data.chapters.length) {
      const rows = data.chapters.map((c, i) => ({ textbook_id: id, chapter_key: c.chapter_key, number: c.number, title: c.title, position: i + 1 }));
      const { error } = await db.from("textbook_chapters").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { id: id! };
  });

/** Link a unit (chapters row) to a textbook CHAPTER_KEY — identity survives edition renumbering. */
export const linkUnitToTextbookChapter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ unitId: z.string().uuid(), textbookId: z.string().uuid(), chapterKey: z.string().trim().min(1).max(80).nullable() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await dbAdmin();
    await db.from("unit_textbook_links").delete().eq("unit_id", data.unitId).eq("textbook_id", data.textbookId);
    if (data.chapterKey) {
      const { error } = await db.from("unit_textbook_links").insert({ unit_id: data.unitId, textbook_id: data.textbookId, chapter_key: data.chapterKey });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
