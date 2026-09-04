// THE BOOTH — the talkthrough capture surface. Mounted by /talkthrough (the
// full studio: sessions, review, bank) and by /v3/$topic/$set/blast-off/
// talkthrough (the same booth, on one set, inside the V3 menu).
//
// Moved out of routes/talkthrough.tsx on 2026-09-02 so V3 could mount it on
// its own URL. Four changes came with the move, all from Lee's V3 handoff:
//   · the Prompter is gone, and so is the "talking about the set as a whole"
//     paragraph — the frame is the prompt now
//   · the focused question is drawn by the REAL card Blast Off films (SetCard →
//     the canvas's own CeqPreviewNode), not a reformatted stem-and-choices
//   · segments are DELETABLE — soft (archivedAt), never hard: Transcript Law
//     still holds, and the last delete can be undone
//   · transcript text is small and quiet — readable, not loud
// and one addition: TRANSCRIPT IMPORT. Notes dictated anywhere else paste in
// and become segments, with stamps parsed from the spoken keywords
// (canvas/talkthrough-import.ts).
//
// Later the same day: the transcript moved to the TOP LEFT ("like a box in the
// top left"), a Start over button, and TWO MODES — CEQ mode and Exhibit mode.
// Same booth, same session, same stamps; only what is focused changes: a
// question, or one of the shipped exhibits. Exhibit talk anchors to
// `exhibit:<id>` so Step 2 can draft the Claude Code prompt from exactly what
// was said about it.
//
// Everything else is the booth Lee already knows: Space starts/stops the mic,
// Tab surfs questions (or exhibits), the stamp board opens click-in/click-out
// contexts, the flowing paragraph grows as he talks.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Eraser, FileText, Mic, RotateCcw, Square, Undo2, X } from "lucide-react";

