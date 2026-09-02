// THE PERSISTENT HEADER (learn feed, 09-02) — who you are, top-left, always.
//
//   [boiling bolt, in the school's colours]  SURVIVE · ACCY 201        ticker   progress   Share
//                                            Ole Miss · Exam 1 ▾   │ for Phi Delta Sigma
//                                                                  │ sent by Luke Habeeb · IFC Scholarship Chair
//
// The bolt and the course line never change shape. The "who" block to their right fills in as we
// know more — campus (school picker / ?campus / ?g), chapter (the CTA bar's pick, read from the
// same localStorage key), sender (?by, resolved by useShareContext). Nothing in the who-block is
// ever invented: no name on file → no sender line; no chapter picked → no chapter line.
//
// THE TICKER rotates only through things that are TRUE right now: the exam countdown (once the
// student told us the date) and the chapter's real member count (getGoChapter, a count(*)). With
// nothing true to say it shows the one question we want answered: "When's Exam 1?"
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ListTree, LogOut, Mail, Share2, X } from "lucide-react";

import { NEON } from "@/components/canvas/theme";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { councilTypeLabel, type ShareContact } from "@/lib/engaged-contacts.functions";
import { getGoChapter } from "@/lib/greek-go.functions";
import type { School } from "@/lib/schools";
import type { ExamTabState } from "@/components/learn/ExamRail";
import { countdownLabel, daysUntil, readExamDate, writeExamDate } from "@/components/learn/exam-date";
import { CTA_CHAPTER_EVENT } from "@/components/learn/LearnCta";

export type HeaderProgress = {
  /** Playable cram videos in the exam, and how many are watched to the end. */
  total: number;
  done: number;
  /** Seconds of cram still unwatched — null when any playable set has no runtime on file. */
  secondsLeft: number | null;
};

/** The CTA bar's picked chapter, read from ITS localStorage key so the two never disagree. The bar
 *  dispatches CTA_CHAPTER_EVENT on a pick; the header re-reads on that event. */
const pickKey = (campusSlug: string) => `sa-cta-chapter-${campusSlug}`;

export function usePickedChapter(campusSlug: string | null, enabled: boolean) {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    if (!campusSlug) { setSlug(null); return; }
    const read = () => { try { setSlug(localStorage.getItem(pickKey(campusSlug))); } catch { setSlug(null); } };
    read();
    window.addEventListener(CTA_CHAPTER_EVENT, read);
    return () => window.removeEventListener(CTA_CHAPTER_EVENT, read);
  }, [campusSlug]);
  // SAME query key as LearnCta → one request, shared cache.
  const q = useQuery({
    queryKey: ["cta-go-chapter", campusSlug, slug],
    queryFn: () => getGoChapter({ data: { schoolSlug: campusSlug!, chapterSlug: slug! } }),
    enabled: enabled && !!campusSlug && !!slug,
    staleTime: 120_000,
    networkMode: "always",
  });
  return { slug, name: q.data?.chapterName ?? null, members: q.data?.members ?? 0 };
}

