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
  STAMP_LABELS, canonicalStamp, emptyProgress, isGenerating, isSessionIdle, makeTag, newTTId, recentApprovedExamples,
  segmentsInContext, sessionBoard, sessionSegments, sessionTags, styleKindFor, styleKindForKind, styleNotesFor,
  type BoardItem, type GenerationProgress, type TTDoc, type TalkSession,
} from "./talkthrough";
import {
  buildGenerationQueue, buildIdeaMessages, buildMicroEditMessages, editTaskKey, extractJsonObject,
  parseIdeaDraft, parseMicroEdit, parseReview, queueCounts, scriptTaskKeys,
  type GenStamp, type GenTask, type PassCeq,
} from "./talkthrough-pass";
import { putBoardItem, putBoardItems, putSession, putTag, ttState } from "./talkthrough-sync";
import { touchRow, type SessionGeneration } from "./talkthrough";

export type ReviewState = "idle" | "queued" | "generating" | "error";
const KEY = "sa-tt-genstate";

/** One session's run state. B8 adds `progress` — the incremental queue's
 *  where-is-it-up-to, kept here (not on the synced TalkSession row) so a
 *  per-item update never writes to Supabase. See talkthrough.ts for the why. */
export interface GenEntry { state: ReviewState; error?: string; progress?: GenerationProgress }

