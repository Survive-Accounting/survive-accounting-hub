// THE CEQ QUEUE — server side (docs/DESIGN-CEQ-QUEUE.md, 2026-09-10).
//
// Lee: "I brainstorm the idea... it generates in background... while that's happening, i'm
// tweaking something else... we want to have a generation queue that is stacked at all times."
//
// Four doors, every one behind assertAdmin:
//   enqueueCeqJob  — what he talked through in the Booth, plus the parent cram set's cards and what
//                    he kept/dropped last time, becomes a queued row. No talk → refused, out loud.
//   runNextCeqJob  — claims the oldest queued row (compare-and-set), asks the synthesis lane, parses
//                    and defends the answer, logs the cost, flips to done — or failed, with why.
//                    The BROWSER calls this (ceq-queue-client.ts): Vercel crons are daily here.
//   applyCeqJob    — the candidates he kept become DRAFT ceq nodes on the deck through the same
//                    scene read-modify-write every other writer uses; the rest write feedback.
//   listCeqJobs    — for the map panel and the Editor fold.
//
// The table is new (migration/supabase-migrations/20260910_0100_ceq_jobs.sql). A DB without it
// fails LOUD with the migration's name, never a silent empty list.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { buildCeqQueueMessages, candidateToCardData, CEQ_QUEUE_LABEL, CEQ_QUEUE_WANT, parseCandidateSet, type CandidateCard, type CandidateSet } from "./ceq-queue-brief";
import { isMissingSchema } from "./pg-errors";

const MISSING = "ceq_jobs table missing — apply migration/supabase-migrations/20260910_0100_ceq_jobs.sql in the Supabase SQL editor";
function rethrow(e: { code?: string; message: string }): never {
  if (isMissingSchema(e, /ceq_job/i)) throw new Error(MISSING);
  throw new Error(e.message);
}
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};
const gate = async () => { const { assertAdmin } = await import("@/lib/admin-session.functions"); await assertAdmin(); };

export type CeqJobStatus = "queued" | "running" | "done" | "failed";
export interface CeqJobRow {
  id: string; deckId: string; parentDeckId: string | null; status: CeqJobStatus;
  result: CandidateSet | null; model: string | null; costUsd: number | null; error: string | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null;
  /** How many of the result's candidates already have feedback — i.e. have been applied. */
  decided: number;
}
const SELECT = "id,deck_id,parent_deck_id,status,result,model,cost_usd,error,created_at,started_at,finished_at";

function rowToJob(r: Record<string, unknown>, decided = 0): CeqJobRow {
  return {
    id: String(r.id), deckId: String(r.deck_id), parentDeckId: (r.parent_deck_id as string | null) ?? null,
    status: (r.status as CeqJobStatus) ?? "queued",
    result: (r.result as CandidateSet | null) ?? null, model: (r.model as string | null) ?? null,
    costUsd: r.cost_usd != null ? Number(r.cost_usd) : null, error: (r.error as string | null) ?? null,
    createdAt: String(r.created_at), startedAt: (r.started_at as string | null) ?? null, finishedAt: (r.finished_at as string | null) ?? null,
    decided,
  };
}

/** Jobs for one deck (newest first), or the whole queue's recent tail. */
export const listCeqJobs = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ deckId: z.string().min(1).max(120).optional(), limit: z.number().int().min(1).max(100).optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<CeqJobRow[]> => {
    await gate();
    const db = await admin();
    let q = db.from("ceq_jobs").select(SELECT).order("created_at", { ascending: false }).limit(data.limit ?? 20);
    if (data.deckId) q = q.eq("deck_id", data.deckId);
    const { data: rows, error } = await q;
    if (error) rethrow(error);
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    const decided = new Map<string, number>();
    if (ids.length) {
      const { data: fb, error: e2 } = await db.from("ceq_job_feedback").select("job_id").in("job_id", ids);
      if (e2) rethrow(e2);
      for (const f of fb ?? []) decided.set(f.job_id, (decided.get(f.job_id) ?? 0) + 1);
    }
    return (rows ?? []).map((r: Record<string, unknown>) => rowToJob(r, decided.get(String(r.id)) ?? 0));
  });

