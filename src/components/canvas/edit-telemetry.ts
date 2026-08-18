// EDIT TELEMETRY (P4) — every trim decision, logged. The point: after a few
// hundred real edits, the X/Y pre/post-roll rule can be tuned from EVIDENCE
// (how often auto-proposals get accepted vs nudged vs overridden, and by how
// much) instead of vibes. No dashboards — just the log and an export.
//
// LOCAL-FIRST, same never-lose rules as the Idea Bank (idea-bank-sync.ts):
//   1. logEditEvent commits to localStorage and RETURNS — nothing awaited on
//      the edit path; Lee is cutting.
//   2. The queue is DERIVED (`!syncedAt`), so it can't drift from the events.
//   3. A failed sync never drops an event — retries on reconnect, focus, and a
//      slow heartbeat. Failures SURFACE via editLogState().error.
//   4. Pruning only ever removes SYNCED events, oldest first.

import { listEditEvents, upsertEditEvents } from "@/lib/edit-events.functions";

export interface EditEvent {
  /** Client-minted — the idempotent upsert key, same scheme as idea notes. */
  id: string;
  /** ISO — when the trim landed. */
  at: string;
  setId: string;
  /** The frame the clip is attached to; null for intro/wrap/outro clips. */
  ceqId: string | null;
  takePath: string;
  takeName: string | null;
  durationS: number | null;
  slateEndMs: number | null;
  /** Detection at event time — null when audio wasn't decoded (never blocks). */
  onsetMs: number | null;
  offsetMs: number | null;
  /** What PROPOSE TRIMS said — null when the clip was never auto-proposed. */
  proposedInS: number | null;
  proposedOutS: number | null;
  finalInS: number;
  finalOutS: number;
  how: "propose" | "drag" | "nudge";
  disposition: "proposed" | "accepted" | "nudged" | "overridden";
  /** The detection/proposal rule that was live (landmarks.TRIM_RULE_VERSION). */
  ruleVersion: string;
  /** The X/Y settings at event time — the thing the log exists to tune. */
  preRollMs: number;
  postRollMs: number;
  syncedAt?: string;
}

/** How far a hand-adjusted trim ended from its auto-proposal. PURE.
 *  accepted = within one shift-nudge (10ms) · nudged = within 300ms ·
 *  overridden = further, or there never was a proposal. */
export function classifyEdit(proposed: { inS: number; outS: number } | null, final: { inS: number; outS: number }): "accepted" | "nudged" | "overridden" {
  if (!proposed) return "overridden";
  const d = Math.max(Math.abs(proposed.inS - final.inS), Math.abs(proposed.outS - final.outS));
  if (d <= 0.011) return "accepted";
  if (d <= 0.3) return "nudged";
  return "overridden";
}

// ---- the local store -------------------------------------------------------

const KEY = "sa-edit-events-v1";
/** Prune bounds: only SYNCED events are ever dropped, oldest first. */
const PRUNE_AT = 4000;
const PRUNE_TO = 3000;
/** The server validator caps a batch at 500 — flush chunks to match, or a queue
 *  past 500 would be rejected whole and wedge forever, growing without bound. */
const MAX_BATCH = 500;

let events: EditEvent[] = [];
let syncing = false;
let error: string | null = null;
let started = false;
let timer: ReturnType<typeof setInterval> | undefined;

const online = (): boolean => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

const subs = new Set<(s: EditLogState) => void>();
const emit = (): void => { const s = editLogState(); subs.forEach((f) => f(s)); };
/** Surface state (esp. sync errors — the missing-migration hint) so the UI can
 *  honour this module's fail-loud contract instead of computing errors and
 *  discarding them. */
export function subscribeEditLog(fn: (s: EditLogState) => void): () => void {
  subs.add(fn);
  fn(editLogState());
  return () => { subs.delete(fn); };
}

export const pendingEvents = (list: EditEvent[]): EditEvent[] => list.filter((e) => !e.syncedAt);

