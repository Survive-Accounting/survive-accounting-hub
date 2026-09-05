// IDEAS TO SAVE — server side. Two calls: list them, save one.
//
// Deliberately thin. The whole product promise is "ten seconds and back to
// work", so there is no validation ceremony beyond what the column types
// need, and NO DELETE — PARKED is the archive.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  CATEGORY_KEY_RE, SOURCE_KINDS, STATUSES, categoryKeyFor, categoryVocabulary, mergeCategories, normalizeCategories,
  type Attachment, type CategoryDef, type CategorySide, type Idea, type SourceKind,
} from "@/components/ideas/model";

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
  categories: normalizeCategories(r.categories),
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

export const listIdeas = createServerFn({ method: "POST" }).handler(async (): Promise<{ ideas: Idea[]; categories: CategoryDef[] }> => {
  const db = await admin();
  const [{ data, error }, custom] = await Promise.all([
    db.from("ideas").select("*").order("updated_at", { ascending: false }),
    readCustomCategories(db),
  ]);
  if (error) rethrow(error);
  return { ideas: (data as Row[]).map(toIdea), categories: mergeCategories(custom) };
});

// ------------------------------------------------------------ categories
// LEE'S OWN CATEGORIES (2026-09-05: "Make it easy to add a new category if I
// want"). Kept in the site_settings singleton under `ideaCategories`, merged
// after the built-ins. Read-modify-write so the flyer URL and the council
// pages living in the same row are never dropped. Hiding keeps the row (an
// old idea still resolves its label); built-ins cannot be hidden.
const SETTINGS_KEY = "ideaCategories";
async function readCustomCategories(db: { from: (t: string) => any }): Promise<CategoryDef[]> {
  try {
    const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
    const raw = ((data?.settings ?? {}) as Record<string, unknown>)[SETTINGS_KEY];
    return Array.isArray(raw) ? (raw as CategoryDef[]).filter((c) => c && typeof c.key === "string" && typeof c.label === "string") : [];
  } catch { return []; }
}
async function writeCustomCategories(db: { from: (t: string) => any }, next: CategoryDef[]): Promise<void> {
  const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
  const settings = { ...((data?.settings ?? {}) as Record<string, unknown>), [SETTINGS_KEY]: next };
  const { error } = await db.from("site_settings").upsert({ id: 1, settings, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

export const addIdeaCategory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    label: z.string().trim().min(1).max(60),
    side: z.enum(["work", "personal"]),
    parent: z.string().regex(CATEGORY_KEY_RE).nullable().default(null),
    hint: z.string().trim().max(200).default(""),
  }).parse(d))
  .handler(async ({ data }): Promise<{ categories: CategoryDef[]; key: string }> => {
    const db = await admin();
    const custom = await readCustomCategories(db);
    const all = mergeCategories(custom);
    const parent = data.parent && all.some((c) => c.key === data.parent) ? data.parent : undefined;
    const key = categoryKeyFor(data.label, all);
    const def: CategoryDef = { key, label: data.label, hint: data.hint || data.label, side: data.side, ...(parent ? { parent } : {}), custom: true };
    await writeCustomCategories(db, [...custom, def]);
    return { categories: mergeCategories([...custom, def]), key };
  });

export const hideIdeaCategory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: z.string().regex(CATEGORY_KEY_RE), hidden: z.boolean().default(true) }).parse(d))
  .handler(async ({ data }): Promise<{ categories: CategoryDef[] }> => {
    const db = await admin();
    const custom = await readCustomCategories(db);
    if (!custom.some((c) => c.key === data.key)) throw new Error("Only a category you added can be hidden.");
    const next = custom.map((c) => (c.key === data.key ? { ...c, hidden: data.hidden } : c));
    await writeCustomCategories(db, next);
    return { categories: mergeCategories(next) };
  });

// --------------------------------------------- talkthrough content ideas
/** THE CONTENT IDEAS STAMPED IN TALKTHROUGHS (Lee, 2026-09-05: "At the top, I
 *  want to see all the content ideas I've stamped … these are the most
 *  important things I need to be ideating on"). Read-only here — the booth's
 *  board owns them; this is the one list across every session, newest first,
 *  live rows only (archived and dismissed stay in the booth's own history). */
