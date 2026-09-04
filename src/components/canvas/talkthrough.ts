// THE TALKTHROUGH BOOTH — model + storage. Capture that cannot lose a word.
//
// PRIME DIRECTIVE (learned the hard way, and the reason this module exists):
// RAW TRANSCRIPTS ARE FIRST-CLASS ARTIFACTS. Verbatim, forever, tied to the
// context they were spoken in. Summaries and boards are DERIVED views that
// never replace them — nothing in this module (or downstream of it) may
// rewrite a segment's text except the Whisper upgrade of that same segment.
//
// PERSISTENCE CONTRACT — the Idea Bank contract, wholesale (idea-bank.ts is
// the reference implementation and its 08-16 post-mortem is the case law):
//   · SUPABASE is the source of truth — one store, every origin, every machine.
//   · Writes are LOCAL-FIRST: the row lands in localStorage and the UI confirms
//     synchronously. Capture never awaits the network; Lee is mid-sentence.
//   · Sync is a QUEUE derived from the data itself (`syncedAt < updatedAt`).
//   · Nothing is ever hard-deleted: `archivedAt` only.
//   · Merges are per-ROW by id, newest `updatedAt` wins, and a locally-pending
//     row always survives an incoming copy.
//
// AUDIO is a carrier, not the artifact: a chunk uploads to storage first
// (durable), Whisper transcribes from that stored path (retryable forever),
// and the resulting text lands in the segment. If SpeechRecognition produced
// live text, it is persisted IMMEDIATELY as source:"live" so words exist even
// if the audio path dies — the segment stays `whisperPending` until the
// canonical text arrives and upgrades it to source:"whisper".
//
// This module is pure + storage; the network lives in talkthrough-sync.ts and
// the recorder in talkthrough-audio.ts.

// ------------------------------------------------------------------- shared

/** Common row shape — one merge/queue implementation for all four stores. */
export interface TTRow {
  id: string;
  createdAt: string;   // ISO
  updatedAt: string;   // ISO — drives both merge and sync
  archivedAt?: string | null;
  /** `updatedAt` at the moment the server last acknowledged this row. Behind
   *  (or absent) ⇒ still owed to the server. */
  syncedAt?: string | null;
}

/** THE SYNC-BACKLOG BUG (B1.5, diagnosed 08-29): PostgREST echoes timestamptz
 *  as "…+00:00" while the client writes "…Z". STRING comparison said every
 *  acknowledged row was still behind — pending forever ("27 unsynced · will
 *  retry"). Compare INSTANTS, never strings. */
const ts = (s: string | null | undefined): number => (s ? new Date(s).getTime() : 0);
export const isPending = (r: TTRow): boolean => !r.syncedAt || ts(r.syncedAt) < ts(r.updatedAt);
export const pendingRows = <T extends TTRow>(rows: T[]): T[] => rows.filter(isPending);

export const newTTId = (prefix: string, now = new Date()): string =>
  `${prefix}-${now.getTime()}-${Math.floor(Math.random() * 1e6)}`;

/** Apply a change. ALWAYS stamps updatedAt — that is what re-queues the row. */
export function touchRow<T extends TTRow>(r: T, patch: Partial<T>, now = new Date()): T {
  return { ...r, ...patch, updatedAt: now.toISOString() };
}

/** MERGE by id, newest updatedAt wins; a locally-pending row always survives
 *  (the server has not seen its edit yet). Same law as idea-bank.mergeNotes. */
export function mergeRows<T extends TTRow>(local: T[], incoming: T[]): T[] {
  const by = new Map<string, T>();
  for (const r of local) by.set(r.id, r);
  for (const inc of incoming) {
    const l = by.get(inc.id);
    if (!l) { by.set(inc.id, inc); continue; }
    if (isPending(l)) { continue; }                       // local edit not yet pushed
    by.set(inc.id, ts(inc.updatedAt) >= ts(l.updatedAt) ? inc : l);
  }
  return [...by.values()];
}

// -------------------------------------------------------------------- model

