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
//     of it: a small "start here ↓" label over the first card. (The outline pulse that ran for ~2 s
//     on first paint is gone — Lee, 2026-09-11, later: "Lose the border highlight thing".)
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
//   · FIRST ROW (as of 2026-09-11, Lee: "Don't say start here twice. Just say 'Easy Points for
//     Exam [#]' and the start here ↓ underneath is perfect"): "Easy Points for Exam 1 · 5 videos",
//     with the small "start here ↓" label under it on EVERY tier. Before that it read "Start Here:
//     Easy Points · 5 videos" — no "Exam 1", no Free chip (the exam pill
//     already says it). LATER ROWS: the name and the topic's OWN counts, "5 videos · 34 practice
//     questions" (learn-gate's topicRowDetail). No cross-exam totals anywhere — the tease line
//     under the waitlist box is gone.
//   · THE WAITLIST BOX appears ONLY inside a later topic once it is opened. It never renders under
//     Easy Points: unposted videos there are simply grey.
//   · THE ENTRANCE BAND (2026-09-11, the ?look= candidates): the hero sits on its own full-bleed
//     band painted --lk-hero-bg, which is the canvas in every look but "split" (navy over cream —
//     "the fold IS the design"). The band's foot fades hero → canvas over the old row gap, so the
//     seven looks that do not split render exactly as before.
//   · PRACTICE CARD ART: was PracticeArt.tsx's nuts-and-bolts placeholder; since 09-11 the card is
//     PracticeCard.tsx with the Recraft cram machine (CramMachine.tsx) — see THE RAIL below.
//
// THE RAIL (Lee, 2026-09-11, after the design email): "Practice should be the final item in every
// StudyRail immediately after the final video. Never reserve a specific slot number." The grid of
// four frames + Practice pinned in column five (09-10) is gone. Every topic's row is a StudyRail
// (StudyRail.tsx): fixed-width 9:16 cards — the videos in order, then PracticeCard — that scrolls
// with snap, bleeds to the column's edge, and shows a fade + arrow ONLY when it really overflows.
// One rail on every tier; a phone swipes 84vw cards, a desk sees ~4–5 of 256px. The Practice
// card shows the RECOMMENDED ROUND's time (~10 min), not the bank size, and its machine is
// sectionIndex % 3 so the art never changes on a rerender.
//   · SCROLL REVEAL (Lee, 2026-09-11: "a subtle one-time entrance: opacity 0 → 1, translateY
//     10–16px → 0, roughly 300–450ms. Stagger cards very lightly. Do not use scroll hijacking or
//     heavy parallax."): every section after the first plays a 380 ms rise the first time it
//     scrolls into view (useReveal — one IntersectionObserver, unobserved after it fires), delayed
//     40 ms per section. Nothing ever fades OUT. No IntersectionObserver, or reduced motion → the
//     sections are simply there.
//   · THE POLISH PASS (Lee, 2026-09-11): the hero is a contained panel (LearnEntrance) with less
//     air above and below it, so Easy Points starts ~40px higher on a desk; the CTA reads "Start
//     cramming for free" and, with nothing playable, scrolls to Easy Points and FOCUSES its first
//     card; a later topic's row shows only what is live ("2 videos", questions only when practice
//     is open) and wears a small "Coming soon" tag when nothing in it is posted — never "2 videos ·
//     26 practice questions" for material a student cannot open (learn-gate's topicRowDetail).
//   · DIMENSION: every card carries learn-theme's CARD_SHADOW; on a phone each topic section gets
//     28px of vertical padding and a hairline top border so topics read as blocks.
//
// Every number on this page is still a sum of real runtimes and real question counts — nothing
// invented. Where a topic has no runtime data yet, it just doesn't claim a duration (no fake
// "~12 min"), per the "manageable, not overwhelming" rule.
import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { partKey } from "@/lib/student-shorts";
import type { Prog } from "@/components/learn/cram-media";
import { Check, ChevronDown, Loader2, Lock } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BRAND_SANS } from "@/components/canvas/brand";
import { CONTENT_MAX, LK, SIDE_PAD, type LearnTheme } from "@/components/learn/learn-theme";
import { fmtRuntime, muxThumb } from "@/components/learn/cram-media";
import { averageVideoCaption, EMAIL_RE, emailGateNeeded, isUuid, practiceGateNeeded, questionCount, topicRowDetail, waitlistNeeded, writeUnlocked, type GateSet } from "@/components/learn/learn-gate";
import { LearnEntrance } from "@/components/learn/LearnEntrance";
import type { RailKey } from "@/components/learn/LearnRail";
import { CRAM_MACHINE_CSS } from "@/components/learn/CramMachine";
import { PRACTICE_CARD_CSS, PracticeCard } from "@/components/learn/PracticeCard";
import { STUDY_RAIL_CSS, StudyRail } from "@/components/learn/StudyRail";
import type { Tier } from "@/components/learn/use-tier";
import { submitIntake } from "@/lib/intake.functions";
import { adEvent } from "@/lib/retargeting";
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

