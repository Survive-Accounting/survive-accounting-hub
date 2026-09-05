// FAST TRACK — submit a small change; the log; the checkout; cancel and revert; the queue.
// All need a passcode/admin/VA session. A request becomes an idea row (status SUBMITTED,
// context.lane fast_track) that the build runner picks up on its next pass. Nothing here builds
// anything; the emails here are the "queued" ones — the runner sends "built" and "stopped".
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  FAST_TRACK_LANE, FAST_TRACK_MODEL, FAST_TRACK_MODEL_LABEL, fastTrackAllowance, fastTrackPrompt, fmtStamp, isFastTrack, needsCheckout,
  playgroundFor, playgroundRules, queueStateOf, runnerOnline, type Checkout, type QueueState,
} from "@/lib/fast-track";

type DB = { from: (t: string) => any };
async function ctx(): Promise<{ db: DB; sessionEmail: string }> {
  const { adminSessionOk } = await import("@/lib/admin-session.functions");
  const s = await adminSessionOk();
  if (!s.ok) throw new Error("Sign in with the team passcode first (any page → Ctrl+I asks for it).");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as unknown as DB, sessionEmail: s.email ?? "" };
}

interface Row { id: string; title: string; body: string; status: string; source_path: string | null; context: Record<string, string> | null; created_by: string | null; created_at: string; updated_at: string; prompt_md?: string | null }

async function fastTrackRows(db: DB): Promise<Row[]> {
  const { data } = await db.from("ideas").select("id,title,body,status,source_path,context,created_by,created_at,updated_at,prompt_md")
    .contains("context", { lane: FAST_TRACK_LANE }).order("created_at", { ascending: false }).limit(500);
  return (data ?? []) as Row[];
}
const forAllowance = (rows: Row[]) => rows.map((r) => ({ status: r.status, createdBy: r.created_by ?? "", createdAt: r.created_at, context: r.context ?? {} }));
const forCheckout = (rows: Row[]) => rows.map((r) => ({ id: r.id, title: r.title, status: r.status, createdBy: r.created_by ?? "", createdAt: r.created_at, context: r.context ?? {} }));

/** The runner's heartbeat lives in the site_settings singleton (it writes one every pass). */
async function runnerSeenAt(db: DB): Promise<string | null> {
  try {
    const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
    const v = ((data?.settings ?? {}) as Record<string, unknown>).buildQueueHeartbeat;
    return typeof v === "string" ? v : null;
  } catch { return null; }
}

const EMAIL: Record<string, string> = { lee: "lee@surviveaccounting.com", king: "king@surviveaccounting.com" };
const SITE = "https://surviveaccounting.com";

export interface Allowance {
  used: number; limit: number | null; left: number | null;
  /** The build machine: up (heartbeat within 8 min) or not, and when it was last seen. */
  runnerOnline: boolean; runnerSeenAt: string | null;
  /** What blocks a new request for this person, if anything. */
  checkout: Checkout;
  model: string; modelLabel: string;
  playground: string | null;
}

export const fastTrackAllowanceFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ who: z.enum(["lee", "king"]) }).parse(d))
  .handler(async ({ data }): Promise<Allowance> => {
    const { db } = await ctx();
    const [rows, seen] = await Promise.all([fastTrackRows(db), runnerSeenAt(db)]);
    const now = new Date();
    return {
      ...fastTrackAllowance(forAllowance(rows), data.who, now),
      runnerOnline: runnerOnline(seen, now), runnerSeenAt: seen,
      checkout: needsCheckout(forCheckout(rows), data.who),
      model: FAST_TRACK_MODEL, modelLabel: FAST_TRACK_MODEL_LABEL,
      playground: playgroundFor(data.who),
    };
  });