/** IDEMPOTENT RESUME (2026-09-04) — what a generation pass CANNOT re-derive.
 *
 *  Everything a pass produced is already durable and synced: the board items
 *  themselves. Progress is therefore DERIVED from the board (talkthrough-
 *  resume.ts), never counted into a field that can drift — the same law the
 *  sync queue follows. What the board cannot tell you is what Lee ASKED for:
 *  the pre-flight exclusions and whether he wanted a vibe plan. Those ride
 *  here so an interrupted synthesis resumes with the same choices, from any
 *  machine, and so the Booth can tell "never started" from "started, died". */
export interface SessionGeneration {
  /** When the synthesis pass was last requested (End Session → pre-flight). */
  requestedAt: string;
  /** The pre-flight choices, replayed verbatim on a resume. */
  excludedKinds: string[];
  wantVibePlan: boolean;
  /** Set the moment the pass wrote its board items. */
  completedAt?: string | null;
  /** Last failure, verbatim. Shown, never swallowed. */
  error?: string | null;
}

export interface TalkSession extends TTRow {
  setId: string;
  /** Denormalized at capture — a session stays readable if the set changes. */
  setName: string;
  startedAt: string;
  endedAt?: string | null;
  /** The synthesis pass's request record — see SessionGeneration. Additive:
   *  every session written before 2026-09-04 simply has none. */
  generation?: SessionGeneration | null;
}

export type SegmentSource = "live" | "whisper";

export interface TalkSegment extends TTRow {
  sessionId: string;
  /** Capture order within the session — display order, always. */
  seq: number;
  /** The words. Live text until Whisper lands, then the canonical text. */
  text: string;
  source: SegmentSource;
  /** True until the Whisper text for this segment's audio has been stored. */
  whisperPending: boolean;
  /** Storage path of the chunk WAV — transcription retries from here forever. */
  audioPath?: string | null;
  /** THE COVERAGE ANCHOR: what was focused while Lee spoke is what the words
   *  are about. Null = general set talk. */
  focusedCeqId?: string | null;
  focusedCeqLabel?: string | null;
  startedAt: string;
  endedAt?: string | null;
}

export const MOMENT_TAGS = ["SHORT", "NERDOUT", "EXHIBIT", "PHRASE", "TALK", "KEY"] as const;
export type MomentTag = (typeof MOMENT_TAGS)[number];
/** D3 — the last-pass QUICK ACTIONS. Same store as moment tags (a stamp on the
 *  timeline anchored to {ceq, time}), but each carries Lee's typed note and,
 *  for EXHIBIT_SPEC, an optional interaction-vocabulary pick. */
export const QUICK_KINDS = ["REWORD", "NEWCEQ", "CUT", "EXHIBIT_SPEC", "TEACH"] as const;
export type QuickKind = (typeof QUICK_KINDS)[number];
export type TagKind = MomentTag | QuickKind | StampKind2;
/** Forward declaration alias — the stamp union is declared below with its
 *  taxonomy; the tag row type needs it here. Kept in lockstep by tests. */
type StampKind2 =
  | "reword" | "revise_choices" | "edit_other"
  | "blast_off" | "review_vibe"
  | "short" | "nerdout" | "exhibit" | "phrase" | "trigger_word" | "tip_trick" | "cheat_code" | "real_world" | "memo"
  | "memorize_this" | "deeper_idea" | "visual";
export const TAG_LABELS: Record<MomentTag | QuickKind, string> = {
  SHORT: "Short", NERDOUT: "Nerd Out", EXHIBIT: "Exhibit idea",
  PHRASE: "Phrase", TALK: "Talk moment", KEY: "Key",
  REWORD: "Reword", NEWCEQ: "New CEQ", CUT: "Cut", EXHIBIT_SPEC: "Exhibit spec", TEACH: "How I'd teach it",
};
export const INTERACTION_VOCAB = ["COMPARE", "CLASSIFIER", "MAP/FLOW", "SCENARIO", "CHEAT SHEET", "CONCEPT+EXAMPLE", "BRANCH MAP"] as const;

