// PHRASE BANK — the "say it" lines Lee marks on the results board, mirrored
// into the teleprompter window (/v3/teleprompter) for a vertical filming run.
//
// TWO MARKS, ONE LINE:
//   click        → SAY IT   (yellow) — banked, in click order, for the prompter
//   shift-click  → SHOW THIS (blue)  — a visual note; NEVER reaches the prompter
//
// SYNC — localStorage + the `storage` event, plus a 1s poll as a backstop.
// Both windows are the same browser on the same machine (the prompter is a
// second window sitting beside the capture window), so there is no server
// round trip and a dead network changes nothing. Cross-DEVICE mirroring is
// deliberately NOT built here: it would need a table and a realtime channel.
//
// Module-level store, not React state: the results board and the prompter are
// separate mounts (separate WINDOWS) that must never disagree.

const KEY = "sa.phrase-bank.v1";
const POLL_MS = 1000;

export type PhraseMark = "say" | "show";

export interface PhraseMarkRow {
  /** Stable per script line: `${boardItemId}#${beat}.${line}`. */
  id: string;
  sessionId: string;
  text: string;
  mark: PhraseMark;
  /** ISO. Bank order is mark order and it never changes. */
  at: string;
}

export interface PhraseBankDoc {
  v: 1;
  /** The session the prompter mirrors — the last results board opened. */
  activeSessionId: string | null;
  marks: PhraseMarkRow[];
}

export const emptyPhraseBank = (): PhraseBankDoc => ({ v: 1, activeSessionId: null, marks: [] });

// ───────────────────────────────────────────────────────── pure helpers

/** Mark one line. The FIRST mark fixes the line's place in the bank order;
 *  marking it again with the other colour re-classifies it IN PLACE (a
 *  correction — the order never shuffles). Same colour twice is a no-op. */
export function applyMark(doc: PhraseBankDoc, row: Omit<PhraseMarkRow, "at">, at: string): PhraseBankDoc {
  const i = doc.marks.findIndex((m) => m.id === row.id);
  if (i < 0) return { ...doc, marks: [...doc.marks, { ...row, at }] };
  const prev = doc.marks[i];
  if (prev.mark === row.mark && prev.text === row.text) return doc;
  const next = doc.marks.slice();
  next[i] = { ...prev, text: row.text, mark: row.mark };
  return { ...doc, marks: next };
}

/** The banked "say it" phrases for one session, in the order they were marked. */
export function sayPhrases(doc: PhraseBankDoc, sessionId: string | null): PhraseMarkRow[] {
  if (!sessionId) return [];
  return doc.marks.filter((m) => m.sessionId === sessionId && m.mark === "say");
}

export function markOf(doc: PhraseBankDoc, id: string): PhraseMark | null {
  return doc.marks.find((m) => m.id === id)?.mark ?? null;
}

/** Wrap-around step. Enter = +1, Shift+Enter = -1. An empty bank stays at 0. */
export function stepIndex(index: number, length: number, delta: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

/** Keep an index inside a list that changed under it (a re-classified line). */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(0, index), length - 1);
}

/** The id of a script line — stable across re-renders and across windows. */
export const scriptLineId = (itemId: string, beat: number, line: number): string => `${itemId}#${beat}.${line}`;

// ─────────────────────────────────────────────────────────── the store

let doc: PhraseBankDoc = emptyPhraseBank();
let lastRaw: string | null = null;
let bankError: string | null = null;
let booted = false;
let timer: ReturnType<typeof setInterval> | undefined;

const subs = new Set<(d: PhraseBankDoc) => void>();
const emit = () => { subs.forEach((f) => f(doc)); };

export const phraseBankDoc = (): PhraseBankDoc => doc;
/** Last storage failure, verbatim. Null when the bank is healthy. The UI shows
 *  this — a bank that silently stopped saving would ruin a filming run. */
export const phraseBankError = (): string | null => bankError;

function parse(raw: string | null): PhraseBankDoc {
  if (!raw) return emptyPhraseBank();
  const p = JSON.parse(raw) as PhraseBankDoc;
  if (!p || p.v !== 1 || !Array.isArray(p.marks)) throw new Error(`phrase bank in localStorage is not v1 — refusing to guess`);
  return { v: 1, activeSessionId: p.activeSessionId ?? null, marks: p.marks };
}

/** Re-read from storage. Returns true when the document actually changed. */
function refresh(): boolean {
  if (typeof localStorage === "undefined") return false;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (e) {
    bankError = `cannot read the phrase bank: ${e instanceof Error ? e.message : String(e)}`;
    return false;
  }
  if (raw === lastRaw) return false;
  try {
    doc = parse(raw);
    lastRaw = raw;
    bankError = null;
    return true;
  } catch (e) {
    bankError = e instanceof Error ? e.message : String(e);
    return false;
  }
}

function commit(mutate: (d: PhraseBankDoc) => PhraseBankDoc): void {
  const next = mutate(doc);
  if (next === doc) return;
  doc = next;
  const raw = JSON.stringify(doc);
  try {
    localStorage.setItem(KEY, raw);
    lastRaw = raw;
    bankError = null;
  } catch (e) {
    // LOUD: the mark is live in this window but did NOT cross to the prompter.
    bankError = `the phrase did NOT save — the teleprompter will not see it: ${e instanceof Error ? e.message : String(e)}`;
  }
  emit();
}

/** Boot: read what is there, then follow the other window. Idempotent. */
export function startPhraseBank(): void {
  if (typeof window === "undefined") return;
  refresh();
  if (booted) return;
  booted = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== KEY) return;
    if (refresh()) emit();
  });
  if (timer) clearInterval(timer);
  timer = setInterval(() => { if (refresh()) emit(); }, POLL_MS);
}

export function subscribePhraseBank(fn: (d: PhraseBankDoc) => void): () => void {
  subs.add(fn);
  fn(doc);
  return () => { subs.delete(fn); };
}

export function markPhrase(row: Omit<PhraseMarkRow, "at">): void {
  commit((d) => applyMark(d, row, new Date().toISOString()));
}

/** The prompter mirrors whichever results board was opened last. */
export function setActivePhraseSession(sessionId: string): void {
  commit((d) => (d.activeSessionId === sessionId ? d : { ...d, activeSessionId: sessionId }));
}

/** Start the next video clean. Only this session's marks go. */
export function clearSessionPhrases(sessionId: string): void {
  commit((d) => ({ ...d, marks: d.marks.filter((m) => m.sessionId !== sessionId) }));
}

/** Test seam. */
export const __resetPhraseBank = (seed: PhraseBankDoc = emptyPhraseBank()): void => {
  doc = seed; lastRaw = null; bankError = null; booted = false;
  if (timer) clearInterval(timer);
  timer = undefined;
  subs.clear();
};
