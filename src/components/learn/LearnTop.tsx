// THE FROZEN TOP (learn v3, 09-03) — brand, who you are, and ONE call to action.
//
//   [bolt]  SURVIVE · ACCY 201      for Phi Delta Sigma · sent by Luke Habeeb, IFC Scholarship Chair
//           Ole Miss · Exam 1 ▾                                 [Exam 1 · 13 days out] [Get study reminders]
//
// No Share up here (sharing lives where sharing happens) and no mailbox. The one button asks for
// the exam date and a phone number and queues a real text through scheduleExamReminder — the
// same capture also gives the ticker its countdown. Copy never mentions links, passwords or
// "magic" anything.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Menu, X } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { councilTypeLabel, type ShareContact } from "@/lib/engaged-contacts.functions";
import { getGoChapter } from "@/lib/greek-go.functions";
import type { School } from "@/lib/schools";
import type { ExamTabState } from "@/components/learn/ExamRail";
import { countdownLabel, daysUntil, readExamDate, writeExamDate } from "@/components/learn/exam-date";
import { CTA_CHAPTER_EVENT } from "@/components/learn/LearnCta";
import { allowedOffsets, REMINDER_DISCLOSURE, scheduleExamReminder } from "@/lib/exam-reminder.functions";
import { INK, type LearnTheme } from "@/components/learn/learn-theme";

export type TopProgress = { total: number; done: number; secondsLeft: number | null };

const pickKey = (campusSlug: string) => `sa-cta-chapter-${campusSlug}`;
const REMINDER_KEY = "sa-reminder-set";

/** The CTA bar's picked chapter, read from ITS localStorage key so the two never disagree. */
export function usePickedChapter(campusSlug: string | null, enabled: boolean) {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    if (!campusSlug) { setSlug(null); return; }
    const read = () => { try { setSlug(localStorage.getItem(pickKey(campusSlug))); } catch { setSlug(null); } };
    read();
    window.addEventListener(CTA_CHAPTER_EVENT, read);
    return () => window.removeEventListener(CTA_CHAPTER_EVENT, read);
  }, [campusSlug]);
  const q = useQuery({
    queryKey: ["cta-go-chapter", campusSlug, slug],
    queryFn: () => getGoChapter({ data: { schoolSlug: campusSlug!, chapterSlug: slug! } }),
    enabled: enabled && !!campusSlug && !!slug,
    staleTime: 120_000,
    networkMode: "always",
  });
  return { slug, name: q.data?.chapterName ?? null, members: q.data?.members ?? 0 };
}

