// THE ILLUSTRATION ENDPOINT. Lee's words + the teaching intent + the Survive Dreamstate
// preset → one provider call → the image persisted in OUR bucket → a URL back to the editor.
//
// Called only from the Review stage's Generate / Regenerate buttons. Never from /film, never
// on load, never on a walk — capture must not depend on a live request (the plan carries the
// persisted URL). It costs money per call, so it is admin-gated even though the other Blast
// Off server fns are not: assertAdmin() first, every time.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { composeIllustrationPrompt, illustrationStyle } from "@/components/blastoff/illustration";
import { isMissingSchema } from "@/lib/pg-errors";

const MISSING_BUCKET_HINT = "The canvas-media storage bucket is missing — see migration 0085.";
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
  .handler(async ({ data }): Promise<{
    url: string; path: string; prompt: string; provider: string; model: string; seed: number;
    generatedAt: string; stylePreset: string; styleVersion: number; credits: number | null;
  }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();

    const style = illustrationStyle(data.stylePreset ?? null);
    const prompt = composeIllustrationPrompt(style, data.prompt, data.teachingIntent ?? null);
    const seed = data.seed ?? Math.floor(Math.random() * 4294967295);
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
      result = await provider.generate({ prompt, model: style.model, size: style.size, seed, controls: style.controls, styleId, referenceImageUrl: data.referenceImageUrl ?? null }, ctl.signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error("Recraft took longer than 90 seconds. Try again — your prompt is kept.");
      throw e;
    } finally { clearTimeout(timer); }

    // PERSIST. Every generation is kept (upsert: false) — a re-roll never overwrites, and an
    // earlier picture can be put back. Folder = the set, file = the frame + a time stamp.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = result.contentType === "image/webp" ? "webp" : result.contentType === "image/jpeg" ? "jpg" : "png";
    const path = `illustrations/${data.setId.replace(/[^a-zA-Z0-9_-]/g, "_")}/${data.frameId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now().toString(36)}.${ext}`;
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
        set_id: data.setId, frame_id: data.frameId, title: data.title ?? null, prompt,
        teaching_intent: data.teachingIntent ?? null, style_preset: style.id, style_version: style.version,
        asset_url: pub.publicUrl, asset_path: path, seed, created_by: data.who ?? null, generated_at: generatedAt,
      });
      if (libErr) {
        if (isMissingLibrary(libErr)) console.warn("[illustrate] library not catalogued — run migration/supabase-migrations/20260905_2200_illustration_library.sql");
        else console.warn("[illustrate] library insert failed (picture is saved regardless):", libErr.message);
      }
    } catch (e) { console.warn("[illustrate] library insert threw (picture is saved regardless):", e instanceof Error ? e.message : String(e)); }

    return {
      url: pub.publicUrl, path, prompt, provider: provider.id, model: result.model, seed,
      generatedAt, stylePreset: style.id, styleVersion: style.version, credits: result.credits,
    };
  });

export interface LibraryRow {
  id: string; frameId: string; title: string | null; prompt: string; assetUrl: string;
  stylePreset: string; styleVersion: number; seed: number | null; createdBy: string | null; generatedAt: string;
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
      .select("id,frame_id,title,prompt,asset_url,style_preset,style_version,seed,created_by,generated_at")
      .eq("set_id", data.setId).order("generated_at", { ascending: false }).limit(200);
    if (error) { if (isMissingLibrary(error)) return { rows: [] }; throw new Error(`Could not load the library: ${error.message}`); }
    // seed is bigint (int8) in Postgres — supabase-js hands those back as strings to protect
    // precision beyond 2^53, even though a real seed is a uint32 well inside safe-integer range.
    return { rows: (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string, frameId: r.frame_id as string, title: r.title as string | null, prompt: r.prompt as string,
      assetUrl: r.asset_url as string, stylePreset: r.style_preset as string, styleVersion: r.style_version as number,
      seed: r.seed === null || r.seed === undefined ? null : Number(r.seed), createdBy: r.created_by as string | null, generatedAt: r.generated_at as string,
    })) };
  });
