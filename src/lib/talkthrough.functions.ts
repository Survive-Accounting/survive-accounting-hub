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
const tagRow = z.object({ id: z.string().min(1).max(120), session_id: z.string().max(120), tag: z.string().max(20), at: iso, ended_at: iso.nullable().optional(), starred: z.boolean().optional(), focused_ceq_id: z.string().max(200).nullable(), focused_ceq_label: z.string().max(400).nullable(), source: z.string().max(10), note: z.string().max(4000).nullable(), created_at: iso, updated_at: iso, archived_at: iso.nullable() });
const boardRow = z.object({ id: z.string().min(1).max(130), session_id: z.string().max(120), run_id: z.string().max(120), kind: z.string().max(20), title: z.string().max(1000), payload: z.record(z.string(), z.unknown()), quote: z.string().max(20_000), ceq_ids: z.array(z.string().max(200)).max(200), status: z.string().max(16), comment: z.string().max(20_000), created_at: iso, updated_at: iso, archived_at: iso.nullable() });

const S_SESSIONS = "id,set_id,set_name,started_at,ended_at,created_at,updated_at,archived_at";
const S_SEGMENTS = "id,session_id,seq,text,source,whisper_pending,audio_path,focused_ceq_id,focused_ceq_label,started_at,ended_at,created_at,updated_at,archived_at";
const S_TAGS = "id,session_id,tag,at,ended_at,starred,focused_ceq_id,focused_ceq_label,source,note,created_at,updated_at,archived_at";
const S_BOARD = "id,session_id,run_id,kind,title,payload,quote,ceq_ids,status,comment,created_at,updated_at,archived_at";

// ----------------------------------------------------------------- list/upsert

/** Everything, archived included — the client decides what to show, and an
 *  archived row must round-trip so restore works on any machine. */
export const listTalkthrough = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const [sessions, segments, boardItems] = await Promise.all([
    db.from("talkthrough_sessions").select(S_SESSIONS).order("started_at", { ascending: false }).limit(500),
    db.from("talkthrough_segments").select(S_SEGMENTS).order("started_at", { ascending: true }).limit(20_000),
    db.from("talkthrough_board_items").select(S_BOARD).order("created_at", { ascending: true }).limit(5_000),
  ]);
  // v2 columns (ended_at/starred) degrade gracefully until the 20260829_0900
  // migration runs — the booth keeps syncing, stars just don't round-trip yet.
  let tags = await db.from("talkthrough_tags").select(S_TAGS).order("at", { ascending: true }).limit(5_000);
  if (tags.error && /ended_at|starred|column/i.test(String(tags.error.message ?? ""))) {
    console.warn("[talkthrough] tags v2 columns missing — apply migration/supabase-migrations/20260829_0900_talkthrough_v2.sql");
    tags = await db.from("talkthrough_tags").select("id,session_id,tag,at,focused_ceq_id,focused_ceq_label,source,note,created_at,updated_at,archived_at").order("at", { ascending: true }).limit(5_000);
  }
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
      let { data: out, error } = await db.from(table).upsert(rows, { onConflict: "id" }).select(select);
      // Pre-migration tolerance: strip the v2 tag columns and retry ONCE, loudly.
      if (error && table === "talkthrough_tags" && /ended_at|starred|column/i.test(String(error.message ?? ""))) {
        console.warn("[talkthrough] tags v2 columns missing on upsert — apply 20260829_0900_talkthrough_v2.sql (stars/contexts not persisting server-side yet)");
        const stripped = (rows as Record<string, unknown>[]).map(({ ended_at, starred, ...rest }) => { void ended_at; void starred; return rest; });
        ({ data: out, error } = await db.from(table).upsert(stripped, { onConflict: "id" }).select("id,updated_at"));
      }
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
  /** Saved edits on the card that can be reverted (applyCeqEdit history). */
  edits: number;
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
      // FILM FRAMES ARE NOT BANK CARDS (Lee, 2026-09-03: "Are the Board of
      // Directors… has shown up twice … We only want the named slots, not
      // note frame duplicate"). Send-to-film writes the plan's detour and
      // spine frames into the set as note nodes with provenance "blast-off";
      // reading those back as set cards made the plan duplicate its own
      // inserts. They belong to the plan, so the bank never lists them.
      .filter((c) => !c.d.bankArchived && (c.d as { provenance?: string }).provenance !== "blast-off")
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
      edits: Array.isArray((c.d as { editHistory?: unknown }).editHistory) ? ((c.d as { editHistory: unknown[] }).editHistory).length : 0,
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

