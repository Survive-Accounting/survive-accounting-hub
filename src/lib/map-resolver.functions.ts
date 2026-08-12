// MAP RESOLVER (server) — THE law of the map system. For any (campus, professor) request the
// exam/topic layout resolves COPY-ON-WRITE style up the chain:
//   professor map (rows exist) → campus map (rows exist) → STARTER MAP (campus_id IS NULL rows)
// Textbook + status resolve the same way via map_meta. 'inherited' is computed (no own rows),
// never stored. EVERY student-side surface that asks "what are this student's exams/topics"
// goes through resolveStudentMap — no surface may query campus_exams/default_exam_units directly.
//
// PRE-0113 DEGRADATION: until 0113_map_resolution.sql is applied, professor_id / map_meta /
// starter rows don't exist. The resolver detects the missing pieces and falls back to the exact
// pre-resolution behavior (campus rows → default_exam_units), so the landing never breaks.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface ResolvedExam {
  id: string | null; // campus_exams.id of the resolved row (null for a default_exam_units fallback exam)
  num: number; // 1..n, 99 = Final, 999 = unparsed
  label: string;
  chapterIds: string[]; // ordered topic (chapters) ids
  coveragePct: number; // gap-meter % (manual mapper field; default 80)
}
export type MapLevel = "professor" | "campus" | "starter" | "none";
export type MapStatus = "inherited" | "edited" | "verified";
export interface ResolvedMap {
  level: MapLevel; // which level the exam rows came from
  status: MapStatus; // the resolved map's honesty claim ('inherited' = resolution fell through for the REQUESTED level)
  exams: ResolvedExam[];
  textbookId: string | null;
  /** chapter labels (unit id → local chapter number) — ONLY when the resolved map is verified AND
   *  its chapter-labels toggle is on; null otherwise (textbook-agnostic by default). */
  chapterLabels: Record<string, number> | null;
}

const examNum = (name: string): number => {
  const d = (name.match(/\d+/) ?? [])[0];
  if (d) return parseInt(d, 10);
  return /final|review/i.test(name) ? 99 : 999;
};

type Db = { from: (t: string) => any };

