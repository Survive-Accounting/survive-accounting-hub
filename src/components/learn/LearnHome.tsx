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
// Every number on this page is still a sum of real runtimes and real question counts — nothing
// invented. Where a topic has no runtime data yet, it just doesn't claim a duration (no fake
// "~12 min"), per the "manageable, not overwhelming" rule: no raw question counts in the main
// feed either (a locked topic's count still appears in the Paywall dialog, which is a different,
// opt-in surface).
import { forwardRef, useMemo } from "react";
import { Check, Lock } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { INK, type LearnTheme } from "@/components/learn/learn-theme";
import { fmtRuntime, muxThumb } from "@/components/learn/cram-media";
import type { RailKey } from "@/components/learn/LearnRail";
import type { StudentSet, StudentTopic } from "@/lib/student.functions";

export type HomeSet = { set: StudentSet; topic: StudentTopic; n: number; of: number; locked: boolean; done: boolean; watched: number; playable: boolean };

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
export const fmtMins = (sec: number) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60 ? `${m % 60}` : ""}`.trim() : `${Math.max(1, m)} min`; };

const topicSectionId = (id: string) => `lk-topic-${id}`;

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
}>(function LearnHome({ sets, theme, narrow, onOpenSet, onLocked, rowRef, you }, ref) {
  const byTopic = useMemo(() => {
    const m = new Map<string, HomeSet[]>();
    for (const s of sets) { const arr = m.get(s.topic.id) ?? []; arr.push(s); m.set(s.topic.id, arr); }
    return [...m.entries()].map(([id, arr]) => ({ topic: arr[0].topic, id, sets: arr }));
  }, [sets]);
  const pad = narrow ? "0 16px" : "0 32px";

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
            Two minutes or less. Watch the topic, then practice it.
          </p>
        </div>

        {/* CRAM ROWS — one per topic, the primary structure of the page. First topic, first short
            sit right under the product line — no control panel between the student and the video. */}
        {byTopic.map(({ id, topic, sets: ts }, i) => (
          <section key={id} id={topicSectionId(id)} ref={i === 0 ? rowRef("cram") : undefined} style={{ padding: pad }} className="flex flex-col gap-3">
            <TopicHead topic={topic} sets={ts} theme={theme} />
            <div className="lk-scroll-x" style={{ gap: narrow ? 8 : 12 }}>
              {ts.map((s) => <Short key={s.set.id} s={s} narrow={narrow} onOpen={() => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id))} />)}
            </div>
            <TopicPracticePrompt
              topic={topic} sets={ts} narrow={narrow}
              nextId={byTopic[i + 1]?.id ?? null}
              onPractice={(setId) => onOpenSet(setId, true)}
              onLocked={onLocked}
            />
          </section>
        ))}

        {/* REVIEW — Lee working each set's questions start to finish. Kept (not part of the
            "remove" list), just no longer competing above the fold with the cram rows. */}
        <section ref={rowRef("review")} style={{ padding: pad }} className="flex flex-col gap-3">
          <RowHead title="Review" sub="Lee works each set's questions" theme={theme} />
          <div className="lk-scroll-x" style={{ gap: narrow ? 8 : 12 }}>
            {sets.filter((s) => s.set.hasReview).map((s) => (
              <button key={s.set.id} type="button" onClick={() => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id))} className="flex shrink-0 flex-col gap-2 text-left" style={{ width: narrow ? 230 : 290, background: "transparent", border: 0, color: INK.text, cursor: "pointer" }}>
                <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: "16 / 9", background: "#000" }}>
                  {s.set.reviewPlaybackId && s.set.reviewPlaybackId !== "__demo__" && <img src={muxThumb(s.set.reviewPlaybackId, 640)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                  {s.set.reviewRuntimeSec != null && <span className="absolute bottom-2 right-2 rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: "rgba(0,0,0,0.7)" }}>{fmtRuntime(s.set.reviewRuntimeSec)}</span>}
                </div>
                <div className="text-[13px] font-semibold">{s.set.name}</div>
              </button>
            ))}
            {sets.every((s) => !s.set.hasReview) && <Coming text="Review videos come once the cram videos are done." narrow={narrow} wide />}
          </div>
        </section>

        {/* YOU — account state only, kept minimal per the simplified nav priority. The reminder
            callout is gone from this line since the header's reminder CTA is hidden for now (see
            LearnTop) — nothing invented to replace it, the underlying ReminderSheet/
            scheduleExamReminder flow is untouched and just not advertised here either. */}
        <section ref={rowRef("you")} style={{ padding: pad }} className="flex flex-col gap-3">
          <RowHead title="You" sub={you.total ? `${you.done} of ${you.total} crammed` : ""} theme={theme} />
          <div className="lk-card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1 text-[13px]" style={{ color: INK.muted }}>
              {you.userId ? <>Progress is saved to <b style={{ color: INK.text }}>{you.email}</b>.</> : <>Progress is saved on this device.</>}
            </div>
            <button type="button" onClick={you.onShare} className="lk-btn lk-btn-ghost">Share with a friend</button>
            {you.userId ? <button type="button" onClick={you.signOut} className="lk-btn" style={{ background: "transparent", color: INK.muted }}>Sign out</button> : <button type="button" onClick={you.onSignIn} className="lk-btn" style={{ background: "transparent", color: INK.muted }}>I have an account</button>}
          </div>
        </section>
      </div>
    </div>
  );
});

function RowHead({ title, sub, icon, theme }: { title: string; sub?: string; icon?: "bolt"; theme: LearnTheme }) {
  return (
    <div className="flex items-baseline gap-3">
      {icon === "bolt" && <svg width="16" height="16" viewBox="0 0 24 24" fill={theme.accent} className="self-center"><path d="M13 2 L4 14 h7 l-1 8 l9 -12 h-7 z" /></svg>}
      <span className="lk-disp" style={{ fontSize: 19 }}>{title}</span>
      {sub && <span className="truncate text-[13px]" style={{ color: INK.muted }}>{sub}</span>}
    </div>
  );
}

/** "⚡ Cram — Easy Points — 5 shorts · ~12 min". The count is always real; the duration only
 *  appears when at least one set in the topic has a real runtime, so a topic with no runtime data
 *  yet just doesn't claim one — never a made-up number. */
function TopicHead({ topic, sets, theme }: { topic: StudentTopic; sets: HomeSet[]; theme: LearnTheme }) {
  const withRt = sets.filter((s) => s.set.runtimeSec != null);
  const totalSec = withRt.reduce((a, s) => a + (s.set.runtimeSec ?? 0), 0);
  const n = sets.length;
  const detail = `${n} short${n === 1 ? "" : "s"}${withRt.length ? ` · ~${Math.max(1, Math.round(totalSec / 60))} min` : ""}`;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase" style={{ letterSpacing: "0.12em", color: INK.muted }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill={theme.accent}><path d="M13 2 L4 14 h7 l-1 8 l9 -12 h-7 z" /></svg>
        Cram
      </div>
      <div className="flex items-baseline gap-3">
        <span className="lk-disp" style={{ fontSize: 19 }}>{topic.name}</span>
        <span className="truncate text-[13px]" style={{ color: INK.muted }}>{detail}</span>
      </div>
    </div>
  );
}

/** THE ONE PLACE PRACTICE IS OFFERED FOR A TOPIC — after its shorts, not after every single one.
 *  A student can practice now or keep cramming into the next topic; nothing forces the choice. */
function TopicPracticePrompt({ topic, sets, narrow, nextId, onPractice, onLocked }: {
  topic: StudentTopic; sets: HomeSet[]; narrow: boolean;
  nextId: string | null;
  onPractice: (setId: string) => void;
  onLocked: (topic: StudentTopic) => void;
}) {
  const practiceable = sets.find((s) => s.set.ceqCount > 0 && !s.locked);
  const locked = !practiceable && sets.some((s) => s.locked);
  if (!practiceable && !locked) return null; // nothing to practice yet for this topic — no prompt, no dead-end button
  const keepCramming = () => { if (nextId) document.getElementById(topicSectionId(nextId))?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return (
    <div className="lk-card flex flex-wrap items-center gap-3 px-4 py-3" style={{ fontFamily: BRAND_SANS }}>
      <span className="min-w-0 flex-1 text-[13px] font-bold" style={{ color: INK.text }}>Finished {topic.name}?</span>
      <button
        type="button"
        onClick={() => (locked ? onLocked(topic) : onPractice(practiceable!.set.id))}
        className="lk-btn lk-btn-acc"
        style={{ fontSize: narrow ? 10.5 : 12 }}
      >
        {locked && <Lock className="h-3 w-3" />} Practice this topic →
      </button>
      {nextId && (
        <button type="button" onClick={keepCramming} className="lk-btn" style={{ background: "transparent", color: INK.muted, fontSize: narrow ? 10.5 : 12 }}>
          Keep cramming →
        </button>
      )}
    </div>
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

function Coming({ text, narrow, wide }: { text: string; narrow: boolean; wide?: boolean }) {
  return <div className="flex shrink-0 items-center rounded-xl px-4 py-4 text-[12.5px] leading-relaxed" style={{ width: narrow ? 260 : wide ? 420 : 290, minHeight: 90, border: `1px dashed ${INK.border2}`, color: INK.muted }}>{text}</div>;
}
