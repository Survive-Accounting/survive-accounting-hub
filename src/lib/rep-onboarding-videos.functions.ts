// REP ONBOARDING VIDEOS — admin. The four shorts that play on /rep/onboarding steps 1–4.
//
// Lee films them on the /v3 line, then either uploads the MP4 here (Mux direct upload, PUBLIC
// playback policy — same path the /shipped recorder uses) or pastes a public playback id he
// already has. Either way the id lands in site_settings.settings.repOnboardingVideos[stepN]
// and the step's placeholder card becomes the video. Also the beta-mode switch (spec §7).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertAdmin } from "@/lib/admin-session.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};
const STEP = z.enum(["step1", "step2", "step3", "step4"]);
export type VideoStep = z.infer<typeof STEP>;

async function readSettings(db: DB): Promise<Record<string, unknown>> {
  const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
  return ((data?.settings as Record<string, unknown> | null) ?? {});
}
async function writeSettings(db: DB, patch: (s: Record<string, unknown>) => Record<string, unknown>): Promise<Record<string, unknown>> {
  const cur = await readSettings(db);
  const next = patch(cur);
  const { error } = await db.from("site_settings").upsert({ id: 1, settings: next }, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return next;
}
const videosOf = (s: Record<string, unknown>): Record<string, string> => {
  const v = s.repOnboardingVideos;
  return v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string")) as Record<string, string> : {};
};
const uploadsOf = (s: Record<string, unknown>): Record<string, string> => {
  const v = s.repOnboardingVideoUploads;
  return v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string")) as Record<string, string> : {};
};

export type VideoSettings = { videos: Record<string, string>; pending: Record<string, string>; betaMode: boolean };

export const getOnboardingVideoSettings = createServerFn({ method: "POST" })
  .handler(async (): Promise<VideoSettings> => {
    await assertAdmin();
    const s = await readSettings(await admin());
    return { videos: videosOf(s), pending: uploadsOf(s), betaMode: s.repBetaMode !== false };
  });

/** Paste a public playback id by hand (or clear it with an empty string). */
export const setOnboardingVideoId = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ step: STEP, playbackId: z.string().trim().max(120) }).parse(d))
  .handler(async ({ data }): Promise<VideoSettings> => {
    await assertAdmin();
    const db = await admin();
    const s = await writeSettings(db, (cur) => {
      const videos = { ...videosOf(cur) };
      if (data.playbackId) videos[data.step] = data.playbackId; else delete videos[data.step];
      const pending = { ...uploadsOf(cur) }; delete pending[data.step];
      return { ...cur, repOnboardingVideos: videos, repOnboardingVideoUploads: pending };
    });
    return { videos: videosOf(s), pending: uploadsOf(s), betaMode: s.repBetaMode !== false };
  });

/** Start a Mux direct upload for a step; the browser PUTs the file to `uploadUrl`. */
export const createOnboardingVideoUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ step: STEP }).parse(d))
  .handler(async ({ data }): Promise<{ uploadUrl: string }> => {
    await assertAdmin();
    const db = await admin();
    const { createDirectUpload } = await import("@/lib/mux.server");
    const up = await createDirectUpload({ passthrough: `REP-ONBOARDING-${data.step}`, playbackPolicy: "public" });
    if (!up.url) throw new Error("Mux did not return an upload URL.");
    await writeSettings(db, (cur) => ({ ...cur, repOnboardingVideoUploads: { ...uploadsOf(cur), [data.step]: up.id } }));
    return { uploadUrl: up.url };
  });

/** Poll after the PUT: upload → asset → public playback id → settings. */
export const resolveOnboardingVideoUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ step: STEP }).parse(d))
  .handler(async ({ data }): Promise<{ status: "waiting" | "processing" | "ready" | "errored"; playbackId?: string }> => {
    await assertAdmin();
    const db = await admin();
    const s = await readSettings(db);
    const uploadId = uploadsOf(s)[data.step];
    if (!uploadId) return videosOf(s)[data.step] ? { status: "ready", playbackId: videosOf(s)[data.step] } : { status: "errored" };
    const { getAsset, getUpload } = await import("@/lib/mux.server");
    const up = await getUpload(uploadId);
    if (up.status === "errored" || up.status === "cancelled" || up.status === "timed_out") return { status: "errored" };
    if (!up.asset_id) return { status: "waiting" };
    const asset = await getAsset(up.asset_id);
    if (asset.status === "errored") return { status: "errored" };
    if (asset.status !== "ready") return { status: "processing" };
    const playbackId = asset.playback_ids?.find((p) => p.policy === "public")?.id ?? asset.playback_ids?.[0]?.id;
    if (!playbackId) return { status: "errored" };
    await writeSettings(db, (cur) => {
      const pending = { ...uploadsOf(cur) }; delete pending[data.step];
      return { ...cur, repOnboardingVideos: { ...videosOf(cur), [data.step]: playbackId }, repOnboardingVideoUploads: pending };
    });
    return { status: "ready", playbackId };
  });

export const setRepBetaMode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ on: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ betaMode: boolean }> => {
    await assertAdmin();
    const s = await writeSettings(await admin(), (cur) => ({ ...cur, repBetaMode: data.on }));
    return { betaMode: s.repBetaMode !== false };
  });
