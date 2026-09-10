// HOME (learn v4, 09-09) — the short-form cram feed, not a dashboard.
//
// SIMPLIFIED FROM v3 (09-03). v3 opened on three plan-toggle cards, a live "Your study time"
// block, a row of topic filter chips, then Cram/Practice/Study-tools/Big-Workout-Problems/Review
// rows. That is an LMS dashboard's shape — a control panel between the student and the first
// video. The product is "Like YouTube Shorts for exam prep.", so the shell now gets out of the
// way: a one-line product tagline, then straight into topic rows of vertical shorts, each row
// closing with one small "finished this topic?" prompt instead of a separate aggregate Practice
// section competing for attention up top.
//
// REMOVED FROM THIS VIEW, NOT DELETED FROM THE CODEBASE: the plan-card toggles (Plan/PlanTimes
// stay exported — planTimes() still feeds the "you" summary line and can back a future settings
// surface), the topic chip filter, the Study Tools and Big Workout Problems rows (both were
// "Coming soon" placeholders with no real content yet — nothing here removes a real feature),
// and the standalone cross-topic Practice row (practice is now reached per-topic, per the new
// end-of-row prompt, or from a set's own practice stage inside the player — same onOpenSet(id,
// true) call every "Practice" control on this page has always used).
//
// THE PHONE PASS (Lee, 2026-09-10):
//   · EASY POINTS IS FREE, THE REST IS AN EMAIL AWAY. Topic 1 reads "Easy Points · Exam 1 · Free".
//     Every later topic renders collapsed (name, "N videos", chevron); opening one shows its row
//     BLURRED under one box — "Unlock the rest of Exam 1 — free", an email, a button. One submit
//     (submitIntake, kind notify_exam, source learn-gate) un-blurs every later topic and marks
//     the device (learn-gate.ts UNLOCK_KEY) so it never asks again. Signed-in students skip it.
//     Exam 1 stays free: this is an email gate, not a paywall. The Paywall (paid topics) is
//     untouched and still opens from a locked card.
//   · PRACTICE says "Practice" + "N questions" — the topic's real ceqCount sum, nothing more —
//     and asks once, softly, when nothing in the topic has been watched ("Ten minutes of videos
//     first. They make these questions land." → Watch first / Practice anyway).
//   · "5 shorts" → "5 videos", the minutes only when every video has a runtime.
//   · THE REVIEW ROW IS GONE (Lee: remove it). In its place: the exam reminder (the homepage's
//     ExamReminder, mounted as-is) and a one-line footer — Home · Sign in/out · Share · Leave a
//     review — which is what the "You" row became.
//
// Every number on this page is still a sum of real runtimes and real question counts — nothing
// invented. Where a topic has no runtime data yet, it just doesn't claim a duration (no fake
// "~12 min"), per the "manageable, not overwhelming" rule.
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, Lock } from "lucide-react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { ExamReminder } from "@/components/site/home-two-door/ExamReminder";
import { INK, type LearnTheme } from "@/components/learn/learn-theme";
import { fmtRuntime, muxThumb } from "@/components/learn/cram-media";
import { EMAIL_RE, emailGateNeeded, isUuid, practiceGateNeeded, questionCount, topicDetail, writeUnlocked, type GateSet } from "@/components/learn/learn-gate";
import type { RailKey } from "@/components/learn/LearnRail";
import { submitIntake } from "@/lib/intake.functions";
import type { StudentSet, StudentTopic } from "@/lib/student.functions";
import { useDismiss } from "@/lib/use-dismiss";

export type HomeSet = {
  set: StudentSet; topic: StudentTopic; n: number; of: number; locked: boolean; done: boolean;
  /** Fraction of the runtime reached, when the player reported a duration. */
  watched: number;
  /** Progress says in_progress or complete — play was pressed at least once (the soft gate's test). */
  started: boolean;
  playable: boolean;
};

