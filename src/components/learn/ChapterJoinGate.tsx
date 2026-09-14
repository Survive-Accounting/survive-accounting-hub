// THE CHAPTER JOIN GATE (2026-09-13) — email first, on every chapter's /learn page.
//
// Lee: "I think we should just grab the member emails upfront if they're trying to join a greek
// page. Let's entice them to by saying the chapter can fund their access … this all just needs to
// be smooth and frictionless as possible, as in making them feel comfortable adding an email …
// If a chapter is inviting their members, email is needed. If a chapter scholarship chair is
// posting a flyer, same thing, the QR code should go to the chapter /learn page and require emails.
// We want to know, upfront, how many members are joining from a various org."
//
// WHEN: the page's path names a chapter (/learn/<campus>/<chapter> — the chair's share link, the
// GroupMe post, the flyer and slide QRs all land there) and this device has not joined it. One
// field, one button, the chapter's own crest, the count, and the funding line. Joining also
// unlocks the rest of Exam 1 — the member already gave their email, so that gate never asks.
//
// NOT A TRAP: "Not in ΑΤΩ?" drops the chapter and leaves them on the campus page, where nothing
// asks for an email up front. Someone who is not a member should never be counted as one.
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { countLine, EMAIL_RE, fundingThreshold, gateFundingLine, joinChapter } from "@/components/learn/LearnChapterModule";
import type { School } from "@/lib/schools";

const NAVY = "#14213D", CREAM = "#F5EFE6", GOLD = "#FCA311", NAVY_DEEP = "#0C1528";

export function ChapterJoinGate({ school, chapter, prefillEmail, onLeave }: {
  school: School;
  chapter: { slug: string; name: string | null; letters: string | null; members: number };
  /** A signed-in student's address, so joining is one tap. */
  prefillEmail?: string | null;
  /** "Not in ΑΤΩ?" — drop the chapter, stay on the campus page. */
  onLeave: () => void;
}) {
  const qc = useQueryClient();
  const short = (chapter.letters ?? "").trim() || chapter.name || "your chapter";
  const [email, setEmail] = useState(prefillEmail ?? "");
  useEffect(() => { if (prefillEmail) setEmail((v) => v || prefillEmail); }, [prefillEmail]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const code = school.courseCode;
  const funding = gateFundingLine(short, chapter.members, fundingThreshold(chapter.slug));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = email.trim();
    if (!EMAIL_RE.test(v)) { setErr("That email doesn't look right."); return; }
    setBusy(true); setErr(null);
    try {
      await joinChapter(school, chapter.slug, v, "learn-chapter-gate");
      void qc.invalidateQueries({ queryKey: ["cta-go-chapter"] });
    } catch (e2) {
      setErr(e2 instanceof Error && e2.message.length < 120 ? e2.message : "Couldn't save that — try again.");
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="cjg-title" className="fixed inset-0 z-[130] grid place-items-center overflow-y-auto p-4" style={{ background: "rgba(13,23,48,0.62)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", fontFamily: BRAND_SANS }}>
      <div style={{ width: "min(400px, 100%)", background: NAVY, color: CREAM, borderRadius: 16, padding: "22px 18px 16px", textAlign: "center", position: "relative", overflow: "hidden", boxShadow: "0 30px 80px -24px rgba(0,0,0,0.7)" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(0,107,166,0.3), transparent 62%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "inline-block", position: "relative", lineHeight: 0, marginBottom: 10 }}>
            <BoltBoil height={74} red={school.c1 ?? undefined} blue={school.c2 ?? undefined} />
            <div aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: short.length > 4 ? 16 : 22, color: CREAM, textShadow: "0 2px 7px rgba(12,21,40,0.85)", lineHeight: 1 }}>{short}</div>
          </div>
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(245,239,230,0.6)" }}>{chapter.name ?? short} · {school.name}</p>
          <h2 id="cjg-title" style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 23, margin: "6px 0 6px", letterSpacing: "-0.01em", lineHeight: 1.15 }}>Join {short}&apos;s page</h2>
          <p style={{ margin: "0 auto", maxWidth: "32ch", fontSize: 13.5, lineHeight: 1.5, color: "rgba(245,239,230,0.82)" }}>
            {code ? `${code} ` : ""}Exam 1 cram videos and practice for {short} members.
          </p>
          {funding && <p style={{ margin: "10px auto 0", maxWidth: "34ch", fontSize: 12.5, lineHeight: 1.45, color: GOLD, fontWeight: 600 }}>{funding}</p>}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, background: "rgba(0,107,166,0.24)", border: "1px solid rgba(125,211,252,0.3)", borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 600, color: "#BFE4FA" }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "#3BF5A0" }} />{countLine(short, chapter.members)}
          </div>

          <form onSubmit={(e) => void submit(e)} style={{ marginTop: 14 }}>
            <input
              type="email" inputMode="email" autoComplete="email" autoFocus value={email}
              onChange={(e) => { setEmail(e.target.value); setErr(null); }}
              placeholder="you@school.edu" aria-label="Your email"
              style={{ width: "100%", fontFamily: BRAND_SANS, fontSize: 16, padding: "12px 12px", borderRadius: 9, color: CREAM, background: "rgba(245,239,230,0.08)", border: "1px solid rgba(245,239,230,0.22)", outline: "none" }}
            />
            {err && <p role="alert" style={{ margin: "5px 0 0", fontSize: 12, color: "#F3C6CC", textAlign: "left" }}>{err}</p>}
            <button type="submit" disabled={busy} style={{ marginTop: 9, width: "100%", minHeight: 48, border: 0, borderRadius: 9, background: GOLD, color: NAVY_DEEP, fontFamily: BRAND_DISPLAY, fontWeight: 800, fontSize: 15.5, cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Join ${short}'s page`}
            </button>
          </form>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "rgba(245,239,230,0.55)" }}>Just your email. No password, no spam.</p>
          <button type="button" onClick={onLeave} style={{ marginTop: 10, background: "transparent", border: 0, padding: 4, fontFamily: BRAND_SANS, fontSize: 12, color: "rgba(245,239,230,0.6)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}>
            Not in {short}? Keep studying without joining
          </button>
        </div>
      </div>
    </div>
  );
}
