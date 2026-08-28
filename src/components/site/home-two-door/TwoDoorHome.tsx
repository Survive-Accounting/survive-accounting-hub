// THE TWO-DOOR HOMEPAGE (2026-08-27) — surviveaccounting.com/'s hero redesign, V1.
//
// One job: a stranger understands Survive in ~5 seconds and picks one of two doors —
// STUDY SOLO or STUDY WITH YOUR CHAPTER. The information architecture is borrowed from
// Speechnotes (centered promise → small credibility layer → two perfectly symmetrical doors);
// the visual world is entirely ours (navy, cream, amber, the bolt).
//
// What this page deliberately does NOT do any more:
//   • render the live student player — the new Exam 1 experience is being rebuilt privately, so
//     the public Exam 1 CTA enters the WAITLIST state (FREE · SEPTEMBER 1, one email field)
//     instead of an unfinished player. Campus pages (/$school) keep the existing full
//     LandingPage + player untouched.
//   • carry a giant decorative hero bolt — the cycling bolt now lives INSIDE the left door and
//     is its visual identity.
//   • stack three competing "start" CTAs — the doors are the instruction.
//
// SYMMETRY IS THE DESIGN. Both cards share ONE frame (DOOR_CARD) and one internal grammar:
// icon envelope → title → description → button → support line, each slot the same height on
// both sides. Any change to one card's structure must go through the shared pieces so the two
// can never drift apart.
import { useEffect, useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import {
  FeatureValueStrip, FloatingContact, MARKETING_CSS, MARKETING_HERO_ID, SocialProofSection,
  TrustChips, TutorBioModal, TutorCard,
} from "@/components/site/Marketing";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { TestimonialsSlider } from "@/components/site/Testimonials";
import { GreekWaitlistSheet } from "@/components/site/home-two-door/GreekWaitlistSheet";
import { boltFor, Faq, PHONE, SCHOOLS, SectionDivider, SyllabusModal, TEL, type School } from "@/routes/landing";
import { CampusProvider, useCampus } from "@/lib/campus-context";
import { track } from "@/lib/analytics";
import { pathStarted } from "@/lib/exam-path";
import { scrollToId } from "@/lib/ui-scroll";
import { useDismiss } from "@/lib/use-dismiss";
import { contactKind, EXAM1_LAUNCH_LABEL, HOME_CAMPUS } from "@/lib/launch";
import { submitNotify } from "@/lib/syllabus.functions";
import { examRequest, notifyNote } from "@/lib/notify-request";
import { rememberStudentEmail } from "@/lib/student-email";
import { readTestSession } from "@/lib/test-mode";
import { homeCourseCode, soloButtonLabel, soloSupport, tickerLine } from "./two-door-copy";
import { nbspCode } from "@/lib/course-code";

/** The doors section's anchor. Also aliased by the legacy #exam1 anchor below it, because every
 *  other page's navbar still links "/#exam1" — those visitors should land at the doors, not at a
 *  player that no longer exists here. */
const DOORS_ID = "doors";

// ── PAGE ──────────────────────────────────────────────────────────────────────────────────────
export function TwoDoorHome({ storedCampusId, initialCode, previewSoloHref }: {
  /** The returning visitor's campus, read from the request cookie by the route loader — same
   *  contract as LandingPage's storedCampusId (SSR renders the personalized hero, no flicker). */
  storedCampusId?: string | null;
  /** Course code resolved server-side by the loader, so the headline never gains it a beat late. */
  initialCode?: string | null;
  /** PREVIEW ONLY (/preview/home): the left door NAVIGATES here (the private Player V2) instead
   *  of opening the public Exam 1 waitlist. Never set on the live "/" — ordinary visitors must
   *  keep landing on the September 1 waitlist state. */
  previewSoloHref?: string;
}) {
  return (
    <CampusProvider urlSchoolSlug={null} accountCampusId={null} initialCode={initialCode ?? null} initialStoredId={storedCampusId ?? null}>
      <TwoDoorHomeInner previewSoloHref={previewSoloHref} />
    </CampusProvider>
  );
}

function TwoDoorHomeInner({ previewSoloHref }: { previewSoloHref?: string }) {
  useNavyDocument();
  const campus = useCampus();

  // The resolved campus recolors the page theme + the door bolt; unknown stays brand default.
  const theme = useMemo(() => {
    if (!campus.school) return DEFAULT_FRAME_THEME;
    const c = boltFor(campus.school.id);
    return { ...DEFAULT_FRAME_THEME, boltPrimary: c.c1, boltSecondary: c.c2 };
  }, [campus.school]);

  // Landing's School row for the syllabus modal (it wants the picker-shaped object).
  const schoolObj = useMemo<School | null>(
    () => (campus.school ? SCHOOLS.find((s) => s.id === campus.school!.id) ?? null : null),
    [campus.school],
  );

  // RETURNING STUDENT — read AFTER mount (localStorage; SSR must not guess). The guided path's
  // own started flag is the one trustworthy "already started Exam 1" signal.
  const [returning, setReturning] = useState(false);
  useEffect(() => { setReturning(pathStarted()); }, []);

  const [bioOpen, setBioOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [syllabusOpen, setSyllabusOpen] = useState(false);

  // Shared analytics context — attach what the page knows, never more.
  const ctx = () => ({ campus_id: campus.school?.id, course_code: campus.code ?? undefined });

  // On the live "/" the solo door opens the public waitlist; on /preview/home it navigates into
  // the private Player V2 instead (same event, `preview` property tells them apart).
  const openSolo = () => {
    track("homepage_study_solo_clicked", { ...ctx(), returning, preview: !!previewSoloHref });
    if (!previewSoloHref) setWaitlistOpen(true);
  };
  const openChapter = (source: "button" | "ticker") => { track("homepage_chapter_clicked", { ...ctx(), source }); setFinderOpen(true); };
  const openScope = () => { track("homepage_course_scope_opened", ctx()); setScopeOpen(true); };

  return (
    <div style={{
      ...frameThemeVars(theme), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "clip",
      // H2 CTA tokens — the two doors' solid fills. Crimson/white solo, powder/navy chapter.
      ["--cta-solo-bg" as string]: "#CE1126",
      ["--cta-solo-fg" as string]: "#FFFFFF",
      ["--cta-chapter-bg" as string]: "#A8D4F0",
      ["--cta-chapter-fg" as string]: "#0F1A2E",
    }}>
      <style>{MARKETING_CSS}</style>
      <style>{TWO_DOOR_CSS}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.34} animate /></div>

      <SiteHeader homeNav onLanding />

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto", padding: "0 20px", width: "100%", overflowX: "clip" }}>
        <TwoDoorHero code={campus.code} schoolName={campus.school?.name ?? null} schoolId={campus.school?.id ?? null} onOpenBio={() => setBioOpen(true)} />

        {/* Legacy compatibility: every other page's navbar still links "/#exam1". */}
        <div id="exam1" className="sa-anchor" />
        <TwoDoorCards
          code={campus.code}
          onSolo={openSolo}
          soloHref={previewSoloHref}
          onChapter={openChapter}
        />

        {/* COURSE SCOPE — one quiet line, because students have genuinely asked whether Survive
            covers Intermediate. A tiny modal answers; the hero stays out of it. */}
        <p className="mt-5 text-center text-[13px]" style={{ fontFamily: BRAND_SANS, color: "var(--text-muted)" }}>
          Intro Financial Accounting only{" "}
          <span aria-hidden style={{ opacity: 0.5 }}>·</span>{" "}
          <button
            type="button"
            onClick={openScope}
            className="underline underline-offset-4 focus-visible:ring-2"
            style={{ background: "none", border: 0, padding: "4px 2px", cursor: "pointer", color: "var(--text-muted)", font: "inherit" }}
          >
            Why?
          </button>
        </p>

        {/* SOCIAL PROOF (reviews + Meet Lee), then the value strip as the existing lightweight
            "how Survive works", then FAQ — the pre-redesign sections, reordered, nothing new. */}
        <div id="reviews" className="sa-anchor" />
        <div className="pt-12">
          <SocialProofSection
            testimonials={<TestimonialsSlider />}
            tutor={<TutorCard onMore={() => setBioOpen(true)} />}
          />
        </div>
        <FeatureValueStrip code={campus.code} onSyllabus={() => setSyllabusOpen(true)} />
        <SectionDivider />
        <Faq />
      </main>

      <Footer onLanding />

      {bioOpen && <TutorBioModal onClose={() => setBioOpen(false)} />}
      <FloatingContact heroId={MARKETING_HERO_ID} tel={TEL} phone={PHONE} />
      {waitlistOpen && (
        <Exam1LaunchModal
          campusId={schoolObj?.campusId ?? null}
          campusName={campus.school?.name ?? null}
          courseCode={campus.code}
          onClose={() => setWaitlistOpen(false)}
        />
      )}
      {/* H4: the front door is a WAITLIST while chapters open campus by campus — the finder
          sheet became the 3-step greek capture (school → org → email). */}
      {finderOpen && <GreekWaitlistSheet onClose={() => setFinderOpen(false)} />}
      {scopeOpen && <CourseScopeModal onClose={() => setScopeOpen(false)} />}
      {syllabusOpen && <SyllabusModal school={schoolObj} onClose={() => setSyllabusOpen(false)} />}
    </div>
  );
}

// ── HERO — CENTERED, QUIET ────────────────────────────────────────────────────────────────────
/** Headline → promise → proof chips, all on one centered axis. No CTA here and no bolt: the
 *  doors immediately below are the only instruction, and the bolt lives in the left one. */
function TwoDoorHero({ code, schoolName, schoolId, onOpenBio }: {
  code: string | null;
  schoolName: string | null;
  schoolId: string | null;
  onOpenBio: () => void;
}) {
  // Same honesty rule as every hero before it: the campus version needs BOTH a school and a
  // VERIFIED course code; anything less renders the generic page, never an invented code.
  const headline = code && schoolName
    ? <><span style={{ color: "var(--accent)" }}>{nbspCode(code)}</span> at {schoolName} is where GPAs quietly slip.</>
    : <>Intro accounting is where GPAs quietly slip.</>;
  return (
    <section id={MARKETING_HERO_ID} className="sa-two-door-hero flex flex-col items-center pb-9 pt-10 text-center sm:pt-14" style={{ fontFamily: BRAND_SANS }}>
      <h1
        className="mx-auto max-w-[600px] text-[30px] font-black leading-[1.12] sm:text-[40px] lg:text-[44px]"
        style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}
      >
        {headline}
      </h1>
      <p className="mt-4 text-[19px] font-extrabold leading-snug sm:text-[22px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
        Practice what gets tested. Score higher.
      </p>
      {/* THE CAMPUS LINE (FINAL MILE H3) — restored from homepage v1's bolt plate ("for ACCY 201
          · OLE MISS"), updated to current tokens. The campus name wears the school color; both
          values fall back to the flagship campus config (HOME_CAMPUS) so campus #2 is a data
          change, and a visitor's own resolved campus still wins. */}
      <CampusLine code={code} schoolName={schoolName} schoolId={schoolId} />
      {/* The three proof points — the "small credibility layer" between promise and doors.
          "Built for exam week" points at the doors: they are what backs the claim now. */}
      <TrustChips onBio={onOpenBio} onReviews={() => scrollToId("reviews")} onPlayer={() => scrollToId(DOORS_ID)} />
    </section>
  );
}

