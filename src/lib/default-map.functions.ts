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
