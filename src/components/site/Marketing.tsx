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
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ClipboardCheck, Play, Target, MessageCircle, ZoomIn } from "lucide-react";

import { BRAND_BLUE, BRAND_DISPLAY, BRAND_RED, BRAND_SANS } from "@/components/canvas/brand";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { AnimatedCampusBolt, type BoltCampus } from "@/components/site/bolt";
import { CAMPUS_LINE_CSS, CampusDot, CampusEm, CampusFor, CampusLine } from "@/components/site/home-two-door/campus-line";
import { CompactLockup } from "@/components/site/SiteHeader";
import { NotListedForm } from "@/components/site/NotListedForm";
import { nbspCode } from "@/lib/course-code";
import { SA_NAV_FOCUS_EVENT, scrollToId } from "@/lib/ui-scroll";
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
export function MarketingHero({ kind, code, schoolShort, greek, onStart, onBoltPick, onChangeSchool, secondaryHref, onSecondary, secondaryLabel, showSecondary = true, onOpenBio, courtesy, rotationCampuses, campusBolt, doors }: {
  kind: "general" | "campus" | "greek";
  /** DOORS MODE — the two shared door cards render INSTEAD of the CTA row and the big bolt, and
   *  the hero centres itself. Set only by the chapter page today; absent everywhere else. */
  doors?: React.ReactNode;
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

  // DOORS MODE (2026-08-28, chapter pages): the CTA row and the big right-hand bolt are replaced
  // by the two shared door cards, and the hero becomes one centred column — the same rhythm the
  // homepage hero has (headline → promise → chips → doors). Every other page is untouched.
  if (doors) {
    return (
      <section id={MARKETING_HERO_ID} className="sa-hero-doors flex flex-col items-center pb-9 pt-10 text-center sm:pt-14" style={{ fontFamily: BRAND_SANS }}>
        <h1 className="mx-auto max-w-[600px] text-[30px] font-black leading-[1.12] sm:text-[40px] lg:text-[44px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>
          {headline}
        </h1>
        <p className="mt-4 text-[19px] font-extrabold leading-snug sm:text-[22px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Practice what gets tested. Score higher.
        </p>
        {greek && (
          <CampusLine>
            <CampusFor>for </CampusFor>
            <CampusEm>{greek.orgName.toUpperCase()}</CampusEm>
            <CampusDot />
            <CampusEm>{(schoolShort ?? "").toUpperCase()}</CampusEm>
          </CampusLine>
        )}
        <TrustChips onBio={onOpenBio} onReviews={() => scrollToId("reviews")} onPlayer={onStart} />
        {/* Exec login stays a UTILITY, never a door — claimed chapters only. */}
        {greek?.claimed && (
          <a href="/chapters/dashboard" className="mt-3 text-[13.5px] underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
            Chapter exec? Log in →
          </a>
        )}
        {courtesy}
        <div className="mt-10 w-full sm:mt-12">{doors}</div>
      </section>
    );
  }

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
export function TrustChips({ onBio, onReviews, onPlayer }: { onBio: () => void; onReviews: () => void; /** Omit to drop the third chip. The two-door home does: above the fold every extra row costs the first card its place on a 390px screen, and "Built for exam week" is the one claim the two doors underneath already make. Pages with room keep all three. */ onPlayer?: () => void }) {
  const CHIPS: Array<{ label: string; onClick: () => void }> = [
    { label: "Created by a pro tutor", onClick: onBio },
    { label: "1,000+ students helped", onClick: onReviews },
    ...(onPlayer ? [{ label: "Built for exam week", onClick: onPlayer }] : []),
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
@media (hover: hover) and (pointer: fine) {
  .sa-lee-zoom-img { transition: transform 480ms cubic-bezier(.22,.61,.36,1); }
  /* Origin moves to the masthead, so the frame closes in on the magazine rather than
     on the middle of the picture. */
  .sa-lee-zoom:hover .sa-lee-zoom-img,
  .sa-lee-zoom:focus-visible .sa-lee-zoom-img { transform: scale(3.1); transform-origin: 32% 63%; }
}
@media (prefers-reduced-motion: reduce) { .sa-lee-zoom-img { transition: none; } }
@keyframes sa-detail-in { from { opacity: 0; transform: scale(0.975); } to { opacity: 1; transform: none; } }
.sa-detail-in { animation: sa-detail-in 160ms cubic-bezier(.22,.61,.36,1) both; }
@media (prefers-reduced-motion: reduce) { .sa-detail-in { animation: none; } }

${CAMPUS_LINE_CSS}
/* CHANGE-SCHOOL SWAP. A 44px touch target around a 16px glyph, so it is quiet to look at and still
   comfortably tappable on a phone. It brightens rather than growing — nothing under the bolt should
   move on hover except the bolt. */
.sa-hero-swap { background: none; border: 0; padding: 0; cursor: pointer; opacity: 0.75; transition: color 140ms, opacity 140ms, background-color 140ms; }
.sa-hero-swap:hover { color: var(--brand-cream); opacity: 1; background: rgba(245,239,230,0.08); }
.sa-hero-swap:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; color: var(--brand-cream); opacity: 1; }

/* DOORS-MODE HERO: the proof strip centres at every width (the old hero left-aligns it on
   desktop, where it sat in a left column). */
.sa-hero-doors .sa-proof-row { justify-content: center; }

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
/** THE THREE VALUE CARDS. Card 3 differs by surface (2026-08-28):
 *
 *   HOME  — the actionable "Send your syllabus. I'll match it →", which opens the syllabus flow.
 *   CHAPTER — a plain statement that the product already fits their course. A chapter member is
 *   being asked to study, not to do the tailoring homework; the syllabus ask stays a home thing.
 *
 *  COPY LAW applies (see ChapterDoors): these say what a student GETS, never what we don't need. */
export function FeatureValueStrip({ code, onSyllabus, variant = "home" }: {
  code: string | null;
  onSyllabus?: () => void;
  /** "council" reframes card 3 for someone who is not taking the course: a council officer is
   *  sharing this for her CHAPTERS, and "Built around your course" addressed a student who
   *  isn't in the room. */
  variant?: "home" | "chapter" | "council";
}) {
  // p4 §6: real copy a student feels, and more vertical room to hold it. `clip` marks the slot for
  // an example clip in the cram-videos card (placeholder only, home surface).
  // Each card leads with the ONE line that lands, then explains underneath — a paragraph break
  // rather than one run-on block, so a skimmer gets the point from the first line alone.
  const CARDS = [
    {
      icon: Play,
      title: "Quick cram videos",
      lead: "Two minutes or less, every one.",
      body: "Just what you need to answer the question, plus the tricks that make it click. Nothing like your lecture videos.",
    },
    {
      icon: ClipboardCheck,
      title: "Practice exams",
      lead: "Exam-style problems, not textbook ones.",
      body: "Going from a B to an A is mostly pattern recognition — learn to spot the type of problem and the simpler route to the answer shows up with it.",
    },
  ];
  // 48px icons centered above each heading, with generous vertical room for the longer copy.
  const card = "flex flex-col items-center rounded-2xl px-5 py-8 text-center";
  const cardStyle = { background: "var(--bg-surface)", border: "1px solid var(--border-default)" } as const;
  // The ONE actionable card keeps its distinctness with an amber hairline — not a full restyle.
  const actionableStyle = { background: "var(--bg-surface)", border: "1px solid var(--accent)" } as const;
  const H = "mt-4 text-[15.5px] font-black";
  const hStyle = { fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" } as const;
  const bodyCls = "mt-2 text-[14px] leading-relaxed";
  const bodyStyle = { color: "var(--brand-cream)", opacity: 0.7 } as const;
  const iconCls = "h-12 w-12";
  const iconStyle = { color: "var(--accent)" } as const;
  return (
    <section className="mx-auto grid w-full max-w-[900px] items-stretch gap-4 px-1 py-10 sm:grid-cols-3" style={{ fontFamily: BRAND_SANS }}>
      {CARDS.map(({ icon: Icon, title, lead, body }) => (
        <div key={title} className={card} style={cardStyle}>
          <Icon className={iconCls} strokeWidth={1.75} style={iconStyle} aria-hidden />
          <p className={H} style={hStyle}>{title}</p>
          <p className={bodyCls} style={bodyStyle}>{lead}</p>
          <p className="mt-2.5 text-[14px] leading-relaxed" style={bodyStyle}>{body}</p>
        </div>
      ))}
      {variant === "council" ? (
        <div className={card} style={cardStyle}>
          <Target className={iconCls} strokeWidth={1.75} style={iconStyle} aria-hidden />
          <p className={H} style={hStyle}>{code ? `Built for ${nbspCode(code)}` : "Built for your campus"}</p>
          <p className={bodyCls} style={bodyStyle}>Matched to the course your chapters actually take.</p>
        </div>
      ) : variant === "chapter" ? (
        <div className={card} style={cardStyle}>
          <Target className={iconCls} strokeWidth={1.75} style={iconStyle} aria-hidden />
          <p className={H} style={hStyle}>{code ? `Built for ${nbspCode(code)}` : "Built for your course"}</p>
          <p className={bodyCls} style={bodyStyle}>Matched to your exact course.</p>
        </div>
      ) : (
        /* HOME: card 3 is the ONE actionable card — amber hairline keeps it distinct. */
        <button type="button" onClick={onSyllabus} className={`${card} transition-transform hover:scale-[1.01] focus-visible:ring-2`} style={actionableStyle}>
          <Target className={iconCls} strokeWidth={1.75} style={iconStyle} aria-hidden />
          <p className={H} style={hStyle}>Built around your course</p>
          {/* NOT "I make videos for everyone" — that argues against the card's own headline. The
              breadth is the reassurance; the syllabus is the personalisation on top of it. */}
          <p className={bodyCls} style={bodyStyle}>These work for any intro course.</p>
          <p className="mt-2.5 text-[14px] leading-relaxed" style={bodyStyle}>Send your syllabus and I&apos;ll make sure yours is covered.</p>
          <span className="mt-3 text-[14px] font-black" style={{ color: "var(--accent)" }}>Send your syllabus →</span>
        </button>
      )}
    </section>
  );
}

// ── SOCIAL PROOF: testimonials + tutor in one row ────────────────────────────────────────────
/** Desktop: ~60/40 row — reviews left, tutor card right. Mobile: stacked, reviews first.
 *  Content arrives as slots so this module never imports from the landing route. */
export function SocialProofSection({ testimonials, tutor, testimonialsHeading = "What students are saying" }: {
  testimonials: React.ReactNode;
  tutor: React.ReactNode;
  /** WHOSE students. Every review on file is from Ole Miss, and on an Alabama council page a bare
   *  "What students are saying" reads as a claim about Alabama students that the cards underneath
   *  then quietly contradict. Naming the campus turns a mismatch into transparency. */
  testimonialsHeading?: string;
}) {
  // BOTH headings are rendered HERE, on one baseline — the column contents start level, which
  // is what makes the row read as one section rather than two stacked boxes.
  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mb-4 text-[20px] font-extrabold" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>{children}</h2>
  );

  // WHICH HALF DID YOU ASK FOR? "Reviews" and "Meet your tutor" are side by side and level, so a
  // nav press lands on a row that looks identical either way. The requested column flashes the
  // brand bolt and a quick ring, so the eye is told where it just arrived.
  const [focus, setFocus] = useState<null | "reviews" | "lee">(null);
  useEffect(() => {
    const onFocusEvent = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id === "reviews" || id === "lee") setFocus(id);
    };
    window.addEventListener(SA_NAV_FOCUS_EVENT, onFocusEvent);
    return () => window.removeEventListener(SA_NAV_FOCUS_EVENT, onFocusEvent);
  }, []);
  useEffect(() => {
    if (!focus) return;
    const t = window.setTimeout(() => setFocus(null), 1500);
    return () => window.clearTimeout(t);
  }, [focus]);

  const FocusBolt = () => (
    <span aria-hidden className="sa-focus-bolt" style={{ position: "absolute", right: -4, top: -34, width: 30, height: 42, pointerEvents: "none", zIndex: 3 }}>
      <BoltBoil height={42} />
    </span>
  );

  return (
    <section className="mx-auto grid w-full max-w-[1040px] items-start gap-8 lg:grid-cols-[3fr_2fr]" style={{ fontFamily: BRAND_SANS }}>
      <style>{FOCUS_CSS}</style>
      <div className={`relative min-w-0${focus === "reviews" ? " sa-focused" : ""}`}>
        {focus === "reviews" && <FocusBolt />}
        <H>{testimonialsHeading}</H>
        {testimonials}
      </div>
      {/* sa-anchor is what makes "Meet your tutor" land correctly: without its scroll-margin the
          column pinned to y=0 under the sticky bar, hiding BOTH headings (its own and, on desktop,
          the reviews heading level with it). */}
      <div className={`sa-anchor relative min-w-0${focus === "lee" ? " sa-focused" : ""}`} id="lee">
        {focus === "lee" && <FocusBolt />}
        <H>Meet your tutor</H>
        {tutor}
      </div>
    </section>
  );
}

/** The nav-arrival flash: a ring that expands and clears, and the bolt dropping in above the
 *  column. Both are decoration only — nothing moves, nothing blocks — and both are off under
 *  reduced motion, where the scroll itself is the whole feedback. */
const FOCUS_CSS = `
@keyframes sa-focus-ring {
  0% { box-shadow: 0 0 0 0 rgba(252,163,17,0.5); }
  100% { box-shadow: 0 0 0 16px rgba(252,163,17,0); }
}
.sa-focused { border-radius: 20px; animation: sa-focus-ring 1300ms ease-out; }
@keyframes sa-focus-bolt-in {
  0% { opacity: 0; transform: translateY(-10px) scale(0.4); }
  22% { opacity: 1; transform: translateY(0) scale(1); }
  70% { opacity: 1; }
  100% { opacity: 0; }
}
.sa-focus-bolt { animation: sa-focus-bolt-in 1500ms ease; }
@media (prefers-reduced-motion: reduce) {
  .sa-focused { animation: none; }
  .sa-focus-bolt { display: none; }
}
`;

// ── TUTOR CARD + FULL BIO ────────────────────────────────────────────────────────────────────
// Lee's real photo — 4:5 crop centered on the face (moved here from landing.tsx unchanged; the
// old cream SVG portrait stays retired for video frames).
export function LeePortrait({ width = 200, caption = true, variant = "sunrise", onZoom }: {
  /** Given, the frame becomes a button with a magnifier on it and pushes in on the
   *  magazine while hovered. A phone never fires hover, so the button is the real route. */
  onZoom?: () => void;
  width?: number;
  caption?: boolean;
  /** WHICH LEE. The card and the modal deliberately show different photographs — meeting the same
   *  posed headshot twice in two clicks reads as a stock asset, whereas a second, different picture
   *  reads as a person. "kid" is the childhood Journal of Accountancy shot and carries its own
   *  caption, because without one it is a photo of a stranger's child. */
  variant?: "sunrise" | "kid";
}) {
  // Each photo needs its own crop: the sunrise frame is a 4:3 landscape whose subject sits low, the
  // kid photo is a near-4:5 portrait whose subject sits in the LEFT third with the magazine — the
  // thing the caption is about — just under his hands. One shared crop would ruin one of them.
  const art = variant === "kid"
    ? {
        src: "/lee-kid-joa.jpg",
        alt: "Lee as a kid, reading the Journal of Accountancy",
        // The subject is in the LEFT column and object-position has nothing to give here — the
        // source is 0.75 against a 0.8 frame, so width fills exactly and only ~6% of height is
        // croppable. The zoom has to be anchored instead: scaling about the default centre framed
        // the CAT.
        //
        // ROOM AT THE BOTTOM (2026-09-04). scale(1.9) about 0% 25% showed a band from roughly the
        // top of the frame down to 51% — and the magazine, the thing the caption is about, sits at
        // 56-71%. It was cropped clean out. His head runs 6-44% and the magazine 56-71%, so the
        // band has to span 6-71%: 65% of the height, which is scale 1/0.65, centred at ~38%.
        objectPosition: "50% 50%",
        transformOrigin: "30% 38%",
        transform: "scale(1.5)",
      }
    : {
        src: "/lee-sunrise.jpg",
        alt: "Lee Ingram",
        objectPosition: "20% 50%",
        transformOrigin: "center",
        // THE FACE SITS HIGHER than a plain cover crop puts it. The source is 4:3 into a 4:5 frame,
        // so cover fills the height EXACTLY and object-position has no vertical travel to give. A
        // 14% scale buys ~7% of headroom each side; shifting up 5% spends part of it, so the frame
        // stays covered and the hair and arm stay in shot.
        transform: "scale(1.14) translateY(-5%)",
      };
  return (
    <figure className="mx-auto sm:mx-0" style={{ width, transform: "rotate(1.5deg)" }}>
      <div
        // HOVER PUSHES IN ON THE MASTHEAD, not on the middle of the picture — the origin is the
        // magazine. Held in a class rather than inline so the hover state has somewhere to live.
        className={onZoom ? "group relative cursor-zoom-in sa-lee-zoom" : undefined}
        onClick={onZoom}
        role={onZoom ? "button" : undefined}
        tabIndex={onZoom ? 0 : undefined}
        onKeyDown={onZoom ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onZoom(); } } : undefined}
        aria-label={onZoom ? "Zoom in on the Journal of Accountancy" : undefined}
        style={{ width, aspectRatio: "4 / 5", borderRadius: 16, border: "3px solid var(--brand-cream)", overflow: "hidden" }}
      >
        <img
          src={art.src} alt={art.alt}
          className={onZoom ? "sa-lee-zoom-img" : undefined}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: art.objectPosition, transformOrigin: art.transformOrigin, transform: art.transform, display: "block" }}
        />
        {onZoom && (
          <span
            aria-hidden
            className="absolute grid place-items-center rounded-full"
            style={{ right: 5, bottom: 5, width: 24, height: 24, background: "rgba(11,18,32,0.82)", color: "#FFFFFF", pointerEvents: "none" }}
          >
            <ZoomIn style={{ width: 13, height: 13 }} />
          </span>
        )}
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
/** THE CREDENTIAL ROW — the amber check the trust chips already use, so the two read as one voice. */
function TutorCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[13.5px] leading-snug" style={{ opacity: 0.85 }}>
      <span aria-hidden style={{ color: "var(--accent)", fontWeight: 900, lineHeight: 1.35 }}>✓</span>
      <span>{children}</span>
    </li>
  );
}

