// THE ILLUSTRATION ENDPOINT. Lee's words + the teaching intent + the Survive Dreamstate
// preset → one provider call → the image persisted in OUR bucket → a URL back to the editor.
//
// Called only from the Review stage's Generate / Regenerate buttons and, since 2026-09-06, the
// bank's regenerate-in-place (/admin/illustrations, one picture at a time). Never from /film,
// never on load, never on a walk — capture must not depend on a live request (the plan carries the
// persisted URL). It costs money per call, so it is admin-gated even though the other Blast
// Off server fns are not: assertAdmin() first, every time.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { composeIllustrationPrompt, illustrationStyle, type FrameIllustration, type IllustrationStyle, type IllustrationTopicKind } from "@/components/blastoff/illustration";
import { frameSchema, type FrameRow } from "@/lib/blastoff-frame-schema";
import { bankKey, bankStyleDefaults, classifyIllustration, illustrationTitle, medianOf, tallyStatuses, targetStyleIdFor, type BankRow, type BankStyleDefault, type BankTotals } from "@/lib/illustration-bank";
import { isMissingSchema } from "@/lib/pg-errors";

const MISSING_BUCKET_HINT = "The canvas-media storage bucket is missing — see migration 0085.";
export const MISSING_LIBRARY_HINT = "run migration/supabase-migrations/20260905_2200_illustration_library.sql";
const isMissingLibrary = (e: { code?: string; message: string }) => isMissingSchema(e, /illustration_library/i);

// illustration_library is new (migration/supabase-migrations/20260905_2200) and so isn't in the
// generated Supabase types yet — same escape hatch as shipped.functions.ts's DB/admin() for the
// same reason, scoped to just this one table so every other supabaseAdmin call here stays fully typed.
type LibraryDB = { from: (t: "illustration_library") => any };
async function libraryDb(): Promise<LibraryDB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LibraryDB;
}

/** Is generation possible right now? Says WHICH thing is missing — the server session or the
 *  key — so the editor never blames the key for a missing cookie (2026-09-05). Never throws. */
export const illustrationStatus = createServerFn({ method: "GET" }).handler(async (): Promise<{ signedIn: boolean; configured: boolean; provider: string; keyLength: number }> => {
  const { adminSessionOk } = await import("@/lib/admin-session.functions");
  let signedIn = false;
  try { signedIn = (await adminSessionOk())?.ok === true; } catch { signedIn = false; }
  const { providerFor } = await import("@/lib/recraft.server");
  const style = illustrationStyle(null);
  const keyLength = (process.env.RECRAFT_API_KEY ?? "").trim().length;
  return { signedIn, configured: signedIn && providerFor(style.provider).configured(), provider: style.provider, keyLength: signedIn ? keyLength : 0 };
});

/** "Test the key": one free call to the provider. Admin-gated; the key itself never leaves. */
export const testIllustrationKey = createServerFn({ method: "POST" }).handler(async (): Promise<{ ok: boolean; credits?: number; email?: string; error?: string }> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { providerFor } = await import("@/lib/recraft.server");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15_000);
  try { return await providerFor(illustrationStyle(null).provider).check(ctl.signal); }
  finally { clearTimeout(t); }
});

export const generateIllustration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(120),
    frameId: z.string().min(1).max(80),
    /** What the picture shows — Lee's words. */
    prompt: z.string().trim().min(2).max(600),
    /** Why — the teaching point. Optional; rides last in the composed prompt. */
    teachingIntent: z.string().trim().max(600).nullable().optional(),
    stylePreset: z.string().max(60).nullable().optional(),
    /** A seed to reproduce; absent = a fresh roll (what Regenerate does). */
    seed: z.number().int().min(0).max(4294967295).optional(),
    /** A photo Lee attached for this generation only (2026-09-05) — a public URL already in
     *  OUR bucket (uploaded client-side first, same path as a fast-track screenshot). */
    referenceImageUrl: z.string().url().max(600).nullable().optional(),
    /** The brief's title, and who asked — carried only to label the library catalog row below;
     *  neither changes what Recraft sees. */
    title: z.string().max(120).nullable().optional(),
    who: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<GenerationResult> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    return runGeneration({
      setId: data.setId, frameId: data.frameId, prompt: data.prompt, teachingIntent: data.teachingIntent ?? null,
      style: illustrationStyle(data.stylePreset ?? null), seed: data.seed, referenceImageUrl: data.referenceImageUrl ?? null,
      title: data.title ?? null, who: data.who ?? null,
    });
  });

