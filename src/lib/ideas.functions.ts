// IDEAS TO SAVE — server side. Two calls: list them, save one.
//
// Deliberately thin. The whole product promise is "ten seconds and back to
// work", so there is no validation ceremony beyond what the column types
// need, and NO DELETE — PARKED is the archive.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CATEGORIES, SOURCE_KINDS, STATUSES, type Attachment, type Idea, type SourceKind } from "@/components/ideas/model";

const MISSING = "ideas table missing — apply migration/supabase-migrations/20260831_0900_ideas_vault.sql";

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

/** The table not existing yet is a SETUP problem, not a bug — say which file
 *  fixes it rather than surfacing a raw Postgres code. */
function rethrow(e: { code?: string; message: string }): never {
  if (e.code === "42P01" || /relation .*ideas.* does not exist/i.test(e.message)) throw new Error(MISSING);
  throw new Error(e.message);
}

interface Row {
  id: string; title: string; body: string; categories: string[] | null; subcategory: string;
  status: string; source_path: string; context: Record<string, string> | null;
  prompt_md: string | null; prompt_filename: string | null;
  created_by: string | null; source_kind: string | null;
  attachments: Attachment[] | null;
  audio_path: string | null; transcript_status: string | null;
  created_at: string; updated_at: string;
}

const toIdea = (r: Row): Idea => ({
  id: r.id, title: r.title, body: r.body,
  categories: (r.categories ?? []).filter((c): c is Idea["categories"][number] => (CATEGORIES as readonly string[]).includes(c)),
  subcategory: r.subcategory ?? "",
  status: (STATUSES as readonly string[]).includes(r.status) ? (r.status as Idea["status"]) : "IDEA",
  sourcePath: r.source_path ?? "",
  context: r.context ?? {},
  promptMd: r.prompt_md, promptFilename: r.prompt_filename,
  createdBy: r.created_by ?? "",
  sourceKind: (SOURCE_KINDS as readonly string[]).includes(r.source_kind ?? "") ? (r.source_kind as SourceKind) : "web",
  attachments: Array.isArray(r.attachments) ? r.attachments : [],
  audioPath: r.audio_path, transcriptStatus: r.transcript_status,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

export const listIdeas = createServerFn({ method: "POST" }).handler(async (): Promise<{ ideas: Idea[] }> => {
  const db = await admin();
  const { data, error } = await db.from("ideas").select("*").order("updated_at", { ascending: false });
  if (error) rethrow(error);
  return { ideas: (data as Row[]).map(toIdea) };
});

const ideaInput = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(300).default(""),
  body: z.string().max(20_000).default(""),
  categories: z.array(z.enum(CATEGORIES)).max(7).default([]),
  subcategory: z.string().max(120).default(""),
  status: z.enum(STATUSES).default("IDEA"),
  sourcePath: z.string().max(300).default(""),
  context: z.record(z.string(), z.string()).default({}),
  // The prompt Lee wrote elsewhere with Claude. Generous cap: these are whole
  // build prompts, and truncating one silently would be worse than a failure.
  promptMd: z.string().max(400_000).nullable().default(null),
  promptFilename: z.string().max(200).nullable().default(null),
  createdBy: z.string().max(40).default(""),
  sourceKind: z.enum(SOURCE_KINDS).default("web"),
  attachments: z.array(z.object({
    id: z.string().max(80), name: z.string().max(300), mime: z.string().max(120),
    size: z.number().int().nonnegative(), path: z.string().max(400), url: z.string().max(1000),
  })).max(40).default([]),
  audioPath: z.string().max(400).nullable().default(null),
  transcriptStatus: z.string().max(20).nullable().default(null),
});