/** THE CAMPUS LINE — "for ACCY 201 · OLE MISS", the v1 bolt-plate treatment on the hero's
 *  centered axis. Name colored by the school's own primary (config-driven default). */
function CampusLine({ code, schoolName, schoolId }: { code: string | null; schoolName: string | null; schoolId: string | null }) {
  const name = schoolName ?? HOME_CAMPUS.name;
  const color = schoolId ? boltFor(schoolId).c1 : HOME_CAMPUS.colors.primary;
  return (
    <p className="sa-campus-line mt-4" style={{ fontFamily: BRAND_DISPLAY }}>
      <span className="sa-campus-line-for">for </span>
      <span className="sa-campus-line-em">{homeCourseCode(code)}</span>
      <span className="sa-campus-line-dot"> · </span>
      <span className="sa-campus-line-em" style={{ color }}>{name.toUpperCase()}</span>
    </p>
  );
}

// ── THE TWO DOORS ─────────────────────────────────────────────────────────────────────────────
/** ONE frame for both cards — identical width, padding, radius, elevation. See header note. */
const DOOR_CARD: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 20,
  padding: "28px 24px 20px",
  minHeight: 332,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  // H2: the drop + a soft ambient ring around the border (Speechnotes-style float, subtle).
  boxShadow: "0 24px 60px -30px rgba(0,0,0,0.7), 0 4px 24px -4px rgba(0,0,0,0.45)",
};