/** "IFC scholarship chair" → "IFC Scholarship Chair". All-caps tokens (IFC, NPHC) are kept. */
const titleCase = (s: string) => s.split(/\s+/).map((w) => (w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

/** The sender's role, always carrying its council so a chair reads as "IFC Scholarship Chair", never
 *  a bare "scholarship chair". */
export function senderRole(c: ShareContact): string | null {
  const council = councilTypeLabel(c.councilType);
  if (!c.role) return council;
  const role = titleCase(c.role.trim());
  if (!council) return role;
  return role.toLowerCase().includes(council.toLowerCase()) ? role : `${council} ${role}`;
}

export function LearnHeader({
  school, campusName, exams, examNum, onPickExam, chapter, sender, progress, onShare, onPickChapter,
  onOpenMap, auth, demo, narrow,
}: {
  /** Narrow only: opens the course-map sheet. */
  onOpenMap?: () => void;
  school: School | null;
  /** Fallback when the campus is known to the tree but not to the school table. */
  campusName: string | null;
  exams: ExamTabState[];
  examNum: number | null;
  onPickExam: (num: number) => void;
  chapter: { name: string | null; members: number } | null;
  /** ?by only — the human who forwarded the link. Never ?ref (that's who WE messaged). */
  sender: ShareContact | null;
  progress: HeaderProgress;
  onShare: () => void;
  /** Opens the CTA bar's chapter picker ("Not your chapter?" / "which chapter are you in?"). */
  onPickChapter: (() => void) | null;
  auth: { email: string | null; userId: string | null; signOut: () => void; onSignIn: () => void };
  demo: boolean;
  narrow: boolean;
}) {
  const exam = exams.find((e) => e.num === examNum) ?? null;
  const examLabel = exam?.label ?? "Exam 1";
  const courseCode = school?.courseCode ?? null;
  const schoolName = school?.name ?? campusName;

  // ── the exam date + ticker ────────────────────────────────────────────────────────────────
  const [examDate, setExamDate] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => { if (examNum != null) setExamDate(readExamDate(examNum)); }, [examNum]);
  const saveDate = (iso: string | null) => { if (examNum != null) writeExamDate(examNum, iso); setExamDate(iso); setAsking(false); };

  const tickerItems = useMemo(() => {
    const out: string[] = [];
    if (examDate) out.push(countdownLabel(examLabel, daysUntil(examDate)));
    if (chapter?.name && chapter.members > 0) out.push(`${chapter.members} ${chapter.name} member${chapter.members === 1 ? "" : "s"} on Survive`);
    return out;
  }, [examDate, examLabel, chapter?.name, chapter?.members]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tickerItems.length < 2) return;
    const iv = window.setInterval(() => setTick((n) => n + 1), 8000);
    return () => window.clearInterval(iv);
  }, [tickerItems.length]);
  const tickerText = tickerItems.length ? tickerItems[tick % tickerItems.length] : null;

  // ── progress copy ─────────────────────────────────────────────────────────────────────────
  const allDone = progress.total > 0 && progress.done === progress.total;
  const frac = progress.total > 0 ? progress.done / progress.total : 0;
  const progressText = progress.total === 0
    ? null
    : allDone
      ? `${examLabel} crammed ✓`
      : progress.secondsLeft != null
        ? `${Math.max(1, Math.ceil(progress.secondsLeft / 60))} min of cram left`
        : `${progress.done} of ${progress.total} crammed`;

  const availableExams = exams.filter((e) => e.available);
  const senderLine = sender ? (sender.name ? `sent by ${sender.name}` : null) : null;
  const senderRoleText = sender ? senderRole(sender) : null;

  return (
    <header
      className="relative z-[60] flex shrink-0 items-center gap-3 px-3 sm:gap-5 sm:px-5"
      style={{ minHeight: narrow ? 56 : 76, background: "rgba(9,14,26,0.97)", borderBottom: `1px solid ${NEON.borderSoft}`, fontFamily: BRAND_SANS }}
    >
      {/* THE BOLT — boiling, in the school's colours when we know the school. */}
      <BoltBoil height={narrow ? 34 : 50} red={school?.c1 ?? undefined} blue={school?.c2 ?? undefined} />

      {/* COURSE LINE — never changes shape. */}
      <div className="flex min-w-0 flex-col justify-center">
        <div className="truncate text-[13px] font-black uppercase tracking-[0.14em] sm:text-[17px]" style={{ color: NEON.text, fontFamily: BRAND_DISPLAY }}>
          Survive · {courseCode ?? "Intro Accounting"}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] sm:text-[13px]" style={{ color: NEON.muted }}>
          {schoolName ? <span className="truncate">{schoolName}</span> : <a href="/" className="underline underline-offset-2" style={{ color: NEON.cyan }}>pick your school</a>}
          <span aria-hidden>·</span>
          {availableExams.length > 1 ? (
            <select
              value={examNum ?? ""}
              onChange={(e) => onPickExam(Number(e.target.value))}
              className="rounded-md px-1 py-0.5 text-[11.5px] font-bold outline-none sm:text-[12.5px]"
              style={{ background: "transparent", color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
              aria-label="Which exam"
            >
              {availableExams.map((e) => <option key={e.num} value={e.num}>{e.label}</option>)}
            </select>
          ) : (
            <span className="font-bold" style={{ color: NEON.text }}>{examLabel}</span>
          )}
          {demo && <span className="rounded-full px-1.5 py-px text-[9px] font-black uppercase tracking-wider" style={{ color: "#0B1322", background: NEON.cyan }}>Demo</span>}
        </div>
      </div>

      {/* THE WHO BLOCK — chapter, then sender. Hidden on a phone (the CTA bar carries the chapter). */}
      {!narrow && (chapter?.name || sender) && (
        <div className="flex min-w-0 items-center gap-3 border-l pl-4" style={{ borderColor: NEON.borderSoft }}>
          {chapter?.name && (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-black" style={{ border: `1px solid ${NEON.border}`, color: NEON.text }}>
              {chapter.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase()}
            </div>
          )}
          <div className="flex min-w-0 flex-col">
            {chapter?.name ? (
              <div className="truncate text-[13px]" style={{ color: NEON.text }}>
                for <b>{chapter.name}</b>
                {onPickChapter && <button type="button" onClick={onPickChapter} className="ml-2 text-[11px] underline underline-offset-2" style={{ color: NEON.muted }}>Not your chapter?</button>}
              </div>
            ) : sender?.isCouncil && onPickChapter ? (
              <button type="button" onClick={onPickChapter} className="truncate text-left text-[12.5px] underline underline-offset-2" style={{ color: NEON.cyan }}>which chapter are you in?</button>
            ) : null}
            {senderLine ? (
              <div className="truncate text-[11.5px]" style={{ color: NEON.muted }}>
                {senderLine}{senderRoleText && <> · <b style={{ color: NEON.text }}>{senderRoleText}</b></>}
              </div>
            ) : sender && !sender.name && senderRoleText ? (
              <div className="truncate text-[11.5px]" style={{ color: NEON.muted }}>shared by {[sender.campusName, senderRoleText].filter(Boolean).join(" ")}</div>
            ) : null}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1" />

      {/* TICKER / THE ONE QUESTION */}
      {!narrow && (
        asking ? (
          <div className="flex items-center gap-1.5">
            <input
              type="date" autoFocus aria-label={`When is ${examLabel}?`}
              className="rounded-lg px-2 py-1 text-[12px] outline-none"
              style={{ background: "#0e131b", color: NEON.text, border: `1px solid ${NEON.borderSoft}`, colorScheme: "dark" }}
              onChange={(e) => { if (e.target.value) saveDate(e.target.value); }}
            />
            <button type="button" onClick={() => setAsking(false)} className="grid h-7 w-7 place-items-center rounded-full" style={{ color: NEON.muted }} aria-label="Never mind"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : tickerText ? (
          <button
            type="button" onClick={() => setAsking(true)} title="Change the exam date"
            className="max-w-[260px] truncate rounded-full px-3 py-1 text-[11.5px] font-bold"
            style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}`, background: "rgba(255,255,255,0.03)" }}
          >
            {tickerText}
          </button>
        ) : examNum != null ? (
          <button
            type="button" onClick={() => setAsking(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold"
            style={{ color: NEON.yellow, border: `1px solid rgba(252,163,17,0.45)` }}
          >
            <CalendarDays className="h-3.5 w-3.5" /> When's {examLabel}?
          </button>
        ) : null
      )}

      {/* CRAM PROGRESS — minutes left, the whole pitch of the page in one number. */}
      {progressText && (
        <div className="flex flex-col items-end gap-1">
          {!narrow && <span className="text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: NEON.muted }}>Cram progress</span>}
          <div className="flex items-center gap-2">
            <span className="hidden h-2 w-[120px] overflow-hidden rounded-full sm:block lg:w-[180px]" style={{ background: "rgba(255,255,255,0.1)" }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.round(frac * 100)}%`, background: allDone ? NEON.green : NEON.yellow, transition: "width 300ms" }} />
            </span>
            <span className="whitespace-nowrap text-[11.5px] font-bold tabular-nums sm:text-[12.5px]" style={{ color: allDone ? NEON.green : NEON.text }}>{progressText}</span>
          </div>
        </div>
      )}

      {narrow && onOpenMap && (
        <button type="button" onClick={onOpenMap} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} title="Course map"><ListTree className="h-3.5 w-3.5" /></button>
      )}
      <button
        type="button" onClick={onShare}
        className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-black"
        style={{ background: NEON.yellow, color: "#0B1322" }}
        title="Share this with a friend"
      >
        <Share2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Share</span>
      </button>

      {auth.userId ? (
        <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={auth.signOut} title={`Sign out${auth.email ? ` (${auth.email})` : ""}`}><LogOut className="h-3.5 w-3.5" /></button>
      ) : (
        <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={auth.onSignIn} title="Sign in to save progress across devices"><Mail className="h-3.5 w-3.5" /></button>
      )}
    </header>
  );
}