export const saveIdea = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ideaInput.parse(d))
  .handler(async ({ data }): Promise<{ idea: Idea }> => {
    const db = await admin();
    const now = new Date().toISOString();
    const { data: out, error } = await db.from("ideas").upsert({
      id: data.id,
      title: data.title,
      body: data.body,
      categories: data.categories,
      subcategory: data.subcategory,
      status: data.status,
      source_path: data.sourcePath,
      context: data.context,
      prompt_md: data.promptMd,
      prompt_filename: data.promptFilename,
      created_by: data.createdBy,
      source_kind: data.sourceKind,
      attachments: data.attachments,
      audio_path: data.audioPath,
      transcript_status: data.transcriptStatus,
      updated_at: now,
    }, { onConflict: "id" }).select().single();
    if (error) rethrow(error);
    return { idea: toIdea(out as Row) };
  });

/** DRAFT A CLAUDE CODE PROMPT from an idea (Lee, 2026-09-02) — the build
 *  machine's job: an idea captured on the filming laptop becomes a prompt here.
 *  Synthesis lane. Never saves — the client attaches the result as promptMd
 *  (status DRAFTED), so a bad draft is one click to replace or redraft. */
export const draftIdeaPrompt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    title: z.string().max(300),
    body: z.string().max(12_000),
    categories: z.array(z.string().max(40)).max(10),
    subcategory: z.string().max(120),
    sourcePath: z.string().max(300),
    pageTitle: z.string().max(300).optional(),
    notes: z.string().max(4000).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { runAiTask } = await import("@/lib/ai.server");
    const { buildIdeaPromptMessages } = await import("@/lib/ideas-prompt");
    const { system, user } = buildIdeaPromptMessages(data);
    const r = await runAiTask("synthesis", { system, user, maxOutput: 3500 });
    return { text: r.text.trim(), model: r.usage.model, costUsd: r.usage.costUsd };
  });

/** ORGANISE (Lee, 2026-09-03): "let the ideas really flow and be beautifully
 *  scattered and free … It's AI's job to get it organized and categorized and
 *  triaged." Runs right after every save, in the background: one micro call
 *  gives the idea a real title, a TLDR, a summary and categories (only when
 *  the author chose none); then, unless told not to, the synthesis lane
 *  drafts the Claude Code prompt. Idempotent — safe to re-run; `redraft`
 *  replaces an existing prompt and keeps the old one on the idea. */
