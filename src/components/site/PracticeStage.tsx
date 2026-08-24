// CRAM MODE (08-21) — the Practice stage of Cram → Practice → Review, shared by the homepage
// player and /learn. Keyboard-first on desktop (↑↓ highlight, ⏎ lock-in / advance, ←→ step,
// Shift+→ next set), tap-first on mobile (tap a row to lock in, big Next, swipe to step). Cards
// swap in place in ~120ms; no spinners, no layout shift. Resolution is a silent green/red resolve
// (the sfx engine is filming-side only — students never hear it). PROGRESS, NOT SCORES: nothing here reads as
// a grade — the end of a set counts questions seen and how many to run again, and a cram tool
// brings the missed ones back. Every answer/skip/abandon logs to practice_attempts (stable ids).
// Questions come from fetchSetPractice (or are passed in for demo).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleX, Loader2, MessageCircle, RotateCcw } from "lucide-react";

import { fetchSetPractice, type PracticeQuestion } from "@/lib/student.functions";
import { askAboutQuestion, logPracticeEvents, type AttemptEvent } from "@/lib/practice.functions";
import { supabase } from "@/integrations/supabase/client";

const C = { text: "#E8ECF5", muted: "#93A0B4", yellow: "#FCA311", green: "#3BF5A0", red: "#FF5C6E", border: "rgba(148,163,190,0.16)", panel: "rgba(9,14,26,0.6)" };
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
  /** Auth state, controlled by the surface. When false, Save my progress is surfaced contextually
   *  (a small chip next to Q# after the first answer + a link in the Q navigator). */
  authed?: boolean;
  onSaveProgress?: () => void;
}