export interface GenerationResult {
  url: string; path: string; prompt: string; provider: string; model: string; seed: number;
  generatedAt: string; stylePreset: string; styleVersion: number; credits: number | null;
}

/** THE ONE PROVIDER PATH. Compose → Recraft → our bucket → the library catalogue. Shared by the
 *  editor's Generate (generateIllustration, above) and the bank's regenerate-in-place
 *  (regenerateIllustrationInPlace, below) so the two can never drift — one place knows the
 *  timeout, the path scheme, the bucket hint and the library row. Not admin-gated itself:
 *  every caller asserts first, since this costs money per call. */
async function runGeneration(input: {
  setId: string; frameId: string; prompt: string; teachingIntent: string | null; style: IllustrationStyle;
  /** A seed to reproduce; absent = a fresh roll. */
  seed?: number; referenceImageUrl: string | null; title: string | null; who: string | null;
}): Promise<GenerationResult> {
  const { style } = input;
  const prompt = composeIllustrationPrompt(style, input.prompt, input.teachingIntent);
  const seed = input.seed ?? Math.floor(Math.random() * 4294967295);
  const styleId = process.env[style.styleIdEnv]?.trim() || null;

  const { providerFor } = await import("@/lib/recraft.server");
  const provider = providerFor(style.provider);
  const ctl = new AbortController();
  // Three chained Recraft calls now when a reference photo is attached (a private style from
  // the photo, then generate, then removeBackground for a transparent asset — recraft.server.ts)
  // — 90s gives them room without the button feeling stuck.
  const timer = setTimeout(() => ctl.abort(), 90_000);
  let result;
  try {
    result = await provider.generate({ prompt, model: style.model, size: style.size, seed, controls: style.controls, styleId, referenceImageUrl: input.referenceImageUrl }, ctl.signal);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Recraft took longer than 90 seconds. Try again — your prompt is kept.");
    throw e;
  } finally { clearTimeout(timer); }

  // PERSIST. Every generation is kept (upsert: false) — a re-roll never overwrites, and an
  // earlier picture can be put back. Folder = the set, file = the frame + a time stamp.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ext = result.contentType === "image/webp" ? "webp" : result.contentType === "image/jpeg" ? "jpg" : "png";
  const path = `illustrations/${input.setId.replace(/[^a-zA-Z0-9_-]/g, "_")}/${input.frameId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now().toString(36)}.${ext}`;
  const { error } = await supabaseAdmin.storage.from("canvas-media").upload(path, result.bytes, { contentType: result.contentType, cacheControl: "31536000", upsert: false });
  if (error) {
    if (/bucket.*not.*found/i.test(error.message)) throw new Error(MISSING_BUCKET_HINT);
    throw new Error(`Could not save the image: ${error.message}`);
  }
  const { data: pub } = supabaseAdmin.storage.from("canvas-media").getPublicUrl(path);
  const generatedAt = new Date().toISOString();

  // THE LIBRARY (2026-09-05): every successful generation, catalogued — best-effort. Lee
  // already paid Recraft and has his picture; a missing migration or a transient DB error
  // here must never take that away from him, so it's logged and swallowed, never thrown.
  try {
    const db = await libraryDb();
    const { error: libErr } = await db.from("illustration_library").insert({
      set_id: input.setId, frame_id: input.frameId, title: input.title, prompt,
      teaching_intent: input.teachingIntent, style_preset: style.id, style_version: style.version,
      asset_url: pub.publicUrl, asset_path: path, seed, cost_usd: result.credits === null ? null : result.credits / 1000,
      created_by: input.who, generated_at: generatedAt,
    });
    if (libErr) {
      if (isMissingLibrary(libErr)) console.warn(`[illustrate] library not catalogued — ${MISSING_LIBRARY_HINT}`);
      else console.warn("[illustrate] library insert failed (picture is saved regardless):", libErr.message);
    }
  } catch (e) { console.warn("[illustrate] library insert threw (picture is saved regardless):", e instanceof Error ? e.message : String(e)); }

  return {
    url: pub.publicUrl, path, prompt, provider: provider.id, model: result.model, seed,
    generatedAt, stylePreset: style.id, styleVersion: style.version, credits: result.credits,
  };
}

