// Server functions for BEAT-LEVEL SEGMENTS (PROMPT 4). A take's aligned cut
// boundaries become per-beat segments (frame_segments, migration 0098). Keeper
// marking is per (frame_id, beat_index) and may point at a different take of the
// same frame (the punch-in). Same infra as the other canvas fns: service-role,
// POST, fail-loud when 0098 isn't applied.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";

const MISSING_TABLE =
  "frame_segments table missing — apply migration/supabase-migrations/0098_frame_segments.sql in the Supabase SQL editor";

function rethrow(error: { code?: string; message: string }): never {
  if (isMissingSchema(error, /frame_segments/i)) throw new Error(MISSING_TABLE);
  throw new Error(error.message);
}

const tbl = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return () => supabaseAdmin.from("frame_segments" as never) as any;
};

export interface FrameSegmentRow {
  id: string;
  take_id: string;
  frame_id: string;
  beat_index: number;
  start_s: number;
  end_s: number;
  keeper: boolean;
  created_at: string;
}

/** All segments for the given frames (across every take), earliest beat first. */
export const listFrameSegments = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ frameIds: z.array(z.string().min(1)).max(500) }).parse(d))
  .handler(async ({ data }): Promise<FrameSegmentRow[]> => {
    if (data.frameIds.length === 0) return [];
    const t = await tbl();
    const { data: rows, error } = await t().select("*").in("frame_id", data.frameIds).order("beat_index", { ascending: true });
    if (error) rethrow(error);
    return (rows ?? []) as FrameSegmentRow[];
  });

const segSchema = z.object({ beatIndex: z.number().int().min(0), start: z.number().nonnegative(), end: z.number().positive() });

/** REPLACE a take's segments with the aligned set (delete + insert). Called after
 *  alignment/nudge in the take review. Does NOT touch keeper flags on OTHER takes. */
export const saveTakeSegments = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    takeId: z.string().uuid(),
    frameId: z.string().min(1).max(120),
    segments: z.array(segSchema).max(64),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; count: number }> => {
    const t = await tbl();
    const { error: delErr } = await t().delete().eq("take_id", data.takeId);
    if (delErr) rethrow(delErr);
    if (data.segments.length) {
      const rows = data.segments.map((s) => ({ take_id: data.takeId, frame_id: data.frameId, beat_index: s.beatIndex, start_s: s.start, end_s: s.end, keeper: false }));
      const { error } = await t().insert(rows);
      if (error) rethrow(error);
    }
    return { ok: true, count: data.segments.length };
  });

/** Mark ONE segment the keeper for its (frame, beat) — clearing any prior keeper
 *  for that beat (which may be on a different take). Empty segmentId clears it. */
export const setSegmentKeeper = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ segmentId: z.string().uuid(), keeper: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const t = await tbl();
    const { data: seg, error } = await t().select("frame_id,beat_index").eq("id", data.segmentId).single();
    if (error) rethrow(error);
    if (data.keeper) {
      // clear the beat's prior keeper (any take), then set this one
      const { error: clr } = await t().update({ keeper: false }).eq("frame_id", seg.frame_id).eq("beat_index", seg.beat_index);
      if (clr) rethrow(clr);
    }
    const { error: setErr } = await t().update({ keeper: data.keeper }).eq("id", data.segmentId);
    if (setErr) rethrow(setErr);
    return { ok: true };
  });

/** KEEP ALL (the clean-take one-click): every segment of a take becomes its beat's
 *  keeper, clearing conflicting keepers on other takes of the same frame first. */
export const keepAllSegments = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ takeId: z.string().uuid(), frameId: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; count: number }> => {
    const t = await tbl();
    const { data: mine, error } = await t().select("id,beat_index").eq("take_id", data.takeId);
    if (error) rethrow(error);
    const beats = (mine ?? []).map((r: { beat_index: number }) => r.beat_index);
    if (beats.length) {
      // clear every keeper for this frame's affected beats (across all takes)
      const { error: clr } = await t().update({ keeper: false }).eq("frame_id", data.frameId).in("beat_index", beats);
      if (clr) rethrow(clr);
    }
    const { error: setErr } = await t().update({ keeper: true }).eq("take_id", data.takeId);
    if (setErr) rethrow(setErr);
    return { ok: true, count: beats.length };
  });
