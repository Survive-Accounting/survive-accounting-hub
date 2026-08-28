// THE UNIVERSAL MARKETING FOOTER — one footer for every public page.
//
// MARKETING SHELL ONLY. /learn is an application workspace with its own shell and must never
// render this; the split is enforced by import (nothing under routes/learn* imports this file).
//
// It lives in components/site, NOT in routes/landing, because every marketing page needs it —
// including the partner pages — and a route file importing another route file is exactly the
// shape the TanStack code-splitter has broken here before.
//
// ── WHY THIS IS position:relative; z-index:1 ───────────────────────────────────────────────────
//
// The marketing pages paint a full-viewport FrameBackground as `position: fixed; z-index: 0`, and
// <main> answers it with `position: relative; z-index: 1`. The footer sits OUTSIDE main (it is
// full-bleed), so as a static element it lost the stacking contest to that fixed layer: the
// orbital background painted OVER the entire footer. That is what made the type look dim and
// "opaque" — nothing here is faded, it was being covered — and it also swallowed every click,
// because elementFromPoint over a footer link returned the background div. One line fixes both.
//
// LAYOUT: brand + company metadata in one left block, three link columns to its right. Horizontal
// rather than a tall stack with a big centred metadata slab underneath.
import { useEffect, useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { FitWordmark } from "@/components/site/SiteHeader";
import { submitNotify } from "@/lib/syllabus.functions";

const PHONE = "(662) 565-8818";
const TEL = "+16625658818";
export const EMAIL = "lee@surviveaccounting.com";

type Col = { title: string; links: Array<{ label: string; href?: string; onClick?: () => void }> };

export function Footer({ onLanding = false }: { onLanding?: boolean } = {}) {
  // Same-page anchors only where those sections exist; absolute everywhere else.
  const base = onLanding ? "" : "/";
  const [founder, setFounder] = useState(false);

  const columns: Col[] = [
    {
      title: "Students",
      links: [
        // "Start studying", not "Find your course": the player IS the product, and it opens with
        // the school picker for anyone who has not told us where they study.
        { label: "Start studying", href: `${base}#exam1` },
        { label: "Reviews", href: `${base}#reviews` },
        { label: "Meet your tutor", href: `${base}#lee` },
        { label: "Become a campus rep", href: "/rep/join" },
      ],
    },
    {
      // THE GREEK COLUMN IS GONE (2026-08-28). The council and national-org pages are being
      // iterated on privately — they live on /leeportal now and are noindexed, so a public
      // footer link to them would be a door to a room that is being rebuilt. The ONE Greek
      // path a visitor should find today is the homepage's chapter door (the waitlist).
      // "Add your school" / "Add your Greek org" went with it: both opened write-in forms for
      // a program that is not taking sign-ups at this stage.
      title: "Help",
      links: [
        { label: `Text Lee ${PHONE}`, href: `sms:${TEL}` },
        { label: `Email ${EMAIL}`, href: `mailto:${EMAIL}` },
      ],
    },
  ];

  const linkCls = "inline-flex items-center text-left text-[14px] font-semibold transition-colors hover:text-[var(--accent)]";
  const linkStyle = { color: "var(--brand-cream)", minHeight: 34 } as const;
  const metaCls = "text-[13px]";
  const metaStyle = { color: "var(--text-secondary)" } as const;

  return (
    <footer
      id="site-footer"
      className="border-t pt-9 pb-8"
      // relative + z-1: see the note at the top of this file.
      style={{ position: "relative", zIndex: 1, borderColor: "var(--border-default)", background: "var(--bg-nav)", fontFamily: BRAND_SANS }}
    >
      {/* Three tracks since the Greek column was removed (2026-08-28): brand + Students + Help.
          The brand block keeps the wide track; the two link columns share the rest. */}
      <div className="mx-auto grid max-w-[1040px] grid-cols-2 gap-x-6 gap-y-8 px-5 lg:grid-cols-[1.5fr_1fr_1fr] lg:gap-x-8">
        {/* BRAND + COMPANY. One block: mark, promise, a quiet rule, then the metadata that used to
            sprawl across a full-width centred row of its own. */}
        <div className="col-span-2 lg:col-span-1">
          <div className="max-w-[180px]"><FitWordmark size={50} style={{ alignItems: "flex-start" }} /></div>
          <p className="mt-2 text-[14px]" style={{ color: "var(--text-secondary)" }}>Cram what&apos;s on your exam.</p>

          <div className="my-4 h-px w-full max-w-[240px]" style={{ background: "var(--border-subtle)" }} />

          <p className={metaCls} style={metaStyle}>Earned Wisdom LLC</p>
          <p className={metaCls} style={metaStyle}>surviveaccounting.com</p>
          <p className={`${metaCls} mt-0.5`} style={metaStyle}>
            <a href="/privacy" className="hover:text-[var(--accent)]" style={{ color: "inherit" }}>Privacy</a>
            <span aria-hidden className="px-1.5" style={{ opacity: 0.5 }}>·</span>
            <a href="/terms" className="hover:text-[var(--accent)]" style={{ color: "inherit" }}>Terms</a>
          </p>
          <p className={`${metaCls} mt-2`} style={metaStyle}>
            Created by Lee Ingram{" "}
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>{" "}
            <button type="button" onClick={() => setFounder(true)} className="font-bold underline underline-offset-4 hover:text-[var(--accent)]" style={{ color: "var(--brand-cream)" }}>
              Learn how →
            </button>
          </p>
          {/* The memorial moved INSIDE the Learn-How panel (FINAL MILE H5) — it lives only there now.
              The Greek badge strip that briefly lived here is gone (2026-08-28): the chapter door on
              the homepage is the single Greek entry point while the program is pre-launch. */}
        </div>

        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="mb-1.5 text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}>{col.title}</p>
            <ul>
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.href ? (
                    <a href={l.href} className={linkCls} style={linkStyle}>{l.label}</a>
                  ) : (
                    <button type="button" onClick={l.onClick} className={linkCls} style={linkStyle}>{l.label}</button>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {founder && <FounderModal onClose={() => setFounder(false)} />}
    </footer>
  );
}

/** "HOW I BUILT THIS" (FINAL MILE H5) — the Learn-How panel: the build story, a quiet one-field
 *  capture (kept from the previous panel — same submitNotify path, its own topic), and the Ben
 *  Ingram memorial, which lives ONLY here now. Deliberately quiet: this must never compete with
 *  the student CTA. */
function FounderModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"open" | "busy" | "done" | "error">("open");
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.documentElement.style.overflow = prev; };
  }, [onClose]);

  const send = async () => {
    if (!ok || state === "busy") return;
    setState("busy");
    try {
      await submitNotify({ data: { contact: email.trim(), topic: "How I built Survive" } });
      setState("done");
    } catch { setState("error"); }
  };

  return (
    <div
      className="fixed inset-0 z-[300] grid place-items-center px-4"
      style={{ background: "rgba(5,8,16,0.72)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="How I built Survive"
    >
      <div
        className="w-full max-w-[400px] rounded-2xl p-5 text-left"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", fontFamily: BRAND_SANS }}
        onClick={(e) => e.stopPropagation()}
      >
        {state === "done" ? (
          <>
            <p className="text-[16px] font-black" style={{ color: "var(--brand-cream)" }}>On its way. ⚡</p>
            <p className="mt-1 text-[14px]" style={{ color: "var(--text-secondary)" }}>I&apos;ll send the story, the stack and what I&apos;d do differently.</p>
            <button onClick={onClose} className="mt-4 w-full rounded-xl text-[14px] font-black" style={{ minHeight: 46, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Close</button>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-start justify-between gap-3">
              <p className="text-[16px] font-black" style={{ color: "var(--brand-cream)" }}>How I built this</p>
              <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-secondary)" }}>
                <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span>
              </button>
            </div>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              I&apos;ve grown a tutoring business for over ten years — and learned a ton the hard way. Soon I&apos;ll share free
              lessons from building software and scalable systems, and the vision to make Survive the national brand for
              acing weed-out courses.
            </p>
            <input
              autoFocus
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("open"); }}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              type="email" inputMode="email" autoComplete="email" placeholder="you@email.com"
              className="mt-3 w-full rounded-xl px-3 outline-none"
              style={{ fontSize: 16, minHeight: 46, background: "var(--bg-input)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
            />
            {state === "error" && <p className="mt-2 text-[13px]" style={{ color: "#F3C6CC" }}>That didn&apos;t send — try again in a moment.</p>}
            <button
              onClick={() => void send()}
              disabled={!ok || state === "busy"}
              className="mt-3 w-full rounded-xl text-[14px] font-black disabled:opacity-45"
              style={{ minHeight: 46, background: "var(--accent)", color: "#0B1220" }}
            >
              {state === "busy" ? "Sending…" : "Send it to me →"}
            </button>
          </>
        )}
        {/* The memorial — quietly set apart at the bottom of the panel; its only home now. */}
        <p className="mt-4 border-t pt-3 text-center text-[13px] italic" style={{ borderColor: "var(--border-subtle)", color: "var(--text-tertiary)", letterSpacing: "0.01em" }}>
          In memory of Ben Ingram.
        </p>
      </div>
    </div>
  );
}