export type Plan = { practice: boolean; review: boolean };
export type PlanTimes = { cramSec: number; cramCount: number; avgCramSec: number | null; practiceSec: number; practiceCount: number; problemsCount: number; reviewSec: number; reviewCount: number };

export function planTimes(sets: HomeSet[]): PlanTimes {
  const cram = sets.filter((s) => !!s.set.playbackId && !s.locked);
  const cramSec = cram.reduce((a, s) => a + (s.set.runtimeSec ?? 0), 0);
  const withRt = cram.filter((s) => s.set.runtimeSec != null);
  const practiceCount = sets.filter((s) => !s.locked).reduce((a, s) => a + s.set.ceqCount, 0);
  const review = sets.filter((s) => s.set.hasReview && !s.locked);
  return {
    cramSec, cramCount: cram.length, avgCramSec: withRt.length ? cramSec / withRt.length : null,
    practiceSec: practiceCount * 40, practiceCount, problemsCount: 0,
    reviewSec: review.reduce((a, s) => a + (s.set.reviewRuntimeSec ?? 0), 0), reviewCount: review.length,
  };
}
export function fmtMins(sec: number): string { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60 ? `${m % 60}` : ""}`.trim() : `${Math.max(1, m)} min`; }

function topicSectionId(id: string): string { return `lk-topic-${id}`; }

/** What the gate rules see of a row's set. A paid set's video id is withheld, not absent. */
function gateSetOf(s: HomeSet): GateSet {
  return { hasVideo: !!s.set.playbackId || s.locked, locked: s.locked, started: s.started || s.done, runtimeSec: s.set.runtimeSec, ceqCount: s.set.ceqCount };
}

export const LearnHome = forwardRef<HTMLDivElement, {
  sets: HomeSet[];
  topics: StudentTopic[];
  /** Kept in the props contract (LearnShell still computes it) even though the chip filter UI is
   *  gone from this view — a future settings surface can reintroduce filtering without touching
   *  the parent. */
  chip: string | null;
  onChip: (topicId: string | null) => void;
  plan: Plan;
  onPlan: (p: Plan) => void;
  daysOut: number | null;
  examLabel: string;
  comingExams: string[];
  theme: LearnTheme;
  narrow: boolean;
  onStart: () => void;
  onOpenSet: (setId: string, practice?: boolean) => void;
  onLocked: (topic: StudentTopic) => void;
  rowRef: (key: RailKey) => (el: HTMLElement | null) => void;
  you: { email: string | null; userId: string | null; onSignIn: () => void; signOut: () => void; onShare: () => void; done: number; total: number };
  /** For the reminder block and the email gate's context. */
  campusId: string | null;
  courseCode: string | null;
  demo: boolean;
  /** The email gate has been passed on this device (learn-gate.ts UNLOCK_KEY). */
  unlocked: boolean;
  onUnlocked: () => void;
}>(function LearnHome({ sets, examLabel, theme, narrow, onOpenSet, onLocked, rowRef, you, campusId, courseCode, demo, unlocked, onUnlocked }, ref) {
  const byTopic = useMemo(() => {
    const m = new Map<string, HomeSet[]>();
    for (const s of sets) { const arr = m.get(s.topic.id) ?? []; arr.push(s); m.set(s.topic.id, arr); }
    return [...m.entries()].map(([id, arr]) => ({ topic: arr[0].topic, id, sets: arr }));
  }, [sets]);
  const pad = narrow ? "0 16px" : "0 32px";
  const signedIn = !!you.userId;

  // Later topics start collapsed; a tap opens one. (Easy Points is always open.)
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // The soft gate's sheet: which topic asked, what "Watch first" opens, what "anyway" opens.
  const [practiceAsk, setPracticeAsk] = useState<{ watchId: string; practiceId: string } | null>(null);
  const tryPractice = (ts: HomeSet[], practiceId: string) => {
    const first = ts.find((s) => !!s.set.playbackId && !s.locked);
    if (first && practiceGateNeeded(ts.map(gateSetOf))) { setPracticeAsk({ watchId: first.set.id, practiceId }); return; }
    onOpenSet(practiceId, true);
  };

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      <div className="flex flex-col" style={{ gap: narrow ? 26 : 34, paddingTop: narrow ? 18 : 26, paddingBottom: 40 }}>
        {/* THE PRODUCT LINE — states the product before the product starts. Part of the app (body
            type, not a marketing hero), but the one line that has to land before a single video
            does, so a first-time visitor never wonders what this even is. */}
        <div style={{ padding: pad }}>
          <p className="lk-disp" style={{ fontSize: narrow ? 19 : 23, lineHeight: 1.2, color: INK.text }}>
            Like <span style={{ color: "var(--lk-acc)" }}>YouTube Shorts</span> for exam prep.
          </p>
          <p className="mt-1 text-[13px]" style={{ fontFamily: BRAND_SANS, color: INK.muted }}>
            Three minutes or less. Watch the topic, then practice it.
          </p>
        </div>

        {/* CRAM ROWS — one per topic, the primary structure of the page. First topic, first short
            sit right under the product line — no control panel between the student and the video. */}
        {byTopic.map(({ id, topic, sets: ts }, i) => {
          const first = i === 0;
          const expanded = first || !!open[id];
          const gated = emailGateNeeded(i, signedIn, unlocked);
          return (
            <section key={id} id={topicSectionId(id)} ref={first ? rowRef("cram") : undefined} style={{ padding: pad }} className="flex flex-col gap-3">
              <TopicHead topic={topic} sets={ts} theme={theme} first={first} examLabel={examLabel} expanded={expanded} onToggle={first ? null : () => setOpen((m) => ({ ...m, [id]: !expanded }))} />
              {expanded && (
                <div className="relative">
                  {/* FOUR FRAMES, THEN PRACTICE (Lee, 2026-09-10): "four cram frames in the middle,
                      practice pinned right, so it's 5 total vertical frames. Odd numbers tend to
                      appear cleaner." More than four: "fade out on the right side of the last one,
                      a show-more arrow makes it clear there's more." */}
                  <div className="flex items-stretch" style={{ gap: narrow ? 8 : 12, filter: gated ? "blur(6px)" : undefined, pointerEvents: gated ? "none" : undefined }} aria-hidden={gated || undefined}>
                    <CramStrip sets={ts} narrow={narrow} onOpen={(s) => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id))} />
                    <PracticeFrame topic={topic} sets={ts} narrow={narrow} onPractice={(setId) => tryPractice(ts, setId)} onLocked={onLocked} />
                  </div>
                  {gated && <EmailGate examLabel={examLabel} topicName={topic.name} campusId={campusId} demo={demo} onUnlocked={onUnlocked} />}
                </div>
              )}
            </section>
          );
        })}

        {/* THE END OF THE PAGE: when's the exam (the homepage's own block, mounted as-is), then one
            line of footer — the "You" row folded into it. */}
        <footer ref={rowRef("you")} className="flex flex-col gap-2" style={{ padding: pad }}>
          <ExamReminder campusId={campusId} courseCode={courseCode} />
          <nav aria-label="Page" className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px]" style={{ color: INK.muted, borderTop: `1px solid ${INK.border}`, paddingTop: 14, fontFamily: BRAND_SANS }}>
            <a href="/" style={FOOT_LINK}>Home</a>
            <Dot />
            {you.userId ? (
              <>
                <span className="max-w-[200px] truncate" style={{ color: INK.text }} title={you.email ?? undefined}>{you.email}</span>
                <Dot />
                <button type="button" onClick={you.signOut} style={FOOT_BTN}>Sign out</button>
              </>
            ) : (
              <button type="button" onClick={you.onSignIn} style={FOOT_BTN}>Sign in</button>
            )}
            <Dot />
            <button type="button" onClick={you.onShare} style={FOOT_BTN}>Share with a friend</button>
            <Dot />
            <a href="/#reviews" style={FOOT_LINK}>Leave a review</a>
          </nav>
        </footer>
      </div>

      {practiceAsk && (
        <PracticeAskSheet
          onWatch={() => { const id = practiceAsk.watchId; setPracticeAsk(null); onOpenSet(id); }}
          onAnyway={() => { const id = practiceAsk.practiceId; setPracticeAsk(null); onOpenSet(id, true); }}
          onClose={() => setPracticeAsk(null)}
        />
      )}
    </div>
  );
});

const FOOT_LINK = { color: INK.text, textDecoration: "none", fontWeight: 600 } as const;
const FOOT_BTN = { ...FOOT_LINK, background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" } as const;
function Dot() { return <span aria-hidden style={{ color: INK.dim }}>·</span>; }

/** "⚡ Cram — Easy Points · Exam 1 [Free] — 5 videos · ~12 min". The count is always real; the
 *  duration only appears when every video in the topic has a real runtime — never a made-up
 *  number. Later topics are a button: name, count, chevron; the row opens beneath. */
function TopicHead({ topic, sets, theme, first, examLabel, expanded, onToggle }: {
  topic: StudentTopic; sets: HomeSet[]; theme: LearnTheme; first: boolean; examLabel: string; expanded: boolean;
  /** null = always open (Easy Points). */
  onToggle: (() => void) | null;
}) {
  const detail = topicDetail(sets.map(gateSetOf));
  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase" style={{ letterSpacing: "0.12em", color: INK.muted }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill={theme.accent}><path d="M13 2 L4 14 h7 l-1 8 l9 -12 h-7 z" /></svg>
        Cram
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="lk-disp" style={{ fontSize: 19 }}>{topic.name}</span>
        {first && (
          <>
            <span aria-hidden className="text-[13px]" style={{ color: INK.dim }}>·</span>
            <span className="text-[13px]" style={{ color: INK.muted }}>{examLabel}</span>
            <span className="self-center rounded-full px-1.5 py-px text-[9.5px] font-black uppercase tracking-wider" style={{ background: "var(--lk-acc)", color: "var(--lk-acc-ink)" }}>Free</span>
          </>
        )}
        <span className="text-[13px]" style={{ color: INK.muted }}>{detail}</span>
      </div>
    </div>
  );
  if (!onToggle) return <div className="flex items-center">{body}</div>;
  return (
    <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-3 text-left" style={{ background: "transparent", border: 0, padding: 0, color: INK.text, cursor: "pointer", fontFamily: "inherit" }}>
      {body}
      <ChevronDown className="h-5 w-5 shrink-0" style={{ color: INK.muted, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 160ms" }} aria-hidden />
    </button>
  );
}

/** THE EMAIL GATE — floats over a blurred row. Not a paywall: Exam 1 is free, this asks for the
 *  one thing that lets us send the rest. Submits through the unified intake (kind notify_exam,
 *  source learn-gate); success un-blurs every later topic and marks the device. Demo mode never
 *  writes a row (its ids are fake) but still unlocks, so the flow can be walked. */
function EmailGate({ examLabel, topicName, campusId, demo, onUnlocked }: { examLabel: string; topicName: string; campusId: string | null; demo: boolean; onUnlocked: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"open" | "busy" | "error">("open");
  const [msg, setMsg] = useState("");
  const submit = async () => {
    const e = email.trim();
    if (state === "busy") return;
    if (!EMAIL_RE.test(e)) { setState("error"); setMsg("Enter a valid email."); return; }
    setState("busy");
    try {
      if (!demo) await submitIntake({ data: { kind: "notify_exam", email: e, topic: topicName, campusId: isUuid(campusId) ? campusId : null, sourcePath: "/learn", source: "learn-gate" } });
      writeUnlocked();
      onUnlocked();
    } catch { setState("error"); setMsg("Couldn't save that — try again in a moment."); }
  };
  return (
    <div className="absolute inset-0 grid place-items-center p-2">
      <div className="lk-card lk-in w-full max-w-[320px] p-4" style={{ boxShadow: "0 18px 50px -14px rgba(0,0,0,0.9)", fontFamily: BRAND_SANS }}>
        <p className="lk-disp" style={{ fontSize: 16, lineHeight: 1.2 }}>Unlock the rest of {examLabel} — free</p>
        <input type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu" className="lk-field mt-3" value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("open"); }} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} aria-label="Your email" />
        {state === "error" && <p className="mt-1.5 text-[12px]" style={{ color: INK.red }}>{msg}</p>}
        <button type="button" onClick={() => void submit()} disabled={state === "busy"} className="lk-btn lk-btn-acc mt-2 w-full disabled:opacity-50" style={{ minHeight: 44 }}>
          {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Unlock
        </button>
      </div>
    </div>
  );
}

/** THE SOFT GATE — one small sheet, one big button, one quiet way past it. */
function PracticeAskSheet({ onWatch, onAnyway, onClose }: { onWatch: () => void; onAnyway: () => void; onClose: () => void }) {
  useDismiss<HTMLDivElement>(onClose, { outside: false });
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div role="dialog" aria-label="Watch first" className="lk-in w-full rounded-t-2xl p-5 sm:max-w-[400px] sm:rounded-2xl" style={{ background: INK.surface, border: `1px solid ${INK.border}`, color: INK.text, paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }} onClick={(e) => e.stopPropagation()}>
        <p className="lk-disp" style={{ fontSize: 18, lineHeight: 1.25 }}>Ten minutes of videos first. They make these questions land.</p>
        <button type="button" onClick={onWatch} className="lk-btn lk-btn-acc mt-4 w-full" style={{ minHeight: 50, fontSize: 13 }}>Watch first</button>
        <button type="button" onClick={onAnyway} className="mt-2 w-full py-2 text-[12.5px] underline underline-offset-2" style={{ background: "transparent", border: 0, color: INK.muted, cursor: "pointer", fontFamily: "inherit" }}>Practice anyway</button>
      </div>
    </div>
  );
}

const SHORT_W = { wide: 152, narrow: 118 };
const SHORT_H = { wide: 270, narrow: 210 };
/** How many cram frames sit in view before the fade: four (Lee), and whatever fits on a phone. */
const FRAMES_IN_VIEW = 4;

/** THE CRAM STRIP — up to four frames wide; when the topic has more, the last visible one fades
 *  at the right edge and an arrow scrolls the strip by one frame. The fade and the arrow exist
 *  only while there is more to the right, so a four-video topic shows neither. */
function CramStrip({ sets, narrow, onOpen }: { sets: HomeSet[]; narrow: boolean; onOpen: (s: HomeSet) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  const gap = narrow ? 8 : 12;
  const w = narrow ? SHORT_W.narrow : SHORT_W.wide;
  const maxW = FRAMES_IN_VIEW * w + (FRAMES_IN_VIEW - 1) * gap;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const check = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => { el.removeEventListener("scroll", check); ro?.disconnect(); };
  }, [sets.length]);
  const next = () => { ref.current?.scrollBy({ left: w + gap, behavior: "smooth" }); };
  return (
    <div className="relative min-w-0" style={{ maxWidth: maxW, flex: "0 1 auto" }}>
      <div ref={ref} className="lk-scroll-x" style={{ gap }}>
        {sets.map((s) => <Short key={s.set.id} s={s} narrow={narrow} onOpen={() => onOpen(s)} />)}
      </div>
      {more && (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0" style={{ width: narrow ? 44 : 64, background: "linear-gradient(to right, rgba(17,17,17,0), var(--lk-bg))" }} />
          <button type="button" onClick={next} aria-label="More videos" className="absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-full" style={{ width: 34, height: 34, background: "var(--lk-text)", color: "#111", border: 0, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}

/** PRACTICE, PINNED FAR RIGHT — the fifth frame. The one place practice is offered for a topic:
 *  after its videos, not after every single one. "Practice" and the real question count, nothing
 *  else (Lee, 2026-09-10). Dimmed until the topic has questions to practice. */
function PracticeFrame({ topic, sets, narrow, onPractice, onLocked }: {
  topic: StudentTopic; sets: HomeSet[]; narrow: boolean;
  onPractice: (setId: string) => void;
  onLocked: (topic: StudentTopic) => void;
}) {
  const practiceable = sets.find((s) => s.set.ceqCount > 0 && !s.locked);
  const locked = !practiceable && sets.some((s) => s.locked);
  const ready = !!practiceable || locked;
  const n = questionCount(sets.map(gateSetOf));
  return (
    <button
      type="button"
      onClick={() => { if (locked) onLocked(topic); else if (practiceable) onPractice(practiceable.set.id); }}
      disabled={!ready}
      className="lk-card flex shrink-0 flex-col justify-between p-3 text-left"
      style={{ width: narrow ? SHORT_W.narrow : SHORT_W.wide, height: narrow ? SHORT_H.narrow : SHORT_H.wide, marginLeft: "auto", cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.55, fontFamily: BRAND_SANS, color: INK.text }}
      title={ready ? `Practice ${topic.name}` : "Practice comes once this topic has questions"}
    >
      <div>
        <div className="lk-disp" style={{ fontSize: narrow ? 15 : 17 }}>Practice</div>
        <div className="mt-1 text-[12px] font-semibold" style={{ color: INK.muted }}>{n > 0 ? `${n} question${n === 1 ? "" : "s"}` : "Coming soon"}</div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase" style={{ letterSpacing: "0.08em", color: ready ? "var(--lk-acc)" : INK.dim }}>
        {locked && <Lock className="h-3 w-3" />}{ready ? <ChevronRight className="h-4 w-4" aria-label="Practice this topic" /> : null}
      </div>
    </button>
  );
}

function Short({ s, narrow, onOpen }: { s: HomeSet; narrow: boolean; onOpen: () => void }) {
  const pid = s.set.playbackId;
  const hasThumb = !!pid && pid !== "__demo__" && !s.locked;
  return (
    <button type="button" onClick={onOpen} className="lk-short" data-on={false} style={{ width: narrow ? 118 : 152, height: narrow ? 210 : 270, opacity: s.locked ? 0.7 : 1 }} title={s.set.name}>
      {hasThumb && <img src={muxThumb(pid!, 320)} alt="" loading="lazy" />}
      {!pid && !s.locked && <span className="absolute inset-x-2 top-1/2 -translate-y-1/2 text-center text-[11px] font-semibold" style={{ color: INK.dim }}>Cram video coming soon</span>}
      {s.locked && <Lock className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2" style={{ color: INK.muted }} />}
      {s.set.runtimeSec != null && pid && <span className="lk-short-d">{fmtRuntime(s.set.runtimeSec)}</span>}
      {s.done && <span className="absolute left-2 top-2 z-[1] grid h-6 w-6 place-items-center rounded-full" style={{ background: INK.green, color: "#111" }}><Check className="h-3.5 w-3.5" /></span>}
      {!s.done && s.watched > 0 && <span className="absolute inset-x-0 bottom-0 z-[1] h-[3px]" style={{ background: "rgba(255,255,255,0.2)" }}><span className="block h-full" style={{ width: `${Math.round(s.watched * 100)}%`, background: "var(--lk-acc)" }} /></span>}
      <span className="lk-short-t" style={{ zIndex: 1 }}>{s.set.name}</span>
    </button>
  );
}
