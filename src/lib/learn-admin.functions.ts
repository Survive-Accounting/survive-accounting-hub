// /admin/learn — server side. Lee, 2026-09-16: "Reorder videos as they appear on /learn. Normalize the audio
// across the videos. Some videos are out of sync with my mouth… mark a video as good or needs redo with a
// 'why'." Every write lands on the set's PUBLICATIONS (the posted parts), the same objects the student tree reads,
// so /learn shows the change on its next load. Admin only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type DB = { from: (t: string) => any };
async function db(): Promise<DB> {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}

export interface AdminPart {
  pubKey: string;
  takeIndex: number;
  name: string;
  playbackId: string | null;
  durationS: number | null;
  coverUrl: string | null;
  /** The file every fix is cut from (the first post's file), and the file posted now. */
  originalUrl: string | null;
  sourceUrl: string | null;
  order: number;
  review: { verdict: "good" | "redo"; why: string; at: string } | null;
  audioOffsetMs: number;
  normalizedAt: string | null;
}
export interface AdminSet { setId: string; name: string; parts: AdminPart[] }

type Pub = Record<string, unknown> & { id?: string; pubKey?: string; takeIndex?: number; kind?: string; state?: string; source?: string; render?: { muxPlaybackId?: string | null; durationS?: number | null } };

function partOf(p: Pub): AdminPart {
  const r = p.review as AdminPart["review"] | undefined;
  return {
    pubKey: String(p.pubKey ?? p.id ?? ""),
    takeIndex: typeof p.takeIndex === "number" ? p.takeIndex : 0,
    name: String(p.takeName ?? (p.meta as { title?: string } | undefined)?.title ?? ""),
    playbackId: p.render?.muxPlaybackId ?? null,
    durationS: p.render?.durationS ?? null,
    coverUrl: typeof p.coverUrl === "string" ? p.coverUrl : null,
    originalUrl: typeof p.originalUrl === "string" ? p.originalUrl : typeof p.sourceUrl === "string" ? p.sourceUrl : null,
    sourceUrl: typeof p.sourceUrl === "string" ? p.sourceUrl : null,
    order: typeof p.order === "number" ? p.order : typeof p.takeIndex === "number" ? p.takeIndex : 0,
    review: r && (r.verdict === "good" || r.verdict === "redo") ? { verdict: r.verdict, why: String(r.why ?? ""), at: String(r.at ?? "") } : null,
    audioOffsetMs: typeof p.audioOffsetMs === "number" ? p.audioOffsetMs : 0,
    normalizedAt: typeof p.normalizedAt === "string" ? p.normalizedAt : null,
  };
}
const isPosted = (p: Pub) => p?.kind === "blast" && p?.state === "shipped" && p?.source === "blastoff" && !!p.render?.muxPlaybackId;
const sorted = (pubs: Pub[]) => pubs.filter(isPosted).map(partOf).sort((a, b) => a.order - b.order || a.takeIndex - b.takeIndex);

/** Every live set with posted parts, parts in /learn order. */
export const listLearnAdminSets = createServerFn({ method: "GET" }).handler(async (): Promise<AdminSet[]> => {
  const d = await db();
  const { loadDecksDeduped } = await import("@/lib/student.functions");
  const owned = await loadDecksDeduped(d as never);
  const out: AdminSet[] = [];
  for (const o of owned.values()) {
    const deck = o.deck as Record<string, unknown> & { id: string; name?: string; status?: string; publications?: Pub[] };
    if (deck.status !== "live") continue;
    const parts = sorted(deck.publications ?? []);
    if (!parts.length) continue;
    out.push({ setId: deck.id, name: String(deck.name ?? deck.id), parts });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
});

async function patchPubs(setId: string, fn: (pubs: Pub[]) => void): Promise<AdminPart[]> {
  const d = await db();
  const { loadDecksDeduped } = await import("@/lib/student.functions");
  const owned = await loadDecksDeduped(d as never);
  const o = owned.get(setId);
  if (!o) throw new Error("That set isn't in the bank.");
  const { data: row, error } = await d.from("canvas_scenes").select("id,nodes_json,updated_at").eq("id", o.sceneId).single();
  if (error) throw new Error(error.message);
  const j = row.nodes_json as { decks?: { id: string; publications?: Pub[] }[] };
  const deck = (j.decks ?? []).find((x) => x.id === setId);
  if (!deck) throw new Error("The set vanished from its scene.");
  deck.publications = deck.publications ?? [];
  fn(deck.publications);
  const up = await d.from("canvas_scenes").update({ nodes_json: j, updated_at: new Date().toISOString() }).eq("id", o.sceneId).eq("updated_at", row.updated_at).select("id");
  if (up.error) throw new Error(up.error.message);
  if (!up.data?.length) throw new Error("The set changed while saving — try again.");
  return sorted(deck.publications);
}

/** THE ORDER, as dragged: the parts' takeIndexes top to bottom. */
export const setLearnOrder = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({ setId: z.string().min(1).max(200), takeIndexes: z.array(z.number().int().min(0).max(99)).min(1).max(100) }).parse(x))
  .handler(async ({ data }) => patchPubs(data.setId, (pubs) => {
    data.takeIndexes.forEach((ti, i) => { for (const p of pubs) if (isPosted(p) && p.takeIndex === ti) p.order = i; });
  }));

/** GOOD or NEEDS REDO, with the why (typed or talked). Null clears it. */
export const setLearnReview = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({ setId: z.string().min(1).max(200), takeIndex: z.number().int().min(0).max(99), verdict: z.enum(["good", "redo"]).nullable(), why: z.string().max(2000) }).parse(x))
  .handler(async ({ data }) => patchPubs(data.setId, (pubs) => {
    for (const p of pubs) if (isPosted(p) && p.takeIndex === data.takeIndex) {
      if (data.verdict) p.review = { verdict: data.verdict, why: data.why.trim(), at: new Date().toISOString() };
      else delete p.review;
    }
  }));

/** What a fix applied: the sync offset now on the posted file, and/or that its audio was normalized. */
export const noteLearnFix = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({ setId: z.string().min(1).max(200), takeIndex: z.number().int().min(0).max(99), audioOffsetMs: z.number().int().min(-2000).max(2000).optional(), normalized: z.boolean().optional() }).parse(x))
  .handler(async ({ data }) => patchPubs(data.setId, (pubs) => {
    for (const p of pubs) if (isPosted(p) && p.takeIndex === data.takeIndex) {
      if (data.audioOffsetMs !== undefined) p.audioOffsetMs = data.audioOffsetMs;
      if (data.normalized) p.normalizedAt = new Date().toISOString();
    }
  }));