/** Keep the store bounded WITHOUT ever losing an unsynced event. PURE. */
export function pruneEvents(list: EditEvent[], at = PRUNE_AT, to = PRUNE_TO): EditEvent[] {
  if (list.length <= at) return list;
  let drop = list.length - to;
  return list.filter((e) => {
    if (drop > 0 && e.syncedAt) { drop -= 1; return false; }
    return true;
  });
}

const loadLocal = (): EditEvent[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as EditEvent[]) : [];
  } catch { return []; }
};
/** Write, but MERGE with whatever another studio tab wrote since we loaded —
 *  events are immutable and keyed by id, so union-by-id can't lose one; a synced
 *  copy wins so a concurrent ack isn't undone. Without this, two tabs' blind
 *  last-writer-wins overwrites drop each other's unsynced events (rule 3). Also
 *  refreshes our in-memory `events` to the merged truth. */
const saveLocal = (list: EditEvent[]): void => {
  let merged = list;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const byId = new Map(list.map((e) => [e.id, e]));
      for (const d of JSON.parse(raw) as EditEvent[]) {
        const mine = byId.get(d.id);
        if (!mine || (!mine.syncedAt && d.syncedAt)) byId.set(d.id, d);
      }
      if (byId.size !== list.length) merged = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
    }
  } catch { /* corrupt disk copy — our list still writes */ }
  events = merged;
  localStorage.setItem(KEY, JSON.stringify(merged));
};

export interface EditLogState { count: number; pending: number; syncing: boolean; error: string | null }
export const editLogState = (): EditLogState => ({ count: events.length, pending: pendingEvents(events).length, syncing, error });

let seq = 0;
export const mintEditId = (nowMs: number): string => `edit-${nowMs}-${(seq += 1)}-${Math.random().toString(36).slice(2, 8)}`;

/** Commit locally and RETURN — the edit path. Sync is kicked, not awaited. */
export function logEditEvent(ev: Omit<EditEvent, "id" | "at">): void {
  const now = new Date();
  events = pruneEvents([...events, { ...ev, id: mintEditId(now.getTime()), at: now.toISOString() }]);
  saveLocal(events); // throws on quota — surfaced by the caller, never swallowed
  void flushEditLog();
}

/** Push everything unacknowledged, in ≤500 chunks. Re-entrant calls drop;
 *  failure keeps the queue and surfaces the error. */
export async function flushEditLog(): Promise<void> {
  if (syncing) return;
  if (!pendingEvents(events).length) { if (error) { error = null; emit(); } return; }
  if (!online()) { if (error !== "offline — queued") { error = "offline — queued"; emit(); } return; }
  syncing = true;
  emit();
  try {
    // Chunk against the 500-cap: one over-cap batch is rejected whole, nothing
    // acks, and the queue only grows — a permanent, self-reinforcing wedge.
    for (let queue = pendingEvents(events); queue.length; queue = pendingEvents(events)) {
      const acked = await upsertEditEvents({ data: { events: queue.slice(0, MAX_BATCH).map(toRow) } });
      if (!acked.length) break; // server acked nothing — don't spin
      const ackAt = new Map(acked.map((r) => [r.id, r.created_at]));
      events = events.map((e) => (ackAt.has(e.id) ? { ...e, syncedAt: ackAt.get(e.id) as string } : e));
      saveLocal(events);
    }
    error = null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    syncing = false;
    emit();
  }
}

/** Boot: local first, then drain. Idempotent. */
export function startEditLog(): void {
  if (started) return;
  started = true;
  events = loadLocal();
  emit();
  void flushEditLog();
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => { error = null; void flushEditLog(); });
    window.addEventListener("focus", () => void flushEditLog());
    // Another studio tab wrote — adopt its events (merge, never overwrite) so a
    // tab that goes quiet still holds the whole log for export.
    window.addEventListener("storage", (e) => { if (e.key === KEY) { saveLocal(events); emit(); } });
    if (timer) clearInterval(timer);
    timer = setInterval(() => void flushEditLog(), 30_000);
  }
}

