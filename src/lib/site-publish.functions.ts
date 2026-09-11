// POST TO THE SITE — the bypass Lee asked for on 2026-09-11: "How to actually POST the thing to the
// site? … I don't see anywhere where I could just upload a file and have it post." He chose a post
// button, and said a new vertical video may replace a set's existing one.
//
// Two admin-only steps, the stateless start/resolve shape the render worker bridge uses:
//   startSitePost   — the take already sits in canvas-media (post-production step 1 put it there);
//                     Mux ingests it from that public URL as a PUBLIC asset, because the student
//                     player streams unsigned HLS.
//   resolveSitePost — polled until the asset is ready; then the video's publication goes onto the
//                     set's deck (short-publication.ts; replace-by-id, so pressing again replaces),
//                     and the video's row gets its site tick and link.
//
// THE SCENE WRITE is attachOneTakeBlast's (talkthrough.functions.ts) with the design doc's two
// changes (docs/DESIGN-SITE-PUBLISH.md §4.3): replace by id, and a compare-and-set on
// canvas_scenes.updated_at. An open Studio tab or a plan save writes the whole nodes_json, and a
// clobber here would silently drop the post; a lost race says so instead: "press Post again".
//
// Deliberately without the design's short_jobs table (no migration): the post is one press from
// an open post-production panel, and the deck's publication and the row's tick ARE the record.
// Nothing here runs by itself — the only caller is Lee's press on /v3/post. Mux credentials live in
// Vercel; mux.server.ts throws loudly without them.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { rowToStatus, type SetPublishStatus } from "./publish-queue.functions";
import { publicPlaybackIdOf, siteLinkFor, sitePublication, sitePublicationId, upsertPublication } from "./short-publication";

/** Scene JSON is the store — the same door talkthrough.functions.ts and blastoff.functions.ts use. */
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

/** 1) Hand the take to Mux as a public asset. Returns the asset id to poll. */
export const startSitePost = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ videoUrl: z.string().url().max(800), pubKey: z.string().min(1).max(160) }).parse(d))
  .handler(async ({ data }): Promise<{ assetId: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const { createAssetFromUrl } = await import("@/lib/mux.server");
    const asset = await createAssetFromUrl(data.videoUrl, { playbackPolicy: "public", generatedSubtitles: false, passthrough: `blastoff:${data.pubKey}` });
    return { assetId: asset.id };
  });

export type SitePostResult =
  | { state: "processing" }
  | { state: "error"; error: string }
  | { state: "posted"; playbackId: string; link: string; status: SetPublishStatus | null; statusError?: string };