// ---------------------------------------------------------- B3: review + apply

const reviewStamp = z.object({ kind: z.string().max(30), ceqLabel: z.string().max(400).nullable(), starred: z.boolean(), spoken: z.string().max(8000) });
const reviewInput = z.object({
  setName: z.string().max(400),
  ceqs: z.array(passCeq).max(200),
  segments: z.array(passSegment).max(3000),
  stamps: z.array(reviewStamp).max(300),
  excludedKinds: z.array(z.string().max(30)).max(30),
  styleNotes: z.array(z.string().max(300)).max(12),
  wantVibePlan: z.boolean(),
  regen: z.object({
    kind: z.enum(["script", "ceq_edit", "idea", "vibe_plan"]),
    previous: z.record(z.string(), z.unknown()),
    comments: z.array(z.string().max(4000)).max(10),
  }).optional(),
  /** B8 — PARTIAL OUTPUT: the generation queue asks for one slice of the board
   *  at a time (the script task takes "script"), so the first card lands fast.
   *  Absent = the classic whole-board pass, unchanged. */
  only: z.array(z.string().max(40)).max(8).optional(),
});

/** B3 — the End Session synthesis. Returns raw text + usage; the pure parser
 *  turns it into the review board client-side. Runs on the synthesis lane. */
export const runTalkthroughReview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => reviewInput.parse(d))
  .handler(async ({ data }) => {
    const [method, bible, blastOff] = await Promise.all([
      import("../../docs/SURVIVE_METHOD_v1.md?raw").then((m) => m.default),
      import("../../docs/EXHIBIT-PRODUCTION-BIBLE-v1.md?raw").then((m) => m.default),
      import("../../docs/SURVIVE_MASTER_CONTEXT_V2.md?raw").then((m) => m.default),
    ]);
    const { buildReviewMessages, buildReviewOnlyMessages, buildReviewRegenMessages } = await import("@/components/canvas/talkthrough-pass");
    const ctxForBuild = {
      setName: data.setName,
      ceqs: data.ceqs,
      segments: data.segments.map((s) => ({ ...s, focusedCeqId: s.focusedCeqId ?? null, focusedCeqLabel: s.focusedCeqLabel ?? null })),
      tags: [],
      docs: { method, bible, blastOff },
      stamps: data.stamps,
      excludedKinds: data.excludedKinds,
      styleNotes: data.styleNotes,
      wantVibePlan: data.wantVibePlan,
    };
    const { system, user } = data.regen
      ? buildReviewRegenMessages(ctxForBuild, data.regen.kind, data.regen.previous, data.regen.comments)
      : data.only?.length
        ? buildReviewOnlyMessages(ctxForBuild, data.only)
        : buildReviewMessages(ctxForBuild);
    const { runAiTask } = await import("@/lib/ai.server");
    const r = await runAiTask("synthesis", { system, user });
    return { text: r.text, model: r.usage.model, usage: { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costUsd: r.usage.costUsd } };
  });

/** B3 — APPROVE APPLIES TO THE BANK: write an approved edit (or Lee's inline
 *  override) onto the CEQ node in its owning scene. Lee-approved only — the
 *  client calls this from an explicit APPROVE/SAVE action, never automatically.
 *  The write is surgical: prompt and/or choices, nothing else on the node. */
