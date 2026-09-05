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

const MISSING_BUCKET_HINT = "The canvas-media storage bucket is missing — see migration 0085.";

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
    const timer = setTimeout(() => ctl.abort(), 60_000);
    let result;
    try {
      result = await provider.generate({ prompt, model: style.model, size: style.size, seed, controls: style.controls, styleId }, ctl.signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error("Recraft took longer than 60 seconds. Try again — your prompt is kept.");
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

    return {
      url: pub.publicUrl, path, prompt, provider: provider.id, model: result.model, seed,
      generatedAt: new Date().toISOString(), stylePreset: style.id, styleVersion: style.version, credits: result.credits,
    };
  });
