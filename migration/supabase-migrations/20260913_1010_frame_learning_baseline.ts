// THE FRAME LEARNING LOOP'S BASELINE — run AFTER 20260913_1000_frame_learning_loop.sql.
//
//   set -a && . ./.env && set +a && bun run migration/supabase-migrations/20260913_1010_frame_learning_baseline.ts          (dry run)
//   set -a && . ./.env && set +a && bun run migration/supabase-migrations/20260913_1010_frame_learning_baseline.ts --live   (writes)
//
// Lee, 2026-09-13, decision 4: "yes let's do recommended."
//
// Two things, both ADDITIVE (new rows only — nothing existing is rewritten):
//   1. One `baseline` event per frame in every saved plan (canvas_scenes.nodes_json →
//      decks[].blastOff.frames), with the frame as it stands. From here on every existing frame has
//      a known starting point, so a later edit or DELETION of a frame made before tracking began is
//      captured too — that is what makes those deletions recoverable.
//   2. Every `callout` row of ceq_edit_log copied in as an `edited` event, keeping its own
//      created_at and source, so the hundreds of callout edits already logged count as style
//      signal from day one. ceq_edit_log itself is untouched (decision 3: Shorten keeps reading it).
//
// NO generation rows are fabricated: nothing tracked produced these frames, so they report
// provenance 'unknown' in frame_outcomes.
//
// IDEMPOTENT. A frame that already has a baseline is skipped; a copied edit is keyed on
// (frame_id, created_at, source) and skipped if present. Run it twice and the second run writes 0.
// A missing frame_events table is reported, never worked around: the dry run still counts what it
// would write, and --live refuses.
import { createClient } from "@supabase/supabase-js";

const live = process.argv.includes("--live");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PAGE = 1000;
const CHUNK = 500;

type Frame = Record<string, unknown> & { id?: unknown };
type Deck = { id?: unknown; blastOff?: { frames?: Frame[] } };
type EventRow = { frame_id: string; set_id: string; event: string; before?: unknown; after?: unknown; source: string; created_by: string | null; created_at?: string };

async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

// ── what the plans hold ────────────────────────────────────────────────────────────────────────
const scenes = await pageAll<{ id: string; nodes_json: { decks?: Deck[] } | null }>((a, b) => db.from("canvas_scenes").select("id,nodes_json").range(a, b));
const baselines: EventRow[] = [];
const seenFrame = new Set<string>();
let dupFrameIds = 0;
for (const s of scenes) {
  for (const d of s.nodes_json?.decks ?? []) {
    const setId = typeof d.id === "string" ? d.id : null;
    if (!setId) continue;
    for (const f of d.blastOff?.frames ?? []) {
      if (typeof f.id !== "string" || !f.id) continue;
      if (seenFrame.has(f.id)) { dupFrameIds++; continue; }
      seenFrame.add(f.id);
      baselines.push({ frame_id: f.id, set_id: setId, event: "baseline", after: f, source: "backfill", created_by: "backfill" });
    }
  }
}

// ── what the edit log already holds ────────────────────────────────────────────────────────────
const logRows = await pageAll<{ set_id: string | null; target: string; source: string; before: unknown; after: unknown; created_by: string | null; created_at: string }>((a, b) =>
  db.from("ceq_edit_log").select("set_id,target,source,before,after,created_by,created_at").eq("kind", "callout").order("created_at", { ascending: true }).range(a, b));
const edits: EventRow[] = logRows
  .filter((r) => !!r.target)
  .map((r) => ({ frame_id: r.target, set_id: r.set_id ?? "unknown", event: "edited", before: r.before, after: r.after, source: r.source, created_by: r.created_by, created_at: r.created_at }));

console.log(`plans: ${scenes.length} scenes → ${baselines.length} frames${dupFrameIds ? ` (${dupFrameIds} repeated frame ids counted once)` : ""}`);
console.log(`ceq_edit_log: ${edits.length} callout edits to copy`);

// ── is the ledger there? ───────────────────────────────────────────────────────────────────────
// A real one-row select: a HEAD count request does not surface "table missing".
const probe = await db.from("frame_events").select("id").limit(1);
if (probe.error) {
  console.log(`frame_events is not there yet (${probe.error.message.slice(0, 80)}).`);
  console.log(live ? "REFUSING --live: run 20260913_1000_frame_learning_loop.sql first." : `[dry run] would write ${baselines.length} baseline + ${edits.length} edited events once the migration has run.`);
  process.exit(live ? 1 : 0);
}

// ── skip what is already written ───────────────────────────────────────────────────────────────
const haveBaseline = new Set((await pageAll<{ frame_id: string }>((a, b) => db.from("frame_events").select("frame_id").eq("event", "baseline").range(a, b))).map((r) => r.frame_id));
const haveEdit = new Set((await pageAll<{ frame_id: string; created_at: string; source: string | null }>((a, b) =>
  db.from("frame_events").select("frame_id,created_at,source").eq("event", "edited").in("source", ["manual", "shorten", "shorten-edited"]).range(a, b)))
  .map((r) => `${r.frame_id}|${new Date(r.created_at).toISOString()}|${r.source}`));
const newBaselines = baselines.filter((b) => !haveBaseline.has(b.frame_id));
const newEdits = edits.filter((e) => !haveEdit.has(`${e.frame_id}|${new Date(e.created_at!).toISOString()}|${e.source}`));

console.log(`${live ? "writing" : "[dry run] would write"}: ${newBaselines.length} baseline (${baselines.length - newBaselines.length} already there) · ${newEdits.length} edited (${edits.length - newEdits.length} already there)`);
if (!live) process.exit(0);

let written = 0;
for (const rows of [newBaselines, newEdits]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("frame_events").insert(rows.slice(i, i + CHUNK));
    if (error) { console.log(`write failed after ${written} rows: ${error.message}`); process.exit(1); }
    written += Math.min(CHUNK, rows.length - i);
  }
}
console.log(`wrote ${written} events.`);
