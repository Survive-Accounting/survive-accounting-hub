// THE PRODUCTION RUN — server side. Whole-document writes of the run (upsertProductionRun,
// best-effort from the widget), the reads Step 5 and the Cross-post picker need, and the task
// lists in site_settings. The pure model is production-run.ts; the widget is
// components/v3/ProductionTimer.tsx; the page is components/v3/improve/ImprovePage.tsx.
//
// production_runs is new (migration/supabase-migrations/20260907_0300) and isn't in the
// generated Supabase types yet — same DB-cast escape hatch as production-time.functions.ts,
// for the same reason. A missing table is reported by NAME (isMissingSchema), never swallowed:
// writes come back `ok: false` with the migration path (the pill shows it), reads come back
// empty so the page still renders — but the widget's first write after the migration is
// forgotten will say so on screen.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "./pg-errors";
import { DEFAULT_TASK_LISTS, normalizeRun, normalizeTaskLists, RUN_STEPS, TASK_KEY_RE, type ProductionRun, type TaskLists } from "./production-run";
// RUN_STEPS is the steps record's key enum below; the task-list schema spells the four out.

const MIGRATION = "migration/supabase-migrations/20260907_0300_production_runs.sql";
const isMissingRuns = (e: { code?: string; message: string }) => isMissingSchema(e, /production_runs/i);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
async function db(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}
async function admin(): Promise<DB> {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  return db();
}

const runInput = z.object({
  id: z.string().min(1).max(80),
  setId: z.string().min(1).max(160), setName: z.string().max(200), topicSlug: z.string().max(160), topicName: z.string().max(200),
  setSlug: z.string().max(160),
  startedAt: z.string().max(40), endedAt: z.string().max(40).nullable(),
  status: z.enum(["running", "done", "abandoned"]),
  steps: z.record(z.enum(RUN_STEPS), z.unknown()),
  createdBy: z.string().max(40).nullable(),
});

/** The whole run, replaced. Never throws: `ok: false` carries the reason (the migration path
 *  when the table is missing) for the pill to show — Lee's set is never blocked on a save. */
export const upsertProductionRun = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => runInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const run = normalizeRun(data);
    if (!run) return { ok: false, error: "That run document doesn't parse." };
    try {
      const d = await admin();
      const { error } = await d.from("production_runs").upsert({
        id: run.id, set_id: run.setId, set_name: run.setName || null, topic_slug: run.topicSlug || null, topic_name: run.topicName || null,
        status: run.status, started_at: run.startedAt, ended_at: run.endedAt, data: run, created_by: run.createdBy, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (error) return { ok: false, error: isMissingRuns(error) ? `The runs table doesn't exist yet — run ${MIGRATION}.` : error.message };
      return { ok: true };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });

const rowsToRuns = (rows: unknown[] | null): ProductionRun[] =>
  (rows ?? []).map((r) => normalizeRun((r as { data?: unknown }).data)).filter((r): r is ProductionRun => !!r);

/** Every run (newest first), or one set's. Step 5 reads all of them for Time-to-beat and the
 *  cross-set table; the set's own are a filter on the client. Capped — Lee's volume is one row
 *  per set, and the average is over complete runs anyway. */
export const listProductionRuns = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().max(160).optional() }).optional().parse(d))
  .handler(async ({ data }): Promise<{ runs: ProductionRun[]; error?: string }> => {
    const d = await admin();
    let q = d.from("production_runs").select("data").order("started_at", { ascending: false }).limit(500);
    if (data?.setId) q = q.eq("set_id", data.setId);
    const { data: rows, error } = await q;
    if (error) {
      if (isMissingRuns(error)) return { runs: [], error: `The runs table doesn't exist yet — run ${MIGRATION}.` };
      throw new Error(`Could not load the runs: ${error.message}`);
    }
    return { runs: rowsToRuns(rows) };
  });

/** The newest running run — what the widget restores when localStorage has nothing (a new
 *  browser, a cleared one). */
export const getActiveRun = createServerFn({ method: "GET" }).handler(async (): Promise<{ run: ProductionRun | null }> => {
  const d = await admin();
  const { data: rows, error } = await d.from("production_runs").select("data").eq("status", "running").order("started_at", { ascending: false }).limit(1);
  if (error) { if (isMissingRuns(error)) return { run: null }; throw new Error(`Could not load the active run: ${error.message}`); }
  return { run: rowsToRuns(rows)[0] ?? null };
});

/** Mark a run abandoned by id — for a stale run found on the server, without pulling the
 *  whole document down first. Same best-effort contract as the upsert. */
export const abandonRun = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const d = await admin();
      const { data: rows, error: readErr } = await d.from("production_runs").select("data").eq("id", data.id).limit(1);
      if (readErr) return { ok: false, error: isMissingRuns(readErr) ? `The runs table doesn't exist yet — run ${MIGRATION}.` : readErr.message };
      const run = rowsToRuns(rows)[0];
      if (!run) return { ok: false, error: "No such run." };
      if (run.status !== "running") return { ok: true };
      const now = new Date().toISOString();
      const next: ProductionRun = { ...run, status: "abandoned", endedAt: now };
      const { error } = await d.from("production_runs").update({ status: "abandoned", ended_at: now, data: next, updated_at: now }).eq("id", data.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });

// ------------------------------------------------------------------ the task lists

async function readSettings(d: DB): Promise<Record<string, unknown>> {
  const { data } = await d.from("site_settings").select("settings").eq("id", 1).maybeSingle();
  return ((data?.settings as Record<string, unknown> | null) ?? {});
}

/** site_settings.settings.productionTasks, validated — the code default when unset or when the
 *  saved shape doesn't validate (`source` says which, so the editor can say so). */
export const getProductionTaskLists = createServerFn({ method: "GET" }).handler(async (): Promise<{ lists: TaskLists; source: "settings" | "code" }> => {
  const d = await admin();
  const s = await readSettings(d);
  const lists = normalizeTaskLists(s.productionTasks);
  return lists ? { lists, source: "settings" } : { lists: DEFAULT_TASK_LISTS, source: "code" };
});

const taskList = z.array(z.object({ key: z.string().regex(TASK_KEY_RE), label: z.string().trim().min(1).max(120) })).min(1).max(30);
const taskListsInput = z.object({ talkthrough: taskList, results: taskList, film: taskList, post: taskList });

export const setProductionTaskLists = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => taskListsInput.parse(d))
  .handler(async ({ data }): Promise<{ lists: TaskLists }> => {
    const lists = normalizeTaskLists(data);
    if (!lists) throw new Error("Task lists must have every step, unique slug keys and non-empty labels.");
    const d = await admin();
    const cur = await readSettings(d);
    const { error } = await d.from("site_settings").upsert({ id: 1, settings: { ...cur, productionTasks: lists } }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { lists };
  });
