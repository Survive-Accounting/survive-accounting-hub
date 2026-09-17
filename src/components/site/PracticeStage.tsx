// CRAM MODE (08-21) — the Practice stage of Cram → Practice → Review, shared by the homepage
// player and /learn. Keyboard-first on desktop (↑↓ highlight, ⏎ lock-in / advance, ←→ step,
// Shift+→ next set), tap-first on mobile (tap a row to lock in, big Next, swipe to step). Cards
// swap in place in ~120ms; no spinners, no layout shift. Resolution is a silent green/red resolve
// (the sfx engine is filming-side only — students never hear it). PROGRESS, NOT SCORES: nothing here reads as
// a grade — the end of a set counts questions seen and how many to run again, and a cram tool
// brings the missed ones back. Every answer/skip/abandon logs to practice_attempts (stable ids).
// Questions come from fetchSetPractice (or are passed in for demo).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleX, Loader2, MessageCircle, RotateCcw } from "lucide-react";

import { fetchSetPractice, type PracticeQuestion } from "@/lib/student.functions";
import { askAboutQuestion, logPracticeEvents, type AttemptEvent } from "@/lib/practice.functions";
import { readStudentEmail, rememberStudentEmail } from "@/lib/student-email";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import { passed, recordPracticeAnswer } from "@/lib/practice-score";
import { emptyArrows, type RubricArrows } from "@/components/blastoff/rubric";
import { RubricAnswer } from "@/components/learn/RubricAnswer";
import { rubricMatches } from "@/lib/learn-bonus";

const DARK = { text: "#E8ECF5", muted: "#93A0B4", yellow: "#FCA311", green: "#3BF5A0", red: "#FF5C6E", border: "rgba(148,163,190,0.16)", panel: "rgba(9,14,26,0.6)", bg: undefined as string | undefined, card: "rgba(255,255,255,0.05)", cardEdge: "rgba(148,180,255,0.18)", chip: "rgba(255,255,255,0.08)", chipEdge: "rgba(148,180,255,0.22)" };
/** THE CREAM SKIN (Lee, 2026-09-16: "it should use the same skin as the learn page… cream background, electric
 *  shock when you hover over a choice. Pulse when you select one."). */
const CREAM = { text: "#14213D", muted: "#5B6478", yellow: "#B86E00", green: "#15803D", red: "#C2273B", border: "rgba(20,33,61,0.14)", panel: "#FFFFFF", bg: "#F4EFE6" as string | undefined, card: "#FFFFFF", cardEdge: "rgba(20,33,61,0.16)", chip: "rgba(20,33,61,0.06)", chipEdge: "rgba(20,33,61,0.14)" };
type Palette = typeof DARK;
const PaletteContext = createContext<Palette>(DARK);
const CHOICE_CSS = `
@keyframes sa-shock{0%{box-shadow:0 0 0 0 rgba(252,163,17,0)}18%{box-shadow:0 0 0 3px rgba(252,163,17,.6),0 0 18px rgba(252,163,17,.55)}34%{box-shadow:0 0 0 1px rgba(252,163,17,.25)}52%{box-shadow:0 0 0 3px rgba(252,163,17,.5),0 0 22px rgba(59,245,160,.35)}100%{box-shadow:0 0 0 2px rgba(252,163,17,.4)}}
.sa-choice:not(:disabled):hover{animation:sa-shock 460ms ease-out forwards;transform:translateX(2px)}
@keyframes sa-pulse{0%{transform:scale(1)}40%{transform:scale(1.025)}100%{transform:scale(1)}}
.sa-pulse{animation:sa-pulse 360ms ease-out}
@media (prefers-reduced-motion:reduce){.sa-choice:not(:disabled):hover,.sa-pulse{animation:none;transform:none}}
`;
const SWAP_MS = 120;

// ---- coverage (questions attempted per set) — drives the rail bars; local, never a score ------
const COVERAGE_KEY = "sa-practice-coverage";
export function readCoverage(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(COVERAGE_KEY) ?? "{}") as Record<string, string[]>; } catch { return {}; }
}
function addCoverage(setId: string, ceqId: string): void {
  try { const m = readCoverage(); const s = new Set(m[setId] ?? []); s.add(ceqId); m[setId] = [...s]; localStorage.setItem(COVERAGE_KEY, JSON.stringify(m)); window.dispatchEvent(new CustomEvent("sa-coverage")); } catch { /* ignore */ }
}
const sessionId = (): string => {
  try { let s = sessionStorage.getItem("sa-practice-session"); if (!s) { s = crypto.randomUUID(); sessionStorage.setItem("sa-practice-session", s); } return s; } catch { return "anon-" + Math.random().toString(16).slice(2); }
};
const fmtElapsed = (ms: number) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };

export interface PracticeStageProps {
  setId: string;
  /** Bypass the server (demo mode) — the caller supplies the questions. */
  questions?: PracticeQuestion[];
  /** The forward CTA at the end — the SURFACE decides where practice leads ("Next set →"). */
  onDone: () => void;
  doneLabel: string;
  /** "Review with Lee →" — only when that video exists. */
  onReview?: () => void;
  /** Reference scheme: topic number + 1-based set index → "3.2 · Q14 / 24" and "3.2.14". */
  reference?: { topic: number | null; set: number };
  setName?: string;
  campusName?: string | null;
  campusSlug?: string | null;
  surface?: "home" | "campus" | "greek" | "learn";
  isTest?: boolean;
  /** Top-right status pill ("PRACTICE"). The only chrome the question header carries. */
  statusLabel?: string;
  /** "cream" = the /learn skin (2026-09-16); "dark" is the homepage cram mode. */
  skin?: "dark" | "cream";
  /** Auth state, controlled by the surface. When false, Save my progress is surfaced contextually
   *  (a small chip next to Q# after the first answer + a link in the Q navigator). */
  authed?: boolean;
  onSaveProgress?: () => void;
  /** GUIDED PATH (08-26): when set, the completion screen may auto-advance — conservatively.
   *  Results render untouched for ~3s, then a small "Continuing in 5…" line with Continue now /
   *  Stay here appears. Retry, Stay, or any earlier navigation cancels it. */
  pathAdvance?: { label: string; onContinue: () => void } | null;
  /** Fires once when the completion screen first renders — "reached set completion state". */
  onFinished?: () => void;
  /** THE QUICK ROUND (/learn, 2026-09-11 — Lee: "A Practice card represents access to the section's
   *  QUESTION BANK. It should NOT mean 'you must answer every question right now.'"): the first
   *  pass is at most this many questions, in the set's saved order; the rest wait behind "More
   *  practice", which serves the next slice and wraps round. Undefined = the whole set, as before. */
  roundSize?: number;
  /** THE RECOMMENDED NEXT ACTION (/learn, 2026-09-11 — Lee: "ONE visually dominant action with a
   *  small Recommended label … The student should always be able to understand: 'What does Survive
   *  think I should do next?'"). When set, the completion screen ranks its actions:
   *    missed some   Recommended · Retry missed (N)  ›  Next topic →  ›  More practice · Retry all
   *    clean round   Recommended · Next topic →      ›  More practice ›  Retry round
   *  `nextLabel` / `onNext` are the surface's ("Next topic →", or "Back to the videos" on the last
   *  topic). Undefined = the older screen (Retry the N you missed / doneLabel / Review with Lee). */
    guidance?: { nextLabel: string; onNext: () => void };
  /** GRADE AT THE END (2026-09-16, the set screen). Lee: "wait until the end to show right/wrong." A pick is
   *  kept, not resolved — no green, no red, no feedback — and can be changed until the results screen, which
   *  shows the score, the misses, and "Redo the N you missed". Rubric questions (q.rubric) are answered on the
   *  A = L + E boxes (RubricAnswer). */
  gradeAtEnd?: boolean;
  /** The set's bonus, when it has one: the results say "Bonus unlocked" at 80% and open it. */
  bonus?: { kind: "ale" | "types"; onOpen: () => void } | null;
}

