// PUBLISH PIPELINE (server) — "Publish lesson", takes → student video, one button.
//
// STAGES (the client polls resolveLessonPublish, which advances one step per call):
//   concat     — Mux stitches the keeper takes (multi-input asset) into the BODY.
//                Vercel can't run ffmpeg, so Mux's native multi-input concat does
//                the "same-source, instant, no editor" job; a resolution-drift
//                pre-check catches OBS-settings drift before we spend the render.
//   uploading  — body ready → an Auphonic production is created with the BODY plus
//                the lesson's INTRO take and the shared OUTRO sting. Auphonic
//                loudness-matches intro/outro to the body WITHOUT reprocessing them
//                (filler/silence cutters OFF), so the radio effect survives.
//   processing — Auphonic renders (loudness + intro/outro + video).
//   finalizing — Auphonic done → its result is ingested into the FINAL Mux asset.
//   ready      — final asset has a playback id; the student dashboard plays it.
//
// FAIL LOUD: missing AUPHONIC_API_KEY / AUPHONIC_PRESET_UUID / MUX_TOKEN_* /
// OUTRO_STING_URL surfaces as a thrown error the take board renders as a banner —
// never a silent no-op. Re-publish bumps `version`, keeps priors, points at newest.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";

const MISSING_TABLE =
  "lesson_videos table missing — apply migration/supabase-migrations/0095_lesson_videos.sql in the Supabase SQL editor";

function rethrow(error: { code?: string; message: string }): never {
  if (isMissingSchema(error, /lesson_videos/i)) throw new Error(MISSING_TABLE);
  throw new Error(error.message);
}

