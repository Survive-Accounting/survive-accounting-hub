// THE MARKETING TEMPLATE — one configurable set of sections shared by every marketing page:
// general homepage, campus/course pages, and Greek chapter pages.
//
// Before this file, those three surfaces had three separately designed heroes (Hero in
// landing.tsx, CampusTop, ChapterTop) drifting apart one copy tweak at a time. Now the page KIND
// plus a handful of context fields (course code, school short name, Greek letters, claim state)
// select copy and CTAs inside ONE structure: navbar → hero → CTAs → trust chips → player →
// value strip → social proof (testimonials + tutor) → utility links → footer.
//
// DELIBERATELY NOT IMPORTED FROM ./routes/landing — landing imports THIS module, and a cycle
// through a route file is exactly what trips the TanStack code-splitter. Anything landing owns
// (TestimonialsSlider, the player) arrives through slots/props instead.
import { useEffect, useState } from "react";
import { ArrowLeftRight, ClipboardCheck, Play, Target, MessageCircle } from "lucide-react";

import { BRAND_BLUE, BRAND_DISPLAY, BRAND_RED, BRAND_SANS } from "@/components/canvas/brand";
import { AnimatedCampusBolt, type BoltCampus } from "@/components/site/bolt";
import { CompactLockup } from "@/components/site/SiteHeader";
import { NotListedForm } from "@/components/site/NotListedForm";
import { nbspCode } from "@/lib/course-code";
import { scrollToId } from "@/lib/ui-scroll";
import { useDismiss } from "@/lib/use-dismiss";

/** The greek slice of marketing context. Claim state comes from getGoChapter — never hardcoded. */
export interface GreekMarketing {
  orgName: string;
  /** Display letters ("ΑΤΩ") — roster letters preferred, shorthand fallback resolved upstream. */
  letters: string;
  claimed: boolean;
  /** The chapter-access section's anchor id — "Set up ΑΤΩ access →" scrolls here. */
  accessAnchor: string;
}

/** The hero-page id the mobile sticky CTA bar observes (was CHAPTER_HERO_ID on ChapterTop). */
export const MARKETING_HERO_ID = "marketing-hero";

// ── HERO ──────────────────────────────────────────────────────────────────────────────────────
/** One hero, three configurations. Copy is selected by context, never by page-specific markup:
 *
 *    general:  "Intro accounting is where GPAs quietly slip."
 *    campus:   "{code} at {school} is where GPAs quietly slip."
 *    greek:    eyebrow "{ORG} • {SCHOOL}" over the same campus headline.
 *
 *  Under the headline, the universal promise ("Practice what gets tested. Score higher.") carries
 *  MORE weight than the built-for line beneath it — benefit first, description second, never one
 *  long grey paragraph.
 *
 *  MOBILE ORDER: headline → promise → built-for → CTAs → trust chips → bolt. The bolt is
 *  branding, not content — it comes from natural DOM order (no order-first), so it can never
 *  push the CTA out of the first viewport. Desktop keeps it as the right column. */
