// THE GREEK DOOR — the one ad on the site, and the growth channel.
//
// ── A BILLBOARD, NOT A MODAL ──────────────────────────────────────────────────────────────────
// Visible, skippable, in the flow. A student who does not care scrolls past it and loses nothing;
// a student who does care can act without leaving the page. Interrupting a video surface with a
// dialog to ask for a favour is how you teach people to dismiss you.
//
// ── ONE PERSON, ONE FIELD ─────────────────────────────────────────────────────────────────────
// The ask is the scholarship chair's contact, and it is the highest-value action a student can
// take here — one referral reaches a whole chapter. So it is as close to a single tap as a form
// gets: one input, no name, no "which chapter", no account. Everything else we might want is
// worth less than the drop-off it would cause.
//
// It rides submitNotify (the same intake every other capture on the site uses) with a source tag
// in the note, so there is no new table and no new pipeline to keep alive.
//
// The second ask is REP RECRUITING, deliberately smaller and underneath: it converts a student
// into distribution, which is worth more than a second referral, but it asks for far more
// commitment — so it is a link, not a field.
import { useState } from "react";
import { Check, Users } from "lucide-react";

import { submitNotify } from "@/lib/syllabus.functions";
import { readTestSession } from "@/lib/test-mode";

export function GreekDoor({ campusId, campusName, courseCode }: {
  campusId?: string | null;
  campusName?: string | null;
  courseCode?: string | null;
}) {
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // EMAIL OR PHONE. A student knows their scholarship chair's number as often as their address,
  // and refusing the one they have to demand the one they do not is how a single-field form
  // still manages to fail.
  const trimmed = contact.trim();
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) || (trimmed.match(/\d/g)?.length ?? 0) >= 10;

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      await submitNotify({ data: {
        contact: trimmed,
        topic: "Greek scholarship chair referral",
        campusId: campusId ?? null,
        campusName: campusName ?? null,
        professorName: null,
        want: null,
        examNum: null,
        courseCode: courseCode ?? null,
        note: "source:learn_greek_door · role:scholarship_chair",
        isTest: !!readTestSession(),
      } });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't send — try again?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="lm-surface mt-6 overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--lm-border)", borderWidth: 1, borderStyle: "solid" }}
      aria-label="For fraternities and sororities"
    >
      <div className="px-5 py-4">
        <p className="text-[10.5px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--lm-accent)" }}>
          For fraternities &amp; sororities
        </p>
        <h2 className="mt-1.5 text-[19px] font-black leading-tight" style={{ color: "var(--lm-text)" }}>
          Free Exam 1 for your whole chapter.
        </h2>

        {done ? (
          <p className="mt-3 flex items-center gap-2 text-[13.5px] font-bold" style={{ color: "var(--lm-text)" }}>
            <Check className="h-4 w-4 shrink-0" style={{ color: "#3BF5A0" }} />
            Got it — I&apos;ll reach out to them and mention you sent me.
          </p>
        ) : (
          <>
            <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed" style={{ color: "var(--lm-muted)" }}>
              Send me your scholarship chair and I&apos;ll set your chapter up. One name is all it takes.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={contact}
                onChange={(e) => { setContact(e.target.value); setErr(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                placeholder="Their email or phone"
                aria-label="Your scholarship chair's email or phone"
                className="min-w-0 flex-1 rounded-lg px-3 outline-none"
                style={{
                  fontSize: 16, minHeight: 46, background: "rgba(0,0,0,0.35)",
                  border: "1px solid var(--lm-border)", color: "var(--lm-text)",
                }}
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!ok || busy}
                className="shrink-0 rounded-lg px-5 text-[14px] font-black disabled:opacity-45"
                style={{ minHeight: 46, background: "var(--lm-accent)", color: "var(--lm-accent-ink)", border: 0, cursor: "pointer" }}
              >
                {busy ? "Sending…" : "Share with your scholarship chair →"}
              </button>
            </div>
            {err && <p role="alert" className="mt-1.5 text-[12px]" style={{ color: "#F3C6CC" }}>{err}</p>}
          </>
        )}
      </div>

      {/* THE SECOND ASK — smaller, underneath, a link rather than a field. */}
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-2.5"
        style={{ borderTop: "1px solid var(--lm-border)", background: "rgba(0,0,0,0.18)" }}
      >
        <Users className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--lm-muted)" }} />
        <span className="text-[12.5px]" style={{ color: "var(--lm-muted)" }}>Want to run this at your campus?</span>
        <a
          href="/rep"
          className="text-[12.5px] font-black underline underline-offset-4"
          style={{ color: "var(--lm-accent)" }}
        >
          Become a campus rep →
        </a>
      </div>
    </section>
  );
}
