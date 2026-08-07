// CAMPUS CHAPTER OVERRIDES (server, Prompt 3) — sparse per-campus topic order + chapter number.
// All service-role (bypass RLS). A row exists only where a campus differs from the course
// default; resolution = override ?? chapters.chapter_number/order. Fails loud naming 0103.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";

const MISSING = "campus_chapter_overrides table missing — apply migration/supabase-migrations/0103_campus_chapter_overrides.sql in the Supabase SQL editor";
function rethrow(e: { code?: string; message: string }): never {
  if (isMissingSchema(e, /campus_chapter_overrides/i)) throw new Error(MISSING);
  throw new Error(e.message);
}

export interface CampusOverrideRow { chapter_id: string; local_number: number | null; local_order: number | null }
export interface CampusOpt { id: string; name: string }

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};
const campusName = (c: { name?: string | null; institution_name?: string | null }) => (c.institution_name || c.name || "Campus").trim();

/** Overrides a campus has set for the given chapters (course-scoped by the caller's chapter set). */
export const listCampusChapterOverrides = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campus_id: z.string().uuid(), chapter_ids: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data }): Promise<CampusOverrideRow[]> => {
    if (!data.chapter_ids.length) return [];
    const db = await admin();
    const { data: rows, error } = await db.from("campus_chapter_overrides").select("chapter_id,local_number,local_order").eq("campus_id", data.campus_id).in("chapter_id", data.chapter_ids);
    if (error) rethrow(error);
    return (rows ?? []).map((r: CampusOverrideRow) => ({ chapter_id: r.chapter_id, local_number: r.local_number ?? null, local_order: r.local_order ?? null }));
  });

/** Set (upsert) or, when both values are null, CLEAR a campus's override for one chapter. */
export const setCampusChapterOverride = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campus_id: z.string().uuid(), chapter_id: z.string().uuid(), local_number: z.number().nullable(), local_order: z.number().nullable() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    if (data.local_number === null && data.local_order === null) {
      const { error } = await db.from("campus_chapter_overrides").delete().eq("campus_id", data.campus_id).eq("chapter_id", data.chapter_id);
      if (error) rethrow(error);
      return { ok: true };
    }
    const { error } = await db.from("campus_chapter_overrides").upsert({ campus_id: data.campus_id, chapter_id: data.chapter_id, local_number: data.local_number, local_order: data.local_order, updated_at: new Date().toISOString() }, { onConflict: "campus_id,chapter_id" });
    if (error) rethrow(error);
    return { ok: true };
  });

/** Reorder a campus's chapters: writes local_order 1..N for the given order, PRESERVING each
 *  chapter's existing local_number (read-merge so a renumber isn't wiped by a reorder). */
export const reorderCampusChapters = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campus_id: z.string().uuid(), ordered_chapter_ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const { data: existing, error: eErr } = await db.from("campus_chapter_overrides").select("chapter_id,local_number").eq("campus_id", data.campus_id).in("chapter_id", data.ordered_chapter_ids);
    if (eErr) rethrow(eErr);
    const numByChapter = new Map<string, number | null>();
    for (const r of (existing ?? []) as { chapter_id: string; local_number: number | null }[]) numByChapter.set(r.chapter_id, r.local_number ?? null);
    const rows = data.ordered_chapter_ids.map((cid, i) => ({ campus_id: data.campus_id, chapter_id: cid, local_number: numByChapter.get(cid) ?? null, local_order: i + 1, updated_at: new Date().toISOString() }));
    const { error } = await db.from("campus_chapter_overrides").upsert(rows, { onConflict: "campus_id,chapter_id" });
    if (error) rethrow(error);
    return { ok: true };
  });

/** Campuses that have ANY override — the only ones worth showing in the student campus picker
 *  (a campus with no overrides sees the course default, so picking it changes nothing). */
export const listOverrideCampuses = createServerFn({ method: "GET" }).handler(async (): Promise<CampusOpt[]> => {
  const db = await admin();
  const { data: ov, error } = await db.from("campus_chapter_overrides").select("campus_id");
  if (error) rethrow(error);
  const ids = [...new Set((ov ?? []).map((r: { campus_id: string }) => r.campus_id))];
  if (!ids.length) return [];
  const { data: cs } = await db.from("campuses").select("id,name,institution_name").in("id", ids);
  return (cs ?? []).map((c: { id: string; name: string | null; institution_name: string | null }) => ({ id: c.id, name: campusName(c) })).sort((a: CampusOpt, b: CampusOpt) => a.name.localeCompare(b.name));
});

/** Searchable campus lookup for the authoring picker (946 campuses — never list them all). */
export const searchCampuses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.string() }).parse(d))
  .handler(async ({ data }): Promise<CampusOpt[]> => {
    const q = data.q.replace(/[,%()*]/g, " ").trim(); // strip chars that break the PostgREST or-filter
    if (q.length < 2) return [];
    const db = await admin();
    const { data: cs, error } = await db.from("campuses").select("id,name,institution_name").or(`name.ilike.%${q}%,institution_name.ilike.%${q}%`).limit(30);
    if (error) rethrow(error);
    return (cs ?? []).map((c: { id: string; name: string | null; institution_name: string | null }) => ({ id: c.id, name: campusName(c) })).sort((a: CampusOpt, b: CampusOpt) => a.name.localeCompare(b.name));
  });
