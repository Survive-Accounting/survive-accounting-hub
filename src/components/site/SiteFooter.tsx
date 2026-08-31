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
// AND WHY THE LEARN-HOW PANEL IS A PORTAL (2026-08-31) — the bug that line caused.
//
// `position: relative; z-index: 1` makes this footer a STACKING CONTEXT. Everything inside it,
// however high its z-index, is confined to the footer's own level of 1. The Learn-How panel asked
// for z-index 300 and got "300, but inside a box that ranks 1" — while SiteHeader is a sticky
// z-index:200 element in the ROOT context, which outranks it. Measured on a 390x844 viewport with
// the panel open: elementFromPoint(195, 28) returned the navbar wordmark, not the panel's
// backdrop. The dim never covered the top 55px, the navbar stayed bright and tappable over the
// dialog, and on a short viewport (landscape, or an open keyboard) the bar covered the panel's
// own header — its close button included.
//
// A portal to document.body takes the panel OUT of this stacking context entirely, which is the
// only real fix; raising z-index here cannot work, because the number is not the problem.
//
// LAYOUT (rebuilt 2026-08-31): compact. Brand + one metadata line, then the link columns, then a
// single legal line. The standalone domain line is gone — the visitor is ON the domain — and the
// memorial has come back out of the modal to sit under the legal row where it belongs.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Mail, Phone } from "lucide-react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { FitWordmark } from "@/components/site/SiteHeader";
import { EMAIL_SUBJECT, LEE_EMAIL, emailLinkProps } from "@/lib/email-link";
import { submitNotify } from "@/lib/syllabus.functions";
import { useScrollLock } from "@/lib/use-scroll-lock";

const PHONE = "(662) 565-8818";
const TEL = "+16625658818";
/** Re-exported: call sites imported EMAIL from here before the helper existed. */
export const EMAIL = LEE_EMAIL;

/** A footer column. `icon` renders before the label — Help's rows carry one, Students' do not.
 *
 *  ── THE THIRD COLUMN ───────────────────────────────────────────────────────────────────────
 *  A GREEKS column is coming. Adding it must be a DATA change: push a third object into
 *  `columns` below and the grid widens on its own, because the template is derived from
 *  `columns.length` rather than written out as `lg:grid-cols-[1.5fr_1fr_1fr]`. Nothing about the
 *  layout is hard-coded to two. */
