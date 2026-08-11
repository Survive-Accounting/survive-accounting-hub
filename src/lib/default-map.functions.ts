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