import { EXHIBIT_REGISTRY, runMicro, type BoothCeq, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import {
  EDIT_STAMPS, STAMP_GROUPS, STAMP_LABELS, VISUAL_KINDS, canonicalStamp, contextsOfSegment, dismissableResultsForSet, ghostSegments, isGenerating, makeTag, newTTId, openContexts,
  progressLine, segmentsInContext, sessionBoard, sessionSegments, sessionTags, stampLabel, styleNotesFor, touchRow,
  type BoardItem, type StampKind, type TTDoc, type TalkSegment, type TalkSession, type TalkTag,
} from "@/components/canvas/talkthrough";
import { liveGenerationProgress, subscribeReview } from "@/components/canvas/talkthrough-review";
import { dismissSetResults, putBoardItem, putSegment, putTag, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { TalkthroughRecorder, drainWhisperQueue, isWhisperHallucination, speechRecognitionAvailable, type BoothStatus } from "@/components/canvas/talkthrough-audio";
import { buildMicroEditMessages, parseMicroEdit, type PassCeq } from "@/components/canvas/talkthrough-pass";
import { editTasksFor, generationPlan, isResumable, progressLabel, type GenTask, type GenerationPlan } from "@/components/canvas/talkthrough-resume";
import { buildImportRows, parseTranscriptImport, setNameMatches, type ImportBlock } from "@/components/canvas/talkthrough-import";
import { SetCard } from "@/components/blastoff/SetCard";
import { NOTE_EYEBROW } from "@/components/canvas/frame-copy";
import { BIG_FONT, NEON } from "@/components/canvas/theme";

export const CREAM = "#F4EFE6";
export const GOLD = "#FCA311";
export const PANEL = "rgba(16,24,44,0.9)";
export const EDGE = "rgba(244,239,230,0.16)";

/** The transcript's ink — Lee (V3 handoff): "much smaller, different colour /
 *  weight — subtle but readable". Quieter than the UI text, never invisible. */
const TRANSCRIPT_INK = "rgba(244,246,250,0.70)";
const TRANSCRIPT_PX = 13.5;

/** Player-style label: strip wrapping quotes, blanks become ___ (the same
 *  treatment exam-path's setLabel applies). */
export const setLabel = (name: string): string => name.replace(/^"|"$/g, "").replace(/\[\s*\]/g, "___").replace(/\[\s+\]/g, "___");

export const boothToPassCeq = (c: BoothCeq): PassCeq => ({
  id: c.id, label: c.draft ? `${c.label} (draft)` : c.label, stem: c.stem,
  choices: c.choices, ...(c.noteOnly ? { noteOnly: true } : {}),
});

/** DELETE = ARCHIVE. A segment Lee trashes is soft-archived — it leaves every
 *  view and every AI pass, syncs like any other edit, and can come back. */
export function archiveSegment(seg: TalkSegment): void {
  putSegment(touchRow(seg, { archivedAt: new Date().toISOString() } as Partial<TalkSegment>));
}
export function unarchiveSegment(seg: TalkSegment): void {
  const fresh = ttState().doc.segments.find((s) => s.id === seg.id) ?? seg;
  putSegment(touchRow(fresh, { archivedAt: null } as Partial<TalkSegment>));
}

// ---------------------------------------------------------------- the path

export function PathTree({ topics, activeSetId, activeCeqs, focusId, onSet, onCeq, stampedCeqIds }: {
  topics: BoothTopic[] | null;
  activeSetId: string | null;
  /** The active set's CEQs — rendered inside the tree under that set. */
  activeCeqs: BoothCeq[] | null;
  focusId: string | null;
  onSet: (s: BoothSetInfo) => void;
  onCeq?: (c: BoothCeq | null) => void;
  /** CEQs that already carry stamped data this session — lit in the tree. */
  stampedCeqIds?: Set<string>;
}) {
  const [openTopics, setOpenTopics] = useState<Set<string>>(new Set());
  // The topic holding the active set opens itself.
  useEffect(() => {
    if (!activeSetId || !topics) return;
    const t = topics.find((x) => x.sets.some((s) => s.id === activeSetId));
    if (t) setOpenTopics((p) => (p.has(t.id) ? p : new Set(p).add(t.id)));
  }, [activeSetId, topics]);

  if (!topics) return <div style={{ color: NEON.muted, fontSize: 12 }}>Loading the Exam 1 path…</div>;
  return (
    <div className="flex flex-col gap-1" style={{ overflowY: "auto", maxHeight: "82vh", paddingRight: 4 }}>
      {topics.map((t) => {
        const open = openTopics.has(t.id);
        const qCount = t.sets.reduce((n, s) => n + s.liveCount, 0);
        const dCount = t.sets.reduce((n, s) => n + s.draftCount, 0);
        return (
          <div key={t.id}>
            <button
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left"
              style={{ background: "transparent", border: "none", color: CREAM }}
              onClick={() => setOpenTopics((p) => { const n = new Set(p); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
            >
              {open ? <ChevronDown className="h-3.5 w-3.5" style={{ color: NEON.muted }} /> : <ChevronRight className="h-3.5 w-3.5" style={{ color: NEON.muted }} />}
              <span style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 13 }}>{t.name}</span>
              <span className="ml-auto" style={{ fontSize: 10.5, color: NEON.muted }}>
                {qCount} q{dCount > 0 ? ` · ${dCount} draft` : ""}
              </span>
            </button>
            {open && t.sets.map((s) => {
              const active = s.id === activeSetId;
              return (
                <div key={s.id} style={{ marginLeft: 14 }}>
                  <button
                    className="w-full rounded-lg px-2.5 py-1.5 text-left"
                    style={{
                      background: active ? "rgba(252,163,17,0.12)" : "transparent",
                      border: `1px solid ${active ? GOLD : "transparent"}`,
                      color: CREAM,
                    }}
                    onClick={() => onSet(s)}
                  >
                    <span style={{ fontSize: 12 }}>{setLabel(s.name)}</span>
                    <span style={{ fontSize: 10, color: NEON.muted, marginLeft: 6 }}>
                      {s.liveCount}{s.draftCount ? ` +${s.draftCount}d` : ""}
                    </span>
                  </button>
                  {/* the active set expands: its CEQ list lives INSIDE the tree */}
                  {active && activeCeqs && onCeq && (
                    <div className="flex flex-col" style={{ marginLeft: 10, borderLeft: `1px solid ${EDGE}`, paddingLeft: 6, marginTop: 2, marginBottom: 4 }}>
                      <button
                        className="rounded-md px-2 py-1 text-left"
                        style={{ background: focusId === null ? "rgba(252,163,17,0.14)" : "transparent", border: "none", color: focusId === null ? GOLD : NEON.muted, fontSize: 11 }}
                        onClick={() => onCeq(null)}
                      >
                        General set brainstorm
                      </button>
                      {activeCeqs.map((c, i) => {
                        const stamped = !!stampedCeqIds?.has(c.id);
                        return (
                          <button
                            key={c.id}
                            className="rounded-md px-2 py-1 text-left"
                            style={{
                              background: focusId === c.id ? "rgba(252,163,17,0.14)" : "transparent",
                              border: "none", color: focusId === c.id ? CREAM : stamped ? CREAM : NEON.muted, fontSize: 11,
                              opacity: c.noteOnly ? 0.6 : 1,
                            }}
                            onClick={() => onCeq(c)}
                          >
                            <span style={{ fontWeight: 700, color: stamped ? GOLD : undefined }}>Q{i + 1}</span> · {(c.stem || c.label).slice(0, 44)}
                            {stamped && <span title="Has stamped data this session" style={{ color: GOLD, marginLeft: 4 }}>●</span>}
                            {c.draft && <DraftChip />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function DraftChip() {
  return (
    <span className="rounded-full px-1.5 py-[1px]" style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.12em", color: "#7DD3FC", border: "1px solid rgba(125,211,252,0.4)", marginLeft: 5, verticalAlign: "middle" }}>
      DRAFT
    </span>
  );
}

/** RESUME GENERATION (2026-09-04) — the bar that appears when this session's
 *  drafting was interrupted.
 *
 *  Close the tab while stamps are drafting and their board items are stranded
 *  mid-flight; the booth used to keep saying "✎ drafting…" forever. Now the
 *  plan is derived from the board on every load, so coming back says exactly
 *  how much landed and offers to run only the rest.
 *
 *  It is a BUTTON, not an automatic re-run: every draft is a paid model call,
 *  and nothing should start spending because a page was opened. The count is
 *  honest about what will and will not be redone. */
export function ResumeBar({ plan, generating, owed, note, onResume }: {
  plan: GenerationPlan; generating: number; owed: number; note: string | null; onResume: () => void;
}) {
  // Nothing owed and nothing running = nothing to say. A finished pass is not
  // news, and a session with no edit stamps never shows this at all.
  if (!owed && !generating) return null;
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-2"
      style={{ marginBottom: 12, border: `1px solid ${owed ? GOLD : EDGE}`, background: owed ? "rgba(252,163,17,0.10)" : "transparent" }}
    >
      <div className="min-w-0" style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: owed ? GOLD : CREAM, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {generating ? `Generating · ${generating} running` : "Generation was interrupted"}
        </div>
        <div style={{ fontSize: 11, color: NEON.muted }}>
          {progressLabel(plan)}
          {note ? ` — ${note}` : owed ? " — already-written drafts are kept" : ""}
        </div>
      </div>
      {owed > 0 && (
        <button
          onClick={onResume}
          style={{ background: GOLD, color: "#0B1322", border: "none", borderRadius: 999, padding: "6px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          Resume generation
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- booth

export function Booth({ tt, session, set, topics, onSwitchSet, onEnd }: {
  tt: TTState; session: TalkSession; set: BoothSetInfo | null; topics: BoothTopic[] | null;
  onSwitchSet: (s: BoothSetInfo) => void; onEnd: () => void;
}) {
  const [, force] = useState(0);
  const bump = useCallback(() => force((n) => n + 1), []);
  const recRef = useRef<TalkthroughRecorder | null>(null);
  if (!recRef.current) {
    recRef.current = new TalkthroughRecorder(session.id, sessionSegments(ttState().doc, session.id).length, bump);
  }
  const rec = recRef.current;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [showCount, setShowCount] = useState(4); // B1.4 scrollback window
  const [importOpen, setImportOpen] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<TalkSegment | null>(null);
  const [mode, setMode] = useState<BoothMode>("ceq");
  const [exhibitId, setExhibitId] = useState<string | null>(null);
  const status: BoothStatus = rec.status();
  /** Task keys generating RIGHT NOW in this tab. Not persisted on purpose: a
   *  tab that dies takes its promises with it, and the next load reads the
   *  truth off the board (an item still "drafting" = interrupted). */
  const inFlight = useRef<Set<string>>(new Set());
  const [resumeNote, setResumeNote] = useState<string | null>(null);

  useEffect(() => { void drainWhisperQueue(session.id).then(bump); }, [session.id, bump]);
  useEffect(() => () => rec.stop(), [rec]);

  const ceqs = set?.ceqs ?? null;
  const focused = ceqs?.find((c) => c.id === focusId) ?? null;
  const focusIndex = focused && ceqs ? ceqs.indexOf(focused) : -1;
  const exhibit = mode === "exhibit" && exhibitId ? (EXHIBIT_REGISTRY.find((e) => e.id === exhibitId) ?? null) : null;
  /** The question on screen — only in CEQ mode; exhibit mode shows the exhibit. */
  const showCeq = mode === "ceq" ? focused : null;
  const focusPayload = exhibit
    ? { ceqId: `exhibit:${exhibit.id}`, label: `Exhibit · ${exhibit.label}` }
    : showCeq ? { ceqId: showCeq.id, label: `Q${focusIndex + 1} · ${showCeq.label}` } : { ceqId: null, label: null };
  // The recorder follows whatever is focused — a question, an exhibit, or
  // nothing — and a change is a chunk boundary, never a stream interruption.
  useEffect(() => { rec.setFocus(focusPayload.ceqId, focusPayload.label); }, [rec, focusPayload.ceqId, focusPayload.label]);
  // The topic name is the kicker the real card prints above a question stem.
  const topicName = topics?.find((t) => t.sets.some((s) => s.id === session.setId))?.name ?? null;
  // "Q 3/8" — questions only; a note frame is breath and is not counted.
  const questions = useMemo(() => (ceqs ?? []).filter((c) => !c.noteOnly), [ceqs]);
  const qProgress = focused && !focused.noteOnly ? { x: questions.indexOf(focused) + 1, y: questions.length } : null;
  const allTags = sessionTags(tt.doc, session.id);
  // MULTI-STAMP: every open context; `ctx` is the newest, for the follow-ups.
  const openCtxs = openContexts(allTags, session.id);
  const ctx = openCtxs[0] ?? null;
  const [stack, setStack] = useState(false);
  const segs = sessionSegments(tt.doc, session.id);
  const recent = segs.slice(-showCount);
  const stars = allTags.filter((t) => t.starred && !t.archivedAt);
  // CEQs that already carry stamps/stars this session — lit gold in the tree.
  const stampedCeqIds = useMemo(
    () => new Set(allTags.filter((t) => !t.archivedAt && t.focusedCeqId).map((t) => t.focusedCeqId!)),
    [allTags],
  );
  // Keyboard: ↑↓←→ walk the stamp board, Enter starts/stops the selected
  // stamp, Space start/stop talking, Tab/Shift+Tab surf questions.
  const flatStamps = useMemo(() => STAMP_GROUPS.flatMap((g) => g.kinds), []);
  const [selStamp, setSelStamp] = useState<StampKind | null>(null);
  const pendingEdits = sessionBoard(tt.doc, session.id).filter((b) => b.kind === "ceq_edit");
  // The last pass's cards on THIS SET — every sitting, not just this one:
  // "End Session → Review" ends the session, so walking back into Step 1 opens
  // a fresh one and last night's cards hang off the previous sitting. The
  // button exists only when there is something to clear.
  const oldResults = dismissableResultsForSet(tt.doc, session.setId);
  const oldSittings = new Set(oldResults.map((b) => b.sessionId)).size;
  const [clearNote, setClearNote] = useState<string | null>(null);
  /** What this session's generation still owes — derived from the store on
   *  every render, so it is right on a cold page load, right after a draft
   *  lands, and right on another machine once the pull arrives. */
  const plan: GenerationPlan = useMemo(() => generationPlan(tt.doc, session), [tt.doc, session]);
  const generating = plan.resumable.filter((t) => inFlight.current.has(t.key)).length;
  /** What a Resume press here would ACTUALLY run: edit drafts, not already
   *  running, whose CEQ is in the set this booth loaded. A stamp whose
   *  question has left the bank can never be drafted, so offering to resume it
   *  would be a button that does nothing — the honest count leaves it out. */
  const owed = plan.resumable.filter((t) =>
    t.kind === "ceq_edit" && !inFlight.current.has(t.key) && !!set?.ceqs.some((c) => c.id === t.ceqId)).length;

  const clickCeq = (c: BoothCeq | null) => setFocusId(c?.id ?? null);
  const clickExhibit = (id: string | null) => setExhibitId(id);
  const switchMode = (m: BoothMode) => { rec.markBoundary(); setMode(m); };

  /** CLEAR OLD RESULTS (Lee, 2026-09-04) — the last pass's cards (script, CEQ
   *  edits, ideas, vibe plan) come off the Review board before he talks a new
   *  pass, so Step 2 is not the old board plus the new one. Dismissed, never
   *  deleted: the rows keep their quotes, and anything already built from one
   *  (a slide on the film draft, a film pick, a banked item) still resolves. */
  const clearResults = () => {
    const n = oldResults.length;
    if (!n) return;
    const where = oldSittings > 1 ? ` from ${oldSittings} sittings on ${setLabel(session.setName)}` : ` on ${setLabel(session.setName)}`;
    if (!window.confirm(`Clear ${n} old result card${n === 1 ? "" : "s"}${where} off the Step 2 Review board?\n\nYour transcript and stamps are untouched, and nothing is deleted — the cards are dismissed, and slides you already built from them keep working.`)) return;
    const cleared = dismissSetResults(session.setId);
    setClearNote(`✓ cleared ${cleared} old result card${cleared === 1 ? "" : "s"} — Step 2 Review stays empty until you generate again`);
  };

  /** START OVER — every segment and stamp in this session is archived (soft,
   *  recoverable, syncs like any edit). The session stays open and empty. */
  const startOver = () => {
    const n = segs.length + allTags.length;
    if (!n) return;
    if (!window.confirm(`Start over? ${segs.length} segment${segs.length === 1 ? "" : "s"} and ${allTags.length} stamp${allTags.length === 1 ? "" : "s"} will be archived — recoverable, never deleted.`)) return;
    rec.markBoundary();
    const at = new Date().toISOString();
    for (const s of segs) putSegment(touchRow(s, { archivedAt: at } as Partial<TalkSegment>));
    for (const t of allTags) putTag(touchRow(t, { archivedAt: at } as Partial<TalkTag>));
    setLastDeleted(null);
    setImportNote(`✓ started over — ${segs.length} segments archived`);
  };

  /** B2 — ONE micro draft, for one closed edit stamp.
   *
   *  IDEMPOTENT (2026-09-04). The task carries the board item that already
   *  covers it, if any:
   *    · already ready (or already failed) → this returns false and generates
   *      NOTHING. Re-running a pass never re-bills work that landed, and never
   *      stacks a second suggestion on the same stamp.
   *    · interrupted (a killed tab left it "drafting") → the SAME row is
   *      reused, so a resume repairs the item Lee is already looking at
   *      instead of doubling it.
   *  In-flight keys are held in a ref so a double press cannot double-fire. */
  const runEditDraft = (task: GenTask): boolean => {
    if (!isResumable(task) || !task.stamp || !task.instruction) return false;
    if (inFlight.current.has(task.key)) return false;
    const ceq = set?.ceqs.find((c) => c.id === task.ceqId);
    if (!ceq) return false; // the set moved on — the stamp stays, nothing pretends to draft
    const stamp = task.stamp;
    const spoken = task.instruction;
    const iso = new Date().toISOString();
    const payload = {
      stamp, tagId: task.tagId, ceqId: ceq.id, ceqLabel: ceq.label, instruction: spoken,
      current: { stem: ceq.stem, choices: ceq.choices }, state: "drafting", error: null,
    };
    const item: BoardItem = task.item
      ? touchRow(task.item, { status: "pending", payload: { ...task.item.payload, ...payload } } as never)
      : {
        id: newTTId("ttb"), sessionId: session.id, runId: "micro", kind: "ceq_edit",
        title: `${STAMP_LABELS[stamp as never] ?? stamp} · ${ceq.label}`,
        payload, quote: spoken, ceqIds: [ceq.id], status: "pending", comment: "",
        createdAt: iso, updatedAt: iso, syncedAt: null,
      };
    inFlight.current.add(task.key);
    bump();
    putBoardItem(item);
    const msgs = buildMicroEditMessages({ stamp: stamp as never, ceq: boothToPassCeq(ceq), instruction: spoken, styleNotes: styleNotesFor(ttState().doc, "memo") });
    runMicro({ data: { system: msgs.system, user: msgs.user } })
      .then((r) => {
        const proposal = parseMicroEdit(r.text);
        const fresh = ttState().doc.boardItems.find((b) => b.id === item.id) ?? item;
        putBoardItem(touchRow(fresh, proposal
          ? { status: "suggested", payload: { ...fresh.payload, state: "ready", proposed: proposal, _usage: r.usage } }
          : { status: "suggested", payload: { ...fresh.payload, state: "error", error: "draft didn't parse — regenerate", _usage: r.usage } } as never));
      })
      .catch((e) => {
        const fresh = ttState().doc.boardItems.find((b) => b.id === item.id) ?? item;
        putBoardItem(touchRow(fresh, { status: "suggested", payload: { ...fresh.payload, state: "error", error: e instanceof Error ? e.message : String(e) } } as never));
      })
      .finally(() => { inFlight.current.delete(task.key); bump(); });
    return true;
  };

  /** Closing an EDIT context fires its draft. Capture is never blocked: the
   *  pending item exists immediately; the draft fills in. */
  const fireEditDraft = (closed: TalkTag) => {
    const stamp = canonicalStamp(closed.tag);
    if (!stamp || !(EDIT_STAMPS as readonly string[]).includes(stamp)) return;
    // CLAIM THE KEY NOW. For the 1.4s below the task is derivable but has no
    // board item yet, which reads as "owed" — without this the resume bar
    // would flash "Generation was interrupted" after every single stamp.
    inFlight.current.add(closed.id);
    bump();
    // Give the in-flight chunk a beat to persist its live text, then draft off
    // the store — the plan derives this stamp's task the same way a resume on
    // the next page load will, so the two can never disagree.
    window.setTimeout(() => {
      const task = editTasksFor(ttState().doc, session.id).find((t) => t.tagId === closed.id);
      inFlight.current.delete(closed.id); // runEditDraft re-claims it if it starts
      if (!task || !runEditDraft(task)) bump();
    }, 1400);
  };

  /** RESUME — run every task the plan still owes, oldest stamp first. Nothing
   *  already on the board is touched; see runEditDraft. */
  const resumeGeneration = () => {
    for (const task of generationPlan(ttState().doc, session).resumable) {
      if (task.kind === "ceq_edit") runEditDraft(task);
    }
  };

  const closeCtx = (t: TalkTag) => {
    const closed = touchRow(t, { endedAt: new Date().toISOString() } as Partial<TalkTag>);
    putTag(closed);
    fireEditDraft(closed);
  };
  /** B1 — stamps are click-IN/click-OUT contexts. A plain click swaps: the
   *  open ones close, the new one opens. MULTI-STAMP (Lee, 2026-09-03:
   *  "apply two or more stamps at once — reword and revise choices at the
   *  same time"): Shift+click, or the Stack toggle, opens the new one BESIDE
   *  the open ones; the words said while several are open belong to all of
   *  them, and the review pass sees each. Clicking a lit stamp closes just it. */
  const stamp = (kind: StampKind, multi = false) => {
    rec.markBoundary(); // words never straddle a context edge
    const same = openCtxs.find((t) => canonicalStamp(t.tag) === kind && t.focusedCeqId === focusPayload.ceqId);
    if (same) { closeCtx(same); return; }
    if (!multi) for (const t of openCtxs) closeCtx(t);
    putTag({ ...makeTag(session.id, kind, focusPayload), endedAt: null });
  };
  /** B1.2 — star = a bookmark on {stamp, ceq}; no context opened. */
  const star = (kind: StampKind) => {
    putTag({ ...makeTag(session.id, kind, focusPayload), starred: true, endedAt: new Date().toISOString() });
  };

  /** TRANSCRIPT IMPORT — the parsed blocks become rows through the same
   *  local-first path a live chunk takes. An open context is closed first so
   *  it cannot swallow typed notes into its window; the recorder hands over
   *  seq numbers so a chunk shipped later never collides. */
  const importBlocks = (blocks: ImportBlock[]) => {
    const now = new Date().toISOString();
    rec.markBoundary();
    for (const t of openCtxs) putTag(touchRow(t, { endedAt: now } as Partial<TalkTag>));
    const startSeq = rec.reserveSeqs(blocks.length);
    const rows = buildImportRows(blocks, { sessionId: session.id, startSeq, ceqs: (ceqs ?? []).map((c) => ({ id: c.id, label: c.label })) });
    for (const s of rows.segments) putSegment(s);
    for (const t of rows.tags) putTag(t);
    setImportOpen(false);
    setImportNote(`✓ imported ${rows.segments.length} segment${rows.segments.length === 1 ? "" : "s"} · ${rows.tags.length} stamp${rows.tags.length === 1 ? "" : "s"}`);
  };

  const deleteSeg = (s: TalkSegment) => { archiveSegment(s); setLastDeleted(s); };
  const undoDelete = () => { if (lastDeleted) { unarchiveSegment(lastDeleted); setLastDeleted(null); } };

  /** Tab / Shift+Tab CEQ surfing. dir=+1 walks Q1→Qn and stops at the end;
   *  dir=-1 walks back and lands on General set brainstorm before Q1. */
  const surfCeq = (dir: 1 | -1) => {
    if (mode === "exhibit") {
      const i = EXHIBIT_REGISTRY.findIndex((e) => e.id === exhibitId);
      const next = dir === 1 ? Math.min(i + 1, EXHIBIT_REGISTRY.length - 1) : i - 1;
      setExhibitId(next < 0 ? null : EXHIBIT_REGISTRY[next].id);
      return;
    }
    if (!ceqs?.length) return;
    if (dir === 1) clickCeq(ceqs[Math.min(focusIndex + 1, ceqs.length - 1)]);
    else if (focusIndex <= 0) clickCeq(null);
    else clickCeq(ceqs[focusIndex - 1]);
  };
  // The handlers close over per-render state; the ONE listener reads the
  // latest through this ref so it never has to re-bind.
  const keys = useRef({ stamp, surfCeq, selStamp, flatStamps });
  keys.current = { stamp, surfCeq, selStamp, flatStamps };
  /** Space's start/stop. A ref because startMic/pauseMic are declared BELOW this
   *  listener — reading them directly here would be an in-component dead zone,
   *  the same shape that has taken this canvas down twice. */
  const toggleMicRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = keys.current;
      const move = (d: 1 | -1) => {
        e.preventDefault();
        setSelStamp((s) => {
          const i = s ? k.flatStamps.indexOf(s) : d === 1 ? -1 : 0;
          return k.flatStamps[(i + d + k.flatStamps.length) % k.flatStamps.length];
        });
      };
      if (e.key === "ArrowDown" || e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") move(-1);
      else if (e.key === "Enter") { if (k.selStamp) { e.preventDefault(); k.stamp(k.selStamp, e.shiftKey); } }
      // SPACE = START / STOP TALKING (Lee, 2026-09-01). A toggle, not push-to-
      // talk: press once and talk for as long as you like, press again to stop.
      // SPACE = NEXT QUESTION, SHIFT+SPACE = BACK (Lee, 2026-09-03, the
      // dictated prompt: "Space and Shift+Space navigate questions, Enter
      // stamps in/out"). Stops at the ends; General sits before Q1.
      else if (e.key === " ") { e.preventDefault(); k.surfCeq(e.shiftKey ? -1 : 1); }
      // R = START / STOP RECORDING. A toggle: press once, talk as long as you
      // like, press again to stop. (Space used to do this; it now navigates.)
      else if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); toggleMicRef.current(); }
      // Question surfing is Tab / Shift+Tab — "next field" semantics.
      else if (e.key === "Tab") { e.preventDefault(); k.surfCeq(e.shiftKey ? -1 : 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const startMic = () => { setMicError(null); setPaused(false); rec.start().catch((e) => setMicError(e instanceof Error ? e.message : String(e))); };
  const pauseMic = () => { rec.stop(); setPaused(true); }; // mic RELEASED; session stays open
  toggleMicRef.current = () => { if (status.recording) pauseMic(); else startMic(); };

  return (
    <div className="flex gap-4" style={{ alignItems: "stretch", minHeight: "78vh" }}>
      {/* LEFT — the transcript first (Lee: "a box in the top left"), then what
          can be focused: the set's questions, or the shipped exhibits. */}
      <div className="flex flex-col gap-3" style={{ width: 360, flexShrink: 0, minWidth: 0 }}>
        <ModeToggle mode={mode} onChange={switchMode} />

        {/* THE FLOWING PARAGRAPH — one paragraph that grows as you talk. Each
            committed segment is a span with its own ×, so trashing one idea is
            one click and never touches the words around it. */}
        <LiveParagraph
          segments={segs}
          liveFinal={status.recording ? status.liveFinal : ""}
          interim={status.recording ? status.interim : ""}
          recording={status.recording}
          liveAvailable={status.liveAvailable}
          onDelete={deleteSeg}
        />
        {(lastDeleted || importNote) && (
          <div className="flex items-center gap-3" style={{ fontSize: 11, color: NEON.muted, marginTop: -6 }}>
            {lastDeleted && (
              <button className="flex items-center gap-1" style={{ color: GOLD, background: "none", border: "none", cursor: "pointer", fontSize: 11 }} onClick={undoDelete}>
                <Undo2 className="h-3 w-3" /> undo delete
              </button>
            )}
            {importNote && <span style={{ color: "#3BF5A0" }}>{importNote}</span>}
          </div>
        )}
        {/* the record, by segment — still the audit trail, now secondary */}
        <details style={{ marginTop: -4 }}>
          <summary style={{ color: NEON.muted, fontSize: 11, cursor: "pointer" }}>
            by segment ({segs.length}) — context chips, [S#] anchors, Whisper status
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            <GhostSweep doc={tt.doc} sessionId={session.id} />
            {segs.length > showCount && (
              <button className="text-left" style={{ color: NEON.muted, fontSize: 11, background: "transparent", border: "none", cursor: "pointer" }} onClick={() => setShowCount((n) => n + 50)}>
                earlier ↑ ({segs.length - showCount} more)
              </button>
            )}
            {recent.map((s) => <SegmentLine key={s.id} seg={s} ctxs={contextsOfSegment(s, allTags)} onDelete={deleteSeg} />)}
          </div>
        </details>

        {mode === "ceq" ? (
          <>
            <PathTree topics={topics} activeSetId={session.setId} activeCeqs={ceqs} focusId={focusId} onSet={(x) => { rec.stop(); onSwitchSet(x); }} onCeq={clickCeq} stampedCeqIds={stampedCeqIds} />
            {!set && <div style={{ color: NEON.muted, fontSize: 12 }}>Set not in the live bank — you can still talk; segments anchor to the session.</div>}
          </>
        ) : (
          <ExhibitList activeId={exhibitId} stampedIds={stampedCeqIds} onPick={clickExhibit} />
        )}
      </div>

      {/* CENTER — the focused question, drawn by THE REAL CARD Blast Off films */}
      <div className="flex-1 rounded-2xl p-5" style={{ background: PANEL, border: `1px solid ${EDGE}`, overflowY: "auto", maxHeight: "82vh", minWidth: 0 }}>
        <ResumeBar
          plan={plan}
          generating={generating}
          owed={owed}
          note={resumeNote}
          onResume={() => {
            resumeGeneration();
            setResumeNote(`picking up ${owed} draft${owed === 1 ? "" : "s"} — nothing already written is being redone`);
          }}
        />
        <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
          <span style={{ color: NEON.muted, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" }}>{setLabel(session.setName)}</span>
          {exhibit ? (
            <span className="rounded-full px-2.5 py-0.5" style={{ background: GOLD, color: "#0B1322", fontFamily: BIG_FONT, fontWeight: 800, fontSize: 12 }}>EXHIBIT</span>
          ) : mode === "exhibit" ? (
            <span style={{ color: GOLD, fontSize: 11, fontWeight: 700 }}>PICK AN EXHIBIT</span>
          ) : showCeq ? (
            <span className="rounded-full px-2.5 py-0.5" style={{ background: GOLD, color: "#0B1322", fontFamily: BIG_FONT, fontWeight: 800, fontSize: 12 }}>
              Q{focusIndex + 1} / {ceqs?.length ?? "?"}
            </span>
          ) : (
            <span style={{ color: GOLD, fontSize: 11, fontWeight: 700 }}>GENERAL SET BRAINSTORM</span>
          )}
          {showCeq?.draft && <DraftChip />}
          {showCeq && pendingEdits.some((b) => (b.payload as { ceqId?: string }).ceqId === showCeq.id) && (
            <span style={{ fontSize: 10, color: "#7DD3FC" }}>
              {/* "drafting…" is only true while a promise is actually in
                  flight IN THIS TAB. A row left drafting by a killed tab says
                  so — it used to claim to be working forever. */}
              {pendingEdits.filter((b) => (b.payload as { ceqId?: string }).ceqId === showCeq.id).map((b) => {
                const p = b.payload as { state?: string; tagId?: string };
                if (p.state !== "drafting") return "✎ edit ready";
                return p.tagId && !inFlight.current.has(p.tagId) ? "✎ interrupted" : "✎ drafting…";
              }).join(" · ")}
            </span>
          )}
          <span className="ml-auto" style={{ fontSize: 10.5, color: stars.length ? GOLD : NEON.muted }}>★ {stars.length}</span>
        </div>

        {showCeq && (
          <>
            {/* The frame Lee will film — the /blast-off preview, same component,
                same kicker rule (note frames say FOUND ON YOUR EXAM), same Q x/y. */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <SetCard
                id={showCeq.id}
                stem={showCeq.stem}
                choices={showCeq.choices}
                topic={showCeq.noteOnly ? NOTE_EYEBROW : topicName}
                progress={qProgress}
                scale={0.78}
              />
            </div>
            {(showCeq.needsExhibit || showCeq.masterNotes) && (
              <div className="mt-3 rounded-xl px-3 py-2" style={{ border: `1px dashed ${EDGE}` }}>
                {showCeq.needsExhibit && <div style={{ fontSize: 11, color: GOLD }}>needs_exhibit: {showCeq.needsExhibit}</div>}
                {showCeq.masterNotes && <div style={{ fontSize: 11, color: NEON.muted }}>notes: {showCeq.masterNotes}</div>}
              </div>
            )}
          </>
        )}
        {exhibit && <ExhibitFocus exhibit={exhibit} />}
        {mode === "exhibit" && !exhibit && (
          <div style={{ color: NEON.muted, fontSize: 13, marginTop: 10 }}>
            Pick an exhibit on the left, then talk about what you want it to do and what you would change. Step 2 turns that into a Claude Code prompt.
          </div>
        )}

        {importOpen && (
          <ImportPanel
            setName={session.setName}
            ceqCount={ceqs?.length ?? 0}
            onClose={() => setImportOpen(false)}
            onImport={importBlocks}
          />
        )}

      </div>

      {/* RIGHT — recorder, import, THE STAMP BOARD */}
      <div className="flex flex-col gap-3" style={{ width: 310, flexShrink: 0, overflowY: "auto", maxHeight: "82vh" }}>
        <div className="flex gap-2">
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-3.5"
            style={{ background: status.recording ? "rgba(248,113,113,0.16)" : "rgba(59,245,160,0.12)", border: `1.5px solid ${status.recording ? "#F87171" : "#3BF5A0"}`, fontFamily: BIG_FONT, fontWeight: 800, fontSize: 14 }}
            onClick={() => { if (status.recording) pauseMic(); else startMic(); }}
          >
            {status.recording ? <><Square className="h-4 w-4" /> STOP RECORDING</> : <><Mic className="h-4 w-4" /> {paused ? "RESUME RECORDING" : "START RECORDING"}</>}
          </button>
        </div>
        {/* What this recording is FOR — Lee's "is this for the page you're on?" */}
        <div style={{ fontSize: 11, color: NEON.muted, marginTop: -4, lineHeight: 1.45 }}>
          Recording for <span style={{ color: CREAM, fontWeight: 700 }}>{setLabel(session.setName)}</span>
          {" · "}<span style={{ color: GOLD }}>{focusPayload.label ?? (mode === "exhibit" ? "exhibits in general" : "the whole set")}</span>
          {" · "}press <b style={{ color: CREAM }}>R</b> to start and stop
        </div>
        <button
          className="flex items-center justify-center gap-2 rounded-xl px-3 py-2"
          style={{ border: `1px solid ${importOpen ? GOLD : EDGE}`, color: importOpen ? GOLD : CREAM, background: "transparent", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          title="Paste or upload notes you dictated elsewhere — stamps are parsed from the words you said (Phrase:, Cheat code:, Question 3…)"
          onClick={() => { setImportNote(null); setImportOpen((v) => !v); }}
        >
          <FileText className="h-3.5 w-3.5" /> {importOpen ? "Close import" : "Import transcript"}
        </button>
        <button
          className="flex items-center justify-center gap-2 rounded-xl px-3 py-1.5"
          style={{ border: `1px solid ${EDGE}`, color: NEON.muted, background: "transparent", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
          title="Archive every segment and stamp in this session and start clean — recoverable, nothing is deleted"
          onClick={startOver}
        >
          <RotateCcw className="h-3 w-3" /> Start over
        </button>
        {/* CLEAR OLD RESULTS — only when the last pass left cards behind. */}
        {oldResults.length > 0 && (
          <button
            className="flex items-center justify-center gap-2 rounded-xl px-3 py-1.5"
            style={{ border: `1px solid ${EDGE}`, color: NEON.muted, background: "transparent", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
            title="Take the last pass's cards off the Step 2 Review board before you talk a new pass — dismissed, never deleted"
            onClick={clearResults}
          >
            <Eraser className="h-3 w-3" /> Clear old results ({oldResults.length})
          </button>
        )}
        {clearNote && (
          <div style={{ fontSize: 10.5, color: "#3BF5A0", lineHeight: 1.45 }}>
            {clearNote}
            {/* The server took the rows but could not store the flag — say so
                where the click happened, never let it look like it worked. */}
            {tt.warning && <div style={{ color: "#F87171", marginTop: 3 }}>⚠ {tt.warning}</div>}
          </div>
        )}
        {paused && !status.recording && <div style={{ color: NEON.muted, fontSize: 10.5 }}>Paused — mic released. Resume continues this session exactly here (survives reloads).</div>}
        {micError && <div style={{ color: "#F87171", fontSize: 12 }}>{micError}</div>}
        {!speechRecognitionAvailable() && <div style={{ color: NEON.muted, fontSize: 10.5 }}>Live captions unavailable — chunked Whisper alone.</div>}

        {/* open-context banner */}
        {ctx && (
          <div className="rounded-xl px-3 py-2" style={{ background: "rgba(252,163,17,0.12)", border: `1.5px solid ${GOLD}` }}>
            <div style={{ fontSize: 10, letterSpacing: "0.18em", color: GOLD, textTransform: "uppercase", fontWeight: 900 }}>{openCtxs.length > 1 ? `${openCtxs.length} stamps open` : "context open"}</div>
            {openCtxs.map((t) => (
              <div key={t.id} className="flex items-center gap-2" style={{ fontSize: 12.5, color: CREAM, marginTop: 2 }}>
                <span>{stampLabel(t.tag)}{t.focusedCeqLabel ? ` · ${t.focusedCeqLabel}` : " · set"}</span>
                <button onClick={() => closeCtx(t)} title="Close this one" style={{ marginLeft: "auto", background: "none", border: "none", color: NEON.muted, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
              </div>
            ))}
            <div style={{ fontSize: 10, color: NEON.muted, marginTop: 3 }}>click a lit stamp to close it · Shift+click adds another at the same time</div>
            {/* VISUAL FOLLOW-UP (Lee, 2026-09-03): "it needs to pop down asking
                what kind of visual" — and which visual it is like. Saved on
                the stamp; the review pass reads it. */}
            {canonicalStamp(ctx.tag) === "visual" && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, color: NEON.muted, marginBottom: 4 }}>What kind?</div>
                <div className="flex flex-wrap gap-1">
                  {VISUAL_KINDS.map((k) => {
                    const on = (ctx.note ?? "").startsWith(k);
                    return (
                      <button key={k} onClick={() => putTag(touchRow(ctx, { note: `${k}${(ctx.note ?? "").includes(" · like ") ? ctx.note!.slice(ctx.note!.indexOf(" · like ")) : ""}` } as Partial<TalkTag>))}
                        style={{ background: on ? GOLD : "transparent", color: on ? "#0B1322" : CREAM, border: `1px solid ${on ? GOLD : EDGE}`, borderRadius: 999, padding: "2px 9px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>
                        {k}
                      </button>
                    );
                  })}
                </div>
                <select
                  value={(ctx.note ?? "").includes(" · like ") ? ctx.note!.slice(ctx.note!.indexOf(" · like ") + 8) : ""}
                  onChange={(e) => { const base = (ctx.note ?? "").split(" · like ")[0]; putTag(touchRow(ctx, { note: e.target.value ? `${base} · like ${e.target.value}` : base } as Partial<TalkTag>)); }}
                  style={{ marginTop: 6, width: "100%", background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 8, color: CREAM, fontSize: 11, padding: "4px 8px" }}
                >
                  <option value="">like an existing visual? (optional)</option>
                  {EXHIBIT_REGISTRY.map((e) => <option key={e.id} value={e.label}>{e.label}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* B2 — THE STAMP BOARD. Every stamp opens a context; ★ bookmarks
            {stamp, ceq} without opening one. Keyboard: ↑↓←→ select, Enter
            starts/stops. An OPEN stamp glows like a light left on; the
            keyboard cursor is the dashed blue ring. An empty group label
            (Exhibit) renders as a separated tail — not one of the video
            options. */}
        <style>{`@keyframes tt-stamp-glow{0%,100%{box-shadow:0 0 5px 1px rgba(252,163,17,.5)}50%{box-shadow:0 0 16px 5px rgba(252,163,17,.9)}}`}</style>
        {STAMP_GROUPS.map((g) => (
          <div key={g.id} style={g.label ? undefined : { marginTop: 2, borderTop: `1px dashed ${EDGE}`, paddingTop: 8 }}>
            {g.label && <div style={{ fontSize: 9.5, letterSpacing: "0.22em", color: NEON.muted, textTransform: "uppercase", fontWeight: 900, marginBottom: 4 }}>{g.label}</div>}
            <div className="flex flex-wrap gap-1.5">
              {g.kinds.map((k) => {
                const active = openCtxs.some((t) => canonicalStamp(t.tag) === k);
                const selected = selStamp === k;
                return (
                  <div
                    key={k}
                    className="flex items-stretch"
                    style={{
                      borderRadius: 10, overflow: "hidden",
                      border: `1.5px solid ${active ? GOLD : EDGE}`,
                      outline: selected ? "2px dashed #7DD3FC" : "none", outlineOffset: 1,
                      animation: active ? "tt-stamp-glow 1.5s ease-in-out infinite" : "none",
                    }}
                  >
                    <button
                      className="px-2.5 py-1.5"
                      style={{ background: active ? GOLD : PANEL, color: active ? "#0B1322" : CREAM, fontFamily: BIG_FONT, fontWeight: 800, fontSize: 11 }}
                      onClick={(e) => { setSelStamp(k); stamp(k, e.shiftKey || stack); }}
                    >
                      {STAMP_LABELS[k]}
                    </button>
                    <button
                      title="Star — come back to this (no context)"
                      className="px-1.5"
                      style={{ background: active ? "rgba(11,19,34,0.25)" : "rgba(9,13,26,0.7)", color: stars.some((t) => canonicalStamp(t.tag) === k && t.focusedCeqId === focusPayload.ceqId) ? GOLD : NEON.muted, fontSize: 11 }}
                      onClick={(e) => { e.stopPropagation(); star(k); }}
                    >
                      ★
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <label className="flex items-center gap-2" style={{ fontSize: 11, color: stack ? GOLD : NEON.muted, cursor: "pointer" }} title="Every stamp you click adds to the open ones instead of replacing them — same as holding Shift">
          <input type="checkbox" checked={stack} onChange={(e) => setStack(e.target.checked)} style={{ accentColor: GOLD }} />
          Stack stamps (two or more at once)
        </label>
        <div style={{ color: NEON.muted, fontSize: 9.5, lineHeight: 1.5 }}>
          ⌨ Space next Q · Shift+Space back · ↑↓←→ pick a stamp · Enter stamp in/out (Shift+Enter stacks) · R start/stop recording
        </div>

        <div className="mt-auto flex flex-col gap-2">
          {(status.uploadQueue > 0 || status.transcribeQueue > 0) && (
            <div style={{ color: NEON.muted, fontSize: 11 }}>background: {status.uploadQueue} uploading · {status.transcribeQueue} awaiting Whisper</div>
          )}
          {status.lastError && <div style={{ color: "#F87171", fontSize: 11 }}>retrying: {status.lastError}</div>}
          {/* B8 — what the AI is generating right now, item by item */}
          <GenerationProgressLines doc={tt.doc} sessionId={session.id} />
          {/* B3 — THE primary next action */}
          <button className="rounded-xl px-4 py-3" style={{ background: GOLD, color: "#0B1322", fontFamily: BIG_FONT, fontWeight: 800, fontSize: 15 }} onClick={() => { rec.stop(); onEnd(); }}>
            End Session → Review
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------- B8: generation progress

/** THE PROGRESS LINE (Lee, 2026-09-04). End Session queues a QUEUE now — the
 *  script, then the CEQ edits, then the ideas — and each item lands on Review
 *  as it is written. This says where it is up to: "Generating: edits 2/5 done".
 *
 *  It lists EVERY run in flight, not just this session's, because End Session
 *  sends Lee straight on to the next set while the last one generates behind
 *  him; a run that is not this booth's names its set. A finished run says so
 *  for three minutes, then clears itself. */
export function GenerationProgressLines({ doc, sessionId }: { doc: TTDoc; sessionId: string }) {
  const [, tick] = useState(0);
  useEffect(() => subscribeReview(() => tick((n) => n + 1)), []);
  const rows = liveGenerationProgress();
  // A finished run ages out on a clock, not on an event — nudge the render.
  useEffect(() => {
    if (!rows.length) return;
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [rows.length]);
  if (!rows.length) return null;

  return (
    <div className="flex flex-col gap-1">
      {rows.map(({ sessionId: sid, progress }) => {
        const running = isGenerating(progress);
        const ses = doc.sessions.find((s) => s.id === sid);
        const other = sid !== sessionId && ses ? ` · ${setLabel(ses.setName)}` : "";
        const color = progress.error ? "#F87171" : running ? GOLD : "#3BF5A0";
        return (
          <div key={sid} style={{ fontSize: 11.5, color, fontWeight: 700, lineHeight: 1.45 }}>
            {running ? "⚡ " : progress.error ? "✕ " : "✓ "}{progressLine(progress)}{other}
            {running && progress.total > 0 && (
              <span style={{ color: NEON.muted, fontWeight: 600 }}> · {progress.completed}/{progress.total} overall</span>
            )}
            {running && progress.label && (
              <div style={{ color: NEON.muted, fontSize: 10.5, fontWeight: 600 }}>{progress.label}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------- import

/** TRANSCRIPT IMPORT — paste or upload, see what it parsed to, import.
 *  Blocks named for another set (a "Set: …" header) are counted and skipped,
 *  never silently imported into the wrong session. */
function ImportPanel({ setName, ceqCount, onClose, onImport }: {
  setName: string; ceqCount: number; onClose: () => void; onImport: (blocks: ImportBlock[]) => void;
}) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const blocks = useMemo(() => parseTranscriptImport(text, ceqCount), [text, ceqCount]);
  const mine = useMemo(() => blocks.filter((b) => setNameMatches(b.setName, setName)), [blocks, setName]);
  const skipped = blocks.length - mine.length;
  const stamped = mine.filter((b) => b.stamp).length;
  const anchored = mine.filter((b) => b.ceqIndex != null).length;

  const readFile = (f: File) => {
    f.text()
      .then((t) => { setText((p) => (p.trim() ? `${p}\n\n${t}` : t)); setNote(`✓ read ${f.name}`); })
      .catch((e) => setNote(`⚠ ${e instanceof Error ? e.message : String(e)}`));
  };

  return (
    <div className="mt-4 rounded-2xl p-4" style={{ border: `1px solid ${GOLD}66`, background: "rgba(9,13,26,0.6)" }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        <span style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD }}>Import transcript</span>
        <button onClick={onClose} className="ml-auto" style={{ color: NEON.muted, background: "none", border: "none", cursor: "pointer" }} title="Close"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div style={{ fontSize: 11, color: NEON.muted, lineHeight: 1.5, marginBottom: 8 }}>
        Say the stamp word, then the idea — <b style={{ color: CREAM }}>Phrase:</b> · <b style={{ color: CREAM }}>Trigger word:</b> · <b style={{ color: CREAM }}>Tip:</b> · <b style={{ color: CREAM }}>Cheat code:</b> · <b style={{ color: CREAM }}>Real world:</b> · <b style={{ color: CREAM }}>Memo:</b> · <b style={{ color: CREAM }}>Exhibit:</b> · <b style={{ color: CREAM }}>Short:</b> · <b style={{ color: CREAM }}>Nerd out:</b> · <b style={{ color: CREAM }}>Reword this:</b> · <b style={{ color: CREAM }}>Revise choices:</b>.
        Say <b style={{ color: CREAM }}>Question 3</b> before talking about Q3, <b style={{ color: CREAM }}>General</b> to go back to the set. A <b style={{ color: CREAM }}>Set:</b> line names the set for the block under it.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the dictation here…"
        rows={8}
        style={{ width: "100%", background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 10, color: CREAM, fontSize: 12.5, lineHeight: 1.5, padding: "8px 10px", outline: "none", resize: "vertical" }}
      />
      <div className="mt-2 flex items-center gap-3" style={{ flexWrap: "wrap" }}>
        <label className="rounded-lg px-2.5 py-1" style={{ border: `1px solid ${EDGE}`, color: CREAM, fontSize: 11.5, cursor: "pointer" }}>
          upload .txt
          <input type="file" accept=".txt,.md,.text,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
        </label>
        <span style={{ fontSize: 11, color: NEON.muted }}>
          {mine.length} segment{mine.length === 1 ? "" : "s"} · {stamped} stamped · {anchored} anchored to a question
          {skipped ? ` · ${skipped} skipped (named for another set)` : ""}
        </span>
        {note && <span style={{ fontSize: 11, color: note.startsWith("⚠") ? "#F87171" : "#3BF5A0" }}>{note}</span>}
        <button
          className="ml-auto rounded-xl px-4 py-1.5"
          disabled={!mine.length}
          onClick={() => onImport(mine)}
          style={{ background: mine.length ? GOLD : "transparent", color: mine.length ? "#0B1322" : NEON.muted, border: `1px solid ${mine.length ? GOLD : EDGE}`, fontFamily: BIG_FONT, fontWeight: 800, fontSize: 12.5, cursor: mine.length ? "pointer" : "default" }}
        >
          Import {mine.length || ""}
        </button>
      </div>
      {mine.length > 0 && (
        <div className="mt-3 flex flex-col gap-1" style={{ maxHeight: 180, overflowY: "auto" }}>
          {mine.slice(0, 40).map((b, i) => (
            <div key={i} style={{ fontSize: 11.5, color: TRANSCRIPT_INK, lineHeight: 1.4 }}>
              {b.ceqIndex != null && <span style={{ color: NEON.muted, fontSize: 10, marginRight: 5 }}>Q{b.ceqIndex + 1}</span>}
              {b.stamp && <StampChip label={STAMP_LABELS[b.stamp]} />}
              {b.text.length > 110 ? `${b.text.slice(0, 110)}…` : b.text}
            </div>
          ))}
          {mine.length > 40 && <div style={{ fontSize: 10.5, color: NEON.muted }}>… and {mine.length - 40} more</div>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- transcript

/** GHOST SWEEP — the hallucinations Whisper wrote into the transcript before
 *  the capture-side gate existed. Never removes anything on its own: it shows
 *  the exact lines and waits for a click. Archive is soft and syncs like any
 *  other edit, so a mistake is recoverable. */
export function GhostSweep({ doc, sessionId }: { doc: TTDoc; sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(0);
  const ghosts = useMemo(() => ghostSegments(doc, sessionId, isWhisperHallucination), [doc, sessionId]);
  if (!ghosts.length) {
    return done > 0
      ? <div style={{ color: "#3BF5A0", fontSize: 11, marginBottom: 6 }}>✓ removed {done} ghost segment{done === 1 ? "" : "s"} — archived, not deleted</div>
      : null;
  }
  const remove = () => {
    for (const g of ghosts) archiveSegment(g);
    setDone((n) => n + ghosts.length);
    setOpen(false);
  };
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.35)", marginBottom: 8 }}>
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: "#F87171", fontWeight: 700 }}>
          {ghosts.length} ghost segment{ghosts.length === 1 ? "" : "s"} — Whisper filled silence with video-outro noise
        </span>
        <button className="text-[11px]" style={{ color: NEON.muted, textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
          {open ? "hide" : "show"}
        </button>
        <button className="ml-auto rounded-lg px-2.5 py-1 text-[11px] font-bold" style={{ border: "1.5px solid #F87171", color: "#F87171", background: "transparent", cursor: "pointer" }} onClick={remove}>
          Remove {ghosts.length}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-1">
          {ghosts.map((g) => (
            <div key={g.id} style={{ fontSize: 11, color: NEON.muted }}>[S{g.seq}] {g.text.slice(0, 120)}</div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 9.5, color: NEON.muted, marginTop: 4 }}>
        Only whisper-sourced lines are offered — anything the live mic heard is yours and is never listed. Removal archives; it never deletes.
      </div>
    </div>
  );
}

/** THE DICTATION VIEW — one growing paragraph, Speechnotes-style.
 *
 *  Three tiers of certainty, rendered as one paragraph so the eye never has to
 *  reassemble them: committed segments, then this chunk's finalised words, then
 *  the interim tail that is still settling. Only the last is dimmed further —
 *  any more and the text strobes as words graduate between tiers.
 *
 *  Each committed segment is its own span with a faint × — the delete Lee
 *  asked for, on the words themselves, one idea at a time.
 *
 *  Auto-scrolls to the tail, but ONLY while recording: reading back a finished
 *  session should not yank you to the bottom. */
function LiveParagraph({ segments, liveFinal, interim, recording, liveAvailable, onDelete }: {
  segments: TalkSegment[]; liveFinal: string; interim: string; recording: boolean; liveAvailable: boolean;
  onDelete: (s: TalkSegment) => void;
}) {
  const tailRef = useRef<HTMLSpanElement>(null);
  const shown = segments.filter((s) => s.text.trim());
  useEffect(() => {
    if (!recording) return;
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [shown.length, liveFinal, interim, recording]);

  const empty = !shown.length && !liveFinal && !interim;
  return (
    <div
      style={{
        maxHeight: "38vh", overflowY: "auto",
        background: "rgba(9,13,26,0.55)", border: `1px solid ${NEON.borderSoft}`,
        borderRadius: 14, padding: "12px 14px",
      }}
    >
      <style>{`.tt-seg{border-radius:3px}.tt-seg:hover{background:rgba(252,163,17,.09)}.tt-seg-x{opacity:.28;margin:0 1px 0 3px;padding:0 3px;color:#F87171;font-size:11px;font-weight:800;line-height:1;background:none;border:none;cursor:pointer;vertical-align:baseline}.tt-seg:hover .tt-seg-x{opacity:1}`}</style>
      {empty ? (
        <div style={{ color: NEON.muted, fontSize: 12.5 }}>
          {recording
            ? (liveAvailable ? "Listening — start talking." : "Listening. This browser has no live text, so words land in seconds via Whisper.")
            : "Press R to start recording, or import a transcript."}
        </div>
      ) : (
        <div style={{ fontSize: TRANSCRIPT_PX, lineHeight: 1.65, fontWeight: 400, color: TRANSCRIPT_INK, whiteSpace: "pre-wrap" }}>
          {shown.map((s, i) => (
            <span key={s.id} className="tt-seg" title={`[S${s.seq}]${s.focusedCeqLabel ? ` · ${s.focusedCeqLabel}` : ""}${s.whisperPending ? " · Whisper pending" : ""}`}>
              {i > 0 ? " " : ""}{s.text.trim()}
              <button className="tt-seg-x" title="Delete this segment (archived — undo below)" onClick={() => onDelete(s)}>×</button>
            </span>
          ))}
          {liveFinal ? (shown.length ? " " : "") + liveFinal : ""}
          {interim ? <span style={{ color: NEON.muted }}>{(shown.length || liveFinal ? " " : "") + interim}</span> : null}
          <span ref={tailRef} />
          {recording && <span style={{ color: GOLD }}>▌</span>}
        </div>
      )}
    </div>
  );
}

export function SegmentLine({ seg, ctx, ctxs, onDelete }: { seg: TalkSegment; ctx?: TalkTag | null; ctxs?: TalkTag[]; onDelete?: (s: TalkSegment) => void }) {
  if (!seg.text) return null;
  const chips = ctxs ?? (ctx ? [ctx] : []);
  return (
    <div style={{ fontSize: 12, lineHeight: 1.5, color: TRANSCRIPT_INK }}>
      <span style={{ color: NEON.muted, fontSize: 10.5 }}>[S{seg.seq}]{seg.focusedCeqLabel ? ` ${seg.focusedCeqLabel} · ` : " "}</span>
      {chips.map((c) => <StampChip key={c.id} label={stampLabel(c.tag)} />)}
      {seg.text}
      {seg.whisperPending && <span title="Live text — Whisper canonical copy pending" style={{ color: GOLD, fontSize: 10, marginLeft: 6 }}>◌ pending</span>}
      {onDelete && (
        <button title="Delete this segment (archived, not deleted)" onClick={() => onDelete(seg)}
          style={{ color: "#F87171", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 800, marginLeft: 6, opacity: 0.6 }}>
          ×
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- modes

export type BoothMode = "ceq" | "exhibit";
type ExhibitEntry = (typeof EXHIBIT_REGISTRY)[number];

/** CEQ MODE · EXHIBIT MODE — two pills, one booth. */
function ModeToggle({ mode, onChange }: { mode: BoothMode; onChange: (m: BoothMode) => void }) {
  const pill = (m: BoothMode, label: string) => {
    const on = mode === m;
    return (
      <button
        key={m}
        className="flex-1 rounded-lg px-3 py-1.5"
        style={{ background: on ? GOLD : "transparent", color: on ? "#0B1322" : NEON.muted, fontFamily: BIG_FONT, fontWeight: 800, fontSize: 11.5, letterSpacing: "0.06em", border: "none", cursor: "pointer" }}
        onClick={() => onChange(m)}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex gap-1 rounded-xl p-1" style={{ border: `1px solid ${EDGE}`, background: PANEL }}>
      {pill("ceq", "CEQ MODE")}
      {pill("exhibit", "EXHIBIT MODE")}
    </div>
  );
}

/** The shipped exhibits (EXHIBIT_REGISTRY), as the thing to focus and talk
 *  about — the same shape as the question list, so the muscle memory holds. */
function ExhibitList({ activeId, stampedIds, onPick }: { activeId: string | null; stampedIds: Set<string>; onPick: (id: string | null) => void }) {
  return (
    <div className="flex flex-col gap-1" style={{ overflowY: "auto", maxHeight: "40vh", paddingRight: 4 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.2em", color: NEON.muted, textTransform: "uppercase", fontWeight: 900, padding: "2px 8px" }}>Exhibits</div>
      <button
        className="rounded-md px-2.5 py-1.5 text-left"
        style={{ background: activeId === null ? "rgba(252,163,17,0.14)" : "transparent", border: "none", color: activeId === null ? GOLD : NEON.muted, fontSize: 11.5 }}
        onClick={() => onPick(null)}
      >
        Exhibits in general — a new one, or the family
      </button>
      {EXHIBIT_REGISTRY.map((e) => {
        const on = activeId === e.id;
        const stamped = stampedIds.has(`exhibit:${e.id}`);
        return (
          <button
            key={e.id}
            className="rounded-md px-2.5 py-1.5 text-left"
            style={{ background: on ? "rgba(252,163,17,0.14)" : "transparent", border: `1px solid ${on ? GOLD : "transparent"}`, color: on || stamped ? CREAM : NEON.muted, fontSize: 12 }}
            onClick={() => onPick(e.id)}
          >
            <span style={{ fontWeight: 700, color: stamped ? GOLD : undefined }}>{e.label}</span>
            {stamped && <span title="Has stamped data this session" style={{ color: GOLD, marginLeft: 4 }}>●</span>}
          </button>
        );
      })}
      <div style={{ fontSize: 10.5, color: NEON.muted, padding: "6px 8px", lineHeight: 1.5 }}>
        Say what it should show, what to keep, what to change. Step 2 drafts the Claude Code prompt from your words; the exhibit itself still ships through Exhibit Lab.
      </div>
    </div>
  );
}

/** The focused exhibit, in the centre — a dark card naming it, so the screen
 *  says what the words are about the way the question card does in CEQ mode. */
function ExhibitFocus({ exhibit }: { exhibit: ExhibitEntry }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 560, borderRadius: 14, border: "1.5px solid rgba(252,163,17,0.6)", background: "#14213D", padding: "18px 22px 20px", position: "relative" }}>
        <span aria-hidden style={{ position: "absolute", top: -1, right: -1, width: 26, height: 26, background: GOLD, clipPath: "polygon(100% 0, 0 0, 100% 100%)", borderTopRightRadius: 13, opacity: 0.9 }} />
        <div style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.12em", color: GOLD, background: "rgba(252,163,17,0.14)", border: "1px solid rgba(252,163,17,0.27)", marginBottom: 8 }}>EXHIBIT</div>
        <div style={{ fontFamily: BIG_FONT, fontSize: 26, fontWeight: 800, lineHeight: 1.2, color: "#F5EFE6" }}>{exhibit.label}</div>
        <div style={{ fontSize: 12, color: "rgba(245,239,230,0.62)", marginTop: 10, lineHeight: 1.5 }}>
          Talk about this exhibit: what it should show, the reveal, what you would keep and what you would change. Everything you say here is anchored to it.
        </div>
        <a href="/exhibit-lab" target="_blank" rel="noopener" style={{ display: "inline-block", marginTop: 12, fontSize: 11.5, color: GOLD, textDecoration: "none", border: `1px solid rgba(252,163,17,0.4)`, borderRadius: 8, padding: "4px 10px" }}>
          Open it in Exhibit Lab ↗ (new tab)
        </a>
      </div>
    </div>
  );
}

function StampChip({ label }: { label: string }) {
  return (
    <span className="rounded-full px-1.5" style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", color: GOLD, border: `1px solid ${GOLD}55`, marginRight: 5, verticalAlign: "middle" }}>
      {label}
    </span>
  );
}
