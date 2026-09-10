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

import { normalizeCaptions, type PublishCaptions } from "./caption-brief";
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
export type SetPublishStatus = Record<PublishDestination, DestinationStatus> & {
  /** Lee's manual "this set is shot" flag (2026-09-06 audit). Null = never confirmed; the stage
   *  chip (components/v3/set-stage.ts) then falls back to the Film timer's evidence. */
  filmedAt: string | null;
  /** TALK THE CAPTION (2026-09-07, docs/USE-YOUR-WORDS-AUDIT.md §3): the per-destination title /
   *  caption / hashtags Lee talked and saved on /v3/post. Null = never written. The shape is
   *  caption-brief.ts's; a stored row is defended the same way a model answer is. */
  captions: PublishCaptions | null;
};

function rowToStatus(r: Record<string, unknown>): SetPublishStatus {
  return {
    site: { postedAt: (r.site_posted_at as string | null) ?? null, url: (r.site_url as string | null) ?? null },
    youtube: { postedAt: (r.youtube_posted_at as string | null) ?? null, url: (r.youtube_url as string | null) ?? null },
    instagram: { postedAt: (r.instagram_posted_at as string | null) ?? null, url: (r.instagram_url as string | null) ?? null },
    tiktok: { postedAt: (r.tiktok_posted_at as string | null) ?? null, url: (r.tiktok_url as string | null) ?? null },
    // A DB that ran 20260906_0200 before filmed_at existed simply has no such key on the row
    // (select("*") never errors on an absent column) — it reads as "not confirmed", never as broken.
    filmedAt: (r.filmed_at as string | null) ?? null,
    // Same story as filmed_at: a DB that hasn't run 20260907_0600 has no such key — "no
    // captions yet", never broken. A row someone hand-edited into a shape we don't know → null.
    captions: normalizeCaptions(r.captions),
  };
}

/** Every set with any publish state at all, keyed by set id. A set with no row yet (nothing
 *  clicked) simply isn't in the map — the dashboard treats "absent" the same as "all four
 *  unposted". Missing table → empty map, not an error: a brand new install has posted nothing
 *  (the table is migration/supabase-migrations/20260906_0200_set_publish_status.sql, the same
 *  file the write paths below name).
 *
 *  ANY OTHER ERROR THROWS. Until 2026-09-09 every failure here read as an empty map, which on
 *  this page means "nothing posted, nothing filmed" — a bad key or a network blip quietly
 *  emptied the queue, the one thing this dashboard exists to keep accurate. The route already
 *  has a banner for a load error (setLoadErr); this just stops hiding from it. */
export const listPublishStatuses = createServerFn({ method: "GET" }).handler(async (): Promise<Record<string, SetPublishStatus>> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const db = await publishDb();
  const { data, error } = await db.from("set_publish_status").select("*");
  if (error) {
    // The table itself absent — raw PG 42P01, its "does not exist" wording, or PostgREST's
    // schema-cache spelling of the same fact — is the one quiet case.
    if (error.code === "42P01" || /does not exist/i.test(error.message ?? "") || isMissingTable(error)) return {};
    throw new Error(`Could not load the publish queue: ${error.message}`);
  }
  const out: Record<string, SetPublishStatus> = {};
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const id = r.set_id as string;
    if (id) out[id] = rowToStatus(r);
  }
  return out;
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

/** FILMED, by hand. The 2026-09-06 audit's finding was that Post "has no idea what's actually
 *  finished"; the timer says the Film step ran, this says Lee looked and agreed (or flags a set
 *  he shot without the timer). Same upsert shape as the destination toggles. A DB that has the
 *  table but not the column (ran 20260906_0200 before filmed_at was added) gets told exactly
 *  which migration to run — the column is the only new thing. */
export const setFilmed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(160), filmed: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; status?: SetPublishStatus }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const db = await publishDb();
      const { data: row, error } = await db.from("set_publish_status")
        .upsert({ set_id: data.setId, filmed_at: data.filmed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "set_id" })
        .select("*").single();
      if (error) {
        if (isMissingTable(error)) return { ok: false, error: "Run migration/supabase-migrations/20260906_0200_set_publish_status.sql first." };
        if (isMissingSchema(error, /filmed_at/i)) return { ok: false, error: "Run migration/supabase-migrations/20260906_0500_set_publish_status_filmed.sql first (adds filmed_at)." };
        return { ok: false, error: error.message };
      }
      return { ok: true, status: rowToStatus((row ?? {}) as Record<string, unknown>) };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });

const captionShape = z.object({ title: z.string().max(200), caption: z.string().max(2000), hashtags: z.array(z.string().max(60)).max(20) });

