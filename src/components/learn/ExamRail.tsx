// THE EXAM RAIL — the organizing spine of the whole product, finally sized like it.
//
// Exams were a small label. They are the thing a student actually navigates by ("I have Exam 2 on
// Thursday"), so they get the top of the surface: four tabs, always visible, each carrying its
// own state.
//
// ── THE WAITLIST IS THE POINT ─────────────────────────────────────────────────────────────────
// Exams 2, 3 and the Final are not built yet, and this is the strongest email capture on the
// site: a student looking at a locked Exam 2 the week before Exam 2 is the most motivated reader
// we will ever get. So the locked state is not a dead end and not a paywall — it is one field.
//
// It writes through joinPricingWaitlist with the exam number attached, the same store the pricing
// waitlist already uses. No new table, and the exam number is what makes the list segmentable.
import { useState } from "react";
import { Check, Lock, Mail, X } from "lucide-react";

import { usePersistedDismiss } from "@/lib/device-prefs";
import { joinPricingWaitlist } from "@/lib/pricing-api";

export type ExamTabState = {
  num: number;
  label: string;
  /** TRUE when this exam has playable content today. Exam 1 is free; the rest are not built. */
  available: boolean;
  /** Sets counted across the exam's topics — shown only when there are any. */
  videoCount: number;
};

