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

// B0: generation goes through the ONE ai.server door (Vercel AI SDK over the
// Gateway, task->model registry, retries + fallback + usage). No fetch here.

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
const passTag = z.object({ tag: z.string().max(20), at: iso, focusedCeqLabel: z.string().max(400).nullable().optional(), source: z.enum(["tap", "ai"]), note: z.string().max(4000).nullable().optional() });

const passInput = z.object({
  setName: z.string().max(400),
  ceqs: z.array(passCeq).max(200),
  segments: z.array(passSegment).max(3000),
  tags: z.array(passTag).max(500),
  regen: z.object({
    kind: z.enum(["ceq_order", "outline", "exhibit", "bank", "vibe", "short", "phrase", "accuracy"]),
    previous: z.record(z.string(), z.unknown()),
    comment: z.string().max(20_000),
  }).optional(),
});

/** THE BUTTON. Returns the model's raw text — the pure parser turns it into
 *  board items client-side, where the local-first store mints and owns rows.
 *  A failure here is a thrown, human-readable error; it never touches data. */
export const runTalkthroughPass = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => passInput.parse(d))
  .handler(async ({ data }): Promise<{ text: string; model: string; usage: { inputTokens: number; outputTokens: number; costUsd: number } }> => {

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
      tags: data.tags.map((t) => ({ tag: t.tag as never, at: t.at, focusedCeqLabel: t.focusedCeqLabel ?? null, source: t.source, note: t.note ?? null })),
      docs: { method, bible, blastOff },
    };
    const { system, user } = data.regen
      ? buildRegenMessages(ctx, data.regen.kind as BoardKind, data.regen.previous, data.regen.comment)
      : buildPassMessages(ctx);

    const { runAiTask } = await import("@/lib/ai.server");
    const r = await runAiTask("synthesis", { system, user });
    return { text: r.text, model: r.usage.model, usage: { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costUsd: r.usage.costUsd } };
  });

// ------------------------------------------------------------ booth bank

/** THE BOOTH'S BANK — the SAME store the student player reads (canvas_scenes
 *  via student.functions' loadDecksDeduped: live, unparked card decks grouped
 *  by chapter), with the studio-only extras a student never sees: draft CEQs
 *  (DRAFT-chipped in the booth), needs_exhibit and the master sheet's notes.
 *  Soft-archived cards stay out everywhere. One store, two dress codes. */
export interface BoothCeq {
  id: string;
  label: string;
  stem: string;
  choices: { text: string; correct: boolean; feedback?: string }[];
  draft: boolean;
  noteOnly: boolean;
  needsExhibit: string | null;
  masterNotes: string | null;
}
export interface BoothSetInfo { id: string; name: string; ceqs: BoothCeq[]; liveCount: number; draftCount: number }
export interface BoothTopic { id: string; name: string; number: number | null; sets: BoothSetInfo[] }

export const loadBoothBank = createServerFn({ method: "POST" }).handler(async (): Promise<{ topics: BoothTopic[] }> => {
  const { loadDecksDeduped, liveDecks } = await import("@/lib/student.functions");
  const db = await admin();
  const owned = await loadDecksDeduped(db as never);
  type CardData = { deckId?: string; stageOrder?: number; prompt?: string; shorthand?: string; title?: string; noteOnly?: boolean; draft?: boolean; bankArchived?: string; needsExhibit?: string; masterNotes?: string; choices?: { text?: string; correct?: boolean; feedback?: string }[] };
  const { data: chapterRows, error } = await db.from("chapters").select("id,chapter_name,chapter_number");
  if (error) rethrow(error);
  const chById = new Map((chapterRows ?? []).map((c: { id: string; chapter_name: string; chapter_number: number }) => [c.id, c]));

  const topics = new Map<string, BoothTopic>();
  for (const o of liveDecks(owned)) {
    const d = o.deck as { id: string; name: string; topicId?: string | null; sortOrder?: number };
    const ch = d.topicId ? chById.get(d.topicId) as { id: string; chapter_name: string; chapter_number: number } | undefined : undefined;
    const tid = ch?.id ?? "__untopiced";
    if (!topics.has(tid)) topics.set(tid, { id: tid, name: ch?.chapter_name ?? "More", number: ch?.chapter_number ?? 9999, sets: [] });
    const cards = (o.nodes as { id: string; data?: CardData }[])
      .map((n) => ({ id: n.id, d: n.data ?? {} }))
      .filter((c) => !c.d.bankArchived)
      .sort((a, b) => (a.d.stageOrder ?? 0) - (b.d.stageOrder ?? 0));
    const ceqs: BoothCeq[] = cards.map((c, i) => ({
      id: c.id,
      label: String(c.d.shorthand || `Q${i + 1}`),
      stem: String(c.d.prompt ?? ""),
      choices: (Array.isArray(c.d.choices) ? c.d.choices : []).map((ch2) => ({ text: String(ch2.text ?? ""), correct: !!ch2.correct, ...(ch2.feedback ? { feedback: String(ch2.feedback) } : {}) })),
      draft: !!c.d.draft,
      noteOnly: !!c.d.noteOnly,
      needsExhibit: c.d.needsExhibit ? String(c.d.needsExhibit) : null,
      masterNotes: c.d.masterNotes ? String(c.d.masterNotes) : null,
    }));
    topics.get(tid)!.sets.push({
      id: d.id, name: d.name, ceqs,
      liveCount: ceqs.filter((c) => !c.draft && !c.noteOnly).length,
      draftCount: ceqs.filter((c) => c.draft && !c.noteOnly).length,
    });
  }
  const list = [...topics.values()].sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999) || a.name.localeCompare(b.name));
  for (const t of list) {
    const key = new Map(t.sets.map((s) => {
      const o = owned.get(s.id);
      return [s.id, (o?.deck as { sortOrder?: number } | undefined)?.sortOrder ?? 9999];
    }));
    t.sets.sort((a, b) => (key.get(a.id)! - key.get(b.id)!) || a.name.localeCompare(b.name));
  }
  return { topics: list };
});

// ------------------------------------------------------------- micro door

/** B0's micro lane — background drafts (rewords, choice revisions, memo
 *  drafts, style distillation) fired the moment a stamp context closes.
 *  Prompt assembly stays in pure client modules (testable); this is only the
 *  registry call + usage. */
export const runMicro = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    system: z.string().max(40_000),
    user: z.string().max(80_000),
    maxOutput: z.number().int().min(1).max(2_000).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { runAiTask } = await import("@/lib/ai.server");
    const r = await runAiTask("micro", { system: data.system, user: data.user, maxOutput: data.maxOutput });
    return { text: r.text, model: r.usage.model, usage: { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costUsd: r.usage.costUsd } };
  });
