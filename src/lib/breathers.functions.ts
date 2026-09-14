// BREATHERS — the authoring view's server doors (/v3/breathers). Breathers live on the set's deck
// (deck.breathers, additive in the scene JSON) against the set's sequence of posted videos.
// Compare-and-set on the scene's updated_at, like every other scene write.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Breather } from "./breathers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const ctx = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

type Pub = { kind?: string; source?: string; state?: string; pubKey?: string; takeIndex?: number; meta?: { title?: string }; render?: { durationS?: number | null; muxPlaybackId?: string }; coverUrl?: string };
const isPosted = (p: Pub) => p?.kind === "blast" && p.source === "blastoff" && p.state === "shipped" && typeof p.pubKey === "string" && !!p.render?.muxPlaybackId;

export interface SequenceVideo { pubKey: string; index: number; title: string; durationS: number | null; coverUrl: string | null; playbackId: string | null }

/** Sets with at least two posted videos — the sequences a breather can sit in. */
export const listBreatherSets = createServerFn({ method: "GET" }).handler(async (): Promise<Array<{ id: string; name: string; videos: number; breathers: number }>> => {
  const db = await ctx();
  const { loadDecksDeduped } = await import("@/lib/student.functions");
  const out: Array<{ id: string; name: string; videos: number; breathers: number }> = [];
  for (const o of (await loadDecksDeduped(db as never)).values()) {
    const d = o.deck as { id: string; name?: string; publications?: Pub[]; breathers?: Breather[] };
    const n = (d.publications ?? []).filter(isPosted).length;
    if (n >= 2) out.push({ id: d.id, name: d.name ?? d.id, videos: n, breathers: (d.breathers ?? []).length });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
});

export const loadBreathers = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(160) }).parse(d))
  .handler(async ({ data }): Promise<{ setName: string; videos: SequenceVideo[]; breathers: Breather[] } | null> => {
    const db = await ctx();
    const { loadDecksDeduped } = await import("@/lib/student.functions");
    const o = (await loadDecksDeduped(db as never)).get(data.setId);
    if (!o) return null;
    const d = o.deck as { name?: string; publications?: Pub[]; breathers?: Breather[] };
    const videos = (d.publications ?? []).filter(isPosted).sort((a, b) => (a.takeIndex ?? 0) - (b.takeIndex ?? 0))
      .map((p, i) => ({ pubKey: p.pubKey!, index: i, title: p.meta?.title ?? `Video ${i + 1}`, durationS: p.render?.durationS ?? null, coverUrl: p.coverUrl ?? null, playbackId: p.render?.muxPlaybackId ?? null }));
    return { setName: d.name ?? data.setId, videos, breathers: d.breathers ?? [] };
  });

const BreatherInput = z.object({
  id: z.string().min(1).max(60),
  afterPubKey: z.string().min(1).max(160),
  heading: z.string().max(60),
  body: z.string().max(400),
  live: z.boolean(),
  updatedAt: z.string().max(40),
});

export const saveBreathers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(160), breathers: z.array(BreatherInput).max(60) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const db = await ctx();
    const { loadDecksDeduped } = await import("@/lib/student.functions");
    const o = (await loadDecksDeduped(db as never)).get(data.setId);
    if (!o) return { ok: false, error: "That set isn't in the bank." };
    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json,updated_at").eq("id", o.sceneId).single();
    if (error) return { ok: false, error: error.message };
    const deck = ((row.nodes_json as { decks?: { id: string; breathers?: Breather[] }[] }).decks ?? []).find((x) => x.id === data.setId);
    if (!deck) return { ok: false, error: "The set vanished from its scene." };
    deck.breathers = data.breathers;
    const up = await db.from("canvas_scenes").update({ nodes_json: row.nodes_json, updated_at: new Date().toISOString() }).eq("id", o.sceneId).eq("updated_at", row.updated_at).select("id");
    if (up.error) return { ok: false, error: up.error.message };
    if (!up.data?.length) return { ok: false, error: "The set changed while saving (an editor saved it). Save again." };
    return { ok: true };
  });
