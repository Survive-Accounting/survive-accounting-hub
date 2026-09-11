// THE NAVBAR (redesign, 2026-09-11 — docs/LEARN-REDESIGN-PROPOSAL-2026-09-11.md §1).
//
//   [BIG bolt]  survive │ Ole Miss                  Leave a review   [Share]  [≡]
//     ΑΤΟ               │ ACCY 201 · Exam 1
//   [Exam 1] [Exam 2 🔒] [Exam 3 🔒]
//
// LEFT: the campus bolt, big (44px tall on wide / 36 on narrow, BoltBoil in the school's colours),
// and when the share funnel knows the student's chapter its Greek letters sit centred over the
// bolt in cream — the bolt boils, the letters hold still (a static, pointer-events:none overlay,
// the same letters the home page's doors draw). Then the wordmark, which reads "survive" only, and
// a two-line block: the campus name (or "Pick your school", which opens the picker sheet in place)
// over "ACCY 201 · Exam 1". "Ole Miss · ACCY 201 · Exam 1" has left the bar; there is no rail.
//
// EXAM PILLS under the bolt: Exam 1 is the live pill. Exam 2 and Exam 3 wear a drawn lock and
// open the waitlist sheet — "Exam 1 is free. Exam 2 is $50. Join the waitlist and I'll tell you
// the day it opens." (learn-gate's examWaitlistLine) — which submits through the unified intake
// (kind notify_exam, exam 2|3, source learn-exam-waitlist). An exam that has videos is live.
//
// RIGHT: "Leave a review" (a link to /#reviews) · Share (the page's share) · the hamburger, which
// holds everything else, in this order: Share this · Set up exam reminders (the home page's
// ExamReminder, in a modal) · Home · Sign in / Sign out (with the email when signed in) · Set up
// your Greek chapter (/chapters) · Join the campus rep program (/rep/join). On a phone the review
// link does not fit the bar, so it closes the sheet's list instead of disappearing.
//
// THE BAR STILL WEARS THE SCHOOL (2026-09-10): ground = c1, rule = c2, ink re-picked for contrast
// (theme.top* from learn-theme's topBarFor). The old ticker, progress meter, sender line and the
// bar's own reminder sheet are gone from the bar (ReminderSheet stays below, unmounted, for the
// day reminders are advertised inside the player). Copy rule: no "run" / "blast" / "pledge", no
// emoji — every glyph in the bar is drawn.
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, X } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { councilTypeLabel, type ShareContact } from "@/lib/engaged-contacts.functions";
import { getGoChapter } from "@/lib/greek-go.functions";
import { chapterShortName } from "@/components/site/ChapterShare";
import { ExamReminder } from "@/components/site/home-two-door/ExamReminder";
import type { School } from "@/lib/schools";
import type { ExamTabState } from "@/components/learn/ExamRail";
import { daysUntil, writeExamDate } from "@/components/learn/exam-date";
import { CTA_CHAPTER_EVENT } from "@/components/learn/LearnCta";
import { EMAIL_RE, examWaitlistLine, isUuid } from "@/components/learn/learn-gate";
import { allowedOffsets, REMINDER_DISCLOSURE, scheduleExamReminder } from "@/lib/exam-reminder.functions";
import { submitIntake } from "@/lib/intake.functions";
import { useDismiss } from "@/lib/use-dismiss";
import { LK, type LearnTheme } from "@/components/learn/learn-theme";

export type TopProgress = { total: number; done: number; secondsLeft: number | null };

const pickKey = (campusSlug: string) => `sa-cta-chapter-${campusSlug}`;

/** The CTA bar's picked chapter, read from ITS localStorage key so the two never disagree.
 *  `letters` rides along for the header's Greek identity treatment — same field, same fallback
 *  derivation (chapterShortName) the public Greek chapter page already uses for the same job. */
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
  const name = q.data?.chapterName ?? null;
  const letters = q.data ? ((q.data.letters ?? "").trim() || chapterShortName(q.data.chapterName, q.data.letters, q.data.nickname)) : null;
  return { slug, name, letters, members: q.data?.members ?? 0 };
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