export const applyCeqEdit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    ceqNodeId: z.string().min(1).max(200),
    stem: z.string().trim().min(1).max(8000).optional(),
    choices: z.array(z.object({ text: z.string().trim().min(1).max(2000), correct: z.boolean(), feedback: z.string().max(4000).nullable() })).min(2).max(12).optional(),
  }).refine((x) => x.stem || x.choices, { message: "nothing to apply" }).parse(d))
  .handler(async ({ data }) => {
    if (data.choices && data.choices.filter((c) => c.correct).length !== 1) throw new Error("choices must have exactly one correct answer");
    const db = await admin();
    const { loadDecksDeduped } = await import("@/lib/student.functions");
    const owned = await loadDecksDeduped(db as never);
    // find the owning deck + scene for this node id (same ownership the player reads)
    let sceneId: string | null = null;
    for (const o of owned.values()) {
      if ((o.nodes as { id: string }[]).some((n) => n.id === data.ceqNodeId)) { sceneId = o.sceneId; break; }
    }
    if (!sceneId) throw new Error("CEQ not found in any live set");
    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", sceneId).single();
    if (error) rethrow(error);
    const j = row.nodes_json as { nodes?: { id: string; data?: Record<string, unknown> }[] };
    const node = (j.nodes ?? []).find((n) => n.id === data.ceqNodeId);
    if (!node) throw new Error("CEQ node vanished from its scene — refresh and retry");
    node.data ??= {};
    // REVERTIBLE (Lee, 2026-09-03: "I'm just nervous to use it. Would be great
    // if we could revert on this after the fact"). The card's words BEFORE this
    // save go onto the node (last ten), so revertCeqEdit can put them back.
    const hist = Array.isArray(node.data.editHistory) ? (node.data.editHistory as unknown[]) : [];
    node.data.editHistory = [...hist, { at: new Date().toISOString(), prompt: node.data.prompt ?? "", choices: node.data.choices ?? [] }].slice(-10);
    if (data.stem) node.data.prompt = data.stem;
    if (data.choices) node.data.choices = data.choices.map((c, i) => ({ id: `c${i}`, text: c.text, correct: c.correct, ...(c.feedback ? { feedback: c.feedback } : {}) }));
    (node.data as Record<string, unknown>).editedVia = "talkthrough-review";
    (node.data as Record<string, unknown>).editedAt = new Date().toISOString();
    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", sceneId);
    if (up.error) rethrow(up.error);
    return { ok: true as const, sceneId };
  });

/** UNDO the last applyCeqEdit on a card: the words it had before that save come
 *  back, the history shrinks by one. Returns what the card says now. */
export const revertCeqEdit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ceqNodeId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; stem: string; choices: { text: string; correct: boolean; feedback: string | null }[]; edits: number }> => {
    const db = await admin();
    const { loadDecksDeduped } = await import("@/lib/student.functions");
    const owned = await loadDecksDeduped(db as never);
    let sceneId: string | null = null;
    for (const o of owned.values()) {
      if ((o.nodes as { id: string }[]).some((n) => n.id === data.ceqNodeId)) { sceneId = o.sceneId; break; }
    }
    if (!sceneId) throw new Error("CEQ not found in any live set");
    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", sceneId).single();
    if (error) rethrow(error);
    const j = row.nodes_json as { nodes?: { id: string; data?: Record<string, unknown> }[] };
    const node = (j.nodes ?? []).find((n) => n.id === data.ceqNodeId);
    if (!node?.data) throw new Error("CEQ node vanished from its scene — refresh and retry");
    const hist = Array.isArray(node.data.editHistory) ? (node.data.editHistory as { at: string; prompt: unknown; choices: unknown }[]) : [];
    const last = hist[hist.length - 1];
    if (!last) throw new Error("nothing to revert — no saved edits on this card");
    node.data.prompt = last.prompt;
    node.data.choices = last.choices;
    node.data.editHistory = hist.slice(0, -1);
    node.data.editedVia = "talkthrough-revert";
    node.data.editedAt = new Date().toISOString();
    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", sceneId);
    if (up.error) rethrow(up.error);
    const choices = (Array.isArray(last.choices) ? last.choices : []) as { text?: unknown; correct?: unknown; feedback?: unknown }[];
    return { ok: true as const, stem: String(last.prompt ?? ""), choices: choices.map((c) => ({ text: String(c.text ?? ""), correct: !!c.correct, feedback: c.feedback ? String(c.feedback) : null })), edits: hist.length - 1 };
  });

// -------------------------------------------------------- B5: film picks