/** ONE internal grammar for both cards (FINAL MILE H1 order):
 *  ICON → HEADING → BUTTON → SUPPORT LINE (→ ticker, right card only).
 *  Slots are fixed-height so headings, buttons and support lines sit on identical baselines
 *  left → right. */
function DoorCard({ icon, title, button, support, bottom }: {
  icon: React.ReactNode;
  title: string;
  button: React.ReactNode;
  support: React.ReactNode;
  /** The card-bottom band (the Greek ticker on the right card). */
  bottom?: React.ReactNode;
}) {
  return (
    <div className="sa-door-card" style={DOOR_CARD}>
      {/* Icon envelope — same box on both sides, whatever lives inside it. */}
      <div className="grid place-items-center" style={{ height: 118 }}>{icon}</div>
      {/* Fixed two-line envelope so a wrapped title never pushes the buttons out of line. */}
      <h3
        className="mt-3 grid place-items-center text-[20px] font-black uppercase leading-tight"
        style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "0.04em", minHeight: 52 }}
      >
        {title}
      </h3>
      <div className="mt-3 w-full">{button}</div>
      {/* Support line BELOW the button (H1); balanced wrap, two lines max on mobile. */}
      <div className="sa-door-support mt-3 grid w-full place-items-center" style={{ minHeight: 38, fontFamily: BRAND_SANS }}>{support}</div>
      <div className="flex-1" />
      {bottom && <div className="grid w-full place-items-center" style={{ height: 26 }}>{bottom}</div>}
    </div>
  );
}

