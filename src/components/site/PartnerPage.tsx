// THE PARTNER PAGE SHELL — the marketing shell, reused verbatim.
//
// Navbar, proof row, tutor card, FAQ styling and footer are the SAME components the student pages
// render. A partner page is therefore never a separate microsite: the only thing it owns is the
// middle (hero → actions → overview → toolkit → value), which is where its audience differs.
//
// It is also the boundary that keeps /learn out of the marketing shell: /learn imports none of
// this, and this imports none of /learn.
import { useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { MARKETING_CSS, SocialProofSection, TutorBioModal, TutorCard } from "@/components/site/Marketing";
import { TestimonialsSlider } from "@/components/site/Testimonials";
import { ANIMATED_BOLT_CSS } from "@/components/site/AnimatedBolt";

/** A partner FAQ entry — same card treatment as the student FAQ. */
export type PartnerFaq = { q: string; a: string };

export function PartnerPageShell({ boltVars, children, faqs, faqTitle = "Questions partners ask" }: {
  /** The campus colourway to publish on the page root, when the page belongs to one campus. */
  boltVars?: { c1: string; c2: string } | null;
  children: React.ReactNode;
  faqs: PartnerFaq[];
  faqTitle?: string;
}) {
  useNavyDocument();
  const [bio, setBio] = useState(false);
  return (
    <div
      style={{
        ...frameThemeVars(DEFAULT_FRAME_THEME),
        ...(boltVars ? { ["--sa-bolt-1" as string]: boltVars.c1, ["--sa-bolt-2" as string]: boltVars.c2 } : {}),
        background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY,
        minHeight: "100vh", position: "relative", overflowX: "hidden",
      }}
    >
      <style>{MARKETING_CSS}</style>
      <style>{ANIMATED_BOLT_CSS}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>

      <SiteHeader />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px", width: "100%" }}>
        {children}

        {faqs.length > 0 && (
          <section className="mt-16" style={{ fontFamily: BRAND_SANS }}>
            <h2 className="mb-4 text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{faqTitle}</h2>
            <div className="grid gap-2">
              {faqs.map((f) => <PartnerFaqCard key={f.q} f={f} />)}
            </div>
          </section>
        )}

        {/* THE SAME student proof the landing pages carry. A council chair is being asked to trust
            the same tutor and the same reviews; rebuilding a B2B version of this would be both
            more work and less honest. */}
        <div className="mt-16" id="reviews">
          <SocialProofSection testimonials={<TestimonialsSlider />} tutor={<TutorCard onMore={() => setBio(true)} />} />
        </div>
      </main>

      <div className="mt-16" />
      <Footer />
      {bio && <TutorBioModal onClose={() => setBio(false)} />}
    </div>
  );
}

/** Same card as the student FAQ (surface, border, chevron, a11y semantics) — duplicated only in
 *  the sense that the student list lives in the landing route; the treatment is identical. */
function PartnerFaqCard({ f }: { f: PartnerFaq }) {
  const [open, setOpen] = useState(false);
  const id = `pfaq-${f.q.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40)}`;
  return (
    <div className="rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={id}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left" style={{ minHeight: 52 }}
      >
        <span className="text-[14.5px] font-black" style={{ color: "var(--brand-cream)" }}>{f.q}</span>
        <span aria-hidden className="shrink-0 transition-transform" style={{ color: "var(--accent)", transform: open ? "rotate(180deg)" : "none", fontSize: 12 }}>▾</span>
      </button>
      {open && <p id={id} className="px-4 pb-3.5 text-[14px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.72 }}>{f.a}</p>}
    </div>
  );
}