export function TutorCard({ onMore }: { onMore: () => void }) {
  // THE DEAD SPACE WAS THE BUG. The card is as tall as the photo, but the text column ran out a
  // third of the way down and left "Learn more" stranded at the bottom-left under a block of
  // nothing. The checks are what fill that column — four short credentials instead of three grey
  // lines — and the link now sits under them rather than floating alone below the whole card.
  return (
    <div className="rounded-2xl p-5 sm:p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
      <div className="flex items-start gap-5">
        <LeePortrait width={112} caption={false} />
        {/* The column stretches to the photo's height and distributes its own rows, so the card
            sizes to the TALLER of the two and neither side leaves a gap. */}
        <div className="flex min-w-0 flex-1 flex-col self-stretch" style={{ color: "var(--brand-cream)" }}>
          <p className="text-[16px] font-bold">Lee Ingram</p>
          <ul className="mt-2 flex flex-1 flex-col justify-center gap-1.5">
            {/* "Ole Miss alum" rather than "Two accounting degrees": same fact, with a real school
                attached. It stays as-is on every campus page — it is the credential, not a
                greeting, and localising it would be inventing a biography. */}
            <TutorCheck>Ole Miss alum — BAccy · MAccy</TutorCheck>
            <TutorCheck>Tutor since 2015</TutorCheck>
            <TutorCheck>1,000+ students tutored</TutorCheck>
            <TutorCheck>Every video filmed by me</TutorCheck>
          </ul>
          <button
            type="button"
            onClick={onMore}
            className="mt-3 inline-flex items-center self-start text-[14px] font-bold focus-visible:ring-2"
            style={{ color: "var(--accent)", minHeight: 44 }}
          >
            Learn more about Lee →
          </button>
        </div>
      </div>
    </div>
  );
}

