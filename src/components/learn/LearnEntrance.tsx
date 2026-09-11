// THE ENTRANCE (desktop pass, Lee, 2026-09-10: "for desktop I picture a bigger grand entrance.
// For mobile too"). The one block above the first row that says what this is and whose it is:
//
//   [school bolt]  Like Reels for exam prep.
//                  Cram what's on your exam. Skip everything else. Average video length ~2.4 min.
//                  Ole Miss · ACCY 201 · Exam 1 · 5 videos · free   [ΦΔΣ]
//                  [ Start Easy Points → ]   See what's on the exam ↓
//
// WHAT IT WEARS. The campus's coloured, animated bolt when the campus is known — the same BoltBoil
// the home page's CampusBolt and the top bar draw, coloured c1/c2 the way the home page colours it,
// never redrawn — the campus name and course code in the meta row, and the picked chapter's Greek
// letters as a chip when the share funnel knows one. Nothing known: the brand bolt and
// "Pick your school", which opens the existing picker sheet in place.
//
// EVERY NUMBER IS REAL: the video count is the first topic's set count, the average is
// averageVideoLabel over the exam's timed sets (learn-gate.ts) and is simply absent until a
// runtime exists. Copy rule: no "run" / "blast" / "pledge", no emoji.
//
// Narrow keeps a compact version — display line 24px, the sub line, the school chip — and no big
// button, because the first row is right there under it.
import { ChevronDown } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BRAND_SANS } from "@/components/canvas/brand";
import { LK, type LearnTheme } from "@/components/learn/learn-theme";
import type { Tier } from "@/components/learn/use-tier";
import type { School } from "@/lib/schools";

export function LearnEntrance({ tier, theme, school, campusName, chapterLetters, examLabel, firstTopicName, videoCount, averageLabel, onStart, onSeeExam, onPickSchool }: {
  tier: Tier;
  theme: LearnTheme;
  school: School | null;
  /** The campus's name when the campus is known but not in the static school table. */
  campusName: string | null;
  chapterLetters: string | null;
  examLabel: string;
  firstTopicName: string | null;
  /** The first topic's set count. */
  videoCount: number;
  /** "~2.4 min" from learn-gate's averageVideoLabel, or null when nothing has a runtime. */
  averageLabel: string | null;
  onStart: () => void;
  onSeeExam: () => void;
  onPickSchool: () => void;
}) {
  const narrow = tier === "narrow";
  const wide = tier === "wide";
  const name = school?.name ?? campusName;
  const boltH = narrow ? 40 : wide ? 104 : 80;
  const displaySize = narrow ? 24 : wide ? 44 : 34;
  const bolt = (
    <span className="relative inline-block shrink-0" style={{ lineHeight: 0 }}>
      {/* A soft pool of the accent under the bolt — the one decorative note on the page. */}
      {!narrow && <span aria-hidden className="absolute rounded-full" style={{ inset: "-28%", background: `radial-gradient(circle, ${theme.accent}33 0%, ${theme.accent}00 68%)` }} />}
      <span className="relative inline-block">
        <BoltBoil height={boltH} red={school?.c1 ?? undefined} blue={school?.c2 ?? undefined} />
      </span>
    </span>
  );

  const schoolControl = name ? (
    <button type="button" onClick={onPickSchool} title="Change school" className="inline-flex min-w-0 items-center gap-1" style={{ background: "transparent", border: 0, padding: 0, color: LK.text, fontWeight: 700, fontSize: "inherit", fontFamily: "inherit", cursor: "pointer", minHeight: narrow ? 44 : undefined }}>
      <span className="truncate">{name}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: LK.muted }} aria-hidden />
    </button>
  ) : (
    <button type="button" onClick={onPickSchool} className="inline-flex items-center gap-1 rounded-full" style={{ background: "transparent", border: `1px solid ${LK.acc}`, color: LK.acc, padding: "5px 12px", fontWeight: 700, fontSize: "inherit", fontFamily: "inherit", cursor: "pointer", minHeight: narrow ? 44 : 32 }}>
      Pick your school
      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
  const letters = chapterLetters ? (
    <span className="rounded-full font-black" style={{ padding: "3px 10px", fontSize: narrow ? 12 : 13, letterSpacing: "0.04em", color: LK.text, border: `1px solid ${theme.accent}66`, background: `${theme.accent}14`, textShadow: `0 0 10px ${theme.accent}55`, fontFamily: BRAND_SANS }} title="Your chapter">{chapterLetters}</span>
  ) : null;
  const count = `${videoCount} video${videoCount === 1 ? "" : "s"} · free`;

  const meta = (
    <div className="flex flex-wrap items-center" style={{ gap: narrow ? "6px 8px" : "8px 10px", fontSize: narrow ? 13 : 14.5, color: LK.muted, fontFamily: BRAND_SANS }}>
      {schoolControl}
      {school?.courseCode && <><Dot /><span>{school.courseCode}</span></>}
      <Dot /><span>{examLabel}</span>
      <Dot /><span>{count}</span>
      {letters && <><Dot />{letters}</>}
    </div>
  );

  const display = (
    <h1 className="lk-disp" style={{ margin: 0, fontSize: displaySize, lineHeight: 1.05, letterSpacing: "-0.015em", color: LK.text, textWrap: "balance" }}>
      Like <span style={{ color: LK.acc }}>Reels</span> for exam prep.
    </h1>
  );
  const sub = (
    <p style={{ margin: 0, fontSize: narrow ? 14 : 17, lineHeight: 1.45, color: LK.muted, fontFamily: BRAND_SANS, maxWidth: 640 }}>
      Cram what's on your exam. Skip everything else.{averageLabel && <> <span style={{ whiteSpace: "nowrap" }}>Average video length {averageLabel}.</span></>}
    </p>
  );

  if (narrow) {
    return (
      <section aria-label="Welcome" className="flex flex-col" style={{ gap: 10, paddingTop: 4 }}>
        <div className="flex items-center" style={{ gap: 12 }}>
          {bolt}
          <div className="min-w-0">{display}</div>
        </div>
        {sub}
        {meta}
      </section>
    );
  }

  return (
    <section aria-label="Welcome" className="flex items-center" style={{ gap: wide ? 36 : 28, paddingTop: wide ? 28 : 16, paddingBottom: wide ? 8 : 0 }}>
      {bolt}
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: wide ? 14 : 12 }}>
        {display}
        {sub}
        {meta}
        <div className="flex flex-wrap items-center" style={{ gap: "12px 22px", marginTop: wide ? 6 : 2 }}>
          <button type="button" onClick={onStart} className="lk-btn lk-btn-acc" style={{ fontSize: 13.5, padding: "14px 24px", minHeight: 48, boxShadow: `0 10px 28px -10px ${theme.accent}88` }}>
            Start {firstTopicName ?? examLabel} →
          </button>
          <button type="button" onClick={onSeeExam} className="inline-flex items-center gap-1.5" style={{ background: "transparent", border: 0, padding: 0, color: LK.text, fontSize: 14.5, fontWeight: 600, fontFamily: BRAND_SANS, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, textDecorationColor: LK.dim }}>
            See what's on the exam ↓
          </button>
        </div>
      </div>
    </section>
  );
}

function Dot() { return <span aria-hidden style={{ color: LK.dim }}>·</span>; }