export function MarketingHero({ kind, code, schoolShort, greek, onStart, onBoltPick, onChangeSchool, secondaryHref, onSecondary, secondaryLabel, showSecondary = true, onOpenBio, courtesy, rotationCampuses, campusBolt }: {
  kind: "general" | "campus" | "greek";
  /** Verified course code or null — a null degrades copy, never invents a code. */
  code: string | null;
  schoolShort: string | null;
  greek?: GreekMarketing;
  /** GENERAL pages only: every school, ALREADY IN PLAY ORDER (landing runs orderCampuses over
   *  CURATED_CAMPUS_ORDER). Without it the bolt wears the plain brand red/blue. Campus/greek pages
   *  ignore this — they are pinned to their own school. */
  rotationCampuses?: BoltCampus[];
  /** CAMPUS/GREEK pages: that campus's own colours, as literal hex.
   *
   *  It used to be "var(--sa-bolt-1)" / "var(--sa-bolt-2)", read off the page root. The bolt has to
   *  MEASURE the secondary now — a white or silver secondary is swapped for the school's accent —
   *  and a CSS variable is not a colour until the browser resolves it, which is after first paint.
   *  Passing the hex means a campus page paints the right colours on the very first frame, from
   *  the same table the page root sets those variables from. */
  campusBolt?: { c1: string; c2: string; accent?: string | null } | null;
  /** GENERAL pages: pressing the bolt while it shows a school means "that school" — the page
   *  navigates to that campus with the player preset, instead of merely scrolling. */
  onBoltPick?: (stopId: string) => void;
  /** CAMPUS + GREEK pages: the quiet way out of a campus the visitor is not at. Rendered under
   *  the bolt plate ("for ACCY 201 • OLE MISS"), where the claim it corrects is made — and
   *  deliberately small, because it must never compete with Cram Exam 1 Free. */
  onChangeSchool?: () => void;
  /** Primary CTA + "Built for exam week" chip target — scrolls to the player (and tags Greek
   *  members upstream, where attribution belongs). */
  onStart: () => void;
  /** Secondary CTA: href for navigation ("/chapters?school=…"), onClick for scroll (greek). */
  secondaryHref?: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
  showSecondary?: boolean;
  onOpenBio: () => void;
  /** CourtesyLine slot on greek pages — "courtesy of {chapter}" for seated members. */
  courtesy?: React.ReactNode;
}) {
  // General pages FLOW through every school in the curated order (the breadth is the message),
  // falling back to the brand red/blue when no list is supplied. Campus and greek pages hand in one
  // campus and the conveyor runs on it alone — same component, same motion, one colourway.
  const campuses: BoltCampus[] = kind === "general"
    ? (rotationCampuses?.length ? rotationCampuses : [{ id: "brand", primary: BRAND_RED, secondary: BRAND_BLUE }])
    : [{
        id: schoolShort ?? "campus",
        name: schoolShort ?? undefined,
        code,
        primary: campusBolt?.c1 ?? BRAND_RED,
        secondary: campusBolt?.c2 ?? BRAND_BLUE,
        accent: campusBolt?.accent ?? null,
      }];

  const headline = code && schoolShort
    ? <><span style={{ color: "var(--accent)" }}>{nbspCode(code)}</span> at {schoolShort} is where GPAs quietly slip.</>
    : <>Intro accounting is where GPAs quietly slip.</>;

  // Campus pages keep the sharper personalised claim; the generic page sells the outcome.
  const supporting = code
    ? `Cram videos + practice exams built for ${nbspCode(code)}.`
    : "Cram videos + practice exams built for crushing your first accounting course.";

  return (
    <section id={MARKETING_HERO_ID} className="sa-hero3 grid items-center gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-14" style={{ fontFamily: BRAND_SANS }}>
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        {greek && (
          <p className="mb-3 text-[12px] font-black uppercase tracking-[0.13em]" style={{ color: "var(--text-muted)" }}>
            {greek.orgName} <span aria-hidden style={{ opacity: 0.5 }}>•</span> {schoolShort}
          </p>
        )}

        <h1 className="text-[28px] font-black leading-[1.1] sm:text-[38px] lg:text-[44px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>
          {headline}
        </h1>

        {/* THE PROMISE — the benefit line, weighted ABOVE the description. */}
        <p className="mt-5 text-[19px] font-extrabold leading-snug sm:text-[22px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Practice what gets tested. Score higher.
        </p>
        <p className="mt-2 max-w-[24ch] text-[15px] leading-snug sm:max-w-[42ch] sm:text-[16.5px]" style={{ color: "var(--brand-cream)", opacity: 0.66 }}>
          {supporting}
        </p>

        <div className="mt-7 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row lg:justify-start">
          <button
            type="button"
            onClick={onStart}
            className="w-full rounded-xl px-7 text-[16px] font-black transition-transform hover:scale-[1.02] focus-visible:ring-2 sm:w-auto"
            style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)" }}
          >
            Start Exam 1 Free ⚡
          </button>
          {showSecondary && secondaryLabel && (
            secondaryHref ? (
              <a
                href={secondaryHref}
                className="flex w-full items-center justify-center rounded-xl px-6 text-[15px] font-bold focus-visible:ring-2 sm:w-auto"
                style={{ minHeight: 54, color: "var(--brand-cream)", background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
              >
                {secondaryLabel}
              </a>
            ) : (
              <button
                type="button"
                onClick={onSecondary}
                className="w-full rounded-xl px-6 text-[15px] font-bold focus-visible:ring-2 sm:w-auto"
                style={{ minHeight: 54, color: "var(--brand-cream)", background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
              >
                {secondaryLabel}
              </button>
            )
          )}
        </div>

        {/* Exec login is a UTILITY, never a hero CTA — claimed chapters only. */}
        {greek?.claimed && (
          <a href="/chapters/dashboard" className="mt-2.5 text-[14px] underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
            Chapter exec? Log in →
          </a>
        )}

        <TrustChips onBio={onOpenBio} onReviews={() => scrollToId("reviews")} onPlayer={onStart} />

        {courtesy}
      </div>

      {/* THE BOLT — after the copy in DOM order, so mobile reads headline→CTA→chips first. */}
      <div className="flex flex-col items-center lg:items-end">
        {/* ONE COLUMN FOR THE BOLT AND ITS CONTROL. sa-hero3-paper carries the bolt's width AND a
            6rem right margin on desktop; when that class sat on the bolt itself, `lg:items-end`
            right-aligned the bolt's MARGIN box, so anything rendered under it (the change-school
            control) landed 96px to the right of the artwork and read as unrelated furniture. The
            class belongs on the column; everything inside it is centred on the bolt. */}
        <div className="sa-hero3-paper flex flex-col">
          <AnimatedCampusBolt
            campuses={campuses}
            onActivate={(c) => (kind === "general" && onBoltPick && c.id !== "brand" ? onBoltPick(c.id) : onStart())}
            ariaLabel={code ? `Start studying ${code}` : "Start Exam 1 Free"}
            hint={code ? `Open ${code} ↓` : "Start studying ↓"}
          />
          {/* Under the plate, not beside the CTA: this corrects "OLE MISS", so it belongs where
              that word is. On a chapter page it leaves the chapter route entirely rather than
              repainting this page as another campus — see landing.tsx.
              AN ICON, NOT A SENTENCE: "Change school →" was a line of utility copy sitting directly
              under the artwork, and it read louder than the campus name it exists to correct. A swap
              arrow says the same thing quietly. Deliberately NOT an ✕ — that promises "close" or
              "remove", and this neither closes nor removes anything; it exchanges one school for
              another. The label survives for screen readers and as a hover/focus tooltip. */}
          {kind !== "general" && onChangeSchool && (
            <button
              type="button"
              onClick={onChangeSchool}
              aria-label="Change school"
              title="Change school"
              className="sa-hero-swap mt-1 inline-flex items-center justify-center self-center rounded-full"
              style={{ color: "var(--text-muted)", width: 44, height: 44 }}
            >
              <ArrowLeftRight size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ── TRUST CHIPS ───────────────────────────────────────────────────────────────────────────────
/** Three small credibility chips, whole-chip clickable — no visible "→ Reviews" explainers.
 *  They are trust badges, not CTAs: quiet by default, a shade brighter on hover, clear focus. */
export function TrustChips({ onBio, onReviews, onPlayer }: { onBio: () => void; onReviews: () => void; onPlayer: () => void }) {
  const CHIPS: Array<{ label: string; onClick: () => void }> = [
    { label: "Created by a pro tutor", onClick: onBio },
    { label: "1,000+ students helped", onClick: onReviews },
    { label: "Built for exam week", onClick: onPlayer },
  ];
  // A PROOF STRIP, NOT A THIRD ROW OF BUTTONS. One hierarchy step below both hero CTAs: smaller
  // type, thinner border, muted fill, no lift, default cursor. They stay activatable (each one
  // jumps to the section that backs the claim) and keyboard-focusable, and the 44px touch target
  // is restored by an invisible ::after rather than by a 44px-tall pill — see MARKETING_CSS.
  return (
    <div className="sa-proof-row mt-5 flex flex-wrap items-center justify-center gap-2 lg:flex-nowrap lg:justify-start">
      {CHIPS.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={c.onClick}
          className="sa-trust-chip relative rounded-full text-[13px] font-semibold focus-visible:ring-2"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", height: 33, paddingInline: 11, whiteSpace: "nowrap" }}
        >
          <span aria-hidden className="sa-proof-tick">✓</span>
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** Chip hover/focus styling — subtle brightness + a hair of lift, quick, reduced-motion safe. */
export const MARKETING_CSS = `
/* CHANGE-SCHOOL SWAP. A 44px touch target around a 16px glyph, so it is quiet to look at and still
   comfortably tappable on a phone. It brightens rather than growing — nothing under the bolt should
   move on hover except the bolt. */
.sa-hero-swap { background: none; border: 0; padding: 0; cursor: pointer; opacity: 0.75; transition: color 140ms, opacity 140ms, background-color 140ms; }
.sa-hero-swap:hover { color: var(--brand-cream); opacity: 1; background: rgba(245,239,230,0.08); }
.sa-hero-swap:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; color: var(--brand-cream); opacity: 1; }

/* PROOF STRIP. Quieter than every CTA: no lift, no glow, default cursor, muted text. The hover
   is a bare half-step of contrast so the badge is not dead to the pointer, nothing more. */
.sa-trust-chip { display: inline-flex; align-items: center; gap: 5px; cursor: default; transition: color 140ms, border-color 140ms; }
.sa-trust-chip:hover { color: var(--brand-cream); border-color: var(--border-default); }
.sa-trust-chip:focus-visible { color: var(--brand-cream); outline: 2px solid var(--accent); outline-offset: 2px; }
/* Touch target stays 44px tall while the pill reads 33px — the badges are still real controls. */
.sa-trust-chip::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 44px; transform: translateY(-50%); }
/* The tick is a quiet mark, not a success badge: brand amber at half strength, one step down in size. */
.sa-proof-tick { font-size: 11px; line-height: 1; color: var(--accent); opacity: 0.65; }
/* At the narrowest desktop the three badges are ~6px wider than the hero column; the type drops a
   half-step there rather than wrapping to a second line. */
@media (min-width: 1024px) and (max-width: 1150px) {
  .sa-proof-row .sa-trust-chip { font-size: 12px; padding-inline: 9px; }
}
/* Phone: 2 + 1 rather than three stacked lines. At 13px the first two badges are 368px wide in a
   350px column, so the half-step down is what buys the pairing — still a readable badge size. */
@media (max-width: 639px) {
  .sa-proof-row .sa-trust-chip { font-size: 12px; padding-inline: 9px; }
}
.sa-sticky-footer { transition: transform 320ms cubic-bezier(.2,.8,.2,1); }
@media (prefers-reduced-motion: reduce) { .sa-sticky-footer { transition: none; } }
@media (prefers-reduced-motion: reduce) { .sa-trust-chip, .sa-trust-chip:hover { transform: none; } }
`;

// ── FEATURE VALUE STRIP ───────────────────────────────────────────────────────────────────────
/** Three scannable value cards, AFTER the player (the product proves the claims; the strip
 *  reinforces, it doesn't preface). Card 3 is context-dynamic. */
export function FeatureValueStrip({ code, onSyllabus }: { code: string | null; onSyllabus?: () => void }) {
  void code; // card 3 is course-generic launch copy now; the syllabus action carries the tailoring
  const CARDS = [
    { icon: Play, title: "Quick cram videos", body: "Nothing like your lecture videos." },
    { icon: ClipboardCheck, title: "Practice exams", body: "See the problems that matter." },
  ];
  const card = "rounded-2xl p-4";
  const cardStyle = { background: "var(--bg-surface)", border: "1px solid var(--border-default)" } as const;
  return (
    <section className="mx-auto grid w-full max-w-[880px] gap-3 px-1 py-10 sm:grid-cols-3" style={{ fontFamily: BRAND_SANS }}>
      {CARDS.map(({ icon: Icon, title, body }) => (
        <div key={title} className={card} style={cardStyle}>
          <Icon className="h-5 w-5" style={{ color: "var(--accent)" }} aria-hidden />
          <p className="mt-2.5 text-[15px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{title}</p>
          <p className="mt-1 text-[14px] leading-snug" style={{ color: "var(--brand-cream)", opacity: 0.65 }}>{body}</p>
        </div>
      ))}
      {/* Card 3 is the ONE actionable card — it opens the existing syllabus flow. */}
      <button type="button" onClick={onSyllabus} className={`${card} text-left transition-transform hover:scale-[1.01] focus-visible:ring-2`} style={cardStyle}>
        <Target className="h-5 w-5" style={{ color: "var(--accent)" }} aria-hidden />
        <p className="mt-2.5 text-[15px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Built around your course</p>
        <p className="mt-1 text-[14px] leading-snug" style={{ color: "var(--accent)" }}>Send your syllabus. I&apos;ll match it →</p>
      </button>
    </section>
  );
}

// ── SOCIAL PROOF: testimonials + tutor in one row ────────────────────────────────────────────
/** Desktop: ~60/40 row — reviews left, tutor card right. Mobile: stacked, reviews first.
 *  Content arrives as slots so this module never imports from the landing route. */
export function SocialProofSection({ testimonials, tutor }: { testimonials: React.ReactNode; tutor: React.ReactNode }) {
  // BOTH headings are rendered HERE, on one baseline — the column contents start level, which
  // is what makes the row read as one section rather than two stacked boxes.
  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mb-4 text-[20px] font-extrabold" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>{children}</h2>
  );
  return (
    <section className="mx-auto grid w-full max-w-[1040px] items-start gap-8 lg:grid-cols-[3fr_2fr]" style={{ fontFamily: BRAND_SANS }}>
      <div className="min-w-0">
        <H>What students are saying</H>
        {testimonials}
      </div>
      <div className="min-w-0" id="lee">
        <H>Meet your tutor</H>
        {tutor}
      </div>
    </section>
  );
}

// ── TUTOR CARD + FULL BIO ────────────────────────────────────────────────────────────────────
// Lee's real photo — 4:5 crop centered on the face (moved here from landing.tsx unchanged; the
// old cream SVG portrait stays retired for video frames).
export function LeePortrait({ width = 200, caption = true }: { width?: number; caption?: boolean }) {
  return (
    <figure className="mx-auto sm:mx-0" style={{ width, transform: "rotate(1.5deg)" }}>
      <div style={{ width, aspectRatio: "4 / 5", borderRadius: 16, border: "3px solid var(--brand-cream)", overflow: "hidden" }}>
        <img
          src="/lee-beach.webp" alt="Lee Ingram"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%", transform: "scale(1.42)", transformOrigin: "50% 22%", display: "block" }}
        />
      </div>
      {caption && (
        <figcaption className="mt-3 text-center" style={{ fontFamily: BRAND_SANS }}>
          <span className="block" style={{ fontWeight: 600, fontSize: 16, color: "var(--brand-cream)" }}>Lee Ingram</span>
        </figcaption>
      )}
    </figure>
  );
}

/** The COMPACT tutor card — facts only, one door to the full bio. Sits beside the reviews. */
export function TutorCard({ onMore }: { onMore: () => void }) {
  return (
    <div className="rounded-2xl p-5 sm:p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
      <div className="flex items-start gap-5">
        <LeePortrait width={112} caption={false} />
        <div className="min-w-0" style={{ color: "var(--brand-cream)" }}>
          <p className="text-[16px] font-bold">Lee Ingram</p>
          <p className="mt-1 text-[14px] leading-snug" style={{ opacity: 0.75 }}>Two accounting degrees</p>
          <p className="mt-1 text-[14px] leading-snug" style={{ opacity: 0.75 }}>Tutor since 2015</p>
          <p className="mt-1 text-[14px] leading-snug" style={{ opacity: 0.75 }}>1,000+ students tutored</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onMore}
        className="mt-4 inline-flex items-center text-[14px] font-bold focus-visible:ring-2"
        style={{ color: "var(--accent)", minHeight: 44 }}
      >
        Learn more about Lee →
      </button>
    </div>
  );
}

/** The full bio, verbatim, in a modal — a chip or "Learn more" opens it; nothing navigates away. */
export function TutorBioModal({ onClose }: { onClose: () => void }) {
  const panelRef = useDismiss<HTMLDivElement>(onClose, { enabled: true });
  // Modal is appended late — lock page scroll on the documentElement (body is a no-op under
  // html.sa-navy) and restore on close.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => { el.style.overflow = prev; };
  }, []);
  const P = ({ children }: { children: React.ReactNode }) => (
    <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: "var(--brand-cream)", opacity: 0.9 }}>{children}</p>
  );
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center overflow-y-auto p-4" style={{ background: "rgba(5,8,16,0.72)" }} role="dialog" aria-modal="true" aria-label="About Lee Ingram">
      <div ref={panelRef} className="relative w-full max-w-[560px] rounded-3xl p-6 sm:p-8" style={{ background: "var(--bg-page)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS, boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2"
          style={{ width: 40, height: 40, color: "var(--text-muted)" }}
        >
          <span aria-hidden style={{ fontSize: 20 }}>×</span>
        </button>
        <div className="flex items-start gap-5">
          <LeePortrait width={104} caption={false} />
          <h2 className="text-[24px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", marginTop: 8 }}>
            Hey, I&apos;m Lee.
          </h2>
        </div>
        {/* PHOTO ROW — today just the portrait above; when live-music shots exist, add more
            <img>s beside the portrait and this strip becomes a small gallery without a redesign. */}
        <div className="mt-2">
          <P>I&apos;ve been helping students get through Intro Accounting since 2015 and have worked with more than 1,000 students.</P>
          <P>I built Survive because accounting exams are a lot easier when you&apos;ve already practiced the kinds of problems you&apos;re about to see.</P>
          <P>Outside Survive, I&apos;m usually traveling, seeing live music, playing live music, or working on Survive.</P>
        </div>
      </div>
    </div>
  );
}

/** FLOATING CONTACT — "Questions? Text Lee". One quiet pill, bottom-right, replacing the old
 *  full-width sticky bar (which duplicated the navbar). Hidden until the hero scrolls away and
 *  when the real footer is on screen — same show logic the old bar used, kept because it stops
 *  the pill from stacking on the footer's own Text-Lee link. */
export function FloatingContact({ heroId, tel, phone, onText, onEmail }: { heroId: string; tel: string; phone: string; onText?: () => void; onEmail?: () => void }) {
  const [pastHero, setPastHero] = useState(false);
  const [footerSeen, setFooterSeen] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const hero = document.getElementById(heroId);
    const footer = document.getElementById("site-footer");
    const ios: IntersectionObserver[] = [];
    if (hero) { const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting), { threshold: 0 }); io.observe(hero); ios.push(io); }
    if (footer) { const io = new IntersectionObserver(([e]) => setFooterSeen(e.isIntersecting), { threshold: 0 }); io.observe(footer); ios.push(io); }
    return () => ios.forEach((io) => io.disconnect());
  }, [heroId]);
  const show = pastHero && !footerSeen;
  void onEmail;
  return (
    <a
      href={`sms:${tel}`}
      onClick={onText}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      className="fixed z-[190] inline-flex items-center gap-2 rounded-full px-4 shadow-lg transition-all"
      style={{
        // Mobile: sit ABOVE the practice stage's fixed Next bar (~64px tall) so answers and the
        // primary control stay clear. Desktop: classic bottom-right.
        right: 14,
        bottom: "calc(84px + env(safe-area-inset-bottom, 0px))",
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0)" : "translateY(12px)",
        pointerEvents: show ? "auto" : "none",
        minHeight: 44,
        background: "var(--accent)",
        color: "#0B1220",
        fontFamily: BRAND_SANS,
        fontWeight: 800,
        fontSize: 14,
      }}
    >
      <MessageCircle className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Questions? Text Lee</span>
      <span className="sm:hidden">Text Lee</span>
      <span className="hidden md:inline" style={{ opacity: 0.75, fontWeight: 600 }}>{phone}</span>
    </a>
  );
}

