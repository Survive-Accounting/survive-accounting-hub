// VIDEO PLANS — server side (migration/supabase-migrations/20260913_1400_video_plans.sql). Now / Later /
// Skip per video in a topic's chain (components/v3/chain.ts, ChainPage.tsx). No row = undecided.
// A missing table is said by name — the chain page shows it instead of pretending nothing is decided.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "./pg-errors";

export const MISSING_VIDEO_PLANS_HINT = "run migration/supabase-migrations/20260913_1400_video_plans.sql";
export const VIDEO_STATUSES = ["now", "later", "skip"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

type DB = { from: (t: string) => any };
async function db(): Promise<DB> {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}
const failed = (e: { code?: string; message: string }) => ({ ok: false as const, error: isMissingSchema(e, /video_plans/i) ? MISSING_VIDEO_PLANS_HINT : e.message });

export interface VideoPlanRow { video_key: string; set_id: string; status: VideoStatus; note: string | null; updated_at: string }

/** Every decision, for the sets asked about. */
export const listVideoPlans = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setIds: z.array(z.string().min(1).max(200)).max(500) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; rows: VideoPlanRow[] } | { ok: false; error: string }> => {
    const d = await db();
    if (!data.setIds.length) return { ok: true, rows: [] };
    const r = await d.from("video_plans").select("video_key,set_id,status,note,updated_at").in("set_id", data.setIds);
    return r.error ? failed(r.error) : { ok: true, rows: (r.data ?? []) as VideoPlanRow[] };
  });

/** Decide (or, with status null, undecide) one video. */
export const setVideoPlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    videoKey: z.string().min(1).max(300), setId: z.string().min(1).max(200),
    status: z.enum(VIDEO_STATUSES).nullable(), note: z.string().max(500).nullable().optional(), who: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const d = await db();
    const r = data.status === null
      ? await d.from("video_plans").delete().eq("video_key", data.videoKey)
      : await d.from("video_plans").upsert({ video_key: data.videoKey, set_id: data.setId, status: data.status, note: data.note ?? null, updated_by: data.who ?? null, updated_at: new Date().toISOString() }, { onConflict: "video_key" });
    return r.error ? failed(r.error) : { ok: true };
  });