/** The pills the bar always shows, live or locked. The Final (4) joins only once it has videos. */
const PILL_EXAMS = [1, 2, 3] as const;

/** The bolt's height per tier — the one big thing in the bar. */
const BOLT_H = { narrow: 36, wide: 44 } as const;

export type TopYou = { email: string | null; userId: string | null; onSignIn: () => void; signOut: () => void };

export function LearnTop({
  school, campusId, campusName, exams, examNum, onPickExam, chapter, theme, onPickSchool, onShare, you, demo, narrow,
}: {
  school: School | null;
  campusId: string | null;
  campusName: string | null;
  exams: ExamTabState[];
  examNum: number | null;
  onPickExam: (num: number) => void;
  /** The picked chapter — its letters go over the bolt. */
  chapter: { name: string | null; letters?: string | null; members: number } | null;
  theme: LearnTheme;
  /** Opens the in-place school picker (LearnSchoolSheet) — never a navigation. */
  onPickSchool: () => void;
  /** The page's share — the Greek share sheet when mounted, else copy the link. */
  onShare: () => void;
  /** Sign in / sign out for the hamburger. */
  you: TopYou;
  demo: boolean;
  narrow: boolean;
}) {
  const exam = exams.find((e) => e.num === examNum) ?? null;
  const examLabel = exam?.label ?? "Exam 1";
  const courseCode = school?.courseCode ?? null;
  const schoolName = school?.name ?? campusName;
  const finalExam = exams.find((e) => e.num === 4 && e.available) ?? null;
  const pills = [...PILL_EXAMS.map((n) => exams.find((e) => e.num === n) ?? { num: n, label: `Exam ${n}`, available: false, videoCount: 0 }), ...(finalExam ? [finalExam] : [])];

  const [menuOpen, setMenuOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [waitlistExam, setWaitlistExam] = useState<number | null>(null);
  const letters = chapter?.letters?.trim() || null;

  // The bar's own ink — chalk on black until a school is picked, then whatever reads on c1.
  const ink = theme.topInk, muted = theme.topMuted, rule = theme.topBorder;
  const boltH = narrow ? BOLT_H.narrow : BOLT_H.wide;
  // 375px has to hold the bolt, "survive", "Pick your school", Share and the hamburger: tight
  // gutters on a phone so the school's name is read, not truncated.
  const pad = narrow ? 12 : 32;
  const iconBtn = { background: "transparent", border: 0, color: ink, cursor: "pointer", padding: 0 } as const;

  return (
    <>
      <header className="flex shrink-0 flex-col" style={{ background: theme.topBg, borderBottom: `1px solid ${rule}`, color: ink, padding: `${narrow ? 8 : 12}px ${pad}px ${narrow ? 10 : 12}px`, gap: narrow ? 8 : 10, fontFamily: BRAND_SANS }}>
        <div className="flex items-center" style={{ gap: narrow ? 8 : 14, minHeight: boltH }}>
          {/* THE BIG BOLT, with the chapter's letters held still over it. */}
          <span className="relative inline-block shrink-0" style={{ lineHeight: 0 }} title={letters ? `${letters} · ${schoolName ?? "your campus"}` : undefined}>
            <BoltBoil height={boltH} red={school?.c1 ?? undefined} blue={school?.c2 ?? undefined} cream={ink} boilSeconds={1.2} />
            {letters && (
              <span aria-hidden className="absolute inset-0 grid place-items-center" style={{ pointerEvents: "none", color: "#F5EFE6", fontFamily: BRAND_DISPLAY, fontWeight: 800, fontSize: Math.round(boltH * 0.3), letterSpacing: "0.02em", lineHeight: 1, textShadow: "0 1px 2px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.6)", whiteSpace: "nowrap" }}>{letters}</span>
            )}
          </span>
          {/* THE WORDMARK — "survive" only. */}
          <span className="lk-disp shrink-0" style={{ fontSize: narrow ? 15 : 21, letterSpacing: "-0.01em", lineHeight: 1, color: ink }}>survive</span>
          {/* THE TWO-LINE BLOCK: campus over course · exam. */}
          <div className="flex min-w-0 flex-col justify-center border-l" style={{ borderColor: rule, paddingLeft: narrow ? 10 : 14, gap: 1 }}>
            <button type="button" onClick={onPickSchool} className="flex min-w-0 items-center gap-1 text-left" title="Change school" style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", color: schoolName ? ink : LK.acc, fontSize: narrow ? 13.5 : 15, fontWeight: 800, fontFamily: "inherit", lineHeight: 1.2, minHeight: narrow ? 22 : 24 }}>
              <span className="truncate">{schoolName ?? "Pick your school"}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: muted }} aria-hidden />
            </button>
            <div className="flex min-w-0 items-center gap-1.5 truncate" style={{ fontSize: narrow ? 11.5 : 12.5, color: muted, fontWeight: 600, lineHeight: 1.2 }}>
              {courseCode && <><span className="truncate">{courseCode}</span><span aria-hidden>·</span></>}
              <span style={{ color: ink }}>{examLabel}</span>
              {demo && <span className="rounded-full px-1.5 py-px text-[9px] font-black uppercase tracking-wider" style={{ color: "#111", background: LK.green }}>Demo</span>}
            </div>
          </div>

          <div className="min-w-0 flex-1" />

          {/* RIGHT: review · share · the hamburger. */}
          {!narrow && (
            <a href="/#reviews" className="shrink-0" style={{ color: ink, fontSize: 13.5, fontWeight: 700, textDecoration: "none", opacity: 0.9, minHeight: 36, display: "inline-flex", alignItems: "center" }}>Leave a review</a>
          )}
          {narrow ? (
            <button type="button" onClick={onShare} aria-label="Share" className="grid shrink-0 place-items-center rounded-full" style={{ ...iconBtn, width: 40, height: 40 }}><ShareGlyph /></button>
          ) : (
            <button type="button" onClick={onShare} className="inline-flex shrink-0 items-center gap-2 rounded-full" style={{ minHeight: 38, padding: "0 16px", border: `1px solid ${rule}`, background: "transparent", color: ink, cursor: "pointer", fontSize: 13.5, fontWeight: 800, fontFamily: "inherit" }}><ShareGlyph /> Share</button>
          )}
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Menu" aria-expanded={menuOpen} className="grid shrink-0 place-items-center rounded-full" style={{ ...iconBtn, width: narrow ? 40 : 44, height: narrow ? 40 : 44 }}><HamburgerGlyph /></button>
        </div>

        {/* THE EXAM PILLS, under the bolt. */}
        <div className="flex flex-wrap items-center" style={{ gap: 6 }} role="tablist" aria-label="Which exam">
          {pills.map((p) => {
            const locked = !p.available;
            const on = !locked && p.num === examNum;
            return (
              <button key={p.num} type="button" role="tab" aria-selected={on} className="lk-pill" data-on={on} data-locked={locked} onClick={() => (locked ? setWaitlistExam(p.num) : onPickExam(p.num))} title={locked ? `${p.label} is not open yet` : p.label}>
                {p.label}{locked && <LockGlyph />}
              </button>
            );
          })}
        </div>
      </header>

      {menuOpen && (
        <MenuSheet
          narrow={narrow} you={you} onClose={() => setMenuOpen(false)}
          onShare={() => { setMenuOpen(false); onShare(); }}
          onReminders={() => { setMenuOpen(false); setReminderOpen(true); }}
        />
      )}
      {reminderOpen && (
        <ReminderModal campusId={campusId} courseCode={courseCode} onClose={() => setReminderOpen(false)} />
      )}
      {waitlistExam != null && (
        <ExamWaitlistSheet exam={waitlistExam} campusId={campusId} courseCode={courseCode} demo={demo} narrow={narrow} onClose={() => setWaitlistExam(null)} />
      )}
    </>
  );
}