export const submitFastTrack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    who: z.enum(["lee", "king"]),
    text: z.string().trim().min(8).max(2000),
    path: z.string().max(300),
    pageTitle: z.string().max(200).default(""),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; id: string; left: number | null; runnerOnline: boolean } | { ok: false; error: string; left: number | null; checkout?: Checkout }> => {
    const { db } = await ctx();
    const [rows, seen] = await Promise.all([fastTrackRows(db), runnerSeenAt(db)]);
    const now = new Date();
    const allowance = fastTrackAllowance(forAllowance(rows), data.who, now);
    if (allowance.left !== null && allowance.left <= 0) {
      return { ok: false, error: `That's ${allowance.limit} for today — the allowance resets at midnight Chicago.`, left: 0 };
    }
    const checkout = needsCheckout(forCheckout(rows), data.who);
    if (checkout) {
      return { ok: false, left: allowance.left, checkout, error: checkout.kind === "wait"
        ? `Your last one (“${checkout.title}”) is still ${checkout.state === "building" ? "building" : "in the queue"} — the next opens when it's built.`
        : `Check out your last one first — thumbs up or down on “${checkout.title}”, and a line on how it went.` };
    }
    const online = runnerOnline(seen, now);
    const playground = playgroundFor(data.who);
    const iso = now.toISOString();
    const id = `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const title = data.text.trim().split("\n").find((l) => l.trim())?.replace(/^[#>\-*\s]+/, "").slice(0, 72) ?? "Fast track request";
    const prompt = [
      fastTrackPrompt({ text: data.text, path: data.path, pageTitle: data.pageTitle, who: data.who }),
      ...(playground ? ["", ...playgroundRules(playground)] : []),
    ].join("\n");
    const { error } = await db.from("ideas").insert({
      id, title, body: data.text.trim(),
      categories: ["SURVIVEACCOUNTING"], subcategory: "fast track", status: "SUBMITTED",
      source_path: data.path, prompt_md: prompt, prompt_filename: null,
      context: {
        lane: FAST_TRACK_LANE, by: data.who, title: data.pageTitle, path: data.path, requestedAt: iso,
        model: FAST_TRACK_MODEL, ...(playground ? { playground } : {}), ...(online ? {} : { queuedOffline: "1" }),
      },
      created_by: data.who, source_kind: "web", attachments: [], audio_path: null, transcript_status: null,
      created_at: iso, updated_at: iso,
    });
    if (error) return { ok: false, error: error.message, left: allowance.left };

    // THE "QUEUED" EMAIL — to the requester, the other of the two on cc, with CANCEL.
    try {
      const { sendResendEmail } = await import("@/lib/email.server");
      const other = data.who === "lee" ? "king" : "lee";
      await sendResendEmail({
        to: EMAIL[data.who], cc: [EMAIL[other]],
        subject: `[Fast track] Queued: ${title}`,
        text: [
          `⚡ FAST TRACK QUEUED — "${title}"`, "",
          `Sent by ${data.who} on ${fmtStamp(iso)} from ${data.path || "(unknown page)"}.`,
          `Builds on ${FAST_TRACK_MODEL_LABEL}${playground ? ` · lands on ${SITE}${playground} (the playground — /v2 is never touched)` : ""}.`,
          online ? "The build machine is up — it picks this up on its next pass (within 3 minutes) and usually takes 10–40 minutes." : "The build machine is OFF right now — this is saved on the list and builds when it comes back.",
          "", "THE REQUEST", data.text.trim(), "",
          `CANCEL (only while it's still queued): ${SITE}/buildqueue?cancel=${id}`,
          `The queue: ${SITE}/buildqueue`,
        ].join("\n"),
      });
    } catch { /* the request is saved either way */ }
    return { ok: true, id, left: allowance.left === null ? null : allowance.left - 1, runnerOnline: online };
  });

export interface LogRow {
  id: string; title: string; by: string; sentAt: string; sentStamp: string; state: QueueState;
  costUsd: string | null; buildSeconds: string | null; model: string | null;
  rating: "up" | "down" | null; ratingNote: string | null; cancelled: boolean; reverted: boolean;
  previewUrl: string | null; branch: string | null; playground: string | null;
}