export const organizeIdea = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.string().min(1).max(80),
    draftPrompt: z.boolean().default(true),
    redraft: z.boolean().default(false),
    // The client makes TWO requests (title/TLDR first, then the prompt) so
    // neither runs past the serverless time limit — one request that did
    // both is how the link-previews idea (2026-09-03) never got its prompt.
    organize: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data }): Promise<{ idea: Idea; drafted: boolean }> => {
    const db = await admin();
    const { data: row, error } = await db.from("ideas").select("*").eq("id", data.id).single();
    if (error) rethrow(error);
    const r = row as Row;
    const { runAiTask } = await import("@/lib/ai.server");
    const { buildIdeaPromptMessages, buildOrganizeMessages, pageLabel, suggestProject } = await import("@/lib/ideas-prompt");
    const now = new Date().toISOString();
    const ctx: Record<string, string> = { ...(r.context ?? {}) };
    const isTodo = !!ctx.todo;

    // 1. Title · TLDR · summary · categories — the micro lane, cheap.
    const words = r.body?.trim() || r.title || "";
    if (words && data.organize) {
      const org = buildOrganizeMessages({
        title: r.title || words.slice(0, 80), body: r.body, categories: r.categories ?? [], subcategory: r.subcategory ?? "",
        sourcePath: r.source_path ?? "", pageTitle: ctx.title ?? "", existingPrompt: r.prompt_md,
      });
      const res = await runAiTask("micro", { system: org.system, user: org.user, maxOutput: 700 });
      const m = res.text.match(/\{[\s\S]*\}/);
      if (m) {
        const j = JSON.parse(m[0]) as { title?: unknown; tldr?: unknown; summary?: unknown; categories?: unknown; urgent?: unknown };
        const title = typeof j.title === "string" ? j.title.trim().slice(0, 120) : "";
        if (title) r.title = title;
        if (typeof j.tldr === "string") ctx.tldr = j.tldr.trim();
        if (typeof j.summary === "string") ctx.summary = j.summary.trim();
        if (!(r.categories ?? []).length && Array.isArray(j.categories)) {
          r.categories = j.categories.filter((c): c is string => typeof c === "string" && (CATEGORIES as readonly string[]).includes(c)).slice(0, 2);
        }
        // AI may FLAG urgency but never un-flag what a person set.
        if (j.urgent === true && !ctx.urgent) ctx.urgentSuggested = "1";
      }
    }
    if (data.organize) {
      const proj = suggestProject(r.source_path ?? "", r.categories ?? []);
      ctx.session = proj.label;
      ctx.project = proj.key;
      ctx.worktree = proj.worktree;
      ctx.page = pageLabel(r.source_path ?? "");
      ctx.organizedAt = now;
    }

    // 2. The prompt — synthesis lane. Never for a to-do or a draft-in-progress.
    let drafted = false;
    const wantPrompt = data.draftPrompt && !isTodo && ctx.draft !== "1" && (data.redraft || !r.prompt_md?.trim());
    if (wantPrompt) {
      const { system, user } = buildIdeaPromptMessages({
        title: r.title, body: r.body, categories: r.categories ?? [], subcategory: r.subcategory ?? "",
        sourcePath: r.source_path ?? "", pageTitle: ctx.title ?? "",
        notes: data.redraft && r.prompt_md?.trim() ? `THE PREVIOUS PROMPT (keep every decision in it, improve the rest):\n${r.prompt_md.trim().slice(0, 8000)}` : undefined,
      });
      const ai = await runAiTask("synthesis", { system, user, maxOutput: 3500 });
      if (data.redraft && r.prompt_md?.trim()) ctx.previousPromptMd = r.prompt_md.trim();
      r.prompt_md = ai.text.trim();
      r.prompt_filename = r.prompt_filename || `${(r.title || "prompt").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}.md`;
      if (r.status === "IDEA") r.status = "DRAFTED";
      drafted = true;
    }

    const { data: out, error: e2 } = await db.from("ideas").update({
      title: r.title, categories: r.categories ?? [], context: ctx,
      prompt_md: r.prompt_md, prompt_filename: r.prompt_filename, status: r.status, updated_at: now,
    }).eq("id", r.id).select().single();
    if (e2) rethrow(e2);
    return { idea: toIdea(out as Row), drafted };
  });

/** Lee's number for urgent texts. Env first; the fallback is the number he
 *  gave for exactly this (2026-09-03). */
const LEE_URGENT_PHONE = process.env.LEE_URGENT_PHONE ?? "6012018759";

/** URGENT (Lee, 2026-09-03): "any idea can be toggled on as urgent … pinned
 *  to the top … if an urgent idea takes place, text me." Marks the idea and,
 *  when turning ON, texts Lee. SMS-TRUTH: the result says whether the text
 *  went, so the UI never claims a text that did not happen. */
export const setUrgent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(80), urgent: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ idea: Idea; texted: boolean; textError?: string }> => {
    const db = await admin();
    const { data: row, error } = await db.from("ideas").select("*").eq("id", data.id).single();
    if (error) rethrow(error);
    const r = row as Row;
    const ctx: Record<string, string> = { ...(r.context ?? {}) };
    if (data.urgent) { ctx.urgent = "1"; ctx.urgentAt = new Date().toISOString(); } else { delete ctx.urgent; delete ctx.urgentAt; }
    const { data: out, error: e2 } = await db.from("ideas").update({ context: ctx, updated_at: new Date().toISOString() }).eq("id", r.id).select().single();
    if (e2) rethrow(e2);
    let texted = false, textError: string | undefined;
    if (data.urgent) {
      const { sendSms } = await import("@/lib/greek-chapters.functions");
      const who = (r.created_by || "someone").toLowerCase() === "king" ? "King" : r.created_by || "someone";
      const res = await sendSms(LEE_URGENT_PHONE, `🔥 URGENT idea from ${who}: ${r.title || "(untitled)"}${ctx.tldr ? ` — ${ctx.tldr}` : ""}\nhttps://surviveaccounting.com/admin/ideas`);
      texted = res.ok; textError = res.error;
    }
    return { idea: toIdea(out as Row), texted, textError };
  });