export interface StampedIdea {
  id: string; sessionId: string; setName: string; title: string; body: string;
  stamp: string; kind: string; status: string; quote: string; createdAt: string;
}
export const listStampedIdeas = createServerFn({ method: "POST" }).handler(async (): Promise<{ items: StampedIdea[] }> => {
  const db = await admin();
  const [board, sessions] = await Promise.all([
    db.from("talkthrough_board_items").select("*").eq("kind", "idea").is("archived_at", null).order("created_at", { ascending: false }).limit(400),
    db.from("talkthrough_sessions").select("id,set_name").limit(1000),
  ]);
  if (board.error) {
    // The booth's tables may not exist on a fresh database — an empty strip, not a broken page.
    if (board.error.code === "42P01" || /does not exist/i.test(board.error.message)) return { items: [] };
    throw new Error(board.error.message);
  }
  const setOf = new Map<string, string>(((sessions.data ?? []) as { id: string; set_name: string | null }[]).map((s) => [s.id, s.set_name ?? ""]));
  type R = { id: string; session_id: string; title: string; payload: Record<string, unknown> | null; quote: string | null; status: string; created_at: string; dismissed?: boolean | null };
  const items = ((board.data ?? []) as R[]).filter((r) => !r.dismissed).map((r) => {
    const p = r.payload ?? {};
    return {
      id: r.id, sessionId: r.session_id, setName: setOf.get(r.session_id) ?? "",
      title: r.title || String(p.body ?? "").slice(0, 60), body: typeof p.body === "string" ? p.body : "",
      stamp: typeof p.stamp === "string" ? p.stamp : typeof p.kind === "string" ? p.kind : "",
      kind: typeof p.kind === "string" ? p.kind : "", status: r.status, quote: r.quote ?? "", createdAt: r.created_at,
    };
  });
  return { items };
});