const titleCase = (s: string) => s.split(/\s+/).map((w) => (w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
/** "IFC Scholarship Chair" — the role always carries its council. */
export function senderRole(c: ShareContact): string | null {
  const council = councilTypeLabel(c.councilType);
  if (!c.role) return council;
  const role = titleCase(c.role.trim());
  if (!council) return role;
  return role.toLowerCase().includes(council.toLowerCase()) ? role : `${council} ${role}`;
}

export function LearnTop({
  school, campusId, campusName, exams, examNum, onPickExam, chapter, sender, progress, theme,
  onPickChapter, onOpenPath, demo, narrow, contactRef,
}: {
  school: School | null;
  campusId: string | null;
  campusName: string | null;
  exams: ExamTabState[];
  examNum: number | null;
  onPickExam: (num: number) => void;
  chapter: { name: string | null; members: number } | null;
  sender: ShareContact | null;
  progress: TopProgress;
  theme: LearnTheme;
  onPickChapter: (() => void) | null;
  /** Narrow only: opens the path sheet. */
  onOpenPath: () => void;
  demo: boolean;
  narrow: boolean;
  /** by ?? ref — rides on the reminder link so the chain stays visible. */
  contactRef: string | null;
}) {
  const exam = exams.find((e) => e.num === examNum) ?? null;
  const examLabel = exam?.label ?? "Exam 1";
  const courseCode = school?.courseCode ?? null;
  const schoolName = school?.name ?? campusName;
  const availableExams = exams.filter((e) => e.available);

  const [examDate, setExamDate] = useState<string | null>(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (examNum == null) return;
    setExamDate(readExamDate(examNum));
    try { setReminderOn(localStorage.getItem(`${REMINDER_KEY}-${examNum}`) === "1"); } catch { /* ignore */ }
  }, [examNum]);

  const ticker = useMemo(() => {
    const out: string[] = [];
    if (examDate) out.push(countdownLabel(examLabel, daysUntil(examDate)));
    if (chapter?.name && chapter.members > 0) out.push(`${chapter.members} ${chapter.name} member${chapter.members === 1 ? "" : "s"} on Survive`);
    return out;
  }, [examDate, examLabel, chapter?.name, chapter?.members]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (ticker.length < 2) return;
    const iv = window.setInterval(() => setTick((n) => n + 1), 8000);
    return () => window.clearInterval(iv);
  }, [ticker.length]);
  const tickerText = ticker.length ? ticker[tick % ticker.length] : null;

  const allDone = progress.total > 0 && progress.done === progress.total;
  const progressText = progress.total === 0 ? null : allDone ? `${examLabel} crammed` : progress.secondsLeft != null ? `${Math.max(1, Math.ceil(progress.secondsLeft / 60))} min left` : `${progress.done} of ${progress.total}`;

  const senderLine = sender?.name ? `sent by ${sender.name}` : null;
  const senderRoleText = sender ? senderRole(sender) : null;
  const ctaLabel = reminderOn && examDate ? `Reminder on · ${fmtShort(examDate)}` : narrow ? "Get reminders" : "Get study reminders";

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 px-4 sm:gap-4 sm:px-8" style={{ minHeight: narrow ? 58 : 72, background: INK.bg }}>
        {narrow && <button type="button" onClick={onOpenPath} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ color: INK.text, background: "transparent", border: 0 }} aria-label="Your path"><Menu className="h-5 w-5" /></button>}
        <BoltBoil height={narrow ? 30 : 40} red={school?.c1 ?? undefined} blue={school?.c2 ?? undefined} />
        <div className="flex min-w-0 flex-col justify-center">
          <div className="lk-disp truncate uppercase" style={{ fontSize: narrow ? 14 : 18, letterSpacing: "0.14em", lineHeight: 1.15 }}>
            {narrow ? (courseCode ?? "Survive") : `Survive · ${courseCode ?? "Intro Accounting"}`}
          </div>
          <div className="flex min-w-0 items-center gap-1.5" style={{ fontSize: narrow ? 11.5 : 13, color: INK.muted }}>
            {schoolName ? <span className="truncate">{schoolName}</span> : <a href="/" style={{ color: "var(--lk-acc)" }}>pick your school</a>}
            <span aria-hidden>·</span>
            {availableExams.length > 1 ? (
              <select value={examNum ?? ""} onChange={(e) => onPickExam(Number(e.target.value))} aria-label="Which exam" className="rounded-md px-1 py-0.5 font-semibold outline-none" style={{ background: "transparent", color: INK.text, border: `1px solid ${INK.border}`, fontSize: narrow ? 11.5 : 12.5 }}>
                {availableExams.map((e) => <option key={e.num} value={e.num}>{e.label}</option>)}
              </select>
            ) : (
              <span className="font-semibold" style={{ color: INK.text }}>{examLabel}</span>
            )}
            {demo && !narrow && <span className="rounded-full px-1.5 py-px text-[9px] font-black uppercase tracking-wider" style={{ color: "#111", background: INK.green }}>Demo</span>}
          </div>
        </div>

        {!narrow && (chapter?.name || sender) && (
          <div className="flex min-w-0 flex-col border-l pl-4" style={{ borderColor: INK.border, fontSize: 12.5 }}>
            {chapter?.name ? (
              <div className="truncate" style={{ color: INK.muted }}>
                for <b style={{ color: INK.text }}>{chapter.name}</b>
                {onPickChapter && <button type="button" onClick={onPickChapter} className="ml-2 underline underline-offset-2" style={{ color: INK.dim, background: "transparent", border: 0, fontSize: 11, cursor: "pointer" }}>Not your chapter?</button>}
              </div>
            ) : sender?.isCouncil && onPickChapter ? (
              <button type="button" onClick={onPickChapter} className="truncate text-left underline underline-offset-2" style={{ color: "var(--lk-acc)", background: "transparent", border: 0, cursor: "pointer", fontSize: 12.5 }}>which chapter are you in?</button>
            ) : null}
            {senderLine ? (
              <div className="truncate" style={{ color: INK.muted }}>{senderLine}{senderRoleText && <>, <b style={{ color: INK.text }}>{senderRoleText}</b></>}</div>
            ) : sender && !sender.name && senderRoleText ? (
              <div className="truncate" style={{ color: INK.muted }}>shared by {[sender.campusName, senderRoleText].filter(Boolean).join(" ")}</div>
            ) : null}
          </div>
        )}

        <div className="min-w-0 flex-1" />

        {!narrow && tickerText && (
          <button type="button" onClick={() => setSheet(true)} className="max-w-[240px] truncate rounded-full px-3.5 py-1.5 font-semibold" style={{ fontSize: 12.5, color: INK.muted, border: `1px solid ${INK.border}`, background: "transparent", cursor: "pointer" }} title="Change the date">{tickerText}</button>
        )}
        {!narrow && progressText && (
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-[110px] overflow-hidden rounded-full lg:w-[150px]" style={{ background: INK.border }}><span className="block h-full rounded-full" style={{ width: `${Math.round((progress.total ? progress.done / progress.total : 0) * 100)}%`, background: allDone ? INK.green : "var(--lk-acc)", transition: "width 300ms" }} /></span>
            <span className="whitespace-nowrap font-semibold tabular-nums" style={{ fontSize: 12.5, color: allDone ? INK.green : INK.text }}>{progressText}</span>
          </div>
        )}
        <button type="button" onClick={() => setSheet(true)} className={`lk-btn ${reminderOn ? "lk-btn-ghost" : "lk-btn-acc"}`} style={{ fontSize: narrow ? 10.5 : 12, padding: narrow ? "8px 12px" : undefined }}>
          {reminderOn && <Check className="h-3.5 w-3.5" />} {ctaLabel}
        </button>
      </header>

      {sheet && (
        <ReminderSheet
          examNum={examNum ?? 1} examLabel={examLabel} initialDate={examDate} campusId={campusId} courseCode={courseCode} contactRef={contactRef} demo={demo}
          onClose={() => setSheet(false)}
          onSaved={(date, scheduled) => { if (examNum != null) { writeExamDate(examNum, date); setExamDate(date); if (scheduled) { setReminderOn(true); try { localStorage.setItem(`${REMINDER_KEY}-${examNum}`, "1"); } catch { /* ignore */ } } } }}
        />
      )}
    </>
  );
}