/** The full bio, verbatim, in a modal — a chip or "Learn more" opens it; nothing navigates away. */
/** A THUMBNAIL WITH A CAPTION, for a modal that wants one personal aside. The
 *  thumbnail toggles a detail view the OWNER renders (see ContainedDetail) so the
 *  detail can cover the panel the aside sits in rather than the narrow column. */
function PhotoAside({ width, open, onToggle, caption, thumbRef, children }: {
  width: number; open: boolean; onToggle: () => void; caption: React.ReactNode;
  /** The owner passes a ref so focus can come back to the thumbnail when the detail closes. */
  thumbRef: React.RefObject<HTMLDivElement | null>;
  children: (onZoom: () => void) => React.ReactNode;
}) {
  return (
    <figure className="shrink-0" style={{ width }}>
      <div ref={thumbRef} aria-expanded={open}>{children(onToggle)}</div>
      <figcaption className="mt-2 text-[11px] leading-snug" style={{ fontFamily: BRAND_SANS, color: "var(--text-muted)" }}>
        {caption}
      </figcaption>
    </figure>
  );
}

/** THE CONTAINED DETAIL — a larger picture with a line or two of supporting text,
 *  laid over the PANEL it is mounted in (the panel must be position: relative). It
 *  never leaves that footprint: no viewport scrim, no second modal, no gallery.
 *  Closes on ×, on a click anywhere on it outside the picture, and on Escape —
 *  Escape is caught in the capture phase so the panel underneath does not also
 *  close. Focus lands on × when it opens and goes back to `returnTo` after. */
