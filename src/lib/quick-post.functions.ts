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

export interface SitePostView { pubKey: string; takeIndex: number; title: string; durationS: number | null; coverUrl: string | null }

type Pub = { kind?: string; source?: string; state?: string; pubKey?: string; takeIndex?: number; meta?: { title?: string }; render?: { durationS?: number | null }; coverUrl?: string };
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
