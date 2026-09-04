// TALKTHROUGH SYNC — local-first, queued, loud about failure. This is
// idea-bank-sync.ts's contract applied to the booth's four stores:
//
//   1. A capture commits to localStorage and the UI confirms SYNCHRONOUSLY.
//      Nothing on the capture path awaits the network — Lee is mid-sentence.
//   2. Anything the server has not acknowledged stays queued. The queue is
//      DERIVED (`syncedAt < updatedAt`), so it cannot drift from the data.
//   3. A failed sync never drops a row. Retries: timer, reconnect, focus.
//   4. Failures SURFACE — the last error is exposed for the UI to show.
//
// Module-level store, not React state: the booth, the sessions list and the
// board are different mounts that must never disagree.
import { listTalkthrough, upsertTalkthrough } from "@/lib/talkthrough.functions";

import {
  dismissableResults, dismissableResultsForSet, docPendingCount, emptyDoc, fromBoardItemRow, fromSegmentRow, fromSessionRow, fromTagRow,
  loadLocalDoc, mergeRows, pendingRows, saveLocalDoc, touchRow,
  toBoardItemRow, toSegmentRow, toSessionRow, toTagRow,
  type BoardItem, type TTDoc, type TalkSegment, type TalkSession, type TalkTag,
} from "./talkthrough";

export interface TTState {
  doc: TTDoc;
  /** Rows the server has not acknowledged. 0 = everything is safe. */
  pending: number;
  syncing: boolean;
  /** Last failure, verbatim. Null once a sync succeeds. */
  error: string | null;
  /** The server SUCCEEDED but could not store everything it was sent — today
   *  that means the `dismissed` column is missing and "Clear old results" is
   *  local-only until its migration runs. Sticky until a clean reply; shown
   *  in the studio's sync chip and beside the button that writes it, so a
   *  half-working feature can never look like a working one. */
  warning: string | null;
  online: boolean;
  loadedRemote: boolean;
}

let doc: TTDoc = emptyDoc();
let syncing = false;
let error: string | null = null;
let warning: string | null = null;
let loadedRemote = false;
let started = false;
let timer: ReturnType<typeof setInterval> | undefined;

const subs = new Set<(s: TTState) => void>();
const online = (): boolean => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export const ttState = (): TTState => ({ doc, pending: docPendingCount(doc), syncing, error, warning, online: online(), loadedRemote });
const emit = () => { const s = ttState(); subs.forEach((f) => f(s)); };

export function subscribeTT(fn: (s: TTState) => void): () => void {
  subs.add(fn);
  fn(ttState());
  return () => { subs.delete(fn); };
}

/** Commit locally and RETURN — the capture path. Throws only if localStorage
 *  itself fails (quota), which the caller shows. Sync is kicked, not awaited. */
export function commitTT(mutate: (d: TTDoc) => TTDoc): void {
  doc = mutate(doc);
  saveLocalDoc(doc);
  emit();
  void flushTT();
}

/* Row-level conveniences over commitTT — every writer stamps updatedAt itself
 * (via touchRow / a factory), so committing is pure replacement by id. */
const replace = <T extends { id: string }>(rows: T[], row: T): T[] => {
  const i = rows.findIndex((r) => r.id === row.id);
  return i < 0 ? [...rows, row] : rows.map((r, j) => (j === i ? row : r));
};
export const putSession = (s: TalkSession): void => commitTT((d) => ({ ...d, sessions: replace(d.sessions, s) }));
export const putSegment = (s: TalkSegment): void => commitTT((d) => ({ ...d, segments: replace(d.segments, s) }));
export const putTag = (t: TalkTag): void => commitTT((d) => ({ ...d, tags: replace(d.tags, t) }));
export const putBoardItem = (b: BoardItem): void => commitTT((d) => ({ ...d, boardItems: replace(d.boardItems, b) }));
export const putBoardItems = (items: BoardItem[]): void =>
  commitTT((d) => ({ ...d, boardItems: items.reduce((acc, b) => replace(acc, b), d.boardItems) }));

/** CLEAR OLD RESULTS (2026-09-04) — dismiss live result cards (script · CEQ
 *  edits · ideas · vibe plan) so the next pass starts on a clean board. A soft
 *  hide, never a delete: touchRow re-queues each row, so the dismissal syncs
 *  like any other edit and holds on every machine.
 *  Returns how many cards were cleared — the caller SHOWS that number. */
