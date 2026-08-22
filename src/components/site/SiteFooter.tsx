// THE UNIVERSAL MARKETING FOOTER — one footer for every public page.
//
// MARKETING SHELL ONLY. /learn is an application workspace with its own shell and must never
// render this; the split is enforced by import (nothing under routes/learn* imports this file).
//
// It lives in components/site, NOT in routes/landing, because every marketing page needs it —
// including the partner pages — and a route file importing another route file is exactly the
// shape the TanStack code-splitter has broken here before.
//
// FOUR COLUMNS, by audience rather than by page: brand · students · Greek organizations · help.
// A visitor who is here for one of those three reasons finds their whole world in one column
// instead of scanning a flat list of every link on the site.
//
// CAMPUS-SCOPED DESTINATIONS. "Find your chapter" and "Become a campus rep" carry the campus the
// site already knows (one source: campus context), so a visitor we have placed is never sent back
// to a picker they already answered.
import { useEffect, useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { FitWordmark } from "@/components/site/SiteHeader";
import { NotListedForm } from "@/components/site/NotListedForm";
import { useCampus } from "@/lib/campus-context";
import { submitNotify } from "@/lib/syllabus.functions";

const PHONE = "(662) 565-8818";
const TEL = "+16625658818";

/** Anchors are same-page on the landing layout (home, campus, chapter pages) and absolute
 *  everywhere else — /expand and the partner pages do not have #exam1 or #reviews on them. */
type Col = { title: string; links: Array<{ label: string; href?: string; onClick?: () => void }> };

export function Footer({ onLanding = false }: { onLanding?: boolean } = {}) {
  const campus = useCampus();
  const slug = campus.school?.slug ?? null;
  const base = onLanding ? "" : "/";
  // "Add your school" / "Add your Greek org" open the EXISTING write-in form rather than a second
  // copy of it — same component, same table, same person reading the results.
  const [addForm, setAddForm] = useState<null | "school" | "chapter">(null);
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
      ],
    },
    {
      title: "Greek organizations",
      links: [
        { label: "Find your chapter", href: slug ? `/chapters?school=${slug}` : "/chapters" },
        { label: "Set up chapter access", href: "/chapters" },
        { label: "For campus councils", href: "/partners/campus-councils" },
        { label: "For national organizations", href: "/partners/national-organizations" },
        { label: "Become a campus rep", href: slug ? `/${slug}/rep` : "/rep" },
      ],
    },
    {
      title: "Help",
      links: [
        { label: `Text Lee ${PHONE}`, href: `sms:${TEL}` },
        { label: "Add your school", onClick: () => setAddForm("school") },
        { label: "Add your Greek org", onClick: () => setAddForm("chapter") },
        { label: "Contact", href: `${base}#contact` },
      ],
    },
  ];

  const linkCls = "inline-flex items-center text-left text-[14px] font-semibold transition-colors hover:text-[var(--accent)]";
  const linkStyle = { color: "var(--brand-cream)", minHeight: 38 } as const;

  return (
    <footer id="site-footer" className="border-t pt-10 pb-6" style={{ borderColor: "var(--border-default)", background: "var(--bg-nav)", fontFamily: BRAND_SANS }}>
      {/* TWO COLUMNS ON A PHONE, not one. Stacking all four made a 950px footer — longer than
          the viewport and the exact "giant tall footer" the brief rules out. */}
      <div className="mx-auto grid max-w-[1040px] grid-cols-2 gap-x-5 gap-y-7 px-5 lg:grid-cols-4 lg:gap-8">
        {/* COLUMN 1 — brand. Quiet: the mark and the promise, nothing to click. */}
        <div className="col-span-2 lg:col-span-1">
          {/* Capped: FitWordmark scales to its container, and a full-width column on a phone made
              the mark twice the size of the one in the navbar above it. */}
          <div className="max-w-[190px]"><FitWordmark size={54} style={{ alignItems: "flex-start" }} /></div>
          <p className="mt-2 text-[14px]" style={{ color: "var(--text-muted)" }}>Cram what&apos;s on your exam.</p>
        </div>

        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="mb-2 text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}>{col.title}</p>
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

      {/* The write-in opens in place, under the columns, rather than as a modal over the page —
          it is the last thing on the page and there is nothing behind it worth preserving. */}
      {addForm && (
        <div className="mx-auto mt-6 max-w-[420px] px-5">
          <NotListedForm
            kind={addForm}
            askChapter={addForm === "chapter"}
            title={addForm === "school" ? "Which school should I add?" : "Which Greek org should I add?"}
            onClose={() => setAddForm(null)}
          />
        </div>
      )}

      {/* BOTTOM — metadata, the founder line, and the memorial last. */}
      <div className="mx-auto mt-8 max-w-[1040px] border-t px-5 pt-5" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          <span>surviveaccounting.com</span>
          <a href="/privacy" className="hover:text-[var(--accent)]" style={{ color: "inherit" }}>Privacy</a>
          <a href="/terms" className="hover:text-[var(--accent)]" style={{ color: "inherit" }}>Terms</a>
          <span>© 2026 Earned Wisdom LLC</span>
        </div>
        <p className="mt-3 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          Created entirely by Lee Ingram.{" "}
          <button type="button" onClick={() => setFounder(true)} className="font-bold underline underline-offset-4 hover:text-[var(--accent)]" style={{ color: "var(--brand-cream)" }}>
            Learn how →
          </button>
        </p>
        {/* The memorial is the last line on the page and carries no dates — see the brief. */}
        <p className="mt-3 text-center text-[13px] italic" style={{ color: "var(--text-tertiary)", letterSpacing: "0.01em" }}>In memory of Ben Ingram.</p>
      </div>

      {founder && <FounderModal onClose={() => setFounder(false)} />}
    </footer>
  );
}

/** "HOW I BUILT SURVIVE" — a secondary, one-field capture for people who came for the build story
 *  rather than the product. It writes through submitNotify, the same private table every other
 *  landing capture uses, tagged with its own topic so these are separable from exam waitlists.
 *  Deliberately quiet: this must never compete with the student CTA. */
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
            <p className="mt-1 text-[14px]" style={{ color: "var(--text-muted)" }}>I&apos;ll send the story, the stack and what I&apos;d do differently.</p>
            <button onClick={onClose} className="mt-4 w-full rounded-xl text-[14px] font-black" style={{ minHeight: 46, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Close</button>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-start justify-between gap-3">
              <p className="text-[16px] font-black" style={{ color: "var(--brand-cream)" }}>How I built Survive</p>
              <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-muted)" }}>
                <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span>
              </button>
            </div>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              I built Survive Accounting as a solo founder using AI tools. Want the story, stack, and lessons learned?
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
    </div>
  );
}
