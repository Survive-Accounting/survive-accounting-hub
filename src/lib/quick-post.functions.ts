// QUICK POST's two server doors (components/v3/QuickPost.tsx). The post itself is the normal one —
// startSitePost / resolveSitePost (site-publish.functions.ts) — so these only READ what a set has
// on the site now, and REMOVE old site videos the new list doesn't replace ("I want to remove the
// other ones, they were kind of the initial test"). Admin-only; removal is Lee's press, with the
// titles shown first. Compare-and-set on the scene's updated_at, like every other scene write here.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

export interface SitePostView {
  pubKey: string; takeIndex: number; title: string; durationS: number | null; coverUrl: string | null;
  playbackId: string | null;
  /** A suggested end (seconds) — where the sign-off starts, from the transcript. */
  trimAtS: number | null;
  /** Set once trimmed: the untrimmed video, so the trim can be undone. */
  untrimmed: { durationS: number | null } | null;
}

type Render = { at?: number; muxAssetId?: string; muxPlaybackId?: string; durationS?: number | null };
type Pub = { kind?: string; source?: string; state?: string; pubKey?: string; takeIndex?: number; meta?: { title?: string; trimAtS?: number }; render?: Render & { untrimmed?: Render }; coverUrl?: string };
const isSitePost = (p: Pub) => p?.kind === "blast" && p.source === "blastoff" && typeof p.pubKey === "string";

export const listSitePosts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(160) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; setName: string; posts: SitePostView[] } | { ok: false; error: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const { loadDecksDeduped } = await import("@/lib/student.functions");
    const o = (await loadDecksDeduped((await admin()) as never)).get(data.setId);
    if (!o) return { ok: false, error: `There's no set "${data.setId}" in the bank.` };
    const deck = o.deck as { name?: string; publications?: Pub[] };
    const posts = (deck.publications ?? []).filter(isSitePost).map((p) => ({
      pubKey: p.pubKey!, takeIndex: p.takeIndex ?? 0, title: p.meta?.title ?? "", durationS: p.render?.durationS ?? null, coverUrl: p.coverUrl ?? null,
      playbackId: p.render?.muxPlaybackId ?? null, trimAtS: typeof p.meta?.trimAtS === "number" ? p.meta.trimAtS : null,
      untrimmed: p.render?.untrimmed ? { durationS: p.render.untrimmed.durationS ?? null } : null,
    })).sort((a, b) => a.takeIndex - b.takeIndex);
    return { ok: true, setName: deck.name ?? data.setId, posts };
  });

export const removeSitePosts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(160), pubKeys: z.array(z.string().min(1).max(160)).min(1).max(100) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; removed: number } | { ok: false; error: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const { loadDecksDeduped } = await import("@/lib/student.functions");
    const o = (await loadDecksDeduped(db as never)).get(data.setId);
    if (!o) return { ok: false, error: `There's no set "${data.setId}" in the bank.` };
    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json,updated_at").eq("id", o.sceneId).single();
    if (error) return { ok: false, error: error.message };
    const j = row.nodes_json as { decks?: { id: string; publications?: Pub[] }[] };
    const deck = (j.decks ?? []).find((d2) => d2.id === data.setId);
    if (!deck) return { ok: false, error: "The set vanished from its scene." };
    const drop = new Set(data.pubKeys);
    const before = deck.publications?.length ?? 0;
    deck.publications = (deck.publications ?? []).filter((p) => !(isSitePost(p) && drop.has(p.pubKey!)));
    const removed = before - deck.publications.length;
    if (!removed) return { ok: true, removed: 0 };
    const up = await db.from("canvas_scenes").update({ nodes_json: j, updated_at: new Date().toISOString() }).eq("id", o.sceneId).eq("updated_at", row.updated_at).select("id");
    if (up.error) return { ok: false, error: up.error.message };
    if (!up.data?.length) return { ok: false, error: "The set changed while removing (an open editor saved it). Press Remove again." };
    // The row's site tick goes too, so the queue doesn't count a video that's gone.
    const cleared = await db.from("set_publish_status").update({ site_posted_at: null, site_url: null, updated_at: new Date().toISOString() }).in("set_id", [...drop]);
    if (cleared.error) console.warn("[quick-post] removed from the set, but the post rows kept their site tick:", cleared.error.message);
    return { ok: true, removed };
  });

/** Rename a set — the name students see (Lee, 2026-09-13: "instead of 5 types of accounts, let's call
 *  this Know your accounts"). Compare-and-set like the rest. */
export const renameSetForPost = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(160), name: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await admin();
    const { loadDecksDeduped } = await import("@/lib/student.functions");
    const o = (await loadDecksDeduped(db as never)).get(data.setId);
    if (!o) return { ok: false, error: `There's no set "${data.setId}" in the bank.` };
    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json,updated_at").eq("id", o.sceneId).single();
    if (error) return { ok: false, error: error.message };
    const j = row.nodes_json as { decks?: { id: string; name?: string; updatedAt?: string }[] };
    const deck = (j.decks ?? []).find((d2) => d2.id === data.setId);
    if (!deck) return { ok: false, error: "The set vanished from its scene." };
    deck.name = data.name;
    const up = await db.from("canvas_scenes").update({ nodes_json: j, updated_at: new Date().toISOString() }).eq("id", o.sceneId).eq("updated_at", row.updated_at).select("id");
    if (up.error) return { ok: false, error: up.error.message };
    if (!up.data?.length) return { ok: false, error: "The set changed while renaming (an open editor saved it). Press Rename again." };
    return { ok: true };
  });