/** ≡ — three drawn lines. */
function HamburgerGlyph() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
}
/** A drawn padlock for the locked pills — never the emoji. */
function LockGlyph() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}
/** The share arrow. */
function ShareGlyph() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" /></svg>;
}

/** The chrome every sheet shares: backdrop, bottom on a phone / centred elsewhere, one way out. */
function Sheet({ label, narrow, onClose, children, maxWidth = 420 }: { label: string; narrow: boolean; onClose: () => void; children: ReactNode; maxWidth?: number }) {
  const ref = useDismiss<HTMLDivElement>(onClose);
  return (
    <div className="fixed inset-0 z-[110] flex justify-center" style={{ background: "rgba(0,0,0,0.7)", alignItems: narrow ? "flex-end" : "center", padding: narrow ? 0 : 16 }}>
      <div ref={ref} role="dialog" aria-label={label} className={`lk-sheet lk-in ${narrow ? "rounded-t-2xl" : "rounded-2xl"}`} style={{ maxWidth: narrow ? undefined : maxWidth, padding: 16, paddingBottom: narrow ? "max(16px, env(safe-area-inset-bottom, 0px))" : 16 }}>
        {children}
      </div>
    </div>
  );
}

/** THE HAMBURGER'S SHEET — the list, in the proposal's order. */
function MenuSheet({ narrow, you, onClose, onShare, onReminders }: { narrow: boolean; you: TopYou; onClose: () => void; onShare: () => void; onReminders: () => void }) {
  return (
    <Sheet label="Menu" narrow={narrow} onClose={onClose} maxWidth={360}>
      <div className="mb-1 flex items-center justify-between" style={{ padding: "0 4px 0 16px" }}>
        <span className="lk-disp" style={{ fontSize: 17 }}>survive</span>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
      </div>
      <nav className="flex flex-col" style={{ gap: 2 }}>
        <button type="button" className="lk-menu-item" onClick={onShare}>Share this</button>
        <button type="button" className="lk-menu-item" onClick={onReminders}>Set up exam reminders</button>
        <a href="/" className="lk-menu-item">Home</a>
        {you.userId ? (
          <button type="button" className="lk-menu-item" onClick={() => { onClose(); you.signOut(); }}>
            <span className="flex min-w-0 flex-col" style={{ gap: 1 }}>
              <span>Sign out</span>
              {you.email && <span className="truncate" style={{ fontSize: 12, fontWeight: 500, color: LK.muted }}>{you.email}</span>}
            </span>
          </button>
        ) : (
          <button type="button" className="lk-menu-item" onClick={() => { onClose(); you.onSignIn(); }}>Sign in</button>
        )}
        <a href="/chapters" className="lk-menu-item">Set up your Greek chapter</a>
        <a href="/rep/join" className="lk-menu-item">Join the campus rep program</a>
        {narrow && <a href="/#reviews" className="lk-menu-item">Leave a review</a>}
      </nav>
    </Sheet>
  );
}

