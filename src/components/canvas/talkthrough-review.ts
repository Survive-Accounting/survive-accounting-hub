// TALKTHROUGH REVIEW QUEUE (B3) — the client-side background job runner for
// End Session → Review. Serverless has no worker, so generation runs from
// whichever studio tab queued it while Lee keeps talking in the next set —
// capture is NEVER blocked. Honest status the sessions list can render:
//
//   CAPTURING (session open) · QUEUED · GENERATING · READY (script on the
//   board) · ERROR (visible, retryable — re-queue any time).
//
// The queue survives a reload as intent only: state is mirrored to
// localStorage so a killed tab shows ERROR with a retry rather than lying
// with a forever-GENERATING. A failed or interrupted pass never touches the
// transcript (Transcript Law).
import { runTalkthroughReview } from "@/lib/talkthrough.functions";

import {
  canonicalStamp, makeTag, newTTId, segmentsInContext, sessionBoard, sessionSegments, sessionTags, styleNotesFor,
  type TTDoc, type TalkSession,
} from "./talkthrough";
import { parseReview, type PassCeq } from "./talkthrough-pass";
import { putBoardItem, putBoardItems, putTag, ttState } from "./talkthrough-sync";
import { touchRow } from "./talkthrough";

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
export function reviewStateOf(doc: TTDoc, s: TalkSession): { state: "capturing" | ReviewState | "ready"; error?: string } {
  if (sessionBoard(doc, s.id).some((b) => b.kind === "script" && !b.archivedAt)) return { state: "ready" };
  const m = load()[s.id];
  if (m) return m.state === "generating" ? { state: "generating" } : m;
  return { state: s.endedAt ? "idle" : "capturing" };
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

/** Queue the End Session synthesis. Fire-and-forget; status via reviewStateOf. */
export function queueReview(req: ReviewRequest): void {
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
          spoken: t.starred ? "" : segmentsInContext(segs, t).map((x) => x.text.trim()).filter(Boolean).join(" ").slice(0, 8000),
        }));
      const r = await runTalkthroughReview({
        data: {
          setName: req.session.setName,
          ceqs: req.ceqs,
          segments: segs.map((s) => ({ id: s.id, seq: s.seq, text: s.text, focusedCeqId: s.focusedCeqId ?? null, focusedCeqLabel: s.focusedCeqLabel ?? null, source: s.source, whisperPending: s.whisperPending })),
          stamps,
          excludedKinds: req.excludedKinds,
          styleNotes: styleNotesFor(doc, "script"),
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
      set(req.session.id, "idle"); // READY is derived from the board itself
    } catch (e) {
      set(req.session.id, "error", e instanceof Error ? e.message : String(e));
    }
  })();
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
      styleNotes: styleNotesFor(doc, kind === "script" ? "script" : "memo"),
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