export function PracticeStage(props: PracticeStageProps) {
  return <PaletteContext.Provider value={props.skin === "cream" ? CREAM : DARK}><PracticeStageInner {...props} /></PaletteContext.Provider>;
}
function PracticeStageInner({ setId, questions: override, onDone, doneLabel, onReview, reference, campusName, campusSlug, surface, isTest, statusLabel = "Practice", authed = false, onSaveProgress, pathAdvance = null, onFinished, roundSize, guidance, gradeAtEnd = false, bonus = null }: PracticeStageProps) {
  const C = useContext(PaletteContext);
  const q = useQuery({ queryKey: ["set-practice", setId], queryFn: () => fetchSetPractice({ data: { setId } }), enabled: !override, staleTime: 300_000, networkMode: "always" });
  const questions = useMemo<PracticeQuestion[]>(() => override ?? (q.data?.status === "ok" ? q.data.questions : []), [override, q.data]);

  // ---- pass / position state -------------------------------------------------------------------
  const [order, setOrder] = useState<number[]>([]);           // indexes into `questions` for this pass
  const [pass, setPass] = useState(1);
  const [pos, setPos] = useState(0);
  const [hi, setHi] = useState(0);                               // highlighted choice (keyboard)
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, boolean>>({}); // ceqId → correct (latest)
  // ceqId → the choice that was locked in. Navigating back to an answered question shows that
  // result (no re-answer, no silent re-log); a retry pass clears the missed ones so they can be
  // answered again. This is the session state the Q navigator reads.
    const [pickedBy, setPickedBy] = useState<Record<string, string>>({});
  // ceqId → the arrows tapped on a rubric question (gradeAtEnd; pickedBy holds "rubric" for it).
  const [rubricBy, setRubricBy] = useState<Record<string, RubricArrows>>({});
  const [navOpen, setNavOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [finished, setFinished] = useState(false);
  const [swap, setSwap] = useState(false);
  // Auto-advance after a CORRECT answer only. No visible toggle any more (header stays clean);
  // it can still be switched on via localStorage sa-cram-auto=1.
  const [autoAdvance] = useState(() => { try { return localStorage.getItem("sa-cram-auto") === "1"; } catch { return false; } });
  // PRACTICE PACK spotlight (D5): glow the print icon once when the student
  // completes a set OR answers 5 questions this session — whichever first.
  const [packSpot, setPackSpot] = useState(false);
  const packSpotDone = useRef((() => { try { return localStorage.getItem("sa-pack-spot") === "1"; } catch { return true; } })());
  const startedAt = useRef(Date.now());
  const revealedAt = useRef(Date.now());
  const userId = useRef<string | null>(null);
  const touchX = useRef<number | null>(null);
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => { userId.current = data.session?.user?.id ?? null; }); }, []);
  // THE ROUND: the first pass is the first `roundSize` questions (or all of them); `roundStart`
  // remembers where the last slice began so "More practice" can serve the next one.
  const [roundStart, setRoundStart] = useState(0);
  const sliceOf = useCallback((start: number) => { const all = questions.map((_, i) => i); return roundSize ? all.slice(start, start + roundSize) : all; }, [questions, roundSize]);
  useEffect(() => { if (questions.length && order.length === 0) setOrder(sliceOf(0)); }, [questions, order.length, sliceOf]);
  /** More of the bank than this round showed — "More practice" has somewhere to go. */
  const moreAvailable = !!roundSize && questions.length > roundSize;

  const cur = order.length ? questions[order[pos]] : undefined;
  const total = order.length;
  const fullRef = (i: number) => (reference ? `${reference.topic ?? "?"}.${reference.set}.${order[i] + 1}` : `Q${order[i] + 1}`);

  // ---- analytics (stable ids, batched per event; abandon on unmount) ------------------------------
  const log = useCallback((e: AttemptEvent) => {
    void logPracticeEvents({ data: { sessionId: sessionId(), userId: userId.current, campus: campusSlug ?? campusName ?? null, surface: surface ?? null, isTest: !!isTest, events: [e] } }).catch(() => {});
  }, [campusName, campusSlug, surface, isTest]);
  const lastReached = useRef<{ setId: string; ceqId: string; pass: number } | null>(null);
  useEffect(() => { if (cur) lastReached.current = { setId, ceqId: cur.id, pass }; }, [cur, setId, pass]);
  const finishedRef = useRef(false); finishedRef.current = finished;
  // "Reached set completion state" — the guided path marks the practice step done HERE (the
  // results screen), not on the Continue click, so progress and the rail ✓ update in view.
  const finishedOnce = useRef(false);
  useEffect(() => { if (finished && !finishedOnce.current) { finishedOnce.current = true; onFinished?.(); } }, [finished, onFinished]);
  useEffect(() => {
    if (packSpotDone.current) return;
    if (finished || Object.keys(pickedBy).length >= 5) {
      packSpotDone.current = true;
      try { localStorage.setItem("sa-pack-spot", "1"); } catch { /* fine */ }
      setPackSpot(true);
    }
  }, [finished, pickedBy]);
  // Test Mode: mark step 5 the moment the "You've been through" screen renders — provided the
  // pass ran with at least one correct + one incorrect (matches the spec's completion criterion).
  useEffect(() => {
    if (!finished) return;
    const correct = Object.values(results).filter(Boolean).length;
    const wrong   = Object.values(results).filter((v) => !v).length;
    if (correct >= 1 && wrong >= 1) { void (async () => { const { markStep } = await import("@/lib/test-mode"); markStep("ceq", { correct, wrong, seen: seen.size }); })(); }
  }, [finished, results, seen]);
  useEffect(() => () => { const l = lastReached.current; if (l && !finishedRef.current) log({ setId: l.setId, ceqId: l.ceqId, event: "abandon", attemptNumber: l.pass }); }, [log]);

  // ---- navigation ---------------------------------------------------------------------------------
  const goTo = useCallback((next: number, viaStep = false) => {
    if (!total) return;
    if (next >= total) { setFinished(true); return; }
    if (next < 0) return;
    if (viaStep && cur && picked == null && !seen.has(cur.id)) log({ setId, ceqId: cur.id, event: "skip", attemptNumber: pass });
    setSwap(true);
    window.setTimeout(() => { setPos(next); setPicked(pickedBy[questions[order[next]]?.id ?? ""] ?? null); setHi(0); revealedAt.current = Date.now(); setSwap(false); }, SWAP_MS);
  }, [total, cur, picked, seen, log, setId, pass, pickedBy, questions, order]);

  // JUMP (Q navigator): any question in the set, in any order. In a retry pass the order is the
  // missed subset; jumping to a question outside it widens the pass back to the whole set.
  const jumpTo = useCallback((qIndex: number) => {
    setNavOpen(false);
    let nextOrder = order, at = order.indexOf(qIndex);
    if (at < 0) { nextOrder = questions.map((_, i) => i); at = qIndex; setOrder(nextOrder); }
    if (at === pos && nextOrder === order) return;
    setFinished(false);
    setSwap(true);
    window.setTimeout(() => { setPos(at); setPicked(pickedBy[questions[qIndex]?.id ?? ""] ?? null); setHi(0); revealedAt.current = Date.now(); setSwap(false); }, SWAP_MS);
  }, [order, pos, questions, pickedBy]);

    const lockIn = useCallback((choiceId: string) => {
    // Grading at the end, a pick can be changed until the results; resolved at once, it is final.
    if (!cur || (picked && !gradeAtEnd)) return;
    const choice = cur.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    const ms = Date.now() - revealedAt.current;
    setPicked(choiceId);
    setPickedBy((m) => ({ ...m, [cur.id]: choiceId }));
    setResults((r) => ({ ...r, [cur.id]: !!choice.correct }));
    setSeen((s) => new Set(s).add(cur.id));
    addCoverage(setId, cur.id);
    // …and whether they got it right, for the recap gate (lib/practice-score.ts)
    recordPracticeAnswer(setId, cur.id, !!choice.correct);
    log({ setId, ceqId: cur.id, event: "answer", choiceId, correct: !!choice.correct, ms, attemptNumber: pass });
        // Auto-advance ONLY after a correct answer — a wrong one sits with the right answer showing.
    if (choice.correct && autoAdvance && !gradeAtEnd) window.setTimeout(() => goTo(pos + 1), 900);
  }, [cur, picked, setId, pass, log, autoAdvance, goTo, pos, gradeAtEnd]);

  // THE RUBRIC ANSWER: every tap is the current answer (graded by learn-bonus's rubricMatches — Rev ↑ and E ↑
  // are the same answer). Kept like a pick; nothing resolves until the results.
  // IMMEDIATE MODE (Lee, 2026-09-16: "should we have immediate feedback on practice? So they know if one was
  // wrong"): the arrows are a draft until "Check answer"; then it grades like a pick and is final.
  const draftRubric = useCallback((next: RubricArrows) => { if (cur?.rubric) setRubricBy((m) => ({ ...m, [cur.id]: next })); }, [cur]);
  const setRubric = useCallback((next: RubricArrows) => {
    if (!cur?.rubric) return;
    const ok = rubricMatches(next, cur.rubric.arrows);
    setRubricBy((m) => ({ ...m, [cur.id]: next }));
    setPicked("rubric");
    setPickedBy((m) => ({ ...m, [cur.id]: "rubric" }));
    setResults((r) => ({ ...r, [cur.id]: ok }));
    setSeen((s) => new Set(s).add(cur.id));
    addCoverage(setId, cur.id);
    recordPracticeAnswer(setId, cur.id, ok);
    log({ setId, ceqId: cur.id, event: "answer", choiceId: "rubric", correct: ok, ms: Date.now() - revealedAt.current, attemptNumber: pass });
  }, [cur, setId, pass, log]);

  const advance = useCallback(() => goTo(pos + 1), [goTo, pos]);

  // Keyboard (desktop). Ignored while typing in the ask box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape" && navOpen) { e.preventDefault(); setNavOpen(false); return; }
      if (finished || !cur) return;
      if (e.key === "ArrowDown") { e.preventDefault(); if (!picked) setHi((h) => Math.min(cur.choices.length - 1, h + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (!picked) setHi((h) => Math.max(0, h - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); if (picked) advance(); else lockIn(cur.choices[hi]?.id); }
      else if (e.key === "ArrowRight") { e.preventDefault(); if (e.shiftKey) onDone(); else goTo(pos + 1, true); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(pos - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, picked, hi, finished, advance, lockIn, goTo, pos, onDone, navOpen]);

  // Swipe (mobile).
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0]?.clientX ?? null; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const x0 = touchX.current; touchX.current = null;
    if (x0 == null || finished) return;
    const dx = (e.changedTouches[0]?.clientX ?? x0) - x0;
    if (dx < -60) goTo(pos + 1, true); else if (dx > 60) goTo(pos - 1);
  };

  // ---- end of set → retry the missed ones ---------------------------------------------------------
    const missedIdx = useMemo(() => order.filter((i) => results[questions[i]?.id] === false), [order, results, questions]);
  const retryMissed = () => {
    track("retry_missed_clicked", { set_id: setId } as never);
    setPickedBy((m) => { const n = { ...m }; for (const i of missedIdx) delete n[questions[i]?.id ?? ""]; return n; });
    setRubricBy((m) => { const n = { ...m }; for (const i of missedIdx) delete n[questions[i]?.id ?? ""]; return n; });
    setOrder(missedIdx); setPass((p) => p + 1); setPos(0); setPicked(null); setHi(0); setFinished(false); revealedAt.current = Date.now();
  };
  /** A fresh pass over a list of question indexes — the round again, or the next slice. */
  const startPass = (idx: number[]) => {
    setPickedBy((m) => { const n = { ...m }; for (const i of idx) delete n[questions[i]?.id ?? ""]; return n; });
    setRubricBy((m) => { const n = { ...m }; for (const i of idx) delete n[questions[i]?.id ?? ""]; return n; });
    setOrder(idx); setPass((p) => p + 1); setPos(0); setPicked(null); setHi(0); setFinished(false); revealedAt.current = Date.now();
  };
  // GRADED AT THE END: the whole set's tally (every pass counts; a question answered again replaces its mark).
  const missedAll = useMemo(() => questions.map((q, i) => (results[q.id] === false ? i : -1)).filter((i) => i >= 0), [questions, results]);
  const skippedAll = useMemo(() => questions.map((q, i) => (results[q.id] === undefined ? i : -1)).filter((i) => i >= 0), [questions, results]);
  const correctAll = useMemo(() => questions.filter((q) => results[q.id] === true).length, [questions, results]);
  const startOver = () => { setResults({}); startPass(questions.map((_, i) => i)); };
  const retryRound = () => startPass(order);
  const morePractice = () => {
    const size = roundSize ?? questions.length;
    let next = roundStart + size;
    if (next >= questions.length) next = 0; // the bank is used up — round again from the top
    setRoundStart(next);
    startPass(sliceOf(next));
  };

  // ---- states with a way forward -----------------------------------------------------------------
  if (!override && q.isLoading) return <div className="grid h-full w-full place-items-center text-[12px]" style={{ color: C.muted }}><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span></div>;
  const blocked = !override && q.isError ? "Couldn't load this set — check your connection." : !override && q.data?.status === "locked" ? "This set's practice is part of the paid exam." : questions.length === 0 ? "No practice questions in this set yet." : null;
  if (blocked) return (
    <div className="grid h-full w-full place-items-center p-6 text-center"><div>
      <p className="text-[12.5px] font-semibold" style={{ color: C.muted }}>{blocked}</p>
      {!override && q.isError && <button className="mt-2 rounded-lg px-3 py-1.5 text-[11.5px] font-black uppercase tracking-wide" style={{ background: C.yellow, color: "#0B1322" }} onClick={() => void q.refetch()}>Retry</button>}
      <button className="mt-3 block w-full rounded-xl px-4 py-2.5 text-[12.5px] font-black uppercase tracking-wide" style={{ background: C.yellow, color: "#0B1322" }} onClick={onDone}>{doneLabel}</button>
    </div></div>
  );

    // THE SCORE SCREEN: graded at the end, or graded at once with a bonus to unlock — the pass IS the score
    // (Lee, 2026-09-16: "when it comes to getting 80% … You'd have to finish then start over"): missed ones can be
    // looked at, not re-answered; Try again starts a fresh pass.
    if (finished && (gradeAtEnd || bonus)) {
    const total = questions.length, answered = total - skippedAll.length;
    const pct = total > 0 ? Math.round((correctAll / total) * 100) : 0;
    const redo = [...new Set([...missedAll, ...skippedAll])].sort((a, b) => a - b);
    const unlocked = passed({ answered, correct: correctAll, at: 0 }, total);
    const clean = redo.length === 0;
    const label = (i: number) => { const q = questions[i]; const p = (q?.shorthand || q?.prompt || "").replace(/\s+/g, " ").trim(); return p.length > 64 ? `${p.slice(0, 62)}…` : p; };
    return (
      <div className="flex h-full w-full flex-col p-5" style={{ color: C.text }}>
        <div className="mx-auto w-full max-w-sm">
          <div className="text-[10.5px] font-black uppercase tracking-[0.14em]" style={{ color: C.yellow }}>Results · {fmtElapsed(Date.now() - startedAt.current)}</div>
          <div className="mt-1 flex items-baseline gap-2" style={{ fontFamily: "'League Spartan', 'Rubik', system-ui, sans-serif" }}>
            <span style={{ fontSize: 40, fontWeight: 900, lineHeight: 1 }}>{correctAll}<span style={{ fontSize: 20, color: C.muted }}>/{total}</span></span>
            <span style={{ fontSize: 20, fontWeight: 900, color: unlocked ? C.green : pct >= 60 ? C.yellow : C.red }}>{pct}%</span>
            {skippedAll.length > 0 && <span className="text-[12px]" style={{ color: C.muted }}>· {skippedAll.length} skipped</span>}
          </div>
          {unlocked && bonus && (
            <button type="button" onClick={bonus.onOpen} className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left" style={{ background: "rgba(59,245,160,0.10)", border: `1px solid rgba(59,245,160,0.55)`, color: C.text, minHeight: 48 }}>
              <span className="text-[13.5px] font-black"><CircleCheck className="mr-1.5 inline h-4 w-4" style={{ color: C.green }} /> Bonus unlocked</span>
              <span className="text-[12px] font-bold" style={{ color: C.green }}>Open it →</span>
            </button>
          )}
          {!unlocked && <p className="mt-2 text-[12.5px]" style={{ color: C.muted }}>{clean ? "Clean pass." : bonus ? `80% opens the bonus. ${redo.length} to go back over.` : `${redo.length} to go back over — run them until they're automatic.`}</p>}
          {redo.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5" style={{ maxHeight: 220, overflowY: "auto" }}>
              {redo.map((i) => (
                <button key={i} type="button" onClick={() => jumpTo(i)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px]" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.text, minHeight: 40 }}>
                  <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded" style={{ background: results[questions[i]?.id] === false ? "rgba(255,92,110,0.2)" : "rgba(255,255,255,0.08)", color: results[questions[i]?.id] === false ? C.red : C.muted, fontSize: 10.5, fontWeight: 800 }}>{results[questions[i]?.id] === false ? <CircleX className="h-3.5 w-3.5" /> : "–"}</span>
                  <span className="min-w-0 flex-1 truncate">Q{i + 1} · {label(i)}</span>
                </button>
              ))}
            </div>
          )}
          {redo.length > 0 && !gradeAtEnd ? (
            <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-black uppercase tracking-wide" style={{ background: unlocked ? C.yellow : C.red, color: unlocked ? "#0B1322" : "#fff", minHeight: 50 }} onClick={() => { track("retry_missed_clicked", { set_id: setId } as never); startOver(); }}>
              <RotateCcw className="h-4 w-4" /> Try again from the top
            </button>
          ) : redo.length > 0 ? (
            <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-black uppercase tracking-wide" style={{ background: C.red, color: "#fff", minHeight: 50 }} onClick={() => { track("retry_missed_clicked", { set_id: setId } as never); startPass(redo); }}>
              <RotateCcw className="h-4 w-4" /> Redo the {redo.length} you {skippedAll.length && !missedAll.length ? "skipped" : "missed"}
            </button>
          ) : (
            <button className="mt-3 w-full rounded-xl px-4 py-3 text-[13.5px] font-black uppercase tracking-wide" style={{ background: C.yellow, color: "#0B1322", minHeight: 50 }} onClick={guidance ? guidance.onNext : onDone}>{guidance?.nextLabel ?? doneLabel}</button>
          )}
          <div className="mt-2 flex items-center justify-center gap-4">
            {(gradeAtEnd || redo.length === 0) && <button className="px-2 py-2 text-[12px] font-bold underline underline-offset-2" style={{ color: C.muted, minHeight: 40 }} onClick={startOver}>{redo.length > 0 ? "or start over" : "Start over"}</button>}
            {redo.length > 0 && <button className="px-2 py-2 text-[12px] font-bold underline underline-offset-2" style={{ color: C.muted, minHeight: 40 }} onClick={guidance ? guidance.onNext : onDone}>{guidance?.nextLabel ?? doneLabel}</button>}
          </div>
        </div>
      </div>
    );
  }
  if (finished) {
    const n = order.length, m = missedIdx.length, rough = m > 0 && m >= Math.ceil(n / 3);
    return (
      <div className="grid h-full w-full place-items-center p-5 text-center" style={{ color: C.text }}>
        <div className="w-full max-w-sm">
          <div className="text-[10.5px] font-black uppercase tracking-[0.14em]" style={{ color: C.yellow }}>{pass > 1 ? `Pass ${pass}` : "First pass"} · {fmtElapsed(Date.now() - startedAt.current)}</div>
          <p className="mt-1.5 text-[17px] font-black">You've been through {n} of {n}{m > 0 ? ` · ${m} to review` : ""}</p>
          <p className="mt-1 text-[12.5px]" style={{ color: C.muted }}>{m === 0 ? "Clean pass. Keep the momentum — next set." : rough ? "First pass is always rough — that's the point. Run the missed ones again." : "Close. Run the ones you missed until they're automatic."}</p>
          {guidance ? (
            // THE RECOMMENDED NEXT ACTION: one dominant button, its "Recommended" label above it,
            // the others quieter in rank — never four equal buttons.
            <>
              <div className="mt-4 text-[10.5px] font-black uppercase tracking-[0.14em]" style={{ color: C.green }}>Recommended</div>
              {m > 0 ? (
                <button className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-black uppercase tracking-wide" style={{ background: C.yellow, color: "#0B1322", minHeight: 48 }} onClick={retryMissed}><RotateCcw className="h-4 w-4" /> Retry missed ({m})</button>
              ) : (
                <button className="mt-1 w-full rounded-xl px-4 py-3 text-[13px] font-black uppercase tracking-wide" style={{ background: C.yellow, color: "#0B1322", minHeight: 48 }} onClick={guidance.onNext}>{guidance.nextLabel}</button>
              )}
              {m > 0 ? (
                <button className="mt-2 w-full rounded-xl px-4 py-2.5 text-[12.5px] font-black uppercase tracking-wide" style={{ background: "rgba(245,239,230,0.1)", color: C.text, minHeight: 44 }} onClick={guidance.onNext}>{guidance.nextLabel}</button>
              ) : (
                <button className="mt-2 w-full rounded-xl px-4 py-2.5 text-[12.5px] font-black uppercase tracking-wide" style={{ background: "rgba(245,239,230,0.1)", color: C.text, minHeight: 44 }} onClick={moreAvailable ? morePractice : retryRound}>{moreAvailable ? "More practice" : "Retry round"}</button>
              )}
              <div className="mt-2 flex items-center justify-center gap-4">
                {m > 0 && moreAvailable && <button className="px-2 py-2 text-[12px] font-bold underline underline-offset-2" style={{ color: C.muted, minHeight: 40 }} onClick={morePractice}>More practice</button>}
                {m > 0 && <button className="px-2 py-2 text-[12px] font-bold underline underline-offset-2" style={{ color: C.muted, minHeight: 40 }} onClick={retryRound}>Retry all</button>}
                {m === 0 && moreAvailable && <button className="px-2 py-2 text-[12px] font-bold underline underline-offset-2" style={{ color: C.muted, minHeight: 40 }} onClick={retryRound}>Retry round</button>}
              </div>
            </>
          ) : (
            <>
              {m > 0 && <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-black uppercase tracking-wide" style={{ background: C.yellow, color: "#0B1322", minHeight: 46 }} onClick={retryMissed}><RotateCcw className="h-4 w-4" /> Retry the {m} you missed →</button>}
              <button className="mt-2 w-full rounded-xl px-4 py-2.5 text-[12.5px] font-black uppercase tracking-wide" style={{ background: m > 0 ? "rgba(245,239,230,0.1)" : C.yellow, color: m > 0 ? C.text : "#0B1322", minHeight: 44 }} onClick={onDone}>{doneLabel}</button>
              {onReview && <button className="mt-2 w-full rounded-xl px-4 py-2 text-[12px] font-bold" style={{ color: C.yellow, border: `1px solid ${C.border}`, minHeight: 44 }} onClick={onReview}>Review with Lee →</button>}
            </>
          )}
          {pathAdvance && <FinishAutoAdvance key={pass} label={pathAdvance.label} onContinue={pathAdvance.onContinue} />}
        </div>
      </div>
    );
  }
  if (!cur) return null;

  // ---- one question ---------------------------------------------------------------------------------
    const pickedChoice = picked ? cur.choices.find((c) => c.id === picked) ?? null : null;
  // Graded at the end, a pick is kept but never resolved on the card.
  const resolved = !!picked && !gradeAtEnd;
  const canAdvance = resolved || (gradeAtEnd && !!picked);
  return (
    <div className="relative flex h-full w-full flex-col" style={{ color: C.text, background: C.bg }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <style>{CHOICE_CSS}</style>
      {/* QUESTION HEADER — "Q1 / 8" and the status pill. The curriculum reference (3.2.14) is
          NOT shown to students: it rides into analytics and Ask-Lee submissions only. Keyboard
          shortcuts still work (↑↓ ⏎ ←→, Shift+→) without a hint strip. */}
      {/* HEADER — retry label / save chip / status pill only. The question counter
          moved BELOW the choices (free-surf nav): one counter, not two. */}
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 sm:px-5">
        {pass > 1 && <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>Retry · {pos + 1} of {total}</span>}
        {/* SAVE PROGRESS chip — signed-out students see it once they have something worth saving
            (at least one answer in this session); a signed-in student sees a small green mark. */}
        {onSaveProgress && Object.keys(pickedBy).length >= 1 && !authed && (
          <button
            type="button"
            onClick={onSaveProgress}
            aria-label="Save my progress"
            className="ml-2 inline-flex items-center gap-1 rounded-full px-2 text-[10px] font-black uppercase tracking-wider"
            style={{ minHeight: 24, color: C.yellow, border: `1px solid rgba(252,163,17,0.45)`, background: "rgba(252,163,17,0.08)" }}
          >
            <span aria-hidden>🔖</span>
            <span>Save</span>
          </button>
        )}
        {authed && Object.keys(pickedBy).length >= 1 && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full px-2 text-[10px] font-black uppercase tracking-wider" title="Signed in — your progress saves automatically." style={{ minHeight: 24, color: C.green, background: "rgba(59,245,160,0.10)", border: `1px solid rgba(59,245,160,0.35)` }}>
            <span aria-hidden>✓</span>
            <span>Saved</span>
          </span>
        )}
        {statusLabel && <span className="ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider" style={{ background: C.yellow, color: "#0B1322" }}>{statusLabel}</span>}
        {!statusLabel && <span className="ml-auto" />}
        {/* THE PRINTABLE PACK icon is off for now (Lee, 2026-09-16: "remove print icon for now. We will add
            that back later") — LeadMagnetGate + requestPracticePack stay for its return. */}
        {void packSpot}
      </div>

      {navOpen && (
        <QuestionNav
          questions={questions}
          currentIndex={order[pos]}
          results={results}
          answered={pickedBy}
          onJump={jumpTo}
          onClose={() => setNavOpen(false)}
          onSaveProgress={!authed ? onSaveProgress : undefined}
        />
      )}

      {/* THE CARD — swaps in place in ~120ms */}
      <div className="min-h-0 flex-1 px-4 pb-3 pt-3 sm:px-5 sm:pb-4" style={{ opacity: swap ? 0 : 1, transform: swap ? "translateX(8px)" : "none", transition: `opacity ${SWAP_MS}ms ease, transform ${SWAP_MS}ms ease` }}>
                {/* THE QUESTION, in the school picker's voice (Lee, 2026-09-15: "they're not easy to read… it needs to
            match the vibe of the school picker"): the ask big and cream, each answer a lettered row. */}
                <p className="lk-disp" style={{ fontSize: 19, lineHeight: 1.25, color: C.text, textWrap: "balance" }}>{cur.rubric ? cur.rubric.text : cur.prompt}</p>
        {cur.rubric ? (
          // THE RUBRIC QUESTION: tap the boxes; Rev / Exp light Equity on their own; the amount rides the arrows.
          // Graded at the end it is the answer as tapped; graded at once it is a draft until Check answer.
          <div className="mt-3">
            <p className="mb-2 text-[12.5px]" style={{ color: C.muted }}>{resolved ? (results[cur.id] ? "✓ That's the effect." : "✕ Not quite — the answer is below.") : "Effect on A = L + E? Tap the boxes — tap again to change the arrow."}</p>
            <RubricAnswer value={rubricBy[cur.id] ?? emptyArrows()} onChange={gradeAtEnd ? setRubric : draftRubric} amount={cur.rubric.amount} readOnly={resolved} />
            {!gradeAtEnd && !resolved && (
              <button type="button" className="mt-3 w-full rounded-xl px-4 py-2.5 text-[12.5px] font-black uppercase tracking-wide" style={{ background: "#FCA311", color: "#0B1322", minHeight: 44 }} onClick={() => setRubric(rubricBy[cur.id] ?? emptyArrows())}>Check answer</button>
            )}
            {resolved && results[cur.id] === false && (
              <div className="mt-3"><RubricAnswer value={cur.rubric.arrows} amount={cur.rubric.amount} readOnly compact /></div>
            )}
          </div>
        ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {cur.choices.map((c, i) => {
            const isPicked = picked === c.id;
            const showRight = resolved && c.correct;
            const showWrong = resolved && isPicked && !c.correct;
            const highlighted = (!resolved && !picked && hi === i) || (gradeAtEnd && isPicked);
            return (
              <button
                key={c.id}
                onClick={() => lockIn(c.id)}
                onMouseEnter={() => { if (!resolved) setHi(i); }}
                disabled={resolved}
                className={`sa-choice flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left${isPicked ? " sa-pulse" : ""}`}
                style={{
                  minHeight: 54, color: C.text, fontSize: 15.5, fontWeight: 600, lineHeight: 1.3,
                  background: showRight ? "rgba(59,245,160,0.16)" : showWrong ? "rgba(255,92,110,0.16)" : highlighted ? "rgba(252,163,17,0.14)" : C.card,
                  border: `1.5px solid ${showRight ? "rgba(59,245,160,0.8)" : showWrong ? "rgba(255,92,110,0.8)" : highlighted ? "#FCA311" : C.cardEdge}`,
                  boxShadow: highlighted && !resolved ? "0 6px 18px -10px rgba(252,163,17,0.8)" : "none",
                  textDecoration: showWrong ? "line-through" : "none",
                  transition: "background 120ms, border-color 120ms, box-shadow 120ms",
                }}
              >
                <span aria-hidden className="grid shrink-0 place-items-center rounded-lg" style={{
                  width: 28, height: 28, fontSize: 12.5, fontWeight: 800,
                  background: showRight ? "rgba(59,245,160,0.22)" : showWrong ? "rgba(255,92,110,0.22)" : C.chip,
                  color: showRight ? C.green : showWrong ? C.red : highlighted ? C.yellow : C.muted,
                  border: `1px solid ${showRight ? "rgba(59,245,160,0.5)" : showWrong ? "rgba(255,92,110,0.5)" : C.chipEdge}`,
                }}>{showRight ? <CircleCheck className="h-4 w-4" /> : showWrong ? <CircleX className="h-4 w-4" /> : String.fromCharCode(65 + i)}</span>
                                <span className="min-w-0">{c.text}</span>
              </button>
            );
          })}
        </div>
        )}
        {resolved && (
          <div className="mt-3">
            {/* Feedback is a quiet note, not another card. */}
            {picked !== "rubric" && (
              <p className="px-1 text-[12px] leading-relaxed" style={{ color: C.muted }}>
                {pickedChoice?.feedback ?? (pickedChoice?.correct ? "✓ Correct!" : "✕ Not quite — the right one is marked.")}
              </p>
            )}
            <AskBox reference={fullRef(pos)} shorthand={cur.shorthand} prompt={cur.prompt} setId={setId} ceqId={cur.id} campusName={campusName} campusSlug={campusSlug} isTest={isTest} />
          </div>
        )}

        {/* THE COUNTER — centered below the choices, < and > flanking. Always
            visible: students surf freely without answering (← / → mirror the
            buttons; selection state per question is preserved). No < on the
            first question; > on the last follows the existing set-advance
            behavior (the completion screen, which leads on). The counter is
            still the set-map trigger. */}
        <div className="mt-4 flex items-center justify-center gap-3">
          {pos > 0 ? (
            <button
              type="button"
              aria-label="Previous question"
              className="rounded-full px-3 text-[15px] font-black"
              style={{ color: C.muted, border: `1px solid ${C.border}`, minHeight: 32, minWidth: 40 }}
              onClick={() => goTo(pos - 1)}
            >
              ‹
            </button>
          ) : (
            <span aria-hidden style={{ minWidth: 40 }} />
          )}
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={navOpen}
            aria-label={`Question ${order[pos] + 1} of ${questions.length}. Open question navigator`}
            className="flex items-center gap-1 rounded-full px-3 py-0.5 text-[11.5px] font-black uppercase tracking-wider tabular-nums"
            style={{ background: C.yellow, color: "#0B1322", minHeight: 30 }}
          >
            Q{order[pos] + 1} / {questions.length}
            <span aria-hidden style={{ fontSize: 9, marginLeft: 2 }}>{navOpen ? "▴" : "▾"}</span>
          </button>
          <button
            type="button"
            aria-label={pos + 1 < total ? "Next question" : "Finish set"}
            className="rounded-full px-3 text-[15px] font-black"
            style={{ color: C.muted, border: `1px solid ${C.border}`, minHeight: 32, minWidth: 40 }}
            onClick={() => goTo(pos + 1, true)}
          >
            ›
          </button>
        </div>
      </div>

      {/* MOBILE NEXT — thumb-reachable, FIXED to the viewport bottom (the player card is
          overflow-hidden, so sticky can't reach the viewport). Only renders once a question is
          resolved, so it never covers the choices. Desktop: static under the card, ⏎ also works. */}
            {canAdvance && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-[linear-gradient(0deg,rgba(5,8,16,0.96)_60%,rgba(5,8,16,0)_100%)] p-3 sm:static sm:bg-none sm:p-0 sm:px-5 sm:pb-4">
          <button className="w-full rounded-xl text-[14px] font-black uppercase tracking-wide sm:text-[12.5px]" style={{ background: C.yellow, color: "#0B1322", minHeight: 48 }} onClick={advance}>
            {pos + 1 < total ? "Next →" : "Finish set →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- FINISH AUTO-ADVANCE — the guided path's conservative countdown. The results screen owns
//      the first ~3 seconds untouched; then a single quiet line counts 5→0 and continues. "Stay
//      here" (or Retry, which remounts via key={pass}) cancels it for this screen. -----------------
function FinishAutoAdvance({ label, onContinue }: { label: string; onContinue: () => void }) {
  const C = useContext(PaletteContext);
  const [phase, setPhase] = useState<"wait" | "count" | "off">("wait");
  const [left, setLeft] = useState(5);
  useEffect(() => {
    if (phase !== "wait") return;
    const t = window.setTimeout(() => { setPhase("count"); track("path_auto_advance_shown", { where: "practice_done" } as never); }, 3000);
    return () => window.clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== "count") return;
    if (left <= 0) { track("path_auto_advanced", { where: "practice_done" } as never); onContinue(); return; }
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [phase, left, onContinue]);
  if (phase !== "count") return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-3 text-[12px]" style={{ color: C.muted }} aria-live="polite">
      <span>Continuing in {left}…</span>
      <button type="button" className="font-black" style={{ color: C.yellow, minHeight: 32 }} onClick={() => { track("path_auto_advanced", { where: "practice_done", manual: true } as never); onContinue(); }}>Continue now</button>
      <button type="button" className="font-bold" style={{ minHeight: 32 }} onClick={() => { setPhase("off"); track("path_auto_advance_paused", { where: "practice_done" } as never); }}>Stay here</button>
    </div>
  );
}

// ---- QUESTION NAVIGATOR — every position in the set, with the CURRENT SESSION's status:
//      unattempted (neutral) · correct (green + check) · incorrect (red + X). Current question
//      is outlined independently of its state. Click any tile to jump; never linear-only. ----------
function QuestionNav({ questions, currentIndex, results, answered, onJump, onClose, onSaveProgress }: {
  questions: PracticeQuestion[]; currentIndex: number; results: Record<string, boolean>; answered: Record<string, string>;
  onJump: (qIndex: number) => void; onClose: () => void; onSaveProgress?: () => void;
}) {
  const C = useContext(PaletteContext);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", onDown); document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [onClose]);
  const done = questions.filter((q) => answered[q.id]).length;
  return (
    <div ref={ref} role="dialog" aria-label="Set progress" className="mx-4 mt-2 rounded-xl p-3 sm:mx-5" style={{ background: "#0b1020", border: `1px solid ${C.border}`, boxShadow: "0 16px 40px -20px rgba(0,0,0,0.8)" }}>
      <div className="mb-2 flex items-center gap-2 text-[10.5px] font-black uppercase tracking-[0.12em]" style={{ color: C.muted }}>
        <span>Set progress</span>
        <span className="font-bold normal-case tracking-normal tabular-nums">{done} of {questions.length} answered</span>
        <button type="button" aria-label="Close" className="ml-auto grid h-7 w-7 place-items-center rounded-full hover:bg-white/10" style={{ color: C.muted }} onClick={onClose}><span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span></button>
      </div>
      {/* Save my progress → sits under the grid, right under the "N of M answered" line the student
          just read. Kept small; the numbers stay the star of the panel. */}
      {onSaveProgress && (
        <div className="mb-2 flex items-center justify-end">
          <button type="button" onClick={() => { onSaveProgress(); onClose(); }} className="rounded-lg px-2 py-1 text-[11.5px] font-black" style={{ minHeight: 32, color: C.yellow }}>
            Save my progress →
          </button>
        </div>
      )}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))" }}>
        {questions.map((q, i) => {
          const state = answered[q.id] ? (results[q.id] ? "correct" : "incorrect") : "unattempted";
          const isCur = i === currentIndex;
          const bg = state === "correct" ? "rgba(59,245,160,0.16)" : state === "incorrect" ? "rgba(255,92,110,0.16)" : C.panel;
          const fg = state === "correct" ? C.green : state === "incorrect" ? C.red : C.text;
          const border = isCur ? C.yellow : state === "correct" ? "rgba(59,245,160,0.6)" : state === "incorrect" ? "rgba(255,92,110,0.6)" : C.border;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onJump(i)}
              aria-current={isCur ? "true" : undefined}
              aria-label={`Question ${i + 1}, ${state === "unattempted" ? "not attempted" : state}${isCur ? ", current" : ""}`}
              title={`Q${i + 1} · ${state === "unattempted" ? "not attempted" : state}`}
              className="flex items-center justify-center gap-0.5 rounded-lg text-[12.5px] font-black tabular-nums"
              style={{ minHeight: 44, minWidth: 44, background: bg, color: fg, border: `${isCur ? 2 : 1}px solid ${border}`, boxShadow: isCur ? `0 0 0 2px rgba(252,163,17,0.25)` : "none" }}
            >
              {i + 1}
              {state === "correct" && <CircleCheck aria-hidden className="h-3.5 w-3.5" />}
              {state === "incorrect" && <CircleX aria-hidden className="h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- "Ask Lee about this question" — asking now asks for an email FIRST: a fair trade for
//      Lee's time, and the first soft identity bridge. If we already have an address for this
//      visitor (they subscribed or asked before — sa-student-email, see lib/student-email —
//      or they're signed in), the field doesn't appear and questions submit as before. No
//      password, no account, no verification email: the identity ladder stays parked; this is
//      a mailbox, not an auth system. The reference (3.2.14) + shorthand still ride INTO the
//      submission (source-tagged "ask-lee") but are never shown. Closable with ×; typed text
//      survives a close/reopen (the collapsed control says "(draft)"). -------------
function AskBox({ reference, shorthand, prompt, setId, ceqId, campusName, campusSlug, isTest }: { reference: string; shorthand: string | null; prompt: string; setId: string; ceqId: string; campusName?: string | null; campusSlug?: string | null; isTest?: boolean }) {
  const C = useContext(PaletteContext);
  const [open, setOpen] = useState(false);
  // AskBox only mounts after an answer resolves (a client interaction), so reading storage in
  // the initializer cannot cause a hydration mismatch. On the server it just yields null.
  const [knownEmail, setKnownEmail] = useState<string | null>(() => readStudentEmail());
  const [email, setEmail] = useState(() => readStudentEmail() ?? "");
  // "change" reopens the field for someone whose remembered address is stale.
  const [changing, setChanging] = useState(false);
  const [msg, setMsg] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  useEffect(() => { setOpen(false); setMsg(""); setState("idle"); }, [ceqId]);
  // A signed-in student's session email counts as known — they already handed it over for the
  // magic link, and asking again would be the exact friction this change removes.
  useEffect(() => {
    if (knownEmail) return;
    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      const e = (data.session?.user?.email ?? "").trim();
      if (live && e) { setKnownEmail(e); setEmail(e); }
    }).catch(() => { /* signed out — the field asks */ });
    return () => { live = false; };
  }, [knownEmail]);
  const askEmail = !knownEmail || changing;
  const send = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || !msg.trim()) { setState("error"); return; }
    setState("busy");
    try {
      rememberStudentEmail(email.trim());
      await askAboutQuestion({ data: { email: email.trim(), message: msg.trim(), reference, shorthand, prompt, setId, ceqId, campusName: campusName ?? null, campusSlug: campusSlug ?? null, isTest: !!isTest } });
      setKnownEmail(email.trim());
      setChanging(false);
      setState("sent");
    } catch (e) { console.warn("ask failed", e); setState("error"); }
  };
  if (state === "sent") return <p className="mt-2 px-1 text-[12px] font-semibold" style={{ color: C.green }}>Got it. I answer between filming sessions — check your email. ⚡</p>;
  if (!open) {
    return (
      <button className="mt-2 flex items-center gap-1.5 px-1 text-[12px] font-bold" style={{ color: C.yellow, minHeight: 32 }} onClick={() => setOpen(true)}>
        <MessageCircle className="h-3.5 w-3.5" /> Ask Lee about this question{msg.trim() ? " (draft)" : ""}
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-xl p-3" style={{ border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)" }}>
      <div className="flex items-center gap-2">
        <MessageCircle className="h-3.5 w-3.5 shrink-0" style={{ color: C.yellow }} />
        <span className="text-[12.5px] font-black" style={{ color: C.text }}>Ask Lee about this question</span>
        <button type="button" aria-label="Close" title="Close" className="ml-auto grid h-7 w-7 place-items-center rounded-full hover:bg-white/10" style={{ color: C.muted }} onClick={() => setOpen(false)}><span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span></button>
      </div>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="How can I help?" className="mt-2 w-full rounded-lg px-3 py-2 text-[13px] outline-none" style={{ background: "#0e131b", color: C.text, border: `1px solid ${C.border}` }} />
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        {askEmail && (
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="Leave an email so I can answer you" className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[13px] outline-none" style={{ background: "#0e131b", color: C.text, border: `1px solid ${C.border}`, minHeight: 44 }} />
        )}
        <button disabled={state === "busy"} onClick={() => void send()} className={`rounded-lg px-4 text-[12px] font-black uppercase tracking-wide disabled:opacity-50${askEmail ? "" : " flex-1 sm:flex-none sm:ml-auto"}`} style={{ background: C.yellow, color: "#0B1322", minHeight: 44 }}>{state === "busy" ? "…" : "Send"}</button>
      </div>
      {/* The address is used, so it is SHOWN — silently mailing a stored value would be the
          creepy version of convenient. One quiet line, one way to change it. */}
      {!askEmail && (
        <p className="mt-1.5 px-0.5 text-[11px]" style={{ color: C.muted }}>
          I&apos;ll answer at {knownEmail}
          <button type="button" className="ml-1.5 underline underline-offset-2" style={{ color: C.yellow }} onClick={() => setChanging(true)}>change</button>
        </p>
      )}
      {state === "error" && <p className="mt-1.5 text-[11px]" style={{ color: "#F3C6CC" }}>{askEmail ? "Add a message and a real email so I can answer you." : "Add a message so I know what to answer."}</p>}
    </div>
  );
}
