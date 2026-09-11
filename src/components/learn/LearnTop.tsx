// THE NAVBAR (redesign, 2026-09-11 — docs/LEARN-REDESIGN-PROPOSAL-2026-09-11.md §1).
//
//   survive │ [BIG bolt]  Ole Miss ▾               Leave a review   [Share]  [≡]
//           │    ΑΤΟ      ACCY 201 · Exam 1 ▾
//
// (Lee, 2026-09-11, later: "survive | bolt (campus) / course code · exam # in the navbar top left"
// — the wordmark first, a rule, then the campus bolt with the two-line block beside it. The Greek
// letters over the bolt grew to 0.42 of its height "so they can be read". The bolt carries
// NAV_BOLT_ID: the loading screen's bolt drops into it, and `arrive` pops it to catch the drop.)
//
// LEFT: the campus bolt, big (44px tall on wide / 36 on narrow, BoltBoil in the school's colours),
// and when the share funnel knows the student's chapter its Greek letters sit centred over the
// bolt in cream — the bolt boils, the letters hold still (a static, pointer-events:none overlay,
// the same letters the home page's doors draw). Then the wordmark, which reads "survive" only, and
// a two-line block: the campus name (or "Pick your school", which opens the picker sheet in place)
// over "ACCY 201 · Exam 1". "Ole Miss · ACCY 201 · Exam 1" has left the bar; there is no rail.
//
// THE EXAM MENU (Lee, 2026-09-11: "Exam 1, Exam 2, Exam 3 at top is a bit unnecessary right now.
// Just make it where clicking Exam 1 (to right of course code) can let you switch between them.
// Clicking Exam 1 opens dropdown to see all exams. And Final is technically an exam too."). The
// "Exam 1 ▾" beside the course code is a button; it opens a listbox — Exam 1 · Exam 2 · Exam 3 ·
// Final — in the same visual language as the campus selector. An exam that has videos is live; a
// locked one wears a drawn lock inside the menu and opens the waitlist sheet — "Exam 1 is free.
// Exam 2 is $50. Join the waitlist and I'll tell you the day it opens." (learn-gate's
// examWaitlistLine; "The Final is $50" for the Final) — which submits through the unified intake
// (kind notify_exam, source learn-exam-waitlist). The exam button is its own control, so it can
// never open the campus picker. Keyboard: Enter / Space open, ↑ ↓ move, Enter picks, Escape closes.
// The pill row that sat under the bolt until 09-11 is gone; the bar is one line again.
//
// RIGHT (the polish pass, 2026-09-11): "Leave a review" opens ReviewSheet (it used to link to the
// home page's testimonials) · Share copies the smart link with a link icon (learn.tsx's share,
// lib/share-url's buildShareUrl) · the hamburger opens LearnMenu, a right-side sheet — Home · Set
// up exam reminders · Share this · Leave a review, then Account (a quiet Sign out), then the two
// program cards (Greek Chapter Program, Campus Rep Program). On a phone the review button does not
// fit the bar; the menu carries it. Focus returns to the hamburger when the menu closes.
//
// THE BAR IS THE SHELL'S (2026-09-11, the design email: "The NAVBAR should always remain Survive
// navy … Add a very thin campus-colored line along the bottom of the navbar"). Ground and ink are
// the look's own `nav` (learn-theme's topBarFor); the campus is the 2px hairline under the bar
// (theme.topBorder — c1 if it shows on the bar, else c2, else the accent) and the bolt. Dividers
// inside the bar use the bar's own rule (theme.topRule). Until 09-11 the bar wore c1 as its ground
// and c2 as its rule; the email reversed it. The old ticker, progress meter, sender line and the
// bar's own reminder sheet are gone from the bar (ReminderSheet stays below, unmounted, for the
// day reminders are advertised inside the player). Copy rule: no "run" / "blast" / "pledge", no
// emoji — every glyph in the bar is drawn.
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Link2, Loader2, X } from "lucide-react";

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
import { EMAIL_RE, examName, examWaitlistLine, isUuid } from "@/components/learn/learn-gate";
import { allowedOffsets, REMINDER_DISCLOSURE, scheduleExamReminder } from "@/lib/exam-reminder.functions";
import { submitIntake } from "@/lib/intake.functions";
import { useDismiss } from "@/lib/use-dismiss";
import { LK, type LearnTheme } from "@/components/learn/learn-theme";
import { LEARN_MENU_CSS, LearnMenu } from "@/components/learn/LearnMenu";
import { NAV_BOLT_ID } from "@/components/learn/LearnLoading";
import { adEvent } from "@/lib/retargeting";

