// DEFAULT MAP (server) — reads default_exam_units (0106): the campus-agnostic unit→exam ordering
// seeded from Ole Miss. The landing's Exam-1 player uses this when a campus is unmapped, so free
// content is never blocked by mapping status. Service-role read; degrades to [] if 0106 isn't
// applied (the caller falls back to the campus map / static list, never blank).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface DefaultUnitRow { unit_id: string; exam_number: number; sort_order: number | null; is_foundations: boolean }
export interface ChapterName { id: string; name: string; number: number | null }

// Chapter display names by id — authoritative, independent of course de-dup. The landing's Exam-1
// player resolves topic names through this so a duplicate/legacy course row can never leave a
// mapped chapter showing a bare "Topic". Service-role read; anon page calls it via the server fn.
export const getChapterNames = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data }): Promise<ChapterName[]> => {
    if (!data.ids.length) return [];
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as unknown as { from: (t: string) => any };
      const { data: rows, error } = await db.from("chapters").select("id,chapter_name,chapter_number").in("id", data.ids);
      if (error) return [];
      return (rows ?? []).map((r: { id: string; chapter_name: string | null; chapter_number: number | null }) => ({ id: r.id, name: (r.chapter_name ?? "").trim() || "Topic", number: r.chapter_number ?? null }));
    } catch { return []; }
  });

// Intro-1 course code per campus, for a batch of campus ids — so the landing dropdown can render a
// VERIFIED code on every school row in its FIRST payload (not lazily per selection). Reads
// campuses.course_family_codes_json.intro_1 (the same field onboarding/orders use), tolerating the
// double-encoded-string form. Only campuses whose intro_1 code is a non-empty string are returned;
// a missing/blank code yields no row, so the caller renders nothing (never a guessed placeholder).
export interface CampusIntroCode { campusId: string; code: string }
export const listCampusIntroCodes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data }): Promise<CampusIntroCode[]> => {
    if (!data.ids.length) return [];
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as unknown as { from: (t: string) => any };
      const { data: rows, error } = await db.from("campuses").select("id,course_family_codes_json").in("id", data.ids);
      if (error) return [];
      const out: CampusIntroCode[] = [];
      for (const r of (rows ?? []) as { id: string; course_family_codes_json: unknown }[]) {
        let raw: unknown = r.course_family_codes_json;
        if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = {}; } }
        const codes = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
        const code = typeof codes.intro_1 === "string" ? codes.intro_1.trim() : "";
        if (code) out.push({ campusId: r.id, code });
      }
      return out;
    } catch { return []; }
  });

