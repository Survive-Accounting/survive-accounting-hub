// THE EDIT LOG — server side (2026-09-07). Lee: "I want the app/AI to make note of the edits
// I'm making, so 'shorten' (aka standardize) button gets smarter over time … the goal is for
// this to happen automatically in background any time I am making edits."
//
// Two calls: log one settled edit (best-effort — a lost row is real but never worth failing a
// save Lee already made), and read the newest pairs worth learning from as few-shot examples for
// the Shorten brief (src/lib/shorten-brief.ts). Nothing here judges an edit; it records the
// words before and after and who changed them (manual / shorten / shorten-edited — see the
// migration for what each means).
//
// New table (migration/supabase-migrations/20260907_0500_ceq_edit_log.sql), not in the
// generated Supabase types yet — the same escape hatch as cost_events; a missing table is
// reported by name, never swallowed silently.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "./pg-errors";
import type { EditExample, ShortenFields, ShortenKind } from "./shorten-brief";

export const EDIT_SOURCES = ["manual", "shorten", "shorten-edited"] as const;
export type EditSource = (typeof EDIT_SOURCES)[number];
export const MISSING_EDIT_LOG_HINT = "run migration/supabase-migrations/20260907_0500_ceq_edit_log.sql";
const isMissingLog = (e: { code?: string; message: string }) => isMissingSchema(e, /ceq_edit_log/i);

type DB = { from: (t: string) => any };
async function logDb(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}

const choiceSchema = z.object({ text: z.string().max(2000), correct: z.boolean() });
const fieldsSchema = z.object({
  stem: z.string().max(8000).optional(),
  choices: z.array(choiceSchema).max(12).optional(),
  title: z.string().max(2000).optional(),
  text: z.string().max(4000).optional(),
  bullets: z.array(z.string().max(2000)).max(40).optional(),
});

/** One settled save — never per keystroke (the callers debounce). Admin-gated; best-effort by
 *  contract: the UI fires and forgets, and a failure is a console line, not a banner. */
export const logCeqEdit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().max(160).nullable().optional(),
    target: z.string().min(1).max(200),
    kind: z.enum(["ceq", "callout"]),
    source: z.enum(EDIT_SOURCES),
    before: fieldsSchema,
    after: fieldsSchema,
    who: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const db = await logDb();
      const { error } = await db.from("ceq_edit_log").insert({
        set_id: data.setId ?? null, target: data.target, kind: data.kind, source: data.source,
        before: data.before, after: data.after, created_by: data.who ?? null,
      });
      if (error) {
        if (isMissingLog(error)) { console.warn(`[edit-log] not recorded — ${MISSING_EDIT_LOG_HINT}`); return { ok: false, error: MISSING_EDIT_LOG_HINT }; }
        console.warn("[edit-log] insert failed:", error.message);
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[edit-log] insert threw:", msg);
      return { ok: false, error: msg };
    }
  });

export const EXAMPLE_LIMIT = 5;

/** Pure: raw rows → the examples the brief renders. A "shorten-edited" row (he was offered X and
 *  wrote Y) outranks a plain manual edit; newest first within each; rows whose before and after
 *  are the same words teach nothing and are dropped. Exported for the test. */
export function rankEditExamples(rows: readonly { kind: string; source: string; before: unknown; after: unknown; createdAt: string }[], limit = EXAMPLE_LIMIT): EditExample[] {
  const rank: Record<string, number> = { "shorten-edited": 0, manual: 1 };
  return [...rows]
    .filter((r) => (r.kind === "ceq" || r.kind === "callout") && r.source in rank)
    .sort((a, b) => rank[a.source] - rank[b.source] || b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({ kind: r.kind as ShortenKind, source: r.source as "manual" | "shorten-edited", before: fieldsOf(r.before), after: fieldsOf(r.after) }))
    .filter((e) => JSON.stringify(e.before) !== JSON.stringify(e.after))
    .slice(0, limit);
}

/** The newest few pairs worth learning from — Lee's own edits, and his edits over a Shorten. A
 *  missing table → no examples, not an error: a bank with nothing logged yet is the normal
 *  starting state, and Shorten still works, just without the few-shot. */
export const recentEditExamples = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(20).optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<EditExample[]> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const db = await logDb();
      // The newest few dozen, ranked here — one query beats one per source.
      const { data: rows, error } = await db.from("ceq_edit_log").select("kind,source,before,after,created_at")
        .in("source", ["manual", "shorten-edited"]).order("created_at", { ascending: false }).limit(40);
      if (error) { if (!isMissingLog(error)) console.warn("[edit-log] read failed:", error.message); return []; }
      return rankEditExamples(((rows ?? []) as Record<string, unknown>[]).map((r) => ({
        kind: String(r.kind ?? ""), source: String(r.source ?? ""), before: r.before, after: r.after, createdAt: String(r.created_at ?? ""),
      })), data.limit ?? EXAMPLE_LIMIT);
    } catch { return []; }
  });

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
/** A stored jsonb → the brief's fields, defended against whatever an older row holds. */
function fieldsOf(v: unknown): ShortenFields {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: ShortenFields = {};
  const stem = str(o.stem); if (stem !== undefined) out.stem = stem;
  const title = str(o.title); if (title !== undefined) out.title = title;
  const text = str(o.text); if (text !== undefined) out.text = text;
  if (Array.isArray(o.choices)) out.choices = o.choices.map((c) => { const x = (c ?? {}) as Record<string, unknown>; return { text: str(x.text) ?? "", correct: !!x.correct }; });
  if (Array.isArray(o.bullets)) out.bullets = o.bullets.map((b) => str(b) ?? "");
  return out;
}
