// HOME (learn v4, 09-09) — the short-form cram feed, not a dashboard.
//
// SIMPLIFIED FROM v3 (09-03). v3 opened on three plan-toggle cards, a live "Your study time"
// block, a row of topic filter chips, then Cram/Practice/Study-tools/Big-Workout-Problems/Review
// rows. That is an LMS dashboard's shape — a control panel between the student and the first
// video. The product is "Like Reels for exam prep.", so the shell now gets out of the way: the
// entrance, then straight into topic rows of vertical shorts, each row closing with one small
// Practice frame instead of a separate aggregate Practice section competing for attention up top.
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
// THE DESKTOP PASS (Lee, 2026-09-10: "/learn on desktop is showing up like the mobile version").
//   · THREE TIERS (use-tier.ts): narrow < 640, mid 640–1023, wide ≥ 1024. The content column is
//     centred, capped at 1280, 32px sides on wide.
//   · THE ENTRANCE (LearnEntrance.tsx) above the first row on every tier — the campus bolt, the
//     display line, the sub line with the real average video length, the meta row, Start.
//   · ROWS ARE GRIDS on wide / mid: the first topic fills the column — four frames + Practice
//     (wide) or three + Practice (mid), every frame 9:16. More videos than columns: the frames are
//     the CramStrip (fade + arrow) sized to those columns, Practice still beside it — never a
//     strip huddled at the left with Practice 900px away. Later topics are full-width rows that
//     lift on hover (a target, not a text line) and open into the same grid.
//   · The email gate box is centred at 440; the reminder + footer sit in a 720px column on wide.
//   · No horizontal page scroll at any width; tap targets ≥ 44px on narrow.
//
// THE LIBRARY PASS (Lee, 2026-09-10, the same day):
//   · NO EYEBROW. The "bolt · Cram" kicker above every topic name is gone; the REAL brand bolt
//     (BoltBoil, the campus's colours) stands beside the name instead. Its boil is paused on the
//     first frame and runs only while the heading row is hovered, when bolt and name glow blue
//     together (learn-theme's .lk-topic-hd rules; reduced motion keeps the glow, drops the boil).
//   · A TOPIC WITH NOTHING POSTED IS BLACK-AND-WHITE — grey bolt, muted name, and inside an open
//     row every card without a posted video is grayscale + dimmed, never removed, so a student
//     who comes back sees the library growing. A posted card is in full colour.
//   · "START HERE: EASY POINTS." The first heading says where to start; one cue per tier on top
//     of it: mid / wide pulse the first row's outline for ~2 s on first paint (once a session,
//     learn-gate's START_PULSE_KEY), narrow shows a small "start here ↓" label over the first card.
//   · NO "COMING SOON" ANYWHERE. A collapsed topic reads "N videos" only. Opening a topic with no
//     posted video shows its grey cards blurred under "Get notified when these drop." / Join the
//     waitlist (submitIntake, source learn-waitlist) and a tease of the whole exam's real counts
//     (examTease). The unlock wording — "Unlock the rest of Exam 1 — free" / Unlock (source
//     learn-gate) — is kept for a topic that HAS posted videos. Either submit marks the device.
//   · PARTIAL TOPICS. When an open topic has some posted and some not (the first topic included),
//     the not-yet cards are greyed and the SAME "Get notified" box sits once under the row, not
//     over the posted ones.
//
// THE REDESIGN (Lee, 2026-09-11 — docs/LEARN-REDESIGN-PROPOSAL-2026-09-11.md, built as written):
//   · ONE COLUMN. No rail, no bottom tabs — the navbar (LearnTop) carries the bolt, the campus,
//     the exam pills and a hamburger; this page is the hero and the rows, nothing else. The
//     bottom reminder block and the footer are gone (reminders live in the hamburger).
//   · THE HERO IS CENTRED (LearnEntrance): the display line, the sub line, one "Get started"
//     button with the real average video length as its caption. No meta row, no "See what's on
//     the exam".
//   · FIRST ROW: "Start Here: Easy Points · 5 videos" — no "Exam 1", no Free chip (the exam pill
//     already says it). LATER ROWS: the name and the topic's OWN counts, "5 videos · 34 practice
//     questions" (learn-gate's topicRowDetail). No cross-exam totals anywhere — the tease line
//     under the waitlist box is gone.
//   · THE WAITLIST BOX appears ONLY inside a later topic once it is opened. It never renders under
//     Easy Points: unposted videos there are simply grey.
//   · THE ENTRANCE BAND (2026-09-11, the ?look= candidates): the hero sits on its own full-bleed
//     band painted --lk-hero-bg, which is the canvas in every look but "split" (navy over cream —
//     "the fold IS the design"). The band's foot fades hero → canvas over the old row gap, so the
//     seven looks that do not split render exactly as before.
//   · PRACTICE CARD ART (PracticeArt.tsx): one nuts-and-bolts illustration, re-tinted per school,
//     above "Practice · N questions". A placeholder until the Recraft asset exists.
//   · DIMENSION: every card carries learn-theme's CARD_SHADOW; on a phone each topic section gets
//     28px of vertical padding and a hairline top border so topics read as blocks.
//
// Every number on this page is still a sum of real runtimes and real question counts — nothing
// invented. Where a topic has no runtime data yet, it just doesn't claim a duration (no fake
// "~12 min"), per the "manageable, not overwhelming" rule.
import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, Lock } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BRAND_SANS } from "@/components/canvas/brand";
import { CONTENT_MAX, LK, SIDE_PAD, type LearnTheme } from "@/components/learn/learn-theme";
import { fmtRuntime, muxThumb } from "@/components/learn/cram-media";
import { averageVideoCaption, EMAIL_RE, emailGateNeeded, isUuid, practiceGateNeeded, questionCount, readStartPulsed, topicRowDetail, waitlistNeeded, writeStartPulsed, writeUnlocked, type GateSet } from "@/components/learn/learn-gate";
import { LearnEntrance } from "@/components/learn/LearnEntrance";
import type { RailKey } from "@/components/learn/LearnRail";
import { PracticeArt } from "@/components/learn/PracticeArt";
import type { Tier } from "@/components/learn/use-tier";
import { submitIntake } from "@/lib/intake.functions";
import type { School } from "@/lib/schools";
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

