// THE COURSE SHEET — "ACCY 201 · Intro Financial Accounting ▾" on /learn (the simple flow, phase 4, 2026-09-16).
//
// The live course, and the courses students keep asking about, as interest — not enrollment: "Intro Managerial",
// "Intermediate I", "Intermediate II" say "Not yet" with one "I'd use this" tap. The tap is counted (PostHog, plus a
// mark on this device so it never asks twice); an optional "Email me if it lands" takes an address through the
// existing intake (kind notify_exam, topic "Course interest: …") — no new table, no marketing consent slipped in.
// Nothing here navigates to an empty course, invents a course code, or promises a date.
import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { EMAIL_RE, isUuid } from "@/components/learn/learn-gate";
import { LK } from "@/components/learn/learn-theme";
import { track } from "@/lib/analytics";
import { submitIntake } from "@/lib/intake.functions";
import { useDismiss } from "@/lib/use-dismiss";

/** The menu's "another course" link and LearnHome's footer line both open the sheet through this. */
export const OPEN_COURSE_SHEET_EVENT = "sa-open-course-sheet";
export function openCourseSheet(): void { try { window.dispatchEvent(new CustomEvent(OPEN_COURSE_SHEET_EVENT)); } catch { /* ignore */ } }

export const LIVE_COURSE = "Intro Financial Accounting";
export const FUTURE_COURSES = [
  { id: "intro-managerial", label: "Intro Managerial Accounting" },
  { id: "intermediate-1", label: "Intermediate Accounting I" },
  { id: "intermediate-2", label: "Intermediate Accounting II" },
] as const;
const KEY = "sa-course-interest";
function readInterest(): string[] { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]; } catch { return []; } }
function writeInterest(ids: string[]) { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* this visit only */ } }

export function CourseSheet({ courseCode, campusId, demo, narrow, onClose }: { courseCode: string | null; campusId: string | null; demo: boolean; narrow: boolean; onClose: () => void }) {
  const ref = useDismiss<HTMLDivElement>(onClose);
  const [noted, setNoted] = useState<string[]>([]);
  useEffect(() => { setNoted(readInterest()); }, []);
  const [emailFor, setEmailFor] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const want = (id: string, label: string) => {
    if (noted.includes(id)) return;
    const next = [...noted, id]; setNoted(next); writeInterest(next);
    if (!demo) track("course_interest", { course: id, campus_id: campusId ?? undefined } as never);
    void label;
  };
  const send = async (id: string, label: string) => {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) { setErr("Enter a valid email."); return; }
    setBusy(true); setErr(null);
    try {
      if (!demo) await submitIntake({ data: { kind: "notify_exam", email: e, topic: `Course interest: ${label}`, campusId: isUuid(campusId) ? campusId : null, sourcePath: "/learn", source: "learn-course-interest" } });
      setSent((s) => [...s, id]); setEmailFor(null); setEmail("");
    } catch { setErr("Couldn't save that — try again in a moment."); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[110] flex justify-center" style={{ background: "rgba(0,0,0,0.7)", alignItems: narrow ? "flex-end" : "center", padding: narrow ? 0 : 16 }}>
      <div ref={ref} role="dialog" aria-label="Your accounting course" className={`lk-sheet lk-in ${narrow ? "rounded-t-2xl" : "rounded-2xl"}`} style={{ width: "100%", maxWidth: narrow ? undefined : 440, padding: 18, paddingBottom: narrow ? "max(18px, env(safe-area-inset-bottom, 0px))" : 18, fontFamily: BRAND_SANS }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="lk-disp" style={{ fontSize: 19, lineHeight: 1.15 }}>Your accounting course</div>
            <div className="mt-1 text-[12.5px]" style={{ color: LK.muted }}>Tell us what you'd use — that's how we pick what to film next.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 flex flex-col" style={{ gap: 6 }}>
          <div className="flex items-center gap-3 rounded-xl px-3 py-3" style={{ background: "color-mix(in srgb, var(--lk-acc) 10%, var(--lk-surface))", border: `1px solid ${LK.acc}` }}>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-extrabold" style={{ color: LK.text }}>{courseCode ? `${courseCode} · ` : ""}{LIVE_COURSE}</div>
              <div className="text-[12px]" style={{ color: LK.green }}>Available now · Exam 1 is free</div>
            </div>
            <span className="inline-flex items-center gap-1 text-[11.5px] font-black uppercase" style={{ color: LK.acc, letterSpacing: "0.08em" }}><Check className="h-3.5 w-3.5" /> Current</span>
          </div>
          {FUTURE_COURSES.map((c) => {
            const on = noted.includes(c.id), done = sent.includes(c.id);
            return (
              <div key={c.id} className="rounded-xl px-3 py-3" style={{ background: LK.surface2, border: `1px solid ${LK.border}` }}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-extrabold" style={{ color: LK.text }}>{c.label}</div>
                    <div className="text-[12px]" style={{ color: LK.muted }}>Not yet</div>
                  </div>
                  <button type="button" onClick={() => want(c.id, c.label)} className={on ? "lk-btn lk-btn-acc" : "lk-btn lk-btn-ghost"} style={{ minHeight: 36, fontSize: 12, padding: "0 12px", whiteSpace: "nowrap" }} aria-pressed={on}>
                    {on ? <><Check className="h-3.5 w-3.5" /> Noted</> : "I'd use this"}
                  </button>
                </div>
                {on && !done && emailFor !== c.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: LK.muted }}>
                    <span>Noted — that's how we pick what to film next.</span>
                    <button type="button" onClick={() => { setEmailFor(c.id); setErr(null); }} className="underline underline-offset-2" style={{ background: "none", border: 0, padding: 0, color: LK.acc, cursor: "pointer", font: "inherit", fontWeight: 700 }}>Email me if it lands</button>
                  </div>
                )}
                {emailFor === c.id && !done && (
                  <div className="mt-2 flex flex-col gap-2">
                    <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} placeholder="you@school.edu" aria-label="Your email" className="lk-field" style={{ minHeight: 42, fontSize: 15 }} onKeyDown={(e) => { if (e.key === "Enter") void send(c.id, c.label); }} />
                    {err && <div className="text-[12px]" style={{ color: LK.red }}>{err}</div>}
                    <div className="flex items-center gap-3">
                      <button type="button" disabled={busy} onClick={() => void send(c.id, c.label)} className="lk-btn lk-btn-acc" style={{ minHeight: 38, fontSize: 12, padding: "0 14px" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Email me when it lands"}</button>
                      <span className="text-[11.5px]" style={{ color: LK.dim }}>Only for this. No date promised.</span>
                    </div>
                  </div>
                )}
                {done && <div className="mt-2 text-[12px]" style={{ color: LK.green }}>Got it — you'll hear from us if {c.label} lands.</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
