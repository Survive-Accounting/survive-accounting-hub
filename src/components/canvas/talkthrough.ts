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

export const isPending = (r: TTRow): boolean => !r.syncedAt || r.syncedAt < r.updatedAt;
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
    by.set(inc.id, inc.updatedAt >= l.updatedAt ? inc : l);
  }
  return [...by.values()];
}

// -------------------------------------------------------------------- model

export interface TalkSession extends TTRow {
  setId: string;
  /** Denormalized at capture — a session stays readable if the set changes. */
  setName: string;
  startedAt: string;
  endedAt?: string | null;
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
export const TAG_LABELS: Record<MomentTag, string> = {
  SHORT: "Short", NERDOUT: "Nerd Out", EXHIBIT: "Exhibit idea",
  PHRASE: "Phrase", TALK: "Talk moment", KEY: "Key",
};

export interface TalkTag extends TTRow {
  sessionId: string;
  tag: MomentTag;
  /** The moment stamped (tap time, or the spoken cue's segment start). */
  at: string;
  focusedCeqId?: string | null;
  focusedCeqLabel?: string | null;
  /** 'tap' = Lee's ground truth; 'ai' = Phase-2 proposal from a spoken cue. */
  source: "tap" | "ai";
  /** AI proposals carry the verbatim quote that earned them. */
  note?: string | null;
}

export const BOARD_KINDS = ["ceq_order", "outline", "exhibit", "vibe", "short", "phrase", "accuracy"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];
export const BOARD_KIND_LABELS: Record<BoardKind, string> = {
  ceq_order: "CEQ order", outline: "Blast Off outline", exhibit: "Exhibit",
  vibe: "Vibe beats", short: "Shorts / Nerd Outs", phrase: "Phrases", accuracy: "Accuracy flags",
};

export const BOARD_STATUSES = ["suggested", "accepted", "edited", "rejected", "built", "filmed"] as const;
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
  sessionId: string, tag: MomentTag,
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

/** Board slice for the per-CEQ view: everything that touches one question. */
export function boardForCeq(items: BoardItem[], ceqId: string): BoardItem[] {
  return items.filter((b) => b.ceqIds.includes(ceqId));
}

// ------------------------------------------------------- wire format (server)

/* Snake-case row shapes, one per table. fromX stamps syncedAt from the server
 * copy (straight from the server ⇒ synced), exactly like idea-bank.fromRow. */

export interface SessionRow { id: string; set_id: string; set_name: string; started_at: string; ended_at: string | null; created_at: string; updated_at: string; archived_at: string | null }
export const toSessionRow = (s: TalkSession): SessionRow => ({ id: s.id, set_id: s.setId, set_name: s.setName, started_at: s.startedAt, ended_at: s.endedAt ?? null, created_at: s.createdAt, updated_at: s.updatedAt, archived_at: s.archivedAt ?? null });
export const fromSessionRow = (r: SessionRow): TalkSession => ({ id: r.id, setId: r.set_id, setName: r.set_name, startedAt: r.started_at, endedAt: r.ended_at, createdAt: r.created_at, updatedAt: r.updated_at, archivedAt: r.archived_at, syncedAt: r.updated_at });

export interface SegmentRow { id: string; session_id: string; seq: number; text: string; source: string; whisper_pending: boolean; audio_path: string | null; focused_ceq_id: string | null; focused_ceq_label: string | null; started_at: string; ended_at: string | null; created_at: string; updated_at: string; archived_at: string | null }
export const toSegmentRow = (s: TalkSegment): SegmentRow => ({ id: s.id, session_id: s.sessionId, seq: s.seq, text: s.text, source: s.source, whisper_pending: s.whisperPending, audio_path: s.audioPath ?? null, focused_ceq_id: s.focusedCeqId ?? null, focused_ceq_label: s.focusedCeqLabel ?? null, started_at: s.startedAt, ended_at: s.endedAt ?? null, created_at: s.createdAt, updated_at: s.updatedAt, archived_at: s.archivedAt ?? null });
export const fromSegmentRow = (r: SegmentRow): TalkSegment => ({ id: r.id, sessionId: r.session_id, seq: r.seq, text: r.text, source: (r.source === "whisper" ? "whisper" : "live"), whisperPending: r.whisper_pending, audioPath: r.audio_path, focusedCeqId: r.focused_ceq_id, focusedCeqLabel: r.focused_ceq_label, startedAt: r.started_at, endedAt: r.ended_at, createdAt: r.created_at, updatedAt: r.updated_at, archivedAt: r.archived_at, syncedAt: r.updated_at });

export interface TagRow { id: string; session_id: string; tag: string; at: string; focused_ceq_id: string | null; focused_ceq_label: string | null; source: string; note: string | null; created_at: string; updated_at: string; archived_at: string | null }
export const toTagRow = (t: TalkTag): TagRow => ({ id: t.id, session_id: t.sessionId, tag: t.tag, at: t.at, focused_ceq_id: t.focusedCeqId ?? null, focused_ceq_label: t.focusedCeqLabel ?? null, source: t.source, note: t.note ?? null, created_at: t.createdAt, updated_at: t.updatedAt, archived_at: t.archivedAt ?? null });
export const fromTagRow = (r: TagRow): TalkTag => ({ id: r.id, sessionId: r.session_id, tag: (MOMENT_TAGS as readonly string[]).includes(r.tag) ? (r.tag as MomentTag) : "KEY", at: r.at, focusedCeqId: r.focused_ceq_id, focusedCeqLabel: r.focused_ceq_label, source: r.source === "ai" ? "ai" : "tap", note: r.note, createdAt: r.created_at, updatedAt: r.updated_at, archivedAt: r.archived_at, syncedAt: r.updated_at });

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