const load = (): Record<string, GenEntry> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, GenEntry>; } catch { return {}; }
};
const save = (m: Record<string, GenEntry>): void => {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* cosmetic only */ }
};
const subs = new Set<() => void>();
export const subscribeReview = (fn: () => void): (() => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
const emit = () => subs.forEach((f) => f());

const set = (sessionId: string, state: ReviewState, error?: string) => {
  const m = load();
  const progress = m[sessionId]?.progress;
  // An idle session keeps its entry ONLY to carry a finished run's progress
  // (so the Booth can say "Generation complete"); reviewStateOf ignores it.
  if (state === "idle" && !progress) delete m[sessionId];
  else m[sessionId] = { state, ...(error ? { error } : {}), ...(progress ? { progress } : {}) };
  save(m);
  emit();
};

/** B8 — write the queue's progress for a session. Kicks the same subscribers
 *  the run state uses, so the Booth and the dock repaint on every item. */
const setProgress = (sessionId: string, progress: GenerationProgress | null): void => {
  const m = load();
  const cur = m[sessionId];
  if (!progress) {
    if (cur) { const { progress: _drop, ...rest } = cur; if (rest.state === "idle") delete m[sessionId]; else m[sessionId] = rest; }
  } else {
    m[sessionId] = { state: cur?.state ?? "generating", ...(cur?.error ? { error: cur.error } : {}), progress };
  }
  save(m);
  emit();
};

/** The queue's progress for one session, or null. */
export const generationProgressOf = (sessionId: string): GenerationProgress | null => load()[sessionId]?.progress ?? null;

/** Every session with progress worth showing: still running, or finished
 *  within the last few minutes (so "Generation complete" is seen, not stuck). */
export const SHOW_FINISHED_MS = 3 * 60_000;
export function liveGenerationProgress(now = Date.now()): { sessionId: string; progress: GenerationProgress }[] {
  const m = load();
  return Object.entries(m)
    .filter((e): e is [string, GenEntry & { progress: GenerationProgress }] => !!e[1].progress)
    .filter(([, v]) => isGenerating(v.progress) || (v.progress.finishedAt ? now - new Date(v.progress.finishedAt).getTime() < SHOW_FINISHED_MS : false))
    .map(([sessionId, v]) => ({ sessionId, progress: v.progress }));
}

/** The honest status for a session row. READY = a script item exists. */
export function reviewStateOf(doc: TTDoc, s: TalkSession): { state: "capturing" | ReviewState | "ready" | "stale"; error?: string } {
  if (sessionBoard(doc, s.id).some((b) => b.kind === "script" && !b.archivedAt)) return { state: "ready" };
  const m = load()[s.id];
  // An "idle" entry is only a finished run's progress parked for the Booth —
  // it says nothing about the session, so fall through to the real answer.
  if (m && m.state !== "idle") return m.state === "generating" ? { state: "generating" } : { state: m.state, ...(m.error ? { error: m.error } : {}) };
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
    if (m[k].state === "generating" || m[k].state === "queued") {
      const err = "interrupted (tab closed?) — retry";
      // B8: keep the progress the run got to, marked stopped, so the Booth
      // shows how far it got instead of forgetting the run happened.
      const progress = m[k].progress ? { ...m[k].progress!, currentType: null, finishedAt: new Date().toISOString(), error: err } : undefined;
      m[k] = { state: "error", error: err, ...(progress ? { progress } : {}) };
      changed = true;
    }
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

// ───────────────── B8: THE INCREMENTAL QUEUE (results as they land)
//
// Lee, 2026-09-04: one blocking call meant Review stayed empty until the whole
// board existed. Now the run is a QUEUE — the script, then every CEQ edit,
// then every idea — executed SEQUENTIALLY, each item written to the store the
// moment it parses. ReviewBoard reads the store, so cards appear one by one
// while the Booth counts them off.
//
// The task list is built by the pure half (talkthrough-pass.buildGenerationQueue)
// out of targets the session already has, so the TOTAL is known before the
// first call — the progress line never guesses.
//
// LANES. The script rides the synthesis lane with the whole transcript and the
// reference docs (one short call: only the "script" key). Every edit and every
// idea rides the MICRO lane with just that stamp's words — cheap, quick, and
// the reason results feel incremental instead of one long stall.
//
// FAILURE. Fail loud and HALT (Lee's rule, and the prompt's): the erroring
// task's message goes onto the progress line, the run stops, and everything
// already written stays on the board. Nothing retries itself; nothing is
// silently skipped; the transcript is never touched.

/** The one-shot pass is still here (queueReview above) and still used by the
 *  /talkthrough studio. V3's two Generate buttons run this one. */
export function queueIncrementalReview(req: ReviewRequest): void {
  const sid = req.session.id;
  setProgress(sid, null); // a previous run's "complete" never fronts a new one
  // THE PRE-FLIGHT RECORD (the resume slice's contract): what Lee asked for,
  // written before the first call, so a tab that dies mid-pass leaves behind
  // the choices to replay — and a start time to measure the pass by.
  markGeneration(sid, {
    requestedAt: new Date().toISOString(),
    excludedKinds: req.excludedKinds,
    wantVibePlan: req.wantVibePlan,
    completedAt: null,
    error: null,
  });
  set(sid, "queued");
  void (async () => {
    const runId = newTTId("run");
    let progress: GenerationProgress = emptyProgress();
    const bump = (p: GenerationProgress) => { progress = p; setProgress(sid, p); };
    try {
      set(sid, "generating");
      const doc = ttState().doc;
      const segs = sessionSegments(doc, sid);
      const tags = sessionTags(doc, sid);
      const knownIds = new Set(req.ceqs.map((c) => c.id));

      // Every tap-stamp, with the words spoken inside its window. `spoken` is
      // HIS WORDS ONLY — it becomes the item's quote and the idea prompt's
      // content, so the follow-up tap (a visual's kind) rides in `note`, not
      // glued to the front of the transcript.
      const stamps: GenStamp[] = tags
        .filter((t) => t.source === "tap" && canonicalStamp(t.tag))
        .map((t) => ({
          id: t.id,
          kind: canonicalStamp(t.tag)!,
          starred: !!t.starred,
          ceqId: t.focusedCeqId ?? null,
          ceqLabel: t.focusedCeqLabel ?? null,
          note: t.note ?? null,
          spoken: t.starred ? "" : segmentsInContext(segs, t).map((x) => x.text.trim()).filter(Boolean).join(" ").slice(0, 8000),
        }));

      // The booth already drafts a CEQ edit the moment an edit context closes.
      // Those keys are skipped so Lee never gets the same edit twice.
      const alreadyDrafted = sessionBoard(doc, sid)
        .filter((b) => b.kind === "ceq_edit")
        .map((b) => {
          const p = b.payload as { ceqId?: string; stamp?: string };
          return p.ceqId && p.stamp ? editTaskKey(p.ceqId, p.stamp) : "";
        })
        .filter(Boolean);

      const tasks = buildGenerationQueue({ stamps, excludedKinds: req.excludedKinds, alreadyDrafted });
      bump({ ...emptyProgress(), total: tasks.length, counts: queueCounts(tasks) });

      for (const task of tasks) {
        bump({ ...progress, currentType: task.type, label: task.label });
        await runGenTask(task, req, runId, segs, stamps, knownIds);
        bump({
          ...progress,
          completed: progress.completed + 1,
          done: { ...progress.done, [task.type]: progress.done[task.type] + 1 },
        });
      }

      // Done: currentType null is the signal the Booth reads for "complete".
      bump({ ...progress, currentType: null, label: null, finishedAt: new Date().toISOString() });
      markGeneration(sid, { completedAt: new Date().toISOString(), error: null });
      set(sid, "idle"); // READY is still derived from the board itself
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      bump({ ...progress, currentType: null, finishedAt: new Date().toISOString(), error: msg });
      markGeneration(sid, { error: msg });
      set(sid, "error", msg);
    }
  })();
}

/** Run ONE task and write what it produced. Throws to halt the queue. */
async function runGenTask(
  task: GenTask, req: ReviewRequest, runId: string,
  segs: ReturnType<typeof sessionSegments>, stamps: GenStamp[], knownIds: Set<string>,
): Promise<void> {
  const sid = req.session.id;
  const doc = ttState().doc;
  const iso = new Date().toISOString();
  const mkItem = (over: Partial<BoardItem> & Pick<BoardItem, "kind" | "title" | "payload">): BoardItem => ({
    id: newTTId("ttb"), sessionId: sid, runId, quote: "", ceqIds: [], status: "suggested", comment: "",
    createdAt: iso, updatedAt: iso, syncedAt: null, ...over,
  });

  if (task.type === "script") {
    const r = await runTalkthroughReview({
      data: {
        setName: req.session.setName,
        ceqs: req.ceqs,
        segments: segs.map((s) => ({ id: s.id, seq: s.seq, text: s.text, focusedCeqId: s.focusedCeqId ?? null, focusedCeqLabel: s.focusedCeqLabel ?? null, source: s.source, whisperPending: s.whisperPending })),
        // The synthesis lane reads the stamps the way the one-shot pass does:
        // the follow-up tap in front of the words, so it sees the whole moment.
        stamps: stamps.map((s) => ({ kind: s.kind, ceqLabel: s.ceqLabel, starred: s.starred, spoken: `${s.note && s.spoken ? `[${s.note}] ` : ""}${s.spoken}`.slice(0, 8000) })),
        excludedKinds: req.excludedKinds,
        styleNotes: [...styleNotesFor(doc, "script"), ...recentApprovedExamples(doc, "script").map((e) => `EXAMPLE (approved earlier): ${e}`)].slice(0, 12),
        wantVibePlan: req.wantVibePlan,
        only: scriptTaskKeys(req.wantVibePlan),
      },
    });
    const raw = extractJsonObject(r.text);
    if (!raw) throw new Error("the script came back as something that isn't board JSON — retry (transcript untouched)");
    const parsed = parseReview(raw, sid, runId, req.ceqs.map((c) => c.id));
    const script = parsed.items.find((i) => i.kind === "script");
    if (!script) throw new Error("the script pass produced no script — retry (nothing was written)");
    script.payload = { ...script.payload, _usage: { ...r.usage, task: "synthesis", model: r.model } };
    putBoardItems(parsed.items);
    for (const p of parsed.proposedTags) {
      const seg = segs.find((s) => s.seq === p.seq);
      const t = makeTag(sid, (canonicalStamp(p.tag) ?? "tip_trick") as never, { ceqId: seg?.focusedCeqId ?? null, label: seg?.focusedCeqLabel ?? null });
      putTag({ ...t, source: "ai", note: p.quote, at: seg?.startedAt ?? t.at, endedAt: t.at });
    }
    return;
  }

  if (task.type === "edit") {
    const ceq = req.ceqs.find((c) => c.id === task.ceqId);
    if (!ceq) throw new Error(`the question behind “${task.label}” is no longer in this set — halted`);
    const msgs = buildMicroEditMessages({
      stamp: task.stampKind as "reword" | "revise_choices" | "edit_other",
      ceq, instruction: task.spoken, styleNotes: styleNotesFor(doc, "memo"),
    });
    const r = await runMicro({ data: { system: msgs.system, user: msgs.user } });
    const proposed = parseMicroEdit(r.text);
    if (!proposed) throw new Error(`the edit draft for “${task.label}” didn't parse — halted (nothing was written)`);
    putBoardItem(mkItem({
      kind: "ceq_edit",
      title: `${STAMP_LABELS[task.stampKind as never] ?? task.stampKind} · ${ceq.label}`,
      payload: {
        stamp: task.stampKind, ceqId: ceq.id, ceqLabel: ceq.label, instruction: task.spoken,
        current: { stem: ceq.stem, choices: ceq.choices }, state: "ready", proposed,
        _usage: { ...r.usage, task: "micro", model: r.model },
      },
      quote: task.spoken, ceqIds: [ceq.id],
    }));
    return;
  }

  // idea — one stamp, one card, his words proofread.
  const ceq = task.ceqId ? req.ceqs.find((c) => c.id === task.ceqId) ?? null : null;
  const styleKind = styleKindForKind(task.stampKind ?? "");
  const msgs = buildIdeaMessages({
    stampKind: task.stampKind ?? "cheat_code",
    setName: req.session.setName,
    ceqLabel: task.ceqLabel,
    ceqStem: ceq?.stem ?? null,
    spoken: task.spoken,
    note: task.note ?? null,
    styleNotes: [...styleNotesFor(doc, styleKind), ...recentApprovedExamples(doc, styleKind).map((e) => `EXAMPLE (approved earlier): ${e}`)].slice(0, 12),
  });
  const r = await runMicro({ data: { system: msgs.system, user: msgs.user } });
  const draft = parseIdeaDraft(r.text, task.stampKind ?? "cheat_code");
  if (!draft) throw new Error(`the card for “${task.label}” didn't parse — halted (nothing was written)`);
  putBoardItem(mkItem({
    kind: "idea",
    title: draft.title,
    payload: {
      kind: draft.kind, body: draft.body, origin: "lee", stamp: task.stampKind,
      ...(draft.visualKind ? { visualKind: draft.visualKind } : {}),
      _usage: { ...r.usage, task: "micro", model: r.model },
    },
    quote: task.spoken,
    ceqIds: task.ceqId && knownIds.has(task.ceqId) ? [task.ceqId] : [],
  }));
}