const ideaInput = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(300).default(""),
  body: z.string().max(20_000).default(""),
  categories: z.array(z.string().regex(CATEGORY_KEY_RE)).max(7).default([]),
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
      categories: normalizeCategories(data.categories),
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
      const defs = mergeCategories(await readCustomCategories(db));
      const allowed = new Set(defs.filter((c) => !c.hidden).map((c) => c.key));
      const org = buildOrganizeMessages({
        title: r.title || words.slice(0, 80), body: r.body, categories: normalizeCategories(r.categories), subcategory: r.subcategory ?? "",
        sourcePath: r.source_path ?? "", pageTitle: ctx.title ?? "", existingPrompt: r.prompt_md,
        intent: ctx.intent, other: ctx.other, vocabulary: categoryVocabulary(defs),
      });
      const res = await runAiTask("micro", { system: org.system, user: org.user, maxOutput: 700 });
      const m = res.text.match(/\{[\s\S]*\}/);
      if (m) {
        const j = JSON.parse(m[0]) as { title?: unknown; tldr?: unknown; summary?: unknown; categories?: unknown; urgent?: unknown };
        const title = typeof j.title === "string" ? j.title.trim().slice(0, 120) : "";
        if (title) r.title = title;
        if (typeof j.tldr === "string") ctx.tldr = j.tldr.trim();
        if (typeof j.summary === "string") ctx.summary = j.summary.trim();
        // CATEGORIES ARE AI'S, EVERY TIME (Lee, 2026-09-03: "let AI continuously
        // update the tags/categories. Let it figure that out.") — the modal no
        // longer offers chips; each organise re-decides.
        if (Array.isArray(j.categories)) {
          const cats = j.categories.filter((c): c is string => typeof c === "string" && allowed.has(c)).slice(0, 2);
          if (cats.length) r.categories = cats;
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

    // 1b. MERGE (Lee, 2026-09-03): fold a duplicate or an extension into the
    // open idea it belongs to. The words are APPENDED to that idea (nothing
    // rewritten), this one is parked with a pointer back, and the target's
    // prompt is flagged stale so the watch sync redrafts it. Never for
    // to-dos, drafts, uploads, or an idea that already merged.
    if (data.organize && !isTodo && ctx.draft !== "1" && !ctx.mergedInto && !ctx.importedFrom && words) {
      const { data: openRows } = await db.from("ideas").select("id,title,context,status")
        .in("status", ["IDEA", "DRAFTED", "SUBMITTED"]).neq("id", r.id).order("updated_at", { ascending: false }).limit(60);
      const cands = ((openRows ?? []) as Pick<Row, "id" | "title" | "context">[])
        .filter((c) => !c.context?.todo && c.context?.draft !== "1" && !c.context?.mergedInto && c.title)
        .map((c) => ({ id: c.id, title: c.title, tldr: c.context?.tldr ?? "", page: c.context?.page ?? "" }));
      if (cands.length) {
        const { buildMergeMessages } = await import("@/lib/ideas-prompt");
        const mm = buildMergeMessages({ title: r.title, body: r.body, tldr: ctx.tldr, sourcePath: r.source_path ?? "" }, cands);
        const res = await runAiTask("micro", { system: mm.system, user: mm.user, maxOutput: 200 });
        const m = res.text.match(/\{[\s\S]*\}/);
        const j = m ? (JSON.parse(m[0]) as { relation?: unknown; id?: unknown; why?: unknown }) : {};
        const targetId = typeof j.id === "string" && cands.some((c) => c.id === j.id) ? j.id : null;
        if ((j.relation === "duplicate" || j.relation === "extends") && targetId) {
          const { data: t, error: te } = await db.from("ideas").select("*").eq("id", targetId).single();
          if (te) rethrow(te);
          const target = t as Row;
          const stamp = new Date(now).toLocaleDateString("en-US");
          const addendum = `\n\n— Added ${stamp} from a later capture (${(r.created_by || "").toLowerCase() || "lee"}${r.source_path ? `, on ${r.source_path}` : ""}):\n${r.body.trim()}`;
          const tctx: Record<string, string> = {
            ...(target.context ?? {}),
            mergedFrom: [target.context?.mergedFrom, r.id].filter(Boolean).join(","),
            ...(target.prompt_md?.trim() ? { stalePrompt: "1" } : {}),
          };
          const { error: ue } = await db.from("ideas").update({ body: `${target.body}${addendum}`, context: tctx, updated_at: now }).eq("id", target.id);
          if (ue) rethrow(ue);
          ctx.mergedInto = target.id;
          ctx.mergedWhy = typeof j.why === "string" ? j.why.slice(0, 300) : String(j.relation);
          const { data: out, error: pe } = await db.from("ideas").update({
            title: r.title, categories: r.categories ?? [], context: ctx, status: "PARKED", updated_at: now,
          }).eq("id", r.id).select().single();
          if (pe) rethrow(pe);
          return { idea: toIdea(out as Row), drafted: false };
        }
      }
    }
    if (ctx.mergedInto) {
      const { data: out, error: e0 } = await db.from("ideas").update({ context: ctx, updated_at: now }).eq("id", r.id).select().single();
      if (e0) rethrow(e0);
      return { idea: toIdea(out as Row), drafted: false };
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

/** ADD TO BUILD QUEUE (Lee, 2026-09-03): "pick and choose what I'd like to
 *  queue up … automatically armed … urgent, high, medium, low priority."
 *  Arming sets the priority and status SUBMITTED; the runner on the build
 *  machine does the rest. Un-arming takes it back to DRAFTED. Re-arming a
 *  failed or built idea clears the old run so it builds again. */
export const armIdeas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    ids: z.array(z.string().min(1).max(80)).min(1).max(100),
    armed: z.boolean(),
    priority: z.enum(["urgent", "high", "medium", "low"]).default("medium"),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; count: number }> => {
    const db = await admin();
    const { data: rows, error } = await db.from("ideas").select("id,status,context").in("id", data.ids);
    if (error) rethrow(error);
    const now = new Date().toISOString();
    for (const r of (rows ?? []) as Pick<Row, "id" | "status" | "context">[]) {
      const ctx: Record<string, string> = { ...(r.context ?? {}) };
      // RESUME (2026-09-03): a build that stopped early pushed partial work to
      // its branch. Re-arming continues on that branch instead of starting
      // over — the runner reads `resume` + `branch`.
      const partial = ctx.runFailed === "1" && !!ctx.branch && !!ctx.sha;
      for (const k of ["built", "builtAt", "runStartedAt", "runFailed", "runError", "previewUrl", "previewState", "report", "testChecklist", "sizeChecked"]) delete ctx[k];
      let status = r.status;
      if (data.armed) {
        ctx.armed = "1"; ctx.queuePriority = data.priority; ctx.armedAt = now;
        // QUEUE ANYWAY: the hands-on gate flagged it once; arming it again is
        // Lee overruling the gate, so the runner skips it this time.
        if (ctx.handsOn) ctx.forceQueue = "1"; else delete ctx.forceQueue;
        if (data.priority === "urgent") ctx.urgent = "1";
        if (partial) ctx.resume = "1"; else { delete ctx.resume; delete ctx.branch; delete ctx.sha; }
        status = "SUBMITTED";
      } else {
        delete ctx.armed; delete ctx.queuePriority; delete ctx.armedAt; delete ctx.resume;
        if (status === "SUBMITTED") status = "DRAFTED";
      }
      const { error: e } = await db.from("ideas").update({ context: ctx, status, updated_at: now }).eq("id", r.id);
      if (e) rethrow(e);
    }
    return { ok: true, count: (rows ?? []).length };
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
