// CAMPUS EXAMS (server) — per-campus EXAM → TOPIC(chapter) maps, the SEC "exam topics per campus"
// secret sauce. All service-role (bypass RLS). Mirrors exam-units.functions.ts, but scoped to a
// CAMPUS + course rather than a course alone: position is per (campus, course), reorder is the same
// collision-safe two-phase renumber, exams archive rather than hard-delete. Fails LOUD naming 0105
// when the tables aren't applied yet. "Topic" = a chapters row (the live v2 spine).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";

const MISSING = "campus_exams tables missing — apply migration/supabase-migrations/0105_campus_exams.sql in the Supabase SQL editor";
function rethrow(e: { code?: string; message: string }): never {
  if (isMissingSchema(e, /campus_exam/i)) throw new Error(MISSING);
  throw new Error(e.message);
}

export interface CampusExamRow { id: string; name: string; position: number | null; status: "active" | "archived"; chapter_ids: string[]; coverage_pct: number }
export interface CourseCampusRow { campus_id: string; name: string; exam_count: number; topic_count: number }

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};
const campusName = (c: { name?: string | null; institution_name?: string | null }) => (c.institution_name || c.name || "Campus").trim();

/** Campuses that have any exam mapped for this course — the Campuses folder in the outline, each
 *  with coverage counts (active exams + distinct topics across them) so map progress is visible. */
export const listCourseCampuses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ course_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<CourseCampusRow[]> => {
    const db = await admin();
    const { data: exams, error } = await db.from("campus_exams").select("id,campus_id,status").eq("course_id", data.course_id);
    if (error) rethrow(error);
    const rows = (exams ?? []) as { id: string; campus_id: string; status: "active" | "archived" }[];
    if (!rows.length) return [];
    const activeByCampus = new Map<string, string[]>(); // campus_id → active exam ids
    const examCampus = new Map<string, string>();        // exam id → campus id
    const examCount = new Map<string, number>();
    for (const r of rows) {
      examCampus.set(r.id, r.campus_id);
      if (r.status === "active") {
        activeByCampus.set(r.campus_id, [...(activeByCampus.get(r.campus_id) ?? []), r.id]);
        examCount.set(r.campus_id, (examCount.get(r.campus_id) ?? 0) + 1);
      }
    }
    const activeExamIds = rows.filter((r) => r.status === "active").map((r) => r.id);
    const topicsByCampus = new Map<string, Set<string>>();
    if (activeExamIds.length) {
      const { data: mem, error: e2 } = await db.from("campus_exam_topics").select("campus_exam_id,chapter_id").in("campus_exam_id", activeExamIds);
      if (e2) rethrow(e2);
      for (const m of (mem ?? []) as { campus_exam_id: string; chapter_id: string }[]) {
        const campus = examCampus.get(m.campus_exam_id);
        if (!campus) continue;
        const set = topicsByCampus.get(campus) ?? new Set<string>();
        set.add(m.chapter_id);
        topicsByCampus.set(campus, set);
      }
    }
    const campusIds = [...new Set(rows.map((r) => r.campus_id))];
    const { data: cs } = await db.from("campuses").select("id,name,institution_name").in("id", campusIds);
    const nameById = new Map<string, string>();
    for (const c of (cs ?? []) as { id: string; name: string | null; institution_name: string | null }[]) nameById.set(c.id, campusName(c));
    return campusIds
      .map((id) => ({ campus_id: id, name: nameById.get(id) ?? "Campus", exam_count: examCount.get(id) ?? 0, topic_count: topicsByCampus.get(id)?.size ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

/** Active + archived exams for a campus+course, each with its topic (chapter) ids. */
export const listCampusExams = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campus_id: z.string().uuid(), course_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<CampusExamRow[]> => {
    const db = await admin();
    // coverage_pct ships in 0109 (manual-apply) — degrade to the 80 default until it's applied.
    let r = await db.from("campus_exams").select("id,name,position,status,coverage_pct").eq("campus_id", data.campus_id).eq("course_id", data.course_id).order("status", { ascending: true }).order("position", { ascending: true });
    if (r.error && /coverage_pct|column/i.test(String(r.error.message ?? ""))) {
      r = await db.from("campus_exams").select("id,name,position,status").eq("campus_id", data.campus_id).eq("course_id", data.course_id).order("status", { ascending: true }).order("position", { ascending: true });
    }
    const { data: exams, error } = r;
    if (error) rethrow(error);
    const ids = (exams ?? []).map((u: { id: string }) => u.id);
    const byExam = new Map<string, string[]>();
    if (ids.length) {
      const { data: mem, error: e2 } = await db.from("campus_exam_topics").select("campus_exam_id,chapter_id,position").in("campus_exam_id", ids).order("position", { ascending: true });
      if (e2) rethrow(e2);
      for (const m of (mem ?? []) as { campus_exam_id: string; chapter_id: string }[]) { const l = byExam.get(m.campus_exam_id) ?? []; l.push(m.chapter_id); byExam.set(m.campus_exam_id, l); }
    }
    return (exams ?? []).map((u: { id: string; name: string; position: number | null; status: "active" | "archived"; coverage_pct?: number | null }) => ({ id: u.id, name: u.name, position: u.position ?? null, status: u.status, chapter_ids: byExam.get(u.id) ?? [], coverage_pct: u.coverage_pct ?? 80 }));
  });

// Mapper: set the gap-meter coverage % for a campus exam (0-100). Degrades silently if 0109 isn't
// applied yet (the column is missing) so the mapper never hard-errors.
export const setCampusExamCoverage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campus_exam_id: z.string().uuid(), coverage_pct: z.number().int().min(0).max(100) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    await db.from("campus_exams").update({ coverage_pct: data.coverage_pct }).eq("id", data.campus_exam_id);
    return { ok: true };
  });

/** Create an exam for a campus+course (appended after the last active one). Adding a campus to the
 *  Campuses folder = creating its first exam, so the campus then appears in listCourseCampuses. */
export const createCampusExam = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campus_id: z.string().uuid(), course_id: z.string().uuid(), name: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<CampusExamRow> => {
    const db = await admin();
    const { data: top, error: tErr } = await db.from("campus_exams").select("position").eq("campus_id", data.campus_id).eq("course_id", data.course_id).eq("status", "active").order("position", { ascending: false }).limit(1);
    if (tErr) rethrow(tErr);
    const next = (typeof (top?.[0] as { position: number } | undefined)?.position === "number" ? (top[0] as { position: number }).position : 0) + 1;
    const { data: ins, error } = await db.from("campus_exams").insert({ campus_id: data.campus_id, course_id: data.course_id, name: data.name.trim(), position: next, status: "active" }).select("id,name,position,status").single();
    if (error) rethrow(error);
    return { ...(ins as { id: string; name: string; position: number | null; status: "active" | "archived" }), chapter_ids: [], coverage_pct: 80 };
  });

