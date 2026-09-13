// THE FRAME LEDGER — server side (tables: migration/supabase-migrations/20260913_1000_frame_learning_loop.sql).
//
// Lee, Studio prompt 2, with his four decisions: filmed = when a take containing the frame is
// posted; abandoned = F3 on /film plus what he says; keep ceq_edit_log and mirror; baseline run.
//
// Best-effort by contract, like the edit log: a lost event is real signal lost, but never worth
// failing a save, a delete or a post Lee already made — the UI fires and forgets, and a failure is
// a console line naming the cause. A missing table is reported by name, never swallowed.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { FRAME_EVENT_KINDS, FRAME_EVENT_SOURCES, scrapFromRow, type ScrapMark } from "@/components/blastoff/frame-events";
import { isMissingSchema } from "./pg-errors";

export const MISSING_LEDGER_HINT = "run migration/supabase-migrations/20260913_1000_frame_learning_loop.sql";
const isMissingLedger = (e: { code?: string; message: string }) => isMissingSchema(e, /frame_events|frame_generations|generated_frames/i);

type DB = { from: (t: string) => any };
async function ledgerDb(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}
async function gate(): Promise<void> {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
}
function fail(where: string, error: { code?: string; message: string }): { ok: false; error: string } {
  if (isMissingLedger(error)) { console.warn(`[frame-ledger] ${where} not recorded — ${MISSING_LEDGER_HINT}`); return { ok: false, error: MISSING_LEDGER_HINT }; }
  console.warn(`[frame-ledger] ${where} failed:`, error.message);
  return { ok: false, error: error.message };
}

const eventSchema = z.object({
  frameId: z.string().min(1).max(200),
  setId: z.string().min(1).max(200),
  event: z.enum(FRAME_EVENT_KINDS),
  generatedFrameId: z.string().uuid().nullable().optional(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  source: z.enum(FRAME_EVENT_SOURCES).nullable().optional(),
  takeRef: z.string().max(300).nullable().optional(),
  takeOffsetMs: z.number().int().min(0).nullable().optional(),
  reason: z.string().max(2000).nullable().optional(),
});

/** Append events. The table's own checks (an edit needs both sides, a deletion its frame, a scrap
 *  its reason) are the real guard; this just shapes the rows. */
export const logFrameEvents = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ events: z.array(eventSchema).min(1).max(200), who: z.string().max(40).nullable().optional() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await gate();
    try {
      const db = await ledgerDb();
      const { error } = await db.from("frame_events").insert(data.events.map((e) => ({
        frame_id: e.frameId, set_id: e.setId, event: e.event, generated_frame_id: e.generatedFrameId ?? null,
        before: e.before ?? null, after: e.after ?? null, source: e.source ?? null,
        take_ref: e.takeRef ?? null, take_offset_ms: e.takeOffsetMs ?? null, reason: e.reason ?? null,
        created_by: data.who ?? null,
      })));
      return error ? fail("events", error) : { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[frame-ledger] events threw:", msg);
      return { ok: false, error: msg };
    }
  });

/** A PROPOSAL, KEPT (the split run, 2026-09-13). Written the moment a proposal comes back, as a
 *  draft: its frames have no frame_id, so nothing about it can reach the topic's frame record until
 *  it is built. Versioned per scope_key — a re-run is the next version, never an overwrite. */