// ---- env gates (fail loud, naming the missing var) --------------------------
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Publish not configured — set ${name} in Vercel env.`);
  return v;
}
function muxAuth(): string {
  const id = process.env.MUX_TOKEN_ID;
  const secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) throw new Error("Publish not configured — set MUX_TOKEN_ID + MUX_TOKEN_SECRET in Vercel env.");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

// ---- thin API clients -------------------------------------------------------
async function muxApi(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`https://api.mux.com${path}`, {
    ...init,
    headers: { Authorization: muxAuth(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mux ${path} → ${res.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  return body?.data;
}
async function auphonic(path: string, init?: RequestInit): Promise<any> {
  const key = requireEnv("AUPHONIC_API_KEY");
  const res = await fetch(`https://auphonic.com/api/${path}`, {
    ...init,
    headers: { Authorization: `bearer ${key}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Auphonic ${path} → ${res.status}: ${JSON.stringify(body?.error_message ?? body?.form_errors ?? body).slice(0, 300)}`);
  return body?.data;
}

/** Public static-MP4 URL for a Mux playback id (assets ship mp4_support:standard). */
const muxMp4 = (playbackId: string) => `https://stream.mux.com/${playbackId}/high.mp4`;

// ---- row shape --------------------------------------------------------------
export interface LessonVideoRow {
  id: string;
  lesson_id: string;
  version: number;
  stage: "concat" | "uploading" | "processing" | "finalizing" | "ready" | "errored";
  error: string | null;
  course_name: string | null;
  lesson_label: string | null;
  passthrough: string | null;
  mux_body_asset_id: string | null;
  mux_body_playback_id: string | null;
  intro_playback_id: string | null;
  trimmed_intro_asset_id: string | null;
  trimmed_intro_playback_id: string | null;
  outro_playback_id: string | null;
  auphonic_uuid: string | null;
  mux_asset_id: string | null;
  playback_id: string | null;
  created_at: string;
  updated_at: string;
}

const tbl = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return () => supabaseAdmin.from("lesson_videos" as never) as any;
};

// PROMPT 4: a body item may be a per-beat SEGMENT — a sub-clip window into the
// keeper take (Mux multi-input concat accepts per-input start_time/end_time, so
// segments assemble with no ffmpeg; video stays a hard cut). Absent start/end =
// the whole keeper take (the pre-segment behaviour, unchanged).
const keeperSchema = z.object({
  frameId: z.string(),
  playbackId: z.string().min(6),
  dim: z.object({ w: z.number(), h: z.number() }).nullable().optional(),
  start: z.number().nonnegative().optional(),
  end: z.number().positive().optional(),
});
// the intro can carry a TRIM window (from the auto-trim); publish realizes it via
// a Mux ingest-trim so Auphonic gets the trimmed intro.
const introSchema = keeperSchema.extend({ trim: z.object({ start: z.number(), length: z.number() }).nullable().optional() });

// ---- PUBLISH ----------------------------------------------------------------
// The client has already ordered the body keepers (publish-pipeline) and confirmed
// none are missing; this creates the Mux body concat + the pipeline row.
export const publishLesson = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      lessonId: z.string().min(1).max(120),
      courseName: z.string().nullable(),
      lessonLabel: z.string().nullable(),
      intro: introSchema.nullable(), // the intro clip (lesson upload or Hook f1), maybe trimmed
      outro: z.object({ playbackId: z.string().min(6) }).nullable().optional(), // lesson outro clip
      body: z.array(keeperSchema).min(1), // ordered body keepers
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ publishId: string; version: number }> => {
    // env gates first — fail loud before any DB / API work. The OUTRO is a lesson
    // upload now (OUTRO_STING_URL is only a fallback), so it's not required here.
    muxAuth();
    requireEnv("AUPHONIC_API_KEY");
    requireEnv("AUPHONIC_PRESET_UUID"); // the "Survive Lesson" preset's uuid

    // resolution-drift guard (OBS settings must not change mid-lesson)
    const dims = [data.intro?.dim, ...data.body.map((b) => b.dim)].filter(Boolean) as { w: number; h: number }[];
    const set = [...new Set(dims.map((d) => `${d.w}x${d.h}`))];
    if (set.length > 1) throw new Error(`Keeper takes have different video settings (${set.join(", ")}) — re-film the odd one so every take matches before publishing.`);

    const t = await tbl();
    const { data: prior, error: qErr } = await t().select("version").eq("lesson_id", data.lessonId).order("version", { ascending: false }).limit(1);
    if (qErr) rethrow(qErr);
    const version = ((prior?.[0]?.version as number | undefined) ?? 0) + 1;

    const { courseCode, lessonCode } = await import("@/components/canvas/take-naming");
    const passthrough = `${courseCode(data.courseName)}-${lessonCode(data.lessonLabel)}-v${version}`;

    // BODY = Mux multi-input concat of the keeper takes/segments, in order.
    // PROMPT 4: when a body item carries start/end it is a per-beat SEGMENT — the
    // Mux input gets start_time/end_time so the sub-clip assembles with no ffmpeg
    // (video hard cut). Auphonic still receives ONE continuous body file.
    const bodyAsset = await muxApi("/video/v1/assets", {
      method: "POST",
      body: JSON.stringify({
        input: data.body.map((b) =>
          b.start != null && b.end != null
            ? { url: muxMp4(b.playbackId), start_time: b.start, end_time: b.end }
            : { url: muxMp4(b.playbackId) },
        ),
        playback_policy: ["public"],
        mp4_support: "standard",
        passthrough: `${passthrough}-body`,
      }),
    });

    // TRIMMED INTRO (auto-trim): a Mux ingest-trim of the raw intro take, so
    // Auphonic gets the intro cut to the music's real length. Absent trim → the
    // raw intro is used as-is (via intro_playback_id).
    let trimmedIntroAssetId: string | null = null;
    if (data.intro?.trim) {
      const ti = await muxApi("/video/v1/assets", {
        method: "POST",
        body: JSON.stringify({
          input: [{ url: muxMp4(data.intro.playbackId), start_time: data.intro.trim.start, end_time: data.intro.trim.start + data.intro.trim.length }],
          playback_policy: ["public"],
          mp4_support: "standard",
          passthrough: `${passthrough}-intro`,
        }),
      });
      trimmedIntroAssetId = ti.id;
    }

    // Persist intro on the row so RESOLVE is stateless.
    const { data: row, error: insErr } = await t()
      .insert({
        lesson_id: data.lessonId,
        version,
        stage: "concat",
        course_name: data.courseName,
        lesson_label: data.lessonLabel,
        passthrough,
        mux_body_asset_id: bodyAsset.id,
        intro_playback_id: data.intro?.playbackId ?? null,
        trimmed_intro_asset_id: trimmedIntroAssetId,
        outro_playback_id: data.outro?.playbackId ?? null,
      } as Record<string, unknown>)
      .select("id")
      .single();
    if (insErr) rethrow(insErr);

    return { publishId: row.id as string, version };
  });

// ---- RESOLVE (staged poll) --------------------------------------------------
export const resolveLessonPublish = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ publishId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<LessonVideoRow> => {
    const t = await tbl();
    const { data: r, error } = await t().select("*").eq("id", data.publishId).single();
    if (error) rethrow(error);
    const row = r as LessonVideoRow & { intro_playback_id?: string | null };
    if (row.stage === "ready" || row.stage === "errored") return row;

    const fail = async (msg: string): Promise<LessonVideoRow> => {
      const { data: upd } = await t().update({ stage: "errored", error: msg.slice(0, 400), updated_at: new Date().toISOString() }).eq("id", row.id).select("*").single();
      return (upd ?? { ...row, stage: "errored", error: msg }) as LessonVideoRow;
    };
    const save = async (patch: Record<string, unknown>): Promise<LessonVideoRow> => {
      const { data: upd, error: e } = await t().update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id).select("*").single();
      if (e) rethrow(e);
      return upd as LessonVideoRow;
    };

    try {
      // 1) BODY concat → create the Auphonic production
      if (row.stage === "concat") {
        const asset = await muxApi(`/video/v1/assets/${row.mux_body_asset_id}`);
        if (asset.status === "errored") return fail(`Mux body concat failed: ${asset.errors?.messages?.join("; ") ?? "unknown"}`);
        if (asset.status !== "ready") return row; // still stitching
        const bodyPb = asset.playback_ids?.find((p: { policy: string }) => p.policy === "public")?.id ?? asset.playback_ids?.[0]?.id;
        if (!bodyPb) return fail("Mux body asset has no public playback id.");
        // resolve the intro url — the TRIMMED intro asset if there is one (wait for it)
        let introUrl: string | null = row.intro_playback_id ? muxMp4(row.intro_playback_id) : null;
        const tiId = (row as LessonVideoRow).trimmed_intro_asset_id;
        if (tiId) {
          const ti = await muxApi(`/video/v1/assets/${tiId}`);
          if (ti.status === "errored") return fail(`Trimmed intro failed: ${ti.errors?.messages?.join("; ") ?? "unknown"}`);
          if (ti.status !== "ready") return row; // still trimming
          const tiPb = ti.playback_ids?.find((p: { policy: string }) => p.policy === "public")?.id ?? ti.playback_ids?.[0]?.id;
          if (tiPb) { introUrl = muxMp4(tiPb); await save({ trimmed_intro_playback_id: tiPb }); }
        }
        // OUTRO: the lesson upload if present, else the shared sting fallback (may be absent).
        const outroUrl = (row as LessonVideoRow).outro_playback_id ? muxMp4((row as LessonVideoRow).outro_playback_id!) : (process.env.OUTRO_STING_URL ?? null);
        const prod = await auphonic("productions.json", {
          method: "POST",
          body: JSON.stringify({
            preset: requireEnv("AUPHONIC_PRESET_UUID"),
            metadata: { title: `${row.lesson_label ?? "Lesson"} v${row.version}` },
            multi_input_files: [
              ...(introUrl ? [{ input_file: introUrl, type: "intro" }] : []),
              { input_file: muxMp4(bodyPb), type: "multitrack", id: "body" },
              ...(outroUrl ? [{ input_file: outroUrl, type: "outro" }] : []),
            ],
            output_files: [{ format: "video", ending: "mp4" }],
            // loudness match only; NEVER cut fillers/silence (one-take principle)
            algorithms: { normloudness: true, filler_cutter: false, silence_cutter: false },
            action: "start",
          }),
        });
        return save({ stage: "uploading", mux_body_playback_id: bodyPb, auphonic_uuid: prod.uuid });
      }

      // 2) AUPHONIC processing → ingest the result into the FINAL Mux asset
      if (row.stage === "uploading" || row.stage === "processing") {
        const prod = await auphonic(`production/${row.auphonic_uuid}.json`);
        const ss = String(prod.status_string ?? "");
        if (ss === "Error") return fail(`Auphonic error: ${prod.error_message ?? "production failed"}`);
        if (ss !== "Done") return save({ stage: /Upload|Waiting/i.test(ss) ? "uploading" : "processing" });
        const out = (prod.output_files ?? []).find((f: { download_url?: string }) => f.download_url) ?? prod.output_files?.[0];
        if (!out?.download_url) return fail("Auphonic finished but returned no downloadable output.");
        // download the result (bearer) and stash it public for Mux to ingest
        const key = requireEnv("AUPHONIC_API_KEY");
        const dl = await fetch(out.download_url, { headers: { Authorization: `bearer ${key}` } });
        if (!dl.ok) return fail(`Auphonic result download failed (${dl.status}).`);
        const bytes = new Uint8Array(await dl.arrayBuffer());
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const path = `lesson-videos/${row.id}.mp4`;
        const up = await supabaseAdmin.storage.from("canvas-media").upload(path, bytes, { contentType: "video/mp4", upsert: true });
        if (up.error) return fail(`Storing the Auphonic result failed: ${up.error.message}`);
        const { data: pub } = supabaseAdmin.storage.from("canvas-media").getPublicUrl(path);
        const finalAsset = await muxApi("/video/v1/assets", {
          method: "POST",
          body: JSON.stringify({ input: [{ url: pub.publicUrl }], playback_policy: ["public"], passthrough: row.passthrough }),
        });
        return save({ stage: "finalizing", mux_asset_id: finalAsset.id });
      }

      // 3) FINAL Mux asset → ready
      if (row.stage === "finalizing") {
        const asset = await muxApi(`/video/v1/assets/${row.mux_asset_id}`);
        if (asset.status === "errored") return fail(`Final Mux asset failed: ${asset.errors?.messages?.join("; ") ?? "unknown"}`);
        if (asset.status !== "ready") return row;
        const pb = asset.playback_ids?.find((p: { policy: string }) => p.policy === "public")?.id ?? asset.playback_ids?.[0]?.id ?? null;
        // point the lesson at the newest version (this row IS the newest)
        return save({ stage: "ready", playback_id: pb });
      }
      return row;
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  });

