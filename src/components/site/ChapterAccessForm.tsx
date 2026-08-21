// CLAIM THIS PAGE — four fields, then Lee calls.
//
// Four, because Lee is going to phone this person back anyway: anything a conversation answers
// better does not belong in a form. Claiming is FREE and buys nothing: it identifies a real
// officer so the page has an admin — full-semester seats are a later, separate conversation.
//
// The server function is still submitChapterClaim: the table is greek_chapter_claims and
// renaming storage to match a UI word would be a migration bought with nothing.
//
// NO dismiss-on-outside/Esc. This form is INLINE in the onboarding accordion now, not a modal:
// the step headers sit directly above and below it and the mobile sticky bar floats over it, so
// "outside" taps are part of normally using the section — a document-wide dismiss listener was
// silently wiping four typed fields. The × button is the one deliberate way out.
import { useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { CLAIM_POSITIONS, submitChapterClaim } from "@/lib/greek-claims.functions";

const fmtPhone = (v: string) => {
  if (v.trim().startsWith("+")) return "+" + v.replace(/\D/g, "").slice(0, 15);
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

const FIELD: React.CSSProperties = {
  minHeight: 48,
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  color: "var(--brand-cream)",
  // 16px explicitly — under it iOS zooms the page on focus and never zooms back.
  fontSize: 16,
};

export function ChapterAccessForm({ schoolSlug, chapterSlug, chapterName, onClose, onDone }: {
  schoolSlug: string;
  chapterSlug: string;
  chapterName: string;
  onClose: () => void;
  /** Fired on a successful submit, so the section can move its claim state to pending without a
   *  reload — the loader-fetched claimStatus is stale the moment this succeeds. */
  onDone?: () => void;
}) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ok = name.trim().length > 1 && position && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && phone.replace(/\D/g, "").length >= 10;

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await submitChapterClaim({ data: { schoolSlug, chapterSlug, name: name.trim(), position, email: email.trim(), phone: phone.trim() } });
      if (r.ok) { setDone(true); onDone?.(); }
      else { setErr(r.error ?? "Something went wrong — try again."); setBusy(false); }
    } catch { setErr("Couldn't reach the server — try again in a moment."); setBusy(false); }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-sm rounded-xl p-4 text-center" style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.35)", fontFamily: BRAND_SANS }}>
        <p className="text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>You&apos;re almost set.</p>
        {/* Says what happens next and roughly when. "We'll be in touch" is what a form says when
            nobody is actually going to read it. */}
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>We&apos;ll verify your chapter role and follow up within one business day.</p>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-sm rounded-xl p-4 text-left" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-1.5 top-1.5 grid place-items-center rounded-full hover:bg-white/10"
        style={{ width: 40, height: 40, color: "var(--text-muted)", lineHeight: 1 }}
      >
        <span aria-hidden style={{ fontSize: 18 }}>×</span>
      </button>

      <p className="mb-1 pr-10 text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>Claim {chapterName}&apos;s page</p>
      <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>We&apos;ll verify your chapter role and follow up within one business day.</p>

      <label className="sr-only" htmlFor="ca-name">Your name</label>
      <input id="ca-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="mb-2 w-full rounded-lg px-3 outline-none focus:ring-2" style={FIELD} />

      <label className="sr-only" htmlFor="ca-pos">Your chapter role</label>
      <select id="ca-pos" value={position} onChange={(e) => setPosition(e.target.value)} className="mb-2 w-full rounded-lg px-3 outline-none focus:ring-2" style={FIELD}>
        <option value="">Your chapter role…</option>
        {CLAIM_POSITIONS.map((p) => <option key={p} value={p} style={{ color: "#0B1220" }}>{p}</option>)}
      </select>

      <label className="sr-only" htmlFor="ca-email">Your email</label>
      <input id="ca-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@school.edu" className="mb-2 w-full rounded-lg px-3 outline-none focus:ring-2" style={FIELD} />

      <label className="sr-only" htmlFor="ca-phone">Your mobile</label>
      <input id="ca-phone" value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} inputMode="tel" placeholder="(662) 555-0134" className="w-full rounded-lg px-3 outline-none focus:ring-2" style={FIELD} />

      {err && <p className="mt-2 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}

      <button onClick={() => void submit()} disabled={!ok || busy} className="mt-3 w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40" style={{ minHeight: 50, background: "var(--accent)", color: "#0B1220" }}>
        {busy ? "…" : "Claim This Page ⚡"}
      </button>
    </div>
  );
}
