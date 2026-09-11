// LEARN EVENTS — the write side of the daily pulse (2026-09-11). See migration
// 20260911_2100_learn_events.sql for what a row is. The /learn page batches a handful of events
// (a visit, video starts, 15-30s slices of watch and page time) and posts them here; nothing a
// student does ever waits on this, and a failure is logged, never shown.
//
// LAW: ships to the client bundle — the service-role client is imported dynamically.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const LEARN_EVENT_KINDS = ["page_visit", "video_start", "watch_time", "page_time", "practice_answer"] as const;
export type LearnEventKind = (typeof LEARN_EVENT_KINDS)[number];

const Event = z.object({
  kind: z.enum(LEARN_EVENT_KINDS),
  campusId: z.string().uuid().nullable().optional(),
  campusSlug: z.string().trim().max(80).nullable().optional(),
  chapterSlug: z.string().trim().max(80).nullable().optional(),
  anonId: z.string().trim().max(64).nullable().optional(),
  sessionId: z.string().trim().max(64).nullable().optional(),
  setId: z.string().trim().max(120).nullable().optional(),
  partKey: z.string().trim().max(140).nullable().optional(),
  seconds: z.number().int().min(0).max(3600).nullable().optional(),
  ref: z.string().trim().max(64).nullable().optional(),
  isTest: z.boolean().optional(),
});
export type LearnEvent = z.infer<typeof Event>;

const MISSING = "learn_events is missing — run migration 20260911_2100_learn_events.sql (the daily pulse has nothing to read until then).";

export const recordLearnEvents = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ events: z.array(Event).min(1).max(50) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as unknown as { from: (t: string) => any };
      const rows = data.events.map((e) => ({
        kind: e.kind,
        campus_id: e.campusId ?? null,
        campus_slug: e.campusSlug ?? null,
        chapter_slug: e.chapterSlug ?? null,
        anon_id: e.anonId ?? null,
        session_id: e.sessionId ?? null,
        set_id: e.setId ?? null,
        part_key: e.partKey ?? null,
        seconds: e.seconds ?? null,
        ref: e.ref ?? null,
        is_test: !!e.isTest,
      }));
      const { error } = await db.from("learn_events").insert(rows);
      if (error) {
        // FAIL LOUD in the log — a pulse that silently records nothing is exactly the invisible
        // breakage the house rules forbid — but never on the student's screen.
        console.warn(/learn_events/.test(error.message) && /not (exist|find)|schema cache/i.test(error.message) ? MISSING : `learn_events insert failed: ${error.message}`);
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (e) {
      console.warn("recordLearnEvents failed:", (e as Error).message);
      return { ok: false, error: (e as Error).message };
    }
  });
