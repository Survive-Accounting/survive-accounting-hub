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
  /** The social cut — this part with the outro appended — once it has been made (cached so a
   *  second download is instant). Cleared by a fix, since the fix changes the picture. */
  socialUrl: string | null;
  /** Seconds cut off the FRONT of the original (Lee, 09-17: "trim the front of each of these before I do the
   *  social posts" — the hook that works on a feed is dead weight in a series). Every fix re-cuts from the
   *  original at this start; the social cut starts from the posted file, so it inherits it. */
  trimStartS: number;
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
    socialUrl: typeof p.socialUrl === "string" ? p.socialUrl : null,
    trimStartS: typeof p.trimStartS === "number" && p.trimStartS > 0 ? p.trimStartS : 0,
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

/** HIDE A PART FROM THE SITE (2026-09-16) — or show it again. The video stays posted and in the bank. */
export const setLearnHidden = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({ setId: z.string().min(1).max(200), takeIndex: z.number().int().min(0).max(99), hidden: z.boolean() }).parse(x))
  .handler(async ({ data }) => patchPubs(data.setId, (pubs) => {
    for (const p of pubs) if (isPosted(p) && p.takeIndex === data.takeIndex) { if (data.hidden) p.hidden = true; else delete p.hidden; }
  }));

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
  .inputValidator((x: unknown) => z.object({ setId: z.string().min(1).max(200), takeIndex: z.number().int().min(0).max(99), audioOffsetMs: z.number().int().min(-2000).max(2000).optional(), normalized: z.boolean().optional(), trimStartS: z.number().min(0).max(600).optional() }).parse(x))
  .handler(async ({ data }) => patchPubs(data.setId, (pubs) => {
    for (const p of pubs) if (isPosted(p) && p.takeIndex === data.takeIndex) {
      if (data.audioOffsetMs !== undefined) p.audioOffsetMs = data.audioOffsetMs;
      if (data.normalized) p.normalizedAt = new Date().toISOString();
      if (data.trimStartS !== undefined) { if (data.trimStartS > 0) p.trimStartS = data.trimStartS; else delete p.trimStartS; }
      delete p.socialUrl; // the picture changed — the cached outro cut is stale
    }
  }));

/** THE SOCIAL CUT was made — remember its URL on the part so the next download is instant. */
export const noteSocialFile = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({ setId: z.string().min(1).max(200), takeIndex: z.number().int().min(0).max(99), socialUrl: z.string().url().max(600) }).parse(x))
  .handler(async ({ data }) => patchPubs(data.setId, (pubs) => {
    for (const p of pubs) if (isPosted(p) && p.takeIndex === data.takeIndex) p.socialUrl = data.socialUrl;
  }));