function TwoDoorCards({ code, onSolo, soloHref, onChapter }: {
  code: string | null;
  onSolo: () => void;
  /** Preview only: makes the solo CTA a link into Player V2 (onSolo still fires for tracking). */
  soloHref?: string;
  onChapter: (source: "button" | "ticker") => void;
}) {
  const BTN_BASE: React.CSSProperties = { minHeight: 54, width: "100%", borderRadius: 12, fontSize: 15.5, fontWeight: 900, fontFamily: BRAND_SANS };

  return (
    <section id={DOORS_ID} aria-label="Choose how you want to study" className="sa-anchor" style={{ fontFamily: BRAND_SANS }}>
      <div className="mx-auto grid w-full max-w-[880px] gap-6 sm:grid-cols-2 sm:gap-9">
        {/* LEFT DOOR — solo students. First in DOM so it stacks first on mobile. */}
        {/* H3: THE BOILING BOLT — the exact same BoltBoil the footer wordmark's "i" uses (one
            shared implementation, one speed). It is the only living thing on screen; the temple
            opposite stays still. prefers-reduced-motion serves BoltBoil's built-in static frame. */}
        <DoorCard
          icon={<span aria-hidden style={{ display: "block" }}><BoltBoil height={112} /></span>}
          title="Study solo"
          button={
            soloHref ? (
              <a
                href={soloHref}
                onClick={onSolo}
                className="inline-flex items-center justify-center transition-transform hover:scale-[1.02] focus-visible:ring-2"
                style={{ ...BTN_BASE, background: "var(--cta-solo-bg)", color: "var(--cta-solo-fg)" }}
              >
                {soloButtonLabel(code)}
              </a>
            ) : (
              <button
                type="button"
                onClick={onSolo}
                className="transition-transform hover:scale-[1.02] focus-visible:ring-2"
                style={{ ...BTN_BASE, background: "var(--cta-solo-bg)", color: "var(--cta-solo-fg)" }}
              >
                {soloButtonLabel(code)}
              </button>
            )
          }
          support={
            <span className="text-[13px] leading-snug" style={{ maxWidth: "34ch" }}>
              <span style={{ color: "var(--text-muted)" }}>{soloSupport(code).muted}</span>{" "}
              <span className="font-bold" style={{ color: "var(--brand-cream)" }}>{soloSupport(code).strong}</span>
            </span>
          }
        />

        {/* RIGHT DOOR — Greek chapters. Same frame, equal-weight CTA; generic chapter-house
            visual (never one org's letters as the site's default branding). */}
        <DoorCard
          icon={<ChapterHouseIcon height={82} />}
          title="Study with your chapter"
          button={
            <button
              type="button"
              onClick={() => onChapter("button")}
              className="transition-transform hover:scale-[1.02] focus-visible:ring-2"
              style={{ ...BTN_BASE, background: "var(--cta-chapter-bg)", color: "var(--cta-chapter-fg)" }}
            >
              Find your chapter →
            </button>
          }
          support={
            <span className="text-[13px] leading-snug" style={{ color: "var(--text-muted)", maxWidth: "34ch" }}>
              Get Survive through your fraternity or sorority.
            </span>
          }
          bottom={<GreekTicker onActivate={() => onChapter("ticker")} />}
        />
      </div>
    </section>
  );
}