/** B2 — THE STAMP BOARD, three labeled groups. Every stamp is a click-IN /
 *  click-OUT CONTEXT (B1): open on press, closed on re-press or when another
 *  stamp opens. Old sessions keep their v1 tags; canonicalStamp() folds them
 *  into this vocabulary at read so they still render and synthesize. */
export const STAMP_KINDS = [
  "reword", "revise_choices", "edit_other",
  "blast_off", "review_vibe",
  "short", "nerdout", "exhibit", "phrase", "trigger_word", "tip_trick", "cheat_code", "real_world", "memo",
  // THE THREE STANDARD KINDS + VISUAL (Lee, 2026-09-03): "narrow it to these
  // three … cheat code, memorize this, deeper idea … visual". They match the
  // canvas's own callout kinds one to one. tip_trick / real_world / memo stay
  // readable for old sessions but are off the board.
  "memorize_this", "deeper_idea", "visual",
] as const;
export type StampKind = (typeof STAMP_KINDS)[number];

/** Lee's 08-30 reorg: bankable memo content in the middle (these ARE the
 *  banked items — template styles, no generated memos), video work LAST, and
 *  Exhibit set apart from the video options (empty label = separated tail). */
export const STAMP_GROUPS: readonly { id: string; label: string; kinds: readonly StampKind[] }[] = [
  { id: "edit", label: "EDIT THE CEQ", kinds: ["reword", "revise_choices", "edit_other"] },
  // Lee's 09-03 simplification: three standard card kinds, a visual, a phrase.
  { id: "bank", label: "BANK A NEW:", kinds: ["cheat_code", "memorize_this", "deeper_idea", "visual", "phrase"] },
  { id: "later", label: "TO MAKE LATER", kinds: ["blast_off", "short", "nerdout", "review_vibe"] },
  { id: "exhibit", label: "", kinds: ["exhibit"] },
] as const;

export const STAMP_LABELS: Record<StampKind, string> = {
  reword: "Reword", revise_choices: "Revise Choices", edit_other: "Anything Else",
  blast_off: "Blast Off", review_vibe: "Review Vibes",
  short: "Other Short", nerdout: "Nerd Out", exhibit: "Exhibit", phrase: "Phrase",
  trigger_word: "Trigger Word", tip_trick: "Tip/Trick", cheat_code: "Cheat Code",
  real_world: "Real World Example", memo: "Other Memo",
  memorize_this: "Memorize This", deeper_idea: "Deeper Idea", visual: "Visual",
};

/** VISUAL follow-up (Lee, 2026-09-03): when he stamps a visual, one more tap
 *  says what kind — stored on the stamp's note, read by the review pass. */
export const VISUAL_KINDS = ["progressive reveal", "interactive", "compare / contrast", "static"] as const;

/** EDIT stamps are instruction contexts — closing one fires a background
 *  micro-model draft (B0) stored on the CEQ as a PENDING EDIT. */
export const EDIT_STAMPS: readonly StampKind[] = ["reword", "revise_choices", "edit_other"];

/** v1 → v2 fold, applied AT READ ONLY (stored tags are never rewritten). */
export const LEGACY_STAMP_MAP: Record<string, StampKind> = {
  SHORT: "short", NERDOUT: "nerdout", EXHIBIT: "exhibit", PHRASE: "phrase",
  TALK: "review_vibe", KEY: "tip_trick",
  REWORD: "reword", NEWCEQ: "edit_other", CUT: "edit_other", EXHIBIT_SPEC: "exhibit", TEACH: "blast_off",
};
export const canonicalStamp = (tag: string): StampKind | null =>
  (STAMP_KINDS as readonly string[]).includes(tag) ? (tag as StampKind) : LEGACY_STAMP_MAP[tag] ?? null;
export const stampLabel = (tag: string): string => {
  const c = canonicalStamp(tag);
  return c ? STAMP_LABELS[c] : (TAG_LABELS as Record<string, string>)[tag] ?? tag;
};

// ---- B1: contexts as a DERIVED view over time windows ---------------------
// A context = a tap-sourced tag with an open/closed window [at, endedAt).
// Segments group under a context purely by timestamp overlap: transcript rows
// are never rewritten (Transcript Law), and old sessions render unchanged.