// ---- THE BANK (2026-09-06 /v3 audit, "real project #2") -----------------------------------------
// "A cross-set list of every stale illustration with a one-click 'switch to current style +
// queue regenerate' would matter every time the style registry gets revised again" — and it just
// was (02de8431: watercolor v4 → riso). Every picture on every live deck's plan, classified by
// the registry's own predicates, and a regenerate that writes the new picture back onto the
// frame it came from. The pure parts live in lib/illustration-bank.ts.

type RawPlanDeck = { id: string; name?: string; topicId?: string | null; blastOff?: { frames?: unknown[]; updatedAt?: string; layout?: unknown } };
type ChapterRow = { id: string; chapter_name: string; chapter_number: number; course_id: string | null };

/** The topic each live deck sits in, the way loadBoothBank tells them apart: a chapter with no
 *  course is a strategy topic (BoothTopic.kind === "strategy"); everything else is exam content. */
async function topicLookup(db: { from: (t: string) => any }): Promise<(deck: RawPlanDeck) => { id: string; name: string; number: number; kind: IllustrationTopicKind }> {
  const { data: rows, error } = await db.from("chapters").select("id,chapter_name,chapter_number,course_id");
  if (error) throw new Error(error.message);
  const byId = new Map<string, ChapterRow>((rows ?? []).map((c: ChapterRow) => [c.id, c]));
  return (deck) => {
    const ch = deck.topicId ? byId.get(deck.topicId) : undefined;
    if (!ch) return { id: "__untopiced", name: "More", number: 9999, kind: undefined };
    return { id: ch.id, name: ch.chapter_name, number: ch.chapter_number ?? 9999, kind: ch.course_id == null ? "strategy" : undefined };
  };
}

const setDisplayName = (n?: string) => (n ?? "Set").replace(/^\s*ch\s*\d+\s*·\s*/i, "").trim() || "Set";

function bankRowFor(frame: FrameRow, i: FrameIllustration & { assetUrl: string }, deck: RawPlanDeck, topic: { id: string; name: string; kind: IllustrationTopicKind }): BankRow {
  return {
    key: bankKey(deck.id, frame.id), setId: deck.id, setName: setDisplayName(deck.name),
    topicId: topic.id, topicName: topic.name, topicKind: topic.kind,
    frameId: frame.id, frameKind: frame.kind, title: illustrationTitle(i), prompt: i.prompt ?? "",
    teachingIntent: i.teachingIntent, stylePreset: i.stylePreset, styleVersion: i.styleVersion, seed: i.seed,
    assetUrl: i.assetUrl, generatedAt: i.generatedAt, status: classifyIllustration(i, topic.kind),
  };
}

export interface IllustrationBank {
  rows: BankRow[];
  totals: BankTotals;
  defaults: { exam: BankStyleDefault; strategy: BankStyleDefault };
  /** The library's median cost_usd across everything on record; null when the library is
   *  missing or empty (the page then says its estimate is a guess). */
  medianCostUsd: number | null;
  /** The library migration is missing — said plainly on the page, since the cost line depends on it. */
  libraryMissing: boolean;
}

/** EVERY PICTURE IN THE BANK: one loadDecksDeduped pass over the live decks, every frame with
 *  a generated picture, classified by the registry's own predicates. Grouped and sorted the
 *  way /v3 lists them — topic number, then set, then frame order in the plan. Free (no Recraft). */