/** POSTED: the set's cram video is up — or is a paid set, whose id is withheld, not absent (the
 *  paywall face is a real video behind a lock, not a gap in the library). */
function isPosted(s: HomeSet): boolean { return !!s.set.playbackId || s.locked; }

/** What the gate rules see of a row's set. A paid set's video id is withheld, not absent. */
function gateSetOf(s: HomeSet): GateSet {
  return { hasVideo: isPosted(s), locked: s.locked, started: s.started || s.done, runtimeSec: s.set.runtimeSec, ceqCount: s.set.ceqCount };
}

/** The hover glow: the school's second colour, else the brand blue (Lee, 2026-09-10). */
const GLOW_BLUE = "#3B82F6";
function glowFor(school: School | null): string { return school?.c2 ?? GLOW_BLUE; }

/** How long after the home mounts the start pulse begins — past the loading moment's wipe
 *  (LearnLoading: ~1000 ms beat + 600 ms wipe), so it is seen, not hidden under the reveal. */
const START_PULSE_DELAY_MS = 1200;
const START_PULSE_MS = 2100;

/** Grid columns per tier — the last one is always Practice. Narrow has no grid (the strip). */
const GRID_COLS: Record<Tier, number> = { narrow: 0, mid: 4, wide: 5 };
const GRID_GAP: Record<Tier, number> = { narrow: 8, mid: 14, wide: 16 };

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
  theme: LearnTheme;
  tier: Tier;
  onStart: () => void;
  onOpenSet: (setId: string, practice?: boolean) => void;
  onLocked: (topic: StudentTopic) => void;
  rowRef: (key: RailKey) => (el: HTMLElement | null) => void;
  /** Signed in — the email gate never asks (we already have the address). */
  signedIn: boolean;
  /** The email gate's context. */
  campusId: string | null;
  demo: boolean;
  /** The email gate has been passed on this device (learn-gate.ts UNLOCK_KEY). */
  unlocked: boolean;
  onUnlocked: () => void;
  /** The school — the topic bolts' colours and the practice art's tint. */
  school: School | null;
}>(function LearnHome({ sets, examLabel, tier, onOpenSet, onLocked, rowRef, signedIn, campusId, demo, unlocked, onUnlocked, school }, ref) {
  const byTopic = useMemo(() => {
    const m = new Map<string, HomeSet[]>();
    for (const s of sets) { const arr = m.get(s.topic.id) ?? []; arr.push(s); m.set(s.topic.id, arr); }
    return [...m.entries()].map(([id, arr]) => ({ topic: arr[0].topic, id, sets: arr }));
  }, [sets]);
  const narrow = tier === "narrow";
  const wide = tier === "wide";
  const pad = SIDE_PAD[tier];
  const averageCaption = useMemo(() => averageVideoCaption(sets.map((s) => s.set)), [sets]);

  // Later topics start collapsed; a tap opens one. (Easy Points is always open.)
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // The soft gate's sheet: which topic asked, what "Watch first" opens, what "anyway" opens.
  const [practiceAsk, setPracticeAsk] = useState<{ watchId: string; practiceId: string } | null>(null);
  const tryPractice = (ts: HomeSet[], practiceId: string) => {
    const first = ts.find((s) => !!s.set.playbackId && !s.locked);
    if (first && practiceGateNeeded(ts.map(gateSetOf))) { setPracticeAsk({ watchId: first.set.id, practiceId }); return; }
    onOpenSet(practiceId, true);
  };

  // GET STARTED. Opens the first playable video of the first topic; with none playable it scrolls
  // to the first row and outlines it for a second, so the click always lands somewhere visible.
  const firstRow = useRef<HTMLElement | null>(null);
  const [outlined, setOutlined] = useState(false);
  useEffect(() => { if (!outlined) return; const t = window.setTimeout(() => setOutlined(false), 1000); return () => window.clearTimeout(t); }, [outlined]);
  const seeExam = () => { firstRow.current?.scrollIntoView({ behavior: "smooth", block: "start" }); setOutlined(true); };
  const firstTopic = byTopic[0] ?? null;
  const startFirst = () => {
    const playable = firstTopic?.sets.find((s) => !!s.set.playbackId && !s.locked);
    if (playable) onOpenSet(playable.set.id); else seeExam();
  };
  const firstRowRef = (el: HTMLElement | null) => { firstRow.current = el; rowRef("cram")(el); };

  // THE START CUE (mid / wide): the first row's outline pulses once a session, after the loading
  // moment has revealed the page. Narrow has its "start here" label instead — one cue per tier.
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (tier === "narrow" || readStartPulsed()) return;
    writeStartPulsed();
    const start = window.setTimeout(() => setPulse(true), START_PULSE_DELAY_MS);
    const stop = window.setTimeout(() => setPulse(false), START_PULSE_DELAY_MS + START_PULSE_MS);
    return () => { window.clearTimeout(start); window.clearTimeout(stop); };
  }, [tier]);

  // THE ONE EMAIL. Both boxes — unlock and waitlist — capture the same address; once it is in
  // (any visit: `unlocked`; or the student is signed in) nothing asks again.
  const cols = GRID_COLS[tier];
  const frames = Math.max(0, cols - 1);

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", overflowX: "hidden" }}>
      {/* THE ENTRANCE BAND — full-bleed on the hero ground, the column inside it. */}
      <div style={{ background: LK.heroBg }}>
        <div className="mx-auto w-full" style={{ maxWidth: CONTENT_MAX, padding: `${narrow ? 10 : wide ? 24 : 20}px ${pad}px 0` }}>
          <LearnEntrance tier={tier} averageCaption={averageCaption} onStart={startFirst} />
        </div>
        <div aria-hidden style={{ height: narrow ? 12 : wide ? 40 : 34, background: `linear-gradient(${LK.heroBg}, ${LK.bg})` }} />
      </div>
      <div className="mx-auto flex w-full flex-col" style={{ maxWidth: CONTENT_MAX, padding: `0 ${pad}px 96px`, gap: narrow ? 0 : wide ? 40 : 34 }}>

        {/* CRAM ROWS — one per topic, the primary structure of the page. First topic, first short
            sit right under the hero — no control panel between the student and the video. */}
        {byTopic.map(({ id, topic, sets: ts }, i) => {
          const first = i === 0;
          const expanded = first || !!open[id];
          const posted = ts.filter(isPosted).length;
          // A LATER TOPIC behind the gate blurs under one box: the unlock ask when it has posted
          // videos, the waitlist ask when it has none. The first topic never blurs and never
          // carries the waitlist box — its unposted videos are simply grey (redesign, 2026-09-11).
          const gated = emailGateNeeded(i, signedIn, unlocked);
          const overlay: GateVariant | null = gated ? (waitlistNeeded(posted, signedIn, unlocked) ? "waitlist" : "unlock") : null;
          const dimmed: CSSProperties = { filter: overlay ? "blur(6px)" : undefined, pointerEvents: overlay ? "none" : undefined };
          const row = (
            <div className="relative">
              {/* FOUR FRAMES, THEN PRACTICE (Lee, 2026-09-10): "four cram frames in the middle,
                  practice pinned right, so it's 5 total vertical frames. Odd numbers tend to
                  appear cleaner." More than four: "fade out on the right side of the last one,
                  a show-more arrow makes it clear there's more." On wide / mid the five are grid
                  tracks that fill the column; narrow keeps the strip of fixed frames. */}
              {narrow ? (
                <div className="flex items-stretch" style={{ gap: GRID_GAP.narrow, ...dimmed }} aria-hidden={!!overlay || undefined}>
                  <CramStrip sets={ts} narrow onOpen={(s) => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id))} />
                  <PracticeFrame topic={topic} sets={ts} school={school} narrow onPractice={(setId) => tryPractice(ts, setId)} onLocked={onLocked} />
                </div>
              ) : (
                <div className="lk-grid" data-tier={tier} style={dimmed} aria-hidden={!!overlay || undefined}>
                  {ts.length <= frames ? (
                    ts.map((s) => <Short key={s.set.id} s={s} fluid onOpen={() => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id))} />)
                  ) : (
                    <div style={{ gridColumn: `span ${frames}`, minWidth: 0 }}>
                      <CramStrip sets={ts} narrow={false} columns={frames} gap={GRID_GAP[tier]} onOpen={(s) => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id))} />
                    </div>
                  )}
                  <div style={{ gridColumnStart: cols }}>
                    <PracticeFrame topic={topic} sets={ts} school={school} narrow={false} fluid onPractice={(setId) => tryPractice(ts, setId)} onLocked={onLocked} />
                  </div>
                </div>
              )}
              {overlay && <EmailGate variant={overlay} examLabel={examLabel} topicName={topic.name} campusId={campusId} demo={demo} onUnlocked={onUnlocked} narrow={narrow} />}
            </div>
          );
          return (
            <section key={id} id={topicSectionId(id)} ref={first ? firstRowRef : undefined} data-tier={tier} className={`lk-topic-sec flex flex-col gap-3${first && outlined ? " lk-outlined" : ""}${first && pulse ? " lk-start-pulse" : ""}`} style={{ scrollMarginTop: 16 }}>
              {first ? (
                <TopicHead topic={topic} sets={ts} school={school} tier={tier} />
              ) : (
                <TopicRow topic={topic} sets={ts} school={school} tier={tier} expanded={expanded} onToggle={() => setOpen((m) => ({ ...m, [id]: !expanded }))} />
              )}
              {/* NARROW'S START CUE: a small accent label over the first card. */}
              {first && narrow && (
                <span aria-hidden className="text-[12px] font-extrabold" style={{ color: LK.acc, letterSpacing: "0.04em", marginBottom: -4, fontFamily: BRAND_SANS }}>start here ↓</span>
              )}
              {expanded && row}
            </section>
          );
        })}
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

