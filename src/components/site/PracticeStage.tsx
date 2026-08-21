// CRAM MODE (08-21) — the Practice stage of Cram → Practice → Review, shared by the homepage
// player and /learn. Keyboard-first on desktop (↑↓ highlight, ⏎ lock-in / advance, ←→ step,
// Shift+→ next set), tap-first on mobile (tap a row to lock in, big Next, swipe to step). Cards
// swap in place in ~120ms; no spinners, no layout shift. Resolution uses the filming-side sfx
// (confirm / vinyl scratch) and a green/red resolve. PROGRESS, NOT SCORES: nothing here reads as
// a grade — the end of a set counts questions seen and how many to run again, and a cram tool
// brings the missed ones back. Every answer/skip/abandon logs to practice_attempts (stable ids).
// Questions come from fetchSetPractice (or are passed in for demo).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleX, Loader2, MessageCircle, RotateCcw } from "lucide-react";

import { fetchSetPractice, type PracticeQuestion } from "@/lib/student.functions";
import { askAboutQuestion, logPracticeEvents, type AttemptEvent } from "@/lib/practice.functions";
import { playSfx, unlockSfx } from "@/components/canvas/sfx";
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
}

export function PracticeStage({ setId, questions: override, onDone, doneLabel, onReview, reference, setName, campusName, campusSlug, surface, isTest }: PracticeStageProps) {
  const q = useQuery({ queryKey: ["set-practice", setId], queryFn: () => fetchSetPractice({ data: { setId } }), enabled: !override, staleTime: 300_000, networkMode: "always" });
  const questions = useMemo<PracticeQuestion[]>(() => override ?? (q.data?.status === "ok" ? q.data.questions : []), [override, q.data]);

  // ---- pass / position state -------------------------------------------------------------------
  const [order, setOrder] = useState<number[]>([]);           // indexes into `questions` for this pass
  const [pass, setPass] = useState(1);
  const [pos, setPos] = useState(0);
  const [hi, setHi] = useState(0);                               // highlighted choice (keyboard)
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, boolean>>({}); // ceqId → correct (latest)
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [finished, setFinished] = useState(false);
  const [swap, setSwap] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(() => { try { return localStorage.getItem("sa-cram-auto") === "1"; } catch { return false; } });
  const startedAt = useRef(Date.now());
  const revealedAt = useRef(Date.now());
  const userId = useRef<string | null>(null);
  const touchX = useRef<number | null>(null);
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => { userId.current = data.session?.user?.id ?? null; }); }, []);
  useEffect(() => { if (questions.length && order.length === 0) setOrder(questions.map((_, i) => i)); }, [questions, order.length]);

  const cur = order.length ? questions[order[pos]] : undefined;
  const total = order.length;
  const ref = reference ? `${reference.topic ?? "?"}.${reference.set}` : null;
  const fullRef = (i: number) => (reference ? `${reference.topic ?? "?"}.${reference.set}.${order[i] + 1}` : `Q${order[i] + 1}`);

  // ---- analytics (stable ids, batched per event; abandon on unmount) ------------------------------
  const log = useCallback((e: AttemptEvent) => {
    void logPracticeEvents({ data: { sessionId: sessionId(), userId: userId.current, campus: campusSlug ?? campusName ?? null, surface: surface ?? null, isTest: !!isTest, events: [e] } }).catch(() => {});
  }, [campusName, campusSlug, surface, isTest]);
  const lastReached = useRef<{ setId: string; ceqId: string; pass: number } | null>(null);
  useEffect(() => { if (cur) lastReached.current = { setId, ceqId: cur.id, pass }; }, [cur, setId, pass]);
  const finishedRef = useRef(false); finishedRef.current = finished;
  useEffect(() => () => { const l = lastReached.current; if (l && !finishedRef.current) log({ setId: l.setId, ceqId: l.ceqId, event: "abandon", attemptNumber: l.pass }); }, [log]);

  // ---- navigation ---------------------------------------------------------------------------------
  const goTo = useCallback((next: number, viaStep = false) => {
    if (!total) return;
    if (next >= total) { setFinished(true); return; }
    if (next < 0) return;
    if (viaStep && cur && picked == null && !seen.has(cur.id)) log({ setId, ceqId: cur.id, event: "skip", attemptNumber: pass });
    setSwap(true);
    window.setTimeout(() => { setPos(next); setPicked(null); setHi(0); revealedAt.current = Date.now(); setSwap(false); }, SWAP_MS);
  }, [total, cur, picked, seen, log, setId, pass]);

  const lockIn = useCallback((choiceId: string) => {
    if (!cur || picked) return;
    const choice = cur.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    unlockSfx();
    const ms = Date.now() - revealedAt.current;
    setPicked(choiceId);
    setResults((r) => ({ ...r, [cur.id]: !!choice.correct }));
    setSeen((s) => new Set(s).add(cur.id));
    addCoverage(setId, cur.id);
    playSfx(choice.correct ? "confirm" : "vinylScratch");
    log({ setId, ceqId: cur.id, event: "answer", choiceId, correct: !!choice.correct, ms, attemptNumber: pass });
    // Auto-advance ONLY after a correct answer — a wrong one sits with the right answer showing.
    if (choice.correct && autoAdvance) window.setTimeout(() => goTo(pos + 1), 900);
  }, [cur, picked, setId, pass, log, autoAdvance, goTo, pos]);

  const advance = useCallback(() => { playSfx("keypad"); goTo(pos + 1); }, [goTo, pos]);

  // Keyboard (desktop). Ignored while typing in the ask box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (finished || !cur) return;
      if (e.key === "ArrowDown") { e.preventDefault(); if (!picked) setHi((h) => Math.min(cur.choices.length - 1, h + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (!picked) setHi((h) => Math.max(0, h - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); if (picked) advance(); else lockIn(cur.choices[hi]?.id); }
      else if (e.key === "ArrowRight") { e.preventDefault(); if (e.shiftKey) onDone(); else { playSfx("keypad"); goTo(pos + 1, true); } }
      else if (e.key === "ArrowLeft") { e.preventDefault(); playSfx("keypad"); goTo(pos - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, picked, hi, finished, advance, lockIn, goTo, pos, onDone]);

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
  const retryMissed = () => { setOrder(missedIdx); setPass((p) => p + 1); setPos(0); setPicked(null); setHi(0); setFinished(false); revealedAt.current = Date.now(); };

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
      {/* STAGE HEADER — the reference, always visible, + keyboard hints (desktop) */}
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 sm:px-5">
        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider tabular-nums" style={{ background: C.yellow, color: "#0B1322" }}>{ref ? `${ref} · ` : ""}Q{order[pos] + 1} / {questions.length}</span>
        {pass > 1 && <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: C.muted }}>Retry {pos + 1}/{total}</span>}
        <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: C.muted }}>{cur.shorthand ?? setName ?? ""}</span>
        <span className="hidden items-center gap-1 text-[10px] font-bold sm:flex" style={{ color: C.muted }} title="← → step · ↑ ↓ choose · ⏎ lock in / next · Shift+→ next set">
          {["←", "→", "↑", "↓", "⏎"].map((k) => <kbd key={k} className="rounded px-1.5 py-0.5" style={{ border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)" }}>{k}</kbd>)}
        </span>
        <label className="hidden items-center gap-1 text-[10px] sm:flex" style={{ color: C.muted }} title="Auto-advance after a correct answer"><input type="checkbox" checked={autoAdvance} onChange={(e) => { setAutoAdvance(e.target.checked); try { localStorage.setItem("sa-cram-auto", e.target.checked ? "1" : "0"); } catch { /* ignore */ } }} /> auto</label>
      </div>

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
            <p className="rounded-xl px-3 py-2 text-[12px] leading-relaxed" style={{ color: C.muted, border: `1px dashed ${C.border}` }}>
              {pickedChoice?.feedback ?? (pickedChoice?.correct ? "Right. Lee works this one in the review video — coming soon." : "Lee works this one in the review video — coming soon.")}
            </p>
            <AskBox reference={fullRef(pos)} shorthand={cur.shorthand} prompt={cur.prompt} setId={setId} ceqId={cur.id} campusName={campusName} campusSlug={campusSlug} isTest={isTest} />
          </div>
        )}
      </div>

      {/* MOBILE NEXT — thumb-reachable, FIXED to the viewport bottom (the player card is
          overflow-hidden, so sticky can't reach the viewport). Only renders once a question is
          resolved, so it never covers the choices. Desktop: static under the card, ⏎ also works. */}
      {resolved && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 sm:static sm:p-0 sm:px-5 sm:pb-4" style={{ background: "linear-gradient(0deg, rgba(5,8,16,0.96) 60%, rgba(5,8,16,0) 100%)" }}>
          <button className="w-full rounded-xl text-[14px] font-black uppercase tracking-wide sm:text-[12.5px]" style={{ background: C.yellow, color: "#0B1322", minHeight: 48 }} onClick={advance}>
            {pos + 1 < total ? "Next →" : "Finish set →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- "Ask me about this one" — reference-prefilled, routes through the unified intake -----------
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
  if (state === "sent") return <p className="mt-2 text-[12px] font-semibold" style={{ color: C.green }}>✓ Sent — I'll answer {reference} myself, usually same day. — Lee</p>;
  if (!open) return <button className="mt-2 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: C.yellow, minHeight: 32 }} onClick={() => setOpen(true)}><MessageCircle className="h-3.5 w-3.5" /> Ask me about this one →</button>;
  return (
    <div className="mt-2 rounded-xl p-3" style={{ border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)" }}>
      <div className="text-[10.5px] font-black uppercase tracking-wider" style={{ color: C.yellow }}>Ask Lee · {reference}{shorthand ? ` · ${shorthand}` : ""}</div>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder={`What's confusing about ${reference}?`} className="mt-2 w-full rounded-lg px-3 py-2 text-[13px] outline-none" style={{ background: "#0e131b", color: C.text, border: `1px solid ${C.border}` }} />
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="you@school.edu — where I reply" className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[13px] outline-none" style={{ background: "#0e131b", color: C.text, border: `1px solid ${C.border}`, minHeight: 44 }} />
        <button disabled={state === "busy"} onClick={() => void send()} className="rounded-lg px-4 text-[12px] font-black uppercase tracking-wide disabled:opacity-50" style={{ background: C.yellow, color: "#0B1322", minHeight: 44 }}>{state === "busy" ? "…" : "Send"}</button>
      </div>
      {state === "error" && <p className="mt-1.5 text-[11px]" style={{ color: "#F3C6CC" }}>Add a message and a real email so I can reply.</p>}
    </div>
  );
}