export function PracticeStage({ setId, questions: override, onDone, doneLabel, onReview, reference, campusName, campusSlug, surface, isTest, statusLabel = "Practice", authed = false, onSaveProgress }: PracticeStageProps) {
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
  const [navOpen, setNavOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [finished, setFinished] = useState(false);
  const [swap, setSwap] = useState(false);
  // Auto-advance after a CORRECT answer only. No visible toggle any more (header stays clean);
  // it can still be switched on via localStorage sa-cram-auto=1.
  const [autoAdvance] = useState(() => { try { return localStorage.getItem("sa-cram-auto") === "1"; } catch { return false; } });
  const startedAt = useRef(Date.now());
  const revealedAt = useRef(Date.now());
  const userId = useRef<string | null>(null);
  const touchX = useRef<number | null>(null);
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => { userId.current = data.session?.user?.id ?? null; }); }, []);
  useEffect(() => { if (questions.length && order.length === 0) setOrder(questions.map((_, i) => i)); }, [questions, order.length]);

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
    if (!cur || picked) return;
    const choice = cur.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    const ms = Date.now() - revealedAt.current;
    setPicked(choiceId);
    setPickedBy((m) => ({ ...m, [cur.id]: choiceId }));
    setResults((r) => ({ ...r, [cur.id]: !!choice.correct }));
    setSeen((s) => new Set(s).add(cur.id));
    addCoverage(setId, cur.id);
    log({ setId, ceqId: cur.id, event: "answer", choiceId, correct: !!choice.correct, ms, attemptNumber: pass });
    // Auto-advance ONLY after a correct answer — a wrong one sits with the right answer showing.
    if (choice.correct && autoAdvance) window.setTimeout(() => goTo(pos + 1), 900);
  }, [cur, picked, setId, pass, log, autoAdvance, goTo, pos]);

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
    setPickedBy((m) => { const n = { ...m }; for (const i of missedIdx) delete n[questions[i]?.id ?? ""]; return n; });
    setOrder(missedIdx); setPass((p) => p + 1); setPos(0); setPicked(null); setHi(0); setFinished(false); revealedAt.current = Date.now();
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

  if (finished) {
    const n = order.length, m = missedIdx.length, rough = m > 0 && m >= Math.ceil(n / 3);
    return (
      <div className="grid h-full w-full place-items-center p-5 text-center" style={{ color: C.text }}>
        <div className="w-full max-w-sm">
          <div className="text-[10.5px] font-black uppercase tracking-[0.14em]" style={{ color: C.yellow }}>{pass > 1 ? `Pass ${pass}` : "First pass"} · {fmtElapsed(Date.now() - startedAt.current)}</div>
          <p className="mt-1.5 text-[17px] font-black">You've been through {n} of {n}{m > 0 ? ` · ${m} to review` : ""}</p>
          <p className="mt-1 text-[12.5px]" style={{ color: C.muted }}>{m === 0 ? "Clean pass. Keep the momentum — next set." : rough ? "First pass is always rough — that's the point. Run the missed ones again." : "Close. Run the ones you missed until they're automatic."}</p>
          {m > 0 && <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-black uppercase tracking-wide" style={{ background: C.yellow, color: "#0B1322", minHeight: 46 }} onClick={retryMissed}><RotateCcw className="h-4 w-4" /> Retry the {m} you missed →</button>}
          <button className="mt-2 w-full rounded-xl px-4 py-2.5 text-[12.5px] font-black uppercase tracking-wide" style={{ background: m > 0 ? "rgba(245,239,230,0.1)" : C.yellow, color: m > 0 ? C.text : "#0B1322", minHeight: 44 }} onClick={onDone}>{doneLabel}</button>
          {onReview && <button className="mt-2 w-full rounded-xl px-4 py-2 text-[12px] font-bold" style={{ color: C.yellow, border: `1px solid ${C.border}`, minHeight: 44 }} onClick={onReview}>Review with Lee →</button>}
        </div>
      </div>
    );
  }
  if (!cur) return null;

  // ---- one question ---------------------------------------------------------------------------------
  const pickedChoice = picked ? cur.choices.find((c) => c.id === picked) ?? null : null;
  const resolved = !!picked;
  return (
    <div className="relative flex h-full w-full flex-col" style={{ color: C.text }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* QUESTION HEADER — "Q1 / 8" and the status pill. The curriculum reference (3.2.14) is
          NOT shown to students: it rides into analytics and Ask-Lee submissions only. Keyboard
          shortcuts still work (↑↓ ⏎ ←→, Shift+→) without a hint strip. */}
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 sm:px-5">
        {/* Q1 / 8 is the NAVIGATOR trigger — opens the set map (QuestionNav) below it. */}
        <button
          type="button"
          onClick={() => setNavOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={navOpen}
          aria-label={`Question ${order[pos] + 1} of ${questions.length}. Open question navigator`}
          className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider tabular-nums"
          style={{ background: C.yellow, color: "#0B1322", minHeight: 28 }}
        >
          Q{order[pos] + 1} / {questions.length}
          <span aria-hidden style={{ fontSize: 9, marginLeft: 2 }}>{navOpen ? "▴" : "▾"}</span>
        </button>
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
        <p className="text-[15px] font-semibold leading-relaxed sm:text-[14px]">{cur.prompt}</p>
        <div className="mt-3 flex flex-col gap-2">
          {cur.choices.map((c, i) => {
            const isPicked = picked === c.id;
            const showRight = resolved && c.correct;
            const showWrong = isPicked && !c.correct;
            const highlighted = !resolved && hi === i;
            return (
              <button
                key={c.id}
                onClick={() => lockIn(c.id)}
                onMouseEnter={() => { if (!resolved) setHi(i); }}
                disabled={resolved}
                className="flex w-full items-start gap-2.5 rounded-xl px-3.5 py-3 text-left text-[14px] leading-snug sm:text-[13px]"
                style={{
                  minHeight: 48, color: C.text,
                  background: showRight ? "rgba(59,245,160,0.14)" : showWrong ? "rgba(255,92,110,0.14)" : highlighted ? "rgba(252,163,17,0.12)" : C.panel,
                  border: `1.5px solid ${showRight ? "rgba(59,245,160,0.7)" : showWrong ? "rgba(255,92,110,0.7)" : highlighted ? C.yellow : C.border}`,
                  textDecoration: showWrong ? "line-through" : "none",
                  transition: "background 120ms, border-color 120ms",
                }}
              >
                {showRight ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.green }} /> : showWrong ? <CircleX className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.red }} /> : <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full" style={{ border: `1.5px solid ${highlighted ? C.yellow : C.border}` }} />}
                <span className="min-w-0">{c.text}</span>
              </button>
            );
          })}
        </div>
        {resolved && (
          <div className="mt-3">
            {/* Feedback is a quiet note, not another card. */}
            <p className="px-1 text-[12px] leading-relaxed" style={{ color: C.muted }}>
              {pickedChoice?.feedback ?? (pickedChoice?.correct ? "✓ Correct!" : "✕ Not quite. Try again →")}
            </p>
            <AskBox reference={fullRef(pos)} shorthand={cur.shorthand} prompt={cur.prompt} setId={setId} ceqId={cur.id} campusName={campusName} campusSlug={campusSlug} isTest={isTest} />
          </div>
        )}
      </div>

      {/* MOBILE NEXT — thumb-reachable, FIXED to the viewport bottom (the player card is
          overflow-hidden, so sticky can't reach the viewport). Only renders once a question is
          resolved, so it never covers the choices. Desktop: static under the card, ⏎ also works. */}
      {resolved && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-[linear-gradient(0deg,rgba(5,8,16,0.96)_60%,rgba(5,8,16,0)_100%)] p-3 sm:static sm:bg-none sm:p-0 sm:px-5 sm:pb-4">
          <div className="flex items-center gap-3">
            {pos > 0 && <button className="shrink-0 px-2 text-[12px] font-bold" style={{ color: C.muted, minHeight: 44 }} onClick={() => goTo(pos - 1)}>← Back</button>}
            <button className="min-w-0 flex-1 rounded-xl text-[14px] font-black uppercase tracking-wide sm:text-[12.5px]" style={{ background: C.yellow, color: "#0B1322", minHeight: 48 }} onClick={advance}>
              {pos + 1 < total ? "Next →" : "Finish set →"}
            </button>
          </div>
        </div>
      )}
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