/** PICKED MEMOS BECOME FRAMES: upsert each pick as a memo card in the set's
 *  owning scene, through the EXISTING memo/callout card system (same data
 *  shape DeckManager materializes — no new renderer). Node ids are derived
 *  from the bank item id, so re-inserting UPDATES rather than duplicates,
 *  and reordering just rewrites stageOrder. Lee-triggered only. */
export const insertFilmPicks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(120),
    picks: z.array(z.object({
      itemId: z.string().min(1).max(130),
      title: z.string().max(300),
      body: z.string().max(8000),
      tags: z.array(z.string().max(40)).max(8),
      order: z.number().int().min(0).max(500),
    })).min(1).max(60),
  }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { loadDecksDeduped } = await import("@/lib/student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.setId);
    if (!o) throw new Error("set not found");
    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
    if (error) rethrow(error);
    const j = row.nodes_json as { nodes?: { id: string; type?: string; data?: Record<string, unknown> }[] };
    j.nodes ??= [];
    for (const pick of data.picks) {
      const nodeId = `memo-pick-${pick.itemId}`;
      const body = pick.tags.length ? `${pick.body}` : pick.body;
      const dataObj: Record<string, unknown> = {
        kind: "memo", memoKind: "note", title: pick.title, body,
        category: pick.tags[0] ?? "Callout", calloutTags: pick.tags,
        deckId: data.setId, deckMember: true, tucked: true,
        stageOrder: 9000 + pick.order, slotIndex: 9000 + pick.order,
        deckCategory: "ceq:set-memo", deckPos: { x: 0, y: 0 },
        provenance: "talkthrough-film-pick",
      };
      const existing = j.nodes.find((n) => n.id === nodeId);
      if (existing) existing.data = { ...existing.data, ...dataObj };
      else j.nodes.push({ id: nodeId, type: "memo", position: { x: 0, y: 0 }, data: dataObj } as never);
    }
    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
    if (up.error) rethrow(up.error);
    return { ok: true as const, inserted: data.picks.length };
  });

// ------------------------------------------------------ B6: exhibit drafts

/** The shipped-exhibit registry (B6.3) — what "reference an existing exhibit"
 *  offers. The config SOURCE ships in the bundle via ?raw so the draft pass
 *  can ground itself in the real interaction/config shape. Config, not code:
 *  a new shipped exhibit is one line here. */
export const EXHIBIT_REGISTRY = [
  { id: "cycle", label: "Accounting Cycle (modes + orbit)" },
  { id: "users", label: "Who's It For? (mirrored wall)" },
  { id: "standards", label: "Rulebook & Cops (chain)" },
  { id: "basis", label: "When It Counts (cash vs accrual)" },
  { id: "careers", label: "Accounting Careers (branch map)" },
  { id: "classification", label: "5 Types of Accounts (classifier)" },
] as const;
export type ExhibitRefId = (typeof EXHIBIT_REGISTRY)[number]["id"];

const exhibitConfigSource = async (id: string): Promise<string> => {
  switch (id) {
    case "cycle": return (await import("@/components/canvas/cycle-exhibit-config.ts?raw")).default;
    case "users": return (await import("@/components/canvas/users-exhibit-config.ts?raw")).default;
    case "standards": return (await import("@/components/canvas/standards-exhibit-config.ts?raw")).default;
    case "basis": return (await import("@/components/canvas/cash-accrual-config.ts?raw")).default;
    case "careers": return (await import("@/components/canvas/careers-exhibit-config.ts?raw")).default;
    case "classification": return (await import("@/components/canvas/classification-exhibit-config.ts?raw")).default;
    default: return "";
  }
};

/** B6.4 — draft a conveyor-format Claude Code prompt for an exhibit card:
 *  Bible-compliant (rule sandwich, importance cues, config-not-code), from
 *  the reference config + Lee's notes + style notes. Synthesis lane. */