export const recordDraftGeneration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(200),
    topicId: z.string().max(200).nullable().optional(),
    scopeKey: z.string().min(1).max(300),
    /** A re-split of one candidate points at the pass it split. */
    parentGenerationId: z.string().uuid().nullable().optional(),
    generator: z.enum(["split_run", "slide_text", "strategy_short", "draft_pass"]),
    reelCount: z.number().int().min(0).nullable().optional(),
    model: z.string().max(120).nullable().optional(),
    promptVersion: z.string().max(120).nullable().optional(),
    input: z.unknown(),
    output: z.unknown(),
    slots: z.array(z.object({ key: z.string().min(1).max(40), reelIndex: z.number().int().min(0).nullable(), position: z.number().int().min(0), kind: z.string().max(40), generated: z.unknown() })).max(120),
    who: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; generationId: string; version: number; slotIds: Record<string, string> } | { ok: false; error: string }> => {
    await gate();
    const db = await ledgerDb();
    // The next version for this scope. A race between two proposals on the same Reel loses to the
    // unique (scope_key, version) constraint and is retried once with a fresh read.
    for (let attempt = 0; attempt < 2; attempt++) {
      const last = await db.from("frame_generations").select("version").eq("scope_key", data.scopeKey).order("version", { ascending: false }).limit(1);
      if (last.error) return fail("generation (version read)", last.error);
      const version = ((last.data?.[0]?.version as number | undefined) ?? 0) + 1;
      const gen = await db.from("frame_generations").insert({
        set_id: data.setId, topic_id: data.topicId ?? null, scope_key: data.scopeKey, version, parent_generation_id: data.parentGenerationId ?? null,
        generator: data.generator, status: "draft", frame_count: data.slots.length, reel_count: data.reelCount ?? null,
        model: data.model ?? null, prompt_version: data.promptVersion ?? null,
        input: data.input ?? {}, output: data.output ?? {}, created_by: data.who ?? null,
      }).select("id").single();
      if (gen.error) {
        if (/duplicate key|unique/i.test(gen.error.message) && attempt === 0) continue;
        return fail("generation", gen.error);
      }
      const generationId = gen.data.id as string;
      if (!data.slots.length) return { ok: true, generationId, version, slotIds: {} };
      const rows = await db.from("generated_frames").insert(data.slots.map((s) => ({
        generation_id: generationId, reel_index: s.reelIndex, position: s.position, kind: s.kind, generated: s.generated ?? {},
      }))).select("id,reel_index,position");
      if (rows.error) return fail("generated frames", rows.error);
      const byPos = new Map((rows.data as { id: string; reel_index: number | null; position: number }[]).map((r) => [`${r.reel_index ?? -1}:${r.position}`, r.id]));
      const slotIds: Record<string, string> = {};
      for (const s of data.slots) { const id = byPos.get(`${s.reelIndex ?? -1}:${s.position}`); if (id) slotIds[s.key] = id; }
      return { ok: true, generationId, version, slotIds };
    }
    return { ok: false, error: "the generation version kept colliding" };
  });

/** BUILT. The draft becomes the built set: status and built_at on the run, each built frame's id on
 *  its generated row, a `built` event per frame — and an `edited` event (source split_run) for any
 *  frame Lee changed in the panel before building, which is style signal too. */
export const markGenerationBuilt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    generationId: z.string().uuid(),
    setId: z.string().min(1).max(200),
    links: z.array(z.object({ generatedId: z.string().uuid(), frameId: z.string().min(1).max(200), edited: z.object({ before: z.unknown(), after: z.unknown() }).nullable().optional() })).max(120),
    who: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await gate();
    try {
      const db = await ledgerDb();
      const up = await db.from("frame_generations").update({ status: "built", built_at: new Date().toISOString() }).eq("id", data.generationId);
      if (up.error) return fail("generation built", up.error);
      for (const l of data.links) {
        const r = await db.from("generated_frames").update({ frame_id: l.frameId }).eq("id", l.generatedId);
        if (r.error) return fail("generated frame link", r.error);
      }
      if (data.links.length) {
        const events = data.links.flatMap((l) => [
          { frame_id: l.frameId, set_id: data.setId, generated_frame_id: l.generatedId, event: "built", source: "split_run", after: null, created_by: data.who ?? null },
          ...(l.edited ? [{ frame_id: l.frameId, set_id: data.setId, generated_frame_id: l.generatedId, event: "edited", source: "split_run", before: l.edited.before, after: l.edited.after, created_by: data.who ?? null }] : []),
        ]);
        const ev = await db.from("frame_events").insert(events);
        if (ev.error) return fail("built events", ev.error);
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[frame-ledger] built threw:", msg);
      return { ok: false, error: msg };
    }
  });

/** A DRAFT THAT WASN'T BUILT (Studio prompt 3): "Propose again" supersedes the passes it replaces,
 *  closing the panel without building discards them. Only drafts move — a built run is history. */
export const setGenerationStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(50), status: z.enum(["superseded", "discarded"]) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await gate();
    try {
      const db = await ledgerDb();
      const r = await db.from("frame_generations").update({ status: data.status }).in("id", data.ids).eq("status", "draft");
      return r.error ? fail(`generation ${data.status}`, r.error) : { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[frame-ledger] status threw:", msg);
      return { ok: false, error: msg };
    }
  });

/** THE SCRAPS FOR A SET — every take_abandoned mark made while recording, newest first, for Post's
 *  cut list. Rehearsal scraps (nothing recording) carry no times and aren't cuts, so they stay out. */
export const listScrapMarks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; marks: ScrapMark[] } | { ok: false; error: string }> => {
    await gate();
    const db = await ledgerDb();
    const r = await db.from("frame_events").select("frame_id,take_ref,reason,after,created_at").eq("set_id", data.setId).eq("event", "take_abandoned").order("created_at", { ascending: false }).limit(300);
    if (r.error) return fail("scrap list", r.error);
    const marks = ((r.data ?? []) as Parameters<typeof scrapFromRow>[0][]).map(scrapFromRow).filter((m): m is ScrapMark => m !== null);
    return { ok: true, marks };
  });
