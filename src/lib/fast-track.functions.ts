// FAST TRACK — submit a small change; list the queue. Both need a passcode/admin/VA session.
// The request becomes an idea row (status SUBMITTED, context.lane fast_track) that the build
// runner picks up on its next pass. Nothing here builds anything.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { FAST_TRACK_LANE, fastTrackAllowance, fastTrackPrompt, isFastTrack, queueStateOf, type QueueState } from "@/lib/fast-track";

type DB = { from: (t: string) => any };
async function ctx(): Promise<{ db: DB; sessionEmail: string }> {
  const { adminSessionOk } = await import("@/lib/admin-session.functions");
  const s = await adminSessionOk();
  if (!s.ok) throw new Error("Sign in with the team passcode first (any page → Ctrl+I asks for it).");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as unknown as DB, sessionEmail: s.email ?? "" };
}

interface Row { id: string; title: string; body: string; status: string; source_path: string | null; context: Record<string, string> | null; created_by: string | null; created_at: string; updated_at: string; prompt_md: string | null }

async function fastTrackRows(db: DB): Promise<Row[]> {
  const { data } = await db.from("ideas").select("id,title,body,status,source_path,context,created_by,created_at,updated_at,prompt_md")
    .contains("context", { lane: FAST_TRACK_LANE }).order("created_at", { ascending: false }).limit(500);
  return (data ?? []) as Row[];
}

export const fastTrackAllowanceFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ who: z.enum(["lee", "king"]) }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await ctx();
    const rows = await fastTrackRows(db);
    return fastTrackAllowance(rows.map((r) => ({ status: r.status, createdBy: r.created_by ?? "", createdAt: r.created_at, context: r.context ?? {} })), data.who, new Date());
  });

export const submitFastTrack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    who: z.enum(["lee", "king"]),
    text: z.string().trim().min(8).max(2000),
    path: z.string().max(300),
    pageTitle: z.string().max(200).default(""),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; id: string; left: number | null } | { ok: false; error: string; left: number | null }> => {
    const { db } = await ctx();
    const rows = await fastTrackRows(db);
    const allowance = fastTrackAllowance(rows.map((r) => ({ status: r.status, createdBy: r.created_by ?? "", createdAt: r.created_at, context: r.context ?? {} })), data.who, new Date());
    if (allowance.left !== null && allowance.left <= 0) {
      return { ok: false, error: `That's ${allowance.limit} for today — the allowance resets at midnight Chicago.`, left: 0 };
    }
    const now = new Date().toISOString();
    const id = `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const title = data.text.trim().split("\n").find((l) => l.trim())?.replace(/^[#>\-*\s]+/, "").slice(0, 72) ?? "Fast track request";
    const { error } = await db.from("ideas").insert({
      id, title, body: data.text.trim(),
      categories: ["UI_UX"], subcategory: "fast track", status: "SUBMITTED",
      source_path: data.path, prompt_md: fastTrackPrompt({ text: data.text, path: data.path, pageTitle: data.pageTitle, who: data.who }), prompt_filename: null,
      context: { lane: FAST_TRACK_LANE, by: data.who, title: data.pageTitle, path: data.path, requestedAt: now },
      created_by: data.who, source_kind: "web", attachments: [], audio_path: null, transcript_status: null,
      created_at: now, updated_at: now,
    });
    if (error) return { ok: false, error: error.message, left: allowance.left };
    return { ok: true, id, left: allowance.left === null ? null : allowance.left - 1 };
  });

export interface QueueRow {
  id: string; title: string; body: string; by: string; path: string; createdAt: string; updatedAt: string;
  state: QueueState; lane: "fast_track" | "queue";
  previewUrl: string | null; branch: string | null; sha: string | null; builtAt: string | null; runError: string | null;
  checklist: string[]; report: string | null;
}

/** Everything on the runner's plate, newest first: fast-track requests plus Lee's own queue. */
export const listBuildQueue = createServerFn({ method: "GET" }).handler(async (): Promise<{ rows: QueueRow[] }> => {
  const { db } = await ctx();
  const { data } = await db.from("ideas").select("id,title,body,status,source_path,context,created_by,created_at,updated_at")
    .in("status", ["SUBMITTED", "APPROVED"]).order("updated_at", { ascending: false }).limit(200);
  const rows = ((data ?? []) as Row[]).filter((r) => r.status === "SUBMITTED" || isFastTrack({ context: r.context })).map((r): QueueRow => {
    const c = r.context ?? {};
    let checklist: string[] = [];
    try { checklist = c.testChecklist ? JSON.parse(c.testChecklist) : []; } catch { checklist = []; }
    return {
      id: r.id, title: r.title, body: r.body, by: r.created_by ?? c.by ?? "lee", path: r.source_path ?? c.path ?? "", createdAt: r.created_at, updatedAt: r.updated_at,
      state: queueStateOf({ status: r.status, context: c }), lane: isFastTrack({ context: c }) ? "fast_track" : "queue",
      previewUrl: c.previewUrl || null, branch: c.branch || null, sha: c.sha || null, builtAt: c.builtAt || null, runError: c.runError || null,
      checklist, report: c.report || null,
    };
  });
  return { rows };
});
