// FUTURE EXAM WAITLIST (08-24 simplification). One field, one button, one line of success. On
// Exam 2 / Exam 3 / Final the right pane is JUST an email box — no school picker inline, no
// optional professor row, no context lines. The player still knows the visitor's school /
// professor / course from surrounding state, and those ride into the notify record silently.
//
// This is a launch-window UI cut, not a data one: `submitNotify` still records everything the
// intake exposes (campus, professor, exam num, course code, note) — the waitlist card just
// stops ASKING for them a second time.
import { useEffect, useState } from "react";

import { contactKind, LAUNCH_WINDOW } from "@/lib/launch";
import { rememberStudentEmail } from "@/lib/student-email";
import { submitNotify } from "@/lib/syllabus.functions";
import { examRequest, notifyNote } from "@/lib/notify-request";
import type { School } from "@/routes/landing";
import type { ProfessorLite } from "@/lib/orders.functions";

const PRIMARY = "var(--accent)";
const MUTED = "var(--text-muted)";
const CREAM = "var(--brand-cream)";

export function FutureExamWaitlist({ exam, school, professor, courseCode, isTest }: {
  exam: { num: number; label: string; price: number | null };
  school: School | null;
  professor: ProfessorLite | null;
  courseCode: string | null;
  isTest?: boolean;
}) {
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (school) { /* keep last state */ } }, [school?.id]);
  const valid = contactKind(contact) !== "unknown";
  const send = async () => {
    if (!valid || state !== "idle") return;
    setState("sending"); setErr(null);
    try {
      // Silent context — whatever the surrounding player state already knows rides along on the
      // notify record. Nothing is required from the visitor beyond an email.
      const req = examRequest({ examNum: exam.num, examLabel: exam.label, launchWindow: LAUNCH_WINDOW });
      await submitNotify({ data: {
        contact: contact.trim(),
        topic: req.topic,
        campusId: school?.campusId ?? null,
        campusName: school?.name ?? null,
        professorName: professor ? (professor.last || professor.name) : null,
        want: req.want,
        examNum: req.examNum ?? null,
        courseCode: courseCode ?? null,
        note: notifyNote(req),
        isTest: !!isTest,
      } });
      // The soft identity bridge: a subscribed email means Ask Lee never re-asks for it.
      if (contactKind(contact) === "email") rememberStudentEmail(contact.trim());
      setState("sent");
    } catch (e) {
      setState("error");
      setErr(e instanceof Error ? e.message : "That didn't send — try again?");
    }
  };
  const label = exam.label === "Final" ? "the Final" : exam.label;
  const priceStr = exam.price != null ? ` · $${exam.price}` : "";
  return (
    <div className="grid w-full place-items-center px-4 py-10" style={{ minHeight: "min(60vw, 320px)", background: "var(--sa-surface-2)" }}>
      <div className="flex w-full max-w-xs flex-col items-stretch gap-3 text-center">
        {state === "sent" ? (
          <>
            <p className="text-[15px] font-black" style={{ color: CREAM }}>You&apos;re on the list ✓</p>
            <p className="text-[13px]" style={{ color: MUTED }}>I&apos;ll let you know when {label} drops.</p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-black" style={{ color: CREAM }}>{exam.label}{priceStr} · coming soon</p>
            <p className="text-[13px]" style={{ color: MUTED }}>Get notified when it drops.</p>
            <input
              type="text" inputMode="email" autoComplete="email" placeholder="you@school.edu"
              className="w-full rounded-xl px-3 text-[15px] outline-none"
              style={{ minHeight: 46, background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-default)", color: CREAM }}
              value={contact} onChange={(e) => { setContact(e.target.value); if (state === "error") setState("idle"); }}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              aria-label={`Email or phone for ${exam.label} waitlist`}
            />
            {err && <p className="text-[12px]" style={{ color: "#F3C6CC" }}>{err}</p>}
            <button
              type="button"
              onClick={() => void send()}
              disabled={!valid || state === "sending"}
              className="w-full rounded-xl text-[14px] font-black disabled:opacity-45"
              style={{ minHeight: 46, background: PRIMARY, color: "#0B1220" }}
            >
              {state === "sending" ? "Sending…" : "Get notified"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