// ---- PREVIEW (pre-production) ------------------------------------------------
// "Generate preview" — stitch intro + body frames + outro into ONE Mux asset,
// NO Auphonic (pre-loudness). Lee eyeballs the assembly before committing to a
// full publish. Ephemeral: no DB row; the client holds the asset id + polls.
export const previewLesson = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      intro: z.object({ playbackId: z.string().min(6), trim: z.object({ start: z.number(), length: z.number() }).nullable().optional() }).nullable(),
      body: z.array(z.string().min(6)).min(1), // ordered body keeper playback ids
      outro: z.string().min(6).nullable(),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ assetId: string }> => {
    muxAuth();
    const inputs: Record<string, unknown>[] = [];
    if (data.intro) inputs.push(data.intro.trim
      ? { url: muxMp4(data.intro.playbackId), start_time: data.intro.trim.start, end_time: data.intro.trim.start + data.intro.trim.length }
      : { url: muxMp4(data.intro.playbackId) });
    for (const pb of data.body) inputs.push({ url: muxMp4(pb) });
    if (data.outro) inputs.push({ url: muxMp4(data.outro) });
    const asset = await muxApi("/video/v1/assets", {
      method: "POST",
      body: JSON.stringify({ input: inputs, playback_policy: ["public"], passthrough: "preview" }),
    });
    return { assetId: asset.id };
  });

