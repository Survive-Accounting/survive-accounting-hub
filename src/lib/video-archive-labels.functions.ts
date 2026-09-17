// video-archive-labels.functions.ts — the AI labeling pass + admin edits for the legacy video archive
// (/outreach/video-archive). Client-safe module: createServerFn endpoints that dynamically import the
// server-only Supabase admin client and the AI door inside handlers. Gated only by the client-side
// AdminGate (same as the rest of /outreach and video-archive.functions.ts) — no server-side auth,
// matching the existing model.
//
// Columns come from migration 20260917_1200_video_archive_labels.sql. Until Lee applies it every
// function here returns { ok: false, error: LABELS_MIGRATION_HINT } — loud, never a silent no-op.
// A row Lee has hand-labeled (label_source = 'lee') is never overwritten by the AI pass.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";
import {
  buildLabelMessages,
  COURSE_FAMILIES,
  LABEL_COLUMNS_RE,
  LABELS_MIGRATION_HINT,
  parseLabel,
  VIDEO_KINDS,
  type CourseFamily,
  type VideoKind,
} from "@/lib/video-archive-labels";

export interface ArchiveLabel {
  id: string;
  course_family: string | null; // string, not CourseFamily: the scenario path may have written other values
  kind: VideoKind | null;
  chapter_number: number | null;
  source_ref: string | null;
  position: number | null;
  playlist_key: string | null;
  label_source: "ai" | "lee" | null;
  label_confidence: number | null;
  label_note: string | null;
  labeled_at: string | null;
}

export interface LabeledItem {
  id: string;
  title: string | null;
  course_family: CourseFamily | null;
  kind: VideoKind | null;
  chapter_number: number | null;
  source_ref: string | null;
  confidence: number;
  note: string;
}

export type LabelBatchResult =
  | { ok: true; attempted: number; labeled: number; failed: number; remaining: number; costUsd: number; items: LabeledItem[]; errors: string[] }
  | { ok: false; error: string };

export interface ArchiveLabelStats {
  total: number;
  labeled: number;
  unlabeled: number;
  bySource: { ai: number; lee: number };
  /** course_family ("" = none) → kind ("" = none) → count */
  matrix: Record<string, Record<string, number>>;
}

export type ArchiveLabelStatsResult = ({ ok: true } & ArchiveLabelStats) | { ok: false; error: string };
export type ArchiveLabelsResult = { ok: true; labels: Record<string, ArchiveLabel> } | { ok: false; error: string };

const LABEL_COLS = "id,course_family,kind,chapter_number,source_ref,position,playlist_key,label_source,label_confidence,label_note,labeled_at";
const PAGE = 1000; // PostgREST caps a response at 1000 rows — page with .range()
const AI_CONCURRENCY = 4;

type Db = { from: (t: string) => any };
async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

const isLabelsMissing = (error: any): boolean => isMissingSchema(error ?? {}, LABEL_COLUMNS_RE);

/** Rows the AI may write: never Lee's. (`neq` alone would drop the nulls.) */
const NOT_LEE = "label_source.is.null,label_source.neq.lee";

const toLabel = (r: any): ArchiveLabel => ({
  id: r.id,
  course_family: r.course_family ?? null,
  kind: r.kind ?? null,
  chapter_number: r.chapter_number ?? null,
  source_ref: r.source_ref ?? null,
  position: r.position ?? null,
  playlist_key: r.playlist_key ?? null,
  label_source: r.label_source ?? null,
  label_confidence: r.label_confidence == null ? null : Number(r.label_confidence),
  label_note: r.label_note ?? null,
  labeled_at: r.labeled_at ?? null,
});

/** Every row's label columns, keyed by id (the grid merges them onto listVideoArchive). */
export const listArchiveLabels = createServerFn({ method: "GET" }).handler(async (): Promise<ArchiveLabelsResult> => {
  const sb = await db();
  const labels: Record<string, ArchiveLabel> = {};
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from("video_archive").select(LABEL_COLS).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) {
      if (isLabelsMissing(error)) return { ok: false, error: LABELS_MIGRATION_HINT };
      throw new Error(error.message);
    }
    const chunk = (data ?? []) as any[];
    for (const r of chunk) labels[r.id] = toLabel(r);
    if (chunk.length < PAGE) break;
  }
  return { ok: true, labels };
});

/** Counts: total / labeled / unlabeled / by source / course_family × kind. */
export const archiveLabelStats = createServerFn({ method: "GET" }).handler(async (): Promise<ArchiveLabelStatsResult> => {
  const sb = await db();
  const stats: ArchiveLabelStats = { total: 0, labeled: 0, unlabeled: 0, bySource: { ai: 0, lee: 0 }, matrix: {} };
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("video_archive")
      .select("id,course_family,kind,label_source,labeled_at")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      if (isLabelsMissing(error)) return { ok: false, error: LABELS_MIGRATION_HINT };
      throw new Error(error.message);
    }
    const chunk = (data ?? []) as any[];
    for (const r of chunk) {
      stats.total += 1;
      if (r.labeled_at) stats.labeled += 1;
      else stats.unlabeled += 1;
      if (r.label_source === "ai") stats.bySource.ai += 1;
      else if (r.label_source === "lee") stats.bySource.lee += 1;
      const c = (r.course_family as string | null) ?? "";
      const k = (r.kind as string | null) ?? "";
      (stats.matrix[c] ??= {})[k] = ((stats.matrix[c] ??= {})[k] ?? 0) + 1;
    }
    if (chunk.length < PAGE) break;
  }
  return { ok: true, ...stats };
});