// ---- "Ask Lee about this question" — the reference (3.2.14) + shorthand ride INTO the
//      submission but are never shown; routes through the unified intake. Closable with ×;
//      typed text survives a close/reopen (the collapsed control says "(draft)"). -------------
function AskBox({ reference, shorthand, prompt, setId, ceqId, campusName, campusSlug, isTest }: { reference: string; shorthand: string | null; prompt: string; setId: string; ceqId: string; campusName?: string | null; campusSlug?: string | null; isTest?: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(() => { try { return localStorage.getItem("sa-student-email") ?? ""; } catch { return ""; } });
  const [msg, setMsg] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  useEffect(() => { setOpen(false); setMsg(""); setState("idle"); }, [ceqId]);
  const send = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || !msg.trim()) { setState("error"); return; }
    setState("busy");
    try {
      try { localStorage.setItem("sa-student-email", email.trim()); } catch { /* ignore */ }
      await askAboutQuestion({ data: { email: email.trim(), message: msg.trim(), reference, shorthand, prompt, setId, ceqId, campusName: campusName ?? null, campusSlug: campusSlug ?? null, isTest: !!isTest } });
      setState("sent");
    } catch (e) { console.warn("ask failed", e); setState("error"); }
  };
  if (state === "sent") return <p className="mt-2 px-1 text-[12px] font-semibold" style={{ color: C.green }}>✓ Sent — I'll answer this one myself, usually same day. — Lee</p>;
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
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="you@school.edu — where I reply" className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[13px] outline-none" style={{ background: "#0e131b", color: C.text, border: `1px solid ${C.border}`, minHeight: 44 }} />
        <button disabled={state === "busy"} onClick={() => void send()} className="rounded-lg px-4 text-[12px] font-black uppercase tracking-wide disabled:opacity-50" style={{ background: C.yellow, color: "#0B1322", minHeight: 44 }}>{state === "busy" ? "…" : "Send"}</button>
      </div>
      {state === "error" && <p className="mt-1.5 text-[11px]" style={{ color: "#F3C6CC" }}>Add a message and a real email so I can reply.</p>}
    </div>
  );
}