/** Exam rows (+ topics) at ONE level. Returns null when the level has no active rows. */
async function examsAtLevel(db: Db, courseId: string, campusId: string | null, professorId: string | null): Promise<ResolvedExam[] | null> {
  let q = db.from("campus_exams").select("id,name,status,coverage_pct,campus_id,professor_id").eq("course_id", courseId).eq("status", "active");
  q = campusId ? q.eq("campus_id", campusId) : q.is("campus_id", null);
  q = professorId ? q.eq("professor_id", professorId) : q.is("professor_id", null);
  const { data: exams, error } = await q;
  if (error) throw error;
  if (!exams?.length) return null;
  const ids = exams.map((e: { id: string }) => e.id);
  const { data: topics, error: tErr } = await db.from("campus_exam_topics").select("campus_exam_id,chapter_id,position").in("campus_exam_id", ids);
  if (tErr) throw tErr;
  const byExam = new Map<string, { chapter_id: string; position: number | null }[]>();
  for (const t of (topics ?? []) as { campus_exam_id: string; chapter_id: string; position: number | null }[]) {
    const l = byExam.get(t.campus_exam_id) ?? []; l.push(t); byExam.set(t.campus_exam_id, l);
  }
  return (exams as { id: string; name: string; coverage_pct: number | null }[])
    .map((e) => ({
      id: e.id, num: examNum(e.name), label: e.name,
      chapterIds: (byExam.get(e.id) ?? []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((t) => t.chapter_id),
      coveragePct: e.coverage_pct ?? 80,
    }))
    .sort((a, b) => a.num - b.num);
}

/** default_exam_units as pseudo-exams — the pre-0113 starter fallback. */
async function legacyDefaultExams(db: Db): Promise<ResolvedExam[]> {
  const { data, error } = await db.from("default_exam_units").select("unit_id,exam_number,sort_order").order("exam_number").order("sort_order");
  if (error) return [];
  const byNum = new Map<number, string[]>();
  for (const r of (data ?? []) as { unit_id: string; exam_number: number }[]) {
    const l = byNum.get(r.exam_number) ?? []; l.push(r.unit_id); byNum.set(r.exam_number, l);
  }
  return [...byNum.entries()].map(([num, chapterIds]) => ({ id: null, num, label: num === 99 ? "Final" : `Exam ${num}`, chapterIds, coveragePct: 80 })).sort((a, b) => a.num - b.num);
}

const isMissingPiece = (e: unknown): boolean => /professor_id|map_meta|column|relation .* does not exist|42703|42P01/i.test(String((e as { message?: string })?.message ?? e ?? ""));

export const resolveStudentMap = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    courseId: z.string().uuid().optional(),
    campusId: z.string().uuid().nullable().optional(),
    professorId: z.string().uuid().nullable().optional(),
  }).parse(d ?? {}))
  .handler(async ({ data }): Promise<ResolvedMap> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as Db;

    // Course default: the Intro-1 course (the landing's course) when none is given.
    let courseId = data.courseId ?? null;
    if (!courseId) {
      const { data: cs } = await db.from("courses").select("id,course_family,course_name").eq("course_family", "intro_1").limit(1);
      courseId = (cs?.[0] as { id: string } | undefined)?.id ?? null;
      if (!courseId) return { level: "none", status: "inherited", exams: [], textbookId: null, chapterLabels: null };
    }
    const campusId = data.campusId ?? null;
    const professorId = data.professorId ?? null;

    // --- EXAM ROWS: professor → campus → starter (each level all-or-nothing) -------------------
    let exams: ResolvedExam[] | null = null;
    let level: MapLevel = "none";
    try {
      if (campusId && professorId) { exams = await examsAtLevel(db, courseId, campusId, professorId); if (exams) level = "professor"; }
      if (!exams && campusId) { exams = await examsAtLevel(db, courseId, campusId, null); if (exams) level = "campus"; }
      if (!exams) { exams = await examsAtLevel(db, courseId, null, null); if (exams) level = "starter"; }
    } catch (e) {
      if (!isMissingPiece(e)) throw e;
      // 0113 not applied — professor_id column absent. Campus rows the old way, no starter rows.
      try {
        const { data: ce } = await db.from("campus_exams").select("id,name,status,coverage_pct").eq("course_id", courseId).eq("campus_id", campusId ?? "00000000-0000-0000-0000-000000000000").eq("status", "active");
        if (ce?.length) {
          const ids = (ce as { id: string }[]).map((e2) => e2.id);
          const { data: topics } = await db.from("campus_exam_topics").select("campus_exam_id,chapter_id,position").in("campus_exam_id", ids);
          const byExam = new Map<string, { chapter_id: string; position: number | null }[]>();
          for (const t of (topics ?? []) as { campus_exam_id: string; chapter_id: string; position: number | null }[]) { const l = byExam.get(t.campus_exam_id) ?? []; l.push(t); byExam.set(t.campus_exam_id, l); }
          exams = (ce as { id: string; name: string; coverage_pct: number | null }[]).map((e2) => ({ id: e2.id, num: examNum(e2.name), label: e2.name, chapterIds: (byExam.get(e2.id) ?? []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((t) => t.chapter_id), coveragePct: e2.coverage_pct ?? 80 })).sort((a, b) => a.num - b.num);
          level = "campus";
        }
      } catch { /* fall to legacy default */ }
    }
    if (!exams || !exams.length) {
      exams = await legacyDefaultExams(db); // pre-0113 starter == default_exam_units
      level = exams.length ? "starter" : "none";
    }

    // --- STATUS + TEXTBOOK via map_meta (same chain; 'inherited' when the REQUESTED level has
    //     no meta of its own — i.e. resolution fell through). Degrades to edited/none pre-0113. ---
    let status: MapStatus = "inherited";
    let textbookId: string | null = null;
    let chapterLabelsOn = false;
    let metaId: string | null = null;
    try {
      const metaAt = async (c: string | null, p: string | null) => {
        let q = db.from("map_meta").select("id,status,textbook_id,chapter_labels_on").eq("course_id", courseId);
        q = c ? q.eq("campus_id", c) : q.is("campus_id", null);
        q = p ? q.eq("professor_id", p) : q.is("professor_id", null);
        const { data: m, error } = await q.limit(1);
        if (error) throw error;
        return (m?.[0] as { id: string; status: "edited" | "verified"; textbook_id: string | null; chapter_labels_on: boolean } | undefined) ?? null;
      };
      // Status belongs to the level that WON exam resolution; textbook cascades independently.
      const winner = level === "professor" ? await metaAt(campusId, professorId) : level === "campus" ? await metaAt(campusId, null) : level === "starter" ? await metaAt(null, null) : null;
      if (winner) { status = winner.status; chapterLabelsOn = winner.chapter_labels_on; metaId = winner.id; }
      // The REQUESTED level is 'inherited' when it isn't the winner (display concern; callers know
      // via level which map actually served).
      for (const [c, p] of [[campusId, professorId], [campusId, null], [null, null]] as [string | null, string | null][]) {
        if (textbookId) break;
        if (p && !professorId) continue;
        if (c === campusId && p === professorId && !(campusId && professorId)) continue;
        const m = await metaAt(c, p).catch(() => null);
        if (m?.textbook_id) textbookId = m.textbook_id;
      }
      if (!textbookId && winner?.textbook_id) textbookId = winner.textbook_id;
    } catch (e) {
      if (!isMissingPiece(e)) throw e; // map_meta absent pre-0113 → inherited/edited semantics degrade
      status = level === "campus" || level === "professor" ? "edited" : "inherited";
    }

    // --- CHAPTER LABELS: only when the winning map is VERIFIED and its toggle is on. -----------
    let chapterLabels: Record<string, number> | null = null;
    if (metaId && status === "verified" && chapterLabelsOn && textbookId) {
      try {
        const unitIds = [...new Set(exams.flatMap((e) => e.chapterIds))];
        if (unitIds.length) {
          const { data: links } = await db.from("unit_textbook_links").select("unit_id,chapter_key").eq("textbook_id", textbookId).in("unit_id", unitIds);
          const keys = [...new Set((links ?? []).map((l: { chapter_key: string }) => l.chapter_key))];
          if (keys.length) {
            const { data: chs } = await db.from("textbook_chapters").select("chapter_key,number").eq("textbook_id", textbookId).in("chapter_key", keys);
            const numByKey = new Map((chs ?? []).map((c: { chapter_key: string; number: number }) => [c.chapter_key, c.number]));
            chapterLabels = {};
            for (const l of (links ?? []) as { unit_id: string; chapter_key: string }[]) { const n = numByKey.get(l.chapter_key); if (n != null) chapterLabels[l.unit_id] = n as number; }
          }
        }
      } catch { /* labels are additive — never fail resolution over them */ }
    }

    return { level, status, exams, textbookId, chapterLabels };
  });