/** SEND A SUMMARY (Lee, 2026-09-02): "Send summary to Lee / Send summary to
 *  King … I want King to get updates on what all I'm building. Have the TLDR,
 *  then the summary, prompt, etc."
 *
 *  Lee's ideas go to King as build updates; King's ideas (he captures with
 *  Ctrl+I too) go to Lee. An idea with no prompt yet is drafted first, so the
 *  email always carries the four sections, and the draft is saved to the
 *  vault (IDEA → DRAFTED) — one call, one artifact, both places. Uses the
 *  existing Resend helper; a missing key surfaces as the error, never as a
 *  silent no-send. The send is recorded on the idea (context.lastSentTo/At). */
export const sendIdeaSummary = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.string().min(1).max(80),
    to: z.enum(["lee", "king"]),
    note: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; drafted: boolean; to: string; id?: string }> => {
    const db = await admin();
    const { data: row, error } = await db.from("ideas").select("*").eq("id", data.id).single();
    if (error) rethrow(error);
    const r = row as Row;
    const now = new Date().toISOString();

    let drafted = false;
    if (!r.prompt_md?.trim()) {
      const { runAiTask } = await import("@/lib/ai.server");
      const { buildIdeaPromptMessages } = await import("@/lib/ideas-prompt");
      const { system, user } = buildIdeaPromptMessages({
        title: r.title, body: r.body, categories: r.categories ?? [], subcategory: r.subcategory ?? "",
        sourcePath: r.source_path ?? "", pageTitle: r.context?.title ?? "",
      });
      const ai = await runAiTask("synthesis", { system, user, maxOutput: 3500 });
      r.prompt_md = ai.text.trim();
      r.prompt_filename = r.prompt_filename || `${(r.title || "prompt").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}.md`;
      if (r.status === "IDEA") r.status = "DRAFTED";
      const { error: e } = await db.from("ideas").update({ prompt_md: r.prompt_md, prompt_filename: r.prompt_filename, status: r.status, updated_at: now }).eq("id", r.id);
      if (e) rethrow(e);
      drafted = true;
    }

    const { ideaUpdateText } = await import("@/lib/ideas-prompt");
    const { adminEmailFor } = await import("@/components/AdminGate");
    const { sendResendEmail } = await import("@/lib/email.server");
    const to = adminEmailFor(data.to);
    const from = (r.created_by || "").toLowerCase() || "lee";
    const text = [
      data.note ? `${data.note}\n` : "",
      ideaUpdateText({
        title: r.title, body: r.body, categories: r.categories ?? [], subcategory: r.subcategory ?? "",
        sourcePath: r.source_path ?? "", pageTitle: r.context?.title ?? "", promptMd: r.prompt_md,
        createdBy: from, appUrl: "https://surviveaccounting.com/admin/ideas",
      }),
    ].filter(Boolean).join("\n");
    const subject = `[Survive idea] ${r.title || "(untitled)"} — from ${from === "king" ? "King" : "Lee"}`;
    const sent = await sendResendEmail({ to, subject, text });
    if (!sent.ok) throw new Error(`email to ${to} failed: ${sent.error}`);

    // Remembered on the idea, so the vault shows who has seen it.
    const context = { ...(r.context ?? {}), lastSentTo: to, lastSentAt: now };
    const { error: e2 } = await db.from("ideas").update({ context, updated_at: now }).eq("id", r.id);
    if (e2) rethrow(e2);
    return { ok: true, drafted, to, id: sent.id };
  });