/** Practice on the rails — OFF until the practice experience is refined (Lee, 2026-09-11). */
const SHOW_PRACTICE = false;
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

/** COMING SOON — the tag a later topic wears when nothing in it is posted (the polish brief, 09-11:
 *  "The waitlist state itself is enough"). Small caps, quiet; never a count beside it. */
const SOON_CSS = `
.lk-soon { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--lk-border2); color: var(--lk-muted); font-size: 10.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
`;
/** THE ENTRANCE: hidden until seen, then a short rise. Sections start visible where there is no
 *  observer to reveal them (SSR without JS, an old browser) — data-reveal is only set client-side. */
const REVEAL_CSS = `
.lk-reveal[data-reveal="wait"] { opacity: 0; transform: translateY(12px); }
.lk-reveal[data-reveal="in"] { animation: lk-reveal 380ms cubic-bezier(.2,.7,.2,1) both; }
@keyframes lk-reveal { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .lk-reveal[data-reveal="wait"] { opacity: 1; transform: none; } .lk-reveal[data-reveal="in"] { animation: none; } }
`;
/** The rails' and cards' CSS, injected once with the home. ONE string — never two text children. */
const ROW_CSS = STUDY_RAIL_CSS + PRACTICE_CARD_CSS + CRAM_MACHINE_CSS + REVEAL_CSS + SOON_CSS;

/** One observer for every section that wants an entrance: "wait" until 12% of it is in view,
 *  then "in" once, for good. Sections without the observer keep no data-reveal at all. The
 *  observer lives in an effect (created on mount, disconnected on unmount — and re-created after
 *  StrictMode's rehearsal, which is why the ref callback only collects elements and the effect
 *  does the observing); a section that mounts later is observed straight away. */