const dismissAll = (targets: BoardItem[], now: Date): number => {
  if (!targets.length) return 0;
  putBoardItems(targets.map((b) => touchRow(b, { dismissed: true } as Partial<BoardItem>, now)));
  return targets.length;
};
export const dismissSessionResults = (sessionId: string, now = new Date()): number =>
  dismissAll(dismissableResults(doc, sessionId), now);
/** Every sitting on the set — what the booth's button clears (see
 *  dismissableResultsForSet for why session scope alone is not enough). */
export const dismissSetResults = (setId: string, now = new Date()): number =>
  dismissAll(dismissableResultsForSet(doc, setId), now);

/** Push everything unacknowledged, all four stores in one call. Re-entrant
 *  calls drop; a failure leaves the queue intact. */
export async function flushTT(): Promise<void> {
  if (syncing) return;
  const q = {
    sessions: pendingRows(doc.sessions),
    segments: pendingRows(doc.segments),
    tags: pendingRows(doc.tags),
    boardItems: pendingRows(doc.boardItems),
  };
  const total = q.sessions.length + q.segments.length + q.tags.length + q.boardItems.length;
  if (!total) { if (error) { error = null; emit(); } return; }
  if (!online()) { error = "offline — queued"; emit(); return; }

  syncing = true; emit();
  try {
    const acked = await upsertTalkthrough({
      data: {
        sessions: q.sessions.map(toSessionRow),
        segments: q.segments.map(toSegmentRow),
        tags: q.tags.map(toTagRow),
        boardItems: q.boardItems.map(toBoardItemRow),
      },
    });
    // Stamp syncedAt from what was ACKNOWLEDGED, never from what we hoped we
    // sent — a row edited mid-flight has moved on and correctly stays queued.
    const ack = (ids: { id: string; updated_at: string }[]) => new Map(ids.map((r) => [r.id, r.updated_at]));
    const aS = ack(acked.sessions), aG = ack(acked.segments), aT = ack(acked.tags), aB = ack(acked.boardItems);
    doc = {
      sessions: doc.sessions.map((r) => (aS.has(r.id) ? { ...r, syncedAt: aS.get(r.id)! } : r)),
      segments: doc.segments.map((r) => (aG.has(r.id) ? { ...r, syncedAt: aG.get(r.id)! } : r)),
      tags: doc.tags.map((r) => (aT.has(r.id) ? { ...r, syncedAt: aT.get(r.id)! } : r)),
      boardItems: doc.boardItems.map((r) => (aB.has(r.id) ? { ...r, syncedAt: aB.get(r.id)! } : r)),
    };
    saveLocalDoc(doc);
    error = null;
    warning = acked.warnings?.[0] ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    syncing = false;
    emit();
  }
}

/** Pull the server's copy and merge. Local pending rows always survive. */
export async function pullTT(): Promise<void> {
  try {
    const rows = await listTalkthrough();
    doc = {
      sessions: mergeRows(doc.sessions, rows.sessions.map(fromSessionRow)),
      segments: mergeRows(doc.segments, rows.segments.map(fromSegmentRow)),
      tags: mergeRows(doc.tags, rows.tags.map(fromTagRow)),
      boardItems: mergeRows(doc.boardItems, rows.boardItems.map(fromBoardItemRow)),
    };
    saveLocalDoc(doc);
    loadedRemote = true;
    error = null;
    warning = rows.warnings?.[0] ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  emit();
  void flushTT();
}

/** Boot: local first (instant), then reconcile with the server. Idempotent. */
export function startTT(): void {
  if (started) { void pullTT(); return; }
  started = true;
  doc = loadLocalDoc();
  emit();
  void pullTT();
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => { error = null; void flushTT(); });
    window.addEventListener("focus", () => void flushTT());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) void flushTT(); });
    if (timer) clearInterval(timer);
    timer = setInterval(() => void flushTT(), 30_000);
  }
}

/** Test seam. */
export const __resetTT = (seed: TTDoc = emptyDoc()): void => {
  doc = seed; syncing = false; error = null; warning = null; loadedRemote = false; started = false;
  if (timer) clearInterval(timer);
  timer = undefined;
};
