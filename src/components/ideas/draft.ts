// THE DRAFT THAT SURVIVES (Lee, 2026-09-03): "I lost everything when I clicked
// away and had to start over."
//
// Every keystroke in the Ideas Bank modal is mirrored to localStorage under
// `ideaBankDraft_<who>`. Closing the modal, navigating, reloading, or a browser
// crash all leave the words where they were. The draft is cleared on ONE of two
// events only: a successful save, or Lee pressing Discard.
//
// WHAT IS NOT STORED: the audio blob and the screenshot bytes. Both are already
// uploaded to storage by the time they reach the form, so the draft carries the
// PATH — a quota-safe pointer that still survives a reload. Storing megabytes of
// base64 here is how localStorage starts throwing QuotaExceededError mid-typing.
//
// Pure — no React, no network. The modal renders what these return.
import type { Attachment } from "./model";

/** THE FOUR BUTTONS on the first step. Mirrors IdeasDock's Intent. */
export type DraftIntent = "general" | "page" | "todo" | "other";
export type DraftStep = "kind" | "capture";

export interface IdeaDraft {
  /** Bumped when the shape changes; an older draft is dropped rather than
   *  half-read, and the UI says so instead of silently losing the words. */
  v: 1;
  /** Was the modal open when they walked away? Restored, so "click away and
   *  come back" is literally free. */
  open: boolean;
  collapsed: boolean;
  step: DraftStep;
  intent: DraftIntent | null;
  todo: "" | "work" | "personal";
  other: string;
  text: string;
  /** Set only when the author overrode AI's filing. null = AI's call. */
  category: string | null;
  otherCategory: string;
  phased: boolean;
  files: Attachment[];
  audio: { path: string; status: string } | null;
  /** Set when the capture started life as a resumed draft ROW in the vault. */
  editingId: string | null;
  updatedAt: string;
}

export const DRAFT_VERSION = 1 as const;

/** One draft at a time, per person, per browser. */
export const draftKey = (who: string | null | undefined): string =>
  `ideaBankDraft_${(who ?? "").trim().toLowerCase() || "anon"}`;

export function emptyDraft(now = new Date()): IdeaDraft {
  return {
    v: DRAFT_VERSION, open: false, collapsed: false, step: "kind",
    intent: null, todo: "", other: "", text: "",
    category: null, otherCategory: "", phased: false,
    files: [], audio: null, editingId: null,
    updatedAt: now.toISOString(),
  };
}

/** Is there anything in here worth restoring? An empty draft never reopens the
 *  modal and never blocks a discard. */
export function hasContent(d: IdeaDraft | null | undefined): boolean {
  if (!d) return false;
  return !!(d.text.trim() || d.files.length || d.audio || d.other.trim() || d.otherCategory.trim());
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const bool = (v: unknown): boolean => v === true;

/** Coerce whatever is in storage into a draft. Anything unrecognised falls back
 *  to the empty value for THAT FIELD ONLY — losing a checkbox is survivable,
 *  losing the words is the bug this file exists to prevent. */
export function coerceDraft(raw: unknown, now = new Date()): IdeaDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== DRAFT_VERSION) return null;
  const intent = str(o.intent);
  const todo = str(o.todo);
  const step = str(o.step);
  const files = Array.isArray(o.files)
    ? (o.files.filter((f): f is Attachment =>
        !!f && typeof f === "object" && typeof (f as Attachment).path === "string" && typeof (f as Attachment).url === "string"))
    : [];
  const audioRaw = o.audio as { path?: unknown; status?: unknown } | null | undefined;
  return {
    v: DRAFT_VERSION,
    open: bool(o.open),
    collapsed: bool(o.collapsed),
    step: step === "capture" ? "capture" : "kind",
    intent: (["general", "page", "todo", "other"] as const).includes(intent as DraftIntent) ? (intent as DraftIntent) : null,
    todo: todo === "work" || todo === "personal" ? todo : "",
    other: str(o.other),
    text: str(o.text),
    category: typeof o.category === "string" && o.category ? o.category : null,
    otherCategory: str(o.otherCategory),
    phased: bool(o.phased),
    files,
    audio: audioRaw && typeof audioRaw.path === "string" ? { path: audioRaw.path, status: str(audioRaw.status) } : null,
    editingId: typeof o.editingId === "string" && o.editingId ? o.editingId : null,
    updatedAt: str(o.updatedAt, now.toISOString()),
  };
}

/** REOPENING IS A JUDGEMENT CALL. A draft from three days ago popping open over
 *  a lesson is a nuisance; the one from four minutes ago is the whole point. Six
 *  hours is "the same sitting". */
export const REOPEN_WINDOW_MS = 6 * 60 * 60 * 1000;

export function shouldReopen(d: IdeaDraft | null, now = new Date(), windowMs = REOPEN_WINDOW_MS): boolean {
  if (!d || !d.open || !hasContent(d)) return false;
  const t = Date.parse(d.updatedAt);
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t <= windowMs;
}

// ------------------------------------------------------------------ storage

export interface DraftRead { draft: IdeaDraft | null; error: string | null }

/** Read the draft. A parse failure is REPORTED, not swallowed — if the words
 *  are unreadable Lee needs to know before he retypes them. */
export function readDraft(who: string | null | undefined, storage?: Storage): DraftRead {
  const s = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  if (!s) return { draft: null, error: null };
  let raw: string | null;
  try { raw = s.getItem(draftKey(who)); }
  catch (e) { return { draft: null, error: `Could not read your saved draft — ${e instanceof Error ? e.message : String(e)}` }; }
  if (!raw) return { draft: null, error: null };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch (e) { return { draft: null, error: `Your saved draft is unreadable — ${e instanceof Error ? e.message : String(e)}` }; }
  const d = coerceDraft(parsed);
  return d ? { draft: d, error: null } : { draft: null, error: null };
}

/** Write the draft. THROWS on failure so the modal can say "NOT SAVED" instead
 *  of pretending. */
export function writeDraft(who: string | null | undefined, d: IdeaDraft, storage?: Storage, now = new Date()): IdeaDraft {
  const next: IdeaDraft = { ...d, v: DRAFT_VERSION, updatedAt: now.toISOString() };
  const s = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  if (!s) return next;
  s.setItem(draftKey(who), JSON.stringify(next));
  return next;
}

/** The ONLY two callers: a successful save, and Discard. */
export function clearDraft(who: string | null | undefined, storage?: Storage): void {
  const s = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  if (!s) return;
  try { s.removeItem(draftKey(who)); } catch { /* already gone */ }
}

// --------------------------------------------------------- window geometry

export interface WindowBox { x: number; y: number; w: number; h: number }

/** Floating-window limits (Lee, 2026-09-03). Small enough to tuck beside what
 *  he is looking at; never larger than the viewport it floats over. */
export const MIN_W = 400, MIN_H = 300;

export function clampBox(box: WindowBox, vw: number, vh: number): WindowBox {
  const maxW = Math.max(MIN_W, Math.round(vw * 0.9));
  const maxH = Math.max(MIN_H, Math.round(vh * 0.9));
  const w = Math.min(maxW, Math.max(MIN_W, Math.round(box.w)));
  const h = Math.min(maxH, Math.max(MIN_H, Math.round(box.h)));
  // Keep at least a strip of the titlebar reachable — a window dragged fully
  // off-screen is a window Lee has to clear localStorage to get back.
  const x = Math.min(Math.max(box.x, -(w - 120)), vw - 120);
  const y = Math.min(Math.max(box.y, 0), Math.max(0, vh - 40));
  return { x: Math.round(x), y: Math.round(y), w, h };
}