export const resolvePreview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ assetId: z.string().min(6) }).parse(d))
  .handler(async ({ data }): Promise<{ status: "processing" | "ready" | "errored"; playbackId: string | null; error: string | null }> => {
    const asset = await muxApi(`/video/v1/assets/${data.assetId}`);
    if (asset.status === "errored") return { status: "errored", playbackId: null, error: asset.errors?.messages?.join("; ") ?? "preview failed" };
    if (asset.status !== "ready") return { status: "processing", playbackId: null, error: null };
    const pb = asset.playback_ids?.find((p: { policy: string }) => p.policy === "public")?.id ?? asset.playback_ids?.[0]?.id ?? null;
    return { status: "ready", playbackId: pb, error: null };
  });

// ---- reads ------------------------------------------------------------------
/** Every publish row for the given lessons (newest version first). */
export const listLessonVideos = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ lessonIds: z.array(z.string().min(1)).max(500) }).parse(d))
  .handler(async ({ data }): Promise<LessonVideoRow[]> => {
    if (data.lessonIds.length === 0) return [];
    const t = await tbl();
    const { data: rows, error } = await t().select("*").in("lesson_id", data.lessonIds).order("version", { ascending: false });
    if (error) rethrow(error);
    return (rows ?? []) as LessonVideoRow[];
  });

/** The published (ready) video per lesson, newest version — for the dashboard. */
export const listPublishedByLabel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ courseName: z.string() }).parse(d))
  .handler(async ({ data }): Promise<{ lesson_label: string | null; version: number; playback_id: string | null }[]> => {
    const t = await tbl();
    const { data: rows, error } = await t().select("lesson_label,version,playback_id,stage,course_name").eq("course_name", data.courseName).eq("stage", "ready").order("version", { ascending: false });
    if (error) rethrow(error);
    // newest ready version per lesson_label
    const seen = new Set<string>();
    const out: { lesson_label: string | null; version: number; playback_id: string | null }[] = [];
    for (const r of (rows ?? []) as LessonVideoRow[]) {
      const key = r.lesson_label ?? "";
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ lesson_label: r.lesson_label, version: r.version, playback_id: r.playback_id });
    }
    return out;
  });
