// SHIPPED — server side. Create (Mux Direct Upload + a draft row), poll (upload → asset →
// playback id, and the generated transcript once it exists), save (title/topic/semester/notes,
// optionally publish), and the two PUBLIC reads (/shipped and /shipped/[slug]). No proxy: the
// browser PUTs the recording straight to Mux (createDirectUpload's url); nothing here ever
// touches the video bytes.
//
// MISSING TABLE: apply migration/supabase-migrations/20260905_2000_shipped.sql in the Supabase
// SQL editor before the first recording — this whole file fails loud, naming that file, until
// it has.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sanitizeNotesHtml } from "@/components/shipped/notepad-format";
import { redactForPublic, slugifyTitle, SHIPPED_TOPICS, uniqueSlug, vttToPlainText, type ShippedEntry } from "@/components/shipped/model";
import { isMissingSchema } from "@/lib/pg-errors";

const MISSING = "shipped_entries table missing — apply migration/supabase-migrations/20260905_2000_shipped.sql in the Supabase SQL editor";

type DB = { from: (t: string) => any };
async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}
// PostgREST reports a missing table two different ways (raw PG code vs. its own schema-cache
// code) — isMissingSchema (pg-errors.ts) is the one place that already knows both.
function rethrow(e: { code?: string; message: string }): never {
  if (isMissingSchema(e, /shipped_entries/i)) throw new Error(MISSING);
  throw new Error(e.message);
}
function isMissingEntries(e: { code?: string; message: string }): boolean { return isMissingSchema(e, /shipped_entries/i); }
function isMissingVotes(e: { code?: string; message: string }): boolean { return isMissingSchema(e, /shipped_topic_votes/i); }

interface Row {
  id: string; slug: string | null; title: string; topic: string | null; semester: string;
  recorded_at: string; duration_seconds: number | null;
  transcript_live: string | null; transcript_mux: string | null; transcript_source: string;
  notes_html: string | null; notes_public: boolean;
  mux_upload_id: string | null; mux_asset_id: string | null; mux_playback_id: string | null;
  video_status: string; publish_status: string; published_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}

function toEntry(r: Row): ShippedEntry {
  return {
    id: r.id, slug: r.slug, title: r.title, topic: r.topic, semester: r.semester, recordedAt: r.recorded_at,
    durationSeconds: r.duration_seconds, transcriptLive: r.transcript_live, transcriptMux: r.transcript_mux,
    transcriptSource: r.transcript_source === "mux" ? "mux" : "live",
    notesHtml: r.notes_html, notesPublic: r.notes_public,
    muxUploadId: r.mux_upload_id, muxAssetId: r.mux_asset_id, muxPlaybackId: r.mux_playback_id,
    videoStatus: (["uploading", "processing", "ready", "errored"] as const).includes(r.video_status as any) ? (r.video_status as ShippedEntry["videoStatus"]) : "uploading",
    publishStatus: r.publish_status === "published" ? "published" : "draft",
    publishedAt: r.published_at, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

async function requireAdmin(): Promise<void> {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
}

/** 1–2. Insert the draft row, THEN start the Mux Direct Upload (so the upload's passthrough can
 *  name the row) — the same order the brief lays out: save the entry, then attach Mux to it. */
export const createShippedUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    who: z.enum(["lee", "king"]),
    semester: z.string().min(1).max(40),
    topic: z.string().max(80).nullable().optional(),
    transcriptLive: z.string().max(20_000).nullable().optional(),
    notesHtml: z.string().max(20_000).nullable().optional(),
    notesPublic: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ entryId: string; uploadUrl: string }> => {
    await requireAdmin();
    const db = await admin();
    const now = new Date().toISOString();
    const { data: row, error } = await db.from("shipped_entries").insert({
      semester: data.semester.trim(), topic: data.topic?.trim() || null,
      transcript_live: data.transcriptLive?.trim() || null,
      notes_html: data.notesHtml ? sanitizeNotesHtml(data.notesHtml) : null,
      notes_public: data.notesPublic ?? false,
      created_by: data.who, recorded_at: now, video_status: "uploading", publish_status: "draft",
    }).select("id").single();
    if (error) rethrow(error);
    const id = row.id as string;

    const { createDirectUpload } = await import("@/lib/mux.server");
    let upload: { id: string; url?: string };
    try {
      upload = await createDirectUpload({ passthrough: `SHIPPED-${id}`, playbackPolicy: "public" });
    } catch (e) {
      await db.from("shipped_entries").update({ video_status: "errored", updated_at: new Date().toISOString() }).eq("id", id);
      throw new Error(`Mux would not start the upload: ${e instanceof Error ? e.message : String(e)}. Your recording is kept locally — try again.`);
    }
    if (!upload.url) throw new Error("Mux did not return an upload URL.");
    const { error: uErr } = await db.from("shipped_entries").update({ mux_upload_id: upload.id, updated_at: new Date().toISOString() }).eq("id", id);
    if (uErr) rethrow(uErr);
    return { entryId: id, uploadUrl: upload.url };
  });

