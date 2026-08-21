// "TELL ME WHO YOU ARE" — the capture behind both isn't-listed links.
//
// Four fields, because Lee is going to reply to this person himself and a conversation answers
// everything else better. Deliberately NOT the SMS-verified signup flow: this visitor is reporting
// a gap in the roster, and demanding a verification code to do that would lose most of them.
import { useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { submitNotListed } from "@/lib/greek-notlisted.functions";

export function NotListedForm({ kind, school, onClose, askChapter, title }: {
  kind: "school" | "chapter";
  /** Prefilled when they got as far as picking a school before falling out. */
  school?: string;
  onClose: () => void;
  /** Ask for the Greek chapter too. Defaults to the Greek surfaces; the solo-student form on the
   *  homepage does NOT ask (a student who cannot find their school has no reason to be asked
   *  which fraternity they are in). */
  askChapter?: boolean;
  /** Heading override — the /chapters form covers school AND chapter in one go. */
  title?: string;
}) {
  const [schoolName, setSchoolName] = useState(school ?? "");
  const [chapter, setChapter] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Contact accepts EITHER an email or a phone. Insisting on one of them is a way to lose the half
  // of people who only carry the other.
  const contactOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.trim()) || contact.replace(/\D/g, "").length >= 10;
  const ok = schoolName.trim().length > 1 && name.trim().length > 1 && contactOk;

  const send = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      await submitNotListed({ data: { kind, school: schoolName.trim(), chapter: chapter.trim(), name: name.trim(), contact: contact.trim() } });
      setDone(true);
    } catch { setErr("Couldn't send that — try again in a moment."); setBusy(false); }
  };

  if (done) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.35)", fontFamily: BRAND_SANS }}>
        <p className="text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>Got it — Lee has your details.</p>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>He reads these himself and usually replies the same day.</p>
      </div>
    );
  }

  const field = { minHeight: 44, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" } as const;

  return (
    <div className="rounded-xl p-4 text-left" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-[13.5px] font-black" style={{ color: "var(--brand-cream)" }}>
          {title ?? (kind === "school" ? "Which school are you at?" : "Which chapter are you in?")}
        </p>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-muted)" }}>
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span>
        </button>
      </div>
      <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="School" className="mb-2 w-full rounded-lg px-3 text-[14px] outline-none" style={field} />
      {(askChapter ?? kind === "chapter") && (
        <input value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="Greek chapter" className="mb-2 w-full rounded-lg px-3 text-[14px] outline-none" style={field} />
      )}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="mb-2 w-full rounded-lg px-3 text-[14px] outline-none" style={field} />
      {/* 16px explicitly — under it iOS zooms the page on focus and never zooms back. */}
      <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email or mobile" className="w-full rounded-lg px-3 outline-none" style={{ ...field, fontSize: 16 }} />
      {err && <p className="mt-2 text-[12px]" style={{ color: "#F3C6CC" }}>{err}</p>}
      <button
        type="button" onClick={() => void send()} disabled={!ok || busy}
        className="mt-3 w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40"
        style={{ minHeight: 48, background: "var(--accent)", color: "#0B1220" }}
      >
        {busy ? "…" : "Send it in ⚡"}
      </button>
    </div>
  );
}