type Col = {
  title: string;
  links: Array<{
    label: string;
    href?: string;
    onClick?: () => void;
    icon?: React.ReactNode;
    /** External (the Gmail composer) — needs target/rel, which a same-tab anchor must not carry. */
    external?: boolean;
  }>;
};

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
      title: "Help",
      links: [
        { label: "Text Lee", href: `sms:${TEL}`, icon: <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden /> },
        // NOT mailto: — see lib/email-link.ts. On a phone with no mail handler registered,
        // mailto: opened whatever claimed the scheme (inDrive, in the reported case).
        { label: LEE_EMAIL, ...emailLinkProps(EMAIL_SUBJECT.footer), external: true, icon: <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /> },
      ],
    },
  ];

  // 2026 is the floor, not the value: the spec requires 2026, and a hardcoded year silently goes
  // stale the moment the calendar turns.
  const year = Math.max(2026, new Date().getFullYear());

  const linkCls = "inline-flex items-center gap-1.5 text-left text-[13px] font-semibold transition-colors hover:text-[var(--accent)]";
  const linkStyle = { color: "var(--brand-cream)", minHeight: 26 } as const;
  const metaStyle = { color: "var(--text-secondary)" } as const;

  return (
    <footer
      id="site-footer"
      className="border-t pt-3 pb-3"
      // relative + z-1: see the note at the top of this file.
      style={{ position: "relative", zIndex: 1, borderColor: "var(--border-default)", background: "var(--bg-nav)", fontFamily: BRAND_SANS }}
    >
      <div className="mx-auto max-w-[1040px] px-5">
        {/* BRAND — mark, promise, rule, and the one line of attribution. */}
        <div className="max-w-[120px]"><FitWordmark size={30} style={{ alignItems: "flex-start" }} /></div>
        <p className="mt-0.5 text-[13px]" style={metaStyle}>Cram what&apos;s on your exam.</p>

        <div className="my-1.5 h-px w-full max-w-[200px]" style={{ background: "var(--border-subtle)" }} />

        <p className="text-[12.5px]" style={metaStyle}>
          Created by Lee Ingram{" "}
          <span aria-hidden style={{ opacity: 0.5 }}>·</span>{" "}
          <button type="button" onClick={() => setFounder(true)} className="font-bold underline underline-offset-4 hover:text-[var(--accent)]" style={{ color: "var(--brand-cream)" }}>
            Learn how →
          </button>
        </p>

        {/* THE LINK COLUMNS. Template derived from columns.length — adding GREEKS is a data
            change, not a layout rewrite. Two columns fit a 390px phone side by side; three will
            wrap to two rows there and sit in one row from 640px up, which is why the mobile
            template caps at 2 and the sm: one takes the full count. */}
        <div
          className="mt-2.5 grid gap-x-4 gap-y-4"
          style={{ gridTemplateColumns: `repeat(${Math.min(columns.length, 2)}, minmax(0, 1fr))` }}
        >
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title} style={{ gridColumn: "span 1" }}>
              <p className="mb-0.5 text-[10px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}>{col.title}</p>
              <ul>
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href ? (
                      <a
                        href={l.href}
                        className={`${linkCls} max-w-full`}
                        style={linkStyle}
                        {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      >
                        {l.icon}
                        <span className="truncate">{l.label}</span>
                      </a>
                    ) : (
                      <button type="button" onClick={l.onClick} className={linkCls} style={linkStyle}>{l.icon}<span className="truncate">{l.label}</span></button>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* LEGAL — one line. The standalone surveyaccounting.com line that used to sit above this
            is deleted: it named the domain the visitor is already on. */}
        <div className="mt-2.5 border-t pt-2" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="text-[11.5px]" style={metaStyle}>
            © {year} Earned Wisdom LLC
            <span aria-hidden className="px-1.5" style={{ opacity: 0.5 }}>·</span>
            <a href="/privacy" className="hover:text-[var(--accent)]" style={{ color: "inherit" }}>Privacy</a>
            <span aria-hidden className="px-1.5" style={{ opacity: 0.5 }}>·</span>
            <a href="/terms" className="hover:text-[var(--accent)]" style={{ color: "inherit" }}>Terms</a>
          </p>
          {/* The memorial. Quiet, last, and never a marketing element. */}
          <p className="mt-0.5 text-[11.5px] italic" style={{ color: "var(--text-tertiary)" }}>In memory of Ben Ingram.</p>
        </div>
      </div>

      {founder && <FounderModal onClose={() => setFounder(false)} />}
    </footer>
  );
}

/** "HOW I BUILT THIS" — the Learn-How panel: the build story and a quiet one-field capture.
 *  Deliberately quiet: this must never compete with the student CTA.
 *
 *  PORTALLED TO document.body — see the stacking-context note at the top of this file. It is the
 *  fix for the panel rendering under the navbar, and it is not optional: any overlay rendered as
 *  a descendant of this footer inherits the same ceiling. */
function FounderModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"open" | "busy" | "done" | "error">("open");
  const [mounted, setMounted] = useState(false);
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  // createPortal needs a real document. On the server there isn't one, and rendering the panel
  // into the footer "just for SSR" would reintroduce the exact bug — so it renders nothing until
  // the client has mounted. Nobody can have clicked the button before then anyway.
  useEffect(() => setMounted(true), []);

  // SCROLL LOCK — one implementation for every overlay on the site. See lib/use-scroll-lock.ts
  // for why `overflow: hidden` on <html> is a no-op in iOS Safari and what replaces it.
  useScrollLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      // items-end on a phone, centred from 640px up — the same bottom-sheet-on-mobile shape every
      // overlay in this pass uses, so "where does a panel come from" has one answer.
      className="fixed inset-0 z-[300] flex items-end justify-center overflow-y-auto sm:items-center sm:px-4"
      style={{ background: "rgba(5,8,16,0.72)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="How I built Survive"
    >
      <div
        className="w-full max-w-[400px] overflow-y-auto rounded-t-2xl p-5 text-left sm:rounded-2xl"
        style={{
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-default)",
          boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)",
          fontFamily: BRAND_SANS,
          // NEVER TALLER THAN THE SCREEN. Without this the panel is clipped with no way to
          // scroll it the moment the viewport is short — a landscape phone, or an open keyboard.
          maxHeight: "min(88dvh, 88vh)",
          paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))",
        }}
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
              <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-secondary)" }}>
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
      </div>
    </div>,
    document.body,
  );

  async function send() {
    if (!ok || state === "busy") return;
    setState("busy");
    try {
      await submitNotify({ data: { contact: email.trim(), topic: "How I built Survive" } });
      setState("done");
    } catch { setState("error"); }
  }
}