// ── THE OUTRO CLIP, on the site ───────────────────────────────────────────────────────────────
// Punch-in kept the filmed outro only in that browser's localStorage (sa-punch-outro-clip), so no
// other page — and no other machine — could append it. It now also lives in site_settings, written
// from punch-in when Lee keeps an outro and settable from /admin/learn with "Use this device's outro".
export interface SocialOutro { url: string; durationS: number; at: number }
const outroOf = (s: Record<string, unknown>): SocialOutro | null => {
  const v = s.socialOutroClip as Partial<SocialOutro> | undefined;
  return v && typeof v.url === "string" && typeof v.durationS === "number" && v.durationS > 0 ? { url: v.url, durationS: v.durationS, at: typeof v.at === "number" ? v.at : 0 } : null;
};
export const getSocialOutro = createServerFn({ method: "GET" }).handler(async (): Promise<SocialOutro | null> => {
  const d = await db();
  const { data } = await d.from("site_settings").select("settings").eq("id", 1).maybeSingle();
  return outroOf(((data?.settings as Record<string, unknown> | null) ?? {}));
});
export const setSocialOutro = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({ url: z.string().url().max(600), durationS: z.number().min(0.5).max(120) }).parse(x))
  .handler(async ({ data }): Promise<SocialOutro> => {
    const d = await db();
    const { data: row } = await d.from("site_settings").select("settings").eq("id", 1).maybeSingle();
    const cur = ((row?.settings as Record<string, unknown> | null) ?? {});
    const clip: SocialOutro = { url: data.url, durationS: data.durationS, at: Date.now() };
    const { error } = await d.from("site_settings").upsert({ id: 1, settings: { ...cur, socialOutroClip: clip } }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return clip;
  });


// ── THE FIRST WORDS of a posted video, with their times ───────────────────────────────────────
// So Lee can see where the hook ends and tap the word the video should start on. Transcripts are
// keyed by the canvas-media storage path (take_transcripts, 0118); a posted part's sourceUrl is
// that file's public URL, so the path is read straight off it. Missing ⇒ transcribed now (Whisper,
// about half a cent a minute), stored, and never billed again.
const pathOfCanvasMedia = (url: string): string | null => {
  const m = /\/object\/public\/canvas-media\/(.+?)(?:\?|$)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
};
export interface FirstWords { path: string; durationS: number | null; words: { t: string; s: number; e: number }[]; text: string }
export const learnPartFirstWords = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({ sourceUrl: z.string().url().max(600), name: z.string().max(300).optional(), seconds: z.number().min(5).max(120).default(40) }).parse(x))
  .handler(async ({ data }): Promise<FirstWords> => {
    await db(); // admin gate
    const path = pathOfCanvasMedia(data.sourceUrl);
    if (!path) throw new Error("This video's file isn't in canvas-media, so there is no transcript to read.");
    const { transcribeTakeCore } = await import("@/lib/transcribe.functions");
    const row = await transcribeTakeCore({ path, url: data.sourceUrl, name: data.name });
    const words = (row.words ?? []).filter((w) => w.s <= data.seconds);
    return { path, durationS: row.duration_s, words, text: row.text };
  });

/** WHERE DOES THE HOOK END? Haiku reads the first words and names the second the real content starts —
 *  a suggestion Lee taps to accept or ignores. 0 means "keep the whole front". */
export const suggestLearnTrim = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => z.object({ words: z.array(z.object({ t: z.string(), s: z.number(), e: z.number() })).max(400), name: z.string().max(300).optional() }).parse(x))
  .handler(async ({ data }): Promise<{ startS: number; why: string }> => {
    await db();
    if (!data.words.length) return { startS: 0, why: "No words to read." };
    const { runAiTask } = await import("@/lib/ai.server");
    const lines = data.words.map((w) => `[${w.s.toFixed(1)}] ${w.t}`).join(" ");
    const r = await runAiTask("micro", {
      system: "You edit short vertical accounting-lesson videos that play in a SERIES on a study site. A 'hook' is an opening line whose only job is to stop a scroll on social media ('Every accounting exam asks this…', 'Stop losing points…', a rhetorical question, a tease). In a series the hook is dead weight; the video should start where the teaching starts. Given the first words with their start times in seconds, answer with STRICT JSON only: {\"startS\": <number>, \"why\": <one short sentence>}. startS is the start time of the FIRST word of real content, or 0 if the video should keep its opening. Never cut into a sentence.",
      user: `Video: ${data.name ?? ""}\nFirst words: ${lines}`,
      maxOutput: 120,
    });
    const m = /\{[\s\S]*\}/.exec(r.text);
    if (!m) return { startS: 0, why: "Couldn't read the suggestion." };
    try {
      const j = JSON.parse(m[0]) as { startS?: unknown; why?: unknown };
      const startS = typeof j.startS === "number" && j.startS >= 0 ? Math.round(j.startS * 10) / 10 : 0;
      return { startS, why: typeof j.why === "string" ? j.why : "" };
    } catch { return { startS: 0, why: "Couldn't read the suggestion." }; }
  });

