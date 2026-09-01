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
import { Mail, Phone } from "lucide-react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { FitWordmark } from "@/components/site/SiteHeader";
import { submitNotify } from "@/lib/syllabus.functions";

const PHONE = "(662) 565-8818";
const TEL = "+16625658818";
export const EMAIL = "lee@surviveaccounting.com";

/** GMAIL COMPOSE, not mailto: (p3). A bare mailto: handed off to whatever mail client iOS had
 *  registered — often the wrong one, or nothing. This opens Gmail's web composer directly, which
 *  is where Lee actually reads mail. External web URL → open in a new tab. */
export function gmailComposeHref(to: string, subject?: string, body?: string): string {
  const p = new URLSearchParams({ view: "cm", fs: "1", to });
  if (subject) p.set("su", subject);
  if (body) p.set("body", body);
  return `https://mail.google.com/mail/?${p.toString()}`;
}

type Col = { title: string; links: Array<{ label: string; href?: string; onClick?: () => void; icon?: React.ReactNode; external?: boolean }> };

export function Footer({ onLanding = false }: { onLanding?: boolean } = {}) {
  // Same-page anchors only where those sections exist; absolute everywhere else.
  const base = onLanding ? "" : "/";
  const [founder, setFounder] = useState(false);
  // The council pages are being rebuilt, so the four "For <council>" links are not wired to a page
  // yet — clicking one explains that rather than 404ing on an unseeded campus (p3 decision).
  const [maint, setMaint] = useState(false);

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
      // GREEK COUNCILS (rebuilt p3). "Find your chapter" is the one live, arbitrary-campus page
      // (/chapters works for every seeded school). The four "For <council>" pages exist only per
      // seeded (school, council) pair, so until there is a generic council page they open a quiet
      // "under maintenance" note instead of a dead link.
      title: "Greek Councils",
      links: [
        { label: "Find your chapter", href: "/chapters" },
        { label: "For IFC", onClick: () => setMaint(true) },
        { label: "For Panhellenic", onClick: () => setMaint(true) },
        { label: "For NPHC", onClick: () => setMaint(true) },
        { label: "For MGC", onClick: () => setMaint(true) },
      ],
    },
    {
      title: "Help",
      links: [
        { label: `Text Lee ${PHONE}`, href: `sms:${TEL}`, icon: <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden /> },
        { label: EMAIL, href: gmailComposeHref(EMAIL), external: true, icon: <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /> },
      ],
    },
  ];

  const linkCls = "inline-flex items-center gap-1.5 text-left text-[14px] font-semibold transition-colors hover:text-[var(--accent)]";
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
      {/* Four tracks (p3): brand + Students + Greek Councils + Help. On a phone the brand block
          spans the full width and the three link columns fall into a 2-col grid beneath it, so the
          footer stays compact rather than becoming a tall stack. */}
      <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-x-6 gap-y-8 px-5 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-x-8">
        {/* BRAND + COMPANY. One block: mark, promise, a quiet rule, then the company metadata. */}
        <div className="col-span-2 lg:col-span-1">
          <div className="max-w-[180px]"><FitWordmark size={50} style={{ alignItems: "flex-start" }} /></div>
          <p className="mt-2 text-[14px]" style={{ color: "var(--text-secondary)" }}>Cram what&apos;s on your exam.</p>

          <div className="my-4 h-px w-full max-w-[240px]" style={{ background: "var(--border-subtle)" }} />

          <p className={metaCls} style={metaStyle}>
            Created by Lee Ingram{" "}
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>{" "}
            <button type="button" onClick={() => setFounder(true)} className="font-bold underline underline-offset-4 hover:text-[var(--accent)]" style={{ color: "var(--brand-cream)" }}>
              Learn how →
            </button>
          </p>
          <p className={`${metaCls} mt-2`} style={metaStyle}>
            © 2026 Earned Wisdom LLC
            <span aria-hidden className="px-1.5" style={{ opacity: 0.5 }}>·</span>
            <a href="/privacy" className="hover:text-[var(--accent)]" style={{ color: "inherit" }}>Privacy</a>
            <span aria-hidden className="px-1.5" style={{ opacity: 0.5 }}>·</span>
            <a href="/terms" className="hover:text-[var(--accent)]" style={{ color: "inherit" }}>Terms</a>
          </p>
          <p className="mt-3 text-[12.5px] italic" style={{ color: "var(--text-tertiary)" }}>In memory of Ben Ingram.</p>
        </div>

        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="mb-1.5 text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}>{col.title}</p>
            <ul>
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.href ? (
                    <a
                      href={l.href}
                      target={l.external ? "_blank" : undefined}
                      rel={l.external ? "noopener noreferrer" : undefined}
                      className={linkCls}
                      style={linkStyle}
                    >
                      {l.icon}{l.label}
                    </a>
                  ) : (
                    <button type="button" onClick={l.onClick} className={linkCls} style={linkStyle}>{l.icon}{l.label}</button>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {founder && <FounderModal onClose={() => setFounder(false)} />}
      {maint && <MaintenanceModal onClose={() => setMaint(false)} />}
    </footer>
  );
}

/** The council pages are mid-rebuild — a quiet note instead of a dead link (p3). */
function MaintenanceModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center px-4" style={{ background: "rgba(5,8,16,0.72)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Under maintenance">
      <div
        className="w-full max-w-[360px] rounded-2xl p-5 text-center"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", fontFamily: BRAND_SANS }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[16px] font-black" style={{ color: "var(--brand-cream)" }}>Under maintenance</p>
        <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>This feature is currently under maintenance. Check back soon.</p>
        <button onClick={onClose} className="mt-4 w-full rounded-xl text-[14px] font-black" style={{ minHeight: 46, background: "var(--accent)", color: "#0B1220" }}>Got it</button>
      </div>
    </div>
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