/** Test seam. */
export function __resetEditLog(): void { events = []; syncing = false; error = null; started = false; if (timer) clearInterval(timer); timer = undefined; }

// ---- export ---------------------------------------------------------------

const COLS = ["id", "at", "setId", "ceqId", "takePath", "takeName", "durationS", "slateEndMs", "onsetMs", "offsetMs", "proposedInS", "proposedOutS", "finalInS", "finalOutS", "how", "disposition", "ruleVersion", "preRollMs", "postRollMs"] as const;

const csvCell = (v: unknown): string => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** CSV with a stable column order — the analysis side depends on it. PURE. */
export function editLogCsv(list: EditEvent[]): string {
  const head = COLS.join(",");
  const rows = list.map((e) => COLS.map((c) => csvCell((e as unknown as Record<string, unknown>)[c])).join(","));
  return [head, ...rows].join("\n");
}

/** Union by id — events are immutable, so there is nothing to reconcile. PURE. */
export function mergeEvents(local: EditEvent[], remote: EditEvent[]): EditEvent[] {
  const seen = new Set(local.map((e) => e.id));
  return [...local, ...remote.filter((e) => !seen.has(e.id))].sort((a, b) => a.at.localeCompare(b.at));
}

/** The export: server rows merged in when reachable, local-only (and it says so)
 *  when not. JSON + CSV of the same list. */
export async function exportEditLog(): Promise<{ json: string; csv: string; count: number; scope: "merged" | "local-only" }> {
  let merged = [...events];
  let scope: "merged" | "local-only" = "local-only";
  try {
    const rows = await listEditEvents();
    merged = mergeEvents(events, rows.map(fromRow));
    scope = "merged";
  } catch { /* offline / table missing — the caller names the scope */ }
  merged.sort((a, b) => a.at.localeCompare(b.at));
  return { json: JSON.stringify(merged, null, 2), csv: editLogCsv(merged), count: merged.length, scope };
}

// ---- row mapping (snake_case over the wire, camelCase in the app) ----------

export interface EditEventRowDTO {
  id: string; at: string; set_id: string; ceq_id: string | null; take_path: string; take_name: string | null;
  duration_s: number | null; slate_end_ms: number | null; onset_ms: number | null; offset_ms: number | null;
  proposed_in_s: number | null; proposed_out_s: number | null; final_in_s: number; final_out_s: number;
  how: string; disposition: string; rule_version: string; pre_roll_ms: number; post_roll_ms: number; created_at: string;
}

export const toRow = (e: EditEvent): Omit<EditEventRowDTO, "created_at"> => ({
  id: e.id, at: e.at, set_id: e.setId, ceq_id: e.ceqId, take_path: e.takePath, take_name: e.takeName,
  duration_s: e.durationS, slate_end_ms: e.slateEndMs, onset_ms: e.onsetMs, offset_ms: e.offsetMs,
  proposed_in_s: e.proposedInS, proposed_out_s: e.proposedOutS, final_in_s: e.finalInS, final_out_s: e.finalOutS,
  how: e.how, disposition: e.disposition, rule_version: e.ruleVersion, pre_roll_ms: e.preRollMs, post_roll_ms: e.postRollMs,
});

export const fromRow = (r: EditEventRowDTO): EditEvent => ({
  id: r.id, at: r.at, setId: r.set_id, ceqId: r.ceq_id, takePath: r.take_path, takeName: r.take_name,
  durationS: r.duration_s, slateEndMs: r.slate_end_ms, onsetMs: r.onset_ms, offsetMs: r.offset_ms,
  proposedInS: r.proposed_in_s, proposedOutS: r.proposed_out_s, finalInS: r.final_in_s, finalOutS: r.final_out_s,
  how: r.how as EditEvent["how"], disposition: r.disposition as EditEvent["disposition"], ruleVersion: r.rule_version,
  preRollMs: r.pre_roll_ms, postRollMs: r.post_roll_ms, syncedAt: r.created_at,
});