export const renameCampusExam = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const { error } = await db.from("campus_exams").update({ name: data.name.trim() }).eq("id", data.id);
    if (error) rethrow(error);
    return { ok: true };
  });

export const setCampusExamStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["active", "archived"]) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const { error } = await db.from("campus_exams").update({ status: data.status }).eq("id", data.id);
    if (error) rethrow(error);
    return { ok: true };
  });

/** Collision-safe two-phase renumber of the given ACTIVE exams for a campus+course, 1..N in order. */
export const reorderCampusExams = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campus_id: z.string().uuid(), course_id: z.string().uuid(), ordered_ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await db.from("campus_exams").update({ position: -(i + 1) }).eq("id", data.ordered_ids[i]).eq("campus_id", data.campus_id).eq("course_id", data.course_id);
      if (error) rethrow(error);
    }
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await db.from("campus_exams").update({ position: i + 1 }).eq("id", data.ordered_ids[i]).eq("campus_id", data.campus_id).eq("course_id", data.course_id);
      if (error) rethrow(error);
    }
    return { ok: true };
  });

/** Replace an exam's topic (chapter) membership with the given ordered set (delete-all then insert). */
export const setCampusExamTopics = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campus_exam_id: z.string().uuid(), chapter_ids: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const { error: dErr } = await db.from("campus_exam_topics").delete().eq("campus_exam_id", data.campus_exam_id);
    if (dErr) rethrow(dErr);
    if (data.chapter_ids.length) {
      const rows = data.chapter_ids.map((cid, i) => ({ campus_exam_id: data.campus_exam_id, chapter_id: cid, position: i + 1 }));
      const { error: iErr } = await db.from("campus_exam_topics").insert(rows);
      if (iErr) rethrow(iErr);
    }
    return { ok: true };
  });