/** THE REAL BOLT beside a topic name — the same BoltBoil the entrance, the top bar and the home
 *  page draw, in the campus's colours. Its boil is paused until the heading row is hovered
 *  (.lk-topic-bolt in learn-theme.ts); the calmer 1.2 s cycle the navbar uses. */
function TopicBolt({ height, school }: { height: number; school: School | null }) {
  return (
    <span className="lk-topic-bolt" aria-hidden>
      <BoltBoil height={height} red={school?.c1 ?? undefined} blue={school?.c2 ?? undefined} boilSeconds={1.2} />
    </span>
  );
}

/** "[bolt] Start Here: Easy Points · 5 videos" (redesign, 2026-09-11: no "Exam 1", no Free chip —
 *  the exam pill already says it). The count is the topic's real set count. The first topic only
 *  — it is always open, so it is a heading, not a control. "Start Here:" is the heading's own
 *  answer to "where do I begin?" (Lee, 2026-09-10). */
function TopicHead({ topic, sets, school, tier }: { topic: StudentTopic; sets: HomeSet[]; school: School | null; tier: Tier }) {
  const n = sets.length;
  const posted = sets.some(isPosted);
  const size = tier === "wide" ? 26 : tier === "mid" ? 22 : 19;
  return (
    <div className="lk-topic-hd flex min-w-0 items-center" data-posted={posted} style={{ gap: tier === "narrow" ? 10 : 14, ["--lk-glow" as string]: glowFor(school) } as CSSProperties}>
      <TopicBolt height={Math.round(size * 1.35)} school={school} />
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="lk-disp lk-topic-name" style={{ fontSize: size, lineHeight: 1.1 }}>Start Here: {topic.name}</span>
        <span aria-hidden className="text-[13px]" style={{ color: LK.dim }}>·</span>
        <span className="text-[14px] tabular-nums" style={{ color: LK.muted }}>{n} video{n === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

/** A LATER TOPIC, collapsed: a full-width row — bolt, name, its own counts ("5 videos · 34
 *  practice questions") at the right, chevron — that lifts on hover. A target, not a text line.
 *  Expanded, the same row stays as the heading and the grid opens beneath it. Nothing posted yet:
 *  the bolt is grey and the name muted. */
function TopicRow({ topic, sets, school, tier, expanded, onToggle }: { topic: StudentTopic; sets: HomeSet[]; school: School | null; tier: Tier; expanded: boolean; onToggle: () => void }) {
  const detail = topicRowDetail(sets.map(gateSetOf));
  const posted = sets.some(isPosted);
  const size = tier === "wide" ? 22 : tier === "mid" ? 20 : 18;
  const narrow = tier === "narrow";
  // On a phone the count sits UNDER the name so the name never truncates to "Analyzing Transacti…".
  return (
    <button type="button" onClick={onToggle} aria-expanded={expanded} className="lk-topic-row lk-topic-hd" data-posted={posted} style={{ ...(narrow ? { padding: "12px 14px", minHeight: 56, gap: 10 } : {}), ["--lk-glow" as string]: glowFor(school) } as CSSProperties}>
      <TopicBolt height={Math.round(size * 1.35)} school={school} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`lk-disp lk-topic-name${narrow ? "" : " truncate"}`} style={{ fontSize: size, lineHeight: 1.15 }}>{topic.name}</span>
        {narrow && <span className="text-[13px] tabular-nums" style={{ color: LK.muted }}>{detail}</span>}
      </div>
      {!narrow && <span className="shrink-0 text-[14px] tabular-nums" style={{ color: LK.muted }}>{detail}</span>}
      <ChevronDown className="h-5 w-5 shrink-0" style={{ color: LK.muted, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 160ms" }} aria-hidden />
    </button>
  );
}

type GateVariant = "unlock" | "waitlist";

/** THE EMAIL BOX, two wordings, one capture. Not a paywall: Exam 1 is free, this asks for the
 *  one thing that lets us send the rest. Submits through the unified intake (kind notify_exam):
 *    unlock    "Unlock the rest of Exam 1 — free" / Unlock — a topic that HAS posted videos,
 *              floating over its blurred row (source learn-gate).
 *    waitlist  "Get notified when these drop." / Join the waitlist — nothing posted yet, over the
 *              blurred grey row of an OPENED LATER topic (source learn-waitlist). Never under
 *              Easy Points, and no cross-exam tease line (redesign, 2026-09-11).
 *  Success marks the device (writeUnlocked) and un-blurs every later topic. Demo mode never
 *  writes a row (its ids are fake) but still unlocks, so the flow can be walked. */
function EmailGate({ variant, examLabel, topicName, campusId, demo, onUnlocked, narrow }: {
  variant: GateVariant; examLabel: string; topicName: string;
  campusId: string | null; demo: boolean; onUnlocked: () => void; narrow: boolean;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"open" | "busy" | "error">("open");
  const [msg, setMsg] = useState("");
  const waitlist = variant === "waitlist";
  const submit = async () => {
    const e = email.trim();
    if (state === "busy") return;
    if (!EMAIL_RE.test(e)) { setState("error"); setMsg("Enter a valid email."); return; }
    setState("busy");
    try {
      if (!demo) await submitIntake({ data: { kind: "notify_exam", email: e, topic: topicName, campusId: isUuid(campusId) ? campusId : null, sourcePath: "/learn", source: waitlist ? "learn-waitlist" : "learn-gate" } });
      writeUnlocked();
      onUnlocked();
    } catch { setState("error"); setMsg("Couldn't save that — try again in a moment."); }
  };
  return (
    <div className="absolute inset-0 grid place-items-center p-2">
      <div className="lk-card lk-in w-full" style={{ maxWidth: narrow ? 320 : 440, padding: narrow ? 16 : 22, boxShadow: "0 18px 50px -14px rgba(0,0,0,0.9)", fontFamily: BRAND_SANS }}>
        <p className="lk-disp" style={{ fontSize: narrow ? 16 : 20, lineHeight: 1.2 }}>{waitlist ? "Get notified when these drop." : `Unlock the rest of ${examLabel} — free`}</p>
        <input type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu" className="lk-field mt-3" value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("open"); }} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} aria-label="Your email" />
        {state === "error" && <p className="mt-1.5 text-[12px]" style={{ color: LK.red }}>{msg}</p>}
        <button type="button" onClick={() => void submit()} disabled={state === "busy"} className="lk-btn lk-btn-acc mt-2 w-full disabled:opacity-50" style={{ minHeight: 44 }}>
          {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {waitlist ? "Join the waitlist" : "Unlock"}
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
      <div role="dialog" aria-label="Watch first" className="lk-in w-full rounded-t-2xl p-5 sm:max-w-[400px] sm:rounded-2xl" style={{ background: LK.surface, border: `1px solid ${LK.border}`, color: LK.text, paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }} onClick={(e) => e.stopPropagation()}>
        <p className="lk-disp" style={{ fontSize: 18, lineHeight: 1.25 }}>Ten minutes of videos first. They make these questions land.</p>
        <button type="button" onClick={onWatch} className="lk-btn lk-btn-acc mt-4 w-full" style={{ minHeight: 50, fontSize: 13 }}>Watch first</button>
        <button type="button" onClick={onAnyway} className="mt-2 w-full py-2 text-[12.5px] underline underline-offset-2" style={{ background: "transparent", border: 0, color: LK.muted, cursor: "pointer", fontFamily: "inherit", minHeight: 44 }}>Practice anyway</button>
      </div>
    </div>
  );
}

const SHORT_W = { wide: 152, narrow: 118 };
const SHORT_H = { wide: 270, narrow: 210 };
/** How many fixed frames sit in view on a phone before the fade. */
const FRAMES_IN_VIEW = 4;

/** THE CRAM STRIP — the frames in one scroll row; when the topic has more than fit, the last
 *  visible one fades at the right edge and an arrow scrolls the strip by one frame. The fade and
 *  the arrow exist only while there is more to the right. Given `columns` (wide / mid) the strip
 *  fills its grid tracks and each frame is exactly one track wide, so the strip's frames line up
 *  with the Practice frame beside it. */
function CramStrip({ sets, narrow, columns, gap: gapProp, onOpen }: { sets: HomeSet[]; narrow: boolean; columns?: number; gap?: number; onOpen: (s: HomeSet) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  const fluid = !narrow && !!columns;
  const gap = gapProp ?? (narrow ? 8 : 12);
  const w = narrow ? SHORT_W.narrow : SHORT_W.wide;
  const maxW = fluid ? undefined : FRAMES_IN_VIEW * w + (FRAMES_IN_VIEW - 1) * gap;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const check = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => { el.removeEventListener("scroll", check); ro?.disconnect(); };
  }, [sets.length]);
  const next = () => {
    const el = ref.current; if (!el) return;
    const n = columns ?? 1;
    const step = fluid ? (el.clientWidth - gap * (n - 1)) / n + gap : w + gap;
    el.scrollBy({ left: step, behavior: "smooth" });
  };
  const frameW = fluid ? `calc((100% - ${gap * ((columns ?? 1) - 1)}px) / ${columns})` : undefined;
  return (
    <div className="relative min-w-0" style={{ maxWidth: maxW, flex: fluid ? undefined : "0 1 auto" }}>
      <div ref={ref} className="lk-scroll-x" style={{ gap }}>
        {sets.map((s) => <Short key={s.set.id} s={s} narrow={narrow} fluid={fluid} style={frameW ? { width: frameW, flex: "0 0 auto" } : undefined} onOpen={() => onOpen(s)} />)}
      </div>
      {more && (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0" style={{ width: narrow ? 44 : 72, background: "linear-gradient(to right, transparent, var(--lk-bg))" }} />
          <button type="button" onClick={next} aria-label="More videos" className="absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-full" style={{ width: narrow ? 34 : 40, height: narrow ? 34 : 40, background: LK.text, color: LK.bg, border: 0, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}

/** PRACTICE, PINNED FAR RIGHT — the fifth frame. The one place practice is offered for a topic:
 *  after its videos, not after every single one. The nuts-and-bolts art (PracticeArt, tinted for
 *  the school) above "Practice" and the real question count, nothing else. Dimmed until the topic
 *  has questions to practice. */
function PracticeFrame({ topic, sets, school, narrow, fluid, onPractice, onLocked }: {
  topic: StudentTopic; sets: HomeSet[]; school: School | null; narrow: boolean; fluid?: boolean;
  onPractice: (setId: string) => void;
  onLocked: (topic: StudentTopic) => void;
}) {
  const practiceable = sets.find((s) => s.set.ceqCount > 0 && !s.locked);
  const locked = !practiceable && sets.some((s) => s.locked);
  const ready = !!practiceable || locked;
  const n = questionCount(sets.map(gateSetOf));
  const size: CSSProperties = fluid ? { width: "100%", height: "auto", aspectRatio: "9 / 16" } : { width: narrow ? SHORT_W.narrow : SHORT_W.wide, height: narrow ? SHORT_H.narrow : SHORT_H.wide, marginLeft: "auto" };
  return (
    <button
      type="button"
      onClick={() => { if (locked) onLocked(topic); else if (practiceable) onPractice(practiceable.set.id); }}
      disabled={!ready}
      className="lk-card flex shrink-0 flex-col justify-between text-left"
      style={{ ...size, padding: fluid ? 16 : 12, cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.55, fontFamily: BRAND_SANS, color: LK.text, borderColor: ready ? LK.border2 : undefined }}
      title={ready ? `Practice ${topic.name}` : "Practice comes once this topic has questions"}
    >
      <div className="flex flex-col items-center" style={{ paddingTop: narrow ? 4 : 8 }}>
        <PracticeArt school={school} size={narrow ? 72 : fluid ? 112 : 96} />
      </div>
      <div>
        <div className="lk-disp" style={{ fontSize: narrow ? 15 : fluid ? 20 : 17 }}>Practice</div>
        <div className="mt-1 text-[12px] font-semibold sm:text-[13px]" style={{ color: LK.muted }}>{n > 0 ? `${n} question${n === 1 ? "" : "s"}` : "No questions yet"}</div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase" style={{ letterSpacing: "0.08em", color: ready ? LK.acc : LK.dim }}>
        {locked && <Lock className="h-3 w-3" />}{ready ? <ChevronRight className="h-5 w-5" aria-label="Practice this topic" /> : null}
      </div>
    </button>
  );
}

/** ONE FRAME. A card whose video is not posted yet stays in the row, black-and-white and dimmed
 *  (.lk-short[data-posted="false"]) — it still opens (the player says so, and the set's practice
 *  is there when it has questions), it just does not pretend to be a video. */
function Short({ s, narrow, fluid, style, onOpen }: { s: HomeSet; narrow?: boolean; fluid?: boolean; style?: CSSProperties; onOpen: () => void }) {
  const pid = s.set.playbackId;
  const posted = isPosted(s);
  const hasThumb = !!pid && pid !== "__demo__" && !s.locked;
  const size: CSSProperties = fluid ? {} : { width: narrow ? SHORT_W.narrow : SHORT_W.wide, height: narrow ? SHORT_H.narrow : SHORT_H.wide };
  return (
    <button type="button" onClick={onOpen} className="lk-short" data-on={false} data-fluid={fluid || undefined} data-posted={posted} style={{ ...size, ...style, opacity: s.locked ? 0.7 : undefined }} title={posted ? s.set.name : `${s.set.name} — not posted yet`}>
      {hasThumb && <img src={muxThumb(pid!, fluid ? 480 : 320)} alt="" loading="lazy" />}
      {s.locked && <Lock className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2" style={{ color: "#B5B5B5" }} />}
      {s.set.runtimeSec != null && pid && <span className="lk-short-d">{fmtRuntime(s.set.runtimeSec)}</span>}
      {s.done && <span className="absolute left-2 top-2 z-[1] grid h-6 w-6 place-items-center rounded-full" style={{ background: LK.green, color: "#111" }}><Check className="h-3.5 w-3.5" /></span>}
      {!s.done && s.watched > 0 && <span className="absolute inset-x-0 bottom-0 z-[1] h-[3px]" style={{ background: "rgba(255,255,255,0.2)" }}><span className="block h-full" style={{ width: `${Math.round(s.watched * 100)}%`, background: LK.acc }} /></span>}
      <span className="lk-short-t" style={{ zIndex: 1 }}>{s.set.name}</span>
    </button>
  );
}