// ── STICKY FOOTER BAR ─────────────────────────────────────────────────────────────────────────
/** A compact bottom bar that slides up once the hero has scrolled away and slides back down when
 *  the real footer is in view: wordmark home, the page's anchors, and "Questions? Text Lee". md+
 *  only — phones keep their own bottom CTA (greek) or nothing; four links and a phone number do
 *  not fit a 390px bar. transform-only slide, instant under reduced motion. */
export function StickyFooterBar({ heroId, links, tel, phone }: {
  heroId: string;
  links: Array<{ label: string; href: string }>;
  tel: string;
  phone: string;
}) {
  const [pastHero, setPastHero] = useState(false);
  const [footerSeen, setFooterSeen] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const hero = document.getElementById(heroId);
    const footer = document.getElementById("site-footer");
    const ios: IntersectionObserver[] = [];
    if (hero) { const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting), { threshold: 0 }); io.observe(hero); ios.push(io); }
    if (footer) { const io = new IntersectionObserver(([e]) => setFooterSeen(e.isIntersecting), { threshold: 0 }); io.observe(footer); ios.push(io); }
    return () => ios.forEach((io) => io.disconnect());
  }, [heroId]);
  const show = pastHero && !footerSeen;
  const onNav = (href: string) => (e: React.MouseEvent) => { if (href.startsWith("#")) { e.preventDefault(); scrollToId(href.slice(1)); } };
  return (
    <div
      aria-hidden={!show}
      className="sa-sticky-footer fixed inset-x-0 bottom-0 z-[190] hidden md:block"
      style={{
        transform: show ? "translateY(0)" : "translateY(110%)",
        background: "color-mix(in srgb, var(--sa-surface-nav, #0F1A2E) 94%, transparent)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid var(--border-default)",
        fontFamily: BRAND_SANS,
      }}
    >
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-6 px-4" style={{ minHeight: 52 }}>
        <a href="/" aria-label="Survive Accounting — home" className="inline-flex items-center" tabIndex={show ? 0 : -1}><CompactLockup size={16} /></a>
        <nav className="flex items-center gap-5" aria-label="Page">
          {links.map((l) => (
            <a key={l.label} href={l.href} onClick={onNav(l.href)} tabIndex={show ? 0 : -1} className="text-[14px] font-semibold" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>{l.label}</a>
          ))}
        </nav>
        <span className="flex-1" />
        <span className="text-[14px] font-semibold" style={{ color: "var(--brand-cream)", opacity: 0.75 }}>Questions? Text Lee</span>
        <a href={`sms:${tel}`} tabIndex={show ? 0 : -1} className="inline-flex items-center gap-2 rounded-full px-4 text-[14px] font-black" style={{ background: "var(--accent)", color: "#0B1220", minHeight: 36 }}>
          <span aria-hidden>💬</span> {phone}
        </a>
      </div>
    </div>
  );
}

