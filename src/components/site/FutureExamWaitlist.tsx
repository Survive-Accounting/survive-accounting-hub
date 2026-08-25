// FUTURE EXAM WAITLIST (08-23 launch pass). When Exam 2 / Exam 3 / Final is selected, the
// player deliberately does NOT expose a topic tree — Course Intel / syllabus mapping isn't
// mature enough to reveal reliable structure yet. The right pane collapses to this centered
// waitlist inside the same player shell.
//
// SHAPE: school required before we take a waitlist record (spec §20). Professor optional but
// stored when supplied (spec §21). One CTA — "Get notified". Success is a single terse line.
import { useEffect, useState } from "react";

import { CampusSelector } from "@/routes/landing";
import { contactKind, LAUNCH_WINDOW } from "@/lib/launch";
import type { School } from "@/routes/landing";
import type { ProfessorLite } from "@/lib/orders.functions";
import { submitNotify } from "@/lib/syllabus.functions";
import { examRequest, notifyNote } from "@/lib/notify-request";

const PRIMARY = "var(--accent)";
const MUTED = "var(--text-muted)";
const CREAM = "var(--brand-cream)";

export interface WaitlistContact {
  contact: string;
  professorName: string | null;
}

export function FutureExamWaitlist({ exam, school, professor, schools, courseCode, isTest, onPickSchool, onMatchProfessor }: {
  exam: { num: number; label: string; price: number | null };
  school: School | null;
  professor: ProfessorLite | null;
  schools: School[];
  courseCode: string | null;
  isTest?: boolean;
  onPickSchool: (s: School) => void;
  onMatchProfessor: () => void;
}) {
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  useEffect(() => { if (school) setState("idle"); }, [school?.id]);
  const valid = contactKind(contact) !== "unknown";
  const send = async () => {
    if (!valid || state !== "idle" || !school) return;
    setState("sending");
    try {
      const profName = professor ? (professor.last || professor.name) : null;
      const req = examRequest({ examNum: exam.num, examLabel: exam.label, launchWindow: LAUNCH_WINDOW });
      await submitNotify({ data: {
        contact: contact.trim(),
        topic: req.topic,
        campusId: school.campusId ?? null,
        campusName: school.name ?? null,
        professorName: profName,
        want: req.want,
        examNum: req.examNum ?? null,
        courseCode,
        note: notifyNote(req),
        isTest: !!isTest,
      } });
      setState("sent");
    } catch { setState("idle"); }
  };
  const priceStr = exam.price != null ? ` · $${exam.price}` : "";
  return (
    <div className="grid w-full place-items-center px-4 py-8" style={{ minHeight: "min(60vw, 320px)", background: "var(--sa-surface-2)" }}>
      <div className="flex w-full max-w-sm flex-col items-stretch gap-3 text-center">
        <p className="text-[15px] font-black" style={{ color: CREAM }}>
          {exam.label === "Final" ? "The Final" : exam.label}{priceStr}
        </p>
        {/* SCHOOL REQUIRED (§20): the waitlist record has to carry a campus context or it's noise. */}
        {!school ? (
          <>
            <p className="text-[13.5px]" style={{ color: MUTED }}>Choose your school to get on the list.</p>
            <CampusSelector school={null} onPick={onPickSchool} schools={schools} />
          </>
        ) : state === "sent" ? (
          <>
            <p className="text-[15px] font-black" style={{ color: CREAM }}>You&apos;re on the list ✓</p>
            <p className="text-[13.5px]" style={{ color: MUTED }}>
              I&apos;ll let you know when {exam.label === "Final" ? "the Final" : exam.label} is ready.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13.5px]" style={{ color: MUTED }}>
              Get notified when it&apos;s ready for {school.name}.
            </p>
            <p className="text-[11.5px]" style={{ color: MUTED }}>
              {[school.name, school.codeVerified && school.code ? school.code : null].filter(Boolean).join(" · ")}
            </p>
            {/* Professor optional (§21). "Choose professor — optional" pattern; existing add flow. */}
            <p className="text-[11.5px]" style={{ color: MUTED }}>
              {professor ? `Prof. ${professor.last || professor.name}` : (
                <button type="button" onClick={onMatchProfessor} className="font-bold" style={{ color: PRIMARY }}>Choose professor — optional</button>
              )}
            </p>
            <input
              type="text" inputMode="email" autoComplete="email" placeholder="Email or phone"
              className="w-full rounded-xl px-3 text-[15px] outline-none"
              style={{ minHeight: 46, background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-default)", color: CREAM }}
              value={contact} onChange={(e) => setContact(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            />
            <button type="button" onClick={() => void send()} disabled={!valid || state !== "idle"} className="w-full rounded-xl text-[14px] font-black disabled:opacity-45" style={{ minHeight: 46, background: PRIMARY, color: "#0B1220" }}>
              {state === "sending" ? "Sending…" : "Get notified"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