export const listIllustrationsAcrossBank = createServerFn({ method: "GET" })
  .handler(async (): Promise<IllustrationBank> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const { loadDecksDeduped, liveDecks } = await import("@/lib/student.functions");
    const owned = await loadDecksDeduped(db);
    const topicOf = await topicLookup(db);

    const groups: { number: number; name: string; rows: BankRow[] }[] = [];
    for (const o of liveDecks(owned)) {
      const deck = o.deck as RawPlanDeck;
      const raw = deck.blastOff?.frames;
      if (!Array.isArray(raw) || !raw.length) continue;
      const topic = topicOf(deck);
      const rows: BankRow[] = [];
      for (const rf of raw) {
        // Lenient per frame: one malformed frame must not hide a whole set's pictures.
        const parsed = frameSchema.safeParse(rf);
        if (!parsed.success) continue;
        const ill = parsed.data.illustration;
        if (!ill?.assetUrl) continue;
        rows.push(bankRowFor(parsed.data, ill as FrameIllustration & { assetUrl: string }, deck, topic));
      }
      if (rows.length) groups.push({ number: topic.number, name: topic.name, rows });
    }
    groups.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name) || a.rows[0].setName.localeCompare(b.rows[0].setName));
    const rows = groups.flatMap((g) => g.rows);

    // The cost line: the library's median so far. A missing migration is reported, not thrown —
    // the list is still the point of the page; only the estimate degrades to the stated guess.
    let medianCostUsd: number | null = null;
    let libraryMissing = false;
    const lib = await libraryDb();
    const { data: costs, error } = await lib.from("illustration_library").select("cost_usd").not("cost_usd", "is", null).order("generated_at", { ascending: false }).limit(500);
    if (error) {
      if (isMissingLibrary(error)) libraryMissing = true;
      else throw new Error(`Could not read the library: ${error.message}`);
    } else {
      medianCostUsd = medianOf(((costs ?? []) as { cost_usd: unknown }[]).map((r) => Number(r.cost_usd)));
    }

    return { rows, totals: tallyStatuses(rows), defaults: bankStyleDefaults(), medianCostUsd, libraryMissing };
  });

/** REGENERATE IN PLACE: the same subject, the current style, written straight back onto the
 *  frame it came from. The plan is re-read from the scene right before the write, and only
 *  this one frame's `illustration` is patched, so a Review edit saved while Recraft was
 *  drawing (60–90s) is never clobbered. keepSeed (default true) = the frame's own seed, so
 *  the composition rhymes with the picture it replaces and only the medium changes. */