function ContainedDetail({ src, alt, lines, radius, onClose, returnTo }: {
  src: string; alt: string; lines: React.ReactNode[]; radius: number; onClose: () => void;
  returnTo: React.RefObject<HTMLElement | null>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    // The wrapper the owner hands us is not itself focusable — the thumbnail's own
    // button is — so focus goes to the first focusable thing inside it.
    const back = returnTo.current;
    return () => {
      window.removeEventListener("keydown", onKey, true);
      const target = back?.matches?.("[tabindex],button,a") ? back : back?.querySelector<HTMLElement>("[tabindex],button,a");
      target?.focus?.();
    };
  }, [onClose, returnTo]);
  return (
    <div
      role="dialog" aria-modal="true" aria-label={alt}
      onClick={onClose}
      className="sa-detail-in absolute inset-0 grid place-items-center p-5"
      style={{ borderRadius: radius, background: "rgba(11,18,32,0.94)", zIndex: 5 }}
    >
      <figure className="w-full" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} style={{ width: "100%", borderRadius: 14, display: "block", boxShadow: "0 24px 60px -24px rgba(0,0,0,0.9)" }} />
        <figcaption className="mt-3 text-[13px] leading-snug" style={{ fontFamily: BRAND_SANS, color: "var(--brand-cream)" }}>
          {lines.map((l, i) => <span key={i} className="block" style={{ opacity: i === 0 ? 0.92 : 0.7, marginTop: i ? 3 : 0 }}>{l}</span>)}
        </figcaption>
      </figure>
      <button
        ref={closeRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
        className="absolute grid place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2"
        style={{ top: 12, right: 12, width: 40, height: 40, color: "var(--text-muted)" }}
      >
        <span aria-hidden style={{ fontSize: 20 }}>×</span>
      </button>
    </div>
  );
}

