// transcribe.functions.ts — WORD-LEVEL WHISPER TRANSCRIPTION (Q3).
//
// Runs server-side against OpenAI Whisper's /v1/audio/transcriptions with
// response_format=verbose_json + timestamp_granularities[]=word, so the
// Pipeline gets word timings for karaoke, click-to-seek, and text-based cuts.
// NOT Mux — Mux is the delivery layer; scratch takes must never go there.
//
// The take is already uploaded to canvas-media; this fetches THAT file and POSTs
// it to Whisper, then stores the transcript keyed by storage path (0118).
// Idempotent: an existing row is returned as-is (re-keeping never re-bills).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";

const MISSING = "take_transcripts table missing — apply migration/supabase-migrations/0118_take_transcripts.sql in the Supabase SQL editor";
// OpenAI caps the transcription upload at 25 MB. Short CEQ takes clear this
// easily; a longer one fails LOUD (a worker-side audio extract is the fix).
const MAX_BYTES = 25 * 1024 * 1024;
const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

function rethrow(e: { code?: string; message: string }): never {
  if (isMissingSchema(e, /take_transcript/i)) throw new Error(MISSING);
  throw new Error(e.message);
}

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

export interface TranscriptWord { t: string; s: number; e: number }
export interface TranscriptRow { take_path: string; text: string; words: TranscriptWord[]; model: string; lang: string | null; duration_s: number | null; created_at: string }

const SELECT = "take_path,text,words,model,lang,duration_s,created_at";

/** Read a stored transcript, or null. */
export const getTranscript = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data }): Promise<TranscriptRow | null> => {
    const db = await admin();
    const { data: row, error } = await db.from("take_transcripts").select(SELECT).eq("take_path", data.path).maybeSingle();
    if (error) rethrow(error);
    return (row ?? null) as TranscriptRow | null;
  });

/** Transcribe a kept take (idempotent). Returns the stored row. */
export const transcribeTake = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(500), url: z.string().url(), name: z.string().max(300).optional() }).parse(d))
  .handler(async ({ data }): Promise<TranscriptRow> => {
    const db = await admin();
    // Idempotent: never re-bill a take that's already transcribed.
    const existing = await db.from("take_transcripts").select(SELECT).eq("take_path", data.path).maybeSingle();
    if (existing.error) rethrow(existing.error);
    if (existing.data) return existing.data as TranscriptRow;

    // Lee's key lives in OPENAI_WHISPER; fall back to the conventional name.
    const key = process.env.OPENAI_WHISPER || process.env.OPENAI_API_KEY;
    if (!key) throw new Error("no OpenAI key on the server — set OPENAI_WHISPER (or OPENAI_API_KEY) in Vercel env to enable transcription");
    const model = process.env.WHISPER_MODEL || "whisper-1";

    const fileRes = await fetch(data.url);
    if (!fileRes.ok) throw new Error(`could not fetch the take (${fileRes.status}) — transcription skipped`);
    const buf = await fileRes.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error(`take is ${(buf.byteLength / 1048576).toFixed(1)}MB — over Whisper's 25MB cap; skipped (extract audio on the worker to transcribe long takes)`);

    const form = new FormData();
    form.append("file", new Blob([buf]), data.name || (data.path.split("/").pop() ?? "take.mp4"));
    form.append("model", model);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);
    let json: { text?: string; language?: string; duration?: number; words?: { word: string; start: number; end: number }[] };
    try {
      const res = await fetch(WHISPER_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: ctrl.signal });
      if (!res.ok) throw new Error(`Whisper ${res.status}: ${(await res.text()).slice(0, 300)}`);
      json = await res.json();
    } finally { clearTimeout(timer); }

    const words: TranscriptWord[] = (json.words ?? []).map((w) => ({ t: w.word, s: w.start, e: w.end }));
    const row = { take_path: data.path, text: json.text ?? "", words, model, lang: json.language ?? null, duration_s: json.duration ?? null };
    const up = await db.from("take_transcripts").upsert(row, { onConflict: "take_path" }).select(SELECT).single();
    if (up.error) rethrow(up.error);
    return up.data as TranscriptRow;
  });