/** 2) Poll. Once Mux says ready: the publication onto the set, then the row's site tick. */
export const resolveSitePost = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    assetId: z.string().min(1).max(120),
    setId: z.string().min(1).max(160),
    pubKey: z.string().min(1).max(160),
    takeIndex: z.number().int().min(0).max(99),
    takeName: z.string().max(200),
    title: z.string().max(300),
    videoUrl: z.string().url().max(800),
  }).parse(d))
  .handler(async ({ data }): Promise<SitePostResult> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const { getAsset } = await import("@/lib/mux.server");
    const asset = await getAsset(data.assetId);
    if (asset.status === "errored") return { state: "error", error: `The video host couldn't process it: ${JSON.stringify(asset.errors ?? "no reason given").slice(0, 300)}` };
    if (asset.status !== "ready") return { state: "processing" };
    const playbackId = publicPlaybackIdOf(asset);
    if (!playbackId) return { state: "error", error: "The video is ready but has no public playback id, so students couldn't play it." };

    const db = await admin();
    const { loadDecksDeduped } = await import("@/lib/student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.setId);
    if (!o) return { state: "error", error: `There's no live set "${data.setId}" in the bank.` };
    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json,updated_at").eq("id", o.sceneId).single();
    if (error) return { state: "error", error: error.message };
    const j = row.nodes_json as { decks?: { id: string; access?: string; publications?: Record<string, unknown>[] }[] };
    const deck = (j.decks ?? []).find((d2) => d2.id === data.setId);
    if (!deck) return { state: "error", error: "The set vanished from its scene." };
    const pub = sitePublication({
      pubKey: data.pubKey, takeIndex: data.takeIndex, takeName: data.takeName, title: data.title,
      muxAssetId: asset.id, muxPlaybackId: playbackId, durationS: asset.duration ?? null,
      access: deck.access === "paid" ? "paid" : "free", sourceUrl: data.videoUrl,
    });
    // THE COVER RIDES WITH THE VIDEO (2026-09-11): a thumbnail uploaded before the post (kept on
    // the row under this key) goes onto the publication, so the posted video owns it from here on.
    try {
      const { coverOf } = await import("./publish-cover");
      const { data: st0 } = await db.from("set_publish_status").select("captions").eq("set_id", data.pubKey).maybeSingle();
      const c = coverOf(st0?.captions);
      if (c) pub.coverUrl = c.url;
    } catch { /* the row is optional */ }
    deck.publications = upsertPublication(deck.publications, pub);
    // COMPARE-AND-SET on updated_at: zero rows back means someone saved the scene since the read.
    const up = await db.from("canvas_scenes").update({ nodes_json: j, updated_at: new Date().toISOString() }).eq("id", o.sceneId).eq("updated_at", row.updated_at).select("id");
    if (up.error) return { state: "error", error: up.error.message };
    if (!up.data?.length) return { state: "error", error: "The set changed while posting (an open editor saved it). Press Post again." };

    // THE ROW'S SITE TICK, with the link — what the queue counts. A failure here doesn't undo the
    // post, so it comes back beside the success rather than as an error.
    const link = siteLinkFor(data.setId);
    const now = new Date().toISOString();
    const st = await db.from("set_publish_status")
      .upsert({ set_id: data.pubKey, site_posted_at: now, site_url: link, updated_at: now }, { onConflict: "set_id" })
      .select("*").single();
    if (st.error) return { state: "posted", playbackId, link, status: null, statusError: st.error.message };
    return { state: "posted", playbackId, link, status: rowToStatus((st.data ?? {}) as Record<string, unknown>) };
  });

/** Write (or clear) the cover on the posted publication that carries this publish key. Called by
 *  setPublishCover after the row write; a set with no such publication is a no-op. Compare-and-set
 *  on the scene's updated_at like resolveSitePost — never clobber an editor's save. */
export async function setPublicationCover(pubKey: string, coverUrl: string | null): Promise<{ ok: boolean; changed: boolean }> {
  const db = await admin();
  const setId = pubKey.split("#")[0];
  const { loadDecksDeduped } = await import("@/lib/student.functions");
  const owned = await loadDecksDeduped(db as never);
  const o = owned.get(setId);
  if (!o) return { ok: true, changed: false };
  const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json,updated_at").eq("id", o.sceneId).single();
  if (error || !row) return { ok: false, changed: false };
  const j = row.nodes_json as { decks?: { id: string; publications?: Record<string, unknown>[] }[] };
  const deck = (j.decks ?? []).find((d2) => d2.id === setId);
  const pub = deck?.publications?.find((p) => p?.pubKey === pubKey || p?.id === sitePublicationId(pubKey));
  if (!pub) return { ok: true, changed: false };
  if ((pub.coverUrl ?? null) === coverUrl) return { ok: true, changed: false };
  if (coverUrl) pub.coverUrl = coverUrl; else delete pub.coverUrl;
  const up = await db.from("canvas_scenes").update({ nodes_json: j, updated_at: new Date().toISOString() }).eq("id", o.sceneId).eq("updated_at", row.updated_at).select("id");
  if (up.error || !up.data?.length) return { ok: false, changed: false };
  return { ok: true, changed: true };
}
