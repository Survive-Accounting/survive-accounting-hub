// CAMPUS REP — the ad and the form, on one short page.
//
// It is an advertisement, not a program handbook. Everything a prospective rep needs to decide is
// above the form; everything else is a conversation Lee has with the three people who apply.
//
// THE WORK-AUTHORISATION CHECKBOX IS NOT A FORMALITY. F-1 students generally cannot take off-campus
// work, and this is an independent-contractor arrangement. Unchecked, the form declines politely and
// STORES NOTHING — no record, no alert. Capturing a name we would have to turn down, and holding it
// on file, is worse for them than not asking.
import { useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { submitRepInterest } from "@/lib/campus-rep.functions";
import { useCampus } from "@/lib/campus-context";

const POINTS = [
  "Commission on every sale you bring in — 10% your first semester, 15% if you stay on.",
  "You get flyers, QR codes, and chapter links — all made for you.",
  "Work your own hours. This is a side gig, not a job.",
];

const FIELD: React.CSSProperties = {
  minHeight: 48, background: "rgba(245,239,230,0.06)",
  border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)",
  // 16px explicitly — under it iOS zooms the page on focus and never zooms back.
  fontSize: 16,
};

export function RepInterest({ schoolSlug, schoolName }: { schoolSlug: string; schoolName: string }) {
  const { code } = useCampus();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState(schoolName);
  const [year, setYear] = useState("");
  const [greek, setGreek] = useState("");
  const [pitch, setPitch] = useState("");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = name.trim().length > 1
    && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
    && phone.replace(/\D/g, "").length >= 10
    && school.trim().length > 1
    && year.trim().length > 0;

  const submit = async () => {
    if (!valid || authorized !== true || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await submitRepInterest({ data: {
        name: name.trim(), email: email.trim(), phone: phone.trim(),
        schoolSlug, schoolName: school.trim(), year: year.trim(),
        greek: greek.trim() || undefined, pitch: pitch.trim() || undefined,
        authorized: true,
      } });
      if (r.ok) setDone(true);
      else { setErr(r.error ?? "Something went wrong — try again."); setBusy(false); }
    } catch { setErr("Couldn't reach the server — try again in a moment."); setBusy(false); }
  };

  return (
    <main className="mx-auto w-full max-w-[620px] px-5 py-12" style={{ fontFamily: BRAND_SANS }}>
      <h1 className="text-[27px] font-black leading-[1.14] sm:text-[33px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>
        Be the {schoolName} campus rep.
      </h1>
      <p className="mt-3 text-[15.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
        Get {code ? <span className="font-bold" style={{ color: "var(--accent)" }}>{code}</span> : "intro accounting"} cram
        videos in front of every chapter on campus — and get paid for it.
      </p>

      <ul className="mt-7 flex flex-col gap-2.5">
        {POINTS.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)" }}>
            <span aria-hidden className="shrink-0" style={{ color: "var(--accent)" }}>⚡</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      {/* The honest line. It is the most persuasive thing on the page precisely because it is not
          a pitch — a student can tell the difference between a company hiring and a person asking. */}
      <p className="mt-6 text-[14px] italic leading-relaxed" style={{ color: "var(--text-muted)" }}>
        I&apos;m one person filming videos. I need help getting them in front of people who need them.
      </p>

      <div className="mt-9">
        {done ? (
          <div className="rounded-xl p-5 text-center" style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.35)" }}>
            <p className="text-[15px] font-bold" style={{ color: "var(--brand-cream)" }}>
              Got it. I&apos;ll reach out personally — usually within a couple days.
            </p>
          </div>
        ) : authorized === false ? (
          // DECLINE PATH — nothing was submitted and nothing was stored.
          <div className="rounded-xl p-5" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.12)" }}>
            <p className="text-[14.5px] font-bold" style={{ color: "var(--brand-cream)" }}>Thanks for your interest.</p>
            <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              This is a paid independent-contractor role, so I can only work with people authorized to
              work in the US. Nothing was submitted. If that changes, come back any time — and Exam 1
              is free for you either way.
            </p>
            <button type="button" onClick={() => setAuthorized(null)} className="mt-3 text-[13px] font-bold" style={{ color: "var(--accent)", minHeight: 44 }}>
              ← Back to the form
            </button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>TELL ME ABOUT YOU</p>

            <label className="sr-only" htmlFor="rep-name">Your name</label>
            <input id="rep-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="mb-2 w-full rounded-lg px-3 outline-none focus:ring-2" style={FIELD} />

            <label className="sr-only" htmlFor="rep-email">Email</label>
            <input id="rep-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@school.edu" autoComplete="email" className="mb-2 w-full rounded-lg px-3 outline-none focus:ring-2" style={FIELD} />

            <label className="sr-only" htmlFor="rep-phone">Phone</label>
            <input id="rep-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Mobile number" autoComplete="tel" className="mb-2 w-full rounded-lg px-3 outline-none focus:ring-2" style={FIELD} />

            {/* Pre-filled from campus context, still editable — a rep at a school we do not list yet
                is exactly the person worth hearing from. */}
            <label className="sr-only" htmlFor="rep-school">School</label>
            <input id="rep-school" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="School" className="mb-2 w-full rounded-lg px-3 outline-none focus:ring-2" style={FIELD} />

            <label className="sr-only" htmlFor="rep-year">Year in school</label>
            <input id="rep-year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year in school" className="mb-2 w-full rounded-lg px-3 outline-none focus:ring-2" style={FIELD} />

            <label className="sr-only" htmlFor="rep-greek">Greek affiliation (optional)</label>
            <input id="rep-greek" value={greek} onChange={(e) => setGreek(e.target.value)} placeholder="Greek affiliation (optional)" className="mb-2 w-full rounded-lg px-3 outline-none focus:ring-2" style={FIELD} />

            <label className="sr-only" htmlFor="rep-pitch">How would you get this in front of people?</label>
            <textarea id="rep-pitch" value={pitch} onChange={(e) => setPitch(e.target.value)} rows={3} placeholder="How would you get this in front of people?" className="mb-3 w-full rounded-lg px-3 py-2.5 outline-none focus:ring-2" style={{ ...FIELD, minHeight: 84 }} />

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2.5" style={{ background: "rgba(245,239,230,0.04)" }}>
              <input
                type="checkbox"
                checked={authorized === true}
                onChange={(e) => setAuthorized(e.target.checked ? true : false)}
                className="mt-0.5 shrink-0"
                style={{ width: 18, height: 18, accentColor: "var(--accent)" }}
              />
              <span className="text-[13.5px] leading-snug" style={{ color: "var(--brand-cream)" }}>
                I&apos;m authorized to work in the United States.
              </span>
            </label>

            {err && <p className="mt-2 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!valid || authorized !== true || busy}
              className="mt-4 w-full rounded-xl text-[16px] font-black transition-opacity disabled:opacity-40"
              style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220" }}
            >
              {busy ? "…" : "Send it to Lee ⚡"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
