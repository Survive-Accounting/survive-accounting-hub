// FILM STITCHES — server side (film-stitch.ts has the rules; the table is
// migration/supabase-migrations/20260915_1900_film_stitches.sql). Admin only. A missing table answers with the
// migration's name instead of an empty list, so the Stitch Room says what to run.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { MISSING_FILM_STITCHES_HINT, PAY_PER_SLIDE_CENTS, payFor, type StitchRecord } from "./film-stitch";
import { isMissingSchema } from "./pg-errors";

type DB = { from: (t: string) => any };
async function db(): Promise<{ d: DB; who: string | null }> {
  const { assertAdmin, adminSessionOk } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  // who filmed it — the tutor the pay is for (the operator's email when the session carries one)
  let who: string | null = null;
  try { const r = await adminSessionOk(); if (r?.ok) who = r.email ?? null; } catch { /* attribution only */ }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { d: supabaseAdmin as unknown as DB, who };
}
const fail = (e: { code?: string; message: string }): never => {
  throw new Error(isMissingSchema(e, /film_stitches/i) ? `The Stitch Room needs its table — ${MISSING_FILM_STITCHES_HINT}` : e.message);
};
const num = (v: unknown): number | null => (v == null ? null : Number(v));

function toRecord(r: any): StitchRecord {
  return {
    id: r.id, setId: r.set_id, takeIndex: r.take_index, name: r.name ?? "", topicKey: r.topic_key, setKey: r.set_key, setName: r.set_name, topicName: r.topic_name,
    slides: r.slides, rateCents: r.rate_cents, payCents: r.pay_cents, fingerprint: r.fingerprint ?? "", sourceUrl: r.source_url,
    durationS: num(r.duration_s), trimStartS: Number(r.trim_start_s ?? 0), trimEndS: num(r.trim_end_s), fileUrl: r.file_url,
    outroTrimS: Number(r.outro_trim_s ?? 0), socialUrl: r.social_url, endCta: r.end_cta, status: r.status, queuePos: num(r.queue_pos),
    queuedAt: r.queued_at, postedAt: r.posted_at, postedLink: r.posted_link, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export const listFilmStitches = createServerFn({ method: "GET" }).handler(async (): Promise<StitchRecord[]> => {
  const { d } = await db();
  const { data, error } = await d.from("film_stitches").select("*").order("created_at", { ascending: false }).limit(2000);
  if (error) fail(error);
  return ((data ?? []) as any[]).map(toRecord);
});

/** A FINISHED STITCH. The same video again (set + split) updates its row: the new file, trims reset, the
 *  social version cleared (it was made from the old file), paid at the new slide count, first-stitched date kept. */
export const saveFilmStitch = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({
    setId: z.string().min(1).max(200), takeIndex: z.number().int().min(0),
    name: z.string().max(300), topicKey: z.string().max(200).nullable(), setKey: z.string().max(200).nullable(), setName: z.string().max(300).nullable(), topicName: z.string().max(300).nullable(),
    slides: z.number().int().min(0).max(500), fingerprint: z.string().max(8000),
    sourceUrl: z.string().url().max(2000), durationS: z.number().min(0).nullable(), endCta: z.enum(["try", "unlock"]).nullable(),
  }).parse(x))
  .handler(async ({ data }): Promise<StitchRecord> => {
    const { d, who } = await db();
    const now = new Date().toISOString();
    const { data: prev, error: e1 } = await d.from("film_stitches").select("status").eq("set_id", data.setId).eq("take_index", data.takeIndex).maybeSingle();
    if (e1) fail(e1);
    const row = {
      set_id: data.setId, take_index: data.takeIndex, name: data.name, topic_key: data.topicKey, set_key: data.setKey, set_name: data.setName, topic_name: data.topicName,
      slides: data.slides, rate_cents: PAY_PER_SLIDE_CENTS, pay_cents: payFor(data.slides), fingerprint: data.fingerprint,
      source_url: data.sourceUrl, duration_s: data.durationS, trim_start_s: 0, trim_end_s: data.durationS, file_url: data.sourceUrl,
      outro_trim_s: 0, social_url: null, end_cta: data.endCta, updated_at: now,
      // queued stays queued (in its place); a posted video that was filmed again is a new video to post
      ...(prev?.status === "posted" ? { status: "stitched", posted_at: null, posted_link: null } : {}),
      ...(prev ? {} : { created_by: who }),
    };
    const { data: saved, error } = await d.from("film_stitches").upsert(row, { onConflict: "set_id,take_index" }).select("*").single();
    if (error) fail(error);
    return toRecord(saved);
  });

/** TRIMS and the files made from them. */
export const setFilmStitchTrim = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({
    id: z.string().uuid(), trimStartS: z.number().min(0), trimEndS: z.number().min(0).nullable(), outroTrimS: z.number().min(0).max(60),
    fileUrl: z.string().url().max(2000), socialUrl: z.string().url().max(2000).nullable(),
  }).parse(x))
  .handler(async ({ data }): Promise<StitchRecord> => {
    const { d } = await db();
    const { data: saved, error } = await d.from("film_stitches").update({
      trim_start_s: data.trimStartS, trim_end_s: data.trimEndS, outro_trim_s: data.outroTrimS, file_url: data.fileUrl, social_url: data.socialUrl, updated_at: new Date().toISOString(),
    }).eq("id", data.id).select("*").single();
    if (error) fail(error);
    return toRecord(saved);
  });

/** THE POST QUEUE: in (at the end), out, or a new order. */
export const queueFilmStitch = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({ id: z.string().uuid(), queued: z.boolean() }).parse(x))
  .handler(async ({ data }): Promise<StitchRecord> => {
    const { d } = await db();
    const now = new Date().toISOString();
    let patch: Record<string, unknown>;
    if (data.queued) {
      const { data: last, error: e1 } = await d.from("film_stitches").select("queue_pos").not("queue_pos", "is", null).order("queue_pos", { ascending: false }).limit(1);
      if (e1) fail(e1);
      patch = { status: "queued", queue_pos: (Number(last?.[0]?.queue_pos) || 0) + 1, queued_at: now, updated_at: now };
    } else {
      patch = { status: "stitched", queue_pos: null, queued_at: null, updated_at: now };
    }
    const { data: saved, error } = await d.from("film_stitches").update(patch).eq("id", data.id).neq("status", "posted").select("*").maybeSingle();
    if (error) fail(error);
    if (!saved) throw new Error("That video is already posted.");
    return toRecord(saved);
  });

export const reorderFilmStitchQueue = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(x))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { d } = await db();
    for (let i = 0; i < data.ids.length; i++) {
      const { error } = await d.from("film_stitches").update({ queue_pos: i + 1 }).eq("id", data.ids[i]).eq("status", "queued");
      if (error) fail(error);
    }
    return { ok: true };
  });

export const markFilmStitchPosted = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({ id: z.string().uuid(), link: z.string().max(2000).nullable() }).parse(x))
  .handler(async ({ data }): Promise<StitchRecord> => {
    const { d } = await db();
    const now = new Date().toISOString();
    const { data: saved, error } = await d.from("film_stitches").update({ status: "posted", posted_at: now, posted_link: data.link, queue_pos: null, updated_at: now }).eq("id", data.id).select("*").single();
    if (error) fail(error);
    return toRecord(saved);
  });
