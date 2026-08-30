// CLAIM THIS PAGE — four fields, then Lee calls.
//
// Four, because Lee is going to phone this person back anyway: anything a conversation answers
// better does not belong in a form. Claiming is FREE and buys nothing: it identifies a real
// officer so the page has an admin — full-semester seats are a later, separate conversation.
//
// NOTHING ABOUT CHAPTER SIZE, BUDGET OR INTENT BELONGS HERE. Those are the questions you ask
// someone who has already agreed to talk to you. Asked at the door they turn a 20-second
// identification into a qualification form, and the person who abandons it is the exec you most
// wanted. There is a clean seam for them after approval; this is not it.
//
// The server function is still submitChapterClaim: the table is greek_chapter_claims and
// renaming storage to match a UI word would be a migration bought with nothing.
//
// NO dismiss-on-outside/Esc for the FORM. It is INLINE in the onboarding accordion, not a modal:
// the step headers sit directly above and below it and the mobile sticky bar floats over it, so
// "outside" taps are part of normally using the section — a document-wide dismiss listener was
// silently wiping four typed fields. The × button is the one deliberate way out. (The role
// dropdown below does close on outside click, because closing a popup loses nothing.)
import { SmsConsentNote } from "@/components/landing/SmsConsentBanner";
import { useEffect, useId, useRef, useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { CLAIM_POSITIONS, notifyChapterClaim, submitChapterClaim } from "@/lib/greek-claims.functions";

const fmtPhone = (v: string) => {
  if (v.trim().startsWith("+")) return "+" + v.replace(/\D/g, "").slice(0, 15);
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

// ONE FIELD SURFACE, shared by the inputs and the role button so a mixed row cannot drift apart.
// Darker than the card it sits on rather than lighter: on this navy, a raised field reads as a
// button and a recessed one reads as somewhere to type.
const FIELD: React.CSSProperties = {
  width: "100%",
  minHeight: 50,
  borderRadius: 12,
  padding: "0 14px",
  background: "var(--bg-input, rgba(0,0,0,0.22))",
  border: "1px solid var(--border-default)",
  color: "var(--brand-cream)",
  // 16px explicitly — under it iOS zooms the page on focus and never zooms back.
  fontSize: 16,
  outline: "none",
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-secondary, #AAB4C8)",
  marginBottom: 6,
};

/** THE ROLE PICKER. A native <select> could not be made to look like the rest of this page: the
 *  closed control can be restyled, but the open list is drawn by the OS and arrives as a grey
 *  system menu in the middle of a navy card. It also cannot show the placeholder in a muted
 *  colour, so "Your chapter role…" read as a chosen value.
 *
 *  So it is a real listbox — button plus panel, arrow keys, Home/End, Escape, click-outside — and
 *  it closes without touching the form's other fields. Nine options fit on one screen, so there
 *  is no search: a search box on nine items is furniture. */
function RoleSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, CLAIM_POSITIONS.indexOf(value)));
  }, [open, value]);

  // Keep the highlighted option on screen when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (v: string) => { onChange(v); setOpen(false); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, CLAIM_POSITIONS.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Home") { e.preventDefault(); setActive(0); return; }
    if (e.key === "End") { e.preventDefault(); setActive(CLAIM_POSITIONS.length - 1); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(CLAIM_POSITIONS[active]); }
  };

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKey}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${id}-list`}
        className="sa-field flex items-center justify-between text-left"
        style={{ ...FIELD, color: value ? "var(--brand-cream)" : "var(--text-tertiary, #7C89A4)" }}
      >
        <span className="truncate">{value || "Select your role"}</span>
        <span
          aria-hidden
          className="ml-2 shrink-0 transition-transform motion-reduce:transition-none"
          style={{ color: "var(--accent)", fontSize: 11, transform: open ? "rotate(180deg)" : "none" }}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          id={`${id}-list`}
          ref={listRef}
          role="listbox"
          aria-label="Your chapter role"
          className="absolute left-0 right-0 z-20 mt-1.5 overflow-y-auto rounded-xl py-1"
          style={{
            maxHeight: 264,
            background: "var(--bg-overlay, #1A2948)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 24px 56px -18px rgba(0,0,0,0.8)",
          }}
        >
          {CLAIM_POSITIONS.map((p, i) => {
            const selected = p === value;
            return (
              <div
                key={p}
                data-i={i}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                className="cursor-pointer px-3.5 text-[15px]"
                style={{
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  color: selected ? "#0B1220" : "var(--brand-cream)",
                  background: selected ? "var(--accent)" : i === active ? "rgba(255,255,255,0.07)" : "transparent",
                  fontWeight: selected ? 800 : 500,
                }}
              >
                {p}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChapterAccessForm({ schoolSlug, chapterSlug, chapterName, shortName, onClose, onDone, bare = false }: {
  schoolSlug: string;
  chapterSlug: string;
  chapterName: string;
  /** What students call the chapter ("ADPi") — how the form addresses them, matching the
   *  benefit lines above it. Falls back to the full name when the roster has no shorthand. */
  shortName?: string;
  onClose: () => void;
  /** Fired on a successful submit, so the section can move its claim state to pending without a
   *  reload — the loader-fetched claimStatus is stale the moment this succeeds. */
  onDone?: () => void;
  /** TRUE when this form is already inside a titled sheet: suppresses its own heading and close
   *  button so the reader is not given two of each. */
  bare?: boolean;
}) {
  const uid = useId();
  const who = shortName?.trim() || chapterName;
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // K3 — the one willingness question. Required: it is the single field that decides whether this
  // is a lead Lee calls tonight or one he emails next week. Stored, never shown back as a score.
  const [intent, setIntent] = useState<"" | "committed" | "curious" | "exploring">("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // WHERE THE CONFIRMATION IS, AND WHERE THE EXEC IS LOOKING, ARE NOT THE SAME THING. This form
  // lives inside an accordion step well down a long page; an exec who scrolled while typing could
  // submit and see nothing change, because the card that replaced the form was above or below the
  // fold. The card takes focus and scrolls itself into view, which also announces it to a screen
  // reader instead of silently swapping the subtree.
  const doneRef = useRef<HTMLDivElement | null>(null);

  const ok = name.trim().length > 1 && position && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && phone.replace(/\D/g, "").length >= 10 && !!intent;

  useEffect(() => {
    if (!done) return;
    const el = doneRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [done]);

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await submitChapterClaim({ data: { schoolSlug, chapterSlug, name: name.trim(), position, email: email.trim(), phone: phone.trim(), intent: intent as "committed" | "curious" | "exploring" } });
      if (r.ok) {
        // The claim is saved; that is the whole of what the exec is waiting for. Confirm NOW.
        setDone(true); onDone?.();
        // The notifications are finished off behind the confirmation. On Vercel the platform has
        // already taken them (notifyPending is false) and this does nothing; on a runtime with no
        // work-after-response we ask for them here. Deliberately not awaited and deliberately not
        // surfaced: an exec whose claim is recorded must never be told something went wrong
        // because a mail provider was slow. A failure here shows up in the admin log instead.
        if (r.notifyPending && r.claimId) void notifyChapterClaim({ data: { claimId: r.claimId } }).catch(() => undefined);
      } else { setErr(r.error ?? "Something went wrong — try again."); setBusy(false); }
    } catch { setErr("Couldn't reach the server — try again in a moment."); setBusy(false); }
  };

  if (done) {
    return (
      <div
        ref={doneRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="mx-auto max-w-sm rounded-2xl px-5 py-6 text-center outline-none"
        style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.35)", fontFamily: BRAND_SANS }}
      >
        <p className="text-[17px] font-black" style={{ color: "var(--brand-cream)" }}>
          {intent === "committed" ? `Let's set up ${who}'s seats.` : "You've got the dashboard ✓"}
        </p>
        {/* Says what happens next and by when. "We'll be in touch" is what a form says when nobody
            is actually going to read it. */}
        {intent === "committed" ? (
          /* The page promised an hour, and the hot-lead alert in runClaimIntake is what makes
             that true — it goes to Lee's phone the moment this submits. */
          <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
            Lee will text you within the hour.
          </p>
        ) : (
          <>
            <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.86 }}>
              We&apos;ll email you as the house signs up.
            </p>
            <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] leading-relaxed" style={{ color: "var(--text-secondary, #AAB4C8)" }}>
              I&apos;ll verify your chapter role within one business day.
            </p>
          </>
        )}
        {/* Somewhere to GO. Without this the exec is left at a dead end inside a collapsed
            accordion with the rest of the page above them. */}
        <a
          href="#exam1"
          className="mt-4 inline-flex items-center rounded-xl px-4 text-[13.5px] font-black"
          style={{ minHeight: 44, background: "rgba(255,255,255,0.08)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
        >
          Back to Exam 1 →
        </a>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-sm rounded-2xl p-5 text-left" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
      {!bare && (
        <>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-1.5 top-1.5 grid place-items-center rounded-full hover:bg-white/10"
            style={{ width: 40, height: 40, color: "var(--text-muted)", lineHeight: 1 }}
          >
            <span aria-hidden style={{ fontSize: 18 }}>×</span>
          </button>

          <p className="mb-4 pr-10 text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>Set up {chapterName}&apos;s dashboard</p>
        </>
      )}

      {/* FOUR FIELDS, TWO ROWS — who you are, then how to reach you. Stacked, this was a column
          of four boxes that read as a form to survive; paired, it reads as two questions. It
          collapses to one column under 420px, where two columns would only make both too narrow
          to type a real email into. */}
      <div className="sa-claim-grid grid gap-3.5">
        <div>
          <label style={LABEL} htmlFor={`${uid}-name`}>Your name</label>
          <input
            id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)}
            autoComplete="name" placeholder="Jordan Ellis"
            className="sa-field" style={FIELD}
          />
        </div>

        <div>
          <label style={LABEL} htmlFor={`${uid}-role`}>Your chapter role</label>
          <RoleSelect id={`${uid}-role`} value={position} onChange={setPosition} />
        </div>

        <div>
          <label style={LABEL} htmlFor={`${uid}-email`}>Your email</label>
          <input
            id={`${uid}-email`} value={email} onChange={(e) => setEmail(e.target.value)}
            type="email" autoComplete="email" inputMode="email" placeholder="you@school.edu"
            className="sa-field" style={FIELD}
          />
        </div>

        <div>
          <label style={LABEL} htmlFor={`${uid}-phone`}>Your mobile</label>
          <input
            id={`${uid}-phone`} value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))}
            type="tel" autoComplete="tel" inputMode="tel" placeholder="(662) 555-0134"
            className="sa-field" style={FIELD}
          />
        </div>
      </div>

      {/* THE SMS DISCLOSURE, in its shortest compliant form. Lee asked for it to become an
          "SMS policy" link, and it nearly is: one quiet line plus "Message terms" behind a
          toggle. It cannot become ONLY a link — A2P 10DLC requires the consent essentials
          (what you get, rates, STOP) to be visible AT the point of capture, and hiding all of it
          is what makes a submitted number an unconsented one. This is the compact variant the
          notify modal already uses, so the two forms now disclose identically. */}
      <SmsConsentNote compact />

      {/* K3 — ONE willingness question, required, immediately before the button. Deliberately
          the last thing they answer: by here they have already decided to claim, so this reads as
          "how fast do you want to move", not as a qualifying gate on the way in. */}
      <fieldset className="mt-4" style={{ border: 0, padding: 0, margin: "16px 0 0" }}>
        <legend className="mb-2 text-[12px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>
          Where&rsquo;s {who} at?
        </legend>
        <div className="flex flex-col gap-1.5">
          {([
            ["committed", "We're ready to sponsor seats"],
            ["curious", "Tell me more first"],
            ["exploring", "Just exploring for now"],
          ] as const).map(([value, label]) => {
            const on = intent === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setIntent(value)}
                aria-pressed={on}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13.5px] font-bold focus-visible:ring-2"
                style={{
                  minHeight: 46,
                  background: on ? "rgba(252,163,17,0.10)" : "var(--bg-input, rgba(0,0,0,0.32))",
                  border: `1px solid ${on ? "var(--accent)" : "var(--border-default)"}`,
                  color: "var(--brand-cream)", cursor: "pointer",
                }}
              >
                <span
                  aria-hidden
                  className="inline-block shrink-0 rounded-full"
                  style={{ width: 14, height: 14, border: `2px solid ${on ? "var(--accent)" : "var(--text-muted)"}`, background: on ? "var(--accent)" : "transparent" }}
                />
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {err && <p className="mt-3 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}

      {/* AN EXPLICIT LABEL, NOT "…". A bare ellipsis on a submit button is indistinguishable from
          a hang: it says something is happening but not what, and gives no hint whether waiting
          is reasonable. "Sending request…" does both. */}
      <button
        onClick={() => void submit()}
        disabled={!ok || busy}
        aria-busy={busy}
        className="mt-4 w-full rounded-xl text-[14px] font-black leading-tight transition-opacity disabled:opacity-40"
        style={{ minHeight: 52, background: "var(--accent)", color: "#0B1220" }}
      >
        {busy ? "Sending request…" : "Get your academic exec dashboard →"}
      </button>
    </div>
  );
}