const fmtShort = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); };

/** One card, two fields: the date and a number. Date alone still saves (powers the ticker);
 *  date + number queues the text. Nothing about links or passwords, ever. */
function ReminderSheet({ examNum, examLabel, initialDate, campusId, courseCode, contactRef, demo, onClose, onSaved }: {
  examNum: number; examLabel: string; initialDate: string | null; campusId: string | null; courseCode: string | null; contactRef: string | null; demo: boolean;
  onClose: () => void; onSaved: (date: string, scheduled: boolean) => void;
}) {
  const [date, setDate] = useState(initialDate ?? "");
  const [phone, setPhone] = useState("");
  const [offset, setOffset] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const days = date ? daysUntil(date) : null;
  const offsets = days != null && days >= 0 ? allowedOffsets(days) : [];
  useEffect(() => { if (offsets.length && !offsets.includes(offset)) setOffset(offsets[0]); }, [offsets, offset]);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && days != null && days >= 0;
  const phoneOk = phone.trim().replace(/\D/g, "").length >= 10;

  const submit = async () => {
    if (!dateOk || busy) return;
    setBusy(true); setErr(null);
    try {
      if (!phoneOk) { onSaved(date, false); setDone("Date saved. Add a number any time and I'll text you before it."); return; }
      if (demo) { onSaved(date, true); setDone("Demo — nothing was sent."); return; }
      const r = await scheduleExamReminder({ data: { phone: phone.trim(), examDate: date, offsetDays: offset, campusId, courseCode, ref: contactRef } });
      if (r.ok) { onSaved(date, true); setDone(r.immediate ? "Your exam is basically here — texting you now." : `Set. One text on ${new Date(r.sendOnISO).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.`); }
      else if (r.reason === "bad-phone") setErr("That number didn't look right.");
      else if (r.reason === "past") setErr("That date's already gone by.");
      else setErr("Couldn't set that right now — try again in a minute.");
    } catch { setErr("Couldn't set that right now — try again in a minute."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="lk-in w-full rounded-t-2xl p-5 sm:max-w-[420px] sm:rounded-2xl" style={{ background: INK.surface, border: `1px solid ${INK.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="lk-disp" style={{ fontSize: 20 }}>When's {examLabel}?</div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full" style={{ background: INK.border, color: INK.text, border: 0, cursor: "pointer" }} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {done ? (
          <div className="rounded-xl px-4 py-4 text-center" style={{ background: "rgba(78,232,180,0.12)", border: `1px solid ${INK.green}` }}>
            <Check className="mx-auto h-6 w-6" style={{ color: INK.green }} />
            <p className="mt-1 text-[14px] font-bold">{done}</p>
            <button type="button" onClick={onClose} className="lk-btn lk-btn-ghost mt-3">Back to cramming</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="lk-field" style={{ colorScheme: "dark" }} aria-label="Exam date" />
            <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="your number (optional)" className="lk-field" aria-label="Phone number" />
            {phoneOk && offsets.length > 1 && (
              <div className="flex items-center gap-2 text-[12.5px]" style={{ color: INK.muted }}>
                text me
                <div className="relative">
                  <select value={offset} onChange={(e) => setOffset(Number(e.target.value))} className="appearance-none rounded-lg py-1 pl-2 pr-6 font-semibold outline-none" style={{ background: INK.surface2, color: INK.text, border: `1px solid ${INK.border}` }}>
                    {offsets.map((n) => <option key={n} value={n}>{n} day{n === 1 ? "" : "s"}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                </div>
                before
              </div>
            )}
            <button type="button" onClick={() => void submit()} disabled={!dateOk || busy} className="lk-btn lk-btn-acc mt-1 disabled:opacity-40" style={{ minHeight: 46, fontSize: 13 }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {phoneOk ? "Set my reminder" : "Save the date"}
            </button>
            {err && <p role="alert" className="text-[12.5px]" style={{ color: INK.red }}>{err}</p>}
            <p className="text-[11.5px] leading-snug" style={{ color: INK.dim }}>{phoneOk ? REMINDER_DISCLOSURE : "I'll text you the cram videos before your exam and keep your spot here on this number."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