/** "Set up exam reminders" — the home page's ExamReminder, as a modal. */
function ReminderModal({ campusId, courseCode, onClose }: { campusId: string | null; courseCode: string | null; onClose: () => void }) {
  const ref = useDismiss<HTMLDivElement>(onClose);
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div ref={ref} role="dialog" aria-label="Exam reminders" className="lk-sheet lk-in relative rounded-2xl" style={{ maxWidth: 560, padding: "8px 0 4px" }}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-[1] grid h-9 w-9 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
        <ExamReminder campusId={campusId} courseCode={courseCode} />
      </div>
    </div>
  );
}

/** THE LOCKED PILL'S SHEET — the price line as drafted, one email, "Join the waitlist". Submits
 *  through the unified intake (kind notify_exam, the exam number, source learn-exam-waitlist).
 *  Demo mode never writes a row but still shows the done state, so the flow can be walked. */
function ExamWaitlistSheet({ exam, campusId, courseCode, demo, narrow, onClose }: { exam: number; campusId: string | null; courseCode: string | null; demo: boolean; narrow: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"open" | "busy" | "done" | "error">("open");
  const [msg, setMsg] = useState("");
  const submit = async () => {
    const e = email.trim();
    if (state === "busy") return;
    if (!EMAIL_RE.test(e)) { setState("error"); setMsg("Enter a valid email."); return; }
    setState("busy");
    try {
      if (!demo) await submitIntake({ data: { kind: "notify_exam", email: e, exam, courseCode, campusId: isUuid(campusId) ? campusId : null, sourcePath: "/learn", source: "learn-exam-waitlist" } });
      setState("done");
    } catch { setState("error"); setMsg("Couldn't save that — try again in a moment."); }
  };
  return (
    <Sheet label={`Exam ${exam} waitlist`} narrow={narrow} onClose={onClose}>
      <div className="mb-2 flex items-center justify-between">
        <span className="lk-disp" style={{ fontSize: 20 }}>Exam {exam}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
      </div>
      {state === "done" ? (
        <p className="flex items-center gap-2 text-[14px] font-bold" style={{ margin: 0 }}><Check className="h-4 w-4" style={{ color: LK.green }} /> You're on the list. I'll email you the day Exam {exam} opens.</p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: LK.muted }}>{examWaitlistLine(exam)}</p>
          <input type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu" className="lk-field mt-3" value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("open"); }} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} aria-label="Your email" autoFocus={!narrow} />
          {state === "error" && <p className="mt-1.5 text-[12px]" style={{ color: LK.red }}>{msg}</p>}
          <button type="button" onClick={() => void submit()} disabled={state === "busy"} className="lk-btn lk-btn-acc mt-2 w-full disabled:opacity-50" style={{ minHeight: 46 }}>
            {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Join the waitlist
          </button>
        </>
      )}
    </Sheet>
  );
}