/** What Lee said in the Booth for this deck: every live segment of every live session on it. */
async function segmentsFor(db: { from: (t: string) => any }, deckId: string): Promise<{ text: string; at?: string }[]> {
  const { data: sessions, error } = await db.from("talkthrough_sessions").select("id").eq("set_id", deckId).is("archived_at", null);
  if (error) throw new Error(error.message);
  const ids = (sessions ?? []).map((s: { id: string }) => s.id);
  if (!ids.length) return [];
  const { data: segs, error: e2 } = await db.from("talkthrough_segments").select("text,started_at,archived_at").in("session_id", ids).is("archived_at", null).order("started_at", { ascending: true }).limit(2000);
  if (e2) throw new Error(e2.message);
  return (segs ?? []).map((s: { text?: string; started_at?: string }) => ({ text: String(s.text ?? ""), ...(s.started_at ? { at: s.started_at } : {}) })).filter((s: { text: string }) => s.text.trim());
}

/** Queue a job for a deck. Refuses, out loud, when there is nothing to generate from. */
export const enqueueCeqJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ deckId: z.string().min(1).max(120), want: z.number().int().min(3).max(15).optional() }).parse(d))
  .handler(async ({ data }): Promise<{ jobId: string }> => {
    await gate();
    const db = await admin();
    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(data.deckId);
    if (!o) throw new Error("set not found");
    const deck = o.deck as { name?: string; blurb?: string; branchFrom?: string };

    const segments = await segmentsFor(db, data.deckId);
    if (!segments.length) throw new Error("Talk it through first — there's nothing to generate from. Brainstorm this video in the Booth, then queue it.");

    // THE PARENT'S CARDS are the style guide — a cram set's own cards when it has no parent.
    const styleFrom = deck.branchFrom && owned.get(deck.branchFrom) ? deck.branchFrom : data.deckId;
    type CardData = { prompt?: string; choices?: { text?: string; correct?: boolean }[]; noteOnly?: boolean; draft?: boolean; bankArchived?: string; provenance?: string };
    const parentCards = ((owned.get(styleFrom)?.nodes ?? []) as { data?: CardData }[])
      .map((n) => n.data ?? {})
      .filter((d) => d.prompt && !d.noteOnly && !d.draft && !d.bankArchived && d.provenance !== "blast-off")
      .map((d) => ({ stem: String(d.prompt), choices: (d.choices ?? []).map((c) => ({ text: String(c.text ?? ""), correct: !!c.correct })) }));

    // THE MEMORY: what he kept and dropped from earlier jobs on this parent.
    const { data: prior, error: e1 } = await db.from("ceq_jobs").select("id,result").eq("parent_deck_id", styleFrom).eq("status", "done").order("created_at", { ascending: false }).limit(5);
    if (e1) rethrow(e1);
    const feedback: { stem: string; action: "kept" | "edited" | "dropped" }[] = [];
    if (prior?.length) {
      const { data: fb, error: e2 } = await db.from("ceq_job_feedback").select("job_id,candidate,action").in("job_id", prior.map((p: { id: string }) => p.id));
      if (e2) rethrow(e2);
      for (const f of fb ?? []) {
        const job = prior.find((p: { id: string }) => p.id === f.job_id) as { result?: CandidateSet } | undefined;
        const stem = job?.result?.cards?.[f.candidate]?.stem;
        if (stem) feedback.push({ stem, action: f.action });
      }
    }

    const source = { name: String(deck.name ?? ""), blurb: String(deck.blurb ?? ""), segments, parentCards, feedback, want: data.want ?? CEQ_QUEUE_WANT };
    const { data: row, error } = await db.from("ceq_jobs").insert({ deck_id: data.deckId, parent_deck_id: styleFrom === data.deckId ? null : styleFrom, source, status: "queued" }).select("id").single();
    if (error) rethrow(error);
    return { jobId: String(row.id) };
  });