// SNAPSHOT FLOW → STARTER MAP (Lee) — replaces the hand-run util SQL. Rebuilds the campus-agnostic
// STARTER MAP to mirror Ole Miss's CURRENT active exam layout (the reference campus Lee curates).
// Post-0113 the starter map IS campus_exams rows with campus_id IS NULL (edited with the same mapper
// UI as any campus); pre-0113 it falls back to rewriting default_exam_units (the legacy shape).
// `apply:false` returns a DIFF preview for the confirm dialog; `apply:true` performs a full replace
// with a manual rollback if the insert fails, so the starter map is never left empty.
const OLE_MISS_CAMPUS = "7b92a320-b196-43f2-a241-77a0805816fe";
const examNumberOf = (name: string): number => {
  const digits = (name.match(/\d+/) ?? [])[0];
  if (digits) return parseInt(digits, 10);
  return /final|review/i.test(name) ? 99 : 999;
};
export interface SnapshotDiff {
  after: DefaultUnitRow[];
  added: number; removed: number; changed: number; unchanged: number;
  perExam: { exam_number: number; topics: number }[];
  applied: boolean;
}
export const snapshotDefaultFromOleMiss = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ apply: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<SnapshotDiff> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    // 1) Ole Miss active exams + their topics
    const { data: exams, error: exErr } = await db.from("campus_exams").select("id,name,status").eq("campus_id", OLE_MISS_CAMPUS).eq("status", "active");
    if (exErr) throw new Error(exErr.message);
    const examIds = (exams ?? []).map((e: { id: string }) => e.id);
    const nameById = new Map<string, string>((exams ?? []).map((e: { id: string; name: string }) => [e.id, e.name]));
    const cet = examIds.length ? await db.from("campus_exam_topics").select("campus_exam_id,chapter_id,position").in("campus_exam_id", examIds) : { data: [] };
    // 2) collapse to one row per topic — earliest exam (then position) wins
    const best = new Map<string, { exam_number: number; sort_order: number }>();
    for (const r of (cet.data ?? []) as { campus_exam_id: string; chapter_id: string; position: number | null }[]) {
      const en = examNumberOf(nameById.get(r.campus_exam_id) ?? "");
      const so = r.position ?? 0;
      const cur = best.get(r.chapter_id);
      if (!cur || en < cur.exam_number || (en === cur.exam_number && so < cur.sort_order)) best.set(r.chapter_id, { exam_number: en, sort_order: so });
    }
    const after: DefaultUnitRow[] = [...best.entries()].map(([unit_id, v]) => ({ unit_id, exam_number: v.exam_number, sort_order: v.sort_order, is_foundations: false }))
      .sort((a, b) => a.exam_number - b.exam_number || (a.sort_order ?? 0) - (b.sort_order ?? 0));
    // 3) diff against the current default map
    const { data: beforeRows, error: bErr } = await db.from("default_exam_units").select("unit_id,exam_number,sort_order,is_foundations");
    if (bErr) throw new Error(bErr.message);
    const before = (beforeRows ?? []) as DefaultUnitRow[];
    const beforeById = new Map(before.map((r) => [r.unit_id, r]));
    const afterById = new Map(after.map((r) => [r.unit_id, r]));
    let added = 0, removed = 0, changed = 0, unchanged = 0;
    for (const r of after) { const b = beforeById.get(r.unit_id); if (!b) added++; else if (b.exam_number !== r.exam_number || (b.sort_order ?? 0) !== (r.sort_order ?? 0)) changed++; else unchanged++; }
    for (const r of before) if (!afterById.has(r.unit_id)) removed++;
    const perExam = [...new Set(after.map((r) => r.exam_number))].sort((a, b) => a - b).map((n) => ({ exam_number: n, topics: after.filter((r) => r.exam_number === n).length }));
    // 4) apply — full replace with rollback on failure (never leave the map empty)
    let applied = false;
    if (data.apply && after.length > 0) {
      const del = await db.from("default_exam_units").delete().neq("unit_id", "00000000-0000-0000-0000-000000000000");
      if (del.error) throw new Error(del.error.message);
      const ins = await db.from("default_exam_units").insert(after);
      if (ins.error) { if (before.length) await db.from("default_exam_units").insert(before); throw new Error(`Snapshot failed, rolled back: ${ins.error.message}`); }
      applied = true;

      // 4b) POST-0113: the Starter Map is real campus_exams rows (campus_id IS NULL) — rewrite them
      // to the same layout so the resolver serves the snapshot. Skipped silently pre-0113 (the
      // legacy default_exam_units rewrite above already covers the resolver's fallback path).
      try {
        const { data: courseRows } = await db.from("campus_exams").select("course_id").eq("campus_id", OLE_MISS_CAMPUS).limit(1);
        const courseId = (courseRows?.[0] as { course_id: string } | undefined)?.course_id ?? null;
        if (courseId) {
          const { data: oldStarter, error: osErr } = await db.from("campus_exams").select("id").is("campus_id", null).is("professor_id", null);
          if (osErr) throw osErr; // professor_id missing → pre-0113 → skip
          const oldIds = (oldStarter ?? []).map((r: { id: string }) => r.id);
          if (oldIds.length) {
            await db.from("campus_exam_topics").delete().in("campus_exam_id", oldIds);
            await db.from("campus_exams").delete().in("id", oldIds);
          }
          const nums = [...new Set(after.map((r) => r.exam_number))].sort((a, b) => a - b);
          for (const n of nums) {
            const { data: insEx, error: exIns } = await db.from("campus_exams").insert({ campus_id: null, professor_id: null, course_id: courseId, name: n === 99 ? "Final" : `Exam ${n}`, status: "active" }).select("id").single();
            if (exIns) throw exIns;
            const rows = after.filter((r) => r.exam_number === n).map((r, i) => ({ campus_exam_id: (insEx as { id: string }).id, chapter_id: r.unit_id, position: r.sort_order ?? i + 1 }));
            const { error: tIns } = await db.from("campus_exam_topics").insert(rows);
            if (tIns) throw tIns;
          }
        }
      } catch { /* 0113 not applied yet — starter lives in default_exam_units only */ }
    }
    return { after, added, removed, changed, unchanged, perExam, applied };
  });

export const listDefaultExamUnits = createServerFn({ method: "GET" }).handler(async (): Promise<DefaultUnitRow[]> => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const { data, error } = await db.from("default_exam_units").select("unit_id,exam_number,sort_order,is_foundations").order("exam_number", { ascending: true }).order("sort_order", { ascending: true });
    if (error) return [];
    return (data ?? []).map((r: { unit_id: string; exam_number: number; sort_order: number | null; is_foundations: boolean }) => ({ unit_id: r.unit_id, exam_number: r.exam_number, sort_order: r.sort_order ?? null, is_foundations: !!r.is_foundations }));
  } catch {
    return [];
  }
});