/** THE BAR'S OLD REMINDER SHEET — unmounted since the redesign (the hamburger opens the home
 *  page's ExamReminder instead). Kept for the day reminders are advertised inside the player:
 *  one card, two fields, the date and a number. Date alone still saves (powers a countdown);
 *  date + number queues the text. Nothing about links or passwords, ever. */
export function ReminderSheet({ examNum, examLabel, initialDate, campusId, courseCode, contactRef, demo, onClose, onSaved }: {
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
      if (!phoneOk) { onSaved(date, false); writeExamDate(examNum, date); setDone("Date saved. Add a number any time and I'll text you before it."); return; }
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
      <div className="lk-in w-full rounded-t-2xl p-5 sm:max-w-[420px] sm:rounded-2xl" style={{ background: LK.surface, border: `1px solid ${LK.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="lk-disp" style={{ fontSize: 20 }}>When's {examLabel}?</div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {done ? (
          <div className="rounded-xl px-4 py-4 text-center" style={{ background: "rgba(78,232,180,0.12)", border: `1px solid ${LK.green}` }}>
            <Check className="mx-auto h-6 w-6" style={{ color: LK.green }} />
            <p className="mt-1 text-[14px] font-bold">{done}</p>
            <button type="button" onClick={onClose} className="lk-btn lk-btn-ghost mt-3">Back to cramming</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="lk-field" style={{ colorScheme: "dark" }} aria-label="Exam date" />
            <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="your number (optional)" className="lk-field" aria-label="Phone number" />
            {phoneOk && offsets.length > 1 && (
              <div className="flex items-center gap-2 text-[12.5px]" style={{ color: LK.muted }}>
                text me
                <div className="relative">
                  <select value={offset} onChange={(e) => setOffset(Number(e.target.value))} className="appearance-none rounded-lg py-1 pl-2 pr-6 font-semibold outline-none" style={{ background: LK.surface2, color: LK.text, border: `1px solid ${LK.border}` }}>
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
            {err && <p role="alert" className="text-[12.5px]" style={{ color: LK.red }}>{err}</p>}
            <p className="text-[11.5px] leading-snug" style={{ color: LK.dim }}>{phoneOk ? REMINDER_DISCLOSURE : "I'll text you the cram videos before your exam and keep your spot here on this number."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
