// IDEA BANK SYNC — local-first, queued, and loud about failure.
//
// THE CONTRACT:
//   1. A capture is committed to localStorage and the UI confirms SYNCHRONOUSLY.
//      Nothing here is ever awaited on the capture path — Lee is filming.
//   2. Anything not yet acknowledged by the server stays queued. The queue is
//      DERIVED (`syncedAt < updatedAt`), so it cannot drift out of step with the
//      notes the way a parallel list would.
//   3. A failed sync never drops a note. It retries: on a timer, on reconnect,
//      and on window focus.
//   4. Failures SURFACE. The last error is exposed for the UI to show, because a
//      silently swallowed write is the bug this whole rewrite exists to kill.
//
// A module-level store, not React state: the board, the capture box and the
// Studio's unsynced badge are three different mounts that must never disagree.

import { listIdeaNotes, upsertIdeaNotes } from "@/lib/idea-bank.functions";

import { fromRow, loadLocal, mergeNotes, pendingNotes, recoverOrphans, saveLocal, toRow, type IdeaNote } from "./idea-bank";

export interface BankState {
  notes: IdeaNote[];
  /** How many notes the server has not acknowledged. 0 = everything is safe. */
  pending: number;
  syncing: boolean;
  /** Last failure, verbatim. Null once a sync succeeds. */
  error: string | null;
  /** Server reachable as far as we know (drives "will retry" copy). */
  online: boolean;
  loadedRemote: boolean;
}

let notes: IdeaNote[] = [];
let syncing = false;
let error: string | null = null;
let loadedRemote = false;
let started = false;
let timer: ReturnType<typeof setInterval> | undefined;

const subs = new Set<(s: BankState) => void>();
const online = (): boolean => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export const bankState = (): BankState => ({
  notes,
  pending: pendingNotes(notes).length,
  syncing,
  error,
  online: online(),
  loadedRemote,
});

const emit = () => { const s = bankState(); subs.forEach((f) => f(s)); };

export function subscribeBank(fn: (s: BankState) => void): () => void {
  subs.add(fn);
  fn(bankState());
  return () => { subs.delete(fn); };
}

/** Commit locally and RETURN — the capture path. Throws only if localStorage
 *  itself fails, which the caller shows; it does not fail quietly. Sync is
 *  kicked off but deliberately not awaited. */
export function commitLocal(next: IdeaNote[]): void {
  notes = next;
  saveLocal(notes);   // throws on quota — surfaced, never swallowed
  emit();
  void flush();
}

/** Push everything the server has not acknowledged. Safe to call at any time;
 *  re-entrant calls are dropped, and a failure leaves the queue intact. */
export async function flush(): Promise<void> {
  if (syncing) return;
  const queue = pendingNotes(notes);
  if (!queue.length) { if (error) { error = null; emit(); } return; }
  if (!online()) { error = "offline — queued"; emit(); return; }

  syncing = true; emit();
  try {
    const acked = await upsertIdeaNotes({ data: { notes: queue.map(toRow) } });
    // Stamp syncedAt from what the server ACKNOWLEDGED, not from what we sent.
    // If a note was edited again while the request was in flight, its updatedAt
    // has moved on and it correctly stays queued.
    const ackAt = new Map(acked.map((r) => [r.id, r.updated_at]));
    notes = notes.map((n) => (ackAt.has(n.id) ? { ...n, syncedAt: ackAt.get(n.id) as string } : n));
    saveLocal(notes);
    error = null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    syncing = false;
    emit();
  }
}

/** Pull the server's copy and merge it in. Local pending notes always survive
 *  the merge, so loading can never overwrite something not yet pushed. */
export async function pull(): Promise<void> {
  try {
    const rows = await listIdeaNotes();
    notes = mergeNotes(notes, rows.map(fromRow));
    saveLocal(notes);
    loadedRemote = true;
    error = null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  emit();
  void flush();
}

/** Boot: local first (instant), sweep this origin's orphans, then reconcile with
 *  the server. Idempotent — mounting the board twice does not double anything. */
export function startBank(): { recovered: number; sources: string[] } {
  if (started) { void pull(); return { recovered: 0, sources: [] }; }
  started = true;

  notes = loadLocal();
  // Whatever v1 stranded on THIS origin gets adopted just by opening here.
  const rec = recoverOrphans(notes);
  notes = rec.notes;
  if (rec.found) { try { saveLocal(notes); } catch { /* reported by the next commit */ } }
  emit();

  void pull();

  if (typeof window !== "undefined") {
    // Retry on every signal that the network may be back.
    window.addEventListener("online", () => { error = null; void flush(); });
    window.addEventListener("focus", () => void flush());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) void flush(); });
    // …and a slow heartbeat, so a queue left by a failed request drains even if
    // Lee never refocuses the window.
    if (timer) clearInterval(timer);
    timer = setInterval(() => void flush(), 30_000);
  }
  return { recovered: rec.found, sources: rec.sources };
}

/** Test seam: reset the module between cases. */
export const __resetBank = (seed: IdeaNote[] = []): void => {
  notes = seed; syncing = false; error = null; loadedRemote = false; started = false;
  if (timer) clearInterval(timer);
};
