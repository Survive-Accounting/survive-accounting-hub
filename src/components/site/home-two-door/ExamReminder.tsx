// "WHEN'S YOUR EXAM?" — the end cap under the FAQ.
//
// INLINE, NOT A MODAL. A student who has read this far is deciding; interrupting them with a
// dialog to ask for a phone number is the wrong trade. It sits in the flow, and scrolling past it
// costs nothing.
//
// WHAT IT PROMISES IS WHAT IT DOES: one text, at the offset they picked, and Reply STOP works
// permanently because the message rides the same outbox that re-checks opt-out at send time.
// The offsets CLAMP to what is still in the future — an exam in three days cannot have a
// five-day warning, and offering one would be offering a text that never arrives.
import { useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { allowedOffsets, REMINDER_DISCLOSURE, scheduleExamReminder } from "@/lib/exam-reminder.functions";

/** Today in the browser's own local reckoning, YYYY-MM-DD — the min for the date input. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysOutLocal(dateISO: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return -1;
  const [y, m, d] = dateISO.split("-").map(Number);
  const now = new Date();
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

const pretty = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
};

export function ExamReminder({ campusId, courseCode }: { campusId?: string | null; courseCode?: string | null }) {
  const [date, setDate] = useState("");
  const [phone, setPhone] = useState("");
  const [offset, setOffset] = useState(5);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [sentOn, setSentOn] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const daysOut = date ? daysOutLocal(date) : null;
  const past = daysOut !== null && daysOut < 0;
  const offsets = useMemo(() => allowedOffsets(daysOut ?? 5), [daysOut]);
  // Keep the selection legal as the date moves: pick the largest still-offered option.
  const chosen = offsets.includes(offset) ? offset : (offsets[0] ?? 1);
  const phoneOk = phone.replace(/\D/g, "").length >= 10;
  const ready = !!date && !past && phoneOk && state !== "busy";

  const submit = async () => {
    if (!ready) return;
    setState("busy"); setErr(null);
    try {
      const ref = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") : null;
      const r = await scheduleExamReminder({ data: { phone, examDate: date, offsetDays: chosen, campusId: campusId ?? null, courseCode: courseCode ?? null, ref } });
      if (r.ok) {
        setSentOn(r.immediate ? "today" : pretty(new Date(Date.parse(r.sendOnISO)).toISOString().slice(0, 10)));
        setState("done");
      } else {
        setErr(r.reason === "bad-phone" ? "That number doesn't look right." : r.reason === "past" ? "That date has already passed." : "Couldn't set that up — try texting me instead.");
        setState("error");
      }
    } catch {
      setErr("Couldn't set that up — try texting me instead.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <section className="mx-auto w-full max-w-[640px] px-5 py-10 text-center" style={{ fontFamily: BRAND_SANS }}>
        <p className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Got it. I&apos;ll text you {sentOn === "today" ? "today" : `on ${sentOn}`}.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[640px] px-5 py-10" style={{ fontFamily: BRAND_SANS }}>
      <div className="rounded-2xl p-5 sm:p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <h2 className="text-[20px] font-extrabold" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
          When&apos;s your exam?
        </h2>
        <p className="mt-1 text-[14px]" style={{ color: "var(--text-secondary)" }}>
          I&apos;ll text you before it with everything you need.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="date" value={date} min={todayISO()}
            onChange={(e) => { setDate(e.target.value); if (state === "error") setState("idle"); }}
            aria-label="Exam date"
            className="min-w-0 flex-1 rounded-lg px-3 text-[14px] outline-none"
            style={{ minHeight: 44, background: "rgba(0,0,0,0.3)", border: `1px solid ${past ? "#F3C6CC" : "var(--border-default)"}`, color: "var(--brand-cream)" }}
          />
          <input
            type="tel" inputMode="tel" autoComplete="tel" placeholder="your phone" value={phone}
            onChange={(e) => { setPhone(e.target.value); if (state === "error") setState("idle"); }}
            aria-label="Your phone number"
            className="min-w-0 flex-1 rounded-lg px-3 text-[14px] outline-none"
            style={{ minHeight: 44, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
          />
        </div>
        {past && <p className="mt-2 text-[12.5px]" style={{ color: "#F3C6CC" }}>That date has already passed.</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
            Remind me <span className="font-bold" style={{ color: "var(--brand-cream)" }}>{chosen}</span> {chosen === 1 ? "day" : "days"} before
          </span>
          <span aria-hidden style={{ opacity: 0.4 }}>·</span>
          {/* Only offsets still ahead of the exam are offered — see allowedOffsets. */}
          <div className="flex items-center gap-1" role="group" aria-label="Days before the exam">
            {offsets.map((n) => (
              <button
                key={n} type="button" onClick={() => setOffset(n)}
                aria-pressed={n === chosen}
                className="rounded-full text-[13px] font-bold"
                style={{
                  minWidth: 34, minHeight: 34,
                  background: n === chosen ? "var(--accent)" : "transparent",
                  color: n === chosen ? "#0B1220" : "var(--text-muted)",
                  border: `1px solid ${n === chosen ? "var(--accent)" : "var(--border-default)"}`,
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button" onClick={() => void submit()} disabled={!ready}
          className="mt-4 w-full rounded-xl text-[15px] font-black disabled:opacity-45"
          style={{ minHeight: 48, background: "var(--accent)", color: "#0B1220" }}
        >
          {state === "busy" ? "…" : "Remind me →"}
        </button>

        {err && <p className="mt-2 text-[12.5px]" style={{ color: "#F3C6CC" }}>{err}</p>}
        {/* REQUIRED, NOT DECORATIVE. This exact string is stored with the consent timestamp. */}
        <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--text-muted)" }}>{REMINDER_DISCLOSURE}</p>
      </div>
    </section>
  );
}