export function ExamRail({ exams, activeNum, onPick, campusId, campusName, courseCode }: {
  exams: ExamTabState[];
  activeNum: number | null;
  onPick: (num: number) => void;
  campusId?: string | null;
  campusName?: string | null;
  courseCode?: string | null;
}) {
  const [waitlistFor, setWaitlistFor] = useState<number | null>(null);

  // DISMISSAL PERSISTS PER DEVICE. One key for the whole rail rather than one per exam: a student
  // who has said "not now" to Exam 2 has said it about the pitch, not about that specific tab,
  // and asking them again on the Final is the behaviour they were dismissing.
  const [pitchOff, dismissPitch, restorePitch] = usePersistedDismiss("learn-exam-waitlist");

  return (
    <div className="w-full">
      <div className="flex w-full gap-1.5 overflow-x-auto pb-1">
        {exams.map((e) => {
          const active = e.num === activeNum;
          return (
            <button
              key={e.num}
              type="button"
              // A DISMISSAL IS RESPECTED, INCLUDING HERE. Tapping a locked exam after the pitch
              // has been dismissed does NOT bring the panel back — it shows the one-line link
              // below instead, and that link is what restores it. Auto-restoring on tap would
              // make the persisted flag decorative: the panel would return the first time the
              // student touched a locked tab, which is the exact moment they dismissed it from.
              onClick={() => {
                if (e.available) { onPick(e.num); return; }
                setWaitlistFor((n) => (n === e.num ? null : e.num));
              }}
              className="lm-surface shrink-0 rounded-xl border px-4 py-2.5 text-left focus-visible:ring-2"
              style={{
                minWidth: 132,
                borderColor: active ? "var(--lm-accent)" : "var(--lm-border)",
                borderWidth: 1, borderStyle: "solid",
                background: active ? "color-mix(in srgb, var(--lm-accent) 12%, transparent)" : undefined,
                cursor: "pointer",
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[13px] font-black uppercase tracking-wide"
                  style={{ color: active ? "var(--lm-accent)" : "var(--lm-text)" }}
                >
                  {e.label}
                </span>
                {!e.available && <Lock className="h-3 w-3 shrink-0" style={{ color: "var(--lm-muted)" }} />}
              </div>

              {/* FREE vs LOCKED, said plainly on every tab. A student should never have to click
                  to find out which exams they can watch right now. */}
              <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: e.available ? "#3BF5A0" : "var(--lm-muted)" }}>
                {e.available ? "Free" : "Coming soon"}
              </div>
              {e.available && e.videoCount > 0 && (
                <div className="text-[10.5px]" style={{ color: "var(--lm-muted)" }}>
                  {e.videoCount} video{e.videoCount === 1 ? "" : "s"}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {waitlistFor != null && !pitchOff && (
        <ExamWaitlist
          examNum={waitlistFor}
          label={exams.find((e) => e.num === waitlistFor)?.label ?? `Exam ${waitlistFor}`}
          campusId={campusId}
          campusName={campusName}
          courseCode={courseCode}
          onClose={() => { dismissPitch(); setWaitlistFor(null); }}
        />
      )}

      {/* DISMISSED, BUT NOT A DEAD END. A persisted dismissal that removes the only way to ask
          for the email would be worse than the card — a student who wants Exam 2 the week before
          Exam 2 must still have a door. This is that door, one quiet line instead of a panel. */}
      {waitlistFor != null && pitchOff && (
        <button
          type="button"
          onClick={restorePitch}
          className="mt-2 text-[12px] font-bold underline underline-offset-4"
          style={{ color: "var(--lm-muted)", background: "none", border: 0, cursor: "pointer", minHeight: 36 }}
        >
          Email me when {exams.find((e) => e.num === waitlistFor)?.label ?? `Exam ${waitlistFor}`} is up →
        </button>
      )}
    </div>
  );
}

/** ONE FIELD. The whole reason this converts is that it asks for nothing else — no name, no
 *  campus, no "tell us about yourself". The campus rides along from context when we have it. */
function ExamWaitlist({ examNum, label, campusId, campusName, courseCode, onClose }: {
  examNum: number;
  label: string;
  campusId?: string | null;
  campusName?: string | null;
  courseCode?: string | null;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      await joinPricingWaitlist({
        email: email.trim(),
        campusId: campusId ?? null,
        campus: campusName ?? null,
        course: courseCode ?? null,
        // "test_pass" is the tier a single exam's materials fall under — the only two values
        // WaitlistTier allows, and the honest one here. examNum is what makes the list
        // segmentable ("everyone waiting on Exam 2").
        tier: "test_pass",
        examNum,
      });
      setDone(true);
    } catch (e) {
      // Said out loud rather than swallowed — a capture that silently fails is worse than none.
      setErr(e instanceof Error ? e.message : "That didn't send — try again?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="lm-surface mt-2 rounded-xl border px-4 py-3"
      style={{ borderColor: "var(--lm-accent)", borderWidth: 1, borderStyle: "solid" }}
    >
      {done ? (
        <p className="flex items-center gap-2 text-[13px] font-bold" style={{ color: "var(--lm-text)" }}>
          <Check className="h-4 w-4" style={{ color: "#3BF5A0" }} />
          You&apos;re on the list — I&apos;ll email you the moment {label} is up.
        </p>
      ) : (
        <>
          {/* THE DISMISS IS A CORNER ×, not a word at the end of a row. On a 390px phone the old
              "Not now" was the third item in a stack, below a full-width send button — the last
              thing on screen and the easiest thing to miss. A × in the corner is where a person
              looks for a way out. */}
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-bold" style={{ color: "var(--lm-text)" }}>
              {label} isn&apos;t up yet. Want me to email you when it is?
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss"
              title="Dismiss — I won't ask again on this device"
              className="-mr-1.5 -mt-1 grid shrink-0 place-items-center rounded-full hover:bg-white/10"
              style={{ height: 32, width: 32, color: "var(--lm-muted)", background: "none", border: 0, cursor: "pointer" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              autoFocus
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErr(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@school.edu"
              aria-label={`Email me when ${label} is ready`}
              className="min-w-0 flex-1 rounded-lg px-3 outline-none"
              style={{
                fontSize: 16, minHeight: 44, background: "rgba(0,0,0,0.35)",
                border: "1px solid var(--lm-border)", color: "var(--lm-text)",
              }}
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!ok || busy}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-[13.5px] font-black disabled:opacity-45"
              style={{ minHeight: 44, background: "var(--lm-accent)", color: "var(--lm-accent-ink)", border: 0, cursor: "pointer" }}
            >
              <Mail className="h-4 w-4" /> {busy ? "Sending…" : "Email me"}
            </button>
            {/* "Not now" moved to the corner × above — see the note there. */}
          </div>
          {err && <p role="alert" className="mt-1.5 text-[12px]" style={{ color: "#F3C6CC" }}>{err}</p>}
        </>
      )}
    </div>
  );
}