export function TutorBioModal({ onClose }: { onClose: () => void }) {
  const panelRef = useDismiss<HTMLDivElement>(onClose, { enabled: true });
  // The magazine detail. It lives INSIDE the panel (ContainedDetail), so the bio
  // never hands the whole screen to a picture.
  const [magazine, setMagazine] = useState(false);
  const thumbRef = useRef<HTMLDivElement>(null);
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
  const RADIUS = 24;
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center overflow-y-auto p-4" style={{ background: "rgba(5,8,16,0.72)" }} role="dialog" aria-modal="true" aria-label="About Lee Ingram">
      <div ref={panelRef} className="relative w-full max-w-[600px] overflow-hidden p-6 sm:p-8" style={{ borderRadius: RADIUS, background: "var(--bg-page)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS, boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2"
          style={{ width: 40, height: 40, color: "var(--text-muted)" }}
        >
          <span aria-hidden style={{ fontSize: 20 }}>×</span>
        </button>

        {/* TWO COLUMNS on a desktop — the photo and its caption in a narrow left column, the
            bio in the wide right one, so the picture reads as a personal aside beside the
            text rather than a header above it. ONE column on a phone, in this same source
            order: photo, caption, heading, checks, paragraphs, contact. */}
        <div className="grid gap-5 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-7">
          {/* A DIFFERENT PHOTO FROM THE CARD, on purpose: the same headshot twice in two clicks
              reads as a stock asset. The caption is not decoration — without it this is a picture
              of a stranger's child. */}
          <PhotoAside
            width={112}
            open={magazine}
            onToggle={() => setMagazine((o) => !o)}
            thumbRef={thumbRef}
            caption={<>Reading my dad&apos;s <span className="italic">Journal of Accountancy</span> from 1999. Chilling with my cat, Mr. Puddles.</>}
          >
            {(onZoom) => <LeePortrait width={112} caption={false} variant="kid" onZoom={onZoom} />}
          </PhotoAside>

          <div className="min-w-0">
            <h2 className="text-[24px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
              Hey, I&apos;m Lee.
            </h2>
            {/* THE SAME CHECK ROWS AS THE CARD, so the two surfaces read as one person rather than
                two differently-formatted bios. Ole Miss awards the BAccy / MAccy — not BAcc/MAcc. */}
            <ul className="mt-3 flex flex-col gap-1.5 text-[14px] leading-snug" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>
              <TutorCheck><span className="font-black">BAccy · MAccy</span> — University of Mississippi</TutorCheck>
              <TutorCheck>Tutor since 2015</TutorCheck>
              <TutorCheck>1,000+ students tutored</TutorCheck>
            </ul>
            <P>I built Survive because accounting exams get a lot easier once you&apos;ve already seen the kinds of problems you&apos;re about to get. Every video on here is me — no team, no scripts, just what I&apos;d tell you at the whiteboard.</P>
            {/* The music/travel line stays — it's disarming and it works. The joke lands as its own
                short sentence rather than as a fourth item buried in the list. */}
            <P>Outside Survive I&apos;m usually traveling, seeing live music, or playing live music. Or working on Survive.</P>
            <P>Text me at <a href="sms:+16625658818" className="font-bold underline underline-offset-4" style={{ color: "var(--accent)" }}>(662)&nbsp;565-8818</a> if you have a question or just want to say hi. I read every one.</P>
          </div>
        </div>

        {magazine && (
          <ContainedDetail
            src="/lee-kid-joa-detail.jpg"
            alt="The Journal of Accountancy, close up"
            lines={[
              <>My dad&apos;s copy of the <span className="italic">Journal of Accountancy</span> — August 1999.</>,
              <>Cover line: &ldquo;10 Commandments of Mutual Fund Investing.&rdquo;</>,
            ]}
            radius={RADIUS}
            onClose={() => setMagazine(false)}
            returnTo={thumbRef}
          />
        )}
      </div>
    </div>
  );
}

/** FLOATING CONTACT — "Questions? Text Lee". One quiet pill, bottom-right, replacing the old
 *  full-width sticky bar (which duplicated the navbar). Hidden until the hero scrolls away and
 *  when the real footer is on screen — same show logic the old bar used, kept because it stops
 *  the pill from stacking on the footer's own Text-Lee link. */
export function FloatingContact({ heroId, tel, phone, onText, onEmail, bottomOffset = 84, photo }: { heroId: string; tel: string; phone: string; onText?: () => void; onEmail?: () => void; /** px above the safe-area. 84 clears the practice stage's Next bar; a page with no such bar (the two-door home) passes a small value so the pill sits in the very corner, out of the zone where CTAs rest and get read. */ bottomOffset?: number; /** Lee's photo, framed above the pill. It turns an anonymous support chip into a person offering to help — and it only makes sense once the visitor has met him, so pass `heroId` as the bio section. */ photo?: string }) {
  // BOTH MECHANISMS: IntersectionObserver as the efficient primary, plus a passive scroll listener
  // reading the rects, because IO delivery rides the rendering lifecycle and a non-compositing tab
  // can silence it indefinitely — which would leave the pill permanently hidden.
  //
  // DIRECTION MATTERS: the trigger element is partway down the page (the bio), so "off screen" is
  // true at the very top too. Only ABOVE the viewport — bottom <= 0 — counts as scrolled past.
  const [show, setShow] = useState(false);
  useEffect(() => {
    const read = () => {
      const vh = window.innerHeight;
      const hero = document.getElementById(heroId);
      const footer = document.getElementById("site-footer");
      // "You have SEEN it", not "it is entirely gone": waiting for the bio to clear the viewport
      // completely left almost no window before the footer arrived, so the pill barely existed.
      // Once the bio has passed the lower third, the visitor has met Lee — that is the moment.
      const pastHero = hero ? hero.getBoundingClientRect().bottom <= vh * 0.6 : false;
      // And only stand down when the footer is genuinely in view (it carries its own Text-Lee
      // link), not the instant its first pixel appears.
      const footerSeen = footer ? footer.getBoundingClientRect().top < vh * 0.7 : false;
      setShow(pastHero && !footerSeen);
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    const ios: IntersectionObserver[] = [];
    if (typeof IntersectionObserver !== "undefined") {
      for (const id of [heroId, "site-footer"]) {
        const el = document.getElementById(id);
        if (!el) continue;
        const io = new IntersectionObserver(() => read(), { threshold: 0 });
        io.observe(el);
        ios.push(io);
      }
    }
    return () => {
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
      ios.forEach((io) => io.disconnect());
    };
  }, [heroId]);
  void onEmail;
  return (
    <div
      className="fixed z-[190] flex flex-col items-end gap-1.5"
      style={{
        right: 14,
        bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))`,
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0)" : "translateY(12px)",
        pointerEvents: show ? "auto" : "none",
        transition: "opacity 240ms ease, transform 240ms ease",
      }}
    >
      {/* PHONE: one small tile — Lee's face with a chat badge on the corner, ~52px square. A wide
          pill in the corner is precisely the thing that ends up sitting on a CTA, and on a phone the
          cards are full-bleed so there is no empty gutter for it to live in. The number is not shown
          because the tap already carries it (the href IS the number). */}
      <a
        href={`sms:${tel}`}
        onClick={onText}
        aria-hidden={!show}
        tabIndex={show ? 0 : -1}
        aria-label={`Text Lee at ${phone}`}
        className="relative block sm:hidden"
        style={{ lineHeight: 0 }}
      >
        {photo && (
          <img
            src={photo} alt="" aria-hidden
            style={{ width: 50, height: 56, objectFit: "cover", objectPosition: "50% 30%", borderRadius: 12, border: "2px solid var(--brand-cream)", boxShadow: "0 12px 28px -10px rgba(0,0,0,0.85)", display: "block" }}
          />
        )}
        <span
          className="absolute grid place-items-center rounded-full"
          style={{ right: -6, bottom: -6, width: 28, height: 28, background: "var(--accent)", color: "#0B1220", boxShadow: "0 6px 16px -6px rgba(0,0,0,0.9)" }}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
        </span>
      </a>

      {/* DESKTOP: room for the framed portrait and the full pill, number included. */}
      {photo && (
        // Framed like the bio portrait (same cream border and slight tilt) so it reads as the same
        // person you just met, not a stock avatar.
        <img
          src={photo} alt="" aria-hidden
          className="hidden sm:block"
          style={{ width: 54, height: 62, objectFit: "cover", objectPosition: "50% 30%", borderRadius: 12, border: "2px solid var(--brand-cream)", boxShadow: "0 12px 28px -10px rgba(0,0,0,0.8)", transform: "rotate(1.5deg)" }}
        />
      )}
      <a
        href={`sms:${tel}`}
        onClick={onText}
        aria-hidden={!show}
        tabIndex={show ? 0 : -1}
        aria-label={`Text Lee at ${phone}`}
        className="hidden items-center gap-2 rounded-full px-4 shadow-lg sm:inline-flex"
        style={{ minHeight: 44, background: "var(--accent)", color: "#0B1220", fontFamily: BRAND_SANS, fontWeight: 800, fontSize: 13.5 }}
      >
        <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
        <span>Text Lee</span>
        <span style={{ opacity: 0.75, fontWeight: 600 }}>{phone}</span>
      </a>
    </div>
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