/** Lee's hand label — writes label_source = 'lee', which the AI pass then leaves alone. */
export const setArchiveLabel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        course_family: z.enum(COURSE_FAMILIES).nullable(),
        kind: z.enum(VIDEO_KINDS).nullable(),
        chapter_number: z.number().int().min(1).max(40).nullable(),
        source_ref: z.string().trim().max(40).nullable().transform((v) => (v ? v : null)),
        position: z.number().int().min(0).max(100_000).nullable(),
        playlist_key: z.string().trim().max(120).nullable().transform((v) => (v ? v : null)),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; label: ArchiveLabel } | { ok: false; error: string }> => {
    const sb = await db();
    const { id, ...fields } = data;
    const { data: row, error } = await sb
      .from("video_archive")
      .update({ ...fields, label_source: "lee", labeled_at: new Date().toISOString() })
      .eq("id", id)
      .select(LABEL_COLS)
      .maybeSingle();
    if (error) {
      if (isLabelsMissing(error)) return { ok: false, error: LABELS_MIGRATION_HINT };
      throw new Error(error.message);
    }
    if (!row) throw new Error(`Video not found: ${id}`);
    return { ok: true, label: toLabel(row) };
  });

/** Run `fn` over `items` with at most `n` in flight; results keep input order. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/**
 * Label the next batch with the AI door (micro task = Haiku, cheap enough for 1,300 rows).
 * onlyUnlabeled = true → rows with labeled_at null; false → re-label AI rows too. Lee's rows are never touched
 * either way (the update re-checks label_source, so a hand edit that lands mid-batch wins).
 */
export const labelArchiveBatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(25), onlyUnlabeled: z.boolean().default(true) }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<LabelBatchResult> => {
    const sb = await db();
    let q = sb
      .from("video_archive")
      .select("id,title,duration_sec,transcript_text,label_source,labeled_at")
      .or(NOT_LEE)
      .order("created_at_source", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(data.limit);
    if (data.onlyUnlabeled) q = q.is("labeled_at", null);
    const { data: rows, error } = await q;
    if (error) {
      if (isLabelsMissing(error)) return { ok: false, error: LABELS_MIGRATION_HINT };
      throw new Error(error.message);
    }
    const batch = (rows ?? []) as Array<{ id: string; title: string | null; duration_sec: number | null; transcript_text: string | null }>;

    const { runAiTask } = await import("@/lib/ai.server");
    const items: LabeledItem[] = [];
    const errors: string[] = [];
    let costUsd = 0;

    const results = await pool(batch, AI_CONCURRENCY, async (row) => {
      const name = row.title?.trim() || row.id.slice(0, 8);
      try {
        const m = buildLabelMessages(row);
        const r = await runAiTask("micro", { system: m.system, user: m.user, maxOutput: 400 });
        costUsd += r.usage.costUsd;
        const parsed = parseLabel(r.text);
        // No JSON at all still gets stamped (confidence 0, note says why) so the row is visible in the grid
        // and the next batch moves on instead of re-hitting it forever. Re-run with onlyUnlabeled=false later.
        const label = parsed ?? { course_family: null, kind: null, chapter_number: null, source_ref: null, confidence: 0, note: `AI reply had no JSON: ${r.text.slice(0, 120)}` };
        const { data: upd, error: ue } = await sb
          .from("video_archive")
          .update({
            course_family: label.course_family,
            kind: label.kind,
            chapter_number: label.chapter_number,
            source_ref: label.source_ref,
            label_source: "ai",
            label_confidence: label.confidence,
            label_note: label.note || null,
            labeled_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .or(NOT_LEE)
          .select("id");
        if (ue) {
          if (isLabelsMissing(ue)) throw new Error(LABELS_MIGRATION_HINT);
          throw new Error(ue.message);
        }
        if (!upd?.length) throw new Error("skipped — Lee labeled it while the batch ran");
        return { ok: true as const, item: { id: row.id, title: row.title, ...label } };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === LABELS_MIGRATION_HINT) throw e;
        return { ok: false as const, error: `${name}: ${msg}` };
      }
    }).catch((e) => {
      if (e instanceof Error && e.message === LABELS_MIGRATION_HINT) return null;
      throw e;
    });
    if (results === null) return { ok: false, error: LABELS_MIGRATION_HINT };

    for (const r of results) {
      if (r.ok) items.push(r.item);
      else errors.push(r.error);
    }

    const { count, error: ce } = await sb.from("video_archive").select("id", { count: "exact", head: true }).is("labeled_at", null);
    if (ce) throw new Error(ce.message);

    console.log(`[archive-labels] attempted=${batch.length} labeled=${items.length} failed=${errors.length} remaining=${count ?? 0} cost=$${costUsd.toFixed(4)}`);
    return { ok: true, attempted: batch.length, labeled: items.length, failed: errors.length, remaining: count ?? 0, costUsd, items, errors };
  });
