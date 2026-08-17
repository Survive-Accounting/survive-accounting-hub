// CLAIM THIS CHAPTER — the exec-facing half of a /go/ page. Phase 2a.
//
// Sits at the foot, closed. The page's job is to get a student studying; this is for the one person
// in a thousand who runs the chapter, and interrupting the other 999 to find them would cost more
// than it earns. Four fields, because Lee is going to phone this person back anyway — anything a
// conversation answers better does not belong in a form.
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

export function ClaimChapter({ schoolSlug, chapterSlug, chapterName, claimStatus }: {
  schoolSlug: string;
  chapterSlug: string;
  chapterName: string;
  claimStatus: "unclaimed" | "pending" | "claimed";
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // A claimed chapter says so instead of offering a button that can only fail. A PENDING one says
  // so too — the exec who submitted it an hour ago should see that it landed, not an unchanged form
  // that makes them wonder whether to send it again.
  if (claimStatus === "claimed") {
    return (
      <p className="mx-auto max-w-[640px] px-5 pb-14 text-center text-[12.5px]" style={{ color: "var(--text-muted)", fontFamily: BRAND_SANS }}>
        {chapterName} runs this page. ⚡
      </p>
    );
  }

  const ok = name.trim().length > 1 && position && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && phone.replace(/\D/g, "").length >= 10;

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await submitChapterClaim({ data: { schoolSlug, chapterSlug, name: name.trim(), position, email: email.trim(), phone: phone.trim() } });
      if (r.ok) setDone(true);
      else { setErr(r.error ?? "Something went wrong — try again."); setBusy(false); }
    } catch { setErr("Couldn't reach the server — try again in a moment."); setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-[640px] px-5 pt-2 text-center" style={{ fontFamily: BRAND_SANS }}>
      {done ? (
        <div className="mx-auto max-w-sm rounded-xl p-4" style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.35)" }}>
          <p className="text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>Got it — Lee has your details.</p>
          {/* Says what happens next and roughly when. "We'll be in touch" is what a form says when
              nobody is actually going to read it. */}
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>He reads these himself and usually replies the same day.</p>
        </div>
      ) : claimStatus === "pending" ? (
        <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Someone from {chapterName} has already claimed this — Lee is reviewing it.</p>
      ) : open ? (
        <div className="mx-auto max-w-sm rounded-xl p-4 text-left" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.1)" }}>
          <p className="mb-1 text-[13.5px] font-black" style={{ color: "var(--brand-cream)" }}>Claim {chapterName}</p>
          <p className="mb-3 text-[12px]" style={{ color: "var(--text-muted)" }}>Lee will text you back to set it up.</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="mb-2 w-full rounded-lg px-3 text-[14px] outline-none" style={{ minHeight: 44, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
          <select value={position} onChange={(e) => setPosition(e.target.value)} className="mb-2 w-full rounded-lg px-3 text-[14px] outline-none" style={{ minHeight: 44, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }}>
            <option value="">Your position…</option>
            {CLAIM_POSITIONS.map((p) => <option key={p} value={p} style={{ color: "#0B1220" }}>{p}</option>)}
          </select>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@school.edu" className="mb-2 w-full rounded-lg px-3 text-[14px] outline-none" style={{ minHeight: 44, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
          <input value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} inputMode="tel" placeholder="(662) 555-0134" className="w-full rounded-lg px-3 text-[14px] outline-none" style={{ minHeight: 44, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
          {err && <p className="mt-2 text-[12px]" style={{ color: "#F3C6CC" }}>{err}</p>}
          <button onClick={() => void submit()} disabled={!ok || busy} className="mt-3 w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40" style={{ minHeight: 48, background: "var(--accent)", color: "#0B1220" }}>
            {busy ? "…" : "Claim this chapter ⚡"}
          </button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="text-[12.5px] underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
          Run {chapterName}? Claim this page →
        </button>
      )}
    </div>
  );
}