// ── UTILITY LINKS ─────────────────────────────────────────────────────────────────────────────
/** The "don't see your X?" requests, MOVED out of the persuasion flow to just above the footer.
 *  Reuses the existing capture paths: the school write-in form inline, the syllabus/professor
 *  modal via callback, and the /chapters finder (which owns chapter self-creation). */
export function MarketingUtilityLinks({ kind, onProfessorAsk }: {
  kind: "general" | "campus" | "greek";
  /** Campus pages: opens the existing syllabus modal with professor framing. */
  onProfessorAsk?: () => void;
}) {
  const [schoolForm, setSchoolForm] = useState(false);
  const LINK = "text-[14px] font-bold underline underline-offset-4 focus-visible:ring-2";
  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-2 px-5 py-8 text-center" style={{ fontFamily: BRAND_SANS }}>
      {kind === "general" && (schoolForm
        // Solo-student surface: school only. The Greek chapter field belongs to /chapters.
        ? <NotListedForm kind="school" onClose={() => setSchoolForm(false)} />
        : (
          <button type="button" onClick={() => setSchoolForm(true)} className={LINK} style={{ color: "var(--text-muted)", minHeight: 44 }}>
            Don&apos;t see your school? Request it →
          </button>
        ))}
      {kind === "campus" && (
        <button type="button" onClick={onProfessorAsk} className={LINK} style={{ color: "var(--text-muted)", minHeight: 44 }}>
          Don&apos;t see your professor? Tell us who teaches it →
        </button>
      )}
      {kind === "greek" && (
        <a href="/chapters" className={LINK} style={{ color: "var(--text-muted)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
          Don&apos;t see your school or chapter? Request it →
        </a>
      )}
    </section>
  );
}