// ── RIGHT DOOR VISUAL — the hand-drawn temple (FINAL MILE H3) ─────────────────────────────────
/** The chapter temple in the bolt's hand-drawn language: jagged pediment with a lightning bite,
 *  zigzag columns, one orange dot. Static on purpose — the bolt is the only living thing on
 *  screen. Strokes wear the cream token; the dot wears the brand accent token. */
function ChapterHouseIcon({ height = 82 }: { height?: number }) {
  const w = Math.round(height * (96 / 86));
  return (
    <svg viewBox="0 0 96 86" width={w} height={height} fill="none" aria-hidden style={{ display: "block" }}>
      <path d="M12 32 L40 13 L46 19 L56 9 L84 32 Z"
        stroke="var(--brand-cream)" strokeWidth={4.5}
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="50" cy="25" r="3" fill="var(--accent)" />
      <path d="M18 39 L78 39" stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinecap="round" />
      <path d="M29 46 L27 54 L31 57 L29 65" stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 46 L40 54 L44 57 L42 65" stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M55 46 L53 54 L57 57 L55 65" stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M68 46 L66 54 L70 57 L68 65" stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 71 L74 71" stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinecap="round" />
      <path d="M14 78 L82 78" stroke="var(--brand-cream)" strokeWidth={4.5} strokeLinecap="round" />
    </svg>
  );
}

// ── GREEK TICKER — the right door's support line ──────────────────────────────────────────────
/** A slow one-line stream of supported orgs' letters, clipped inside the card, edge-faded,
 *  paused on hover/focus. Clicking it does exactly what the button above it does. It is
 *  decoration with a door behind it — never required to understand the CTA (the aria-label
 *  carries the action; the letters are aria-hidden). Reduced motion renders a static line. */