/** Claim and run the oldest queued job. Returns what happened so the drain can pace itself. */
export const runNextCeqJob = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ran: false } | { ran: true; jobId: string; status: "done" | "failed"; cards: number; costUsd: number }> => {
    await gate();
    const db = await admin();
    // CLAIM: the oldest queued row, flipped to running only if it is still queued — two tabs
    // draining at once cannot both take it.
    const { data: cand, error } = await db.from("ceq_jobs").select("id,deck_id,parent_deck_id,source").eq("status", "queued").order("created_at", { ascending: true }).limit(1);
    if (error) rethrow(error);
    const job = cand?.[0] as { id: string; deck_id: string; parent_deck_id: string | null; source: Parameters<typeof buildCeqQueueMessages>[0] } | undefined;
    if (!job) return { ran: false };
    const { data: claimed, error: e1 } = await db.from("ceq_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", job.id).eq("status", "queued").select("id");
    if (e1) rethrow(e1);
    if (!claimed?.length) return { ran: false }; // someone else took it

    try {
      const { runAiTask } = await import("@/lib/ai.server");
      const m = buildCeqQueueMessages(job.source);
      const r = await runAiTask("synthesis", { system: m.system, user: m.user, maxOutput: 6_000 });
      const result = parseCandidateSet(r.text);
      const { error: e2 } = await db.from("ceq_jobs").update({ status: "done", result, model: r.usage.model, cost_usd: r.usage.costUsd, finished_at: new Date().toISOString() }).eq("id", job.id);
      if (e2) rethrow(e2);
      // THE COST, keyed to the set the way every other model call is. Best-effort.
      try {
        const { logCostEvent } = await import("@/lib/cost-ledger.functions");
        await logCostEvent({ data: { setId: job.deck_id, kind: "ai", usd: r.usage.costUsd, model: r.usage.model, label: CEQ_QUEUE_LABEL, who: "queue" } });
      } catch { /* the cards are in hand; the ledger line is the lesser thing */ }
      return { ran: true, jobId: job.id, status: "done", cards: result.cards.length, costUsd: r.usage.costUsd };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("ceq_jobs").update({ status: "failed", error: msg.slice(0, 1000), finished_at: new Date().toISOString() }).eq("id", job.id);
      return { ran: true, jobId: job.id, status: "failed", cards: 0, costUsd: 0 };
    }
  });

/** Keep some candidates: they become DRAFT ceq nodes on the deck; the rest record "dropped". A
 *  candidate he edited before keeping arrives with its edits and records "edited". */
export const applyCeqJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    jobId: z.string().uuid(),
    keep: z.array(z.object({ candidate: z.number().int().min(0).max(50), card: z.any().optional() })).max(50),
  }).parse(d))
  .handler(async ({ data }): Promise<{ added: number; dropped: number }> => {
    await gate();
    const db = await admin();
    const { data: row, error } = await db.from("ceq_jobs").select("id,deck_id,result,status").eq("id", data.jobId).single();
    if (error) rethrow(error);
    if (row.status !== "done" || !row.result) throw new Error("This job has no result to apply.");
    const result = row.result as CandidateSet;

    const { loadDecksDeduped } = await import("./student.functions");
    const owned = await loadDecksDeduped(db as never);
    const o = owned.get(row.deck_id);
    if (!o) throw new Error("set not found");
    const { data: scene, error: e1 } = await db.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
    if (e1) rethrow(e1);
    const j = scene.nodes_json as { nodes?: { id: string; type?: string; data?: Record<string, unknown>; position?: { x: number; y: number } }[] };
    j.nodes ??= [];
    const mine = j.nodes.filter((n) => n.type === "ceq" && n.data?.deckId === row.deck_id);
    let order = mine.reduce((m, n) => Math.max(m, Number(n.data?.stageOrder ?? 0)), 0);
    const seen = new Set(j.nodes.map((n) => n.id));

    const { normalizeCandidate } = await import("./ceq-queue-brief");
    const feedbackRows: { job_id: string; candidate: number; ceq_id: string | null; action: string; edit_diff: unknown }[] = [];
    let added = 0;
    for (const k of data.keep) {
      const original = result.cards[k.candidate];
      if (!original) continue;
      // An edited card is re-defended the same way the model's was.
      const card: CandidateCard | null = k.card ? normalizeCandidate(k.card) : original;
      if (!card) continue;
      let id: string;
      do { id = `ceq-q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; } while (seen.has(id));
      seen.add(id);
      order += 1;
      j.nodes.push({ id, type: "ceq", position: { x: 520, y: 210 + order * 40 }, data: candidateToCardData(card, row.deck_id, order, row.id) });
      feedbackRows.push({ job_id: row.id, candidate: k.candidate, ceq_id: id, action: k.card ? "edited" : "kept", edit_diff: k.card ? { before: original, after: card } : null });
      added += 1;
    }
    const keptIdx = new Set(data.keep.map((k) => k.candidate));
    let dropped = 0;
    result.cards.forEach((_, i) => { if (!keptIdx.has(i)) { feedbackRows.push({ job_id: row.id, candidate: i, ceq_id: null, action: "dropped", edit_diff: null }); dropped += 1; } });

    if (added) {
      const up = await db.from("canvas_scenes").update({ nodes_json: j }).eq("id", o.sceneId);
      if (up.error) rethrow(up.error);
    }
    if (feedbackRows.length) {
      const { error: e3 } = await db.from("ceq_job_feedback").upsert(feedbackRows, { onConflict: "job_id,candidate" });
      if (e3) rethrow(e3);
    }
    return { added, dropped };
  });