export type TopProgress = { total: number; done: number; secondsLeft: number | null };

const pickKey = (campusSlug: string) => `sa-cta-chapter-${campusSlug}`;
/** The CTA picker's storage key for a campus — the pretty /learn/<campus>/<chapter> path writes it. */
export const chapterPickKey = pickKey;

/** THE ARRIVAL — the navbar bolt catches the loading screen's drop (the home page's sa-bolt-arrive). */
const ARRIVE_CSS = `
@keyframes lk-bolt-arrive { 0% { opacity: .15; transform: scale(.72); } 62% { transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
.lk-bolt-arrive { animation: lk-bolt-arrive 320ms cubic-bezier(.2, .9, .3, 1.2) both; transform-origin: 50% 55%; }
@media (prefers-reduced-motion: reduce) { .lk-bolt-arrive { animation: none; } }
`;

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

/** The exams the menu always lists, live or locked — the Final included (Lee, 2026-09-11). */
const MENU_EXAMS = [1, 2, 3, 4] as const;

/** The bolt's height per tier — the one big thing in the bar. */
const BOLT_H = { narrow: 36, wide: 44 } as const;

export type TopYou = { email: string | null; userId: string | null; onSignIn: () => void; signOut: () => void };

export function LearnTop({
  school, campusId, campusName, exams, examNum, onPickExam, chapter, theme, onPickSchool, onShare, onReview, onPickChapter, you, demo, narrow, arrive = 0,
}: {
  school: School | null;
  campusId: string | null;
  campusName: string | null;
  exams: ExamTabState[];
  examNum: number | null;
  onPickExam: (num: number) => void;
  /** The picked chapter — its letters go over the bolt. */
  chapter: { slug?: string | null; name: string | null; letters?: string | null; members: number } | null;
  /** Opens the chapter picker (the menu's "Study with your chapter"). */
  onPickChapter: () => void;
  theme: LearnTheme;
  /** Opens the in-place school picker (LearnSchoolSheet) — never a navigation. */
  onPickSchool: () => void;
  /** The page's share — copies the page's link (learn.tsx); true when it landed on the clipboard. */
  onShare: () => Promise<boolean>;
  /** Counts the loading screen's drop-ins; each one pops the bolt to catch it. */
  arrive?: number;
  /** Opens the review sheet (learn.tsx mounts ReviewSheet). */
  onReview: () => void;
  /** Sign in / sign out for the hamburger. */
  you: TopYou;
  demo: boolean;
  narrow: boolean;
}) {
  const exam = exams.find((e) => e.num === examNum) ?? null;
  const examLabel = exam?.label ?? "Exam 1";
  const courseCode = school?.courseCode ?? null;
  const schoolName = school?.name ?? campusName;
  const menuExams = MENU_EXAMS.map((n) => exams.find((e) => e.num === n) ?? { num: n, label: n === 4 ? "Final" : `Exam ${n}`, available: false, videoCount: 0 });

  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement | null>(null);
  // "Link copied!" in the button for a moment after a copy (Lee: "and that's it").
  const [copied, setCopied] = useState(false);
  const shareNow = async () => { const ok = await onShare(); if (ok) { setCopied(true); window.setTimeout(() => setCopied(false), 2200); } };
  const closeMenu = () => { setMenuOpen(false); menuBtn.current?.focus(); };
  const [reminderOpen, setReminderOpen] = useState(false);
  const [waitlistExam, setWaitlistExam] = useState<number | null>(null);
  const letters = chapter?.letters?.trim() || null;

  // The bar's own ink — chalk on black until a school is picked, then whatever reads on c1.
  const ink = theme.topInk, muted = theme.topMuted, rule = theme.topRule, hairline = theme.topBorder;
  const boltH = narrow ? BOLT_H.narrow : BOLT_H.wide;
  // 375px has to hold the bolt, "survive", "Pick your school", Share and the hamburger: tight
  // gutters on a phone so the school's name is read, not truncated.
  const pad = narrow ? 12 : 32;
  const iconBtn = { background: "transparent", border: 0, color: ink, cursor: "pointer", padding: 0 } as const;

  return (
    <>
      <header className="flex shrink-0 flex-col" style={{ background: theme.topBg, borderBottom: `2px solid ${hairline}`, color: ink, padding: `${narrow ? 8 : 12}px ${pad}px ${narrow ? 10 : 12}px`, gap: narrow ? 8 : 10, fontFamily: BRAND_SANS }}>
        <div className="flex items-center" style={{ gap: narrow ? 8 : 14, minHeight: boltH }}>
          {/* THE WORDMARK — "survive" only — then a rule, then the campus. */}
          <span className="lk-disp shrink-0" style={{ fontSize: narrow ? 15 : 21, letterSpacing: "-0.01em", lineHeight: 1, color: ink }}>survive</span>
          <span aria-hidden className="shrink-0 self-stretch" style={{ width: 1, background: rule, minHeight: boltH }} />
          {/* THE BIG BOLT, with the chapter's letters held still over it. It catches the drop. */}
          <span key={arrive} id={NAV_BOLT_ID} className={`relative inline-block shrink-0${arrive > 0 ? " lk-bolt-arrive" : ""}`} style={{ lineHeight: 0 }} title={letters ? `${letters} · ${schoolName ?? "your campus"}` : undefined}>
            <BoltBoil height={boltH} red={school?.c1 ?? undefined} blue={school?.c2 ?? undefined} cream={ink} boilSeconds={1.2} />
            {letters && (
              <span aria-hidden className="absolute inset-0 grid place-items-center" style={{ pointerEvents: "none", color: "#F5EFE6", fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: Math.round(boltH * 0.42), letterSpacing: "0.01em", lineHeight: 1, textShadow: "0 1px 2px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)", whiteSpace: "nowrap" }}>{letters}</span>
            )}
          </span>
          {/* THE TWO-LINE BLOCK: campus over course · exam. */}
          <div className="flex min-w-0 flex-col justify-center" style={{ gap: 1 }}>
            <button type="button" onClick={onPickSchool} className="flex min-w-0 items-center gap-1 text-left" title="Change school" style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", color: schoolName ? ink : LK.acc, fontSize: narrow ? 13.5 : 15, fontWeight: 800, fontFamily: "inherit", lineHeight: 1.2, minHeight: narrow ? 22 : 24 }}>
              <span className="truncate">{schoolName ?? "Pick your school"}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: muted }} aria-hidden />
            </button>
            <div className="flex min-w-0 items-center gap-1.5 truncate" style={{ fontSize: narrow ? 11.5 : 12.5, color: muted, fontWeight: 600, lineHeight: 1.2 }}>
              {courseCode && <><span className="truncate">{courseCode}</span><span aria-hidden>·</span></>}
              <ExamMenu exams={menuExams} examNum={examNum} examLabel={examLabel} ink={ink} muted={muted} onPick={onPickExam}
                onLocked={(n) => {
                  setWaitlistExam(n);
                  // RETARGETING (2026-09-11): a student reaching for a locked exam — the spec's
                  // highest-value signal (exam2_lock; `exam` says which one).
                  if (!demo) adEvent("exam2_lock", { campus: school?.slug ?? undefined, chapter: chapter?.slug ?? undefined, course: courseCode ?? undefined, exam: n });
                }} />
              {demo && <span className="rounded-full px-1.5 py-px text-[9px] font-black uppercase tracking-wider" style={{ color: "#111", background: LK.green }}>Demo</span>}
            </div>
          </div>

          <div className="min-w-0 flex-1" />

          {/* RIGHT: review · share · the hamburger. */}
          {!narrow && (
            <button type="button" onClick={onReview} className="shrink-0" style={{ background: "transparent", border: 0, padding: "0 4px", color: ink, fontSize: 13.5, fontWeight: 700, opacity: 0.9, minHeight: 36, display: "inline-flex", alignItems: "center", cursor: "pointer", fontFamily: "inherit" }}>Leave a review</button>
          )}
          {narrow ? (
            <button type="button" onClick={() => void shareNow()} aria-label={copied ? "Link copied!" : "Share — copy the link"} title="Copy link" className="grid shrink-0 place-items-center rounded-full" style={{ ...iconBtn, width: 40, height: 40, color: copied ? LK.acc : ink }}>{copied ? <Check className="h-[18px] w-[18px]" aria-hidden /> : <Link2 className="h-[18px] w-[18px]" aria-hidden />}</button>
          ) : (
            <button type="button" onClick={() => void shareNow()} title="Copy link" aria-live="polite" className="inline-flex shrink-0 items-center gap-2 rounded-full" style={{ minHeight: 38, padding: "0 16px", border: `1px solid ${copied ? LK.acc : rule}`, background: copied ? LK.acc : "transparent", color: copied ? LK.accInk : ink, cursor: "pointer", fontSize: 13.5, fontWeight: 800, fontFamily: "inherit", transition: "background 160ms, color 160ms, border-color 160ms" }}>{copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />} {copied ? "Link copied!" : "Share"}</button>
          )}
          <button ref={menuBtn} type="button" onClick={() => setMenuOpen(true)} aria-label="Menu" aria-haspopup="dialog" aria-expanded={menuOpen} className="grid shrink-0 place-items-center rounded-full" style={{ ...iconBtn, width: narrow ? 40 : 44, height: narrow ? 40 : 44 }}><HamburgerGlyph /></button>
        </div>

      </header>

      <style>{LEARN_MENU_CSS + ARRIVE_CSS}</style>
      {menuOpen && (
        <LearnMenu
          narrow={narrow} you={you} onClose={closeMenu}
          campusId={campusId} campusSlug={school?.slug ?? null} courseCode={courseCode} chapterSlug={chapter?.slug ?? null} demo={demo}
          onReminders={() => { setMenuOpen(false); setReminderOpen(true); }}
          onReview={() => { setMenuOpen(false); onReview(); }}
          onPickChapter={onPickChapter}
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

/** THE EXAM MENU — "Exam 1 ▾" as a button, a listbox beneath it. A live exam picks; a locked one
 *  (drawn lock) opens the waitlist sheet. Focus lands on the current exam when the list opens and
 *  returns to the button when it closes; ↑ ↓ wrap; Escape and a click outside close it.
 *  THE LIST IS FIXED-POSITIONED from the button's rect (re-measured on resize), not absolute: the
 *  course line it sits in truncates (overflow hidden), and an absolute list was clipped to a
 *  sliver over the bar — the bug Lee saw on 09-11 ("not opening/behaving correctly"). */
function ExamMenu({ exams, examNum, examLabel, ink, muted, onPick, onLocked }: {
  exams: ExamTabState[]; examNum: number | null; examLabel: string; ink: string; muted: string;
  onPick: (num: number) => void; onLocked: (num: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const id = useId();
  const listId = `lk-exam-menu-${id}`;
  // Where the list goes: under the button's left edge, 8px down, never past the viewport's right.
  const measure = () => { const r = btn.current?.getBoundingClientRect(); if (!r) return; setPos({ left: Math.min(r.left, Math.max(8, window.innerWidth - 196 - 8)), top: r.bottom + 8 }); };
  useEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);
  const btn = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const close = () => { setOpen(false); btn.current?.focus(); };
  const box = useDismiss<HTMLSpanElement>(() => setOpen(false), { enabled: open });
  useEffect(() => {
    if (!open) return;
    const current = list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLButtonElement>("[role=option]");
    current?.focus();
  }, [open]);
  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = items.length; items[((i < 0 ? 0 : i) + (e.key === "ArrowDown" ? 1 : n - 1)) % n]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") setOpen(false);
  };
  return (
    <span ref={box} className="relative inline-flex">
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} title="Change exam" className="inline-flex items-center gap-0.5" style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", color: ink, fontFamily: "inherit", fontSize: "inherit", fontWeight: 700, lineHeight: "inherit" }}>
        {examLabel}
        <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: muted, transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms" }} aria-hidden />
      </button>
      {open && (
        <div ref={list} id={listId} role="listbox" aria-label="Which exam" onKeyDown={onListKey} className="lk-sheet lk-in flex flex-col rounded-xl" style={{ position: "fixed", left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden", zIndex: 105, width: 196, padding: 6, gap: 2 }}>
          {exams.map((x) => {
            const locked = !x.available;
            const on = !locked && x.num === examNum;
            return (
              <button key={x.num} type="button" role="option" aria-selected={on} className="lk-menu-item" data-on={on} data-locked={locked} onClick={() => { setOpen(false); if (locked) onLocked(x.num); else { onPick(x.num); btn.current?.focus(); } }} title={locked ? `${x.label} is not open yet` : x.label} style={{ minHeight: 42, fontSize: 14, gap: 8, opacity: locked ? 0.78 : 1, color: on ? LK.acc : undefined }}>
                <span className="flex-1">{x.label}</span>
                {locked ? <LockGlyph /> : on ? <Check className="h-4 w-4" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      )}
    </span>
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
        <span className="lk-disp" style={{ fontSize: 20 }}>{examName(exam)}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
      </div>
      {state === "done" ? (
        <p className="flex items-center gap-2 text-[14px] font-bold" style={{ margin: 0 }}><Check className="h-4 w-4" style={{ color: LK.green }} /> You're on the list. I'll email you the day {examName(exam) === "The Final" ? "the Final" : examName(exam)} opens.</p>
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