function toLog(r: Row): LogRow {
  const c = r.context ?? {};
  return {
    id: r.id, title: r.title, by: r.created_by ?? c.by ?? "lee", sentAt: r.created_at, sentStamp: fmtStamp(r.created_at),
    state: queueStateOf({ status: r.status, context: c }),
    costUsd: c.costUsd ?? null, buildSeconds: c.buildSeconds ?? null, model: c.model ?? null,
    rating: c.rating === "up" || c.rating === "down" ? c.rating : null, ratingNote: c.ratingNote ?? null,
    cancelled: c.cancelled === "1", reverted: c.reverted === "1",
    previewUrl: c.previewUrl || null, branch: c.branch || null, playground: c.playground || null,
  };
}

/** THE LOG (Lee, 2026-09-05): what's been sent — when, ~cost, time to build, the rating. Lee
 *  sees everyone's; King sees his own. */
export const listFastTrackLog = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ who: z.enum(["lee", "king"]) }).parse(d))
  .handler(async ({ data }): Promise<{ rows: LogRow[] }> => {
    const { db } = await ctx();
    const rows = await fastTrackRows(db);
    return { rows: rows.filter((r) => data.who === "lee" || (r.created_by ?? r.context?.by) === data.who).slice(0, 60).map(toLog) };
  });

async function patchContext(db: DB, id: string, patch: Record<string, string | undefined>, status?: string): Promise<Row> {
  const { data: row } = await db.from("ideas").select("id,title,body,status,source_path,context,created_by,created_at,updated_at").eq("id", id).maybeSingle();
  if (!row) throw new Error("That request is gone.");
  const c: Record<string, string> = { ...((row as Row).context ?? {}) };
  for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete c[k]; else c[k] = v; }
  const upd: Record<string, unknown> = { context: c, updated_at: new Date().toISOString() };
  if (status) upd.status = status;
  const { error } = await db.from("ideas").update(upd).eq("id", id);
  if (error) throw new Error(error.message);
  return { ...(row as Row), context: c, status: status ?? (row as Row).status };
}

/** 👍 / 👎 and a line — the checkout. Required before the next request for everyone but Lee. */
export const rateFastTrack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(80), rating: z.enum(["up", "down"]), note: z.string().trim().max(1000).default("") }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { db } = await ctx();
    await patchContext(db, data.id, { rating: data.rating, ratingNote: data.note || undefined, ratedAt: new Date().toISOString() });
    return { ok: true };
  });

/** CANCEL — only while it is still queued (the runner never stops mid-build). Parks the row so
 *  the runner never picks it up; the allowance still counts it. */
export const cancelFastTrack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const { db } = await ctx();
    const { data: row } = await db.from("ideas").select("id,title,status,context").eq("id", data.id).maybeSingle();
    if (!row) return { ok: false, message: "That request is gone." };
    const c = (row.context ?? {}) as Record<string, string>;
    if (c.cancelled === "1") return { ok: true, message: "Already cancelled." };
    const state = queueStateOf({ status: row.status, context: c });
    if (state !== "queued") return { ok: false, message: state === "building" ? "It's already building — you can revert it once it's built." : `It's already ${state} — use revert instead.` };
    await patchContext(db, data.id, { cancelled: "1", cancelledAt: new Date().toISOString() }, "PARKED");
    return { ok: true, message: `Cancelled “${row.title}”. It won't be built.` };
  });

/** REVERT — after a build: marks it reverted, parks it (off the plate, never merged), and tells
 *  Lee, who is the one holding main. If it was already merged, Lee reverts the commit by hand. */