export const isContextTag = (t: TalkTag): boolean => t.source === "tap" && !t.starred && canonicalStamp(t.tag) !== null;

/** The currently OPEN context of a session, if any. */
export const openContext = (tags: TalkTag[], sessionId: string): TalkTag | null =>
  tags.filter((t) => t.sessionId === sessionId && !t.archivedAt && isContextTag(t) && t.endedAt == null)
    .sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;

/** EVERY open context, newest first — MULTI-STAMP (Lee, 2026-09-03): two or
 *  more stamps can be open at once ("reword and revise choices at the same
 *  time"); the words said while both are open belong to both. */
export const openContexts = (tags: TalkTag[], sessionId: string): TalkTag[] =>
  tags.filter((t) => t.sessionId === sessionId && !t.archivedAt && isContextTag(t) && t.endedAt == null)
    .sort((a, b) => b.at.localeCompare(a.at));

/** Every context whose window contains the segment's start, newest first. */
export function contextsOfSegment(seg: TalkSegment, tags: TalkTag[]): TalkTag[] {
  const s = new Date(seg.startedAt).getTime();
  return tags.filter((t) => {
    if (!isContextTag(t) || t.archivedAt) return false;
    const a = new Date(t.at).getTime();
    const b = t.endedAt ? new Date(t.endedAt).getTime() : Number.POSITIVE_INFINITY;
    return s >= a && s < b;
  }).sort((a, b) => b.at.localeCompare(a.at));
}

/** The context a segment belongs to: the latest-opened window containing its
 *  start. Untagged talk (no window) stays general set talk. */
export function contextOfSegment(seg: TalkSegment, tags: TalkTag[]): TalkTag | null {
  const s = new Date(seg.startedAt).getTime();
  let best: TalkTag | null = null;
  for (const t of tags) {
    if (!isContextTag(t) || t.archivedAt) continue;
    const a = new Date(t.at).getTime();
    const b = t.endedAt ? new Date(t.endedAt).getTime() : Number.POSITIVE_INFINITY;
    if (s >= a && s < b && (!best || a > new Date(best.at).getTime())) best = t;
  }
  return best;
}

/** All non-empty segments inside a context's window, in order. */
export const segmentsInContext = (segs: TalkSegment[], t: TalkTag): TalkSegment[] =>
  segs.filter((s) => contextOfSegment(s, [t])?.id === t.id && s.text.trim());

export interface TalkTag extends TTRow {
  sessionId: string;
  tag: TagKind;
  /** The moment stamped (tap time, or the spoken cue's segment start). */
  at: string;
  /** B1 — a stamp is a click-IN/click-OUT CONTEXT: open while endedAt is null.
   *  Segments group under a context by TIME WINDOW [at, endedAt] — a derived
   *  view; segment rows are never rewritten (Transcript Law). */
  endedAt?: string | null;
  /** B1 — "come back to this": a bookmark on {stamp, ceq}; no context opened. */
  starred?: boolean;
  focusedCeqId?: string | null;
  focusedCeqLabel?: string | null;
  /** 'tap' = Lee's ground truth; 'ai' = Phase-2 proposal from a spoken cue. */
  source: "tap" | "ai";
  /** AI proposals carry the verbatim quote that earned them. */
  note?: string | null;
}

export const BOARD_KINDS = ["ceq_order", "outline", "exhibit", "bank", "vibe", "short", "phrase", "accuracy", "ceq_edit", "script", "idea", "vibe_plan", "style_note", "take"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];
export const BOARD_KIND_LABELS: Record<BoardKind, string> = {
  ceq_order: "CEQ order", outline: "Blast Off outline", exhibit: "Exhibit", bank: "Bank changes",
  vibe: "Vibe beats", short: "Shorts / Nerd Outs", phrase: "Phrases", accuracy: "Accuracy flags",
  ceq_edit: "CEQ edits", script: "The Script", idea: "Content ideas", vibe_plan: "Vibe plan",
  style_note: "Style note", take: "Take",
};