function useReveal(): (el: HTMLElement | null) => void {
  const io = useRef<IntersectionObserver | null>(null);
  const pending = useRef<Set<HTMLElement>>(new Set());
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { (e.target as HTMLElement).dataset.reveal = "in"; obs.unobserve(e.target); }
    }, { threshold: 0.12 });
    io.current = obs;
    for (const el of pending.current) if (el.dataset.reveal === "wait") obs.observe(el);
    return () => { obs.disconnect(); io.current = null; };
  }, []);
  return (el) => {
    if (!el || el.dataset.reveal) return;
    if (typeof IntersectionObserver === "undefined") return;
    el.dataset.reveal = "wait";
    pending.current.add(el);
    io.current?.observe(el);
  };
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
  theme: LearnTheme;
  tier: Tier;
  onStart: () => void;
  onOpenSet: (setId: string, practice?: boolean, part?: number) => void;
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
  /** Every video's progress by key — the set's, or a part's ("<setId>#N") — for the checks. */
  progress?: Record<string, Prog>;
  /** The chapter the student is on — rides with every email the page collects (2026-09-11). */
  chapterSlug?: string | null;
  /** THE SHARE KIT (LearnShareKit) for a council or chapter chair, above the hero; null for a student. */
  kit?: ReactNode;
}>(function LearnHome({ sets, examLabel, tier, onOpenSet, onLocked, rowRef, signedIn, campusId, demo, unlocked, onUnlocked, school, progress = {}, chapterSlug = null, kit = null }, ref) {
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
  // THE CTA'S LANDING (the polish brief, 09-11): scroll Easy Points into view, put keyboard focus
  // on its first card (its focus ring is the cue — no outline pulse: Lee, later, "Lose the border
  // highlight thing"). With a playable first lesson the existing mechanism
  // opens it straight away (the player is the strongest "start"); the landing is for the day
  // nothing is playable yet, and it is what autoplay would hang off later.
  const seeExam = () => {
    const row = firstRow.current;
    row?.scrollIntoView({ behavior: "smooth", block: "start" });
    row?.querySelector<HTMLElement>(".lk-short, .lk-practice")?.focus({ preventScroll: true });
  };
  const firstTopic = byTopic[0] ?? null;
  const startFirst = () => {
    const playable = firstTopic?.sets.find((s) => !!s.set.playbackId && !s.locked);
    if (playable) onOpenSet(playable.set.id); else seeExam();
  };
  const firstRowRef = (el: HTMLElement | null) => { firstRow.current = el; rowRef("cram")(el); };
  const reveal = useReveal();

  // THE ONE EMAIL. Both boxes — unlock and waitlist — capture the same address; once it is in
  // (any visit: `unlocked`; or the student is signed in) nothing asks again.

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", overflowX: "hidden" }}>
      <style>{ROW_CSS}</style>
      {/* THE ENTRANCE BAND — full-bleed on the hero ground, the column inside it. */}
      <div style={{ background: LK.heroBg }}>
        <div className="mx-auto w-full" style={{ maxWidth: CONTENT_MAX, padding: `${narrow ? 10 : wide ? 16 : 14}px ${pad}px 0` }}>
          {kit}
          <LearnEntrance tier={tier} averageCaption={averageCaption} onStart={startFirst} />
        </div>
        <div aria-hidden style={{ height: narrow ? 8 : wide ? 26 : 22, background: `linear-gradient(${LK.heroBg}, ${LK.bg})` }} />
      </div>
      <div className="mx-auto flex w-full flex-col" style={{ maxWidth: CONTENT_MAX, padding: `0 ${pad}px 96px`, gap: narrow ? 0 : wide ? 32 : 28 }}>

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
          // THE RAIL: rowItems = [...videos, practice] — Practice is the last card, whatever the count.
          const practiceable = ts.find((s) => s.set.ceqCount > 0 && !s.locked) ?? null;
          const practiceLocked = !practiceable && ts.some((s) => s.locked);
          const row = (
            <div className="relative">
              <StudyRail tier={tier} label={`${topic.name} videos`} bleed={pad} style={dimmed} ariaHidden={!!overlay}>
                {/* ONLY WHAT IS POSTED on an open row (Lee, 2026-09-11: "the empty easy points
                    placeholders" go; the later topics keep their waitlist / unlock gate, and the
                    grey placeholders behind that blur are what the gate sits on). */}
                {ts.flatMap((s) => cardsOf(s, progress).filter((c) => !!overlay || s.locked || !!c.playbackId).map((c) => <Short key={c.key} s={s} card={c} onOpen={() => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id, false, c.part))} />))}
                {/* PRACTICE IS OFF THE PAGE FOR NOW (Lee, 2026-09-11, later: "just don't show
                    practice yet. It's only videos for now until we refine that"). The card, the
                    drawer and the round stay built; SHOW_PRACTICE brings them back. */}
                {SHOW_PRACTICE && (
                  <PracticeCard
                    topicName={topic.name} sectionIndex={i} school={school}
                    bank={questionCount(ts.map(gateSetOf))} ready={!!practiceable} locked={practiceLocked}
                    onPractice={() => { if (practiceable) tryPractice(ts, practiceable.set.id); }}
                    onLocked={() => onLocked(topic)}
                  />
                )}
              </StudyRail>
              {overlay && <EmailGate variant={overlay} examLabel={examLabel} topicName={topic.name} campusId={campusId} chapterSlug={chapterSlug} demo={demo} onUnlocked={onUnlocked} narrow={narrow} />}
            </div>
          );
          return (
            <section key={id} id={topicSectionId(id)} ref={first ? firstRowRef : reveal} data-tier={tier} className={`lk-topic-sec flex flex-col gap-3${first ? "" : " lk-reveal"}`} style={{ scrollMarginTop: 16, animationDelay: first ? undefined : `${Math.min(i, 6) * 40}ms` }}>
              {first ? (
                <TopicHead topic={topic} sets={ts} school={school} tier={tier} examLabel={examLabel} />
              ) : (
                <TopicRow topic={topic} sets={ts} school={school} tier={tier} expanded={expanded} onToggle={() => setOpen((m) => ({ ...m, [id]: !expanded }))} />
              )}
              {/* THE START CUE: a small accent label over the first card, every tier (2026-09-11). */}
              {first && (
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

/** "[bolt] Easy Points for Exam 1 · 5 videos" (Lee, 2026-09-11: "Just say 'Easy Points for Exam
 *  [#]'" — the "start here ↓" label under it is the cue, so the heading no longer says it). The
 *  count is the topic's real set count. The first topic only — it is always open, so it is a
 *  heading, not a control. */
function TopicHead({ topic, sets, school, tier, examLabel }: { topic: StudentTopic; sets: HomeSet[]; school: School | null; tier: Tier; examLabel: string }) {
  // Only what is live counts (the polish brief, 09-11): posted, playable videos — every part of a
  // set filmed as splits is a video.
  const n = sets.filter((s) => !!s.set.playbackId && !s.locked).reduce((a, s) => a + Math.max(1, (s.set.shorts ?? []).length), 0);
  const posted = sets.some(isPosted);
  const size = tier === "wide" ? 26 : tier === "mid" ? 22 : 19;
  return (
    <div className="lk-topic-hd flex min-w-0 items-center" data-posted={posted} style={{ gap: tier === "narrow" ? 10 : 14, ["--lk-glow" as string]: glowFor(school) } as CSSProperties}>
      <TopicBolt height={Math.round(size * 1.35)} school={school} />
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="lk-disp lk-topic-name" style={{ fontSize: size, lineHeight: 1.1 }}>{topic.name} for {examLabel}</span>
        {n > 0 && (
          <>
            <span aria-hidden className="text-[13px]" style={{ color: LK.dim }}>·</span>
            <span className="text-[14px] tabular-nums" style={{ color: LK.muted }}>{n} video{n === 1 ? "" : "s"}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** A LATER TOPIC, collapsed: a full-width row — bolt, name, its own counts ("5 videos · 34
 *  practice questions") at the right, chevron — that lifts on hover. A target, not a text line.
 *  Expanded, the same row stays as the heading and the grid opens beneath it. Nothing posted yet:
 *  the bolt is grey and the name muted. */
function TopicRow({ topic, sets, school, tier, expanded, onToggle }: { topic: StudentTopic; sets: HomeSet[]; school: School | null; tier: Tier; expanded: boolean; onToggle: () => void }) {
  // What is live, or the tag: "2 videos · 26 practice questions" only for material that opens;
  // nothing posted → "Coming soon" and no counts at all (the polish brief, 09-11).
  const detail = topicRowDetail(sets.map(gateSetOf));
  const posted = sets.some(isPosted);
  const meta = detail ?? (posted ? null : "soon");
  const size = tier === "wide" ? 22 : tier === "mid" ? 20 : 18;
  const narrow = tier === "narrow";
  // On a phone the count sits UNDER the name so the name never truncates to "Analyzing Transacti…".
  return (
    <button type="button" onClick={onToggle} aria-expanded={expanded} className="lk-topic-row lk-topic-hd" data-posted={posted} style={{ ...(narrow ? { padding: "12px 14px", minHeight: 56, gap: 10 } : {}), ["--lk-glow" as string]: glowFor(school) } as CSSProperties}>
      <TopicBolt height={Math.round(size * 1.35)} school={school} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`lk-disp lk-topic-name${narrow ? "" : " truncate"}`} style={{ fontSize: size, lineHeight: 1.15 }}>{topic.name}</span>
        {narrow && meta && (meta === "soon" ? <span className="lk-soon self-start">Coming soon</span> : <span className="text-[13px] tabular-nums" style={{ color: LK.muted }}>{meta}</span>)}
      </div>
      {!narrow && meta && (meta === "soon" ? <span className="lk-soon shrink-0">Coming soon</span> : <span className="shrink-0 text-[14px] tabular-nums" style={{ color: LK.muted }}>{meta}</span>)}
      <ChevronDown className="h-5 w-5 shrink-0" style={{ color: LK.muted, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 160ms" }} aria-hidden />
    </button>
  );
}

type GateVariant = "unlock" | "waitlist";
/** gate_view once per page load per wording — every blurred later topic draws its own box. */
const gateSeen = new Set<GateVariant>();

/** THE EMAIL BOX, two wordings, one capture. Not a paywall: Exam 1 is free, this asks for the
 *  one thing that lets us send the rest. Submits through the unified intake (kind notify_exam):
 *    unlock    "Unlock the rest of Exam 1 — free" / Unlock — a topic that HAS posted videos,
 *              floating over its blurred row (source learn-gate).
 *    waitlist  "Get notified when these drop." / Join the waitlist — nothing posted yet, over the
 *              blurred grey row of an OPENED LATER topic (source learn-waitlist). Never under
 *              Easy Points, and no cross-exam tease line (redesign, 2026-09-11).
 *  Success marks the device (writeUnlocked) and un-blurs every later topic. Demo mode never
 *  writes a row (its ids are fake) but still unlocks, so the flow can be walked. */
function EmailGate({ variant, examLabel, topicName, campusId, chapterSlug, demo, onUnlocked, narrow }: {
  chapterSlug: string | null;
  variant: GateVariant; examLabel: string; topicName: string;
  campusId: string | null; demo: boolean; onUnlocked: () => void; narrow: boolean;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"open" | "busy" | "error">("open");
  const [msg, setMsg] = useState("");
  const waitlist = variant === "waitlist";
  // RETARGETING (2026-09-11): the gate seen and the gate passed. Campus id + chapter + exam only —
  // never the address typed into it.
  useEffect(() => {
    if (demo || gateSeen.has(variant)) return;
    gateSeen.add(variant);
    adEvent("gate_view", { campus: campusId ?? undefined, chapter: chapterSlug ?? undefined, exam: examLabel, source: variant });
  }, [demo, variant, campusId, chapterSlug, examLabel]);
  const submit = async () => {
    const e = email.trim();
    if (state === "busy") return;
    if (!EMAIL_RE.test(e)) { setState("error"); setMsg("Enter a valid email."); return; }
    setState("busy");
    try {
      if (!demo) await submitIntake({ data: { kind: "notify_exam", email: e, topic: topicName, campusId: isUuid(campusId) ? campusId : null, chapter: chapterSlug, sourcePath: "/learn", source: waitlist ? "learn-waitlist" : "learn-gate" } });
      if (!demo) adEvent("gate_submit", { campus: campusId ?? undefined, chapter: chapterSlug ?? undefined, exam: examLabel, source: waitlist ? "learn-waitlist" : "learn-gate" });
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

/** ONE FRAME. A card whose video is not posted yet stays in the row, black-and-white and dimmed
 *  (.lk-short[data-posted="false"]) — it still opens (the player says so, and the set's practice
 *  is there when it has questions), it just does not pretend to be a video. */
/** ONE CARD PER VIDEO (2026-09-11): a set posted as five splits is five cards — Assets,
 *  Liabilities, Equity, Revenues, Expenses — each with its own cover, runtime, check and progress
 *  (Lee: "I've posted all 5 videos but only seeing first one"). A set with no parts is one card. */
type Card = { key: string; part: number; name: string; playbackId: string | null; coverUrl: string | null; runtimeSec: number | null; done: boolean; watched: number };
function cardsOf(s: HomeSet, progress: Record<string, Prog>): Card[] {
  const ofKey = (key: string, fallbackDone: boolean, fallbackWatched: number) => { const p = progress[key]; return p ? { done: p.state === "complete", watched: p.durationSec ? Math.min(1, p.positionSec / p.durationSec) : 0 } : { done: fallbackDone, watched: fallbackWatched }; };
  const parts = s.set.shorts ?? [];
  if (parts.length > 1) {
    return parts.map((sh, i) => { const key = partKey(s.set.id, i); return { key, part: i + 1, name: sh.name || `${s.set.name} · ${i + 1}`, playbackId: sh.playbackId, coverUrl: sh.coverUrl ?? (i === 0 ? s.set.coverUrl : null), runtimeSec: sh.runtimeSec, ...ofKey(key, false, 0) }; });
  }
  return [{ key: s.set.id, part: 1, name: s.set.name, playbackId: s.set.playbackId, coverUrl: s.set.coverUrl, runtimeSec: s.set.runtimeSec, done: s.done, watched: s.watched }];
}

/** HOVER PREVIEW (Lee, 2026-09-11: "Set up autoplay on the videos when hovering"): after a
 *  short hover on a desk the card plays its video muted, in place of the thumbnail, through the
 *  same hls.js path the player uses; leaving the card tears it down. One card at a time by
 *  construction (each card owns its own element), nothing on a phone (no hover), nothing under
 *  reduced motion. */
function HoverPreview({ pid }: { pid: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  // A loading wheel until the first frame plays (Lee, 2026-09-11: "Show loading animation so
  // it's clear the video would be coming").
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    let hls: { destroy: () => void } | null = null; let cancelled = false;
    const src = `https://stream.mux.com/${pid}.m3u8`;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !ref.current) return;
      if (Hls.isSupported()) { const h = new Hls({ capLevelToPlayerSize: true, startLevel: 0 }); h.loadSource(src); h.attachMedia(ref.current); hls = h; }
      else if (ref.current.canPlayType("application/vnd.apple.mpegurl")) ref.current.src = src;
      ref.current?.play().catch(() => { /* the thumbnail stays */ });
    }).catch(() => { /* the thumbnail stays */ });
    return () => { cancelled = true; hls?.destroy(); };
  }, [pid]);
  return (
    <>
      <video ref={ref} muted playsInline loop preload="none" aria-hidden onPlaying={() => setReady(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: "#000", opacity: ready ? 1 : 0, transition: "opacity 160ms" }} />
      {!ready && (
        <span aria-hidden className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full" style={{ width: 44, height: 44, background: "rgba(0,0,0,0.5)", color: "#fff" }}>
          <Loader2 className="h-5 w-5 animate-spin" />
        </span>
      )}
    </>
  );
}

function Short({ s, card, onOpen }: { s: HomeSet; card: Card; onOpen: () => void }) {
  const pid = card.playbackId;
  const posted = isPosted(s);
  // THE THUMBNAIL (2026-09-11): the cover Lee uploaded for the video when there is one, else the
  // frame the host cuts at two seconds. Never for a paid (locked) set — its face is the lock.
  const thumb = s.locked ? null : (card.coverUrl ?? (pid && pid !== "__demo__" ? muxThumb(pid, 480) : null));
  const [preview, setPreview] = useState(false);
  const hoverT = useRef<number | null>(null);
  const canPreview = !!pid && pid !== "__demo__" && !s.locked;
  const enter = () => { if (!canPreview || !window.matchMedia?.("(hover: hover)").matches || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return; hoverT.current = window.setTimeout(() => setPreview(true), 350); };
  const leave = () => { if (hoverT.current) window.clearTimeout(hoverT.current); hoverT.current = null; setPreview(false); };
  return (
    <button type="button" onClick={onOpen} onMouseEnter={enter} onMouseLeave={leave} onBlur={leave} className="lk-short" data-on={false} data-rail="true" data-posted={posted} style={{ opacity: s.locked ? 0.7 : undefined }} title={posted ? card.name : `${card.name} — not posted yet`}>
      {thumb && <img src={thumb} alt="" loading="lazy" />}
      {preview && pid && <HoverPreview pid={pid} />}
      {s.locked && <Lock className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2" style={{ color: "#B5B5B5" }} />}
      {card.runtimeSec != null && pid && <span className="lk-short-d">{fmtRuntime(card.runtimeSec)}</span>}
      {card.done && <span className="absolute left-2 top-2 z-[1] grid h-6 w-6 place-items-center rounded-full" title="Crammed" style={{ background: LK.green, color: "#111" }}><Check className="h-3.5 w-3.5" /></span>}
      {!card.done && card.watched > 0 && <span className="absolute inset-x-0 bottom-0 z-[1] h-[3px]" style={{ background: "rgba(255,255,255,0.2)" }}><span className="block h-full" style={{ width: `${Math.round(card.watched * 100)}%`, background: LK.acc }} /></span>}
      <span className="lk-short-t" style={{ zIndex: 1 }}>{card.name}</span>
    </button>
  );
}
