// POST DASHBOARD — the queue's one piece of real state (src/routes/v3.post.tsx). Four
// destinations, each a manual "posted / not posted" flip plus an optional URL pasted in after
// the fact. No upload automation exists anywhere in this app (see the migration's own comment) —
// this tracks what Lee already did by hand, so the dashboard can show what's left.
//
// Deliberately its own file, NOT publish.functions.ts — that name was already taken by the
// canvas lesson-publish pipeline (Mux concat + Auphonic + student video), a completely different
// system. Naming collision caught by a clean tsc run before this ever shipped.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "./pg-errors";

const isMissingTable = (e: { code?: string; message: string }) => isMissingSchema(e, /set_publish_status/i);

// set_publish_status is new (migration/supabase-migrations/20260906_0200) and isn't in the
// generated Supabase types yet — same escape hatch as every other new table this session.
type PublishDB = { from: (t: "set_publish_status") => any };
async function publishDb(): Promise<PublishDB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as PublishDB;
}

export const PUBLISH_DESTINATIONS = ["site", "youtube", "instagram", "tiktok"] as const;
export type PublishDestination = (typeof PUBLISH_DESTINATIONS)[number];

export interface DestinationStatus { postedAt: string | null; url: string | null }
export type SetPublishStatus = Record<PublishDestination, DestinationStatus>;

function rowToStatus(r: Record<string, unknown>): SetPublishStatus {
  return {
    site: { postedAt: (r.site_posted_at as string | null) ?? null, url: (r.site_url as string | null) ?? null },
    youtube: { postedAt: (r.youtube_posted_at as string | null) ?? null, url: (r.youtube_url as string | null) ?? null },
    instagram: { postedAt: (r.instagram_posted_at as string | null) ?? null, url: (r.instagram_url as string | null) ?? null },
    tiktok: { postedAt: (r.tiktok_posted_at as string | null) ?? null, url: (r.tiktok_url as string | null) ?? null },
  };
}

/** Every set with any publish state at all, keyed by set id. A set with no row yet (nothing
 *  clicked) simply isn't in the map — the dashboard treats "absent" the same as "all four
 *  unposted". Missing table → empty map, not an error: a brand new install has posted nothing. */
export const listPublishStatuses = createServerFn({ method: "GET" }).handler(async (): Promise<Record<string, SetPublishStatus>> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  try {
    const db = await publishDb();
    const { data, error } = await db.from("set_publish_status").select("*");
    if (error) return {};
    const out: Record<string, SetPublishStatus> = {};
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const id = r.set_id as string;
      if (id) out[id] = rowToStatus(r);
    }
    return out;
  } catch { return {}; }
});

const COL: Record<PublishDestination, { at: string; url: string }> = {
  site: { at: "site_posted_at", url: "site_url" },
  youtube: { at: "youtube_posted_at", url: "youtube_url" },
  instagram: { at: "instagram_posted_at", url: "instagram_url" },
  tiktok: { at: "tiktok_posted_at", url: "tiktok_url" },
};

/** ONE CLICK: flip a destination posted or not-posted for a set. Best-effort — losing this
 *  toggle is real but must never throw up a blocking error over what is, at bottom, a checklist. */
export const togglePublishDestination = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(160), destination: z.enum(PUBLISH_DESTINATIONS), posted: z.boolean(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; status?: SetPublishStatus }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const db = await publishDb();
      const col = COL[data.destination];
      const { data: row, error } = await db.from("set_publish_status")
        .upsert({ set_id: data.setId, [col.at]: data.posted ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "set_id" })
        .select("*").single();
      if (error) {
        if (isMissingTable(error)) return { ok: false, error: "Run migration/supabase-migrations/20260906_0200_set_publish_status.sql first." };
        return { ok: false, error: error.message };
      }
      return { ok: true, status: rowToStatus((row ?? {}) as Record<string, unknown>) };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });

/** Attach or clear a reference URL for a destination — never required, pasted in after the fact. */
export const setPublishUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(160), destination: z.enum(PUBLISH_DESTINATIONS), url: z.string().trim().max(1000),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; status?: SetPublishStatus }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const db = await publishDb();
      const col = COL[data.destination];
      const { data: row, error } = await db.from("set_publish_status")
        .upsert({ set_id: data.setId, [col.url]: data.url || null, updated_at: new Date().toISOString() }, { onConflict: "set_id" })
        .select("*").single();
      if (error) return { ok: false, error: isMissingTable(error) ? "Run migration/supabase-migrations/20260906_0200_set_publish_status.sql first." : error.message };
      return { ok: true, status: rowToStatus((row ?? {}) as Record<string, unknown>) };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });
