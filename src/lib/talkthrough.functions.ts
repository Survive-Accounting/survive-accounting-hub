// talkthrough.functions.ts — server side of THE TALKTHROUGH BOOTH.
//
// Three doors, all service-role / RLS-deny-by-default / fail-loud (the
// idea-bank.functions shape, which is the house pattern):
//
//   · list/upsert — the sync backend for the local-first client. Client-minted
//     ids make the upsert idempotent; a queued retry can never duplicate.
//   · stagingPublicUrl — re-derives the durable public URL for a stored chunk
//     path, so transcription retries survive a refresh.
//   · runTalkthroughPass — "Draft the starting points". Assembles the messages
//     (pure builder + the reference docs, which SHIP IN THE BUNDLE via ?raw
//     imports because Vercel serverless has no repo tree at runtime), calls
//     the AI Gateway (the ONLY configured LLM door — no new providers), and
//     returns the model's RAW text. Parsing happens client-side in the pure,
//     tested module; a garbage reply surfaces as a visible, retryable error
//     and can never touch a transcript.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { buildPassMessages, buildRegenMessages, type PassContext } from "@/components/canvas/talkthrough-pass";
import type { BoardKind } from "@/components/canvas/talkthrough";
import { isMissingSchema } from "@/lib/pg-errors";

const MISSING = "talkthrough tables missing — apply migration/supabase-migrations/20260828_0900_talkthrough_booth.sql in the Supabase SQL editor";

function rethrow(e: { code?: string; message: string }): never {
  if (isMissingSchema(e, /talkthrough/i)) throw new Error(MISSING);
  throw new Error(e.message);
}

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any; storage: { from: (b: string) => any } };
};

// ------------------------------------------------------------- row schemas

const iso = z.string().min(4);
const sessionRow = z.object({ id: z.string().min(1).max(120), set_id: z.string().max(200), set_name: z.string().max(400), started_at: iso, ended_at: iso.nullable(), created_at: iso, updated_at: iso, archived_at: iso.nullable() });
const segmentRow = z.object({ id: z.string().min(1).max(120), session_id: z.string().max(120), seq: z.number().int(), text: z.string().max(60_000), source: z.string().max(16), whisper_pending: z.boolean(), audio_path: z.string().max(500).nullable(), focused_ceq_id: z.string().max(200).nullable(), focused_ceq_label: z.string().max(400).nullable(), started_at: iso, ended_at: iso.nullable(), created_at: iso, updated_at: iso, archived_at: iso.nullable() });
const tagRow = z.object({ id: z.string().min(1).max(120), session_id: z.string().max(120), tag: z.string().max(20), at: iso, focused_ceq_id: z.string().max(200).nullable(), focused_ceq_label: z.string().max(400).nullable(), source: z.string().max(10), note: z.string().max(4000).nullable(), created_at: iso, updated_at: iso, archived_at: iso.nullable() });
const boardRow = z.object({ id: z.string().min(1).max(130), session_id: z.string().max(120), run_id: z.string().max(120), kind: z.string().max(20), title: z.string().max(1000), payload: z.record(z.string(), z.unknown()), quote: z.string().max(20_000), ceq_ids: z.array(z.string().max(200)).max(200), status: z.string().max(16), comment: z.string().max(20_000), created_at: iso, updated_at: iso, archived_at: iso.nullable() });

const S_SESSIONS = "id,set_id,set_name,started_at,ended_at,created_at,updated_at,archived_at";
const S_SEGMENTS = "id,session_id,seq,text,source,whisper_pending,audio_path,focused_ceq_id,focused_ceq_label,started_at,ended_at,created_at,updated_at,archived_at";
const S_TAGS = "id,session_id,tag,at,focused_ceq_id,focused_ceq_label,source,note,created_at,updated_at,archived_at";
const S_BOARD = "id,session_id,run_id,kind,title,payload,quote,ceq_ids,status,comment,created_at,updated_at,archived_at";

// ----------------------------------------------------------------- list/upsert

/** Everything, archived included — the client decides what to show, and an
 *  archived row must round-trip so restore works on any machine. */
export const listTalkthrough = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const [sessions, segments, tags, boardItems] = await Promise.all([
    db.from("talkthrough_sessions").select(S_SESSIONS).order("started_at", { ascending: false }).limit(500),
    db.from("talkthrough_segments").select(S_SEGMENTS).order("started_at", { ascending: true }).limit(20_000),
    db.from("talkthrough_tags").select(S_TAGS).order("at", { ascending: true }).limit(5_000),
    db.from("talkthrough_board_items").select(S_BOARD).order("created_at", { ascending: true }).limit(5_000),
  ]);
  for (const r of [sessions, segments, tags, boardItems]) if (r.error) rethrow(r.error);
  return {
    sessions: sessions.data ?? [], segments: segments.data ?? [],
    tags: tags.data ?? [], boardItems: boardItems.data ?? [],
  };
});

/** Push a batch across all four stores. UPSERT on client-minted ids. Returns
 *  the acknowledged {id, updated_at} pairs so the client stamps syncedAt from
 *  what the server actually holds. */
export const upsertTalkthrough = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    sessions: z.array(sessionRow).max(200).default([]),
    segments: z.array(segmentRow).max(2000).default([]),
    tags: z.array(tagRow).max(1000).default([]),
    boardItems: z.array(boardRow).max(1000).default([]),
  }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const put = async (table: string, rows: unknown[], select: string): Promise<{ id: string; updated_at: string }[]> => {
      if (!rows.length) return [];
      const { data: out, error } = await db.from(table).upsert(rows, { onConflict: "id" }).select(select);
      if (error) rethrow(error);
      return ((out ?? []) as { id: string; updated_at: string }[]).map((r) => ({ id: r.id, updated_at: r.updated_at }));
    };
    return {
      sessions: await put("talkthrough_sessions", data.sessions, "id,updated_at"),
      segments: await put("talkthrough_segments", data.segments, "id,updated_at"),
      tags: await put("talkthrough_tags", data.tags, "id,updated_at"),
      boardItems: await put("talkthrough_board_items", data.boardItems, "id,updated_at"),
    };
  });

// -------------------------------------------------------------- staging URL

/** Durable public URL for a stored chunk path — the refresh-safe half of the
 *  transcription retry loop. Read-only; canvas-media is the same public bucket
 *  every staged upload already uses. */
export const stagingPublicUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data }): Promise<{ publicUrl: string }> => {
    const db = await admin();
    const { data: pub } = db.storage.from("canvas-media").getPublicUrl(data.path);
    if (!pub?.publicUrl) throw new Error("could not derive a public URL for the staged audio");
    return { publicUrl: pub.publicUrl };
  });

// ----------------------------------------------------------------- the pass

const AI_TIMEOUT_MS = 180_000;
// A synthesis job over a long transcript — bigger default than the one-shot
// haiku suggestions elsewhere; same gateway, same key, env-overridable.
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

const passCeq = z.object({
  id: z.string().max(200), label: z.string().max(400), stem: z.string().max(8000),
  choices: z.array(z.object({ text: z.string().max(2000), correct: z.boolean(), feedback: z.string().max(4000).optional() })).max(12),
  noteOnly: z.boolean().optional(),
});
const passSegment = z.object({
  id: z.string().max(120), seq: z.number().int(), text: z.string().max(60_000),
  focusedCeqId: z.string().max(200).nullable().optional(), focusedCeqLabel: z.string().max(400).nullable().optional(),
  source: z.enum(["live", "whisper"]), whisperPending: z.boolean(),
});
const passTag = z.object({ tag: z.string().max(20), at: iso, focusedCeqLabel: z.string().max(400).nullable().optional(), source: z.enum(["tap", "ai"]) });

const passInput = z.object({
  setName: z.string().max(400),
  ceqs: z.array(passCeq).max(200),
  segments: z.array(passSegment).max(3000),
  tags: z.array(passTag).max(500),
  regen: z.object({
    kind: z.enum(["ceq_order", "outline", "exhibit", "vibe", "short", "phrase", "accuracy"]),
    previous: z.record(z.string(), z.unknown()),
    comment: z.string().max(20_000),
  }).optional(),
});

/** THE BUTTON. Returns the model's raw text — the pure parser turns it into
 *  board items client-side, where the local-first store mints and owns rows.
 *  A failure here is a thrown, human-readable error; it never touches data. */
export const runTalkthroughPass = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => passInput.parse(d))
  .handler(async ({ data }): Promise<{ text: string; model: string }> => {
    const aiKey = process.env.AI_GATEWAY_API_KEY;
    if (!aiKey) throw new Error("AI_GATEWAY_API_KEY is not configured on the server — the AI pass needs the existing gateway key");
    const model = process.env.TALKTHROUGH_MODEL || DEFAULT_MODEL;

    // The reference docs ship in the serverless bundle — ?raw, resolved at build.
    const [method, bible, blastOff] = await Promise.all([
      import("../../docs/SURVIVE_METHOD_v1.md?raw").then((m) => m.default),
      import("../../docs/EXHIBIT-PRODUCTION-BIBLE-v1.md?raw").then((m) => m.default),
      import("../../docs/SURVIVE_MASTER_CONTEXT_V2.md?raw").then((m) => m.default),
    ]);

    const ctx: PassContext = {
      setName: data.setName,
      ceqs: data.ceqs,
      segments: data.segments.map((s) => ({ ...s, focusedCeqId: s.focusedCeqId ?? null, focusedCeqLabel: s.focusedCeqLabel ?? null })),
      tags: data.tags.map((t) => ({ tag: t.tag as never, at: t.at, focusedCeqLabel: t.focusedCeqLabel ?? null, source: t.source })),
      docs: { method, bible, blastOff },
    };
    const { system, user } = data.regen
      ? buildRegenMessages(ctx, data.regen.kind as BoardKind, data.regen.previous, data.regen.comment)
      : buildPassMessages(ctx);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({ model, max_tokens: 16_000, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`AI pass failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) throw new Error("AI pass returned an empty reply — retry");
      return { text, model };
    } finally { clearTimeout(timer); }
  });