function GreekTicker({ onActivate }: { onActivate: () => void }) {
  // Static until the client answers — SSR-safe.
  const [reduced, setReduced] = useState(true);
  useEffect(() => { setReduced(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);
  const line = tickerLine();
  return (
    <button type="button" onClick={onActivate} className="sa-door-ticker" aria-label="Find your chapter" title="Find your chapter">
      {reduced ? (
        <span aria-hidden className="sa-door-ticker-static">{line}</span>
      ) : (
        <span aria-hidden className="sa-door-ticker-track">
          <span>{line}&nbsp;·&nbsp;</span>
          <span>{line}&nbsp;·&nbsp;</span>
        </span>
      )}
    </button>
  );
}

// ── EXAM 1 LAUNCH / WAITLIST MODAL ────────────────────────────────────────────────────────────
/** The PUBLIC Exam 1 state while the new player is rebuilt privately: an intentional launch
 *  card — FREE · SEPTEMBER 1, one email field, the EXISTING notify capture underneath
 *  (submitNotify → campus_waitlist, same as every other "tell me when it's ready" surface).
 *  Campus/course context the page already knows rides along silently. */
function Exam1LaunchModal({ campusId, campusName, courseCode, onClose }: {
  campusId: string | null;
  campusName: string | null;
  courseCode: string | null;
  onClose: () => void;
}) {
  const panelRef = useDismiss<HTMLDivElement>(onClose, { enabled: true });
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const valid = contactKind(contact) !== "unknown";
  const send = async () => {
    if (!valid || state === "sending" || state === "sent") return;
    setState("sending"); setErr(null);
    try {
      const req = examRequest({ examNum: 1, examLabel: "Exam 1", launchWindow: EXAM1_LAUNCH_LABEL, free: true });
      await submitNotify({ data: {
        contact: contact.trim(),
        topic: req.topic,
        campusId,
        campusName,
        professorName: null,
        want: req.want,
        examNum: 1,
        courseCode,
        note: notifyNote(req),
        isTest: !!readTestSession(),
      } });
      if (contactKind(contact) === "email") rememberStudentEmail(contact.trim());
      setState("sent");
    } catch (e) {
      setState("error");
      setErr(e instanceof Error ? e.message : "That didn't send — try again?");
    }
  };
  return (
    <div className="fixed inset-0 z-[240] grid place-items-center overflow-y-auto p-4" style={{ background: "rgba(5,8,16,0.72)" }} role="dialog" aria-modal="true" aria-label="Exam 1 — free, September 1">
      <div ref={panelRef} className="relative w-full max-w-[400px] rounded-3xl p-6 text-center sm:p-7" style={{ background: "var(--bg-page)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS, boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2"
          style={{ width: 40, height: 40, color: "var(--text-muted)" }}
        >
          <span aria-hidden style={{ fontSize: 20 }}>×</span>
        </button>
        <p className="text-[26px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Exam 1</p>
        <p className="mt-1 text-[13px] font-black" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>
          FREE · {EXAM1_LAUNCH_LABEL.toUpperCase()}
        </p>
        {state === "sent" ? (
          <>
            <p className="mt-5 text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>You&apos;re on the list ✓</p>
            <p className="mt-1.5 text-[13.5px]" style={{ color: "var(--text-muted)" }}>I&apos;ll let you know the moment Exam 1 drops.</p>
          </>
        ) : (
          <>
            <p className="mt-4 text-[16px] font-extrabold" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
              New Exam 1 prep is almost ready.
            </p>
            <p className="mx-auto mt-1.5 max-w-[34ch] text-[14px] leading-snug" style={{ color: "var(--text-muted)" }}>
              Cram videos + practice built around what actually gets tested.
            </p>
            <input
              type="text" inputMode="email" autoComplete="email" placeholder="you@school.edu"
              className="mt-4 w-full rounded-xl px-3 text-[15px] outline-none"
              style={{ minHeight: 48, background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
              value={contact}
              onChange={(e) => { setContact(e.target.value); if (state === "error") setState("idle"); }}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              aria-label="Email for the Exam 1 launch list"
            />
            {err && <p className="mt-2 text-[12px]" style={{ color: "#F3C6CC" }}>{err}</p>}
            <button
              type="button"
              onClick={() => void send()}
              disabled={!valid || state === "sending"}
              className="mt-3 w-full rounded-xl text-[15px] font-black disabled:opacity-45"
              style={{ minHeight: 50, background: "var(--accent)", color: "#0B1220" }}
            >
              {state === "sending" ? "Sending…" : "Notify me →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── COURSE SCOPE MODAL ────────────────────────────────────────────────────────────────────────
/** The "Why only Intro Financial?" answer — a tiny dialog, never a marketing page. */
function CourseScopeModal({ onClose }: { onClose: () => void }) {
  const panelRef = useDismiss<HTMLDivElement>(onClose, { enabled: true });
  const P = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.9 }}>{children}</p>
  );
  return (
    <div className="fixed inset-0 z-[240] grid place-items-center overflow-y-auto p-4" style={{ background: "rgba(5,8,16,0.72)" }} role="dialog" aria-modal="true" aria-label="Why Intro Financial Accounting only">
      <div ref={panelRef} className="relative w-full max-w-[440px] rounded-3xl p-6 sm:p-7" style={{ background: "var(--bg-page)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS, boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2"
          style={{ width: 40, height: 40, color: "var(--text-muted)" }}
        >
          <span aria-hidden style={{ fontSize: 20 }}>×</span>
        </button>
        <h2 className="pr-8 text-[19px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
          Intro Financial Accounting only
        </h2>
        <P>I&apos;ve taught and tutored other accounting courses, but Survive is focused on the first financial accounting course right now.</P>
        <P>Master the fundamentals here and every accounting course after it gets easier.</P>
        <P>If you&apos;re in a later accounting course and the fundamentals feel shaky, Exam 1 is a good place to rebuild them.</P>
      </div>
    </div>
  );
}

// ── PAGE CSS ──────────────────────────────────────────────────────────────────────────────────
const TWO_DOOR_CSS = `
/* CENTERED HERO: the proof strip centres at every width here (Marketing's own class left-aligns
   it on desktop, where the old hero had a left column). */
.sa-two-door-hero .sa-proof-row { justify-content: center; }

/* SUPPORT LINES — balanced wrap so a one-word last line can't happen (H1 one-line rule). */
.sa-door-support { text-wrap: balance; }

/* CAMPUS LINE (H3) — the v1 bolt-plate type treatment on the hero axis. */
.sa-campus-line { font-size: 13px; font-weight: 900; letter-spacing: 0.08em; color: var(--brand-cream); white-space: nowrap; }
.sa-campus-line-for { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; opacity: 0.55; text-transform: none; }
.sa-campus-line-em { opacity: 0.92; }
.sa-campus-line-dot { opacity: 0.45; }

/* DOOR CARDS — one hover response for both: a hair of lift, nothing else moves. */
.sa-door-card { transition: transform 180ms ease, box-shadow 180ms ease; }
.sa-door-card:hover { transform: translateY(-3px); box-shadow: 0 30px 70px -28px rgba(0,0,0,0.8), 0 4px 24px -4px rgba(0,0,0,0.45); }
@media (prefers-reduced-motion: reduce) {
  .sa-door-card, .sa-door-card:hover { transform: none; transition: none; }
}

/* GREEK TICKER — one clipped line, slow, edge-faded, paused on hover/focus. */
.sa-door-ticker {
  position: relative; display: block; width: 100%; overflow: hidden; white-space: nowrap;
  background: none; border: 0; padding: 3px 0; cursor: pointer;
  /* H4 diet: bigger letters (~5 org codes visible at card width) and a harder edge fade —
     fully transparent edges, only the center ~55% at full opacity. */
  color: var(--text-muted); font-size: 16px; letter-spacing: 0.1em; line-height: 1.4;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 22.5%, #000 77.5%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 22.5%, #000 77.5%, transparent);
}
@keyframes sa-door-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.sa-door-ticker-track { display: inline-block; white-space: nowrap; animation: sa-door-marquee 70s linear infinite; }
.sa-door-ticker:hover .sa-door-ticker-track,
.sa-door-ticker:focus-visible .sa-door-ticker-track { animation-play-state: paused; }
.sa-door-ticker:hover { color: var(--brand-cream); }
.sa-door-ticker:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.sa-door-ticker-static { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
@media (prefers-reduced-motion: reduce) { .sa-door-ticker-track { animation: none; } }
`;