/** TALK THE CAPTION — save (or clear, with null) the per-destination copy Lee talked on
 *  /v3/post. The map is normalized before it's stored (limits, no emoji — caption-brief.ts), so
 *  what's on the row is exactly what the sheet will show back. A DB that has the table but not
 *  the column gets told which migration to run — the column is the only new thing. */
export const setPublishCaptions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(160),
    captions: z.object({ youtube: captionShape, instagram: captionShape, tiktok: captionShape, site: captionShape }).nullable(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; status?: SetPublishStatus }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const captions = data.captions ? normalizeCaptions(data.captions) : null;
    try {
      const db = await publishDb();
      const { data: row, error } = await db.from("set_publish_status")
        .upsert({ set_id: data.setId, captions, updated_at: new Date().toISOString() }, { onConflict: "set_id" })
        .select("*").single();
      if (error) {
        if (isMissingTable(error)) return { ok: false, error: "Run migration/supabase-migrations/20260906_0200_set_publish_status.sql first." };
        if (isMissingSchema(error, /captions/i)) return { ok: false, error: "Run migration/supabase-migrations/20260907_0600_set_publish_captions.sql first (adds captions)." };
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

const rekeyMoveShape = z.object({ from: z.string().min(1).max(200), to: z.string().min(1).max(200) });

/** ROWS FOLLOW THEIR SPLIT (2026-09-10, "my Revenues split became Expenses"). The keys are
 *  positional — "<setId>", "<setId>#2", … — so a cut before a filmed split, or the wizard
 *  reordering, leaves every later row describing the wrong video. components/v3/publish-rekey.ts
 *  computes the moves; this applies them AS A SET: read every row keyed by any `from` or `to`,
 *  then write each moved row under its `to` key (every column kept, only set_id changes), then
 *  delete the `from` keys nothing moved into. Reading everything first is what makes a swap
 *  (A→B, B→A) safe — no move ever sees another move's result.
 *
 *  A `to` key that already had a row but is not itself a `from` is OVERWRITTEN by the incoming
 *  row: it was the orphan of a split that no longer exists at that seat, and the surviving
 *  split's history is the truth for that seat now. A `from` key with no row moves nothing (and
 *  counts nothing). Missing table → { moved: 0 }, the same quiet case listPublishStatuses
 *  allows: a fresh install has no rows to move. Zero moves → { moved: 0 }, never a throw.
 *  Any other DB error throws — a rekey that half-fails is a queue that lies, and the caller
 *  must hear it. Not transactional (PostgREST); the upsert runs before the delete so the worst
 *  interruption leaves a duplicate under the old key, never a lost row. */
export const rekeyPublishRows = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(160),
    moves: z.array(rekeyMoveShape).max(60),
  }).refine((v) => v.moves.every((m) => (m.from === v.setId || m.from.startsWith(`${v.setId}#`)) && (m.to === v.setId || m.to.startsWith(`${v.setId}#`))), { message: "every key must belong to setId" })
    .refine((v) => new Set(v.moves.map((m) => m.from)).size === v.moves.length && new Set(v.moves.map((m) => m.to)).size === v.moves.length, { message: "moves must not repeat a from or a to key" })
    .parse(d))
  .handler(async ({ data }): Promise<{ moved: number }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    if (!data.moves.length) return { moved: 0 };
    const db = await publishDb();
    const keys = [...new Set(data.moves.flatMap((m) => [m.from, m.to]))];
    const { data: rows, error } = await db.from("set_publish_status").select("*").in("set_id", keys);
    if (error) {
      if (error.code === "42P01" || /does not exist/i.test(error.message ?? "") || isMissingTable(error)) return { moved: 0 };
      throw new Error(`Could not read the publish rows to rekey: ${error.message}`);
    }
    const byKey = new Map<string, Record<string, unknown>>();
    for (const r of (rows ?? []) as Record<string, unknown>[]) if (typeof r.set_id === "string") byKey.set(r.set_id, r);
    const incoming: Record<string, unknown>[] = [];
    for (const m of data.moves) {
      const src = byKey.get(m.from);
      if (src) incoming.push({ ...src, set_id: m.to });
    }
    if (!incoming.length) return { moved: 0 };
    const { error: upErr } = await db.from("set_publish_status").upsert(incoming, { onConflict: "set_id" });
    if (upErr) throw new Error(`Could not rekey the publish rows: ${upErr.message}`);
    const landed = new Set(incoming.map((r) => r.set_id as string));
    const vacate = data.moves.map((m) => m.from).filter((k) => byKey.has(k) && !landed.has(k));
    if (vacate.length) {
      const { error: delErr } = await db.from("set_publish_status").delete().in("set_id", vacate);
      if (delErr) throw new Error(`Rekeyed ${incoming.length} publish rows but could not clear the old keys: ${delErr.message}`);
    }
    return { moved: incoming.length };
  });