export const regenerateIllustrationInPlace = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(120),
    frameId: z.string().min(1).max(80),
    /** A preset by id; absent = the default for the set's kind (defaultStyleIdFor). */
    stylePreset: z.string().max(60).nullable().optional(),
    keepSeed: z.boolean().optional(),
    who: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ row: BankRow; previousAssetUrl: string; credits: number | null; costUsd: number | null }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const { loadDecksDeduped } = await import("@/lib/student.functions");
    const owned = await loadDecksDeduped(db);
    const o = owned.get(data.setId);
    if (!o) throw new Error("set not found");
    const deck = o.deck as RawPlanDeck;
    const topic = (await topicLookup(db))(deck);

    const rawFrame = (deck.blastOff?.frames ?? []).find((f) => (f as { id?: string })?.id === data.frameId);
    if (!rawFrame) throw new Error(`frame ${data.frameId} is not in this set's plan`);
    const parsed = frameSchema.safeParse(rawFrame);
    if (!parsed.success) throw new Error(`frame ${data.frameId} is malformed — open it on Review first`);
    const frame = parsed.data;
    const ill = frame.illustration;
    if (!ill?.prompt?.trim()) throw new Error("This slide has no subject to regenerate from — write one on Review first.");
    const previousAssetUrl = ill.assetUrl ?? "";

    const style = illustrationStyle(targetStyleIdFor(topic.kind, data.stylePreset ?? null));
    const keepSeed = data.keepSeed ?? true;
    const r = await runGeneration({
      setId: data.setId, frameId: data.frameId, prompt: ill.prompt, teachingIntent: ill.teachingIntent, style,
      ...(keepSeed && ill.seed !== null ? { seed: ill.seed } : {}), referenceImageUrl: ill.referencePhoto?.url ?? null,
      title: ill.summary?.title ?? null, who: data.who ?? null,
    });

    // WRITE BACK — re-read the scene now (Recraft took a minute; Review may have saved since),
    // patch only this frame's illustration, write the whole plan the way saveBlastPlan does.
    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
    if (error) throw new Error(error.message);
    const j = row.nodes_json as { decks?: RawPlanDeck[] };
    const liveDeck = (j.decks ?? []).find((d) => d.id === data.setId);
    if (!liveDeck) throw new Error("set not found in its scene — the picture is saved in the library but nothing was written to the plan");
    const frames = Array.isArray(liveDeck.blastOff?.frames) ? liveDeck.blastOff!.frames! : [];
    const target = frames.find((f) => (f as { id?: string })?.id === data.frameId) as { illustration?: Partial<FrameIllustration> | null } | undefined;
    if (!target) throw new Error(`frame ${data.frameId} left the plan while Recraft was drawing — the picture is in the library, nothing was written`);
    const prev = (target.illustration ?? {}) as Partial<FrameIllustration>;
    const next: FrameIllustration = {
      ...(prev as FrameIllustration),
      requested: true, prompt: prev.prompt ?? ill.prompt, teachingIntent: prev.teachingIntent ?? ill.teachingIntent,
      provider: r.provider, stylePreset: r.stylePreset, styleVersion: r.styleVersion, assetUrl: r.url, localAssetId: r.path,
      seed: r.seed, generatedAt: r.generatedAt,
      animationPreset: prev.animationPreset ?? style.defaultAnimation,
    };
    target.illustration = next;
    const layout = liveDeck.blastOff?.layout === "pass2" ? "pass2" : liveDeck.blastOff?.layout === "pass1" ? "pass1" : undefined;
    liveDeck.blastOff = { frames, updatedAt: new Date().toISOString(), ...(layout ? { layout } : {}) };
    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
    if (up.error) throw new Error(up.error.message);

    return {
      row: bankRowFor({ ...frame, illustration: next }, next as FrameIllustration & { assetUrl: string }, liveDeck, topic),
      previousAssetUrl, credits: r.credits, costUsd: r.credits === null ? null : r.credits / 1000,
    };
  });

export interface LibraryRow {
  id: string; frameId: string; title: string | null; prompt: string; assetUrl: string;
  stylePreset: string; styleVersion: number; seed: number | null; costUsd: number | null; createdBy: string | null; generatedAt: string;
}

/** THE LIBRARY, for one CEQ set — every illustration ever generated for it, newest first, free
 *  to browse (no Recraft call). Missing migration → an empty list, not an error: the picker
 *  should just look empty on a server that hasn't run it yet, never break the editor. */
export const listIllustrationLibrary = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ rows: LibraryRow[] }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await libraryDb();
    const { data: rows, error } = await db.from("illustration_library")
      .select("id,frame_id,title,prompt,asset_url,style_preset,style_version,seed,cost_usd,created_by,generated_at")
      .eq("set_id", data.setId).order("generated_at", { ascending: false }).limit(200);
    if (error) { if (isMissingLibrary(error)) return { rows: [] }; throw new Error(`Could not load the library: ${error.message}`); }
    // seed is bigint (int8) in Postgres — supabase-js hands those back as strings to protect
    // precision beyond 2^53, even though a real seed is a uint32 well inside safe-integer range.
    return { rows: (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string, frameId: r.frame_id as string, title: r.title as string | null, prompt: r.prompt as string,
      assetUrl: r.asset_url as string, stylePreset: r.style_preset as string, styleVersion: r.style_version as number,
      seed: r.seed === null || r.seed === undefined ? null : Number(r.seed),
      costUsd: r.cost_usd === null || r.cost_usd === undefined ? null : Number(r.cost_usd),
      createdBy: r.created_by as string | null, generatedAt: r.generated_at as string,
    })) };
  });
