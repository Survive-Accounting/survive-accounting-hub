// TALKTHROUGH REVIEW QUEUE (B3) — the client-side background job runner for
// End Session → Review. Serverless has no worker, so generation runs from
// whichever studio tab queued it while Lee keeps talking in the next set —
// capture is NEVER blocked. Honest status the sessions list can render:
//
//   CAPTURING (open AND recently active) · IDLE (open but untouched for an
//   hour — still resumable, just not pretending to record) · QUEUED ·
//   GENERATING · READY (script on the board) · ERROR (visible, retryable).
//
// The queue survives a reload as intent only: state is mirrored to
// localStorage so a killed tab shows ERROR with a retry rather than lying
// with a forever-GENERATING. A failed or interrupted pass never touches the
// transcript (Transcript Law).
import { runMicro, runTalkthroughReview } from "@/lib/talkthrough.functions";

import {
  canonicalStamp, isSessionIdle, makeTag, newTTId, recentApprovedExamples, segmentsInContext, sessionBoard, sessionSegments, sessionTags,
  styleKindFor, styleNotesFor,
  type BoardItem, type TTDoc, type TalkSession,
} from "./talkthrough";
import { parseReview, type PassCeq } from "./talkthrough-pass";
import { putBoardItem, putBoardItems, putSession, putTag, ttState } from "./talkthrough-sync";
import { touchRow, type SessionGeneration } from "./talkthrough";

export type ReviewState = "idle" | "queued" | "generating" | "error";
const KEY = "sa-tt-genstate";