export const revertFastTrack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(80), who: z.enum(["lee", "king"]) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const { db } = await ctx();
    const { data: row } = await db.from("ideas").select("id,title,status,context").eq("id", data.id).maybeSingle();
    if (!row) return { ok: false, message: "That request is gone." };
    const c = (row.context ?? {}) as Record<string, string>;
    if (c.reverted === "1") return { ok: true, message: "Already reverted." };
    const state = queueStateOf({ status: row.status, context: c });
    if (state === "queued") return { ok: false, message: "It hasn't built yet — cancel it instead." };
    await patchContext(db, data.id, { reverted: "1", revertedAt: new Date().toISOString(), revertedBy: data.who }, "PARKED");
    try {
      const { sendResendEmail } = await import("@/lib/email.server");
      await sendResendEmail({
        to: EMAIL.lee, cc: data.who === "king" ? [EMAIL.king] : [],
        subject: `[Fast track] Revert: ${row.title}`,
        text: [
          `⚡ FAST TRACK REVERT — "${row.title}" — asked by ${data.who} on ${fmtStamp(new Date())}.`, "",
          "It's off the plate and will not be merged.",
          c.branch ? `If it was already merged: git revert ${c.sha ? c.sha.slice(0, 12) : "<the merge>"} on main (branch ${c.branch}).` : "",
          "", `The queue: ${SITE}/buildqueue`,
        ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
      });
    } catch { /* the mark is what matters */ }
    return { ok: true, message: `Reverted “${row.title}”. It won't be merged${c.branch ? "; Lee has the note if it already was" : ""}.` };
  });

export interface QueueRow {
  id: string; title: string; body: string; by: string; path: string; createdAt: string; updatedAt: string;
  state: QueueState; lane: "fast_track" | "queue";
  previewUrl: string | null; branch: string | null; sha: string | null; builtAt: string | null; runError: string | null;
  checklist: string[]; report: string | null;
  costUsd: string | null; buildSeconds: string | null; model: string | null; rating: string | null; ratingNote: string | null;
  cancelled: boolean; reverted: boolean; playground: string | null;
}

/** Everything on the runner's plate, newest first: fast-track requests plus Lee's own queue. */
export const listBuildQueue = createServerFn({ method: "GET" }).handler(async (): Promise<{ rows: QueueRow[]; runnerOnline: boolean; runnerSeenAt: string | null }> => {
  const { db } = await ctx();
  const [{ data }, seen] = await Promise.all([
    db.from("ideas").select("id,title,body,status,source_path,context,created_by,created_at,updated_at")
      .in("status", ["SUBMITTED", "APPROVED", "PARKED"]).order("updated_at", { ascending: false }).limit(300),
    runnerSeenAt(db),
  ]);
  const rows = ((data ?? []) as Row[])
    .filter((r) => r.status === "SUBMITTED" || (isFastTrack({ context: r.context }) && (r.status !== "PARKED" || r.context?.cancelled === "1" || r.context?.reverted === "1")))
    .slice(0, 200)
    .map((r): QueueRow => {
      const c = r.context ?? {};
      let checklist: string[] = [];
      try { checklist = c.testChecklist ? JSON.parse(c.testChecklist) : []; } catch { checklist = []; }
      return {
        id: r.id, title: r.title, body: r.body, by: r.created_by ?? c.by ?? "lee", path: r.source_path ?? c.path ?? "", createdAt: r.created_at, updatedAt: r.updated_at,
        state: queueStateOf({ status: r.status, context: c }), lane: isFastTrack({ context: c }) ? "fast_track" : "queue",
        previewUrl: c.previewUrl || null, branch: c.branch || null, sha: c.sha || null, builtAt: c.builtAt || null, runError: c.runError || null,
        checklist, report: c.report || null,
        costUsd: c.costUsd ?? null, buildSeconds: c.buildSeconds ?? null, model: c.model ?? null, rating: c.rating ?? null, ratingNote: c.ratingNote ?? null,
        cancelled: c.cancelled === "1", reverted: c.reverted === "1", playground: c.playground || null,
      };
    });
  return { rows, runnerOnline: runnerOnline(seen, new Date()), runnerSeenAt: seen };
});