/** v2 flow: PENDING (drafting) → SUGGESTED → APPROVE or ARCHIVE (no reject;
 *  archive is recoverable). Bank lifecycle: APPROVED → IN PRODUCTION → DONE,
 *  plus FINAL. v1 statuses stay so old boards render. */
export const BOARD_STATUSES = ["pending", "suggested", "approved", "archived", "in_production", "done", "final", "accepted", "edited", "rejected", "built", "filmed"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export interface BoardItem extends TTRow {
  sessionId: string;
  /** Which AI pass minted this payload (item regenerates mint a fresh runId). */
  runId: string;
  kind: BoardKind;
  title: string;
  /** Kind-shaped content — see talkthrough-pass.ts for the shapes. */
  payload: Record<string, unknown>;
  /** The verbatim transcript moment that motivated it. Traceability is law. */
  quote: string;
  /** CEQ node ids this item touches — drives the per-CEQ board view. */
  ceqIds: string[];
  status: BoardStatus;
  /** Lee's note — feeds "Regenerate with my notes". */
  comment: string;
}

// ----------------------------------------------------------------- factories

export function makeSession(setId: string, setName: string, now = new Date()): TalkSession {
  const iso = now.toISOString();
  return { id: newTTId("tts", now), setId, setName, startedAt: iso, endedAt: null, createdAt: iso, updatedAt: iso, syncedAt: null };
}

export function makeSegment(
  sessionId: string, seq: number,
  focus: { ceqId: string | null; label: string | null },
  now = new Date(),
): TalkSegment {
  const iso = now.toISOString();
  return {
    id: newTTId("ttg", now), sessionId, seq, text: "", source: "live", whisperPending: true,
    audioPath: null, focusedCeqId: focus.ceqId, focusedCeqLabel: focus.label,
    startedAt: iso, endedAt: null, createdAt: iso, updatedAt: iso, syncedAt: null,
  };
}

export function makeTag(
  sessionId: string, tag: TagKind,
  focus: { ceqId: string | null; label: string | null },
  now = new Date(),
): TalkTag {
  const iso = now.toISOString();
  return { id: newTTId("ttt", now), sessionId, tag, at: iso, focusedCeqId: focus.ceqId, focusedCeqLabel: focus.label, source: "tap", note: null, createdAt: iso, updatedAt: iso, syncedAt: null };
}

/** The Whisper upgrade — the ONLY sanctioned rewrite of a segment's text, and
 *  only while the segment is still pending its canonical copy. Live text is
 *  replaced by the stored truth; a segment already upgraded is left alone. */
export function applyWhisperText(seg: TalkSegment, text: string, now = new Date()): TalkSegment {
  if (!seg.whisperPending && seg.source === "whisper") return seg;
  return touchRow(seg, { text, source: "whisper", whisperPending: false } as Partial<TalkSegment>, now);
}

// ------------------------------------------------------------------ storage

export interface TTDoc {
  sessions: TalkSession[];
  segments: TalkSegment[];
  tags: TalkTag[];
  boardItems: BoardItem[];
}

export const TT_KEY = "sa-talkthrough-v1";
export const emptyDoc = (): TTDoc => ({ sessions: [], segments: [], tags: [], boardItems: [] });

export function loadLocalDoc(): TTDoc {
  try {
    const v = JSON.parse(localStorage.getItem(TT_KEY) ?? "null") as Partial<TTDoc> | null;
    if (!v || typeof v !== "object") return emptyDoc();
    return {
      sessions: Array.isArray(v.sessions) ? v.sessions : [],
      segments: Array.isArray(v.segments) ? v.segments : [],
      tags: Array.isArray(v.tags) ? v.tags : [],
      boardItems: Array.isArray(v.boardItems) ? v.boardItems : [],
    };
  } catch { return emptyDoc(); }
}

/** THROWS on failure (quota) — surfaced, never swallowed. The silently-eaten
 *  write is the exact bug class the Idea Bank rewrite exists to kill. */
export function saveLocalDoc(doc: TTDoc): void {
  localStorage.setItem(TT_KEY, JSON.stringify(doc));
}

export const docPendingCount = (d: TTDoc): number =>
  pendingRows(d.sessions).length + pendingRows(d.segments).length + pendingRows(d.tags).length + pendingRows(d.boardItems).length;

// -------------------------------------------------------------------- views

/** A session's transcript in capture order — THE verbatim view (the default). */
export function sessionSegments(d: TTDoc, sessionId: string): TalkSegment[] {
  return d.segments
    .filter((s) => s.sessionId === sessionId && !s.archivedAt)
    .sort((a, b) => a.seq - b.seq || a.startedAt.localeCompare(b.startedAt));
}

/** GHOST SEGMENTS — Whisper's stock-outro hallucinations that were already
 *  written before the capture-side gate existed (2026-08-30). The gate stops
 *  new ones; these are the ones already sitting in the transcript.
 *
 *  Transcript Law protects the words LEE SAID. These are machine noise, so
 *  they can go — but never silently: this only FINDS them, the UI shows the
 *  exact list, and removal is the usual soft archive (recoverable, syncs like
 *  any other edit). Only whisper-sourced rows qualify; anything the live mic
 *  heard is Lee's and is never offered. */
export function ghostSegments(d: TTDoc, sessionId: string, isGhost: (whisper: string, live: string) => boolean): TalkSegment[] {
  return sessionSegments(d, sessionId).filter((s) => s.source === "whisper" && isGhost(s.text, ""));
}

export function sessionTags(d: TTDoc, sessionId: string): TalkTag[] {
  return d.tags.filter((t) => t.sessionId === sessionId && !t.archivedAt).sort((a, b) => a.at.localeCompare(b.at));
}

export function sessionBoard(d: TTDoc, sessionId: string): BoardItem[] {
  const order = new Map(BOARD_KINDS.map((k, i) => [k, i]));
  return d.boardItems
    .filter((b) => b.sessionId === sessionId && !b.archivedAt)
    .sort((a, b) => (order.get(a.kind)! - order.get(b.kind)!) || a.createdAt.localeCompare(b.createdAt));
}

export function listSessions(d: TTDoc): TalkSession[] {
  return d.sessions.filter((s) => !s.archivedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Sessions list metadata: duration + segment count, computed not stored. */
export function sessionMeta(d: TTDoc, s: TalkSession): { segments: number; durationMs: number; words: number } {
  const segs = sessionSegments(d, s.id);
  const end = s.endedAt ?? segs[segs.length - 1]?.endedAt ?? segs[segs.length - 1]?.startedAt ?? s.startedAt;
  return {
    segments: segs.length,
    durationMs: Math.max(0, new Date(end).getTime() - new Date(s.startedAt).getTime()),
    words: segs.reduce((n, x) => n + (x.text ? x.text.trim().split(/\s+/).length : 0), 0),
  };
}

/** The last moment anything happened in a session — its newest segment or
 *  stamp, falling back to when it started. Used to tell a session that is
 *  genuinely being captured from one Lee walked away from hours ago. */
export function lastActivityAt(d: TTDoc, s: TalkSession): string {
  const segs = sessionSegments(d, s.id);
  const tags = sessionTags(d, s.id);
  return [
    s.startedAt,
    segs[segs.length - 1]?.endedAt ?? segs[segs.length - 1]?.startedAt,
    tags[tags.length - 1]?.at,
  ].filter((x): x is string => !!x)
    .reduce((a, b) => (new Date(b).getTime() > new Date(a).getTime() ? b : a));
}

/** An open session with no activity for this long is idle, not capturing. Long
 *  enough that a real pause — thinking, reading the next CEQ, a coffee — never
 *  trips it; short enough that a session abandoned overnight stops claiming to
 *  be live. */
export const IDLE_AFTER_MS = 60 * 60_000;

export const isSessionIdle = (d: TTDoc, s: TalkSession, now = Date.now()): boolean =>
  !s.endedAt && now - new Date(lastActivityAt(d, s)).getTime() >= IDLE_AFTER_MS;

/** B7 — style memory's output-kind vocabulary. Every generation call carries
 *  its kind's notes + up to 3 recent APPROVED items of that kind as examples
 *  (context steering, not training). */
export const STYLE_KINDS = ["script", "exhibit", "memo", "short", "general"] as const;
export type StyleKind = (typeof STYLE_KINDS)[number];

/** Which style-note bucket an item's generations draw from. */
export function styleKindFor(item: BoardItem): StyleKind {
  if (item.kind === "script" || item.kind === "vibe_plan") return "script";
  const k = item.kind === "idea" ? String((item.payload as { kind?: string }).kind ?? "") : item.kind;
  if (k === "exhibit" || k === "visual") return "exhibit";
  if (k === "memo" || k === "phrase" || k === "trigger_word" || k === "memorize_this" || k === "cheat_code") return "memo";
  if (k === "short" || k === "nerdout" || k === "deeper_idea") return "short";
  return "general";
}

/** Up to N recent APPROVED items of a style kind, newest first, trimmed —
 *  the few-shot examples every generation call carries (oldest drop first). */
export function recentApprovedExamples(d: TTDoc, kind: StyleKind, n = 3): string[] {
  return d.boardItems
    .filter((b) => !b.archivedAt && ["approved", "final", "in_production", "done"].includes(b.status) && b.kind !== "style_note" && styleKindFor(b) === kind)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, n)
    .map((b) => {
      const body = String((b.payload as { body?: unknown; proposal?: unknown; pitch?: unknown }).body ?? (b.payload as { proposal?: unknown }).proposal ?? (b.payload as { pitch?: unknown }).pitch ?? "");
      return `${b.title}${body ? ` — ${body.slice(0, 360)}` : ""}`;
    });
}

/** B7 — the style notes for an output kind: one line each, prunable in the
 *  studio. Stored as kind "style_note" items under the "global" session. */
export function styleNotesFor(d: TTDoc, kind: string): string[] {
  return d.boardItems
    .filter((b) => b.kind === "style_note" && !b.archivedAt && b.status !== "archived" && (b.payload as { forKind?: string }).forKind === kind)
    .map((b) => String((b.payload as { line?: string }).line ?? b.title).trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Board slice for the per-CEQ view: everything that touches one question. */
export function boardForCeq(items: BoardItem[], ceqId: string): BoardItem[] {
  return items.filter((b) => b.ceqIds.includes(ceqId));
}

// ------------------------------------------------------- wire format (server)

/* Snake-case row shapes, one per table. fromX stamps syncedAt from the server
 * copy (straight from the server ⇒ synced), exactly like idea-bank.fromRow. */

export interface SessionRow { id: string; set_id: string; set_name: string; started_at: string; ended_at: string | null; created_at: string; updated_at: string; archived_at: string | null; generation?: Record<string, unknown> | null }
export const toSessionRow = (s: TalkSession): SessionRow => ({ id: s.id, set_id: s.setId, set_name: s.setName, started_at: s.startedAt, ended_at: s.endedAt ?? null, created_at: s.createdAt, updated_at: s.updatedAt, archived_at: s.archivedAt ?? null, generation: s.generation ? { ...s.generation } : null });
export const fromSessionRow = (r: SessionRow): TalkSession => ({ id: r.id, setId: r.set_id, setName: r.set_name, startedAt: r.started_at, endedAt: r.ended_at, generation: readGeneration(r.generation), createdAt: r.created_at, updatedAt: r.updated_at, archivedAt: r.archived_at, syncedAt: r.updated_at });

/** A jsonb blob from the server is untrusted shape — read it defensively, and
 *  degrade to "no request on record" rather than throwing the whole pull. */
export function readGeneration(v: unknown): SessionGeneration | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const g = v as Record<string, unknown>;
  if (typeof g.requestedAt !== "string" || !g.requestedAt) return null;
  return {
    requestedAt: g.requestedAt,
    excludedKinds: Array.isArray(g.excludedKinds) ? g.excludedKinds.filter((x): x is string => typeof x === "string") : [],
    wantVibePlan: !!g.wantVibePlan,
    completedAt: typeof g.completedAt === "string" ? g.completedAt : null,
    error: typeof g.error === "string" ? g.error : null,
  };
}

export interface SegmentRow { id: string; session_id: string; seq: number; text: string; source: string; whisper_pending: boolean; audio_path: string | null; focused_ceq_id: string | null; focused_ceq_label: string | null; started_at: string; ended_at: string | null; created_at: string; updated_at: string; archived_at: string | null }
export const toSegmentRow = (s: TalkSegment): SegmentRow => ({ id: s.id, session_id: s.sessionId, seq: s.seq, text: s.text, source: s.source, whisper_pending: s.whisperPending, audio_path: s.audioPath ?? null, focused_ceq_id: s.focusedCeqId ?? null, focused_ceq_label: s.focusedCeqLabel ?? null, started_at: s.startedAt, ended_at: s.endedAt ?? null, created_at: s.createdAt, updated_at: s.updatedAt, archived_at: s.archivedAt ?? null });
export const fromSegmentRow = (r: SegmentRow): TalkSegment => ({ id: r.id, sessionId: r.session_id, seq: r.seq, text: r.text, source: (r.source === "whisper" ? "whisper" : "live"), whisperPending: r.whisper_pending, audioPath: r.audio_path, focusedCeqId: r.focused_ceq_id, focusedCeqLabel: r.focused_ceq_label, startedAt: r.started_at, endedAt: r.ended_at, createdAt: r.created_at, updatedAt: r.updated_at, archivedAt: r.archived_at, syncedAt: r.updated_at });

export interface TagRow { id: string; session_id: string; tag: string; at: string; ended_at?: string | null; starred?: boolean; focused_ceq_id: string | null; focused_ceq_label: string | null; source: string; note: string | null; created_at: string; updated_at: string; archived_at: string | null }
export const toTagRow = (t: TalkTag): TagRow => ({ id: t.id, session_id: t.sessionId, tag: t.tag, at: t.at, ended_at: t.endedAt ?? null, starred: !!t.starred, focused_ceq_id: t.focusedCeqId ?? null, focused_ceq_label: t.focusedCeqLabel ?? null, source: t.source, note: t.note ?? null, created_at: t.createdAt, updated_at: t.updatedAt, archived_at: t.archivedAt ?? null });
export const fromTagRow = (r: TagRow): TalkTag => ({ id: r.id, sessionId: r.session_id, tag: ([...MOMENT_TAGS, ...QUICK_KINDS, ...STAMP_KINDS] as readonly string[]).includes(r.tag) ? (r.tag as TagKind) : "KEY", at: r.at, endedAt: r.ended_at ?? null, starred: !!r.starred, focusedCeqId: r.focused_ceq_id, focusedCeqLabel: r.focused_ceq_label, source: r.source === "ai" ? "ai" : "tap", note: r.note, createdAt: r.created_at, updatedAt: r.updated_at, archivedAt: r.archived_at, syncedAt: r.updated_at });

export interface BoardItemRow { id: string; session_id: string; run_id: string; kind: string; title: string; payload: Record<string, unknown>; quote: string; ceq_ids: string[]; status: string; comment: string; created_at: string; updated_at: string; archived_at: string | null }
export const toBoardItemRow = (b: BoardItem): BoardItemRow => ({ id: b.id, session_id: b.sessionId, run_id: b.runId, kind: b.kind, title: b.title, payload: b.payload, quote: b.quote, ceq_ids: b.ceqIds, status: b.status, comment: b.comment, created_at: b.createdAt, updated_at: b.updatedAt, archived_at: b.archivedAt ?? null });
export const fromBoardItemRow = (r: BoardItemRow): BoardItem => ({
  id: r.id, sessionId: r.session_id, runId: r.run_id,
  kind: (BOARD_KINDS as readonly string[]).includes(r.kind) ? (r.kind as BoardKind) : "vibe",
  title: r.title, payload: r.payload ?? {}, quote: r.quote ?? "",
  ceqIds: Array.isArray(r.ceq_ids) ? r.ceq_ids : [],
  status: (BOARD_STATUSES as readonly string[]).includes(r.status) ? (r.status as BoardStatus) : "suggested",
  comment: r.comment ?? "", createdAt: r.created_at, updatedAt: r.updated_at, archivedAt: r.archived_at, syncedAt: r.updated_at,
});