const load = (): Record<string, { state: ReviewState; error?: string }> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, { state: ReviewState; error?: string }>; } catch { return {}; }
};
const save = (m: Record<string, { state: ReviewState; error?: string }>): void => {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* cosmetic only */ }
};
const subs = new Set<() => void>();
export const subscribeReview = (fn: () => void): (() => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
const emit = () => subs.forEach((f) => f());

const set = (sessionId: string, state: ReviewState, error?: string) => {
  const m = load();
  if (state === "idle") delete m[sessionId];
  else m[sessionId] = { state, ...(error ? { error } : {}) };
  save(m);
  emit();
};

/** The honest status for a session row. READY = a script item exists. */
export function reviewStateOf(doc: TTDoc, s: TalkSession): { state: "capturing" | ReviewState | "ready" | "stale"; error?: string } {
  if (sessionBoard(doc, s.id).some((b) => b.kind === "script" && !b.archivedAt)) return { state: "ready" };
  const m = load()[s.id];
  if (m) return m.state === "generating" ? { state: "generating" } : m;
  if (s.endedAt) return { state: "idle" };
  // Open, but nothing has happened in an hour — say so instead of claiming to
  // be recording. The session is still resumable; only the label changes.
  return { state: isSessionIdle(doc, s) ? "stale" : "capturing" };
}

/** A tab reload can strand a "generating" flag with no promise behind it —
 *  demote it to a retryable error at boot so the list never lies. */
export function sweepStrandedReviews(): void {
  const m = load();
  let changed = false;
  for (const k of Object.keys(m)) {
    if (m[k].state === "generating" || m[k].state === "queued") { m[k] = { state: "error", error: "interrupted (tab closed?) — retry" }; changed = true; }
  }
  if (changed) { save(m); emit(); }
}

export interface ReviewRequest {
  session: TalkSession;
  ceqs: PassCeq[];
  excludedKinds: string[];
  wantVibePlan: boolean;
}

/** Write the pre-flight request (or its outcome) onto the session. Always
 *  reads the LIVE row first — the session in hand was captured before the
 *  await and may have been edited since. */
function markGeneration(sessionId: string, patch: Partial<SessionGeneration>): void {
  const live = ttState().doc.sessions.find((s) => s.id === sessionId);
  if (!live) return;
  const generation: SessionGeneration = {
    requestedAt: live.generation?.requestedAt ?? new Date().toISOString(),
    excludedKinds: live.generation?.excludedKinds ?? [],
    wantVibePlan: live.generation?.wantVibePlan ?? false,
    completedAt: live.generation?.completedAt ?? null,
    error: live.generation?.error ?? null,
    ...patch,
  };
  putSession(touchRow(live, { generation } as Partial<TalkSession>));
}

/** IDEMPOTENCE (2026-09-04). The synthesis is ONE call that writes a whole
 *  board, so the only honest unit of "already done" is the board itself: a
 *  script item for this session means the pass landed.
 *
 *  This gates RESUME, not queueReview. "Regenerate review" in the session
 *  view deliberately re-runs a session that already has a board — making
 *  queueReview itself no-op would turn that button into a dead one, silently.
 *  A resume is the opposite intent: pick up only what is missing. */
export const reviewAlreadyLanded = (doc: TTDoc, sessionId: string): boolean =>
  sessionBoard(doc, sessionId).some((b) => b.kind === "script" && !b.archivedAt);

/** Queue the End Session synthesis. Fire-and-forget; status via reviewStateOf. */
export function queueReview(req: ReviewRequest): void {
  // The REQUEST is recorded before the call, so a tab that dies mid-pass
  // leaves behind what Lee asked for — the resume replays these exact
  // choices instead of guessing them.
  markGeneration(req.session.id, {
    requestedAt: new Date().toISOString(),
    excludedKinds: req.excludedKinds,
    wantVibePlan: req.wantVibePlan,
    completedAt: null,
    error: null,
  });
  set(req.session.id, "queued");
  void (async () => {
    try {
      set(req.session.id, "generating");
      const doc = ttState().doc;
      const segs = sessionSegments(doc, req.session.id);
      const tags = sessionTags(doc, req.session.id);
      const stamps = tags
        .filter((t) => t.source === "tap" && canonicalStamp(t.tag))
        .map((t) => ({
          kind: canonicalStamp(t.tag)!,
          ceqLabel: t.focusedCeqLabel ?? null,
          starred: !!t.starred,
          // A visual stamp's follow-up ("progressive reveal · like Who's It
          // For?") rides in front of the words so the pass sees it.
          spoken: t.starred ? "" : `${t.note && t.source === "tap" ? `[${t.note}] ` : ""}${segmentsInContext(segs, t).map((x) => x.text.trim()).filter(Boolean).join(" ")}`.slice(0, 8000),
        }));
      const r = await runTalkthroughReview({
        data: {
          setName: req.session.setName,
          ceqs: req.ceqs,
          segments: segs.map((s) => ({ id: s.id, seq: s.seq, text: s.text, focusedCeqId: s.focusedCeqId ?? null, focusedCeqLabel: s.focusedCeqLabel ?? null, source: s.source, whisperPending: s.whisperPending })),
          stamps,
          excludedKinds: req.excludedKinds,
          styleNotes: [...styleNotesFor(doc, "script"), ...recentApprovedExamples(doc, "script").map((e) => `EXAMPLE (approved earlier): ${e}`)].slice(0, 12),
          wantVibePlan: req.wantVibePlan,
        },
      });
      const { extractJsonObject } = await import("./talkthrough-pass");
      const raw = extractJsonObject(r.text);
      if (!raw) throw new Error("the review returned something that isn't board JSON — retry (transcript untouched)");
      const parsed = parseReview(raw, req.session.id, newTTId("run"), req.ceqs.map((c) => c.id));
      if (!parsed.items.length) throw new Error("the review parsed to zero items — retry");
      // Usage rides the script item (or the first item) for the cost line.
      const head = parsed.items.find((i) => i.kind === "script") ?? parsed.items[0];
      head.payload = { ...head.payload, _usage: { ...r.usage, task: "synthesis", model: r.model } };
      putBoardItems(parsed.items);
      for (const p of parsed.proposedTags) {
        const seg = segs.find((s) => s.seq === p.seq);
        const t = makeTag(req.session.id, (canonicalStamp(p.tag) ?? "tip_trick") as never, { ceqId: seg?.focusedCeqId ?? null, label: seg?.focusedCeqLabel ?? null });
        putTag({ ...t, source: "ai", note: p.quote, at: seg?.startedAt ?? t.at, endedAt: t.at });
      }
      markGeneration(req.session.id, { completedAt: new Date().toISOString(), error: null });
      set(req.session.id, "idle"); // READY is derived from the board itself
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A recorded failure stays failed: retrying failed items is out of scope
      // (Lee dismisses and re-runs the whole pass). It is written down so the
      // resume can tell "died mid-flight" from "tried and lost".
      markGeneration(req.session.id, { error: msg });
      set(req.session.id, "error", msg);
    }
  })();
}

/** RESUME an interrupted synthesis: the same pass, replaying the pre-flight
 *  choices recorded on the session. No request on record, or a board that
 *  already landed, means there is nothing to resume — and it says so rather
 *  than pretending to start. */
export function resumeReview(session: TalkSession, ceqs: PassCeq[]): { resumed: boolean; why: string } {
  const g = session.generation;
  if (!g?.requestedAt) return { resumed: false, why: "no pass was ever requested for this session" };
  if (reviewAlreadyLanded(ttState().doc, session.id)) return { resumed: false, why: "the review board is already here" };
  queueReview({ session, ceqs, excludedKinds: g.excludedKinds, wantVibePlan: g.wantVibePlan });
  return { resumed: true, why: "picking up the review board where it stopped" };
}

/** B7 — PIN "remember this": distill a comment into a one-line style note for
 *  the item's output kind (micro lane) and bank it globally. Every future
 *  generation of that kind carries it; prunable in the Style view. */
export async function pinStyleNote(item: BoardItem, comment: string): Promise<void> {
  const kind = styleKindFor(item);
  const r = await runMicro({
    data: {
      system: `Distill the teacher's feedback into ONE imperative style rule for future ${kind} generation. Under 120 characters. Return the rule text only — no quotes, no preamble.`,
      user: comment,
      maxOutput: 120,
    },
  });
  const line = r.text.trim().replace(/^["']|["']$/g, "").slice(0, 160);
  if (!line) throw new Error("distillation came back empty — try rephrasing the note");
  const iso = new Date().toISOString();
  putBoardItem({
    id: newTTId("ttb"), sessionId: "global", runId: "style", kind: "style_note",
    title: line, payload: { forKind: kind, line, sourceComment: comment, _usage: r.usage },
    quote: "", ceqIds: [], status: "approved", comment: "",
    createdAt: iso, updatedAt: iso, syncedAt: null,
  });
}

/** Item-level regenerate on the v2 board (script / ceq_edit / idea / vibe_plan). */
export async function regenerateReviewItem(sessionId: string, itemId: string, ceqs: PassCeq[], comment: string): Promise<void> {
  const doc = ttState().doc;
  const item = doc.boardItems.find((b) => b.id === itemId);
  if (!item) throw new Error("item not found");
  const kind = item.kind as "script" | "ceq_edit" | "idea" | "vibe_plan";
  const segs = sessionSegments(doc, sessionId);
  const r = await runTalkthroughReview({
    data: {
      setName: doc.sessions.find((s) => s.id === sessionId)?.setName ?? "",
      ceqs,
      segments: segs.map((s) => ({ id: s.id, seq: s.seq, text: s.text, focusedCeqId: s.focusedCeqId ?? null, focusedCeqLabel: s.focusedCeqLabel ?? null, source: s.source, whisperPending: s.whisperPending })),
      stamps: [],
      excludedKinds: [],
      styleNotes: [...styleNotesFor(doc, styleKindFor(item)), ...recentApprovedExamples(doc, styleKindFor(item)).map((e) => `EXAMPLE (approved earlier): ${e}`)].slice(0, 12),
      wantVibePlan: kind === "vibe_plan",
      regen: { kind, previous: item.payload, comments: [comment, item.comment].filter(Boolean) },
    },
  });
  const { extractJsonObject } = await import("./talkthrough-pass");
  const raw = extractJsonObject(r.text);
  if (!raw) throw new Error("regenerate returned non-JSON — the item is unchanged; retry");
  const parsed = parseReview(raw, sessionId, newTTId("run"), ceqs.map((c) => c.id));
  const fresh = parsed.items.find((i) => i.kind === kind);
  if (!fresh) throw new Error("regenerate produced nothing for this item — unchanged; retry");
  const cur = ttState().doc.boardItems.find((b) => b.id === itemId) ?? item;
  putBoardItem(touchRow(cur, {
    runId: fresh.runId, title: fresh.title,
    payload: { ...fresh.payload, _usage: { ...r.usage, task: "synthesis", model: r.model } },
    quote: fresh.quote || cur.quote,
    ceqIds: fresh.ceqIds.length ? fresh.ceqIds : cur.ceqIds,
    status: "suggested", comment,
  } as Partial<typeof cur>));
}
