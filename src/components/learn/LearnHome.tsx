// HOME (learn v3, 09-03) — YouTube's home, for one exam.
//
//   chips (topics) · three plan cards (Cram on by default; Practice / Review add to a live study
//   time) · Start · then a row per content type: Cram (portrait shorts, one row per topic),
//   Practice, Study tools, Big Workout Problems, Review.
//
// Every number on this page is a sum of real runtimes and real question counts. Practice time is
// the one estimate (40s a question) and is labelled "≈". Rows with nothing in them yet say so in
// one dashed card rather than pretending.
import { forwardRef, useMemo } from "react";
import { Check, Lock, Play, Plus } from "lucide-react";

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
const mins = (sec: number) => Math.max(1, Math.round(sec / 60));
export const fmtMins = (sec: number) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60 ? `${m % 60}` : ""}`.trim() : `${Math.max(1, m)} min`; };

export const LearnHome = forwardRef<HTMLDivElement, {
  sets: HomeSet[];
  topics: StudentTopic[];
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
}>(function LearnHome({ sets, topics, chip, onChip, plan, onPlan, daysOut, examLabel, comingExams, theme, narrow, onStart, onOpenSet, onLocked, rowRef, you }, ref) {
  const t = useMemo(() => planTimes(sets), [sets]);
  const visible = chip ? sets.filter((s) => s.topic.id === chip) : sets;
  const byTopic = useMemo(() => { const m = new Map<string, HomeSet[]>(); for (const s of visible) { const arr = m.get(s.topic.id) ?? []; arr.push(s); m.set(s.topic.id, arr); } return [...m.entries()].map(([id, arr]) => ({ topic: arr[0].topic, id, sets: arr })); }, [visible]);
  const totalSec = t.cramSec + (plan.practice ? t.practiceSec : 0) + (plan.review ? t.reviewSec : 0);
  const planLabel = [ "cram", plan.practice ? "practice" : null, plan.review ? "review" : null ].filter(Boolean).join(" + ");
  const firstUnwatched = sets.find((s) => s.playable && !s.locked && !!s.set.playbackId && !s.done) ?? sets.find((s) => !!s.set.playbackId && !s.locked) ?? null;
  const pad = narrow ? "0 16px" : "0 32px";

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      {/* CHIPS — sticky under the top */}
      <div className="lk-scroll-x sticky top-0 z-[2]" style={{ padding: narrow ? "6px 16px 12px" : "6px 32px 14px", gap: 8, background: INK.bg }}>
        <button type="button" className="lk-chip" data-on={chip == null} onClick={() => onChip(null)}>All</button>
        {topics.map((tp) => <button key={tp.id} type="button" className="lk-chip" data-on={chip === tp.id} onClick={() => onChip(chip === tp.id ? null : tp.id)}>{tp.name}</button>)}
        {comingExams.map((e) => <span key={e} className="lk-chip" style={{ color: INK.dim, cursor: "default" }}>{e} · coming</span>)}
      </div>

      <div className="flex flex-col" style={{ gap: narrow ? 26 : 34, paddingBottom: 40 }}>
        {/* THE PLAN */}
        <section ref={rowRef("cram")} style={{ padding: pad }} className="flex flex-col gap-3">
          <div className={narrow ? "lk-scroll-x" : "grid grid-cols-3 gap-4"} style={narrow ? { gap: 10 } : undefined}>
            <PlanCard on locked={false} title="Cram" sub="What's on the exam, fast." detail={t.cramCount ? `${t.cramCount} video${t.cramCount === 1 ? "" : "s"}${t.avgCramSec ? ` · ~${Math.max(1, Math.round(t.avgCramSec / 60))} min each` : ""}` : "videos on the way"} time={t.cramSec ? fmtMins(t.cramSec) : null} theme={theme} narrow={narrow} face="bolt" />
            <PlanCard on={plan.practice} locked={t.practiceCount === 0} onToggle={() => onPlan({ ...plan, practice: !plan.practice })} title="Practice" sub="Try each set right after cramming it." detail={t.practiceCount ? `${t.practiceCount} questions${t.problemsCount ? ` + ${t.problemsCount} workout problems` : ""}` : "questions on the way"} time={t.practiceCount ? `≈ ${fmtMins(t.practiceSec)}` : null} theme={theme} narrow={narrow} />
            <PlanCard on={plan.review} locked={t.reviewCount === 0} onToggle={() => onPlan({ ...plan, review: !plan.review })} title="Review" sub="Watch Lee work everything, start to finish." detail={t.reviewCount ? `${t.reviewCount} review video${t.reviewCount === 1 ? "" : "s"}` : "review videos come after the cram videos"} time={t.reviewCount ? fmtMins(t.reviewSec) : null} theme={theme} narrow={narrow} />
          </div>
          <div className="lk-card flex items-center gap-4 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <div className="text-[10.5px] font-extrabold uppercase" style={{ letterSpacing: "0.14em", color: INK.muted }}>Your study time</div>
              <div className="lk-disp" style={{ fontSize: narrow ? 22 : 28, lineHeight: 1.1 }}>
                {totalSec ? fmtMins(totalSec) : "—"}
                {!narrow && <span className="ml-2 font-medium" style={{ fontSize: 13, color: INK.muted, fontFamily: "inherit" }}>· {planLabel}{daysOut != null && daysOut >= 0 ? ` · ${examLabel} in ${daysOut} day${daysOut === 1 ? "" : "s"}` : ""}</span>}
              </div>
              {narrow && <div className="text-[12px]" style={{ color: INK.muted }}>{planLabel}{daysOut != null && daysOut >= 0 ? ` · ${examLabel} in ${daysOut} day${daysOut === 1 ? "" : "s"}` : ""}</div>}
            </div>
            <div className="flex-1" />
            <button type="button" onClick={onStart} disabled={!firstUnwatched} className="lk-btn lk-btn-acc disabled:opacity-40" style={{ padding: narrow ? "11px 18px" : "13px 24px", fontSize: narrow ? 12 : 14 }}><Play className="h-4 w-4" fill="currentColor" /> {firstUnwatched?.done === false && sets.some((s) => s.done) ? "Keep cramming" : "Start cramming"}</button>
          </div>
        </section>

        {/* CRAM ROWS — one per topic */}
        {byTopic.map(({ id, topic, sets: ts }) => (
          <section key={id} style={{ padding: pad }} className="flex flex-col gap-3">
            <RowHead icon="bolt" title="Cram" sub={topic.name} theme={theme} />
            <div className="lk-scroll-x" style={{ gap: narrow ? 8 : 12 }}>
              {ts.map((s) => <Short key={s.set.id} s={s} narrow={narrow} onOpen={() => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id))} />)}
            </div>
          </section>
        ))}

        {/* PRACTICE */}
        <section ref={rowRef("practice")} style={{ padding: pad }} className="flex flex-col gap-3">
          <RowHead title="Practice" sub={chip ? topics.find((x) => x.id === chip)?.name ?? "" : `${t.practiceCount} questions`} theme={theme} />
          <div className="lk-scroll-x" style={{ gap: narrow ? 8 : 12 }}>
            {visible.filter((s) => s.set.ceqCount > 0).map((s) => (
              <button key={s.set.id} type="button" onClick={() => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id, true))} className="lk-card flex shrink-0 flex-col gap-2 p-3.5 text-left" style={{ width: narrow ? 230 : 290, color: INK.text, cursor: "pointer" }}>
                <div className="flex items-center gap-2 text-[13.5px] font-bold"><span className="min-w-0 flex-1 truncate">{s.set.name}</span>{s.locked && <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: INK.muted }} />}</div>
                <div className="text-[12px]" style={{ color: INK.muted }}>{s.set.ceqCount} question{s.set.ceqCount === 1 ? "" : "s"}{s.set.shortLabel ? ` · ${s.set.shortLabel}` : ""}</div>
                {s.set.firstStem && <div className="line-clamp-2 text-[12.5px] leading-relaxed" style={{ color: INK.muted }}>{s.set.firstStem}</div>}
                <span className="lk-btn lk-btn-ghost mt-auto self-start" style={{ padding: "6px 12px", fontSize: 10.5 }}>Start</span>
              </button>
            ))}
            {visible.every((s) => s.set.ceqCount === 0) && <Coming text="Questions for these sets are on the way." narrow={narrow} />}
          </div>
        </section>

        {/* STUDY TOOLS */}
        {!chip && (
          <section ref={rowRef("tools")} style={{ padding: pad }} className="flex flex-col gap-3">
            <RowHead title="Study tools" sub="the tables, statements and cheat codes from the videos" theme={theme} />
            <div className="lk-scroll-x" style={{ gap: narrow ? 8 : 12 }}>
              <Coming text="Coming: the exhibits from each cram video, clickable. Then flashcards and the formulas you have to memorize." narrow={narrow} wide />
            </div>
          </section>
        )}

        {/* BIG WORKOUT PROBLEMS */}
        {!chip && (
          <section ref={rowRef("problems")} style={{ padding: pad }} className="flex flex-col gap-3">
            <RowHead title="Big Workout Problems" sub={`my best guess at the long ones on ${examLabel}`} theme={theme} />
            <div className="lk-scroll-x" style={{ gap: narrow ? 8 : 12 }}>
              <Coming text="Coming after the cram videos: the long multi-part problems, worked start to finish, with a printable to try first." narrow={narrow} wide />
            </div>
          </section>
        )}

        {/* REVIEW */}
        <section ref={rowRef("review")} style={{ padding: pad }} className="flex flex-col gap-3">
          <RowHead title="Review" sub="Lee works each set's questions" theme={theme} />
          <div className="lk-scroll-x" style={{ gap: narrow ? 8 : 12 }}>
            {visible.filter((s) => s.set.hasReview).map((s) => (
              <button key={s.set.id} type="button" onClick={() => (s.locked ? onLocked(s.topic) : onOpenSet(s.set.id))} className="flex shrink-0 flex-col gap-2 text-left" style={{ width: narrow ? 230 : 290, background: "transparent", border: 0, color: INK.text, cursor: "pointer" }}>
                <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: "16 / 9", background: "#000" }}>
                  {s.set.reviewPlaybackId && s.set.reviewPlaybackId !== "__demo__" && <img src={muxThumb(s.set.reviewPlaybackId, 640)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                  {s.set.reviewRuntimeSec != null && <span className="absolute bottom-2 right-2 rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: "rgba(0,0,0,0.7)" }}>{fmtRuntime(s.set.reviewRuntimeSec)}</span>}
                </div>
                <div className="text-[13px] font-semibold">{s.set.name}</div>
              </button>
            ))}
            {visible.every((s) => !s.set.hasReview) && <Coming text="Review videos come once the cram videos are done." narrow={narrow} wide />}
          </div>
        </section>

        {/* YOU */}
        <section ref={rowRef("you")} style={{ padding: pad }} className="flex flex-col gap-3">
          <RowHead title="You" sub={you.total ? `${you.done} of ${you.total} crammed` : ""} theme={theme} />
          <div className="lk-card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1 text-[13px]" style={{ color: INK.muted }}>
              {you.userId ? <>Progress is saved to <b style={{ color: INK.text }}>{you.email}</b>.</> : <>Progress is saved on this device. Add a number in <b style={{ color: INK.text }}>Get study reminders</b> to keep it across devices.</>}
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

function PlanCard({ on, locked, onToggle, title, sub, detail, time, theme, narrow, face }: { on: boolean; locked: boolean; onToggle?: () => void; title: string; sub: string; detail: string; time: string | null; theme: LearnTheme; narrow: boolean; face?: "bolt" }) {
  const clickable = !!onToggle && !locked;
  return (
    <button type="button" onClick={clickable ? onToggle : undefined} disabled={!clickable && !!onToggle} className="lk-card shrink-0 overflow-hidden text-left" style={{ width: narrow ? 250 : undefined, color: INK.text, cursor: clickable ? "pointer" : "default", borderColor: on ? theme.accent : INK.border, boxShadow: on ? `0 0 0 1px ${theme.accent}` : undefined, opacity: locked ? 0.7 : 1 }}>
      <div className="relative grid place-items-center" style={{ aspectRatio: "16 / 9", background: on ? "#000" : INK.surface2 }}>
        {face === "bolt" ? <svg width="46" height="60" viewBox="0 0 54 70" fill="none" stroke={INK.text} strokeWidth="3" strokeLinejoin="round"><path d="M34 4 L10 40 L26 40 L18 66 L46 28 L30 28 Z" fill={theme.accent} /></svg> : <span className="text-[13px]" style={{ color: INK.dim }}>{detail}</span>}
        <span className="lk-btn absolute left-3 top-3" style={{ padding: "5px 10px", fontSize: 10.5, background: on ? theme.accent : INK.border, color: on ? theme.accentInk : INK.text }}>
          {on ? <><Check className="h-3 w-3" /> On</> : locked ? "Soon" : <><Plus className="h-3 w-3" /> Add</>}
        </span>
      </div>
      <div className="px-4 py-3.5">
        <div className="lk-disp" style={{ fontSize: 18 }}>{title}</div>
        <div className="mt-0.5 text-[13px]" style={{ color: INK.muted }}>{sub}</div>
        <div className="mt-2 flex items-baseline gap-2 text-[12.5px]"><span style={{ color: INK.muted }}>{face === "bolt" ? detail : ""}</span>{time && <span className="ml-auto font-bold" style={{ color: on ? theme.accent : INK.muted }}>{on ? time : `+ ${time}`}</span>}</div>
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

function Coming({ text, narrow, wide }: { text: string; narrow: boolean; wide?: boolean }) {
  return <div className="flex shrink-0 items-center rounded-xl px-4 py-4 text-[12.5px] leading-relaxed" style={{ width: narrow ? 260 : wide ? 420 : 290, minHeight: 90, border: `1px dashed ${INK.border2}`, color: INK.muted }}>{text}</div>;
}