/** 3+. Poll: upload → asset → playback id, and the generated transcript once the asset is
 *  ready and we don't already have one. Safe to call repeatedly — a ready/errored row is a
 *  no-op read. */
export const resolveShippedUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ entryId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ShippedEntry> => {
    await requireAdmin();
    const db = await admin();
    const { data: rowRaw, error } = await db.from("shipped_entries").select("*").eq("id", data.entryId).single();
    if (error) rethrow(error);
    const row = rowRaw as Row;
    if (row.video_status === "ready" || row.video_status === "errored") return toEntry(row);

    const { getAsset, getGeneratedTranscriptVtt, getUpload } = await import("@/lib/mux.server");
    let assetId = row.mux_asset_id;
    if (!assetId && row.mux_upload_id) {
      const upload = await getUpload(row.mux_upload_id);
      if (upload.status === "errored" || upload.status === "cancelled" || upload.status === "timed_out") {
        const { data: upd } = await db.from("shipped_entries").update({ video_status: "errored", updated_at: new Date().toISOString() }).eq("id", row.id).select("*").single();
        return toEntry((upd ?? { ...row, video_status: "errored" }) as Row);
      }
      assetId = upload.asset_id ?? null;
      if (!assetId) return toEntry(row); // the PUT is still in flight
      await db.from("shipped_entries").update({ mux_asset_id: assetId, updated_at: new Date().toISOString() }).eq("id", row.id);
    }
    if (!assetId) return toEntry(row);

    const asset = await getAsset(assetId);
    const playbackId = asset.playback_ids?.find((p) => p.policy === "public")?.id ?? asset.playback_ids?.[0]?.id ?? null;
    const status = asset.status === "ready" ? "ready" : asset.status === "errored" ? "errored" : "processing";
    const patch: Record<string, unknown> = { mux_playback_id: playbackId, video_status: status, updated_at: new Date().toISOString() };
    if (typeof asset.duration === "number") patch.duration_seconds = asset.duration;
    // THE AUTHORITATIVE TRANSCRIPT (brief §3): once Mux has generated one, it replaces the
    // live browser draft — never the other way around, and the live draft is kept regardless.
    if (status === "ready" && !row.transcript_mux && playbackId) {
      try {
        const vtt = await getGeneratedTranscriptVtt(playbackId, asset.tracks);
        if (vtt) { patch.transcript_mux = vttToPlainText(vtt); patch.transcript_source = "mux"; }
      } catch { /* the live draft still covers the entry until the next poll */ }
    }
    const { data: upd, error: uErr } = await db.from("shipped_entries").update(patch).eq("id", row.id).select("*").single();
    if (uErr) rethrow(uErr);
    return toEntry(upd as Row);
  });

/** THE CONFIRMATION SCREEN's one call: title/topic/semester/notes, and — with `publish: true` —
 *  a slug and publish_status in the same write. A title is required to publish, never to save
 *  a draft. */