export const runExhibitDraft = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    title: z.string().max(300),
    body: z.string().max(8000),
    quotes: z.array(z.string().max(4000)).max(20),
    transcript: z.string().max(60_000),
    referenceId: z.string().max(30).nullable(),
    keepChange: z.string().max(8000),
    styleNotes: z.array(z.string().max(300)).max(12),
  }).parse(d))
  .handler(async ({ data }) => {
    const bible = (await import("../../docs/EXHIBIT-PRODUCTION-BIBLE-v1.md?raw")).default;
    const refSource = data.referenceId ? await exhibitConfigSource(data.referenceId) : "";
    const system = [
      "You draft ONE exhibit build prompt for the Survive Accounting conveyor. It must be Bible-compliant: ONE exhibit, the rule sandwich, a LAYOUT section, INTERACTIONS + REVEAL, importance cues (MUST KNOW / EASY POINT / A+ DETAIL), config-not-code, film-safe ship rules, and it ends by naming the next exhibit as 'TBD by Lee'. Match the conveyor prompt format the Bible describes.",
      `\n=== EXHIBIT PRODUCTION BIBLE ===\n${bible.slice(0, 28_000)}`,
      refSource ? `\n=== REFERENCE EXHIBIT CONFIG (ground the interaction + config shape in this) ===\n${refSource.slice(0, 24_000)}` : "",
      data.styleNotes.length ? `\n=== LEE'S STANDING STYLE NOTES (obey) ===\n${data.styleNotes.map((n) => `- ${n}`).join("\n")}` : "",
      `\nReturn ONE JSON object, nothing else: {"summary": str (one paragraph), "prompt": str (the full conveyor prompt, markdown)}`,
    ].filter(Boolean).join("\n");
    const user = [
      `EXHIBIT IDEA: ${data.title}`,
      data.body ? `LEE'S NOTES: ${data.body}` : "",
      data.keepChange ? `WHAT I'D KEEP / WHAT I'D CHANGE (vs the reference): ${data.keepChange}` : "",
      data.quotes.length ? `VERBATIM MOMENTS:\n${data.quotes.map((q) => `"${q}"`).join("\n")}` : "",
      data.transcript ? `DICTATION ON THIS CARD (verbatim):\n${data.transcript}` : "",
    ].filter(Boolean).join("\n\n");
    const { runAiTask } = await import("@/lib/ai.server");
    const r = await runAiTask("synthesis", { system, user, maxOutput: 8_000 });
    return { text: r.text, model: r.usage.model, usage: { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costUsd: r.usage.costUsd } };
  });

// ---------------------------------------------------- B8: one-take attach

/** B8 — attach ONE video to {session, set}: staged upload (done client-side,
 *  the flyer's direct-to-storage door) → Mux asset via the EXISTING ingest
 *  (createAssetFromUrl) → a DRAFT publication on the deck marked ONE-TAKE
 *  BLAST. state:"draft" never reaches students (shippedPub filters on
 *  state==="shipped"). Minimal on purpose: no stitch, no trims — the full
 *  pipeline integration is logged in BUILD-NOTES.md, not built. */
export const attachOneTakeBlast = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    sessionId: z.string().min(1).max(120),
    setId: z.string().min(1).max(120),
    stagedUrl: z.string().url().max(600),
    stagedPath: z.string().min(1).max(500),
  }).parse(d))
  .handler(async ({ data }) => {
    const { createAssetFromUrl } = await import("@/lib/mux.server");
    const asset = await createAssetFromUrl(data.stagedUrl);
    const playbackId = asset.playback_ids?.[0]?.id ?? null;

    const db = await admin();
    const { loadDecksDeduped } = await import("@/lib/student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.setId);
    if (!o) throw new Error("set not found");
    const { data: row, error } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
    if (error) rethrow(error);
    const j = row.nodes_json as { decks?: { id: string; publications?: Record<string, unknown>[] }[] };
    const deck = (j.decks ?? []).find((d2) => d2.id === data.setId);
    if (!deck) throw new Error("deck vanished from its scene");
    deck.publications ??= [];
    deck.publications.push({
      id: `pub-onetake-${Date.now().toString(36)}`,
      kind: "blast",
      state: "draft",                    // DRAFT — invisible to students until shipped
      oneTake: true,
      label: "ONE-TAKE BLAST",
      sessionId: data.sessionId,
      sourcePath: data.stagedPath,
      render: { muxPlaybackId: playbackId, durationS: null, muxAssetId: asset.id },
      createdAt: new Date().toISOString(),
    });
    const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
    if (up.error) rethrow(up.error);
    return { ok: true as const, assetId: asset.id, playbackId, muxStatus: asset.status };
  });
