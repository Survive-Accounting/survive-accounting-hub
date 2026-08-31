// Enrichment speed + feedback — the timer that records how long a campus actually takes, and the
// "what would make this faster next time?" notepad. Both feed capacity planning: the rolling average
// turns "we should enrich more" into "three campuses is an hour", and the notes surface friction from
// King and EJ that Lee would never hit.
//
// (Distinct from growth-enrichment.functions.ts, which is the data-enrichment pipeline.)
// LAW: ships to the client bundle — service-role client + admin gate imported dynamically.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type DB = { from: (t: string) => any };
const adminCtx = async (): Promise<{ db: DB; who: string }> => {
  const { assertAdmin, adminSessionOk } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const who = (await adminSessionOk())?.email ?? "admin";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as unknown as DB, who };
};

// Add a session's elapsed seconds to the campus's cumulative enrichment time (never overwrites — a
// campus is often worked across several sittings).
export const growthLogEnrichmentTime = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid(), seconds: z.number().int().min(1).max(86_400) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; total?: number; error?: string }> => {
    const { db } = await adminCtx();
    const { data: row } = await db.from("campuses").select("enrichment_seconds").eq("id", data.campusId).maybeSingle();
    const total = (row?.enrichment_seconds ?? 0) + data.seconds;
    const { error } = await db.from("campuses").update({ enrichment_seconds: total }).eq("id", data.campusId);
    return error ? { ok: false, error: error.message } : { ok: true, total };
  });

// Rolling average over campuses that have any recorded time. `campusCount` is how many that is, so
// the header can say "avg 22 min per campus" and mean it.
export const growthEnrichmentStats = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ avgSeconds: number; campusCount: number; totalSeconds: number }> => {
    const { db } = await adminCtx();
    const { data } = await db.from("campuses").select("enrichment_seconds").gt("enrichment_seconds", 0);
    const rows = (data ?? []) as { enrichment_seconds: number }[];
    const totalSeconds = rows.reduce((n, r) => n + (r.enrichment_seconds ?? 0), 0);
    const campusCount = rows.length;
    return { avgSeconds: campusCount ? Math.round(totalSeconds / campusCount) : 0, campusCount, totalSeconds };
  });

export interface EnrichmentFeedback { id: string; campusId: string | null; campusName: string | null; note: string; createdBy: string | null; createdAt: string }

export const growthAddFeedback = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid().nullable().optional(), note: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { db, who } = await adminCtx();
    const { error } = await db.from("growth_enrichment_feedback").insert({ campus_id: data.campusId ?? null, note: data.note.trim(), created_by: who });
    return error ? { ok: false, error: error.message } : { ok: true };
  });

export const growthListFeedback = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(500).default(200) }).parse(d ?? {}))
  .handler(async ({ data }): Promise<{ items: EnrichmentFeedback[] }> => {
    const { db } = await adminCtx();
    const { data: rows } = await db
      .from("growth_enrichment_feedback")
      .select("id,campus_id,note,created_by,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    const list = (rows ?? []) as any[];
    const ids = [...new Set(list.map((r) => r.campus_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 150) {
      const { data: cs } = await db.from("campuses").select("id,name,display_name").in("id", ids.slice(i, i + 150));
      for (const c of (cs ?? []) as any[]) names.set(c.id, c.display_name || c.name);
    }
    return {
      items: list.map((r) => ({ id: r.id, campusId: r.campus_id, campusName: r.campus_id ? names.get(r.campus_id) ?? null : null, note: r.note, createdBy: r.created_by, createdAt: r.created_at })),
    };
  });
