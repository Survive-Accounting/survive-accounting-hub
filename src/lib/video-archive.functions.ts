// Admin server functions for /outreach/video-archive. Client-safe module:
// createServerFn endpoints that dynamically import the server-only Mux helper
// inside handlers. Gated only by the client-side AdminGate (same as the rest of
// /outreach) — no server-side auth, matching the existing model.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface VideoArchiveRow {
  id: string;
  source: string;
  source_video_id: string;
  title: string | null;
  duration_sec: number | null;
  status: string;
  mux_playback_id: string | null;
  transcript_source: string | null;
  transcript_preview: string | null;
  has_transcript: boolean;
  course_family: string | null;
  chapter_id: string | null;
  scenario_slug: string | null;
  notes: string | null;
  created_at_source: string | null;
}

export interface ScenarioOption {
  slug: string;
  title: string;
  chapter_id: string | null;
  chapter_name: string | null;
  course_family: string | null;
}

const PREVIEW_LEN = 240;

export const listVideoArchive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ status: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<VideoArchiveRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as unknown as { from: (t: string) => any };
    let q = sb
      .from("video_archive")
      .select(
        "id,source,source_video_id,title,duration_sec,status,mux_playback_id,transcript_source,transcript_text,course_family,chapter_id,scenario_slug,notes,created_at_source",
      )
      .order("created_at_source", { ascending: false, nullsFirst: false });
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map((r) => {
      const t = (r.transcript_text as string | null) ?? null;
      return {
        id: r.id,
        source: r.source,
        source_video_id: r.source_video_id,
        title: r.title,
        duration_sec: r.duration_sec,
        status: r.status,
        mux_playback_id: r.mux_playback_id,
        transcript_source: r.transcript_source,
        transcript_preview: t ? t.slice(0, PREVIEW_LEN) + (t.length > PREVIEW_LEN ? "…" : "") : null,
        has_transcript: Boolean(t),
        course_family: r.course_family,
        chapter_id: r.chapter_id,
        scenario_slug: r.scenario_slug,
        notes: r.notes,
        created_at_source: r.created_at_source,
      } satisfies VideoArchiveRow;
    });
  });

/** Scenario options for the assign dropdown, joined to chapter + course_family. */
export const listScenarioOptions = createServerFn({ method: "GET" }).handler(async (): Promise<ScenarioOption[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as unknown as { from: (t: string) => any };
  const [{ data: scenarios }, { data: chapters }, { data: courses }] = await Promise.all([
    sb.from("je_scenarios").select("slug,title,chapter_id"),
    sb.from("chapters").select("id,chapter_name,course_id"),
    sb.from("courses").select("id,course_family"),
  ]);
  const chById = new Map<string, any>((chapters ?? []).map((c: any) => [c.id, c]));
  const coById = new Map<string, any>((courses ?? []).map((c: any) => [c.id, c]));
  return ((scenarios ?? []) as any[])
    .map((s) => {
      const ch: any = s.chapter_id ? chById.get(s.chapter_id) : null;
      const co: any = ch?.course_id ? coById.get(ch.course_id) : null;
      return {
        slug: s.slug,
        title: s.title,
        chapter_id: s.chapter_id ?? null,
        chapter_name: ch?.chapter_name ?? null,
        course_family: co?.course_family ?? null,
      } satisfies ScenarioOption;
    })
    .sort((a, b) => (a.course_family ?? "").localeCompare(b.course_family ?? "") || a.title.localeCompare(b.title));
});

/** Attach a video to a scenario — fills scenario_slug + chapter_id + course_family. */
export const assignScenario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), scenario_slug: z.string().trim().min(1).nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as unknown as { from: (t: string) => any };

    if (data.scenario_slug === null) {
      // Unassign.
      const { error } = await sb
        .from("video_archive")
        .update({ scenario_slug: null, chapter_id: null, course_family: null, status: "transcribed" })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const { data: scen, error: se } = await sb
      .from("je_scenarios")
      .select("chapter_id")
      .eq("slug", data.scenario_slug)
      .maybeSingle();
    if (se) throw new Error(se.message);
    if (!scen) throw new Error(`Scenario not found: ${data.scenario_slug}`);

    let courseFamily: string | null = null;
    if (scen.chapter_id) {
      const { data: ch } = await sb.from("chapters").select("course_id").eq("id", scen.chapter_id).maybeSingle();
      if (ch?.course_id) {
        const { data: co } = await sb.from("courses").select("course_family").eq("id", ch.course_id).maybeSingle();
        courseFamily = co?.course_family ?? null;
      }
    }

    const { error } = await sb
      .from("video_archive")
      .update({
        scenario_slug: data.scenario_slug,
        chapter_id: scen.chapter_id ?? null,
        course_family: courseFamily,
        status: "assigned",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, chapter_id: scen.chapter_id ?? null, course_family: courseFamily };
  });

/** Signed Mux playback URLs (15-min TTL) for the Watch modal. */
export const getWatchUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ player: string; hls: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as unknown as { from: (t: string) => any };
    const { data: row, error } = await sb
      .from("video_archive")
      .select("mux_playback_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.mux_playback_id) throw new Error("No Mux playback id yet (asset still processing?)");
    const { signedPlaybackUrls } = await import("@/lib/mux.server");
    return signedPlaybackUrls(row.mux_playback_id, 15 * 60);
  });