/** TRIM (Lee, 2026-09-13: "I really need a trim tool to trim off the ends of each video"). Once the
 *  full take is ready on Mux, make the kept part as its own public asset — that one is what posts.
 *  Returns "processing" until the source is ready. */
export const startTrimmedPost = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    sourceAssetId: z.string().min(1).max(120),
    pubKey: z.string().min(1).max(160),
    startS: z.number().min(0).max(36000),
    endS: z.number().min(0).max(36000),
  }).parse(d))
  .handler(async ({ data }): Promise<{ state: "processing" } | { state: "started"; assetId: string } | { state: "error"; error: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const { createClipAsset, getAsset } = await import("@/lib/mux.server");
    const src = await getAsset(data.sourceAssetId);
    if (src.status === "errored") return { state: "error", error: `The video host couldn't process it: ${JSON.stringify(src.errors ?? "no reason given").slice(0, 300)}` };
    if (src.status !== "ready") return { state: "processing" };
    const end = Math.min(data.endS, src.duration ?? data.endS);
    if (end - data.startS < 1) return { state: "error", error: "The trimmed part is under a second long — check the start and end." };
    const clip = await createClipAsset(src.id, data.startS, end, { playbackPolicy: "public", passthrough: `blastoff:${data.pubKey}` });
    return { state: "started", assetId: clip.id };
  });

// ── TRIM A VIDEO THAT'S ALREADY POSTED ────────────────────────────────────────────────────────
// Lee, 2026-09-14: "My goal is to trim the outro off of most of these. It's repetitive." Mux cuts a
// new public asset from the posted one (no re-upload); once it's ready the publication points at
// it, keeping the untrimmed render beside it so Undo puts it straight back. Trimming a trimmed
// video cuts from the ORIGINAL, so the seconds always mean the same thing.

async function sceneWithPub(setId: string, pubKey: string) {
  const db = await admin();
  const { loadDecksDeduped } = await import("@/lib/student.functions");
  const o = (await loadDecksDeduped(db as never)).get(setId);
  if (!o) throw new Error(`There's no set "${setId}" in the bank.`);
  const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json,updated_at").eq("id", o.sceneId).single();
  if (error) throw new Error(error.message);
  const j = row.nodes_json as { decks?: { id: string; publications?: Pub[] }[] };
  const pub = (j.decks ?? []).find((d) => d.id === setId)?.publications?.find((p) => isSitePost(p) && p.pubKey === pubKey);
  if (!pub) throw new Error("That video isn't on the set anymore.");
  const save = async () => {
    const up = await db.from("canvas_scenes").update({ nodes_json: j, updated_at: new Date().toISOString() }).eq("id", o.sceneId).eq("updated_at", row.updated_at).select("id");
    if (up.error) throw new Error(up.error.message);
    if (!up.data?.length) throw new Error("The set changed while saving (an open editor saved it). Press again.");
  };
  return { pub, save };
}

export const startPostedTrim = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(160), pubKey: z.string().min(1).max(160), endS: z.number().min(1).max(36000), startS: z.number().min(0).max(36000).default(0) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; assetId: string } | { ok: false; error: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const { pub } = await sceneWithPub(data.setId, data.pubKey);
      const source = pub.render?.untrimmed?.muxAssetId ?? pub.render?.muxAssetId;
      if (!source) return { ok: false, error: "This video has no host asset to trim from." };
      if (data.endS - data.startS < 1) return { ok: false, error: "The trimmed part is under a second long." };
      const { createClipAsset } = await import("@/lib/mux.server");
      const clip = await createClipAsset(source, data.startS, data.endS, { playbackPolicy: "public", passthrough: `blastoff:${data.pubKey}:trim` });
      return { ok: true, assetId: clip.id };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });

export const resolvePostedTrim = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(160), pubKey: z.string().min(1).max(160), assetId: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ state: "processing" } | { state: "done"; durationS: number | null } | { state: "error"; error: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const { getAsset } = await import("@/lib/mux.server");
      const { publicPlaybackIdOf } = await import("@/lib/short-publication");
      const asset = await getAsset(data.assetId);
      if (asset.status === "errored") return { state: "error", error: `The video host couldn't cut it: ${JSON.stringify(asset.errors ?? "no reason").slice(0, 200)}` };
      if (asset.status !== "ready") return { state: "processing" };
      const playbackId = publicPlaybackIdOf(asset);
      if (!playbackId) return { state: "error", error: "The trimmed video has no public playback id." };
      const { pub, save } = await sceneWithPub(data.setId, data.pubKey);
      const render = pub.render ?? {};
      const untrimmed = render.untrimmed ?? { at: render.at, muxAssetId: render.muxAssetId, muxPlaybackId: render.muxPlaybackId, durationS: render.durationS };
      pub.render = { at: Date.now(), muxAssetId: asset.id, muxPlaybackId: playbackId, durationS: asset.duration ?? null, untrimmed };
      await save();
      return { state: "done", durationS: asset.duration ?? null };
    } catch (e) { return { state: "error", error: e instanceof Error ? e.message : String(e) }; }
  });

export const undoPostedTrim = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(160), pubKey: z.string().min(1).max(160) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const { pub, save } = await sceneWithPub(data.setId, data.pubKey);
      const u = pub.render?.untrimmed;
      if (!u?.muxPlaybackId) return { ok: false, error: "This video isn't trimmed." };
      pub.render = { at: Date.now(), muxAssetId: u.muxAssetId, muxPlaybackId: u.muxPlaybackId, durationS: u.durationS ?? null };
      await save();
      return { ok: true };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });
