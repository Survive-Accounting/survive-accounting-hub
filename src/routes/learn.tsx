// STUDENT SHELL (#7) — a sibling of Study Canvas: same navy + bolt + tokens, a left
// Course › Topic › CEQ-Set outline and a main video-poster grid. Signed-out students
// browse; free sets play, paid sets show a paywall (checkout is a STUB — no Stripe yet).
// Only status='live' sets ever arrive (filtered server-side in fetchStudentTree).
//
// IMPROVEMENT PASS (2026-08-20):
//  * Continue-watching rail (in-progress sets, most recent first)
//  * Resume-at-timestamp (position_sec via 20260820_1500; signed-out falls back to localStorage)
//  * Mux poster thumbnails + runtime badges + watched-fraction strip
//  * Practice-questions PLACEHOLDER (sets already carry ceqCount; the player comes later)
//  * Deep links: /learn?campus=<id>&topic=<id> (campus/chapter pages can hand off context)
//  * Mobile: sidebar collapses to a course-map sheet under 720px
//  * Up-next: finishing a video offers the topic's next playable set on a 5s countdown
//  * Per-course + per-unit progress bars in the outline
//  * DEMO MODE: /learn?demo=1 renders a placeholder tree client-side (no DB reads/writes) so
//    the shell can be previewed populated before any real set is flipped live.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Circle, CircleCheck, CircleDot, ListTree, Lock, LogOut, Mail, Play, X, Loader2, Zap } from "lucide-react";

import { useDismiss } from "@/lib/use-dismiss";
import { joinPricingWaitlist } from "@/lib/pricing-api";
import { fetchStudentTree, type PracticeQuestion, type StudentCourse, type StudentSet, type StudentTopic } from "@/lib/student.functions";
import { nextStep, setIndexOf, stagesOf, type SetStage } from "@/lib/set-flow";
import { PracticeStage } from "@/components/site/PracticeStage";
import { listOverrideCampuses, type CampusOpt } from "@/lib/campus-overrides.functions";
import { claimMyOrders, fetchMyUnlockedTopics, getSetPlayback } from "@/lib/entitlements.functions";
import { NEON } from "@/components/canvas/theme";
import { BrandLogo, Bolt, BRAND_RED, BRAND_BLUE } from "@/components/canvas/brand";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { IntroSting } from "@/components/frames";
import { supabase } from "@/integrations/supabase/client";

type ProgressState = "unstarted" | "in_progress" | "complete";
/** One set's progress. positionSec/durationSec power resume + the watched strip; updatedAt
 *  orders the continue-watching rail. Signed-out lives in localStorage, signed-in in
 *  student_set_progress (position columns degrade gracefully until 20260820_1500 applies). */
type Prog = { state: ProgressState; positionSec: number; durationSec: number | null; updatedAt: number };

type LearnSearch = { campus?: string; topic?: string; set?: string; stage?: SetStage; demo?: boolean };

export const Route = createFileRoute("/learn")({
  validateSearch: (s: Record<string, unknown>): LearnSearch => ({
    campus: typeof s.campus === "string" && s.campus ? s.campus : undefined,
    topic: typeof s.topic === "string" && s.topic ? s.topic : undefined,
    // DEEP LINK into a set/stage — what "Continue where you left off" hands off to.
    set: typeof s.set === "string" && s.set ? s.set : undefined,
    stage: s.stage === "cram" || s.stage === "practice" || s.stage === "review" ? s.stage : undefined,
    demo: s.demo === true || s.demo === 1 || s.demo === "1" || s.demo === "true" ? true : undefined,
  }),
  head: () => ({ meta: [{ title: "⚡ Learn — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: LearnShell,
});

const LAST_TOPIC_KEY = "sa-learn-last-topic";
const chip = (t: StudentTopic) => (t.shortLabel?.trim() || t.name || "Topic").slice(0, 22);
const fmtRuntime = (sec: number) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, "0")}`; };
/** Mux frame-accurate poster — free for every published video. Paid sets never carry a
 *  playbackId in the tree, so they keep the bolt face (a deliberate visual tell). */
const muxThumb = (playbackId: string) => `https://image.mux.com/${playbackId}/thumbnail.jpg?width=480&time=2`;

// ---- DEMO TREE (?demo=1) — placeholder content so the shell can be previewed populated.
//      Pure client-side stand-in: demo set ids never reach the DB and "videos" are stubs. ------
const DEMO_PLAYBACK = "__demo__";
// Canned practice questions for demo sets — the same shape fetchSetPractice serves.
const DEMO_QUESTIONS: PracticeQuestion[] = [
  { id: "dq1", prompt: "A company pays $1,200 on Oct 1 for a 12-month insurance policy. What does the Oct 1 entry debit?", shorthand: "Prepaid → expense", choices: [
    { id: "a", text: "Insurance Expense", correct: false, feedback: "Not yet — nothing is used up on day one. Watch for the word 'pays in advance'." },
    { id: "b", text: "Prepaid Insurance", correct: true, feedback: "Paying in advance buys an ASSET; it becomes expense as months pass." },
    { id: "c", text: "Cash", correct: false, feedback: "Cash is the CREDIT here — it's what leaves." },
  ] },
  { id: "dq2", prompt: "Which pair keeps the accounting equation in balance after buying supplies on account?", shorthand: "A = L + E", choices: [
    { id: "a", text: "Assets up, Liabilities up", correct: true, feedback: "Supplies (asset) rise, Accounts Payable (liability) rises — balanced." },
    { id: "b", text: "Assets up, Equity up", correct: false, feedback: "'On account' means a payable, not owner money." },
  ] },
];
function demoTree(): StudentCourse[] {
  const set = (id: string, name: string, o: Partial<StudentSet> = {}): StudentSet => ({ id: `demo-${id}`, name, access: "free", orientation: "landscape", playbackId: DEMO_PLAYBACK, ceqCount: 0, runtimeSec: null, hasReview: false, reviewPlaybackId: null, reviewRuntimeSec: null, firstStem: null, ...o });
  return [
    {
      id: "demo-intro1", name: "Intro 1", family: "intro",
      units: [
        {
          id: "demo-exam1", name: "Exam 1",
          topics: [
            { id: "demo-t1", name: "The Accounting Cycle", shortLabel: "Cycle", number: 1, sets: [
              // Set 1 has a REVIEW; sets 2–3 don't — exercises both flow shapes.
              set("s1", "The Big Picture", { runtimeSec: 312, ceqCount: 6, hasReview: true, reviewPlaybackId: DEMO_PLAYBACK, reviewRuntimeSec: 940 }),
              set("s2", "Assets = Liabilities + Equity", { runtimeSec: 428, ceqCount: 9 }),
              set("s3", "The Cycle, Start to Finish", { runtimeSec: 517, ceqCount: 7 }),
            ] },
            { id: "demo-t2", name: "Analyzing Transactions", shortLabel: "Analyzing", number: 2, sets: [
              set("s4", "Debits & Credits", { runtimeSec: 389, ceqCount: 8 }),
              set("s5", "T-Accounts", { runtimeSec: 265, ceqCount: 5 }),
              set("s6", "Trial Balance", { playbackId: null, ceqCount: 4 }), // "Soon" — video not published
              set("s7", "Journal Entries Deep-Dive", { access: "paid", playbackId: null, runtimeSec: 742, ceqCount: 12, firstStem: "Record the entry when ░░░░ pays ░░░░ in advance for…" }),
            ] },
            { id: "demo-t3", name: "Recording & Adjusting", shortLabel: "Recording", number: 3, sets: [
              set("s8", "Adjusting Entries", { runtimeSec: 601, ceqCount: 10 }),
              set("s9", "Accruals vs Deferrals", { playbackId: null, ceqCount: 6 }),
            ] },
          ],
        },
        {
          id: "demo-exam2", name: "Exam 2",
          topics: [
            { id: "demo-t4", name: "Merchandising", shortLabel: "Merch", number: 4, sets: [
              set("s10", "Perpetual vs Periodic", { access: "paid", playbackId: null, runtimeSec: 455, ceqCount: 8, firstStem: "A company using the ░░░░ system buys inventory…" }),
              set("s11", "Gross Profit", { access: "paid", playbackId: null, runtimeSec: 380, ceqCount: 6 }),
            ] },
            { id: "demo-t5", name: "Inventory (FIFO / LIFO)", shortLabel: "Inventory", number: 5, sets: [
              set("s12", "FIFO vs LIFO vs Average", { access: "paid", playbackId: null, runtimeSec: 664, ceqCount: 11 }),
            ] },
          ],
        },
      ],
      topics: [],
    },
    { id: "demo-intro2", name: "Intro 2", family: "intro", units: [], topics: [
      { id: "demo-t6", name: "Managerial Basics", shortLabel: "Managerial", number: 1, sets: [set("s13", "Cost Behavior", { playbackId: null, ceqCount: 0 })] },
    ] },
  ];
}

// ---- SILENT DOM PRE-ROLL (#7) — bolt boils, wordmark snaps in, topic chip; ~1.5s, NO audio.
//      A player component, NOT stitched into the video file. onDone reveals the player. --------
function PreRoll({ chipText, onDone }: { chipText: string; onDone: () => void }) {
  // The SHARED intro sting (frames/), scaled to fill the player box — no bespoke pre-roll markup.
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.24);
  useLayoutEffect(() => { const el = ref.current; if (el && el.clientWidth) setScale(el.clientWidth / 1920); }, []);
  useEffect(() => { const t = window.setTimeout(onDone, 1500); return () => window.clearTimeout(t); }, [onDone]);
  return (
    <div ref={ref} className="absolute inset-0 z-10 grid place-items-center overflow-hidden" style={{ background: "#0A1220" }}>
      <IntroSting topicChip={chipText || undefined} scale={scale} />
    </div>
  );
}

// ---- END CARD — the forward step when a stage finishes. Cram → "Practice this set →" (no
//      countdown: practice is a doing, not a watching), video → video gets the 5s countdown. --
function EndCard({ kicker, name, sub, ctaLabel, countdown, onGo, onDismiss }: { kicker: string; name: string; sub?: string | null; ctaLabel: string; countdown: boolean; onGo: () => void; onDismiss: () => void }) {
  const [left, setLeft] = useState(countdown ? 5 : null as number | null);
  useEffect(() => {
    if (left == null) return;
    const iv = window.setInterval(() => setLeft((n) => (n == null ? n : n - 1)), 1000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (left != null && left <= 0) onGo(); }, [left, onGo]);
  return (
    <div className="absolute inset-0 z-20 grid place-items-center" style={{ background: "rgba(4,7,14,0.88)" }}>
      <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: "#0b1020", border: `1px solid ${NEON.borderSoft}` }}>
        <div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: NEON.muted }}>{kicker}{left != null ? ` in ${Math.max(0, left)}…` : ""}</div>
        <div className="mt-1.5 text-[14px] font-black" style={{ color: NEON.text }}>{name}</div>
        {sub && <div className="mt-0.5 text-[10.5px] font-bold" style={{ color: NEON.muted }}>{sub}</div>}
        <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-black uppercase tracking-wide" style={{ color: "#0B1322", background: NEON.yellow }} onClick={onGo}><Play className="h-3.5 w-3.5" /> {ctaLabel}</button>
        <button className="mt-1.5 w-full rounded-xl px-3 py-1.5 text-[11px] font-bold" style={{ color: NEON.muted }} onClick={onDismiss}>Not now</button>
      </div>
    </div>
  );
}

// ---- SET PLAYER — one modal walks a set's stages: Cram Blast → Practice → Review. The video
//      element is the app's hls.js path (@mux/mux-player isn't a dep) and is the SAME for cram
//      and review — the stage decides which playback id it gets and where "done" leads. --------
function SetPlayer({ set, sets, stage, chipText, startAt, demo, onClose, onStarted, onComplete, onPosition, onGoto }: {
  set: StudentSet; sets: StudentSet[]; stage: SetStage; chipText: string; startAt: number; demo: boolean;
  onClose: () => void; onStarted: () => void; onComplete: () => void;
  onPosition: (positionSec: number, durationSec: number | null) => void;
  /** Move within the flow — same set another stage, or the next set's cram. */
  onGoto: (setId: string, stage: SetStage) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);
  // The silent branded pre-roll belongs to the CRAM entrance only (the caller keys this
  // component by set+stage, so the initial value is per-stage-correct).
  const [preroll, setPreroll] = useState(stage === "cram");
  const [ended, setEnded] = useState(false);
  const lastWrite = useRef(0);
  const portrait = set.orientation === "portrait";
  const isCram = stage === "cram";
  const pid = stage === "review" ? set.reviewPlaybackId : set.playbackId;
  const isDemo = demo || pid === DEMO_PLAYBACK;
  const stages = stagesOf(set);
  const { n, of } = setIndexOf(sets, set.id);
  const after = nextStep(sets, set.id, stage);
  const nextSet = after && after.setId !== set.id ? sets.find((s) => s.id === after.setId) ?? null : null;
  // The forward step, described for the end card / practice CTA.
  const forward = after
    ? after.setId === set.id
      ? { label: after.stage === "practice" ? "Practice this set →" : "Review with Lee →", kicker: after.stage === "practice" ? "Try it yourself" : "Watch Lee work it", name: after.stage === "practice" ? `${set.ceqCount} questions` : set.name, sub: after.stage === "review" && set.reviewRuntimeSec != null ? fmtRuntime(set.reviewRuntimeSec) : null, countdown: after.stage === "review" }
      : { label: "Next set →", kicker: "Next set", name: nextSet?.name ?? "Next set", sub: nextSet?.runtimeSec != null ? fmtRuntime(nextSet.runtimeSec) : null, countdown: true }
    : null;
  // DEMO: opening a video simulates being ~40% through it, so the continue-watching rail,
  // watched strips, and Resume labels are all exercisable before any real stream exists.
  const started = useRef(false);
  useEffect(() => {
    if (!isDemo || !isCram || started.current) return;
    started.current = true;
    onStarted();
    if (set.runtimeSec) onPosition(Math.round(set.runtimeSec * 0.4), set.runtimeSec);
  }, [isDemo, isCram, set.runtimeSec, onStarted, onPosition]);
  useEffect(() => {
    const v = ref.current;
    if (stage === "practice" || isDemo || !v || !pid) return;
    const src = `https://stream.mux.com/${pid}.m3u8`;
    let hls: { destroy: () => void } | null = null;
    if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; return; }
    let cancelled = false;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !ref.current) return;
      if (Hls.isSupported()) { const h = new Hls(); h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setErr(true); }); h.loadSource(src); h.attachMedia(ref.current); hls = h; }
      else { ref.current.src = src; }
    }).catch(() => setErr(true));
    return () => { cancelled = true; hls?.destroy(); };
  }, [pid, stage, isDemo]);
  // The video autoplays only AFTER the silent pre-roll ends (so the pre-roll stays silent).
  // RESUME (cram only): seek to the saved position — but never into the last 10s ("rewatch").
  useEffect(() => {
    if (preroll || isDemo || stage === "practice") return;
    const v = ref.current;
    if (!v) return;
    if (isCram && startAt > 5) {
      const seek = () => { if (!v.duration || startAt < v.duration - 10) v.currentTime = startAt; };
      if (v.readyState >= 1) seek(); else v.addEventListener("loadedmetadata", seek, { once: true });
    }
    void v.play().catch(() => { /* user can hit play */ });
  }, [preroll, startAt, isDemo, isCram, stage]);
  // Write the position on unmount too — the classic "closed the player" resume case. CRAM ONLY:
  // a review position must never overwrite the cram resume point on the same progress row.
  useEffect(() => () => { const v = ref.current; if (v && !isDemo && isCram && v.currentTime > 0) onPosition(Math.floor(v.currentTime), v.duration ? Math.floor(v.duration) : null); }, [isDemo, isCram, onPosition]);
  const flush = () => { const v = ref.current; if (v && isCram) onPosition(Math.floor(v.currentTime), v.duration ? Math.floor(v.duration) : null); };
  const stagePill = (st: SetStage) => (
    <button
      key={st}
      className="rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider"
      style={{ color: st === stage ? "#0B1322" : NEON.muted, background: st === stage ? NEON.yellow : "transparent", border: `1px solid ${st === stage ? NEON.yellow : NEON.borderSoft}` }}
      onClick={() => onGoto(set.id, st)}
      title={st === "cram" ? "Cram Blast — see what's coming" : st === "practice" ? "Practice — try it yourself" : "Review — watch Lee work it"}
    >
      {st === "cram" ? "Cram" : st === "practice" ? "Practice" : "Review"}
    </button>
  );
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" style={{ background: "rgba(4,7,14,0.92)" }} onClick={onClose}>
      <div className="relative w-full" style={{ maxWidth: portrait ? 460 : 1100 }} onClick={(e) => e.stopPropagation()}>
        <button className="absolute -top-9 right-0 grid h-8 w-8 place-items-center rounded-full" style={{ color: "#e8ecf5", border: "1px solid rgba(255,255,255,0.2)" }} onClick={onClose} title="Close (Esc)"><X className="h-4 w-4" /></button>
        {/* SET SHELL STRIP — where the student IS: set number + the stage walk. */}
        <div className="mb-2 flex items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-bold" style={{ color: "#e8ecf5" }}>{set.name}</span>
          <span className="shrink-0 text-[9.5px] font-black uppercase tracking-[0.12em]" style={{ color: NEON.muted }}>Set {n} of {of}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">{stages.map(stagePill)}</span>
        </div>
        {stage === "practice" ? (
          <div className="overflow-hidden rounded-xl" style={{ background: "#0b1020", border: `1px solid ${NEON.borderSoft}`, aspectRatio: portrait ? "9 / 16" : "16 / 9", minHeight: 320 }}>
            <PracticeStage
              setId={set.id}
              questions={isDemo ? DEMO_QUESTIONS : undefined}
              doneLabel={forward?.label ?? "Done →"}
              onDone={() => { if (after) onGoto(after.setId, after.stage); else onClose(); }}
            />
          </div>
        ) : err ? (
          <div className="grid place-items-center rounded-xl text-[12px]" style={{ aspectRatio: portrait ? "9 / 16" : "16 / 9", background: "#0b1020", border: "1px solid rgba(255,92,110,0.4)", color: "#F3C6CC" }}>Couldn't load this video. Try again shortly.</div>
        ) : (
          // DOM watermark (bolt only) overlays the video — burned-in stays out of the file.
          <div className="relative overflow-hidden rounded-xl" style={{ background: "#000", aspectRatio: portrait ? "9 / 16" : "16 / 9" }}>
            {isDemo ? (
              // DEMO STAND-IN — no stream exists yet; the box states what will live here and
              // offers a fake "finish" so the stage-walk + progress flows can be exercised.
              <div className="grid h-full w-full place-items-center text-center" style={{ background: "#05080f" }}>
                <div>
                  <div className="mx-auto mb-3 inline-block"><BoltBoil height={56} /></div>
                  <div className="text-[12px] font-bold" style={{ color: NEON.muted, fontFamily: "monospace" }}>{isCram ? "[ Cram Blast plays here — publish via Pipeline ]" : "[ Review video plays here — publish via Pipeline ]"}</div>
                  {!ended && <button className="mt-4 rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wide" style={{ color: "#0B1322", background: NEON.yellow }} onClick={() => { if (isCram) onComplete(); setEnded(true); }}>Finish video (demo)</button>}
                </div>
              </div>
            ) : (
              <video
                ref={ref} controls playsInline className="h-full w-full" style={{ objectFit: "contain", background: "#000" }}
                onPlay={() => { setEnded(false); if (isCram) onStarted(); }}
                onPause={flush}
                onTimeUpdate={() => { const now = Date.now(); if (now - lastWrite.current > 5000) { lastWrite.current = now; flush(); } }}
                onEnded={() => { if (isCram) onComplete(); setEnded(true); }}
              />
            )}
            <span className="pointer-events-none absolute right-3 top-3 inline-block h-6 w-4 opacity-80"><Bolt c1={BRAND_RED} c2={BRAND_BLUE} /></span>
            {preroll && !isDemo && isCram && <PreRoll chipText={chipText} onDone={() => setPreroll(false)} />}
            {ended && forward && <EndCard kicker={forward.kicker} name={forward.name} sub={forward.sub} ctaLabel={forward.label} countdown={forward.countdown} onGo={() => { if (after) onGoto(after.setId, after.stage); }} onDismiss={() => setEnded(false)} />}
            {ended && !forward && (
              <div className="absolute inset-0 z-20 grid place-items-center" style={{ background: "rgba(4,7,14,0.88)" }}>
                <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: "#0b1020", border: `1px solid ${NEON.borderSoft}` }}>
                  <div className="text-[13px] font-black" style={{ color: NEON.text }}>Topic finished ✓</div>
                  <p className="mt-1 text-[11px]" style={{ color: NEON.muted }}>Pick your next topic from the course map.</p>
                  <button className="mt-3 w-full rounded-xl px-3 py-2 text-[12px] font-black uppercase tracking-wide" style={{ color: "#0B1322", background: NEON.yellow }} onClick={onClose}>Back to topics</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Supabase MAGIC-LINK auth (no password ever) + student session -----------------------
function useStudentAuth() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (!active) return; setUserId(data.session?.user?.id ?? null); setEmail(data.session?.user?.email ?? null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { setUserId(session?.user?.id ?? null); setEmail(session?.user?.email ?? null); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  return { userId, email, signOut: () => void supabase.auth.signOut() };
}

// Magic-link sign-in dialog — email in, link out, one tap. NEVER a password field.
function SignInDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  // The page-level Escape handler only clears the player and the paywall, so this dialog was
  // dismissible by backdrop click alone — and had no visible close control at all.
  useDismiss<HTMLDivElement>(onClose, { outside: false });
  const send = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setState("error"); setMsg("Enter a valid email."); return; }
    setState("sending");
    const redirect = typeof window !== "undefined" ? `${window.location.origin}/learn` : undefined;
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect } });
    if (error) { setState("error"); setMsg(error.message); return; }
    setState("sent");
  };
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center p-4" style={{ background: "rgba(4,7,14,0.9)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#0b1020", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2"><Mail className="h-4 w-4" style={{ color: NEON.yellow }} /><span className="text-[14px] font-black uppercase tracking-wide">Sign in</span><button type="button" onClick={onClose} aria-label="Close" className="ml-auto grid h-7 w-7 place-items-center rounded-full hover:bg-white/10" style={{ color: NEON.text }}><span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span></button></div>
        {state === "sent" ? (
          <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: NEON.muted }}>Check <b style={{ color: NEON.text }}>{email}</b> — we sent a one-tap sign-in link. No password needed.</p>
        ) : (
          <>
            <p className="mt-1 mb-3 text-[12px]" style={{ color: NEON.muted }}>We email you a link — no password, ever.</p>
            <input
              type="email" autoFocus inputMode="email" autoComplete="email" placeholder="you@school.edu"
              className="w-full rounded-lg px-3 py-2 text-[13px] outline-none" style={{ background: "#0e131b", color: "#e7ecf3", border: `1px solid ${NEON.borderSoft}` }}
              value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            />
            {state === "error" && <p className="mt-1.5 text-[11px]" style={{ color: "#F3C6CC" }}>{msg}</p>}
            <button disabled={state === "sending"} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-black uppercase tracking-wide disabled:opacity-50" style={{ color: "#0B1322", background: NEON.yellow }} onClick={() => void send()}>
              {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Email me a link
            </button>
          </>
        )}
        <button className="mt-2 w-full rounded-xl px-3 py-2 text-[11px] font-bold" style={{ color: NEON.muted }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ---- one set poster: Mux thumbnail when a video is published; navy bolt face otherwise
//      (paid sets ALWAYS keep the bolt face — their playback ids never reach the tree). ------
function SetPoster({ set, topicChip, accent, prog, unlocked, demo, onOpen }: { set: StudentSet; topicChip: string; accent: string; prog: Prog | undefined; unlocked: boolean; demo: boolean; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const [thumbErr, setThumbErr] = useState(false);
  const state: ProgressState = prog?.state ?? "unstarted";
  const locked = set.access === "paid" && !unlocked;
  // Paid sets have their playbackId WITHHELD from the tree, so "coming soon" applies to free only.
  const comingSoon = set.access !== "paid" && !set.playbackId;
  const hasThumb = !locked && !!set.playbackId && set.playbackId !== DEMO_PLAYBACK && !thumbErr;
  const footLabel = locked ? "Paid" : comingSoon ? "Soon" : state === "complete" ? "Done ✓" : state === "in_progress" ? "Resume" : set.access === "paid" ? "Unlocked" : "Free";
  const footColor = locked ? "#F0B24A" : comingSoon ? NEON.muted : state === "complete" ? "#3BF5A0" : state === "in_progress" ? NEON.cyan : "#3BF5A0";
  // Watched strip — the YouTube fraction bar. Complete = full green; in-progress = cyan fraction.
  const frac = state === "complete" ? 1 : state === "in_progress" && prog?.durationSec ? Math.min(1, (prog.positionSec ?? 0) / prog.durationSec) : 0;
  return (
    <button
      className="group relative flex flex-col overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-0.5"
      style={{ background: "linear-gradient(160deg, #12203E, #070C1A)", border: `1px solid ${NEON.borderSoft}`, boxShadow: "0 12px 30px -16px rgba(0,0,0,0.8)" }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      title={locked ? `Locked — ${set.name}` : comingSoon ? `${set.name} — coming soon` : `Play ${set.name}`}
    >
      <div className="relative grid place-items-center" style={{ aspectRatio: "16 / 9", borderBottom: `1px solid ${NEON.borderSoft}` }}>
        {hasThumb ? (
          <img src={muxThumb(set.playbackId!)} alt="" loading="lazy" className="absolute inset-0 h-full w-full" style={{ objectFit: "cover" }} onError={() => setThumbErr(true)} />
        ) : demo && !locked && !comingSoon ? (
          // Demo posters state the placeholder plainly — this face becomes a real Mux frame.
          <span className="px-3 text-center text-[10px] font-bold" style={{ color: NEON.muted, fontFamily: "monospace" }}>[ thumbnail from Mux goes here ]</span>
        ) : (
          <span className="inline-block" style={{ height: 68 }}>{hover && !locked ? <BoltBoil height={68} /> : <span className="inline-block h-full" style={{ width: Math.round(68 * 0.62) }}><Bolt c1="#C62828" c2="#1565C0" /></span>}</span>
        )}
        <span className="absolute left-2.5 top-2.5 truncate rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider" style={{ maxWidth: "80%", color: "#0B1322", background: accent }}>{topicChip}</span>
        {locked && <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full" style={{ background: "rgba(4,7,14,0.7)", border: `1px solid ${NEON.borderSoft}`, color: "#F0B24A" }}><Lock className="h-3.5 w-3.5" /></span>}
        {!locked && !comingSoon && state === "complete" && <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full" style={{ background: "rgba(4,7,14,0.7)", border: `1px solid rgba(59,245,160,0.5)`, color: "#3BF5A0" }}><CircleCheck className="h-3.5 w-3.5" /></span>}
        {!locked && !comingSoon && state !== "complete" && <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100" style={{ background: "rgba(4,7,14,0.7)", border: `1px solid ${NEON.borderSoft}`, color: state === "in_progress" ? NEON.cyan : "#3BF5A0" }}><Play className="h-3.5 w-3.5" /></span>}
        {set.runtimeSec != null && !locked && (
          <span className="absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums" style={{ background: "rgba(4,7,14,0.8)", color: "#e8ecf5" }}>{fmtRuntime(set.runtimeSec)}</span>
        )}
        {frac > 0 && (
          <span className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: "rgba(255,255,255,0.12)" }}>
            <span className="absolute bottom-0 left-0 top-0" style={{ width: `${Math.round(frac * 100)}%`, background: state === "complete" ? "#3BF5A0" : NEON.cyan }} />
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold" style={{ color: NEON.text }}>{set.name}</span>
        {set.ceqCount > 0 && <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} title={`${set.ceqCount} practice questions (player coming soon)`}>{set.ceqCount} Qs</span>}
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide" style={{ color: footColor }}>{footLabel}</span>
      </div>
    </button>
  );
}

// NOTIFY-NOT-PAY (2026-08-20): there is no checkout yet (/order is deprecated), so a locked
// topic captures an email into the SAME pricing waitlist the homepage's paid tabs use
// (campus_waitlist, tier test_pass) instead of pointing at a dead payment page.
function Paywall({ topic, campusName, campusId, demo, onClose, onRestore, restoring }: { topic: StudentTopic; campusName: string | null; campusId: string | null; demo: boolean; onClose: () => void; onRestore?: () => void; restoring?: boolean }) {
  const n = topic.sets.length;
  const key = `sa-notify-topic-${topic.id}`;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"open" | "busy" | "done" | "error">(() => { try { return localStorage.getItem(key) === "done" ? "done" : "open"; } catch { return "open"; } });
  const submit = async () => {
    const e = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || state === "busy") return;
    setState("busy");
    try {
      // Demo never writes a real waitlist row — it only exercises the flow.
      if (!demo) await joinPricingWaitlist({ email: e, campus: campusName, campusId, course: topic.name, tier: "test_pass" });
      setState("done"); try { localStorage.setItem(key, "done"); } catch { /* ignore */ }
    } catch { setState("error"); }
  };
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" style={{ background: "rgba(4,7,14,0.9)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#0b1020", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2"><Lock className="h-4 w-4" style={{ color: "#F0B24A" }} /><span className="text-[14px] font-black uppercase tracking-wide">{topic.name} is coming</span></div>
        {/* Specific, not "unlock full access": the topic name + what's behind the lock. */}
        <p className="text-[12.5px] leading-relaxed" style={{ color: NEON.muted }}>
          {n} cram {n === 1 ? "video" : "videos"} in <b style={{ color: NEON.text }}>{topic.name}</b>{topic.sets.slice(0, 3).length > 0 && <> — including {topic.sets.slice(0, 3).map((s) => s.name).join(", ")}{n > 3 ? `, +${n - 3} more` : ""}</>}.
        </p>
        <div className="mt-4 rounded-xl px-3 py-2.5" style={{ border: "1px solid rgba(252,163,17,0.35)", background: "rgba(252,163,17,0.06)" }}>
          {state === "done" ? (
            <p className="text-[11.5px] font-semibold">✓ You're on the list — I'll email you the day {topic.name} opens.</p>
          ) : (
            <>
              <p className="text-[11.5px] font-bold">Get notified once {topic.name} is ready</p>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("open"); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                  type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu"
                  className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
                  style={{ background: "#0e131b", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
                />
                <button onClick={() => void submit()} disabled={state === "busy"} className="shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-black disabled:opacity-50" style={{ background: NEON.yellow, color: "#0B1322" }}>{state === "busy" ? "…" : "Notify me"}</button>
              </div>
              {state === "error" && <p className="mt-1 text-[10.5px]" style={{ color: "#F3C6CC" }}>Couldn't save that — try again in a moment.</p>}
            </>
          )}
        </div>
        {onRestore && <button className="mt-2 w-full rounded-xl px-3 py-2 text-[11px] font-bold disabled:opacity-50" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} disabled={restoring} onClick={onRestore}>{restoring ? "Checking…" : "Already have access? Restore it"}</button>}
        <button className="mt-2 w-full rounded-xl px-3 py-2 text-[11px] font-bold" style={{ color: NEON.muted }} onClick={onClose}>Keep browsing</button>
      </div>
    </div>
  );
}

// Narrow-viewport detector — the sidebar collapses to a course-map sheet under 720px.
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 719px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 719px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

function LearnShell() {
  const search = Route.useSearch();
  const demo = !!search.demo;
  // CAMPUS CONTEXT (Prompt 3) — pick a campus to see its chapter numbers + order. Only campuses
  // that actually have overrides are offered (others = the course default, so picking changes
  // nothing). Persisted; passed to the tree so numbering/order resolve server-side.
  // DEEP LINK: ?campus=<id> wins over the stored choice (campus/chapter pages hand off context).
  const [campusId, setCampusId] = useState<string | null>(() => { if (search.campus) return search.campus; try { return localStorage.getItem("sa-learn-campus"); } catch { return null; } });
  useEffect(() => { try { if (campusId) localStorage.setItem("sa-learn-campus", campusId); else localStorage.removeItem("sa-learn-campus"); } catch { /* ignore */ } }, [campusId]);
  const campusesQ = useQuery({ queryKey: ["override-campuses"], queryFn: () => listOverrideCampuses(), staleTime: 300_000, networkMode: "always", enabled: !demo });
  const campuses: CampusOpt[] = campusesQ.data ?? [];
  const q = useQuery({ queryKey: ["student-tree", campusId], queryFn: () => fetchStudentTree({ data: { campusId: campusId ?? undefined } }), staleTime: 120_000, networkMode: "always", enabled: !demo });
  const demoCourses = useMemo(() => (demo ? demoTree() : null), [demo]);
  const courses: StudentCourse[] = useMemo(() => demoCourses ?? q.data ?? [], [demoCourses, q.data]);
  const isLoading = !demo && q.isLoading;
  const isError = !demo && q.isError;
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(() => { if (search.topic) return search.topic; try { return localStorage.getItem(LAST_TOPIC_KEY); } catch { return null; } });
  // CURRENT POSITION in a topic's flow: the open set AND its stage (cram / practice / review).
  const [playing, setPlaying] = useState<{ set: StudentSet; topic: StudentTopic; stage: SetStage } | null>(null);
  const [paywallTopic, setPaywallTopic] = useState<StudentTopic | null>(null);
  const isNarrow = useIsNarrow();
  const [mapOpen, setMapOpen] = useState(false);

  // AUTH (magic link) + per-set PROGRESSION. Signed-in rows live in student_set_progress under
  // RLS (student sees + writes only their own). Signed-out (and demo) persists to localStorage
  // so a preview tester keeps progress across reloads — local only, nothing merges up.
  const { userId, email, signOut } = useStudentAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [progress, setProgress] = useState<Record<string, Prog>>({});
  const localKey = demo ? "sa-learn-progress-demo" : "sa-learn-progress";
  const useLocal = demo || !userId;
  useEffect(() => {
    if (useLocal) {
      try { setProgress(JSON.parse(localStorage.getItem(localKey) ?? "{}") as Record<string, Prog>); } catch { setProgress({}); }
      return;
    }
    let active = true;
    void (async () => {
      // position columns ship in 20260820_1500 — fall back to the 0101 shape until applied.
      let r = await (supabase.from("student_set_progress" as never) as any).select("set_id,state,position_sec,duration_sec,updated_at");
      if (r.error && /position_sec|column/i.test(String(r.error.message ?? ""))) r = await (supabase.from("student_set_progress" as never) as any).select("set_id,state,updated_at");
      if (!active) return;
      const m: Record<string, Prog> = {};
      for (const row of (r.data ?? []) as { set_id: string; state: ProgressState; position_sec?: number | null; duration_sec?: number | null; updated_at?: string }[]) {
        m[row.set_id] = { state: row.state, positionSec: row.position_sec ?? 0, durationSec: row.duration_sec ?? null, updatedAt: row.updated_at ? Date.parse(row.updated_at) : 0 };
      }
      setProgress(m);
    })();
    return () => { active = false; };
  }, [userId, useLocal, localKey]);
  const persistLocal = (m: Record<string, Prog>) => { try { localStorage.setItem(localKey, JSON.stringify(m)); } catch { /* ignore */ } };
  const writeRow = useCallback((setId: string, p: Prog) => {
    if (!userId) return;
    const t = supabase.from("student_set_progress" as never) as any;
    void t
      .upsert({ user_id: userId, set_id: setId, state: p.state, position_sec: p.positionSec, duration_sec: p.durationSec, updated_at: new Date().toISOString() }, { onConflict: "user_id,set_id" })
      .then((r: { error: { message?: string } | null }) => {
        // 20260820_1500 not applied — retry with the 0101 shape rather than dropping the write.
        if (r.error && /position_sec|duration_sec|column/i.test(String(r.error.message ?? ""))) void t.upsert({ user_id: userId, set_id: setId, state: p.state }, { onConflict: "user_id,set_id" });
      });
  }, [userId]);
  const markProgress = (setId: string, next: ProgressState) => {
    setProgress((prev) => {
      const cur = prev[setId];
      // 'complete' never downgrades to 'in_progress'.
      if (cur?.state === "complete" && next === "in_progress") return prev;
      const p: Prog = { state: next, positionSec: next === "complete" ? 0 : (cur?.positionSec ?? 0), durationSec: cur?.durationSec ?? null, updatedAt: Date.now() };
      const m = { ...prev, [setId]: p };
      if (useLocal) persistLocal(m); else writeRow(setId, p);
      return m;
    });
  };
  const markPosition = useCallback((setId: string, positionSec: number, durationSec: number | null) => {
    setProgress((prev) => {
      const cur = prev[setId];
      if (cur?.state === "complete") return prev; // a finished set doesn't regain a resume point
      const p: Prog = { state: cur?.state ?? "in_progress", positionSec, durationSec: durationSec ?? cur?.durationSec ?? null, updatedAt: Date.now() };
      const m = { ...prev, [setId]: p };
      if (useLocal) { try { localStorage.setItem(localKey, JSON.stringify(m)); } catch { /* ignore */ } } else writeRow(setId, p);
      return m;
    });
  }, [useLocal, localKey, writeRow]);

  // ENTITLEMENTS (Prompt 4) — topics the signed-in student has unlocked. A paid set in an
  // unlocked topic becomes playable; its withheld playback id is fetched securely on click.
  const unlockedQ = useQuery({ queryKey: ["my-unlocked-topics", userId], queryFn: () => fetchMyUnlockedTopics(), enabled: !!userId && !demo, networkMode: "always" });
  const unlockedTopics = useMemo(() => new Set(unlockedQ.data ?? []), [unlockedQ.data]);
  const [restoring, setRestoring] = useState(false);
  const restore = async () => { setRestoring(true); try { await claimMyOrders(); await unlockedQ.refetch(); } finally { setRestoring(false); } };

  const allTopics = useMemo(() => courses.flatMap((c) => [...c.units.flatMap((u) => u.topics), ...c.topics].map((t) => ({ c, t }))), [courses]);
  // Restore last topic (or first) once data arrives.
  useEffect(() => {
    if (!courses.length || (topicId && allTopics.some((x) => x.t.id === topicId))) { if (courses.length && !openCourse) { const owner = allTopics.find((x) => x.t.id === topicId)?.c ?? courses[0]; setOpenCourse(owner.id); } return; }
    const first = allTopics[0]; if (first) { setTopicId(first.t.id); setOpenCourse(first.c.id); }
  }, [courses, allTopics, topicId, openCourse]);
  useEffect(() => { if (topicId && !demo) try { localStorage.setItem(LAST_TOPIC_KEY, topicId); } catch { /* ignore */ } }, [topicId, demo]);

  const current = allTopics.find((x) => x.t.id === topicId);
  const accent = NEON.yellow;

  // CONTINUE WATCHING — every in-progress set across the whole tree, most recent first.
  const continueRail = useMemo(() => {
    const items: { set: StudentSet; topic: StudentTopic; p: Prog }[] = [];
    for (const { t } of allTopics) for (const s of t.sets) { const p = progress[s.id]; if (p?.state === "in_progress") items.push({ set: s, topic: t, p }); }
    // A topic can sit under several cumulative exams — dedupe by set id, keep the first.
    const seen = new Set<string>();
    return items.filter((i) => (seen.has(i.set.id) ? false : (seen.add(i.set.id), true))).sort((a, b) => b.p.updatedAt - a.p.updatedAt).slice(0, 12);
  }, [allTopics, progress]);

  // HONEST-PAYWALL: the paywall shows ONLY on an explicit "locked" answer from the server.
  // Network/server failures get a retryable toast — never "you haven't paid" over a wifi blip.
  const [fetchNote, setFetchNote] = useState<{ msg: string; retry?: () => void } | null>(null);
  // EVERY SET STARTS AT CRAM (see-what's-coming → try-it → watch-Lee-work-it); other stages
  // are reached through the flow or a deep link. Paid sets fetch their withheld id PER STAGE.
  const openSet = async (t: StudentTopic, s: StudentSet, stage: SetStage = "cram") => {
    if (stage === "practice") {
      // Practice needs no playback id — fetchSetPractice does its own server-side gate.
      if (s.access === "paid" && !unlockedTopics.has(t.id)) { setPaywallTopic(t); return; }
      setPlaying({ set: s, topic: t, stage });
      return;
    }
    if (s.access === "paid") {
      if (!unlockedTopics.has(t.id)) { setPaywallTopic(t); return; }
      // Unlocked paid set — fetch the withheld playback id securely (server re-checks the grant).
      try {
        const r = await getSetPlayback({ data: { setId: s.id, stage } });
        setFetchNote(null);
        if (r.status === "ok") setPlaying({ set: stage === "review" ? { ...s, reviewPlaybackId: r.playbackId } : { ...s, playbackId: r.playbackId }, topic: t, stage });
        else if (r.status === "locked") setPaywallTopic(t);
        else if (r.status === "unpublished") setFetchNote({ msg: "This video isn't published yet — check back soon." });
        else setFetchNote({ msg: "Couldn't find that video — refresh and try again." });
      } catch { setFetchNote({ msg: "Couldn't reach the server — check your connection.", retry: () => void openSet(t, s, stage) }); }
      return;
    }
    const pid = stage === "review" ? s.reviewPlaybackId : s.playbackId;
    if (!pid) { setFetchNote({ msg: "This video isn't published yet — check back soon." }); return; }
    setPlaying({ set: s, topic: t, stage });
  };

  // DEEP LINK (?topic&set&stage) — consumed ONCE when the tree is ready: land exactly where
  // "continue where you left off" pointed. Invalid ids fall through to normal topic entry.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !search.set || !courses.length) return;
    const hit = allTopics.find((x) => x.t.sets.some((s) => s.id === search.set));
    if (!hit) return;
    deepLinked.current = true;
    const s = hit.t.sets.find((x) => x.id === search.set)!;
    setTopicId(hit.t.id);
    void openSet(hit.t, s, search.stage ?? "cram");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, allTopics, search.set, search.stage]);

  // Per-course / per-unit completion — the outline's progress bars.
  const doneOf = (sets: StudentSet[]) => sets.filter((s) => progress[s.id]?.state === "complete").length;
  const unitStats = (ts: StudentTopic[]) => { let d = 0, n = 0; for (const t of ts) { d += doneOf(t.sets); n += t.sets.length; } return { d, n }; };

  // One outline topic row — shared between exam-unit groups and the loose (un-grouped) topics.
  const topicRow = (t: StudentTopic) => {
    const active = t.id === topicId;
    const locked = t.sets.length > 0 && t.sets.every((s) => s.access === "paid") && !unlockedTopics.has(t.id);
    const done = doneOf(t.sets);
    const allDone = done > 0 && done === t.sets.length;
    return (
      <button key={t.id} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-white/5" style={{ background: active ? "rgba(252,163,17,0.10)" : "transparent" }} onClick={() => { setTopicId(t.id); setMapOpen(false); }} title={`${t.name} · ${t.sets.length} video${t.sets.length === 1 ? "" : "s"}`}>
        {locked ? <Lock className="h-3 w-3 shrink-0" style={{ color: "#F0B24A" }} /> : allDone ? <CircleCheck className="h-3 w-3 shrink-0" style={{ color: "#3BF5A0" }} /> : done > 0 ? <CircleDot className="h-3 w-3 shrink-0" style={{ color: NEON.cyan }} /> : <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: "rgba(147,160,180,0.5)" }} />}
        <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: active ? NEON.yellow : NEON.text }}>{campusId && t.number != null ? `Ch ${t.number} · ${t.name}` : t.name}</span>
        <span className="shrink-0 text-[9px] tabular-nums" style={{ color: done > 0 ? "#3BF5A0" : NEON.muted }}>{done > 0 ? `${done}/${t.sets.length}` : t.sets.length}</span>
      </button>
    );
  };

  // Thin completion bar — sits under course headers and unit labels once anything is done.
  const progressBar = (d: number, n: number) =>
    n > 0 ? (
      <span className="mx-1 mb-1 block h-[3px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.round((d / n) * 100)}%`, background: d === n ? "#3BF5A0" : NEON.cyan, transition: "width 300ms" }} />
      </span>
    ) : null;

  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setPlaying(null); setPaywallTopic(null); setMapOpen(false); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  // The COURSE MAP body — one markup, two containers (the wide sidebar / the narrow sheet).
  const courseMap = (
    <>
      {isLoading && <p className="flex items-center gap-1.5 px-1.5 py-2 text-[11px] italic" style={{ color: NEON.muted }}><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>}
      {isError && <p className="px-1.5 py-2 text-[11px]" style={{ color: "#F3C6CC" }}>Couldn't load the course map. <button className="underline" onClick={() => q.refetch()}>Retry</button></p>}
      {!isLoading && !isError && courses.length === 0 && <p className="px-1.5 py-2 text-[11px] italic leading-snug" style={{ color: NEON.muted }}>No live videos yet — check back soon.</p>}
      {courses.map((c) => {
        const cOpen = openCourse === c.id;
        const cs = unitStats([...c.units.flatMap((u) => u.topics), ...c.topics]);
        return (
          <div key={c.id} className="mb-0.5">
            <button className="flex w-full items-center gap-1 rounded px-1 py-1 text-left hover:bg-white/5" style={{ color: NEON.yellow }} onClick={() => setOpenCourse((k) => (k === c.id ? null : c.id))}>
              {cOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-[12px] font-black uppercase tracking-wide">{c.name}</span>
              {cs.n > 0 && cs.d > 0 && <span className="shrink-0 text-[9px] tabular-nums" style={{ color: cs.d === cs.n ? "#3BF5A0" : NEON.muted }}>{cs.d}/{cs.n}</span>}
            </button>
            {cs.d > 0 && progressBar(cs.d, cs.n)}
            {cOpen && (
              <div className="ml-2 border-l pl-2" style={{ borderColor: NEON.borderSoft }}>
                {/* Exam-unit groups first, then any topics not in a unit (loose). */}
                {c.units.map((u) => {
                  const us = unitStats(u.topics);
                  return (
                    <div key={u.id} className="mb-1">
                      <div className="flex items-baseline gap-1 px-1 pt-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>{u.name}</span>
                        {us.d > 0 && <span className="text-[8.5px] tabular-nums" style={{ color: us.d === us.n ? "#3BF5A0" : NEON.muted }}>{us.d}/{us.n}</span>}
                      </div>
                      {us.d > 0 && progressBar(us.d, us.n)}
                      {u.topics.map(topicRow)}
                    </div>
                  );
                })}
                {c.topics.map(topicRow)}
                {c.units.length === 0 && c.topics.length === 0 && <div className="px-1.5 py-1 text-[10px] italic" style={{ color: NEON.muted }}>No topics yet</div>}
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  // Small continue-watching tile — thumbnail (when published), watched strip, time-left badge.
  const railTile = ({ set, topic, p }: { set: StudentSet; topic: StudentTopic; p: Prog }) => {
    const frac = p.durationSec ? Math.min(1, p.positionSec / p.durationSec) : 0;
    const hasThumb = !!set.playbackId && set.playbackId !== DEMO_PLAYBACK;
    return (
      <button key={set.id} className="group w-[200px] shrink-0 overflow-hidden rounded-xl text-left transition-transform hover:-translate-y-0.5" style={{ background: "linear-gradient(160deg, #12203E, #070C1A)", border: `1px solid ${NEON.borderSoft}` }} onClick={() => void openSet(topic, set)} title={`Resume ${set.name}`}>
        <div className="relative grid place-items-center" style={{ aspectRatio: "16 / 9", borderBottom: `1px solid ${NEON.borderSoft}` }}>
          {hasThumb ? (
            <img src={muxThumb(set.playbackId!)} alt="" loading="lazy" className="absolute inset-0 h-full w-full" style={{ objectFit: "cover" }} />
          ) : (
            <span className="inline-block h-8" style={{ width: 20 }}><Bolt c1="#C62828" c2="#1565C0" /></span>
          )}
          <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100" style={{ background: "rgba(4,7,14,0.5)" }}><Play className="h-5 w-5" style={{ color: "#fff" }} /></span>
          {p.durationSec != null && <span className="absolute bottom-1 right-1 rounded px-1 py-0.5 text-[8.5px] font-bold tabular-nums" style={{ background: "rgba(4,7,14,0.8)", color: "#e8ecf5" }}>{fmtRuntime(Math.max(0, p.durationSec - p.positionSec))} left</span>}
          {frac > 0 && (
            <span className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: "rgba(255,255,255,0.12)" }}>
              <span className="absolute bottom-0 left-0 top-0" style={{ width: `${Math.round(frac * 100)}%`, background: NEON.cyan }} />
            </span>
          )}
        </div>
        <div className="px-2.5 py-1.5">
          <div className="truncate text-[11px] font-bold" style={{ color: NEON.text }}>{set.name}</div>
          <div className="truncate text-[9px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>{chip(topic)}</div>
        </div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "#070B14", color: NEON.text, fontFamily: "'Rubik', system-ui, sans-serif" }}>
      {/* NAVBAR — mirrors the Study Canvas navbar shell */}
      <div className="flex h-11 shrink-0 items-center gap-2 px-3" style={{ background: "rgba(9,14,26,0.97)", borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <span className="inline-block h-5 w-4"><BrandLogo mode="bolt" c1="#C62828" c2="#1565C0" size={20} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.12em]" style={{ color: NEON.text }}>Survive · Learn</span>
        {demo && <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider" style={{ color: "#0B1322", background: NEON.cyan }}>Demo</span>}
        <div className="min-w-0 flex-1" />
        {campuses.length > 0 && (
          <select
            className="max-w-[190px] truncate rounded-lg px-1.5 py-1 text-[11px] font-bold outline-none"
            style={{ background: "transparent", color: campusId ? NEON.cyan : NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
            value={campusId ?? ""}
            onChange={(e) => setCampusId(e.target.value || null)}
            title="View chapter numbering + order as a specific campus's textbook"
          >
            <option value="">Default view</option>
            {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {userId ? (
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[180px] truncate text-[11px] sm:inline" style={{ color: NEON.muted }} title={email ?? undefined}>{email}</span>
            <button className="grid h-7 w-7 place-items-center rounded-lg" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={signOut} title="Sign out"><LogOut className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold" style={{ color: "#0B1322", background: NEON.yellow }} onClick={() => setSignInOpen(true)}><Mail className="h-3.5 w-3.5" /> Sign in</button>
        )}
      </div>

      {/* NARROW: the course map lives behind a button + sheet instead of a fixed sidebar. */}
      {isNarrow && (
        <div className="flex h-10 shrink-0 items-center gap-2 px-3" style={{ background: "rgba(9,14,26,0.8)", borderBottom: `1px solid ${NEON.borderSoft}` }}>
          <button className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-bold" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setMapOpen(true)}>
            <ListTree className="h-3.5 w-3.5 shrink-0" style={{ color: NEON.yellow }} />
            <span className="truncate">{current ? (campusId && current.t.number != null ? `Ch ${current.t.number} · ${current.t.name}` : current.t.name) : "Course map"}</span>
            <ChevronDown className="h-3 w-3 shrink-0" style={{ color: NEON.muted }} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* OUTLINE — Course › Topic › CEQ Set (live only), accordion. Hidden on narrow. */}
        {!isNarrow && (
          <aside className="w-[264px] shrink-0 overflow-y-auto px-1.5 py-2" style={{ borderRight: `1px solid ${NEON.borderSoft}`, background: "rgba(9,14,26,0.6)" }}>
            <div className="px-1 pb-1 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: NEON.muted }}>Course map</div>
            {courseMap}
          </aside>
        )}

        {/* MAIN — continue-watching rail + the selected topic's video-poster grid */}
        <main className="min-w-0 flex-1 overflow-y-auto" style={{ padding: isNarrow ? 14 : 24 }}>
          {demo && (
            <div className="mb-4 rounded-xl px-3.5 py-2.5 text-[11.5px]" style={{ border: `1px dashed rgba(56,217,245,0.5)`, color: NEON.cyan }}>
              <b>Demo preview.</b> Placeholder content — nothing here is live and nothing is saved to the server. Drop <span style={{ fontFamily: "monospace" }}>?demo=1</span> from the URL for real data.
            </div>
          )}
          {isLoading && <div className="grid h-full place-items-center text-[12px]" style={{ color: NEON.muted }}><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your videos…</div>}
          {isError && <div className="grid h-full place-items-center text-[12px]" style={{ color: "#F3C6CC" }}>Something went wrong loading videos. <button className="ml-1 underline" onClick={() => q.refetch()}>Retry</button></div>}
          {!isLoading && !isError && !current && courses.length > 0 && <div className="grid h-full place-items-center text-[12px]" style={{ color: NEON.muted }}>Pick a topic from the course map.</div>}
          {!isLoading && !isError && courses.length === 0 && (
            <div className="grid h-full place-items-center text-center">
              <div><div className="mx-auto mb-3 inline-block h-16"><BoltBoil height={64} /></div><p className="text-[13px] font-bold" style={{ color: NEON.text }}>Cram videos are on the way.</p><p className="mt-1 text-[11.5px]" style={{ color: NEON.muted }}>Nothing is live yet — check back soon.</p></div>
            </div>
          )}
          {continueRail.length > 0 && current && (
            <div className="mb-6">
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: NEON.muted }}>Continue watching</div>
              <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>{continueRail.map(railTile)}</div>
            </div>
          )}
          {current && (
            <>
              <div className="mb-4 flex items-baseline gap-2">
                <h1 className="text-[20px] font-black" style={{ color: NEON.text }}>{current.t.name}</h1>
                <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>{current.c.name} · {current.t.sets.length} video{current.t.sets.length === 1 ? "" : "s"}</span>
              </div>
              {current.t.sets.length === 0 ? (
                <div className="grid place-items-center rounded-2xl py-16 text-center text-[12px]" style={{ border: `1px dashed ${NEON.borderSoft}`, color: NEON.muted }}>No videos in this topic yet.</div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${isNarrow ? 150 : 240}px, 1fr))` }}>
                  {current.t.sets.map((s) => <SetPoster key={s.id} set={s} topicChip={chip(current.t)} accent={accent} prog={progress[s.id]} unlocked={unlockedTopics.has(current.t.id)} demo={demo} onOpen={() => void openSet(current.t, s)} />)}
                </div>
              )}
              {/* PRACTICE PLACEHOLDER — the sets already carry their CEQ counts; the student
                  practice player is a future pass, so this states what will live here. */}
              {current.t.sets.some((s) => s.ceqCount > 0) && (
                <div className="mt-5 flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ border: `1px dashed ${NEON.borderSoft}` }}>
                  <Zap className="h-4 w-4 shrink-0" style={{ color: NEON.yellow }} />
                  <div className="min-w-0">
                    <div className="text-[12px] font-black uppercase tracking-wide" style={{ color: NEON.text }}>Practice questions</div>
                    <div className="text-[11.5px]" style={{ color: NEON.muted }}>{current.t.sets.reduce((a, s) => a + s.ceqCount, 0)} questions are authored for {current.t.name} — the practice player lands here soon.</div>
                  </div>
                  <span className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>Coming soon</span>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* NARROW course-map sheet — same map markup as the sidebar, full-screen. */}
      {isNarrow && mapOpen && (
        <div className="fixed inset-0 z-[95] flex flex-col" style={{ background: "rgba(4,7,14,0.96)" }}>
          <div className="flex h-11 shrink-0 items-center gap-2 px-3" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
            <span className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: NEON.muted }}>Course map</span>
            <button className="ml-auto grid h-8 w-8 place-items-center rounded-full" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setMapOpen(false)} title="Close"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{courseMap}</div>
        </div>
      )}

      {playing && (
        <SetPlayer
          key={`${playing.set.id}:${playing.stage}`}
          set={playing.set}
          sets={playing.topic.sets}
          stage={playing.stage}
          chipText={chip(playing.topic)}
          startAt={playing.stage === "cram" && progress[playing.set.id]?.state === "in_progress" ? (progress[playing.set.id]?.positionSec ?? 0) : 0}
          demo={demo}
          onClose={() => setPlaying(null)}
          onStarted={() => markProgress(playing.set.id, "in_progress")}
          onComplete={() => markProgress(playing.set.id, "complete")}
          onPosition={(pos, dur) => markPosition(playing.set.id, pos, dur)}
          onGoto={(setId, stage) => {
            const target = playing.topic.sets.find((s) => s.id === setId);
            if (target) void openSet(playing.topic, target, stage);
          }}
        />
      )}
      {paywallTopic && <Paywall topic={paywallTopic} campusName={campuses.find((c) => c.id === campusId)?.name ?? null} campusId={campusId} demo={demo} onClose={() => setPaywallTopic(null)} onRestore={userId ? restore : undefined} restoring={restoring} />}
      {signInOpen && <SignInDialog onClose={() => setSignInOpen(false)} />}
      {/* HONEST-PAYWALL: retryable fetch-failure toast — the honest alternative to a false paywall. */}
      {fetchNote && (
        <div className="fixed bottom-4 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold shadow-xl" style={{ background: "#141a2c", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>
          <span>{fetchNote.msg}</span>
          {fetchNote.retry && <button className="rounded-lg px-2.5 py-1 text-[11.5px] font-black uppercase tracking-wide" style={{ background: NEON.yellow, color: "#0B1322" }} onClick={fetchNote.retry}>Retry</button>}
          <button className="text-[11px] font-bold" style={{ color: NEON.muted }} onClick={() => setFetchNote(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