export const saveShippedEntry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    title: z.string().max(200).default(""),
    topic: z.string().max(80).nullable().optional(),
    semester: z.string().min(1).max(40),
    notesHtml: z.string().max(20_000).nullable().optional(),
    notesPublic: z.boolean().optional(),
    publish: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data }): Promise<{ entry: ShippedEntry }> => {
    await requireAdmin();
    if (data.publish && !data.title.trim()) throw new Error("Give it a title before publishing.");
    const db = await admin();
    const patch: Record<string, unknown> = {
      title: data.title.trim(), topic: data.topic?.trim() || null, semester: data.semester.trim(),
      updated_at: new Date().toISOString(),
    };
    if (data.notesHtml !== undefined) patch.notes_html = data.notesHtml ? sanitizeNotesHtml(data.notesHtml) : null;
    if (data.notesPublic !== undefined) patch.notes_public = data.notesPublic;
    if (data.publish) {
      const { data: cur, error: cErr } = await db.from("shipped_entries").select("slug").eq("id", data.id).single();
      if (cErr) rethrow(cErr);
      if (!cur.slug) {
        const { data: existing } = await db.from("shipped_entries").select("slug").not("slug", "is", null);
        const taken = ((existing ?? []) as { slug: string }[]).map((r) => r.slug);
        patch.slug = uniqueSlug(slugifyTitle(data.title), taken);
      }
      patch.publish_status = "published";
      patch.published_at = new Date().toISOString();
    }
    const { data: row, error } = await db.from("shipped_entries").update(patch).eq("id", data.id).select("*").single();
    if (error) rethrow(error);
    return { entry: toEntry(row as Row) };
  });

/** The drafts strip on /shipped shows an admin their own unfinished entries — everyone's, since
 *  it's just Lee and King and neither needs privacy from the other here. */
export const listShippedDrafts = createServerFn({ method: "GET" }).handler(async (): Promise<{ entries: ShippedEntry[] }> => {
  await requireAdmin();
  const db = await admin();
  const { data, error } = await db.from("shipped_entries").select("*").eq("publish_status", "draft").order("created_at", { ascending: false }).limit(50);
  if (error) { if (isMissingEntries(error)) return { entries: [] }; rethrow(error); }
  return { entries: (data as Row[]).map(toEntry) };
});

/** PUBLIC — /shipped's feed. Published only, newest first. Notes are redacted per-entry
 *  (private unless Lee marked them public); the internal Mux plumbing never leaves the server. */
export const listShippedPublic = createServerFn({ method: "GET" }).handler(async (): Promise<{ entries: ShippedEntry[] }> => {
  const db = await admin();
  const { data, error } = await db.from("shipped_entries").select("*").eq("publish_status", "published").order("recorded_at", { ascending: false }).limit(200);
  if (error) { if (isMissingEntries(error)) return { entries: [] }; rethrow(error); }
  return { entries: (data as Row[]).map(toEntry).map(redactForPublic) };
});

/** PUBLIC — one entry, /shipped/[slug]. Null (not a 404 here) when the slug is unknown or the
 *  entry isn't published — the route decides how to say "not found". */
export const getShippedBySlug = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ entry: ShippedEntry | null }> => {
    const db = await admin();
    const { data: row, error } = await db.from("shipped_entries").select("*").eq("slug", data.slug).eq("publish_status", "published").maybeSingle();
    if (error) { if (isMissingEntries(error)) return { entry: null }; rethrow(error); }
    return { entry: row ? redactForPublic(toEntry(row as Row)) : null };
  });

// ---------------------------------------------------- "what should I build next?"

/** PUBLIC, no admin gate — a visitor's own click. One shared tally per topic (never per
 *  video); the client remembers its own vote in localStorage so one browser can't inflate a
 *  count, which is the whole of this feature's abuse resistance (Lee: "a simple feedback
 *  interaction is enough" — not a system that needs defending). */
export const voteShippedTopic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ topic: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (!(SHIPPED_TOPICS as readonly string[]).includes(data.topic)) throw new Error("Not a topic on the list.");
    const db = await admin();
    const { data: existing } = await db.from("shipped_topic_votes").select("votes").eq("topic", data.topic).maybeSingle();
    const votes = ((existing?.votes as number | undefined) ?? 0) + 1;
    const { error } = await db.from("shipped_topic_votes").upsert({ topic: data.topic, votes, updated_at: new Date().toISOString() }, { onConflict: "topic" });
    if (error && !isMissingVotes(error)) throw new Error(error.message); // the table missing just means no tally shows yet
    return { ok: true };
  });

export const listShippedTopicVotes = createServerFn({ method: "GET" }).handler(async (): Promise<{ votes: Record<string, number> }> => {
  const db = await admin();
  const { data, error } = await db.from("shipped_topic_votes").select("topic,votes");
  if (error) { if (isMissingVotes(error)) return { votes: {} }; throw new Error(error.message); }
  const votes: Record<string, number> = {};
  for (const r of (data ?? []) as { topic: string; votes: number }[]) votes[r.topic] = r.votes;
  return { votes };
});
